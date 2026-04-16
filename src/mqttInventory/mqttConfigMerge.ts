/**
 * Build `WirenboardMqttConfig` from plugin JSON + CLI/env overrides.
 *
 * @file mqttInventory/mqttConfigMerge.ts
 */

import type { WirenboardMqttConfig } from "../wirenboardMqtt.js";

/**
 *
 */
function pickStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 *
 */
function pickNum(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Extract MQTT fields from a plugin config object (may be partial). */
export function mqttOptionsFromPluginJson(
  json: Record<string, unknown> | undefined,
): Partial<WirenboardMqttConfig> {
  if (!json) return {};
  const p: Partial<WirenboardMqttConfig> = {};
  const host = pickStr(json, "mqttHost");
  if (host) p.mqttHost = host;
  const port = pickNum(json, "mqttPort");
  if (port !== undefined) p.mqttPort = port;
  const proto = json["mqttProtocol"];
  if (
    proto === "mqtt" ||
    proto === "mqtts" ||
    proto === "ws" ||
    proto === "wss"
  ) {
    p.mqttProtocol = proto;
  }
  const u = pickStr(json, "mqttUsername");
  if (u) p.mqttUsername = u;
  const pw = pickStr(json, "mqttPassword");
  if (pw) p.mqttPassword = pw;
  const ca = pickStr(json, "mqttCaPath");
  if (ca) p.mqttCaPath = ca;
  const cert = pickStr(json, "mqttCertPath");
  if (cert) p.mqttCertPath = cert;
  const key = pickStr(json, "mqttKeyPath");
  if (key) p.mqttKeyPath = key;
  return p;
}

/**
 *
 */
function envStr(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 *
 */
function envNum(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Env overrides compatible with `real-mqtt-verify.mjs` / manual testing. */
export function mqttOptionsFromEnv(): Partial<WirenboardMqttConfig> {
  const p: Partial<WirenboardMqttConfig> = {};
  const host = envStr("WB_MQTT_HOST");
  if (host) p.mqttHost = host;
  const port = envNum("WB_MQTT_PORT");
  if (port !== undefined) p.mqttPort = port;
  const proto = envStr("WB_MQTT_PROTOCOL");
  if (
    proto === "mqtt" ||
    proto === "mqtts" ||
    proto === "ws" ||
    proto === "wss"
  ) {
    p.mqttProtocol = proto;
  }
  const u = envStr("WB_MQTT_USERNAME");
  if (u) p.mqttUsername = u;
  const pw = envStr("WB_MQTT_PASSWORD");
  if (pw) p.mqttPassword = pw;
  const ca = envStr("WB_MQTT_CA_PATH");
  if (ca) p.mqttCaPath = ca;
  const cert = envStr("WB_MQTT_CERT_PATH");
  if (cert) p.mqttCertPath = cert;
  const key = envStr("WB_MQTT_KEY_PATH");
  if (key) p.mqttKeyPath = key;
  return p;
}

export type MqttCliOverrides = Partial<{
  mqttHost: string;
  mqttPort: number;
  mqttProtocol: WirenboardMqttConfig["mqttProtocol"];
  mqttUsername: string;
  mqttPassword: string;
}>;

/** Precedence: CLI overrides > env > file > defaults. */
export function mergeWirenboardMqttConfig(
  filePartial: Partial<WirenboardMqttConfig>,
  envPartial: Partial<WirenboardMqttConfig>,
  cliPartial: MqttCliOverrides,
): WirenboardMqttConfig {
  const base: WirenboardMqttConfig = {
    mqttHost: "localhost",
    mqttPort: 1883,
    mqttProtocol: "mqtt",
    ...filePartial,
    ...envPartial,
    ...cliPartial,
  };
  return base;
}
