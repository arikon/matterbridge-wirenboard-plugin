/**
 * Ensures published JSON Schema stays aligned with CONTROL_MAPPINGS-derived registry.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";

import { MATTER_DEVICE_TYPE_BY_NAME } from "../src/controlMapping.js";

describe("matterbridge-wirenboard-plugin.schema.json", () => {
  it("matterDeviceTypeEnum matches MATTER_DEVICE_TYPE_BY_NAME keys", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const schemaPath = join(root, "matterbridge-wirenboard-plugin.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      $defs: { matterDeviceTypeEnum: { enum: string[] } };
    };
    const fromSchema = schema.$defs.matterDeviceTypeEnum.enum;
    const fromCode = Object.keys(MATTER_DEVICE_TYPE_BY_NAME).sort();
    expect([...fromSchema].sort()).toEqual(fromCode);
  });
});
