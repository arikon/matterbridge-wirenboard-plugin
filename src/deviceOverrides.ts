/**
 * Parse `deviceOverrides` config entries (README shape) and resolve Matter device types.
 *
 * @file deviceOverrides.ts
 */

import type { DeviceTypeDefinition } from "matterbridge";

import {
  type DeviceOverrides,
  MATTER_DEVICE_TYPE_BY_NAME,
} from "./controlMapping.js";

export { MATTER_DEVICE_TYPE_BY_NAME };

export interface NormalizedDeviceOverridesEntry {
  displayName?: string;
  skippedControls: Set<string>;
  typeOverrides: DeviceOverrides;
}

/**
 * Resolve a JSON `deviceType` value to a Matter device type definition.
 *
 * @param value - string name or pass-through if already a definition (tests)
 */
export function resolveMatterDeviceType(
  value: unknown,
): DeviceTypeDefinition | undefined {
  if (typeof value === "string") {
    return MATTER_DEVICE_TYPE_BY_NAME[value];
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "name" in (value as object)
  ) {
    return value as DeviceTypeDefinition;
  }
  return undefined;
}

/**
 * Normalize one device entry under `deviceOverrides.<wbDeviceId>`.
 * Accepts only `{ name?, controls: { ... } }`. Missing/invalid `controls` → warn and `undefined`.
 *
 * @param raw - raw config value
 * @param logWarn - called for configuration problems
 */
export function normalizeDeviceOverridesEntry(
  raw: unknown,
  logWarn: (message: string) => void,
): NormalizedDeviceOverridesEntry | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    logWarn("deviceOverrides: device entry must be an object");
    return undefined;
  }

  const o = raw as Record<string, unknown>;
  const controlsRaw = o["controls"];

  if (
    controlsRaw === null ||
    typeof controlsRaw !== "object" ||
    Array.isArray(controlsRaw)
  ) {
    logWarn(
      'deviceOverrides: each device must include a "controls" object (nested format). Legacy flat entries are not supported.',
    );
    return undefined;
  }

  let displayName: string | undefined;
  if (typeof o["name"] === "string") {
    const t = o["name"].trim();
    if (t.length > 0) displayName = t;
  }

  const skippedControls = new Set<string>();
  const typeOverrides: DeviceOverrides = {};

  const controlsObj = controlsRaw as Record<string, unknown>;
  for (const [controlName, entry] of Object.entries(controlsObj)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      logWarn(`deviceOverrides.controls["${controlName}"]: expected an object`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (e["skip"] === true) {
      skippedControls.add(controlName);
    }
    if ("deviceType" in e && e["deviceType"] !== undefined) {
      const dt = resolveMatterDeviceType(e["deviceType"]);
      if (dt !== undefined) {
        typeOverrides[controlName] = dt;
      } else if (typeof e["deviceType"] === "string") {
        logWarn(
          `deviceOverrides: unknown deviceType "${e["deviceType"]}" for control "${controlName}"`,
        );
      }
    }
  }

  return { displayName, skippedControls, typeOverrides };
}
