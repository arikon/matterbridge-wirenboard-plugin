/**
 * WirenboardDevice — constructs Matter endpoints from WB device metadata
 * and handles bidirectional state synchronisation.
 * @file wirenboardDevice.ts
 */

import {
  airQualitySensor,
  coverDevice,
  DeviceTypeDefinition,
  dimmableLight,
  doorLockDevice,
  extendedColorLight,
  fanDevice,
  genericSwitch,
  MatterbridgeEndpoint,
  thermostatDevice,
  waterValve,
} from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import {
  AirQuality,
  BridgedDeviceBasicInformation,
  DoorLock,
  FanControl,
  LevelControl,
  OnOff,
  Thermostat,
  ValveConfigurationAndControl,
  WindowCovering,
} from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';

import {
  classifyCO2,
  DeviceOverrides,
  findMapping,
  hsvToRgbString,
  HsvColor,
  rgbStringToHsv,
  WbToMatterMapping,
} from './controlMapping.js';
import { WirenboardMqtt } from './wirenboardMqtt.js';
import { WbControl, WbDevice } from './wirenboardTypes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupingMode = 'device' | 'control';

interface PropertyMapEntry {
  endpoint: MatterbridgeEndpoint;
  clusterId: ClusterId;
  attribute: string;
  mapping: WbToMatterMapping;
  /** Last value set on the Matter attribute (for echo suppression) */
  lastValue: unknown;
}

// Matter Common Number namespace (id=7) supports arbitrary tag values.
// matterbridge exports NumberTag.One...Sixteen as named constants, but the namespace
// is not limited to 16 — any positive integer works as a tag value.
// We use raw { namespaceId: 7, tag: N } directly to avoid artificial limits.
const MATTER_NUMBER_NAMESPACE_ID = 7;

// ---------------------------------------------------------------------------
// HW Metadata detection helpers
// ---------------------------------------------------------------------------

const HW_SERIAL_KEYWORDS = ['serial'];
const HW_FW_KEYWORDS = ['fw version', 'firmware version', 'fw_version'];
const HW_HW_KEYWORDS = ['hw batch', 'hw_batch', 'hardware version'];

function matchesKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

interface HwMetadata {
  serialNumber?: string;
  softwareVersionString?: string;
  hardwareVersionString?: string;
  /** Control names that were consumed as HW metadata (not to be mapped as endpoints) */
  consumedControls: Set<string>;
}

