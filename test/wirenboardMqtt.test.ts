/**
 * Unit tests for WirenboardMqtt.messageHandler — topic parsing.
 * Uses mock retained-messages.json for integration-style parsing test.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

// ---------------------------------------------------------------------------
// Mock mqtt BEFORE importing WirenboardMqtt so start() tests can inject a fake client
// ---------------------------------------------------------------------------

// Shared fake client state for start() tests
const fakeClientListeners: Map<
  string,
  Array<(...args: unknown[]) => void>
> = new Map();
const fakeSubscribeAsync = jest
  .fn<() => Promise<void>>()
  .mockResolvedValue(undefined);
const fakeEndAsync = jest
  .fn<() => Promise<void>>()
  .mockResolvedValue(undefined);
const fakePublishAsync = jest
  .fn<() => Promise<void>>()
  .mockResolvedValue(undefined);

const fakeClient = {
  on(event: string, handler: (...args: unknown[]) => void) {
    const arr = fakeClientListeners.get(event) ?? [];
    arr.push(handler);
    fakeClientListeners.set(event, arr);
  },
  subscribeAsync: fakeSubscribeAsync,
  endAsync: fakeEndAsync,
  publishAsync: fakePublishAsync,
};

let useFakeClient = false;

jest.unstable_mockModule("mqtt", () => ({
  connectAsync: jest.fn(async () => {
    if (useFakeClient) return fakeClient;
    // For messageHandler tests that don't call start(), this is never reached
    throw new Error("connectAsync called unexpectedly");
  }),
}));

// ---------------------------------------------------------------------------
// Import WirenboardMqtt AFTER mock registration
// ---------------------------------------------------------------------------

// We test messageHandler without a real MQTT connection.
// Stub the AnsiLogger to avoid side-effects.
const { WirenboardMqtt } = await import("../src/wirenboardMqtt.js");

type AnsiLogger = import("matterbridge/logger").AnsiLogger;
type DeviceMetaEvent = import("../src/wirenboardMqtt.js").DeviceMetaEvent;
type ControlMetaEvent = import("../src/wirenboardMqtt.js").ControlMetaEvent;
type ControlValueEvent = import("../src/wirenboardMqtt.js").ControlValueEvent;
type ControlErrorEvent = import("../src/wirenboardMqtt.js").ControlErrorEvent;

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
  return new WirenboardMqtt({ mqttHost: "localhost" }, mockLog);
}

// ---------------------------------------------------------------------------
// device-meta
// ---------------------------------------------------------------------------

describe("messageHandler — device-meta", () => {
  it("parses /devices/<name>/meta JSON", () => {
    const mqtt = createMqtt();
    const received: DeviceMetaEvent[] = [];
    mqtt.on("device-meta", (evt: DeviceMetaEvent) => received.push(evt));

    mqtt.messageHandler(
      "/devices/wb-mr6c_28/meta",
      '{"driver":"wb-mr6c","title":{"en":"WB-MR6C 28","ru":"WB-MR6C 28"}}',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe("wb-mr6c_28");
    expect(received[0]!.meta.driver).toBe("wb-mr6c");
    expect((received[0]!.meta.title as { en: string }).en).toBe("WB-MR6C 28");
  });

  it("empty payload emits device-removed", () => {
    const mqtt = createMqtt();
    const removed: string[] = [];
    mqtt.on("device-removed", (evt: { deviceName: string }) =>
      removed.push(evt.deviceName),
    );

    mqtt.messageHandler("/devices/wb-mr6c_28/meta", "");

    expect(removed).toContain("wb-mr6c_28");
  });
});

// ---------------------------------------------------------------------------
// control-meta
// ---------------------------------------------------------------------------

describe("messageHandler — control-meta", () => {
  it("parses /devices/<name>/controls/<ctrl>/meta JSON", () => {
    const mqtt = createMqtt();
    const received: ControlMetaEvent[] = [];
    mqtt.on("control-meta", (evt: ControlMetaEvent) => received.push(evt));

    mqtt.messageHandler(
      "/devices/wb-mr6c_28/controls/K1/meta",
      '{"type":"switch","order":1,"readonly":false}',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe("wb-mr6c_28");
    expect(received[0]!.controlName).toBe("K1");
    expect(received[0]!.meta.type).toBe("switch");
    expect(received[0]!.meta.readonly).toBe(false);
  });

  it("empty payload emits control-removed", () => {
    const mqtt = createMqtt();
    const removed: Array<{ deviceName: string; controlName: string }> = [];
    mqtt.on(
      "control-removed",
      (evt: { deviceName: string; controlName: string }) => removed.push(evt),
    );

    mqtt.messageHandler("/devices/wb-mr6c_28/controls/K1/meta", "");

    expect(removed).toHaveLength(1);
    expect(removed[0]!.deviceName).toBe("wb-mr6c_28");
    expect(removed[0]!.controlName).toBe("K1");
  });
});

// ---------------------------------------------------------------------------
// control-value
// ---------------------------------------------------------------------------

describe("messageHandler — control-value", () => {
  it("parses /devices/<name>/controls/<ctrl> as value", () => {
    const mqtt = createMqtt();
    const received: ControlValueEvent[] = [];
    mqtt.on("control-value", (evt: ControlValueEvent) => received.push(evt));

    mqtt.messageHandler("/devices/wb-mr6c_28/controls/K1", "1");

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe("wb-mr6c_28");
    expect(received[0]!.controlName).toBe("K1");
    expect(received[0]!.value).toBe("1");
  });

  it("empty control value payload emits control-removed", () => {
    const mqtt = createMqtt();
    const removed: Array<{ deviceName: string; controlName: string }> = [];
    mqtt.on(
      "control-removed",
      (evt: { deviceName: string; controlName: string }) => removed.push(evt),
    );

    mqtt.messageHandler("/devices/wb-mr6c_28/controls/K1", "");

    expect(removed).toHaveLength(1);
  });

  it("ignores /on topics (own commands)", () => {
    const mqtt = createMqtt();
    const valueEvents: ControlValueEvent[] = [];
    mqtt.on("control-value", (evt: ControlValueEvent) => valueEvents.push(evt));

    mqtt.messageHandler("/devices/wb-mr6c_28/controls/K1/on", "1");

    expect(valueEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// control-error
// ---------------------------------------------------------------------------

describe("messageHandler — control-error", () => {
  it("parses /devices/<name>/controls/<ctrl>/meta/error", () => {
    const mqtt = createMqtt();
    const received: ControlErrorEvent[] = [];
    mqtt.on("control-error", (evt: ControlErrorEvent) => received.push(evt));

    mqtt.messageHandler("/devices/wb-mr6c_28/controls/K2/meta/error", "r");

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe("wb-mr6c_28");
    expect(received[0]!.controlName).toBe("K2");
    expect(received[0]!.error).toBe("r");
  });

  it("empty error payload = no error", () => {
    const mqtt = createMqtt();
    const received: ControlErrorEvent[] = [];
    mqtt.on("control-error", (evt: ControlErrorEvent) => received.push(evt));

    mqtt.messageHandler("/devices/wb-mr6c_28/controls/K1/meta/error", "");

    expect(received).toHaveLength(1);
    expect(received[0]!.error).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Legacy subtopic meta
// ---------------------------------------------------------------------------

describe("messageHandler — device-error", () => {
  it("parses /devices/<name>/meta/error", () => {
    const mqtt = createMqtt();
    const received: { deviceName: string; error: string }[] = [];
    mqtt.on("device-error", (evt: { deviceName: string; error: string }) =>
      received.push(evt),
    );

    mqtt.messageHandler("/devices/wb-mr6c/meta/error", "r");
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ deviceName: "wb-mr6c", error: "r" });
  });

  it("emits device-error with combined flags", () => {
    const mqtt = createMqtt();
    const received: { deviceName: string; error: string }[] = [];
    mqtt.on("device-error", (evt: { deviceName: string; error: string }) =>
      received.push(evt),
    );

    mqtt.messageHandler("/devices/wb-msw-v3/meta/error", "rp");
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ deviceName: "wb-msw-v3", error: "rp" });
  });

  it("emits device-error with empty string (error cleared)", () => {
    const mqtt = createMqtt();
    const received: { deviceName: string; error: string }[] = [];
    mqtt.on("device-error", (evt: { deviceName: string; error: string }) =>
      received.push(evt),
    );

    mqtt.messageHandler("/devices/wb-mr6c/meta/error", "");
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ deviceName: "wb-mr6c", error: "" });
  });
});

describe("messageHandler — legacy subtopic meta", () => {
  it("assembles control meta from individual subtopics", () => {
    const mqtt = createMqtt();
    const received: ControlMetaEvent[] = [];
    mqtt.on("control-meta", (evt: ControlMetaEvent) => received.push(evt));

    mqtt.messageHandler("/devices/wb-old/controls/temp/meta/type", "value");
    mqtt.messageHandler("/devices/wb-old/controls/temp/meta/units", "deg C");
    mqtt.messageHandler("/devices/wb-old/controls/temp/meta/max", "100");
    mqtt.messageHandler("/devices/wb-old/controls/temp/meta/readonly", "1");

    // Emits on every subtopic update once type is set
    expect(received.length).toBeGreaterThan(0);
    const last = received[received.length - 1]!;
    expect(last.deviceName).toBe("wb-old");
    expect(last.controlName).toBe("temp");
    expect(last.meta.type).toBe("value");
  });

  it("emits device-meta from legacy /devices/<name>/meta/name subtopic", () => {
    const mqtt = createMqtt();
    const received: DeviceMetaEvent[] = [];
    mqtt.on("device-meta", (evt: DeviceMetaEvent) => received.push(evt));

    mqtt.messageHandler("/devices/wb-old/meta/name", "Old Device");

    expect(received).toHaveLength(1);
    expect(received[0]!.deviceName).toBe("wb-old");
    expect(received[0]!.meta.title).toBe("Old Device");
  });
});

// ---------------------------------------------------------------------------
// Retained messages integration — replay all mock messages
// ---------------------------------------------------------------------------

describe("retained-messages.json replay", () => {
  it("correctly parses all mock retained messages", () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const jsonPath = path.join(__dirname, "../src/mock/retained-messages.json");
    const messages: Array<{ topic: string; payload: string }> = JSON.parse(
      readFileSync(jsonPath, "utf-8"),
    );

    const mqtt = createMqtt();
    const deviceMetas: string[] = [];
    const controlMetas: string[] = [];
    const controlValues: string[] = [];

    mqtt.on("device-meta", (evt: DeviceMetaEvent) =>
      deviceMetas.push(evt.deviceName),
    );
    mqtt.on("control-meta", (evt: ControlMetaEvent) =>
      controlMetas.push(`${evt.deviceName}/${evt.controlName}`),
    );
    mqtt.on("control-value", (evt: ControlValueEvent) =>
      controlValues.push(`${evt.deviceName}/${evt.controlName}=${evt.value}`),
    );

    for (const msg of messages) {
      mqtt.messageHandler(msg.topic, msg.payload);
    }

    // Three original devices discovered
    expect(deviceMetas).toContain("wb-mr6c_28");
    expect(deviceMetas).toContain("wb-msw-v3_42");
    expect(deviceMetas).toContain("wb-mdm3_07");

    // New mock devices discovered
    expect(deviceMetas).toContain("wb-led_01");
    expect(deviceMetas).toContain("wb-therm_05");

    // Controls meta parsed
    expect(controlMetas).toContain("wb-mr6c_28/K1");
    expect(controlMetas).toContain("wb-msw-v3_42/Temperature");
    expect(controlMetas).toContain("wb-mdm3_07/Channel 1");

    // RGB control meta parsed
    expect(controlMetas).toContain("wb-led_01/RGB");

    // Thermostat controls meta parsed
    expect(controlMetas).toContain("wb-therm_05/temperature");
    expect(controlMetas).toContain("wb-therm_05/setpoint");
    expect(controlMetas).toContain("wb-therm_05/mode");

    // Control values received
    expect(controlValues).toContain("wb-mr6c_28/K1=1");
    expect(controlValues).toContain("wb-msw-v3_42/CO2=850");
    expect(controlValues).toContain("wb-mdm3_07/Channel 1=128");

    // RGB value received
    expect(controlValues).toContain("wb-led_01/RGB=128;0;255");

    // Thermostat values received
    expect(controlValues).toContain("wb-therm_05/temperature=22.5");
    expect(controlValues).toContain("wb-therm_05/setpoint=21.0");
    expect(controlValues).toContain("wb-therm_05/mode=heat");
  });

  it("parses RGB control meta with type rgb", () => {
    const mqtt = createMqtt();
    const received: ControlMetaEvent[] = [];
    mqtt.on("control-meta", (evt: ControlMetaEvent) => received.push(evt));

    mqtt.messageHandler(
      "/devices/wb-led_01/controls/RGB/meta",
      '{"type":"rgb","order":1,"readonly":false}',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.meta.type).toBe("rgb");
  });

  it("parses thermostat setpoint control meta with units deg C", () => {
    const mqtt = createMqtt();
    const received: ControlMetaEvent[] = [];
    mqtt.on("control-meta", (evt: ControlMetaEvent) => received.push(evt));

    mqtt.messageHandler(
      "/devices/wb-therm_05/controls/setpoint/meta",
      '{"type":"range","units":"deg C","min":5,"max":35,"order":2,"readonly":false}',
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.meta.type).toBe("range");
    expect(received[0]!.meta.units).toBe("deg C");
  });
});

// ---------------------------------------------------------------------------
// start / stop / publish — using real start() with mocked connectAsync
// ---------------------------------------------------------------------------

/**
 * Emit a fake client event after start() has wired listeners.
 *
 * @param event
 * @param {...any} args
 */
