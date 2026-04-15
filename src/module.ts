/**
 * WirenboardPlatform — Matterbridge dynamic platform plugin for Wirenboard.
 * Step 6: Full platform refactor using WirenboardDevice.
 *
 * @file module.ts
 */

import {
  coverDevice,
  extendedColorLight,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  PlatformConfig,
  PlatformMatterbridge,
} from "matterbridge";
import { AnsiLogger } from "matterbridge/logger";
import { ColorControl } from "matterbridge/matter/clusters";
import { waiter } from "matterbridge/utils";

import {
  compareCanonicalControlNames,
  sortedControlsByCanonicalName,
} from "./canonicalOrdering.js";
import { DeviceOverrides, findMapping } from "./controlMapping.js";
import {
  GroupingMode,
  isSystemDevice,
  WirenboardDevice,
} from "./wirenboardDevice.js";

/** Cover endpoint may expose this helper (matterbridge mock / runtime). */
type EndpointWithWindowCovering = MatterbridgeEndpoint & {
  setWindowCoveringTargetAsCurrentAndStopped?: () => Promise<void>;
};
import {
  ControlErrorEvent,
  ControlMetaEvent,
  ControlValueEvent,
  DeviceErrorEvent,
  DeviceMetaEvent,
  DeviceRemovedEvent,
  WirenboardMqtt,
  WirenboardMqttConfig,
} from "./wirenboardMqtt.js";
import { WbControlMeta, WbDevice } from "./wirenboardTypes.js";

/** WB device ids for network-related drivers often start with this prefix (e.g. `networks`). */
function isNetworkPrefixedDevice(deviceName: string): boolean {
  return deviceName.startsWith("network");
}

/**
 *
 */
function appliesSystemPrefixedSkip(
  deviceName: string,
  ignoreSystemPrefixedDevices: boolean,
): boolean {
  return ignoreSystemPrefixedDevices && isSystemDevice(deviceName);
}

/**
 *
 */
function appliesNetworkPrefixedSkip(
  deviceName: string,
  ignoreNetworkPrefixedDevices: boolean,
): boolean {
  return ignoreNetworkPrefixedDevices && isNetworkPrefixedDevice(deviceName);
}

