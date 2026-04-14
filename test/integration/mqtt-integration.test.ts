/**
 * Integration tests for WirenboardMqtt using aedes in-memory MQTT broker.
 * No external broker required — aedes runs entirely in Node.js memory.
 */

import { createServer, Server } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PublishPacket } from "aedes";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";

import type {
  ControlErrorEvent,
  ControlMetaEvent,
  ControlValueEvent,
  DeviceMetaEvent,
} from "../../src/wirenboardMqtt.js";
// WirenboardMqtt uses the real mqtt package — no mocks here
import { WirenboardMqtt } from "../../src/wirenboardMqtt.js";

// ---------------------------------------------------------------------------
// Logger stub (silent)
// ---------------------------------------------------------------------------

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spin up an aedes broker on a random port. Returns broker, server, port. */
async function startBroker(): Promise<{
  broker: Aedes;
  server: Server;
  port: number;
}> {
  const broker = await Aedes.createBroker();
  const server = createServer(broker.handle.bind(broker));
  const port = await new Promise<number>((resolve) => {
    server.listen(0, () =>
      resolve((server.address() as { port: number }).port),
    );
  });
  return { broker, server, port };
}

/**
 * Shut down broker + server cleanly.
 *
 * @param broker
 * @param server
 */
function stopBroker(broker: Aedes, server: Server): Promise<void> {
  return new Promise((resolve) => {
    broker.close(() => server.close(() => resolve()));
  });
}

/**
 * Publish a message directly through aedes (bypasses network).
 *
 * @param broker
 * @param topic
 * @param payload
 * @param retain
 */
function aedesPublish(
  broker: Aedes,
  topic: string,
  payload: string,
  retain = true,
): Promise<void> {
  return new Promise((resolve) => {
    const packet: PublishPacket = {
      cmd: "publish",
      topic,
      payload: Buffer.from(payload),
      retain,
      qos: 0,
      dup: false,
    };
    broker.publish(packet, () => resolve());
  });
}

/**
 * Create WirenboardMqtt pointed at local broker port.
 *
 * @param port
 */
function createWbMqtt(port: number): WirenboardMqtt {
  return new WirenboardMqtt(
    { mqttHost: "127.0.0.1", mqttPort: port, mqttProtocol: "mqtt" },
    silentLog,
  );
}

/**
 * Start WirenboardMqtt and wait until the broker sees the client as ready
 * (subscription established). Uses broker-side 'clientReady' event.
 *
 * NOTE: mqtt.js connectAsync resolves after CONNACK but WirenboardMqtt
 * registers its 'connect' listener only after start() returns. Therefore
 * 'mqtt_connect' is NOT emitted for the initial connection — only for
 * subsequent reconnects. Use this helper instead of waiting for 'mqtt_connect'.
 *
 * @param mqtt
 * @param broker
 * @param timeoutMs
 */
async function startAndWaitConnected(
  mqtt: WirenboardMqtt,
  broker: Aedes,
  timeoutMs = 8000,
): Promise<void> {
  const connected = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for clientReady")),
      timeoutMs,
    );
    broker.once("clientReady", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await mqtt.start();
  await connected;
}

/**
 * Collect N events of given type, reject on timeout.
 *
 * @param emitter
 * @param event
 * @param count
 * @param timeoutMs
 */
