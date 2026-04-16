/**
 * @file formatJson.schema.test.ts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";
import Ajv from "ajv";

import type { InventoryJsonReport } from "../src/mqttInventory/formatJson.js";
import { serializeInventoryJson } from "../src/mqttInventory/formatJson.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const schemaPath = join(__dirname, "../mqtt-inventory-report.schema.json");
const inventoryReportSchema = JSON.parse(
  readFileSync(schemaPath, "utf8"),
) as object;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateReport = ajv.compile(inventoryReportSchema);

function parseSerializedReport(json: string): unknown {
  return JSON.parse(json.trimEnd()) as unknown;
}

describe("serializeInventoryJson vs mqtt-inventory-report.schema.json", () => {
  it("accepts a minimal valid report", () => {
    const report: InventoryJsonReport = {
      schemaVersion: 1,
      configLoaded: true,
      configPath: "/tmp/cfg.json",
      effectiveGroupingMode: "device",
      groupingTopologyHint: "one bridged device per WB device",
      discoveryMode: "auto",
      broker: { protocol: "mqtt", host: "localhost", port: 1883 },
      devices: [
        {
          id: "wb-1",
          titleForValidation: "WB",
          annotations: {
            skippedByPrefix: null,
            inStaticDevicesList: null,
            validateDevicePasses: true,
            hasMappableEarly: true,
            exposureHint: "ok",
          },
          controls: [
            {
              name: "K1",
              mappable: true,
              skippedByOverride: false,
              typeOverride: null,
              hidden: false,
              hiddenExcludedByConfig: false,
            },
          ],
        },
      ],
    };
    const text = serializeInventoryJson(report);
    const data = parseSerializedReport(text);
    const ok = validateReport(data);
    expect(validateReport.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it("serialized output from a realistic fixture validates", () => {
    const report: InventoryJsonReport = {
      schemaVersion: 1,
      configLoaded: false,
      effectiveGroupingMode: "device",
      groupingTopologyHint: "hint",
      broker: { protocol: "mqtt", host: "h", port: 1883 },
      devices: [
        {
          id: "network",
          titleForValidation: "Network",
          annotations: {
            skippedByPrefix: "network",
            inStaticDevicesList: null,
            validateDevicePasses: true,
            hasMappableEarly: true,
            exposureHint: "skipped:prefix-network",
          },
          controls: [
            {
              name: "Ethernet IP Connection Enabled",
              mappable: true,
              skippedByOverride: false,
              typeOverride: null,
              hidden: false,
              hiddenExcludedByConfig: false,
            },
          ],
        },
      ],
    };
    const ok = validateReport(
      parseSerializedReport(serializeInventoryJson(report)),
    );
    expect(ok).toBe(true);
    expect(validateReport.errors).toBeNull();
  });

  it("rejects unknown top-level keys (schema locks shape)", () => {
    const bad = {
      schemaVersion: 1,
      configLoaded: false,
      effectiveGroupingMode: "device",
      groupingTopologyHint: "x",
      broker: { protocol: "mqtt", host: "h", port: 1 },
      devices: [],
      extraField: true,
    };
    const ok = validateReport(bad);
    expect(ok).toBe(false);
  });
});