/** Pure predicate: whether this WB device must not be registered as Matter (prefix rules only). */
function shouldSkipMatterRegistration(
  deviceName: string,
  opts: {
    ignoreSystemPrefixedDevices: boolean;
    ignoreNetworkPrefixedDevices: boolean;
  },
): boolean {
  return (
    appliesSystemPrefixedSkip(deviceName, opts.ignoreSystemPrefixedDevices) ||
    appliesNetworkPrefixedSkip(deviceName, opts.ignoreNetworkPrefixedDevices)
  );
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

/**
 *
 * @param matterbridge
 * @param log
 * @param config
 */
export default function initializePlugin(
  matterbridge: PlatformMatterbridge,
  log: AnsiLogger,
  config: PlatformConfig,
): WirenboardPlatform {
  return new WirenboardPlatform(matterbridge, log, config);
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export class WirenboardPlatform extends MatterbridgeDynamicPlatform {
  public readonly mqtt: WirenboardMqtt;

  /** WB devices discovered via MQTT retained messages */
  public readonly deviceMap: Map<string, WbDevice> = new Map();

  /** Registered Matter devices keyed by WB device name */
  public readonly wbDevices: Map<string, WirenboardDevice> = new Map();

  /** Cache of last control values: key = 'deviceName/controlName' */
  public readonly controlValueCache: Map<string, string> = new Map();

  /** Timestamp of the last device-meta or control-meta event (for idle detection) */
  public lastMetaTimestamp = 0;

  public shouldStart = false;
  public shouldConfigure = false;

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    config: PlatformConfig,
  ) {
    super(matterbridge, log, config);

    // Verify Matterbridge version
    if (
      this.verifyMatterbridgeVersion === undefined ||
      typeof this.verifyMatterbridgeVersion !== "function" ||
      !this.verifyMatterbridgeVersion("3.7.0")
    ) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.7.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    // Build MQTT config from platform config
    const mqttConfig: WirenboardMqttConfig = {
      mqttHost: (config["mqttHost"] as string | undefined) ?? "localhost",
      mqttPort: config["mqttPort"] as number | undefined,
      mqttProtocol:
        (config["mqttProtocol"] as WirenboardMqttConfig["mqttProtocol"]) ??
        "mqtt",
      mqttUsername: config["mqttUsername"] as string | undefined,
      mqttPassword: config["mqttPassword"] as string | undefined,
      mqttCaPath: config["mqttCaPath"] as string | undefined,
      mqttCertPath: config["mqttCertPath"] as string | undefined,
      mqttKeyPath: config["mqttKeyPath"] as string | undefined,
    };

    this.mqtt = new WirenboardMqtt(mqttConfig, this.log);

    // Subscribe to MQTT events — data accumulates before onStart
    this.mqtt.on("device-meta", (evt: DeviceMetaEvent) =>
      this.onDeviceMeta(evt),
    );
    this.mqtt.on("control-meta", (evt: ControlMetaEvent) =>
      this.onControlMeta(evt),
    );
    this.mqtt.on("control-value", (evt: ControlValueEvent) =>
      this.onControlValue(evt),
    );
    this.mqtt.on("control-error", (evt: ControlErrorEvent) =>
      this.onControlError(evt),
    );
    this.mqtt.on("device-error", (evt: DeviceErrorEvent) =>
      this.onDeviceError(evt),
    );
    this.mqtt.on("device-removed", (evt: DeviceRemovedEvent) =>
      this.onDeviceRemoved(evt),
    );
    this.mqtt.on("mqtt_connect", () => this.onMqttConnect());
    this.mqtt.on("mqtt_disconnect", () => this.onMqttDisconnect());

    this.shouldStart = false;
    this.shouldConfigure = false;

    // Start MQTT connection — retained messages arrive immediately
    this.mqtt.start().catch((err: Error) => {
      this.log.error(`MQTT start failed: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`onStart called: ${reason ?? "none"}`);

    // Always first — wait for storage and selects initialization
    await this.ready;
    await this.clearSelect();

    this.shouldStart = true;

    const maxTimeout =
      ((this.config["discoveryTimeout"] as number | undefined) ?? 30) * 1000;

    if (
      this.config["discoveryMode"] === "static" &&
      Array.isArray(this.config["devices"])
    ) {
      // Static mode: wait for each named device to appear in deviceMap
      const deviceNames = this.config["devices"] as string[];
      for (const deviceName of deviceNames) {
        const ok = await waiter(
          `device ${deviceName}`,
          () => this.deviceMap.has(deviceName),
          false,
          maxTimeout,
          500,
          false,
        );
        if (!ok) {
          this.log.warn(
            `Static discovery: timeout waiting for device '${deviceName}'`,
          );
        }
      }
    } else {
      // Auto mode: idle-based waiter
      const idleMs =
        (this.config["discoveryIdleMs"] as number | undefined) ?? 1000;

      const ok = await waiter(
        "WB discovery",
        () =>
          this.deviceMap.size > 0 &&
          Date.now() - this.lastMetaTimestamp > idleMs,
        false,
        maxTimeout,
        200,
        false,
      );

      if (!ok) {
        this.log.warn(
          `Discovery timeout after ${maxTimeout}ms. Registering ${this.deviceMap.size} devices found so far.`,
        );
      }
    }

    await this.registerDiscoveredDevices();

    // Enable live MQTT→Matter updates immediately after registration.
    // Matter server starts asynchronously after onStart() returns, so we cannot call
    // setAttribute here — endpoints don't have matter.js node assignments yet.
    // Retained values are replayed in onConfigure() once the server is running.
    this.shouldConfigure = true;
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.shouldConfigure = true;
    this.log.info("onConfigure called");

    // Authoritative replay: matter.js may have restored stale persisted attribute
    // values when the server started (between onStart and this onConfigure call).
    // Replaying here ensures fresh MQTT values override any stale persisted state.
    this.replayRetainedValues();

    // coverDevice: set target as current and stopped
    for (const wbDevice of this.wbDevices.values()) {
      for (const endpoint of wbDevice.endpoints) {
        if (endpoint.deviceType === coverDevice.code) {
          try {
            const ep = endpoint as EndpointWithWindowCovering;
            if (
              typeof ep.setWindowCoveringTargetAsCurrentAndStopped ===
              "function"
            ) {
              await ep.setWindowCoveringTargetAsCurrentAndStopped();
            }
          } catch {
            // ignore if not available
          }
        }

        // extendedColorLight: init colorMode to CurrentHueAndCurrentSaturation
        if (endpoint.deviceType === extendedColorLight.code) {
          await endpoint
            .setAttribute(
              ColorControl.Cluster.id,
              "colorMode",
              ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
              this.log,
            )
            .catch(() => {
              /* ignore */
            });
        }
      }
    }
  }

  override async onShutdown(reason?: string): Promise<void> {
    await super.onShutdown(reason);
    await this.mqtt.stop();
    this.log.info(`onShutdown called: ${reason ?? "none"}`);
    if (this.config["unregisterOnShutdown"] === true) {
      await this.unregisterAllDevices();
    }
  }

  // ---------------------------------------------------------------------------
  // Device registration
  // ---------------------------------------------------------------------------

  private async registerDiscoveredDevices(): Promise<void> {
    // Failsafe check
    const failsafeCount = this.config["failsafeCount"] as number | undefined;
    if (
      failsafeCount !== undefined &&
      failsafeCount > 0 &&
      this.deviceMap.size < failsafeCount
    ) {
      const ok = await waiter(
        "failsafe",
        () => this.deviceMap.size >= failsafeCount,
        false,
        60000,
        1000,
        false,
      );
      if (!ok) {
        throw new Error(
          `Failsafe: only ${this.deviceMap.size} devices found, failsafeCount=${failsafeCount}`,
        );
      }
    }

    const groupingMode: GroupingMode =
      (this.config["groupingMode"] as GroupingMode | undefined) ?? "device";
    const includeHidden =
      (this.config["includeHidden"] as boolean | undefined) ?? false;
    const ignoreSystemPrefixedDevices =
      (this.config["ignoreSystemPrefixedDevices"] as boolean | undefined) ??
      true;
    const ignoreNetworkPrefixedDevices =
      (this.config["ignoreNetworkPrefixedDevices"] as boolean | undefined) ??
      true;
    const deviceOverridesConfig = this.config["deviceOverrides"] as
      | Record<string, Record<string, unknown>>
      | undefined;

    const deviceNames = [...this.deviceMap.keys()].sort(
      compareCanonicalControlNames,
    );
    for (const name of deviceNames) {
      const wbDevice = this.deviceMap.get(name);
      if (!wbDevice) continue;
      await this.registerWbDevice(
        wbDevice,
        groupingMode,
        includeHidden,
        ignoreSystemPrefixedDevices,
        ignoreNetworkPrefixedDevices,
        deviceOverridesConfig,
      );
    }
  }

  private async registerWbDevice(
    wbDevice: WbDevice,
    groupingMode: GroupingMode,
    includeHidden: boolean,
    ignoreSystemPrefixedDevices: boolean,
    ignoreNetworkPrefixedDevices: boolean,
    deviceOverridesConfig: Record<string, Record<string, unknown>> | undefined,
  ): Promise<void> {
    if (!wbDevice.name) return;

    const skipOpts = {
      ignoreSystemPrefixedDevices,
      ignoreNetworkPrefixedDevices,
    };
    if (shouldSkipMatterRegistration(wbDevice.name, skipOpts)) {
      if (
        appliesSystemPrefixedSkip(wbDevice.name, ignoreSystemPrefixedDevices)
      ) {
        this.log.debug(
          `Skipping Matter registration for Wirenboard service device ${wbDevice.name} (ignoreSystemPrefixedDevices)`,
        );
      } else {
        this.log.debug(
          `Skipping Matter registration for Wirenboard device ${wbDevice.name} (ignoreNetworkPrefixedDevices)`,
        );
      }
      return;
    }

    // Check if at least one control has a mapping
    const hasMappable = [...wbDevice.controls.values()].some((ctrl) =>
      findMapping(ctrl.meta, ctrl.name),
    );
    if (!hasMappable) {
      this.log.info(
        `No mappable controls for device ${wbDevice.name} — skipping`,
      );
      return;
    }

    const deviceTitle =
      typeof wbDevice.meta.title === "string"
        ? wbDevice.meta.title || wbDevice.name
        : wbDevice.meta.title.en || wbDevice.name;

    const serial = wbDevice.name;

    // Register device in whitelist/blacklist UI
    this.setSelectDevice(serial, deviceTitle);

    // Register controls for entity whitelist/blacklist UI (canonical order)
    for (const ctrl of sortedControlsByCanonicalName(wbDevice.controls)) {
      const ctrlTitle = ctrl.meta.title
        ? typeof ctrl.meta.title === "string"
          ? ctrl.meta.title
          : ctrl.meta.title.en
        : ctrl.name;
      this.setSelectDeviceEntity(
        serial,
        ctrl.name,
        ctrlTitle ?? ctrl.name,
        "control",
      );
    }

    // Validate whitelist/blacklist
    if (!this.validateDevice([deviceTitle, serial])) return;

    // Resolve device-level overrides
    const deviceOverrides = deviceOverridesConfig?.[wbDevice.name] as
      | DeviceOverrides
      | undefined;

    // Create WirenboardDevice (builds all endpoints)
    let wbDev: WirenboardDevice;
    try {
      wbDev = await WirenboardDevice.create(
        this.log,
        wbDevice,
        this.mqtt,
        groupingMode,
        this.matterbridge.aggregatorVendorId,
        includeHidden,
        ignoreSystemPrefixedDevices,
        deviceOverrides,
      );
    } catch (err) {
      this.log.error(
        `Failed to create WirenboardDevice for ${wbDevice.name}: ${String(err)}`,
      );
      return;
    }

    if (wbDev.endpoints.length === 0) {
      this.log.info(
        `WirenboardDevice ${wbDevice.name} produced no endpoints — skipping`,
      );
      return;
    }

    // Determine dominant type for Matterbridge UI label
    const dominantType = this.getDominantType(wbDevice);

    const mqttHost =
      (this.config["mqttHost"] as string | undefined) ?? "localhost";
    const wirenboardUrlRaw = this.config["wirenboardUrl"] as string | undefined;
    const wirenboardUrlTrimmed =
      typeof wirenboardUrlRaw === "string" ? wirenboardUrlRaw.trim() : "";
    const resolvedConfigUrl =
      wirenboardUrlTrimmed.length > 0
        ? wirenboardUrlTrimmed
        : `http://${mqttHost}`;

    // Register all endpoints
    for (const endpoint of wbDev.endpoints) {
      endpoint.configUrl = resolvedConfigUrl;
      await endpoint.addFixedLabel("composed", dominantType);

      // Warn about device types unsupported in Apple Home
      const appleUnsupported = [
        "waterValve",
        "pressureSensor",
        "flowSensor",
        "electricalSensor",
        "airQualitySensor",
        "smokeCoAlarm",
      ];
      const devTypeName =
        endpoint.deviceType !== undefined
          ? appleUnsupported.find(
              (n) =>
                n.toLowerCase() === String(endpoint.deviceType).toLowerCase(),
            )
          : undefined;
      if (devTypeName) {
        this.log.warn(
          `Device type '${devTypeName}' for ${wbDevice.name} may not be supported by Apple Home`,
        );
      }

      try {
        await this.registerDevice(endpoint);
      } catch (err) {
        this.log.error(
          `Failed to register endpoint for ${wbDevice.name}: ${String(err)}`,
        );
      }
    }

    this.wbDevices.set(wbDevice.name, wbDev);
    this.log.info(
      `Registered WB device: ${wbDevice.name} (${wbDev.endpoints.length} endpoints)`,
    );
  }

  private replayRetainedValues(): void {
    for (const [key, value] of this.controlValueCache) {
      const slash = key.indexOf("/");
      if (slash === -1) continue;
      const deviceName = key.substring(0, slash);
      const controlName = key.substring(slash + 1);
      const wbDevice = this.wbDevices.get(deviceName);
      if (wbDevice) {
        wbDevice.updateFromMqtt(controlName, value);
      }
    }
  }

  private async registerNewDevice(wbDevice: WbDevice): Promise<void> {
    const groupingMode: GroupingMode =
      (this.config["groupingMode"] as GroupingMode | undefined) ?? "device";
    const includeHidden =
      (this.config["includeHidden"] as boolean | undefined) ?? false;
    const ignoreSystemPrefixedDevices =
      (this.config["ignoreSystemPrefixedDevices"] as boolean | undefined) ??
      true;
    const ignoreNetworkPrefixedDevices =
      (this.config["ignoreNetworkPrefixedDevices"] as boolean | undefined) ??
      true;
    const deviceOverridesConfig = this.config["deviceOverrides"] as
      | Record<string, Record<string, unknown>>
      | undefined;

    await this.registerWbDevice(
      wbDevice,
      groupingMode,
      includeHidden,
      ignoreSystemPrefixedDevices,
      ignoreNetworkPrefixedDevices,
      deviceOverridesConfig,
    );
  }

  // ---------------------------------------------------------------------------
  // MQTT event handlers
  // ---------------------------------------------------------------------------

  private onDeviceMeta(evt: DeviceMetaEvent): void {
    this.lastMetaTimestamp = Date.now();
    const existing = this.deviceMap.get(evt.deviceName);
    if (existing) {
      existing.meta = evt.meta;
    } else {
      this.deviceMap.set(evt.deviceName, {
        name: evt.deviceName,
        meta: evt.meta,
        controls: new Map(),
      });
      // Dynamic registration: if onStart already ran, register new device immediately
      if (this.shouldStart) {
        const newDevice = this.deviceMap.get(evt.deviceName);
        if (newDevice) {
          this.registerNewDevice(newDevice).catch((err: Error) => {
            this.log.error(
              `Dynamic registration failed for ${evt.deviceName}: ${err.message}`,
            );
          });
        }
      }
    }
  }

  private onControlMeta(evt: ControlMetaEvent): void {
    this.lastMetaTimestamp = Date.now();
    let device = this.deviceMap.get(evt.deviceName);
    if (!device) {
      // Device meta not yet received — create placeholder
      device = {
        name: evt.deviceName,
        meta: { driver: "", title: evt.deviceName },
        controls: new Map(),
      };
      this.deviceMap.set(evt.deviceName, device);
    }

    const existing = device.controls.get(evt.controlName);
    if (existing) {
      // Merge: Wirenboard may publish full JSON on .../meta first, then retained
      // .../meta/type (legacy) emits a partial object without units — replacing
      // the whole meta would drop units and break value-channel mapping.
      const prevType = existing.meta.type;
      const merged: WbControlMeta = { ...existing.meta, ...evt.meta };
      const typeChanged = prevType !== merged.type;
      existing.meta = merged;

      if (typeChanged && this.shouldStart) {
        this.log.warn(
          `Control type changed for ${evt.deviceName}/${evt.controlName}: was '${prevType}', now '${merged.type}'. Endpoint recreation not yet implemented.`,
        );
      }
    } else {
      device.controls.set(evt.controlName, {
        name: evt.controlName,
        meta: evt.meta,
        value: undefined,
        error: undefined,
      });
    }
  }

  private onControlValue(evt: ControlValueEvent): void {
    // Always cache the latest value
    this.controlValueCache.set(
      `${evt.deviceName}/${evt.controlName}`,
      evt.value,
    );

    // Also update the device model
    const device = this.deviceMap.get(evt.deviceName);
    if (device) {
      const control = device.controls.get(evt.controlName);
      if (control) control.value = evt.value;
    }

    // If configured — update Matter attribute directly
    if (this.shouldConfigure) {
      const wbDev = this.wbDevices.get(evt.deviceName);
      if (wbDev) {
        wbDev.updateFromMqtt(evt.controlName, evt.value);
      }
    }
  }

  private onControlError(evt: ControlErrorEvent): void {
    const device = this.deviceMap.get(evt.deviceName);
    if (device) {
      const control = device.controls.get(evt.controlName);
      if (control) control.error = evt.error;
    }

    const wbDev = this.wbDevices.get(evt.deviceName);
    if (evt.error === "") {
      // Error cleared → restore reachability
      if (wbDev) wbDev.setReachable(true);
    } else if (evt.error === "r" || evt.error === "rp") {
      // Read error → unreachable
      if (wbDev) wbDev.setReachable(false);
    } else if (evt.error.includes("w")) {
      // Write error → log warning only
      this.log.warn(`Write error on ${evt.deviceName}/${evt.controlName}`);
    } else if (evt.error.includes("p")) {
      // Poll miss → log debug only
      this.log.debug(`Poll miss on ${evt.deviceName}/${evt.controlName}`);
    }
  }

  private onDeviceError(evt: DeviceErrorEvent): void {
    this.log.warn(`Device error for ${evt.deviceName}: ${evt.error}`);
    const wbDev = this.wbDevices.get(evt.deviceName);
    if (wbDev) {
      wbDev.setReachable(false);
    }
  }

  private onDeviceRemoved(evt: DeviceRemovedEvent): void {
    this.log.info(`Device removed: ${evt.deviceName}`);
    this.deviceMap.delete(evt.deviceName);

    const wbDev = this.wbDevices.get(evt.deviceName);
    if (wbDev) {
      for (const endpoint of wbDev.endpoints) {
        this.unregisterDevice(endpoint).catch((err: Error) => {
          this.log.error(
            `Failed to unregister endpoint for ${evt.deviceName}: ${err.message}`,
          );
        });
      }
      this.wbDevices.delete(evt.deviceName);
    }
  }

  private onMqttDisconnect(): void {
    this.log.warn("MQTT disconnected — marking all devices unreachable");
    for (const wbDev of this.wbDevices.values()) {
      wbDev.setReachable(false);
    }
  }

  private onMqttConnect(): void {
    this.log.info("MQTT connected — marking all devices reachable");
    for (const wbDev of this.wbDevices.values()) {
      wbDev.setReachable(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Reachability helper (for direct endpoint access when WirenboardDevice not yet created)
  // ---------------------------------------------------------------------------

  /**
   * Determine the dominant Matter device type for a WB device based on control counts.
   * Returns a UI label string: 'Light', 'Switch', 'Sensor', 'Cover', or 'Climate'.
   *
   * @param wbDevice
   */
  private getDominantType(wbDevice: WbDevice): string {
    const counts = { Light: 0, Switch: 0, Sensor: 0, Cover: 0, Climate: 0 };

    for (const [, ctrl] of wbDevice.controls) {
      const mapping = findMapping(ctrl.meta, ctrl.name);
      if (!mapping) continue;
      const typeName = mapping.matterDeviceType.name?.toLowerCase() ?? "";
      if (
        typeName.includes("light") ||
        typeName.includes("dimm") ||
        typeName.includes("color")
      ) {
        counts.Light++;
      } else if (typeName.includes("cover") || typeName.includes("window")) {
        counts.Cover++;
      } else if (typeName.includes("thermostat") || typeName.includes("fan")) {
        counts.Climate++;
      } else if (
        typeName.includes("sensor") ||
        typeName.includes("air") ||
        typeName.includes("humidity") ||
        typeName.includes("temp")
      ) {
        counts.Sensor++;
      } else {
        counts.Switch++;
      }
    }

    let dominant: string = "Switch";
    let max = 0;
    for (const [type, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        dominant = type;
      }
    }
    return dominant;
  }
}