function waitForEvents<T>(
  emitter: WirenboardMqtt,
  event: string,
  count: number,
  timeoutMs = 8000,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const collected: T[] = [];
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timeout waiting for ${count} '${event}' events, got ${collected.length}`,
        ),
      );
    }, timeoutMs);
    emitter.on(event, (evt: T) => {
      collected.push(evt);
      if (collected.length >= count) {
        clearTimeout(timer);
        resolve(collected);
      }
    });
  });
}

function waitForEvent<T>(
  emitter: WirenboardMqtt,
  event: string,
  timeoutMs = 8000,
): Promise<T> {
  return waitForEvents<T>(emitter, event, 1, timeoutMs).then((arr) => arr[0]!);
}

// ---------------------------------------------------------------------------
// a. Retained messages discovery
// ---------------------------------------------------------------------------

describe("a. Retained messages discovery", () => {
  let broker: Aedes;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ broker, server, port } = await startBroker());
  });

  afterAll(() => stopBroker(broker, server));

  it("receives retained device-meta, control-meta, control-value after connect", async () => {
    // Publish retained messages BEFORE connecting WirenboardMqtt
    await aedesPublish(
      broker,
      "/devices/wb-mr6c/meta",
      JSON.stringify({ driver: "wb-modbus", title: "WB-MR6C" }),
    );
    await aedesPublish(
      broker,
      "/devices/wb-mr6c/controls/K1/meta",
      JSON.stringify({ type: "switch", order: 1, readonly: false }),
    );
    await aedesPublish(broker, "/devices/wb-mr6c/controls/K1", "1");

    const mqtt = createWbMqtt(port);
    // Register listeners before start() so retained messages are not missed
    const deviceMetas = waitForEvents<DeviceMetaEvent>(mqtt, "device-meta", 1);
    const controlMetas = waitForEvents<ControlMetaEvent>(
      mqtt,
      "control-meta",
      1,
    );
    const controlValues = waitForEvents<ControlValueEvent>(
      mqtt,
      "control-value",
      1,
    );

    await mqtt.start();

    const [dm, cm, cv] = await Promise.all([
      deviceMetas,
      controlMetas,
      controlValues,
    ]);

    expect(dm[0]!.deviceName).toBe("wb-mr6c");
    expect((dm[0]!.meta as { driver?: string }).driver).toBe("wb-modbus");
    expect(cm[0]!.deviceName).toBe("wb-mr6c");
    expect(cm[0]!.controlName).toBe("K1");
    expect(cm[0]!.meta.type).toBe("switch");
    expect(cv[0]!.deviceName).toBe("wb-mr6c");
    expect(cv[0]!.controlName).toBe("K1");
    expect(cv[0]!.value).toBe("1");

    await mqtt.stop();
  });
});

// ---------------------------------------------------------------------------
// b. Live value updates
// ---------------------------------------------------------------------------

describe("b. Live value updates", () => {
  let broker: Aedes;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ broker, server, port } = await startBroker());
  });

  afterAll(() => stopBroker(broker, server));

  it("receives control-value when published after connect", async () => {
    const mqtt = createWbMqtt(port);
    await startAndWaitConnected(mqtt, broker);

    const valuePromise = waitForEvent<ControlValueEvent>(mqtt, "control-value");
    await aedesPublish(broker, "/devices/wb-live/controls/Temp", "23.5", false);

    const evt = await valuePromise;
    expect(evt.deviceName).toBe("wb-live");
    expect(evt.controlName).toBe("Temp");
    expect(evt.value).toBe("23.5");

    await mqtt.stop();
  });
});

// ---------------------------------------------------------------------------
// c. Publish command (bidirectional)
// ---------------------------------------------------------------------------

describe("c. Publish command (bidirectional)", () => {
  it("publishes to /devices/<dev>/controls/<ctrl>/on", async () => {
    // Each broker is created fresh to allow restart for mqtt_connect
    const { broker: broker1, server: server1, port } = await startBroker();

    const mqtt = createWbMqtt(port);

    // After startAndWaitMqttConnect, mqtt.isConnected=true and a fresh broker
    // is running on the same port (broker1/server1 were stopped internally).
    // We create broker2 ourselves to control its lifecycle.
    const { broker: broker2, server: server2 } = await (async () => {
      const mqttConnectPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timeout waiting for mqtt_connect")),
          12000,
        );
        mqtt.once("mqtt_connect", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      await startAndWaitConnected(mqtt, broker1);

      // Stop broker1 to trigger reconnect
      await stopBroker(broker1, server1);
      await waitForEvent(mqtt, "mqtt_disconnect", 8000);

      // Start broker2 on same port
      const b2 = await Aedes.createBroker();
      const s2 = createServer(b2.handle.bind(b2));
      await new Promise<void>((resolve) => s2.listen(port, () => resolve()));

      await mqttConnectPromise;

      return { broker: b2, server: s2 };
    })();

    // Now mqtt is connected (isConnected=true). Set up spy subscriber.
    const spyClient = await connectAsync(`mqtt://127.0.0.1:${port}`, {
      clientId: "test-spy-" + Date.now(),
    });

    const received: { topic: string; payload: string }[] = [];
    spyClient.on("message", (topic, payload) => {
      received.push({ topic, payload: payload.toString() });
    });
    await spyClient.subscribeAsync("/devices/+/controls/+/on");

    const messageReceived = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timeout waiting for /on message")),
        5000,
      );
      spyClient.on("message", () => {
        if (
          received.some((m) => m.topic === "/devices/wb-mr6c/controls/K1/on")
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await mqtt.publish("wb-mr6c", "K1", "1");
    await messageReceived;

    const msg = received.find(
      (m) => m.topic === "/devices/wb-mr6c/controls/K1/on",
    )!;
    expect(msg.payload).toBe("1");

    await spyClient.endAsync();
    await mqtt.stop();
    await stopBroker(broker2, server2);
  }, 25000);
});

