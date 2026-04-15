/**
 * Fills `matterbridge-wirenboard-plugin.schema.json` from the template:
 * `$defs.matterDeviceTypeEnum.enum` ← sorted keys of `MATTER_DEVICE_TYPE_BY_NAME`
 * (derived from CONTROL_MAPPINGS). Run after `tsc` (imports ../dist/controlMapping.js).
 *
 * @file scripts/generate-plugin-schema.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MATTER_DEVICE_TYPE_BY_NAME } from "../dist/controlMapping.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const templatePath = join(
  root,
  "matterbridge-wirenboard-plugin.schema.template.json",
);
const outPath = join(root, "matterbridge-wirenboard-plugin.schema.json");

const template = JSON.parse(readFileSync(templatePath, "utf8"));
const keys = Object.keys(MATTER_DEVICE_TYPE_BY_NAME).sort();
template.$defs.matterDeviceTypeEnum.enum = keys;
writeFileSync(outPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
// eslint-disable-next-line no-console -- build step feedback
console.log(
  `generate-plugin-schema: wrote ${keys.length} matter device types → matterbridge-wirenboard-plugin.schema.json`,
);
