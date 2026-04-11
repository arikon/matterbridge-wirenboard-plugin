/**
 * Unit tests for WirenboardMqtt.messageHandler — topic parsing.
 * Uses mock retained-messages.json for integration-style parsing test.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// We test messageHandler without a real MQTT connection.
// Stub the AnsiLogger to avoid side-effects.
import { WirenboardMqtt } from '../src/wirenboardMqtt.js';
import type { AnsiLogger } from 'matterbridge/logger';
import type {
  DeviceMetaEvent,
  ControlMetaEvent,
  ControlValueEvent,
  ControlErrorEvent,
} from '../src/wirenboardMqtt.js';

// ---------------------------------------------------------------------------
// Logger stub
// ---------------------------------------------------------------------------

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

// ---------------------------------------------------------------------------
// Factory: create a WirenboardMqtt without starting MQTT
// ---------------------------------------------------------------------------

function createMqtt(): WirenboardMqtt {
  return new WirenboardMqtt(
    { mqttHost: 'localhost' },
    mockLog,
  );
}

// ---------------------------------------------------------------------------
// device-meta
// ---------------------------------------------------------------------------

describe('messageHandler — device-meta', () => {
  it('parses /devices/<name>/meta JSON', () => {
    const mqtt = createMqtt();
    const received: DeviceMetaEvent[] = [];
    mqtt.on('device-meta', (evt: DeviceMetaEvent) => received.push(evt));

    mqtt.messageHandler(
      '/devices/wb-mr6c_28/meta',
      '{"driver":"wb-mr6c","title":{"en":"WB-MR6C 28","ru":"WB-MR6C 28"}}',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe('wb-mr6c_28');
    expect(received[0]!.meta.driver).toBe('wb-mr6c');
    expect((received[0]!.meta.title as { en: string }).en).toBe('WB-MR6C 28');
  });

  it('empty payload emits device-removed', () => {
    const mqtt = createMqtt();
    const removed: string[] = [];
    mqtt.on('device-removed', (evt: { deviceName: string }) => removed.push(evt.deviceName));

    mqtt.messageHandler('/devices/wb-mr6c_28/meta', '');

    expect(removed).toContain('wb-mr6c_28');
  });
});

// ---------------------------------------------------------------------------
// control-meta
// ---------------------------------------------------------------------------

describe('messageHandler — control-meta', () => {
  it('parses /devices/<name>/controls/<ctrl>/meta JSON', () => {
    const mqtt = createMqtt();
    const received: ControlMetaEvent[] = [];
    mqtt.on('control-meta', (evt: ControlMetaEvent) => received.push(evt));

    mqtt.messageHandler(
      '/devices/wb-mr6c_28/controls/K1/meta',
      '{"type":"switch","order":1,"readonly":false}',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe('wb-mr6c_28');
    expect(received[0]!.controlName).toBe('K1');
    expect(received[0]!.meta.type).toBe('switch');
    expect(received[0]!.meta.readonly).toBe(false);
  });

  it('empty payload emits control-removed', () => {
    const mqtt = createMqtt();
    const removed: Array<{ deviceName: string; controlName: string }> = [];
    mqtt.on('control-removed', (evt: { deviceName: string; controlName: string }) => removed.push(evt));

    mqtt.messageHandler('/devices/wb-mr6c_28/controls/K1/meta', '');

    expect(removed).toHaveLength(1);
    expect(removed[0]!.deviceName).toBe('wb-mr6c_28');
    expect(removed[0]!.controlName).toBe('K1');
  });
});

// ---------------------------------------------------------------------------
// control-value
// ---------------------------------------------------------------------------

describe('messageHandler — control-value', () => {
  it('parses /devices/<name>/controls/<ctrl> as value', () => {
    const mqtt = createMqtt();
    const received: ControlValueEvent[] = [];
    mqtt.on('control-value', (evt: ControlValueEvent) => received.push(evt));

    mqtt.messageHandler('/devices/wb-mr6c_28/controls/K1', '1');

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe('wb-mr6c_28');
    expect(received[0]!.controlName).toBe('K1');
    expect(received[0]!.value).toBe('1');
  });

  it('empty control value payload emits control-removed', () => {
    const mqtt = createMqtt();
    const removed: Array<{ deviceName: string; controlName: string }> = [];
    mqtt.on('control-removed', (evt: { deviceName: string; controlName: string }) => removed.push(evt));

    mqtt.messageHandler('/devices/wb-mr6c_28/controls/K1', '');

    expect(removed).toHaveLength(1);
  });

  it('ignores /on topics (own commands)', () => {
    const mqtt = createMqtt();
    const valueEvents: ControlValueEvent[] = [];
    mqtt.on('control-value', (evt: ControlValueEvent) => valueEvents.push(evt));

    mqtt.messageHandler('/devices/wb-mr6c_28/controls/K1/on', '1');

    expect(valueEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// control-error
// ---------------------------------------------------------------------------

describe('messageHandler — control-error', () => {
  it('parses /devices/<name>/controls/<ctrl>/meta/error', () => {
    const mqtt = createMqtt();
    const received: ControlErrorEvent[] = [];
    mqtt.on('control-error', (evt: ControlErrorEvent) => received.push(evt));

    mqtt.messageHandler('/devices/wb-mr6c_28/controls/K2/meta/error', 'r');

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe('wb-mr6c_28');
    expect(received[0]!.controlName).toBe('K2');
    expect(received[0]!.error).toBe('r');
  });

  it('empty error payload = no error', () => {
    const mqtt = createMqtt();
    const received: ControlErrorEvent[] = [];
    mqtt.on('control-error', (evt: ControlErrorEvent) => received.push(evt));

    mqtt.messageHandler('/devices/wb-mr6c_28/controls/K1/meta/error', '');

    expect(received).toHaveLength(1);
    expect(received[0]!.error).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Legacy subtopic meta
// ---------------------------------------------------------------------------

describe('messageHandler — legacy subtopic meta', () => {
  it('assembles control meta from individual subtopics', () => {
    const mqtt = createMqtt();
    const received: ControlMetaEvent[] = [];
    mqtt.on('control-meta', (evt: ControlMetaEvent) => received.push(evt));

    mqtt.messageHandler('/devices/wb-old/controls/temp/meta/type', 'value');
    mqtt.messageHandler('/devices/wb-old/controls/temp/meta/units', 'deg C');
    mqtt.messageHandler('/devices/wb-old/controls/temp/meta/max', '100');
    mqtt.messageHandler('/devices/wb-old/controls/temp/meta/readonly', '1');

    // Emits on every subtopic update once type is set
    expect(received.length).toBeGreaterThan(0);
    const last = received[received.length - 1]!;
    expect(last.deviceName).toBe('wb-old');
    expect(last.controlName).toBe('temp');
    expect(last.meta.type).toBe('value');
  });
});

// ---------------------------------------------------------------------------
// Retained messages integration — replay all mock messages
// ---------------------------------------------------------------------------

describe('retained-messages.json replay', () => {
  it('correctly parses all mock retained messages', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const jsonPath = path.join(__dirname, '../src/mock/retained-messages.json');
    const messages: Array<{ topic: string; payload: string }> = JSON.parse(
      readFileSync(jsonPath, 'utf-8'),
    );

    const mqtt = createMqtt();
    const deviceMetas: string[] = [];
    const controlMetas: string[] = [];
    const controlValues: string[] = [];

    mqtt.on('device-meta', (evt: DeviceMetaEvent) => deviceMetas.push(evt.deviceName));
    mqtt.on('control-meta', (evt: ControlMetaEvent) =>
      controlMetas.push(`${evt.deviceName}/${evt.controlName}`),
    );
    mqtt.on('control-value', (evt: ControlValueEvent) =>
      controlValues.push(`${evt.deviceName}/${evt.controlName}=${evt.value}`),
    );

    for (const msg of messages) {
      mqtt.messageHandler(msg.topic, msg.payload);
    }

    // Three devices discovered
    expect(deviceMetas).toContain('wb-mr6c_28');
    expect(deviceMetas).toContain('wb-msw-v3_42');
    expect(deviceMetas).toContain('wb-mdm3_07');

    // Controls meta parsed
    expect(controlMetas).toContain('wb-mr6c_28/K1');
    expect(controlMetas).toContain('wb-msw-v3_42/Temperature');
    expect(controlMetas).toContain('wb-mdm3_07/Channel 1');

    // Control values received
    expect(controlValues).toContain('wb-mr6c_28/K1=1');
    expect(controlValues).toContain('wb-msw-v3_42/CO2=850');
    expect(controlValues).toContain('wb-mdm3_07/Channel 1=128');
  });
});
