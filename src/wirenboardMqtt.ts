/**
 * WirenboardMqtt — MQTT client for Wirenboard devices.
 * Subscribes to /devices/# and emits parsed events.
 *
 * @file wirenboardMqtt.ts
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

import { connectAsync, IClientOptions, MqttClient } from 'mqtt';
import { AnsiLogger } from 'matterbridge/logger';

import { WbControlMeta, WbDeviceMeta } from './wirenboardTypes.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WirenboardMqttConfig {
  mqttHost: string;
  mqttPort?: number;
  mqttProtocol?: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  mqttUsername?: string;
  mqttPassword?: string;
  mqttCaPath?: string;
  mqttCertPath?: string;
  mqttKeyPath?: string;
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface DeviceMetaEvent {
  deviceName: string;
  meta: WbDeviceMeta;
}

export interface DeviceRemovedEvent {
  deviceName: string;
}

export interface ControlMetaEvent {
  deviceName: string;
  controlName: string;
  meta: WbControlMeta;
}

export interface ControlValueEvent {
  deviceName: string;
  controlName: string;
  value: string;
}

export interface ControlErrorEvent {
  deviceName: string;
  controlName: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Regex patterns for topic parsing
// ---------------------------------------------------------------------------

const RE_DEVICE_META = /^\/devices\/([^/]+)\/meta$/;
const RE_DEVICE_META_ERROR = /^\/devices\/([^/]+)\/meta\/error$/;
const RE_DEVICE_META_SUBTOPIC = /^\/devices\/([^/]+)\/meta\/([^/]+)$/;
const RE_CONTROL_META = /^\/devices\/([^/]+)\/controls\/([^/]+)\/meta$/;
const RE_CONTROL_META_ERROR = /^\/devices\/([^/]+)\/controls\/([^/]+)\/meta\/error$/;
const RE_CONTROL_META_SUBTOPIC = /^\/devices\/([^/]+)\/controls\/([^/]+)\/meta\/([^/]+)$/;
const RE_CONTROL_VALUE = /^\/devices\/([^/]+)\/controls\/([^/]+)$/;
const RE_CONTROL_ON = /^\/devices\/([^/]+)\/controls\/([^/]+)\/on$/;

// ---------------------------------------------------------------------------
// WirenboardMqtt class
// ---------------------------------------------------------------------------

export class WirenboardMqtt extends EventEmitter {
  private readonly log: AnsiLogger;
  private readonly config: WirenboardMqttConfig;
  private client: MqttClient | undefined;
  private isConnected = false;
  private isEnding = false;

  /** Accumulated partial legacy subtopic meta keyed by deviceName */
  private legacyDeviceMeta: Map<string, Partial<WbDeviceMeta>> = new Map();
  /** Accumulated partial legacy subtopic meta keyed by `deviceName/controlName` */
  private legacyControlMeta: Map<string, Partial<WbControlMeta>> = new Map();

  constructor(config: WirenboardMqttConfig, log: AnsiLogger) {
    super();
    this.config = config;
    this.log = log;
  }

  // ---------------------------------------------------------------------------
  // start / stop
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    const { mqttHost, mqttPort, mqttProtocol = 'mqtt', mqttUsername, mqttPassword } = this.config;

    const port = mqttPort ?? (mqttProtocol === 'mqtts' || mqttProtocol === 'wss' ? 8883 : 1883);
    const url = `${mqttProtocol}://${mqttHost}:${port}`;

    const options: IClientOptions = {
      clientId: 'matterbridge_wb_' + crypto.randomBytes(8).toString('hex'),
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 60_000,
      username: mqttUsername,
      password: mqttPassword,
      clean: true,
    };

    if (mqttProtocol === 'mqtts' || mqttProtocol === 'wss') {
      if (this.config.mqttCaPath) options.ca = fs.readFileSync(this.config.mqttCaPath);
      if (this.config.mqttCertPath) options.cert = fs.readFileSync(this.config.mqttCertPath);
      if (this.config.mqttKeyPath) options.key = fs.readFileSync(this.config.mqttKeyPath);
    }

    this.log.info(`Connecting to MQTT broker at ${url}`);

    this.client = await connectAsync(url, options);

    this.client.on('connect', () => {
      this.isConnected = true;
      this.log.info('MQTT connected');
      this.emit('mqtt_connect');
    });

    this.client.on('reconnect', () => {
      this.log.debug('MQTT reconnecting...');
    });

    this.client.on('disconnect', () => {
      this.isConnected = false;
      this.log.warn('MQTT disconnected');
      this.emit('mqtt_disconnect');
    });

    this.client.on('close', () => {
      if (!this.isEnding) {
        this.isConnected = false;
        this.log.warn('MQTT connection closed');
        this.emit('mqtt_disconnect');
      }
    });

    this.client.on('error', (err) => {
      this.log.error(`MQTT error: ${err.message}`);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.messageHandler(topic, payload.toString());
    });

    await this.client.subscribeAsync('/devices/#');
    this.log.info('Subscribed to /devices/#');
  }

  async stop(): Promise<void> {
    this.isEnding = true;
    if (this.client) {
      await this.client.endAsync();
      this.client = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // publish
  // ---------------------------------------------------------------------------

  async publish(deviceName: string, controlName: string, value: string): Promise<void> {
    const topic = `/devices/${deviceName}/controls/${controlName}/on`;
    if (!this.client || !this.isConnected) {
      this.log.warn(`MQTT not connected, cannot publish to ${topic}`);
      return;
    }
    await this.client.publishAsync(topic, value, { retain: false });
  }

  // ---------------------------------------------------------------------------
  // messageHandler — public for testing
  // ---------------------------------------------------------------------------

  messageHandler(topic: string, payload: string): void {
    const isEmpty = payload === '';

    // /devices/<name>/meta
    let m = RE_DEVICE_META.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      if (isEmpty) {
        this.emit('device-removed', { deviceName } satisfies DeviceRemovedEvent);
        return;
      }
      if (payload.startsWith('{')) {
        try {
          const meta = JSON.parse(payload) as WbDeviceMeta;
          this.emit('device-meta', { deviceName, meta } satisfies DeviceMetaEvent);
        } catch {
          this.log.warn(`Failed to parse device meta JSON for ${deviceName}`);
        }
      }
      return;
    }

    // /devices/<name>/meta/error
    m = RE_DEVICE_META_ERROR.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      this.emit('device-error', { deviceName, error: payload });
      return;
    }

    // /devices/<name>/meta/<subtopic> — legacy meta field
    m = RE_DEVICE_META_SUBTOPIC.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      const field = m[2]!;
      const current = this.legacyDeviceMeta.get(deviceName) ?? {};
      if (field === 'name') (current as Record<string, unknown>)['title'] = payload;
      this.legacyDeviceMeta.set(deviceName, current);
      return;
    }

    // /devices/<name>/controls/<ctrl>/meta
    m = RE_CONTROL_META.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      const controlName = m[2]!;
      if (isEmpty) {
        this.emit('control-removed', { deviceName, controlName });
        return;
      }
      if (payload.startsWith('{')) {
        try {
          const meta = JSON.parse(payload) as WbControlMeta;
          this.emit('control-meta', { deviceName, controlName, meta } satisfies ControlMetaEvent);
        } catch {
          this.log.warn(`Failed to parse control meta JSON for ${deviceName}/${controlName}`);
        }
      }
      return;
    }

    // /devices/<name>/controls/<ctrl>/meta/error
    m = RE_CONTROL_META_ERROR.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      const controlName = m[2]!;
      this.emit('control-error', { deviceName, controlName, error: payload } satisfies ControlErrorEvent);
      return;
    }

    // /devices/<name>/controls/<ctrl>/meta/<subtopic> — legacy meta field
    m = RE_CONTROL_META_SUBTOPIC.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      const controlName = m[2]!;
      const field = m[3]!;
      const key = `${deviceName}/${controlName}`;
      const current = this.legacyControlMeta.get(key) ?? {};
      switch (field) {
        case 'type':
          (current as Record<string, unknown>)['type'] = payload;
          break;
        case 'max':
          (current as Record<string, unknown>)['max'] = parseFloat(payload);
          break;
        case 'min':
          (current as Record<string, unknown>)['min'] = parseFloat(payload);
          break;
        case 'order':
          (current as Record<string, unknown>)['order'] = parseInt(payload, 10);
          break;
        case 'readonly':
          (current as Record<string, unknown>)['readonly'] = payload === '1';
          break;
        case 'units':
          (current as Record<string, unknown>)['units'] = payload;
          break;
        default:
          break;
      }
      this.legacyControlMeta.set(key, current);

      // Emit after type is set (minimum required field)
      if ((current as Record<string, unknown>)['type']) {
        this.emit('control-meta', {
          deviceName,
          controlName,
          meta: current as WbControlMeta,
        } satisfies ControlMetaEvent);
      }
      return;
    }

    // /devices/<name>/controls/<ctrl>/on — ignore (our own commands)
    if (RE_CONTROL_ON.test(topic)) return;

    // /devices/<name>/controls/<ctrl> — control value
    m = RE_CONTROL_VALUE.exec(topic);
    if (m) {
      const deviceName = m[1]!;
      const controlName = m[2]!;
      if (isEmpty) {
        this.emit('control-removed', { deviceName, controlName });
        return;
      }
      this.emit('control-value', { deviceName, controlName, value: payload } satisfies ControlValueEvent);
      return;
    }
  }
}
