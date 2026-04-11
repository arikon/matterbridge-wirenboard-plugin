/**
 * WirenboardPlatform — Matterbridge dynamic platform plugin for Wirenboard.
 * Implements Phase C: minimal switch → onOffOutlet support.
 *
 * @file module.ts
 */

import {
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  onOffOutlet,
  PlatformConfig,
  PlatformMatterbridge,
} from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';

import { findMapping } from './controlMapping.js';
import { WbControl, WbControlMeta, WbDevice, WbDeviceMeta } from './wirenboardTypes.js';
import {
  ControlErrorEvent,
  ControlMetaEvent,
  ControlValueEvent,
  DeviceMetaEvent,
  WirenboardMqtt,
  WirenboardMqttConfig,
} from './wirenboardMqtt.js';

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

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
  private readonly mqtt: WirenboardMqtt;

  /** WB devices discovered via MQTT retained messages */
  private readonly deviceMap: Map<string, WbDevice> = new Map();

  /** Timestamp of the last device-meta or control-meta event */
  private lastMetaTimestamp = 0;

  private shouldRegister = false;
  private shouldConfigure = false;

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    if (
      this.verifyMatterbridgeVersion === undefined ||
      typeof this.verifyMatterbridgeVersion !== 'function' ||
      !this.verifyMatterbridgeVersion('3.4.0')
    ) {
      throw new Error(
        `This plugin requires Matterbridge >= "3.4.0". Current version: ${this.matterbridge.matterbridgeVersion}`,
      );
    }

    const mqttConfig: WirenboardMqttConfig = {
      mqttHost: (config['mqttHost'] as string | undefined) ?? 'localhost',
      mqttPort: config['mqttPort'] as number | undefined,
      mqttProtocol: (config['mqttProtocol'] as WirenboardMqttConfig['mqttProtocol']) ?? 'mqtt',
      mqttUsername: config['mqttUsername'] as string | undefined,
      mqttPassword: config['mqttPassword'] as string | undefined,
    };

    this.mqtt = new WirenboardMqtt(mqttConfig, this.log);

    // Subscribe to MQTT events — data accumulates before onStart
    this.mqtt.on('device-meta', (evt: DeviceMetaEvent) => this.onDeviceMeta(evt));
    this.mqtt.on('control-meta', (evt: ControlMetaEvent) => this.onControlMeta(evt));
    this.mqtt.on('control-value', (evt: ControlValueEvent) => this.onControlValue(evt));
    this.mqtt.on('control-error', (evt: ControlErrorEvent) => this.onControlError(evt));

    // Start MQTT connection — retained messages arrive immediately
    this.mqtt.start().catch((err: Error) => {
      this.log.error(`MQTT start failed: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`onStart called: ${reason ?? 'none'}`);

    await this.ready;
    await this.clearSelect();

    this.shouldRegister = true;

    // Wait for discovery to idle (devices found AND quiet for idleThreshold ms)
    const idleThreshold = (config: PlatformConfig) =>
      (config['discoveryIdleMs'] as number | undefined) ?? 1000;
    const maxTimeout = ((this.config['discoveryTimeout'] as number | undefined) ?? 30) * 1000;

    const isDiscoveryIdle = (): boolean => {
      return (
        this.deviceMap.size > 0 && Date.now() - this.lastMetaTimestamp > idleThreshold(this.config)
      );
    };

    const waited = await this.waitForDiscovery(isDiscoveryIdle, maxTimeout, 200);
    if (!waited) {
      this.log.warn(`Discovery timeout after ${maxTimeout}ms. Registering ${this.deviceMap.size} devices found so far.`);
    }

    await this.registerDevices();
    this.shouldConfigure = false;
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.shouldConfigure = true;
    this.log.info('onConfigure called');
  }

  override async onShutdown(reason?: string): Promise<void> {
    await super.onShutdown(reason);
    await this.mqtt.stop();
    this.log.info(`onShutdown called: ${reason ?? 'none'}`);
    if (this.config['unregisterOnShutdown'] === true) {
      await this.unregisterAllDevices();
    }
  }

  // ---------------------------------------------------------------------------
  // Discovery waiter helper
  // ---------------------------------------------------------------------------

  private async waitForDiscovery(
    predicate: () => boolean,
    timeout: number,
    interval: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await new Promise<void>((resolve) => setTimeout(resolve, interval));
    }
    return predicate();
  }

  // ---------------------------------------------------------------------------
  // Device registration — Phase C: only switch → onOffOutlet
  // ---------------------------------------------------------------------------

  private async registerDevices(): Promise<void> {
    for (const [, wbDevice] of this.deviceMap) {
      // Find switch controls only (Phase C minimal)
      const switchControls = [...wbDevice.controls.values()].filter(
        (ctrl) => {
          const m = findMapping(ctrl.meta, ctrl.name);
          return m?.matterDeviceType === onOffOutlet;
        },
      );

      if (switchControls.length === 0) continue;

      // Create one bridged device per WB device with switch controls
      const deviceTitle =
        typeof wbDevice.meta.title === 'string'
          ? wbDevice.meta.title
          : (wbDevice.meta.title.en ?? wbDevice.name);

      for (const ctrl of switchControls) {
        const uniqueId = `${wbDevice.name}_${ctrl.name}`;
        const endpoint = new MatterbridgeEndpoint(onOffOutlet, { id: uniqueId })
          .createDefaultBridgedDeviceBasicInformationClusterServer(
            `${deviceTitle} — ${ctrl.name}`,
            uniqueId,
            this.matterbridge.aggregatorVendorId,
            'Wirenboard',
            'WB Switch',
            1,
            '1.0.0',
          )
          .addRequiredClusterServers()
          .addCommandHandler('on', () => {
            this.mqtt.publish(wbDevice.name, ctrl.name, '1').catch((err: Error) => {
              this.log.error(`publish on failed: ${err.message}`);
            });
          })
          .addCommandHandler('off', () => {
            this.mqtt.publish(wbDevice.name, ctrl.name, '0').catch((err: Error) => {
              this.log.error(`publish off failed: ${err.message}`);
            });
          });

        this.setSelectDevice(uniqueId, `${deviceTitle} — ${ctrl.name}`);
        const selected = this.validateDevice([uniqueId]);
        if (selected) {
          await this.registerDevice(endpoint);
          this.log.info(`Registered switch: ${wbDevice.name}/${ctrl.name}`);
        }
      }
    }
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
    }
  }

  private onControlMeta(evt: ControlMetaEvent): void {
    this.lastMetaTimestamp = Date.now();
    let device = this.deviceMap.get(evt.deviceName);
    if (!device) {
      // Device meta not yet received — create placeholder
      device = {
        name: evt.deviceName,
        meta: { driver: '', title: evt.deviceName },
        controls: new Map(),
      };
      this.deviceMap.set(evt.deviceName, device);
    }
    const existing = device.controls.get(evt.controlName);
    if (existing) {
      existing.meta = evt.meta;
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
    const device = this.deviceMap.get(evt.deviceName);
    if (!device) return;
    const control = device.controls.get(evt.controlName);
    if (!control) return;
    control.value = evt.value;

    // If already configured — update Matter attribute
    if (this.shouldConfigure) {
      this.applyControlValue(device, control);
    }
  }

  private onControlError(evt: ControlErrorEvent): void {
    const device = this.deviceMap.get(evt.deviceName);
    if (!device) return;
    const control = device.controls.get(evt.controlName);
    if (control) control.error = evt.error;
  }

  private applyControlValue(_device: WbDevice, _control: WbControl): void {
    // Full implementation in later steps (wirenboardDevice.ts).
    // Phase C: placeholder.
  }
}