function extractHwMetadata(controls: Map<string, WbControl>): HwMetadata {
  const meta: HwMetadata = { consumedControls: new Set() };
  for (const [, ctrl] of controls) {
    if (matchesKeywords(ctrl.name, HW_SERIAL_KEYWORDS) && ctrl.meta.type === 'text') {
      if (ctrl.value !== undefined) meta.serialNumber = ctrl.value;
      meta.consumedControls.add(ctrl.name);
    } else if (matchesKeywords(ctrl.name, HW_FW_KEYWORDS) && ctrl.meta.type === 'text') {
      if (ctrl.value !== undefined) meta.softwareVersionString = ctrl.value;
      meta.consumedControls.add(ctrl.name);
    } else if (matchesKeywords(ctrl.name, HW_HW_KEYWORDS) && ctrl.meta.type === 'text') {
      if (ctrl.value !== undefined) meta.hardwareVersionString = ctrl.value;
      meta.consumedControls.add(ctrl.name);
    }
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Thermostat composite detection
// ---------------------------------------------------------------------------

const TEMP_KEYWORDS = ['temperature', 'temp'];
const SETPOINT_KEYWORDS = ['setpoint', 'target'];
const MODE_KEYWORDS = ['mode', 'system_mode'];

interface ThermostatControls {
  tempControl?: WbControl;        // readonly, deg C
  heatSetpoint?: WbControl;       // writable range/value, deg C
  coolSetpoint?: WbControl;       // writable range/value, deg C
  modeControl?: WbControl;        // enum or text
}

function detectThermostatControls(controls: Map<string, WbControl>): ThermostatControls | undefined {
  let tempControl: WbControl | undefined;
  let heatSetpoint: WbControl | undefined;
  let coolSetpoint: WbControl | undefined;
  let modeControl: WbControl | undefined;

  for (const [, ctrl] of controls) {
    const nameLower = ctrl.name.toLowerCase();
    const type = ctrl.meta.type;
    const units = ctrl.meta.units;

    // Temperature sensor (readonly, deg C)
    if (
      !tempControl &&
      (type === 'value' || type === 'temperature') &&
      (units === 'deg C' || type === 'temperature') &&
      ctrl.meta.readonly === true &&
      TEMP_KEYWORDS.some((kw) => nameLower.includes(kw))
    ) {
      tempControl = ctrl;
      continue;
    }

    // Setpoints (writable range/value, deg C)
    if (
      (type === 'range' || type === 'value') &&
      (units === 'deg C') &&
      ctrl.meta.readonly !== true &&
      SETPOINT_KEYWORDS.some((kw) => nameLower.includes(kw))
    ) {
      const lowerName = nameLower;
      if (lowerName.includes('cool') || lowerName.includes('охлажд')) {
        coolSetpoint = ctrl;
      } else {
        heatSetpoint = ctrl;
      }
      continue;
    }

    // Mode (enum or text)
    if (
      !modeControl &&
      (type === 'enum' || type === 'text') &&
      MODE_KEYWORDS.some((kw) => nameLower.includes(kw))
    ) {
      modeControl = ctrl;
    }
  }

  // Minimal combo: local temp + at least one setpoint
  if (tempControl && (heatSetpoint || coolSetpoint)) {
    return { tempControl, heatSetpoint, coolSetpoint, modeControl };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Utility: resolve device title string
// ---------------------------------------------------------------------------

function resolveTitle(title: { en: string; ru?: string } | string, fallback: string): string {
  if (typeof title === 'string') return title || fallback;
  return title.en || fallback;
}

// ---------------------------------------------------------------------------
// WirenboardDevice
// ---------------------------------------------------------------------------

export class WirenboardDevice {
  private readonly log: AnsiLogger;
  private readonly mqtt: WirenboardMqtt;
  private readonly wbDevice: WbDevice;

  /** Maps controlName → Matter attribute info */
  private readonly propertyMap = new Map<string, PropertyMapEntry>();

  /** Root/main endpoint(s) — in 'device' mode this is one root; in 'control' it's multiple */
  public readonly endpoints: MatterbridgeEndpoint[] = [];

  /** Primary endpoint for reachability management (first endpoint) */
  public get primaryEndpoint(): MatterbridgeEndpoint | undefined {
    return this.endpoints[0];
  }

  /** noUpdate: echo suppression — when true, skip incoming MQTT updates for 2s */
  private noUpdate = false;
  private noUpdateTimeout: NodeJS.Timeout | undefined;
  private static readonly NO_UPDATE_MS = 2000;

  private constructor(log: AnsiLogger, mqtt: WirenboardMqtt, wbDevice: WbDevice) {
    this.log = log;
    this.mqtt = mqtt;
    this.wbDevice = wbDevice;
  }

  // ---------------------------------------------------------------------------
  // Factory method
  // ---------------------------------------------------------------------------

  /**
   * Create a WirenboardDevice from MQTT-discovered metadata.
   *
   * @param log - AnsiLogger instance
   * @param wbDevice - WB device discovered via MQTT
   * @param mqtt - MQTT client for publishing commands
   * @param groupingMode - 'device' (one root + children) or 'control' (one per control)
   * @param vendorId - Matter vendor ID
   * @param includeHidden - whether to include controls with meta.hidden = true
   * @param deviceOverrides - per-control device type overrides from config
   */
  static async create(
    log: AnsiLogger,
    wbDevice: WbDevice,
    mqtt: WirenboardMqtt,
    groupingMode: GroupingMode,
    vendorId: number,
    includeHidden = false,
    deviceOverrides?: DeviceOverrides,
  ): Promise<WirenboardDevice> {
    const self = new WirenboardDevice(log, mqtt, wbDevice);
    const deviceTitle = resolveTitle(wbDevice.meta.title, wbDevice.name);
    const deviceName = wbDevice.name;

    // Step 1: Extract HW metadata (Serial, FW Version, HW Batch)
    const hwMeta = extractHwMetadata(wbDevice.controls);

    // Step 2: Detect thermostat composite BEFORE processing individual controls
    const thermostatControls = detectThermostatControls(wbDevice.controls);
    const thermostatConsumed = new Set<string>();

    if (thermostatControls) {
      const { tempControl, heatSetpoint, coolSetpoint, modeControl } = thermostatControls;

      // Mark consumed controls so they won't be mapped individually
      if (tempControl) thermostatConsumed.add(tempControl.name);
      if (heatSetpoint) thermostatConsumed.add(heatSetpoint.name);
      if (coolSetpoint) thermostatConsumed.add(coolSetpoint.name);
      if (modeControl) thermostatConsumed.add(modeControl.name);

      const minHeat = heatSetpoint ? (heatSetpoint.meta.min ?? 0) : 0;
      const maxHeat = heatSetpoint ? (heatSetpoint.meta.max ?? 50) : 50;
      const minCool = coolSetpoint ? (coolSetpoint.meta.min ?? 0) : 0;
      const maxCool = coolSetpoint ? (coolSetpoint.meta.max ?? 50) : 50;

      const uniqueId = groupingMode === 'control'
        ? `${deviceName}_thermostat`
        : deviceName;

      const tLabel = `${deviceTitle} Thermostat`;

      const tEndpoint = new MatterbridgeEndpoint(thermostatDevice, { id: uniqueId });
      tEndpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
        tLabel,
        hwMeta.serialNumber ?? uniqueId,
        vendorId,
        'Wirenboard',
        wbDevice.meta.driver || 'WB Device',
        undefined,
        hwMeta.softwareVersionString,
        undefined,
        hwMeta.hardwareVersionString,
      );

      // Determine thermostat branch: HeatingOnly / CoolingOnly / CoolingAndHeating
      const hasHeat = !!heatSetpoint;
      const hasCool = !!coolSetpoint;
      const hasAutoMode = modeControl !== undefined;

      let thermostatType: 'heating' | 'cooling' | 'auto';
      if (hasHeat && !hasCool && !hasAutoMode) {
        // HeatingOnly
        thermostatType = 'heating';
        tEndpoint.createDefaultHeatingThermostatClusterServer(undefined, undefined, minHeat * 100, maxHeat * 100);
      } else if (!hasHeat && hasCool && !hasAutoMode) {
        // CoolingOnly
        thermostatType = 'cooling';
        tEndpoint.createDefaultCoolingThermostatClusterServer(undefined, undefined, minCool * 100, maxCool * 100);
      } else {
        // CoolingAndHeating (auto or both setpoints)
        thermostatType = 'auto';
        tEndpoint.createDefaultThermostatClusterServer(
          undefined, undefined, undefined, undefined,
          minHeat * 100, maxHeat * 100, minCool * 100, maxCool * 100,
        );
      }

      tEndpoint.addRequiredClusterServers();

      // Register local temperature in propertyMap
      if (tempControl) {
        self.propertyMap.set(tempControl.name, {
          endpoint: tEndpoint,
          clusterId: Thermostat.Cluster.id,
          attribute: 'localTemperature',
          mapping: {
            wbType: 'value',
            wbUnits: 'deg C',
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: 'localTemperature',
            converter: (v) => Math.round(parseFloat(v) * 100),
          },
          lastValue: undefined,
        });
      }

      // Heating setpoint
      if (heatSetpoint) {
        self.propertyMap.set(heatSetpoint.name, {
          endpoint: tEndpoint,
          clusterId: Thermostat.Cluster.id,
          attribute: 'occupiedHeatingSetpoint',
          mapping: {
            wbType: 'range',
            wbUnits: 'deg C',
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: 'occupiedHeatingSetpoint',
            converter: (v) => Math.round(parseFloat(v) * 100),
            reverseConverter: (v) => String((v as number) / 100),
          },
          lastValue: undefined,
        });
      }

      // Cooling setpoint
      if (coolSetpoint) {
        self.propertyMap.set(coolSetpoint.name, {
          endpoint: tEndpoint,
          clusterId: Thermostat.Cluster.id,
          attribute: 'occupiedCoolingSetpoint',
          mapping: {
            wbType: 'range',
            wbUnits: 'deg C',
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: 'occupiedCoolingSetpoint',
            converter: (v) => Math.round(parseFloat(v) * 100),
            reverseConverter: (v) => String((v as number) / 100),
          },
          lastValue: undefined,
        });
      }

      // System mode
      if (modeControl) {
        self.propertyMap.set(modeControl.name, {
          endpoint: tEndpoint,
          clusterId: Thermostat.Cluster.id,
          attribute: 'systemMode',
          mapping: {
            wbType: 'enum',
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: 'systemMode',
            converter: (v) => {
              const lower = v.toLowerCase();
              if (lower === 'off') return Thermostat.SystemMode.Off;
              if (lower === 'heat') return Thermostat.SystemMode.Heat;
              if (lower === 'cool') return Thermostat.SystemMode.Cool;
              if (lower === 'auto') return Thermostat.SystemMode.Auto;
              return Thermostat.SystemMode.Off;
            },
            reverseConverter: (v) => {
              switch (v as Thermostat.SystemMode) {
                case Thermostat.SystemMode.Heat: return 'heat';
                case Thermostat.SystemMode.Cool: return 'cool';
                case Thermostat.SystemMode.Auto: return 'auto';
                default: return 'off';
              }
            },
          },
          lastValue: undefined,
        });
      }

      // For HeatingOnly/CoolingOnly: remove running_state/running_mode from propertyMap
      // These attributes are only supported in AutoMode (CoolingAndHeating)
      if (thermostatType !== 'auto') {
        for (const [key] of self.propertyMap) {
          const lower = key.toLowerCase();
          if (lower.includes('running')) {
            self.propertyMap.delete(key);
          }
        }
      }

      // Add thermostat command handlers
      self.addThermostatCommandHandlers(tEndpoint, deviceName, heatSetpoint?.name, coolSetpoint?.name, modeControl?.name);

      self.endpoints.push(tEndpoint);
    }

    // Step 3: Collect remaining controls (excluding HW meta and thermostat consumed)
    const skippedControlNames = new Set([...hwMeta.consumedControls, ...thermostatConsumed]);

    // Separate internal diagnostic controls (Supply Voltage, MCU Temperature)
    // that are skipped unless includeHidden
    const internalKeywords = ['supply voltage', 'mcu temperature', 'uptime'];
    function isInternalDiagnostic(name: string): boolean {
      const lower = name.toLowerCase();
      return internalKeywords.some((kw) => lower.includes(kw));
    }

    const mappableControls: Array<{ ctrl: WbControl; mapping: WbToMatterMapping }> = [];

    for (const [, ctrl] of wbDevice.controls) {
      if (skippedControlNames.has(ctrl.name)) continue;
      if (!includeHidden && ctrl.meta.hidden === true) continue;
      if (isInternalDiagnostic(ctrl.name) && !includeHidden) continue;

      const mapping = findMapping(ctrl.meta, ctrl.name, deviceOverrides);
      if (!mapping) {
        log.warn(
          `Skipping control ${deviceName}/${ctrl.name}: no mapping for type '${ctrl.meta.type}' units '${ctrl.meta.units ?? ''}'`,
        );
        continue;
      }

      mappableControls.push({ ctrl, mapping });
    }

    // Step 4: Build endpoints based on groupingMode
    if (mappableControls.length === 0 && self.endpoints.length === 0) {
      log.info(`Device ${deviceName} has no mappable controls — skipping registration`);
      return self;
    }

    if (groupingMode === 'device') {
      await self.buildDeviceGrouping(
        mappableControls,
        wbDevice,
        deviceTitle,
        hwMeta,
        vendorId,
        deviceOverrides,
      );
    } else {
      await self.buildControlGrouping(
        mappableControls,
        wbDevice,
        deviceTitle,
        hwMeta,
        vendorId,
      );
    }

    return self;
  }

  // ---------------------------------------------------------------------------
  // groupingMode: 'device' — one root + child endpoints
  // ---------------------------------------------------------------------------

  private async buildDeviceGrouping(
    mappableControls: Array<{ ctrl: WbControl; mapping: WbToMatterMapping }>,
    wbDevice: WbDevice,
    deviceTitle: string,
    hwMeta: HwMetadata,
    vendorId: number,
    _deviceOverrides?: DeviceOverrides,
  ): Promise<void> {
    if (mappableControls.length === 0) return;

    const deviceName = wbDevice.name;

    // Determine dominant device type for root endpoint
    // Use first control's device type or onOffOutlet fallback
    const dominantType = mappableControls[0]!.mapping.matterDeviceType;

    const rootEndpoint = new MatterbridgeEndpoint(dominantType, { id: deviceName });
    rootEndpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
      deviceTitle,
      hwMeta.serialNumber ?? deviceName,
      vendorId,
      'Wirenboard',
      wbDevice.meta.driver || 'WB Device',
      undefined,
      hwMeta.softwareVersionString,
      undefined,
      hwMeta.hardwareVersionString,
    );
    rootEndpoint.addRequiredClusterServers();

    // Track same-type control counts for semantic tags
    const typeCountMap = new Map<string, number>();

    for (const { ctrl, mapping } of mappableControls) {
      const typeKey = `${mapping.matterDeviceType.name ?? String(mapping.matterDeviceType.code)}`;
      const typeCount = (typeCountMap.get(typeKey) ?? 0) + 1;
      typeCountMap.set(typeKey, typeCount);

      const childId = `${deviceName}_${ctrl.name}`;
      const tagList = [
        {
          mfgCode: null,
          namespaceId: MATTER_NUMBER_NAMESPACE_ID,
          tag: typeCount,
          label: ctrl.name,
        },
      ];

      const clusterServerIds = mapping.matterClusterIds.length > 0
        ? (mapping.matterClusterIds as [ClusterId, ...ClusterId[]])
        : undefined;

      let childEndpoint: MatterbridgeEndpoint;
      if (clusterServerIds) {
        childEndpoint = rootEndpoint.addChildDeviceTypeWithClusterServer(
          childId,
          [mapping.matterDeviceType] as [DeviceTypeDefinition, ...DeviceTypeDefinition[]],
          clusterServerIds,
          { tagList },
        );
      } else {
        childEndpoint = rootEndpoint.addChildDeviceTypeWithClusterServer(
          childId,
          [mapping.matterDeviceType] as [DeviceTypeDefinition, ...DeviceTypeDefinition[]],
          [],
          { tagList },
        );
      }

      childEndpoint.addRequiredClusterServers();

      // Register in propertyMap
      const primaryClusterId = mapping.matterClusterIds[0];
      if (primaryClusterId !== undefined) {
        this.propertyMap.set(ctrl.name, {
          endpoint: childEndpoint,
          clusterId: primaryClusterId,
          attribute: mapping.matterAttribute,
          mapping,
          lastValue: undefined,
        });
      }

      // Add command handlers for writable controls
      if (!ctrl.meta.readonly) {
        this.addControlCommandHandlers(childEndpoint, mapping, wbDevice.name, ctrl.name);
      }
    }

    this.endpoints.push(rootEndpoint);
  }

  // ---------------------------------------------------------------------------
  // groupingMode: 'control' — separate endpoint per control
  // ---------------------------------------------------------------------------

  private async buildControlGrouping(
    mappableControls: Array<{ ctrl: WbControl; mapping: WbToMatterMapping }>,
    wbDevice: WbDevice,
    deviceTitle: string,
    hwMeta: HwMetadata,
    vendorId: number,
  ): Promise<void> {
    const deviceName = wbDevice.name;

    for (const { ctrl, mapping } of mappableControls) {
      const ctrlTitle = ctrl.meta.title
        ? resolveTitle(ctrl.meta.title, ctrl.name)
        : ctrl.name;
      const label = `${deviceTitle} - ${ctrlTitle}`;
      const uniqueId = `${deviceName}_${ctrl.name}`;

      const endpoint = new MatterbridgeEndpoint(mapping.matterDeviceType, { id: uniqueId });
      endpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
        label,
        uniqueId,
        vendorId,
        'Wirenboard',
        wbDevice.meta.driver || 'WB Device',
        undefined,
        hwMeta.softwareVersionString,
        undefined,
        hwMeta.hardwareVersionString,
      );

      if (mapping.matterClusterIds.length > 0) {
        // cluster servers are added via addRequiredClusterServers below
        // but we need to ensure our specific clusters are there
      }

      endpoint.addRequiredClusterServers();

      const primaryClusterId = mapping.matterClusterIds[0];
      if (primaryClusterId !== undefined) {
        this.propertyMap.set(ctrl.name, {
          endpoint,
          clusterId: primaryClusterId,
          attribute: mapping.matterAttribute,
          mapping,
          lastValue: undefined,
        });
      }

      if (!ctrl.meta.readonly) {
        this.addControlCommandHandlers(endpoint, mapping, deviceName, ctrl.name);
      }

      this.endpoints.push(endpoint);
    }
  }

  // ---------------------------------------------------------------------------
  // Command handler registration
  // ---------------------------------------------------------------------------

  private addControlCommandHandlers(
    endpoint: MatterbridgeEndpoint,
    mapping: WbToMatterMapping,
    deviceName: string,
    controlName: string,
  ): void {
    const publish = (value: string): void => {
      this.handleMatterCommand(deviceName, controlName, value);
    };

    // OnOff commands
    if (endpoint.hasClusterServer(OnOff.Cluster.id)) {
      endpoint.addCommandHandler('on', () => {
        const val = mapping.reverseConverter ? String(mapping.reverseConverter(true, mapping as never)) : '1';
        publish(val);
      });
      endpoint.addCommandHandler('off', () => {
        const val = mapping.reverseConverter ? String(mapping.reverseConverter(false, mapping as never)) : '0';
        publish(val);
      });
      endpoint.addCommandHandler('toggle', async () => {
        const entry = this.propertyMap.get(controlName);
        const current = entry?.lastValue;
        const next = !current;
        const val = mapping.reverseConverter ? String(mapping.reverseConverter(next, mapping as never)) : (next ? '1' : '0');
        publish(val);
      });
    }

    // LevelControl
    if (endpoint.hasClusterServer(LevelControl.Cluster.id)) {
      endpoint.addCommandHandler('moveToLevel', async ({ request: { level } }) => {
        if (mapping.reverseConverter) {
          const val = mapping.reverseConverter(level, mapping as never);
          publish(String(val));
        }
      });
    }

    // ColorControl (HSV)
    if (mapping.matterDeviceType === extendedColorLight || mapping.wbType === 'rgb') {
      try {
        endpoint.addCommandHandler('moveToHue', async ({ request: { hue } }) => {
          const entry = this.propertyMap.get(controlName);
          const currentHsv = entry?.lastValue as HsvColor | undefined;
          const newHsv: HsvColor = { hue, sat: currentHsv?.sat ?? 0, val: currentHsv?.val ?? 254 };
          publish(hsvToRgbString(newHsv));
        });
        endpoint.addCommandHandler('moveToSaturation', async ({ request: { saturation } }) => {
          const entry = this.propertyMap.get(controlName);
          const currentHsv = entry?.lastValue as HsvColor | undefined;
          const newHsv: HsvColor = { hue: currentHsv?.hue ?? 0, sat: saturation, val: currentHsv?.val ?? 254 };
          publish(hsvToRgbString(newHsv));
        });
        endpoint.addCommandHandler('moveToColorTemperature', async ({ request: { colorTemperatureMireds } }) => {
          // Convert mireds to RGB approximation — basic passthrough for WB
          this.log.debug(`moveToColorTemperature: ${colorTemperatureMireds} mireds for ${deviceName}/${controlName}`);
        });
      } catch {
        // Cluster may not support all commands — ignore
      }
    }

    // WindowCovering
    if (endpoint.hasClusterServer(WindowCovering.Cluster.id)) {
      endpoint.addCommandHandler('upOrOpen', async () => {
        // WB: max = fully open
        const max = String(mapping as never); // typed: meta.max from mapping context unavailable here
        // Publish max value = open
        publish(String(255)); // default, actual value comes from meta
      });
      endpoint.addCommandHandler('downOrClose', async () => {
        publish('0');
      });
      endpoint.addCommandHandler('stopMotion', async () => {
        this.log.debug(`stopMotion: ${deviceName}/${controlName}`);
      });
      endpoint.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue } }) => {
        if (mapping.reverseConverter) {
          const val = mapping.reverseConverter(liftPercent100thsValue, mapping as never);
          publish(String(val));
        }
      });
    }

    // DoorLock
    if (endpoint.hasClusterServer(DoorLock.Cluster.id)) {
      endpoint.addCommandHandler('lockDoor', async () => {
        const val = mapping.reverseConverter
          ? String(mapping.reverseConverter(DoorLock.LockState.Locked, mapping as never))
          : '1';
        publish(val);
      });
      endpoint.addCommandHandler('unlockDoor', async () => {
        const val = mapping.reverseConverter
          ? String(mapping.reverseConverter(DoorLock.LockState.Unlocked, mapping as never))
          : '0';
        publish(val);
      });
    }

    // FanControl
    if (endpoint.hasClusterServer(FanControl.Cluster.id)) {
      endpoint.addCommandHandler('step', async () => {
        this.log.debug(`Fan step command: ${deviceName}/${controlName}`);
      });
    }

    // WaterValve
    if (endpoint.hasClusterServer(ValveConfigurationAndControl.Cluster.id)) {
      endpoint.addCommandHandler('open', async () => {
        const val = mapping.reverseConverter
          ? String(mapping.reverseConverter(ValveConfigurationAndControl.ValveState.Open, mapping as never))
          : '1';
        publish(val);
      });
      endpoint.addCommandHandler('close', async () => {
        const val = mapping.reverseConverter
          ? String(mapping.reverseConverter(ValveConfigurationAndControl.ValveState.Closed, mapping as never))
          : '0';
        publish(val);
      });
    }
  }

  private addThermostatCommandHandlers(
    endpoint: MatterbridgeEndpoint,
    deviceName: string,
    heatSetpointName?: string,
    _coolSetpointName?: string,
    modeControlName?: string,
  ): void {
    if (endpoint.hasClusterServer(Thermostat.Cluster.id)) {
      endpoint.addCommandHandler('setpointRaiseLower', async ({ request: { mode, amount } }) => {
        const controlName = heatSetpointName;
        if (!controlName) return;
        const entry = this.propertyMap.get(controlName);
        if (!entry) return;
        const currentMatter = (entry.lastValue as number | undefined) ?? 0;
        // amount is in 0.1°C units
        const delta = amount * 0.1 * 100; // convert to matter units (×100)
        const newMatter = currentMatter + (mode === Thermostat.SetpointRaiseLowerMode.Both || mode === Thermostat.SetpointRaiseLowerMode.Heat ? delta : -delta);
        const newWb = newMatter / 100;
        this.handleMatterCommand(deviceName, controlName, String(newWb));
      });
    }

    if (modeControlName) {
      const modeEntry = this.propertyMap.get(modeControlName);
      if (modeEntry?.mapping.reverseConverter) {
        endpoint.addCommandHandler('changeToMode', async ({ request: { newMode } }) => {
          const val = modeEntry.mapping.reverseConverter!(newMode, modeEntry.mapping as never);
          this.handleMatterCommand(deviceName, modeControlName, String(val));
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MQTT → Matter update
  // ---------------------------------------------------------------------------

  /**
   * Update Matter attribute from incoming MQTT value.
   * Performs echo suppression (noUpdate flag) and skip-if-unchanged.
   */
  updateFromMqtt(controlName: string, rawValue: string): void {
    if (this.noUpdate) {
      this.log.debug(`Echo suppression active — skipping update for ${this.wbDevice.name}/${controlName}`);
      return;
    }

    const entry = this.propertyMap.get(controlName);
    if (!entry) return;

    const { endpoint, clusterId, attribute, mapping } = entry;

    let converted: unknown;
    try {
      converted = mapping.converter(rawValue, mapping as never);
    } catch (err) {
      this.log.warn(`Converter error for ${this.wbDevice.name}/${controlName}: ${String(err)}`);
      return;
    }

    // Skip if value unchanged
    if (entry.lastValue !== undefined && String(entry.lastValue) === String(converted)) return;

    entry.lastValue = converted;

    // RGB: store HSV as lastValue
    if (mapping.wbType === 'rgb') {
      const hsv = rgbStringToHsv(rawValue);
      entry.lastValue = hsv;
      try {
        endpoint.setAttribute(clusterId, 'currentHue', hsv.hue, this.log);
        endpoint.setAttribute(clusterId, 'currentSaturation', hsv.sat, this.log);
      } catch (err) {
        this.log.warn(`setAttribute RGB error for ${this.wbDevice.name}/${controlName}: ${String(err)}`);
      }
      return;
    }

    // AirQuality: also update airQuality enum when CO2 ppm changes
    if (mapping.matterDeviceType === airQualitySensor && mapping.wbUnits === 'ppm') {
      const ppm = parseFloat(rawValue);
      if (!isNaN(ppm)) {
        const aqEnum = classifyCO2(ppm);
        try {
          endpoint.setAttribute(AirQuality.Cluster.id, 'airQuality', aqEnum, this.log);
        } catch {
          // AirQuality cluster may not be present on this endpoint
        }
      }
    }

    try {
      endpoint.setAttribute(clusterId, attribute, converted as string | number | bigint | boolean | object | null, this.log);
    } catch (err) {
      this.log.warn(`setAttribute error for ${this.wbDevice.name}/${controlName} [${attribute}]: ${String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Matter → MQTT command
  // ---------------------------------------------------------------------------

  /**
   * Handle a Matter command: reverse-convert and publish to MQTT.
   * Sets the noUpdate flag for 2 seconds to suppress echo.
   */
  handleMatterCommand(deviceName: string, controlName: string, value: string): void {
    this.setNoUpdate();
    this.mqtt.publish(deviceName, controlName, value).catch((err: Error) => {
      this.log.error(`MQTT publish failed ${deviceName}/${controlName}: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Reachability
  // ---------------------------------------------------------------------------

  /**
   * Update reachability state on all registered endpoints.
   * Uses the two-step pattern: setAttribute + triggerEvent.
   */
  setReachable(reachable: boolean): void {
    for (const endpoint of this.endpoints) {
      if (endpoint.maybeNumber !== undefined) {
        endpoint.setAttribute(
          BridgedDeviceBasicInformation.Cluster.id,
          'reachable',
          reachable,
          this.log,
        );
        endpoint.triggerEvent(
          BridgedDeviceBasicInformation.Cluster.id,
          'reachableChanged',
          { reachableNewValue: reachable },
          this.log,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private setNoUpdate(): void {
    this.noUpdate = true;
    if (this.noUpdateTimeout) clearTimeout(this.noUpdateTimeout);
    this.noUpdateTimeout = setTimeout(() => {
      this.noUpdate = false;
      this.noUpdateTimeout = undefined;
    }, WirenboardDevice.NO_UPDATE_MS).unref();
  }
}