// ---------------------------------------------------------------------------
// d. Reconnect
// ---------------------------------------------------------------------------

describe("d. Reconnect", () => {
  it("reconnects after broker restart", async () => {
    const {
      broker: broker1,
      server: server1,
      port: localPort,
    } = await startBroker();

    const localMqtt = createWbMqtt(localPort);
    await startAndWaitConnected(localMqtt, broker1);

    // Stop broker — triggers TCP close → mqtt_disconnect
    await stopBroker(broker1, server1);
    await waitForEvent(localMqtt, "mqtt_disconnect", 10000);

    // Restart broker on same port
    const broker2 = await Aedes.createBroker();
    const server2 = createServer(broker2.handle.bind(broker2));
    await new Promise<void>((resolve) =>
      server2.listen(localPort, () => resolve()),
    );

    // mqtt_connect fires on the reconnect (WirenboardMqtt's listener catches it this time)
    await waitForEvent(localMqtt, "mqtt_connect", 15000);

    await localMqtt.stop();
    await stopBroker(broker2, server2);
  }, 30000);
});

// ---------------------------------------------------------------------------
// e. Empty payload (device removal)
// ---------------------------------------------------------------------------

describe("e. Empty payload (device removal)", () => {
  let broker: Aedes;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ broker, server, port } = await startBroker());
  });

  afterAll(() => stopBroker(broker, server));

  it("emits device-removed on empty meta payload", async () => {
    const mqtt = createWbMqtt(port);
    await startAndWaitConnected(mqtt, broker);

    const removePromise = waitForEvent<{ deviceName: string }>(
      mqtt,
      "device-removed",
    );
    await aedesPublish(broker, "/devices/wb-test/meta", "", false);

    const evt = await removePromise;
    expect(evt.deviceName).toBe("wb-test");

    await mqtt.stop();
  });
});

// ---------------------------------------------------------------------------
// f. Error topics
// ---------------------------------------------------------------------------

describe("f. Error topics", () => {
  let broker: Aedes;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ broker, server, port } = await startBroker());
  });

  afterAll(() => stopBroker(broker, server));

  it("emits device-error from /devices/<dev>/meta/error", async () => {
    const mqtt = createWbMqtt(port);
    await startAndWaitConnected(mqtt, broker);

    const errPromise = waitForEvent<{ deviceName: string; error: string }>(
      mqtt,
      "device-error",
    );
    await aedesPublish(broker, "/devices/wb-err/meta/error", "r", false);

    const evt = await errPromise;
    expect(evt.deviceName).toBe("wb-err");
    expect(evt.error).toBe("r");

    await mqtt.stop();
  });

  it("emits control-error from /devices/<dev>/controls/<ctrl>/meta/error", async () => {
    const mqtt = createWbMqtt(port);
    await startAndWaitConnected(mqtt, broker);

    const errPromise = waitForEvent<ControlErrorEvent>(mqtt, "control-error");
    await aedesPublish(
      broker,
      "/devices/wb-err/controls/K1/meta/error",
      "w",
      false,
    );

    const evt = await errPromise;
    expect(evt.deviceName).toBe("wb-err");
    expect(evt.controlName).toBe("K1");
    expect(evt.error).toBe("w");

    await mqtt.stop();
  });
});