function emitFakeClientEvent(event: string, ...args: unknown[]): void {
  const handlers = fakeClientListeners.get(event) ?? [];
  for (const h of handlers) h(...args);
}

/** Reset shared fake client state before each start() test. */
function resetFakeClient(): void {
  fakeClientListeners.clear();
  fakeSubscribeAsync.mockClear().mockResolvedValue(undefined);
  fakeEndAsync.mockClear().mockResolvedValue(undefined);
  fakePublishAsync.mockClear().mockResolvedValue(undefined);
}

describe("start() — real implementation via mocked connectAsync", () => {
  beforeEach(() => {
    resetFakeClient();
    useFakeClient = true;
    jest.clearAllMocks();
  });

  afterEach(() => {
    useFakeClient = false;
  });

  it("subscribes to /devices/#", async () => {
    const mqtt = createMqtt();
    await mqtt.start();
    expect(fakeSubscribeAsync).toHaveBeenCalledWith("/devices/#");
  });

  it("emits mqtt_connect on connect event", async () => {
    const mqtt = createMqtt();
    await mqtt.start();

    const connects: unknown[] = [];
    mqtt.on("mqtt_connect", () => connects.push(true));
    emitFakeClientEvent("connect");

    expect(connects).toHaveLength(1);
  });

  it("emits mqtt_disconnect on disconnect event", async () => {
    const mqtt = createMqtt();
    await mqtt.start();

    const disconnects: unknown[] = [];
    mqtt.on("mqtt_disconnect", () => disconnects.push(true));
    emitFakeClientEvent("disconnect");

    expect(disconnects).toHaveLength(1);
  });

  it("emits mqtt_disconnect on close when not ending", async () => {
    const mqtt = createMqtt();
    await mqtt.start();

    const disconnects: unknown[] = [];
    mqtt.on("mqtt_disconnect", () => disconnects.push(true));
    emitFakeClientEvent("close");

    expect(disconnects).toHaveLength(1);
  });

  it("does NOT emit mqtt_disconnect on close when isEnding=true", async () => {
    const mqtt = createMqtt();
    await mqtt.start();

    const disconnects: unknown[] = [];
    mqtt.on("mqtt_disconnect", () => disconnects.push(true));

    // stop() sets isEnding = true
    fakeEndAsync.mockImplementation(async () => {
      emitFakeClientEvent("close");
    });
    await mqtt.stop();

    expect(disconnects).toHaveLength(0);
  });

  it("logs error on error event", async () => {
    const mqtt = createMqtt();
    await mqtt.start();
    emitFakeClientEvent("error", new Error("connection refused"));

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("connection refused"),
    );
  });

  it("reconnect event does not throw", async () => {
    const mqtt = createMqtt();
    await mqtt.start();
    expect(() => emitFakeClientEvent("reconnect")).not.toThrow();
  });

  it("message event dispatches to messageHandler", async () => {
    const mqtt = createMqtt();
    await mqtt.start();

    const received: ControlValueEvent[] = [];
    mqtt.on("control-value", (evt: ControlValueEvent) => received.push(evt));

    emitFakeClientEvent(
      "message",
      "/devices/wb-dev/controls/K1",
      Buffer.from("1"),
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.value).toBe("1");
  });
});

