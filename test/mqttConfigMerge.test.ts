/**
 * @file mqttConfigMerge.test.ts
 */

import { describe, expect, it } from "@jest/globals";

import {
  mergeWirenboardMqttConfig,
  mqttOptionsFromEnv,
} from "../src/mqttInventory/mqttConfigMerge.js";

describe("mergeWirenboardMqttConfig", () => {
  it("applies precedence CLI > env > file > built-in defaults", () => {
    const file = {
      mqttHost: "file.host",
      mqttPort: 1111,
      mqttProtocol: "ws" as const,
    };
    const env = {
      mqttHost: "env.host",
      mqttPort: 2222,
      mqttUsername: "envuser",
    };
    const cli = { mqttHost: "cli.host", mqttPort: 3333 };
    const out = mergeWirenboardMqttConfig(file, env, cli);
    expect(out.mqttHost).toBe("cli.host");
    expect(out.mqttPort).toBe(3333);
    expect(out.mqttProtocol).toBe("ws");
    expect(out.mqttUsername).toBe("envuser");
  });

  it("uses file when CLI and env omit a field", () => {
    const file = { mqttHost: "only.file", mqttPort: 1884 };
    const out = mergeWirenboardMqttConfig(file, {}, {});
    expect(out.mqttHost).toBe("only.file");
    expect(out.mqttPort).toBe(1884);
    expect(out.mqttProtocol).toBe("mqtt");
  });

  it("uses built-in defaults when all partials are empty", () => {
    const out = mergeWirenboardMqttConfig({}, {}, {});
    expect(out.mqttHost).toBe("localhost");
    expect(out.mqttPort).toBe(1883);
    expect(out.mqttProtocol).toBe("mqtt");
  });

  it("lets env override file for credentials and TLS paths", () => {
    const file = {
      mqttUsername: "fromfile",
      mqttCaPath: "/file/ca.pem",
    };
    const env = {
      mqttUsername: "fromenv",
      mqttPassword: "secret",
    };
    const out = mergeWirenboardMqttConfig(file, env, {});
    expect(out.mqttUsername).toBe("fromenv");
    expect(out.mqttPassword).toBe("secret");
    expect(out.mqttCaPath).toBe("/file/ca.pem");
  });
});

describe("mqttOptionsFromEnv", () => {
  it("maps WB_MQTT_* into partial config", () => {
    const h = process.env.WB_MQTT_HOST;
    const port = process.env.WB_MQTT_PORT;
    const proto = process.env.WB_MQTT_PROTOCOL;
    const u = process.env.WB_MQTT_USERNAME;
    const pw = process.env.WB_MQTT_PASSWORD;
    const ca = process.env.WB_MQTT_CA_PATH;
    const cert = process.env.WB_MQTT_CERT_PATH;
    const key = process.env.WB_MQTT_KEY_PATH;
    try {
      process.env.WB_MQTT_HOST = "broker.example";
      process.env.WB_MQTT_PORT = "9999";
      process.env.WB_MQTT_PROTOCOL = "mqtts";
      process.env.WB_MQTT_USERNAME = "u";
      process.env.WB_MQTT_PASSWORD = "p";
      process.env.WB_MQTT_CA_PATH = "/ca";
      process.env.WB_MQTT_CERT_PATH = "/cert";
      process.env.WB_MQTT_KEY_PATH = "/key";

      const p = mqttOptionsFromEnv();
      expect(p.mqttHost).toBe("broker.example");
      expect(p.mqttPort).toBe(9999);
      expect(p.mqttProtocol).toBe("mqtts");
      expect(p.mqttUsername).toBe("u");
      expect(p.mqttPassword).toBe("p");
      expect(p.mqttCaPath).toBe("/ca");
      expect(p.mqttCertPath).toBe("/cert");
      expect(p.mqttKeyPath).toBe("/key");
    } finally {
      process.env.WB_MQTT_HOST = h ?? "";
      process.env.WB_MQTT_PORT = port ?? "";
      process.env.WB_MQTT_PROTOCOL = proto ?? "";
      process.env.WB_MQTT_USERNAME = u ?? "";
      process.env.WB_MQTT_PASSWORD = pw ?? "";
      process.env.WB_MQTT_CA_PATH = ca ?? "";
      process.env.WB_MQTT_CERT_PATH = cert ?? "";
      process.env.WB_MQTT_KEY_PATH = key ?? "";
    }
  });
});
