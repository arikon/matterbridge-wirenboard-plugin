/**
 * WirenboardDevice — constructs Matter endpoints from WB device metadata
 * and handles bidirectional state synchronisation.
 *
 * @file wirenboardDevice.ts
 */

import {
  airQualitySensor,
  colorTemperatureLight,
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
} from "matterbridge";
import { AnsiLogger } from "matterbridge/logger";
import {
  AirQuality,
  BridgedDeviceBasicInformation,
  ColorControl,
  DoorLock,
  FanControl,
  LevelControl,
  OnOff,
  Thermostat,
  ValveConfigurationAndControl,
  WindowCovering,
} from "matterbridge/matter/clusters";
import { ClusterId } from "matterbridge/matter/types";

import {
  cctRangeToMireds,
  classifyCO2,
  clampLevelControlCurrentLevel,
  DeviceOverrides,
  findMapping,
  HsvColor,
  hsvToRgbString,
  levelControlToRange,
  levelToRange,
  miredsToCtRange,
  rangeToLevel,
  rangeToLevelControl,
  rgbStringToHsv,
  WbToMatterMapping,
} from "./controlMapping.js";
import { WirenboardMqtt } from "./wirenboardMqtt.js";
import { WbControl, WbControlMeta, WbDevice } from "./wirenboardTypes.js";

/**
 * Compare last MQTT→Matter converted value with the new one (objects need deep compare).
 */
function matterConvertedValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupingMode = "device" | "control";

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

const HW_SERIAL_KEYWORDS = ["serial"];
const HW_FW_KEYWORDS = ["fw version", "firmware version", "fw_version"];
const HW_HW_KEYWORDS = ["hw batch", "hw_batch", "hardware version"];

/**
 *
 * @param name
 * @param keywords
 */
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

/**
 *
 * @param controls
 */
