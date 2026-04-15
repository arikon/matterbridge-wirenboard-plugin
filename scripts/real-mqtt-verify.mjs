/**
 * Smoke test: connect to a Wiren Board MQTT broker, accumulate device/control meta
 * like WirenboardPlatform, print canonical control order and mappable counts.
 *
 * Usage (from package root):
 *   npm run build && npm run verify:mqtt
 *
 * Environment (optional):
 *   WB_MQTT_HOST   (default: 192.168.55.15)
 *   WB_MQTT_PORT   (default: 1883)
 *   WB_MQTT_USERNAME / WB_MQTT_PASSWORD
 *   WB_MQTT_PROTOCOL (default: mqtt)
 *   WB_VERIFY_IDLE_MS — ms silence after last meta to finish (default: 3000)
 *   WB_VERIFY_MAX_MS — hard cap (default: 60000)
 *
 * @file real-mqtt-verify.mjs
 */
/* eslint-disable no-console -- CLI prints a human-readable summary to stdout */

import { sortedControlsByCanonicalName } from "../dist/canonicalOrdering.js";
import { findMapping } from "../dist/controlMapping.js";
import { WirenboardMqtt } from "../dist/wirenboardMqtt.js";

const host = process.env.WB_MQTT_HOST ?? "192.168.55.15";
const port = Number(process.env.WB_MQTT_PORT ?? "1883");
const protocol =
  process.env.WB_MQTT_PROTOCOL === "mqtts" ||
  process.env.WB_MQTT_PROTOCOL === "mqtt"
    ? process.env.WB_MQTT_PROTOCOL
    : "mqtt";
const idleMs = Number(process.env.WB_VERIFY_IDLE_MS ?? "3000");
const maxMs = Number(process.env.WB_VERIFY_MAX_MS ?? "60000");

/** @type {import("matterbridge/logger").AnsiLogger} */
const log = {
  info: (msg) => {
    console.log(String(msg));
  },
  warn: (msg) => {
    console.warn(String(msg));
  },
  error: (msg) => {
    console.error(String(msg));
  },
  debug: () => {},
};

const deviceMap = new Map();

let lastMetaAt = 0;
let doneResolve;
const donePromise = new Promise((resolve) => {
  doneResolve = resolve;
});

/** Updates idle-detection timestamp after meta activity. */
function touchMeta() {
  lastMetaAt = Date.now();
}

/**
 * @param {string} deviceName - MQTT device id
 * @param {import("../dist/wirenboardTypes.js").WbDeviceMeta} meta - parsed `/devices/.../meta` payload
 */
function upsertDeviceMeta(deviceName, meta) {
  touchMeta();
  const existing = deviceMap.get(deviceName);
  if (existing) {
    existing.meta = meta;
  } else {
    deviceMap.set(deviceName, {
      name: deviceName,
      meta,
      controls: new Map(),
    });
  }
}

/**
 * @param {string} deviceName - MQTT device id
 * @param {string} controlName - control id
 * @param {import("../dist/wirenboardTypes.js").WbControlMeta} meta - parsed control meta payload
 */
function upsertControlMeta(deviceName, controlName, meta) {
  touchMeta();
  let device = deviceMap.get(deviceName);
  if (!device) {
    device = {
      name: deviceName,
      meta: { driver: "", title: deviceName },
      controls: new Map(),
    };
    deviceMap.set(deviceName, device);
  }
  const existing = device.controls.get(controlName);
  if (existing) {
    existing.meta = meta;
  } else {
    device.controls.set(controlName, {
      name: controlName,
      meta,
      value: undefined,
      error: undefined,
    });
  }
}

/**
 * Connect, collect retained/live meta, print summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const mqtt = new WirenboardMqtt(
    {
      mqttHost: host,
      mqttPort: port,
      mqttProtocol: protocol,
      mqttUsername: process.env.WB_MQTT_USERNAME || undefined,
      mqttPassword: process.env.WB_MQTT_PASSWORD || undefined,
      mqttCaPath: process.env.WB_MQTT_CA_PATH || undefined,
      mqttCertPath: process.env.WB_MQTT_CERT_PATH || undefined,
      mqttKeyPath: process.env.WB_MQTT_KEY_PATH || undefined,
    },
    log,
  );

  mqtt.on("device-meta", (evt) => {
    upsertDeviceMeta(evt.deviceName, evt.meta);
  });
  mqtt.on("control-meta", (evt) => {
    upsertControlMeta(evt.deviceName, evt.controlName, evt.meta);
  });

  log.info(`Connecting ${protocol}://${host}:${port} …`);
  try {
    await mqtt.start();
  } catch (err) {
    console.error("MQTT connect/subscribe failed:", err);
    process.exitCode = 1;
    return;
  }
  lastMetaAt = Date.now();

  const interval = setInterval(() => {
    const now = Date.now();
    if (now - lastMetaAt >= idleMs && deviceMap.size > 0) {
      clearInterval(interval);
      clearTimeout(maxTimer);
      doneResolve();
    }
  }, 200);

  const maxTimer = setTimeout(() => {
    clearInterval(interval);
    doneResolve();
  }, maxMs);

  await donePromise;
  await mqtt.stop();

  const names = [...deviceMap.keys()].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  );

  console.log("");
  console.log("--- MQTT verify summary ---");
  console.log(`Broker: ${protocol}://${host}:${port}`);
  console.log(`Devices in model: ${deviceMap.size}`);
  console.log("");

  for (const name of names) {
    const dev = deviceMap.get(name);
    if (!dev) continue;
    const sorted = sortedControlsByCanonicalName(dev.controls);
    const controlNames = sorted.map((c) => c.name);
    let mappable = 0;
    for (const ctrl of sorted) {
      if (findMapping(ctrl.meta, ctrl.name)) mappable++;
    }
    console.log(
      `${name}  (${dev.controls.size} controls, ${mappable} mappable)`,
    );
    console.log(
      `  canonical order: ${controlNames.slice(0, 24).join(", ")}${controlNames.length > 24 ? " …" : ""}`,
    );
  }

  console.log("");
  console.log("OK — parsing + canonical ordering on live topics.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