// ---------------------------------------------------------------------------
// g. Legacy subtopic meta
// ---------------------------------------------------------------------------

describe("g. Legacy subtopic meta", () => {
  let broker: Aedes;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ broker, server, port } = await startBroker());
  });

  afterAll(() => stopBroker(broker, server));

  it("emits device-meta from /devices/<dev>/meta/name retained", async () => {
    // Publish legacy retained message before connect
    await aedesPublish(broker, "/devices/wb-old/meta/name", "Old Device");

    const mqtt = createWbMqtt(port);
    const metaPromise = waitForEvent<DeviceMetaEvent>(mqtt, "device-meta");
    await mqtt.start();

    const evt = await metaPromise;
    expect(evt.deviceName).toBe("wb-old");
    expect(evt.meta.title).toBe("Old Device");

    await mqtt.stop();
  });
});

// ---------------------------------------------------------------------------
// h. Full WB device simulation
// ---------------------------------------------------------------------------

describe("h. Full WB device simulation", () => {
  let broker: Aedes;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ broker, server, port } = await startBroker());
  });

  afterAll(() => stopBroker(broker, server));

  it("discovers device with multiple controls from retained messages", async () => {
    await aedesPublish(
      broker,
      "/devices/wb-full/meta",
      JSON.stringify({ driver: "wb-modbus", title: "Full Device" }),
    );
    await aedesPublish(
      broker,
      "/devices/wb-full/controls/Channel1/meta",
      JSON.stringify({ type: "switch", order: 1, readonly: false }),
    );
    await aedesPublish(
      broker,
      "/devices/wb-full/controls/Channel2/meta",
      JSON.stringify({ type: "switch", order: 2, readonly: false }),
    );
    await aedesPublish(
      broker,
      "/devices/wb-full/controls/Temperature/meta",
      JSON.stringify({
        type: "value",
        order: 3,
        readonly: true,
        units: "deg C",
      }),
    );
    await aedesPublish(broker, "/devices/wb-full/controls/Channel1", "0");
    await aedesPublish(broker, "/devices/wb-full/controls/Channel2", "1");
    await aedesPublish(broker, "/devices/wb-full/controls/Temperature", "21.3");

    const mqtt = createWbMqtt(port);
    const deviceMetas = waitForEvents<DeviceMetaEvent>(mqtt, "device-meta", 1);
    const controlMetas = waitForEvents<ControlMetaEvent>(
      mqtt,
      "control-meta",
      3,
    );
    const controlValues = waitForEvents<ControlValueEvent>(
      mqtt,
      "control-value",
      3,
    );

    await mqtt.start();

    const [dm, cm, cv] = await Promise.all([
      deviceMetas,
      controlMetas,
      controlValues,
    ]);

    expect(dm[0]!.deviceName).toBe("wb-full");

    const ctrlNames = cm.map((e) => e.controlName);
    expect(ctrlNames).toContain("Channel1");
    expect(ctrlNames).toContain("Channel2");
    expect(ctrlNames).toContain("Temperature");

    const vals = cv.map((e) => ({ name: e.controlName, value: e.value }));
    expect(vals).toContainEqual({ name: "Channel1", value: "0" });
    expect(vals).toContainEqual({ name: "Channel2", value: "1" });
    expect(vals).toContainEqual({ name: "Temperature", value: "21.3" });

    await mqtt.stop();
  });
});