function extractHwMetadata(controls: Map<string, WbControl>): HwMetadata {
  const meta: HwMetadata = { consumedControls: new Set() };
  for (const [, ctrl] of controls) {
    if (
      matchesKeywords(ctrl.name, HW_SERIAL_KEYWORDS) &&
      ctrl.meta.type === "text"
    ) {
      if (ctrl.value !== undefined) meta.serialNumber = ctrl.value;
      meta.consumedControls.add(ctrl.name);
    } else if (
      matchesKeywords(ctrl.name, HW_FW_KEYWORDS) &&
      ctrl.meta.type === "text"
    ) {
      if (ctrl.value !== undefined) meta.softwareVersionString = ctrl.value;
      meta.consumedControls.add(ctrl.name);
    } else if (
      matchesKeywords(ctrl.name, HW_HW_KEYWORDS) &&
      ctrl.meta.type === "text"
    ) {
      if (ctrl.value !== undefined) meta.hardwareVersionString = ctrl.value;
      meta.consumedControls.add(ctrl.name);
    }
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Thermostat composite detection
// ---------------------------------------------------------------------------

const TEMP_KEYWORDS = ["temperature", "temp"];
const SETPOINT_KEYWORDS = ["setpoint", "target"];
const MODE_KEYWORDS = ["mode", "system_mode"];

interface ThermostatControls {
  tempControl?: WbControl; // readonly, deg C
  heatSetpoint?: WbControl; // writable range/value, deg C
  coolSetpoint?: WbControl; // writable range/value, deg C
  modeControl?: WbControl; // enum or text
}

/**
 *
 * @param controls
 */
function detectThermostatControls(
  controls: Map<string, WbControl>,
): ThermostatControls | undefined {
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
      (type === "value" || type === "temperature") &&
      (units === "deg C" || type === "temperature") &&
      ctrl.meta.readonly === true &&
      TEMP_KEYWORDS.some((kw) => nameLower.includes(kw))
    ) {
      tempControl = ctrl;
      continue;
    }

    // Setpoints (writable range/value, deg C)
    if (
      (type === "range" || type === "value") &&
      units === "deg C" &&
      ctrl.meta.readonly !== true &&
      SETPOINT_KEYWORDS.some((kw) => nameLower.includes(kw))
    ) {
      const lowerName = nameLower;
      if (lowerName.includes("cool") || lowerName.includes("охлажд")) {
        coolSetpoint = ctrl;
      } else {
        heatSetpoint = ctrl;
      }
      continue;
    }

    // Mode (enum or text)
    if (
      !modeControl &&
      (type === "enum" || type === "text") &&
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

/**
 *
 * @param title
 * @param fallback
 */
function resolveTitle(
  title: { en: string; ru?: string } | string,
  fallback: string,
): string {
  if (typeof title === "string") return title || fallback;
  return title.en || fallback;
}

// ---------------------------------------------------------------------------
// Lighting composite detection
// ---------------------------------------------------------------------------

interface LightingComposite {
  switchControl: WbControl;
  brightnessControl: WbControl;
  temperatureControl?: WbControl; // CCT
  hueControl?: WbControl; // extendedColor
  saturationControl?: WbControl; // extendedColor
  lightType: "dimmable" | "colorTemperature" | "extendedColor";
}

/**
 *
 * @param controls
 */
function detectLightingComposites(
  controls: Map<string, WbControl>,
): LightingComposite[] {
  const composites: LightingComposite[] = [];

  for (const [, ctrl] of controls) {
    if (ctrl.meta.type !== "switch" || ctrl.meta.readonly === true) continue;

    const base = ctrl.name;
    const brightness = controls.get(`${base} Brightness`);
    if (!brightness || brightness.meta.type !== "range") continue;

    const temperature = controls.get(`${base} Temperature`);
    const hue = controls.get(`${base} Hue`);
    const saturation = controls.get(`${base} Saturation`);

    if (hue?.meta.type === "range" && saturation?.meta.type === "range") {
      composites.push({
        switchControl: ctrl,
        brightnessControl: brightness,
        hueControl: hue,
        saturationControl: saturation,
        lightType: "extendedColor",
      });
    } else if (temperature?.meta.type === "range") {
      composites.push({
        switchControl: ctrl,
        brightnessControl: brightness,
        temperatureControl: temperature,
        lightType: "colorTemperature",
      });
    } else {
      composites.push({
        switchControl: ctrl,
        brightnessControl: brightness,
        lightType: "dimmable",
      });
    }
  }

  return composites;
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

  private constructor(
    log: AnsiLogger,
    mqtt: WirenboardMqtt,
    wbDevice: WbDevice,
  ) {
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
      const { tempControl, heatSetpoint, coolSetpoint, modeControl } =
        thermostatControls;

      // Mark consumed controls so they won't be mapped individually
      if (tempControl) thermostatConsumed.add(tempControl.name);
      if (heatSetpoint) thermostatConsumed.add(heatSetpoint.name);
      if (coolSetpoint) thermostatConsumed.add(coolSetpoint.name);
      if (modeControl) thermostatConsumed.add(modeControl.name);

      const minHeat = heatSetpoint ? (heatSetpoint.meta.min ?? 0) : 0;
      const maxHeat = heatSetpoint ? (heatSetpoint.meta.max ?? 50) : 50;
      const minCool = coolSetpoint ? (coolSetpoint.meta.min ?? 0) : 0;
      const maxCool = coolSetpoint ? (coolSetpoint.meta.max ?? 50) : 50;

      const uniqueId =
        groupingMode === "control" ? `${deviceName}_thermostat` : deviceName;

      const tLabel = `${deviceTitle} Thermostat`;

      const tEndpoint = new MatterbridgeEndpoint(thermostatDevice, {
        id: uniqueId,
      });
      tEndpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
        tLabel,
        hwMeta.serialNumber ?? uniqueId,
        vendorId,
        "Wirenboard",
        wbDevice.meta.driver || "WB Device",
        undefined,
        hwMeta.softwareVersionString,
        undefined,
        hwMeta.hardwareVersionString,
      );

      // Determine thermostat branch: HeatingOnly / CoolingOnly / CoolingAndHeating
      const hasHeat = !!heatSetpoint;
      const hasCool = !!coolSetpoint;
      const hasAutoMode = modeControl !== undefined;

      let thermostatType: "heating" | "cooling" | "auto";
      if (hasHeat && !hasCool && !hasAutoMode) {
        // HeatingOnly
        thermostatType = "heating";
        tEndpoint.createDefaultHeatingThermostatClusterServer(
          undefined,
          undefined,
          minHeat * 100,
          maxHeat * 100,
        );
      } else if (!hasHeat && hasCool && !hasAutoMode) {
        // CoolingOnly
        thermostatType = "cooling";
        tEndpoint.createDefaultCoolingThermostatClusterServer(
          undefined,
          undefined,
          minCool * 100,
          maxCool * 100,
        );
      } else {
        // CoolingAndHeating (auto or both setpoints)
        thermostatType = "auto";
        tEndpoint.createDefaultThermostatClusterServer(
          undefined,
          undefined,
          undefined,
          undefined,
          minHeat * 100,
          maxHeat * 100,
          minCool * 100,
          maxCool * 100,
        );
      }

      tEndpoint.addRequiredClusterServers();

      // Register local temperature in propertyMap
      if (tempControl) {
        self.propertyMap.set(tempControl.name, {
          endpoint: tEndpoint,
          clusterId: Thermostat.Cluster.id,
          attribute: "localTemperature",
          mapping: {
            wbType: "value",
            wbUnits: "deg C",
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: "localTemperature",
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
          attribute: "occupiedHeatingSetpoint",
          mapping: {
            wbType: "range",
            wbUnits: "deg C",
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: "occupiedHeatingSetpoint",
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
          attribute: "occupiedCoolingSetpoint",
          mapping: {
            wbType: "range",
            wbUnits: "deg C",
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: "occupiedCoolingSetpoint",
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
          attribute: "systemMode",
          mapping: {
            wbType: "enum",
            matterDeviceType: thermostatDevice,
            matterClusterIds: [Thermostat.Cluster.id],
            matterAttribute: "systemMode",
            converter: (v) => {
              const lower = v.toLowerCase();
              if (lower === "off") return Thermostat.SystemMode.Off;
              if (lower === "heat") return Thermostat.SystemMode.Heat;
              if (lower === "cool") return Thermostat.SystemMode.Cool;
              if (lower === "auto") return Thermostat.SystemMode.Auto;
              return Thermostat.SystemMode.Off;
            },
            reverseConverter: (v) => {
              switch (v as Thermostat.SystemMode) {
                case Thermostat.SystemMode.Heat:
                  return "heat";
                case Thermostat.SystemMode.Cool:
                  return "cool";
                case Thermostat.SystemMode.Auto:
                  return "auto";
                default:
                  return "off";
              }
            },
          },
          lastValue: undefined,
        });
      }

      // For HeatingOnly/CoolingOnly: remove running_state/running_mode from propertyMap
      // These attributes are only supported in AutoMode (CoolingAndHeating)
      if (thermostatType !== "auto") {
        for (const [key] of self.propertyMap) {
          const lower = key.toLowerCase();
          if (lower.includes("running")) {
            self.propertyMap.delete(key);
          }
        }
      }

      // Add thermostat command handlers
      self.addThermostatCommandHandlers(
        tEndpoint,
        deviceName,
        heatSetpoint?.name,
        coolSetpoint?.name,
        modeControl?.name,
      );

      self.endpoints.push(tEndpoint);
    }

    // Step 2.5: Detect and build lighting composite endpoints
    const lightingComposites = detectLightingComposites(wbDevice.controls);
    const lightingConsumed = new Set<string>();

    for (const composite of lightingComposites) {
      const {
        switchControl,
        brightnessControl,
        temperatureControl,
        hueControl,
        saturationControl,
        lightType,
      } = composite;

      // Mark all constituent controls as consumed
      lightingConsumed.add(switchControl.name);
      lightingConsumed.add(brightnessControl.name);
      if (temperatureControl) lightingConsumed.add(temperatureControl.name);
      if (hueControl) lightingConsumed.add(hueControl.name);
      if (saturationControl) lightingConsumed.add(saturationControl.name);

      const switchName = switchControl.name;
      const compositeId =
        groupingMode === "control"
          ? `${deviceName}_${switchName}_composite`
          : `${deviceName}_${switchName}`;
      const compositeLabel = switchControl.meta.title
        ? resolveTitle(switchControl.meta.title, switchName)
        : switchName;
      const endpointLabel = `${deviceTitle} - ${compositeLabel}`;

      let deviceTypeDef;
      if (lightType === "colorTemperature") {
        deviceTypeDef = colorTemperatureLight;
      } else if (lightType === "extendedColor") {
        deviceTypeDef = extendedColorLight;
      } else {
        deviceTypeDef = dimmableLight;
      }

      const cEndpoint = new MatterbridgeEndpoint(deviceTypeDef, {
        id: compositeId,
      });
      cEndpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
        endpointLabel,
        compositeId,
        vendorId,
        "Wirenboard",
        wbDevice.meta.driver || "WB Device",
        undefined,
        hwMeta.softwareVersionString,
        undefined,
        hwMeta.hardwareVersionString,
      );
      cEndpoint.addRequiredClusterServers();

      // Register switch → OnOff
      self.propertyMap.set(switchName, {
        endpoint: cEndpoint,
        clusterId: OnOff.Cluster.id,
        attribute: "onOff",
        mapping: {
          wbType: "switch",
          matterDeviceType: deviceTypeDef,
          matterClusterIds: [OnOff.Cluster.id],
          matterAttribute: "onOff",
          converter: (v) => v === "1",
          reverseConverter: (v) => (v ? "1" : "0"),
        },
        lastValue: undefined,
      });

      // Register brightness → LevelControl
      const bMeta = brightnessControl.meta;
      self.propertyMap.set(brightnessControl.name, {
        endpoint: cEndpoint,
        clusterId: LevelControl.Cluster.id,
        attribute: "currentLevel",
        mapping: {
          wbType: "range",
          matterDeviceType: deviceTypeDef,
          matterClusterIds: [LevelControl.Cluster.id],
          primaryClusterId: LevelControl.Cluster.id,
          matterAttribute: "currentLevel",
          converter: (v) =>
            rangeToLevelControl(
              parseFloat(v),
              bMeta.min ?? 0,
              bMeta.max ?? 100,
            ),
          reverseConverter: (v) =>
            String(
              levelControlToRange(v as number, bMeta.min ?? 0, bMeta.max ?? 100),
            ),
        },
        lastValue: undefined,
      });

      // Register temperature → ColorControl.colorTemperatureMireds (CCT)
      if (temperatureControl) {
        self.propertyMap.set(temperatureControl.name, {
          endpoint: cEndpoint,
          clusterId: ColorControl.Cluster.id,
          attribute: "colorTemperatureMireds",
          mapping: {
            wbType: "range",
            matterDeviceType: deviceTypeDef,
            matterClusterIds: [ColorControl.Cluster.id],
            primaryClusterId: ColorControl.Cluster.id,
            matterAttribute: "colorTemperatureMireds",
            converter: (v) => cctRangeToMireds(parseFloat(v)),
            reverseConverter: (v) => String(miredsToCtRange(v as number)),
          },
          lastValue: undefined,
        });
      }

      // Register hue → ColorControl.currentHue (extendedColor)
      if (hueControl) {
        const hMeta = hueControl.meta;
        self.propertyMap.set(hueControl.name, {
          endpoint: cEndpoint,
          clusterId: ColorControl.Cluster.id,
          attribute: "currentHue",
          mapping: {
            wbType: "range",
            matterDeviceType: deviceTypeDef,
            matterClusterIds: [ColorControl.Cluster.id],
            primaryClusterId: ColorControl.Cluster.id,
            matterAttribute: "currentHue",
            converter: (v) =>
              rangeToLevel(parseFloat(v), hMeta.min ?? 0, hMeta.max ?? 360),
            reverseConverter: (v) =>
              String(
                levelToRange(v as number, hMeta.min ?? 0, hMeta.max ?? 360),
              ),
          },
          lastValue: undefined,
        });
      }

      // Register saturation → ColorControl.currentSaturation (extendedColor)
      if (saturationControl) {
        const sMeta = saturationControl.meta;
        self.propertyMap.set(saturationControl.name, {
          endpoint: cEndpoint,
          clusterId: ColorControl.Cluster.id,
          attribute: "currentSaturation",
          mapping: {
            wbType: "range",
            matterDeviceType: deviceTypeDef,
            matterClusterIds: [ColorControl.Cluster.id],
            primaryClusterId: ColorControl.Cluster.id,
            matterAttribute: "currentSaturation",
            converter: (v) =>
              rangeToLevel(parseFloat(v), sMeta.min ?? 0, sMeta.max ?? 100),
            reverseConverter: (v) =>
              String(
                levelToRange(v as number, sMeta.min ?? 0, sMeta.max ?? 100),
              ),
          },
          lastValue: undefined,
        });
      }

      // Command handlers for composite endpoint
      cEndpoint.addCommandHandler("on", () => {
        self.handleMatterCommand(deviceName, switchName, "1");
      });
      cEndpoint.addCommandHandler("off", () => {
        self.handleMatterCommand(deviceName, switchName, "0");
      });
      cEndpoint.addCommandHandler("toggle", async () => {
        const entry = self.propertyMap.get(switchName);
        const current = entry?.lastValue as boolean | undefined;
        self.handleMatterCommand(deviceName, switchName, current ? "0" : "1");
      });
      cEndpoint.addCommandHandler(
        "moveToLevel",
        async ({ request: { level } }) => {
          const bEntry = self.propertyMap.get(brightnessControl.name);
          if (bEntry?.mapping.reverseConverter) {
            const val = bEntry.mapping.reverseConverter(level, bMeta);
            self.handleMatterCommand(
              deviceName,
              brightnessControl.name,
              String(val),
            );
          }
        },
      );

      if (lightType === "colorTemperature" && temperatureControl) {
        const tEntry = self.propertyMap.get(temperatureControl.name);
        cEndpoint.addCommandHandler(
          "moveToColorTemperature",
          async ({ request: { colorTemperatureMireds } }) => {
            if (tEntry?.mapping.reverseConverter) {
              const val = tEntry.mapping.reverseConverter(
                colorTemperatureMireds,
                temperatureControl.meta,
              );
              self.handleMatterCommand(
                deviceName,
                temperatureControl.name,
                String(val),
              );
            }
          },
        );
      }

      if (lightType === "extendedColor" && hueControl && saturationControl) {
        cEndpoint.addCommandHandler(
          "moveToHue",
          async ({ request: { hue } }) => {
            const hEntry = self.propertyMap.get(hueControl.name);
            if (hEntry?.mapping.reverseConverter) {
              const val = hEntry.mapping.reverseConverter(hue, hueControl.meta);
              self.handleMatterCommand(
                deviceName,
                hueControl.name,
                String(val),
              );
            }
          },
        );
        cEndpoint.addCommandHandler(
          "moveToSaturation",
          async ({ request: { saturation } }) => {
            const sEntry = self.propertyMap.get(saturationControl.name);
            if (sEntry?.mapping.reverseConverter) {
              const val = sEntry.mapping.reverseConverter(
                saturation,
                saturationControl.meta,
              );
              self.handleMatterCommand(
                deviceName,
                saturationControl.name,
                String(val),
              );
            }
          },
        );
        cEndpoint.addCommandHandler(
          "moveToHueAndSaturation",
          async ({ request: { hue, saturation } }) => {
            const hEntry = self.propertyMap.get(hueControl.name);
            const sEntry = self.propertyMap.get(saturationControl.name);
            if (hEntry?.mapping.reverseConverter) {
              self.handleMatterCommand(
                deviceName,
                hueControl.name,
                String(hEntry.mapping.reverseConverter(hue, hueControl.meta)),
              );
            }
            if (sEntry?.mapping.reverseConverter) {
              self.handleMatterCommand(
                deviceName,
                saturationControl.name,
                String(
                  sEntry.mapping.reverseConverter(
                    saturation,
                    saturationControl.meta,
                  ),
                ),
              );
            }
          },
        );
      }

      self.endpoints.push(cEndpoint);
    }

    // Step 3: Collect remaining controls (excluding HW meta and thermostat consumed)
    const skippedControlNames = new Set([
      ...hwMeta.consumedControls,
      ...thermostatConsumed,
      ...lightingConsumed,
    ]);

    // Separate internal diagnostic controls (Supply Voltage, MCU Temperature)
    // that are skipped unless includeHidden
    const internalKeywords = ["supply voltage", "mcu temperature", "uptime"];
    /**
     *
     * @param name
     */
    function isInternalDiagnostic(name: string): boolean {
      const lower = name.toLowerCase();
      return internalKeywords.some((kw) => lower.includes(kw));
    }

    const mappableControls: Array<{
      ctrl: WbControl;
      mapping: WbToMatterMapping;
    }> = [];

    for (const [, ctrl] of wbDevice.controls) {
      if (skippedControlNames.has(ctrl.name)) continue;
      if (!includeHidden && ctrl.meta.hidden === true) continue;
      if (isInternalDiagnostic(ctrl.name) && !includeHidden) continue;

      const mapping = findMapping(ctrl.meta, ctrl.name, deviceOverrides);
      if (!mapping) {
        log.warn(
          `Skipping control ${deviceName}/${ctrl.name}: no mapping for type '${ctrl.meta.type}' units '${ctrl.meta.units ?? ""}'`,
        );
        continue;
      }

      mappableControls.push({ ctrl, mapping });
    }

    // Step 4: Build endpoints based on groupingMode
    if (mappableControls.length === 0 && self.endpoints.length === 0) {
      log.info(
        `Device ${deviceName} has no mappable controls — skipping registration`,
      );
      return self;
    }

    if (groupingMode === "device") {
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

    const rootEndpoint = new MatterbridgeEndpoint(dominantType, {
      id: deviceName,
    });
    rootEndpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
      deviceTitle,
      hwMeta.serialNumber ?? deviceName,
      vendorId,
      "Wirenboard",
      wbDevice.meta.driver || "WB Device",
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

      const clusterServerIds =
        mapping.matterClusterIds.length > 0
          ? (mapping.matterClusterIds as [ClusterId, ...ClusterId[]])
          : undefined;

      let childEndpoint: MatterbridgeEndpoint;
      if (clusterServerIds) {
        childEndpoint = rootEndpoint.addChildDeviceTypeWithClusterServer(
          childId,
          [mapping.matterDeviceType] as [
            DeviceTypeDefinition,
            ...DeviceTypeDefinition[],
          ],
          clusterServerIds,
          { tagList },
        );
      } else {
        childEndpoint = rootEndpoint.addChildDeviceTypeWithClusterServer(
          childId,
          [mapping.matterDeviceType] as [
            DeviceTypeDefinition,
            ...DeviceTypeDefinition[],
          ],
          [],
          { tagList },
        );
      }

      childEndpoint.addRequiredClusterServers();

      // Register in propertyMap
      const primaryClusterId =
        mapping.primaryClusterId ?? mapping.matterClusterIds[0];
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
        this.addControlCommandHandlers(
          childEndpoint,
          mapping,
          wbDevice.name,
          ctrl.name,
          ctrl.meta,
        );
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

      const endpoint = new MatterbridgeEndpoint(mapping.matterDeviceType, {
        id: uniqueId,
      });
      endpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
        label,
        uniqueId,
        vendorId,
        "Wirenboard",
        wbDevice.meta.driver || "WB Device",
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

      const primaryClusterId =
        mapping.primaryClusterId ?? mapping.matterClusterIds[0];
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
        this.addControlCommandHandlers(
          endpoint,
          mapping,
          deviceName,
          ctrl.name,
          ctrl.meta,
        );
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
    ctrlMeta: WbControlMeta,
  ): void {
    const publish = (value: string): void => {
      this.handleMatterCommand(deviceName, controlName, value);
    };

    // OnOff commands
    if (endpoint.hasClusterServer(OnOff.Cluster.id)) {
      endpoint.addCommandHandler("on", () => {
        if (mapping.wbType === "range" || mapping.wbType === "dimmer") {
          const entry = this.propertyMap.get(controlName);
          const lastLevel = (entry?.lastValue as number | undefined) ?? 0;
          // Level Control uses 1–254; WB "off" (0) maps to Matter 1, so restore only when lastLevel > 1
          const targetLevel = lastLevel > 1 ? lastLevel : 254;
          publish(
            String(
              mapping.reverseConverter
                ? mapping.reverseConverter(targetLevel, ctrlMeta)
                : (ctrlMeta.max ?? 255),
            ),
          );
        } else if (mapping.wbType === "rgb") {
          const entry = this.propertyMap.get(controlName);
          const lastHsv = entry?.lastValue as HsvColor | undefined;
          const hsv: HsvColor =
            lastHsv && lastHsv.val > 0 ? lastHsv : { hue: 0, sat: 0, val: 254 };
          publish(hsvToRgbString(hsv));
        } else {
          publish(
            mapping.reverseConverter
              ? String(mapping.reverseConverter(true, ctrlMeta))
              : "1",
          );
        }
      });
      endpoint.addCommandHandler("off", () => {
        if (mapping.wbType === "range" || mapping.wbType === "dimmer") {
          publish("0");
        } else if (mapping.wbType === "rgb") {
          publish("0;0;0");
        } else {
          publish(
            mapping.reverseConverter
              ? String(mapping.reverseConverter(false, ctrlMeta))
              : "0",
          );
        }
      });
      endpoint.addCommandHandler("toggle", async () => {
        const entry = this.propertyMap.get(controlName);
        if (mapping.wbType === "range" || mapping.wbType === "dimmer") {
          const lastLevel = (entry?.lastValue as number | undefined) ?? 0;
          if (lastLevel > 1) {
            publish("0");
          } else {
            publish(
              String(
                mapping.reverseConverter
                  ? mapping.reverseConverter(254, ctrlMeta)
                  : (ctrlMeta.max ?? 255),
              ),
            );
          }
        } else if (mapping.wbType === "rgb") {
          const lastHsv = entry?.lastValue as HsvColor | undefined;
          const isOn = lastHsv && lastHsv.val > 0;
          publish(
            isOn ? "0;0;0" : hsvToRgbString({ hue: 0, sat: 0, val: 254 }),
          );
        } else {
          const current = entry?.lastValue;
          const next = !current;
          publish(
            mapping.reverseConverter
              ? String(mapping.reverseConverter(next, ctrlMeta))
              : next
                ? "1"
                : "0",
          );
        }
      });
    }

    // LevelControl
    if (endpoint.hasClusterServer(LevelControl.Cluster.id)) {
      endpoint.addCommandHandler(
        "moveToLevel",
        async ({ request: { level } }) => {
          if (mapping.wbType === "rgb") {
            const entry = this.propertyMap.get(controlName);
            const currentHsv = entry?.lastValue as HsvColor | undefined;
            const newHsv: HsvColor = {
              hue: currentHsv?.hue ?? 0,
              sat: currentHsv?.sat ?? 0,
              val: level,
            };
            publish(hsvToRgbString(newHsv));
          } else if (mapping.reverseConverter) {
            publish(String(mapping.reverseConverter(level, ctrlMeta)));
          }
        },
      );
    }

    // ColorControl (HSV)
    if (
      mapping.matterDeviceType === extendedColorLight ||
      mapping.wbType === "rgb"
    ) {
      try {
        endpoint.addCommandHandler(
          "moveToHue",
          async ({ request: { hue } }) => {
            const entry = this.propertyMap.get(controlName);
            const currentHsv = entry?.lastValue as HsvColor | undefined;
            const newHsv: HsvColor = {
              hue,
              sat: currentHsv?.sat ?? 0,
              val: currentHsv?.val ?? 254,
            };
            publish(hsvToRgbString(newHsv));
          },
        );
        endpoint.addCommandHandler(
          "moveToSaturation",
          async ({ request: { saturation } }) => {
            const entry = this.propertyMap.get(controlName);
            const currentHsv = entry?.lastValue as HsvColor | undefined;
            const newHsv: HsvColor = {
              hue: currentHsv?.hue ?? 0,
              sat: saturation,
              val: currentHsv?.val ?? 254,
            };
            publish(hsvToRgbString(newHsv));
          },
        );
        endpoint.addCommandHandler(
          "moveToColorTemperature",
          async ({ request: { colorTemperatureMireds } }) => {
            // Convert mireds to RGB approximation — basic passthrough for WB
            this.log.debug(
              `moveToColorTemperature: ${colorTemperatureMireds} mireds for ${deviceName}/${controlName}`,
            );
          },
        );
      } catch {
        // Cluster may not support all commands — ignore
      }
    }

    // WindowCovering
    if (endpoint.hasClusterServer(WindowCovering.Cluster.id)) {
      endpoint.addCommandHandler("upOrOpen", async () => {
        publish(String(ctrlMeta.max ?? 255));
      });
      endpoint.addCommandHandler("downOrClose", async () => {
        publish("0");
      });
      endpoint.addCommandHandler("stopMotion", async () => {
        this.log.debug(`stopMotion: ${deviceName}/${controlName}`);
      });
      endpoint.addCommandHandler(
        "goToLiftPercentage",
        async ({
          request: { liftPercent100thsValue },
        }: {
          request: { liftPercent100thsValue: number };
        }) => {
          if (mapping.reverseConverter) {
            const val = mapping.reverseConverter(
              liftPercent100thsValue,
              ctrlMeta,
            );
            publish(String(val));
          }
        },
      );
    }

    // DoorLock
    if (endpoint.hasClusterServer(DoorLock.Cluster.id)) {
      endpoint.addCommandHandler("lockDoor", async () => {
        const val = mapping.reverseConverter
          ? String(
              mapping.reverseConverter(DoorLock.LockState.Locked, ctrlMeta),
            )
          : "1";
        publish(val);
      });
      endpoint.addCommandHandler("unlockDoor", async () => {
        const val = mapping.reverseConverter
          ? String(
              mapping.reverseConverter(DoorLock.LockState.Unlocked, ctrlMeta),
            )
          : "0";
        publish(val);
      });
    }

    // FanControl
    if (endpoint.hasClusterServer(FanControl.Cluster.id)) {
      endpoint.addCommandHandler("step", async () => {
        this.log.debug(`Fan step command: ${deviceName}/${controlName}`);
      });
    }

    // WaterValve
    if (endpoint.hasClusterServer(ValveConfigurationAndControl.Cluster.id)) {
      endpoint.addCommandHandler("open", async () => {
        const val = mapping.reverseConverter
          ? String(
              mapping.reverseConverter(
                ValveConfigurationAndControl.ValveState.Open,
                ctrlMeta,
              ),
            )
          : "1";
        publish(val);
      });
      endpoint.addCommandHandler("close", async () => {
        const val = mapping.reverseConverter
          ? String(
              mapping.reverseConverter(
                ValveConfigurationAndControl.ValveState.Closed,
                ctrlMeta,
              ),
            )
          : "0";
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
      endpoint.addCommandHandler(
        "setpointRaiseLower",
        async ({
          request: { mode, amount },
        }: {
          request: { mode: Thermostat.SetpointRaiseLowerMode; amount: number };
        }) => {
          const controlName = heatSetpointName;
          if (!controlName) return;
          const entry = this.propertyMap.get(controlName);
          if (!entry) return;
          const currentMatter = (entry.lastValue as number | undefined) ?? 0;
          // amount is in 0.1°C units
          const delta = amount * 0.1 * 100; // convert to matter units (×100)
          const newMatter =
            currentMatter +
            (mode === Thermostat.SetpointRaiseLowerMode.Both ||
            mode === Thermostat.SetpointRaiseLowerMode.Heat
              ? delta
              : -delta);
          const newWb = newMatter / 100;
          this.handleMatterCommand(deviceName, controlName, String(newWb));
        },
      );
    }

    if (modeControlName) {
      const modeEntry = this.propertyMap.get(modeControlName);
      if (modeEntry?.mapping.reverseConverter) {
        endpoint.addCommandHandler(
          "changeToMode",
          async ({
            request: { newMode },
          }: {
            request: { newMode: number };
          }) => {
            const val = modeEntry.mapping.reverseConverter!(
              newMode,
              modeEntry.mapping as never,
            );
            this.handleMatterCommand(deviceName, modeControlName, String(val));
          },
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MQTT → Matter update
  // ---------------------------------------------------------------------------

  /**
   * Update Matter attribute from incoming MQTT value.
   * Performs echo suppression (noUpdate flag) and skip-if-unchanged.
   *
   * @param controlName
   * @param rawValue
   */
  updateFromMqtt(controlName: string, rawValue: string): void {
    if (this.noUpdate) {
      this.log.debug(
        `Echo suppression active — skipping update for ${this.wbDevice.name}/${controlName}`,
      );
      return;
    }

    const entry = this.propertyMap.get(controlName);
    if (!entry) return;

    const { endpoint, clusterId, attribute, mapping } = entry;

    let converted: unknown;
    try {
      converted = mapping.converter(rawValue, mapping as never);
    } catch (err) {
      this.log.warn(
        `Converter error for ${this.wbDevice.name}/${controlName}: ${String(err)}`,
      );
      return;
    }

    // Skip if value unchanged
    if (
      entry.lastValue !== undefined &&
      matterConvertedValuesEqual(entry.lastValue, converted)
    )
      return;

    entry.lastValue = converted;

    // RGB: store HSV as lastValue
    if (mapping.wbType === "rgb") {
      const hsv = rgbStringToHsv(rawValue);
      entry.lastValue = hsv;
      const isOn = hsv.hue !== 0 || hsv.sat !== 0 || hsv.val !== 0;
      const warnRgb = (err: unknown) =>
        this.log.warn(
          `setAttribute RGB error for ${this.wbDevice.name}/${controlName}: ${String(err)}`,
        );
      void endpoint
        .setAttribute(ColorControl.Cluster.id, "currentHue", hsv.hue, this.log)
        .catch(warnRgb);
      void endpoint
        .setAttribute(
          ColorControl.Cluster.id,
          "currentSaturation",
          hsv.sat,
          this.log,
        )
        .catch(warnRgb);
      void endpoint
        .setAttribute(
          LevelControl.Cluster.id,
          "currentLevel",
          clampLevelControlCurrentLevel(hsv.val),
          this.log,
        )
        .catch(warnRgb);
      void endpoint
        .setAttribute(OnOff.Cluster.id, "onOff", isOn, this.log)
        .catch(warnRgb);
      return;
    }

    // AirQuality: also update airQuality enum when CO2 ppm changes
    if (
      mapping.matterDeviceType === airQualitySensor &&
      mapping.wbUnits === "ppm"
    ) {
      const ppm = parseFloat(rawValue);
      if (!isNaN(ppm)) {
        const aqEnum = classifyCO2(ppm);
        void endpoint
          .setAttribute(AirQuality.Cluster.id, "airQuality", aqEnum, this.log)
          .catch(() => {
            // AirQuality cluster may not be present on this endpoint
          });
      }
    }

    void endpoint
      .setAttribute(
        clusterId,
        attribute,
        converted as string | number | bigint | boolean | object | null,
        this.log,
      )
      .catch((err: unknown) => {
        this.log.warn(
          `setAttribute error for ${this.wbDevice.name}/${controlName} [${attribute}]: ${String(err)}`,
        );
      });

    // Sync OnOff for dimmable mappings (range/dimmer have OnOff as secondary cluster).
    // currentLevel is 1–254; derive on/off from WB brightness (0 = off).
    if (
      (mapping.wbType === "range" || mapping.wbType === "dimmer") &&
      mapping.matterClusterIds.includes(OnOff.Cluster.id)
    ) {
      const wbBrightness = parseFloat(rawValue);
      const isOn =
        !Number.isNaN(wbBrightness) && wbBrightness > 0;
      void endpoint
        .setAttribute(OnOff.Cluster.id, "onOff", isOn, this.log)
        .catch(() => {
          // ignore if OnOff cluster not present
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Matter → MQTT command
  // ---------------------------------------------------------------------------

  /**
   * Handle a Matter command: reverse-convert and publish to MQTT.
   * Sets the noUpdate flag for 2 seconds to suppress echo.
   *
   * @param deviceName
   * @param controlName
   * @param value
   */
  handleMatterCommand(
    deviceName: string,
    controlName: string,
    value: string,
  ): void {
    this.setNoUpdate();
    this.mqtt.publish(deviceName, controlName, value).catch((err: Error) => {
      this.log.error(
        `MQTT publish failed ${deviceName}/${controlName}: ${err.message}`,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Reachability
  // ---------------------------------------------------------------------------

  /**
   * Update reachability state on all registered endpoints.
   * Uses the two-step pattern: setAttribute + triggerEvent.
   *
   * @param reachable
   */
  setReachable(reachable: boolean): void {
    for (const endpoint of this.endpoints) {
      if (endpoint.maybeNumber !== undefined) {
        void endpoint
          .setAttribute(
            BridgedDeviceBasicInformation.Cluster.id,
            "reachable",
            reachable,
            this.log,
          )
          .catch((err: unknown) =>
            this.log.debug(`setReachable setAttribute: ${String(err)}`),
          );
        void endpoint
          .triggerEvent(
            BridgedDeviceBasicInformation.Cluster.id,
            "reachableChanged",
            { reachableNewValue: reachable },
            this.log,
          )
          .catch((err: unknown) =>
            this.log.debug(`setReachable triggerEvent: ${String(err)}`),
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