describe("stop() — real implementation", () => {
  beforeEach(() => {
    resetFakeClient();
    useFakeClient = true;
    jest.clearAllMocks();
  });

  afterEach(() => {
    useFakeClient = false;
  });

  it("calls endAsync on client", async () => {
    const mqtt = createMqtt();
    await mqtt.start();
    await mqtt.stop();
    expect(fakeEndAsync).toHaveBeenCalledTimes(1);
  });

  it("stop() without start() does not throw", async () => {
    const mqtt = createMqtt();
    await expect(mqtt.stop()).resolves.not.toThrow();
  });
});

describe("publish() — real implementation", () => {
  beforeEach(() => {
    resetFakeClient();
    useFakeClient = true;
    jest.clearAllMocks();
  });

  afterEach(() => {
    useFakeClient = false;
  });

  it("sends to correct topic when connected", async () => {
    const mqtt = createMqtt();
    await mqtt.start();
    emitFakeClientEvent("connect"); // sets isConnected = true

    await mqtt.publish("wb-dev", "K1", "1");

    expect(fakePublishAsync).toHaveBeenCalledWith(
      "/devices/wb-dev/controls/K1/on",
      "1",
      { retain: false },
    );
  });

  it("warns and skips when not connected", async () => {
    const mqtt = createMqtt();
    await mqtt.start();
    // No connect event → isConnected = false

    await mqtt.publish("wb-dev", "K1", "1");

    expect(fakePublishAsync).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("not connected"),
    );
  });
});
