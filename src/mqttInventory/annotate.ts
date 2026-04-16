/**
 * Config-impact annotations for inventory (shared registration helpers).
 *
 * @file mqttInventory/annotate.ts
 */

import { sortedControlsByCanonicalName } from "../canonicalOrdering.js";
import { findMapping } from "../controlMapping.js";
import { normalizeDeviceOverridesEntry } from "../deviceOverrides.js";
import {
  appliesNetworkPrefixedSkip,
  appliesSystemPrefixedSkip,
  describeGroupingModeTopology,
  deviceHasMappableControlEarlyCheck,
  resolveDeviceTitleForValidation,
} from "../matterRegistration.js";
import { validateDeviceConfig } from "../validateDeviceConfig.js";
import type { GroupingMode } from "../wirenboardDevice.js";
import type { WbDevice } from "../wirenboardTypes.js";

export interface PluginAnnotationConfig {
  raw: Record<string, unknown> | undefined;
  loaded: boolean;
  path?: string;
}

/**
 *
 */
function asStrArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string") out.push(x);
  }
  return out;
}

/**
 *
 */
function parseGroupingMode(v: unknown): GroupingMode {
  return v === "control" ? "control" : "device";
}

/**
 *
 */
export function buildSessionSummary(cfg: PluginAnnotationConfig): {
  effectiveGroupingMode: GroupingMode;
  groupingTopologyHint: string;
  discoveryMode: string | undefined;
  staticDevicesList: string[] | undefined;
} {
  const raw = cfg.raw;
  const effectiveGroupingMode = parseGroupingMode(raw?.["groupingMode"]);
  return {
    effectiveGroupingMode,
    groupingTopologyHint: describeGroupingModeTopology(effectiveGroupingMode),
    discoveryMode:
      typeof raw?.["discoveryMode"] === "string"
        ? raw["discoveryMode"]
        : undefined,
    staticDevicesList: asStrArray(raw?.["devices"]),
  };
}

export interface DeviceAnnotation {
  id: string;
  titleForValidation: string;
  skippedByPrefix: "system" | "network" | null;
  inStaticDevicesList: boolean | null;
  validateDevicePasses: boolean;
  hasMappableEarly: boolean;
  exposureHint: string;
}

export interface ControlAnnotation {
  name: string;
  mappable: boolean;
  skippedByOverride: boolean;
  typeOverride: string | null;
  hidden: boolean;
  hiddenExcludedByConfig: boolean;
}

/**
 *
 */
function noopWarn(): void {
  /* */
}

/**
 *
 */
export function annotateDevice(
  wbDevice: WbDevice,
  cfg: PluginAnnotationConfig,
  opts: {
    includeHidden: boolean;
    ignoreSystemPrefixedDevices: boolean;
    ignoreNetworkPrefixedDevices: boolean;
  },
): { device: DeviceAnnotation; controls: ControlAnnotation[] } {
  const raw = cfg.raw;
  const whiteList = asStrArray(raw?.["whiteList"]);
  const blackList = asStrArray(raw?.["blackList"]);
  const ovRaw =
    raw &&
    typeof raw["deviceOverrides"] === "object" &&
    raw["deviceOverrides"] !== null
      ? (raw["deviceOverrides"] as Record<string, unknown>)[wbDevice.name]
      : undefined;
  const normalizedOv = normalizeDeviceOverridesEntry(ovRaw, noopWarn);
  const skippedFromConfig = normalizedOv?.skippedControls;
  const typeOverrides = normalizedOv?.typeOverrides;

  const titleForValidation = resolveDeviceTitleForValidation(
    wbDevice,
    normalizedOv,
  );

  let skippedByPrefix: "system" | "network" | null = null;
  if (
    appliesSystemPrefixedSkip(wbDevice.name, opts.ignoreSystemPrefixedDevices)
  ) {
    skippedByPrefix = "system";
  } else if (
    appliesNetworkPrefixedSkip(wbDevice.name, opts.ignoreNetworkPrefixedDevices)
  ) {
    skippedByPrefix = "network";
  }

  const session = buildSessionSummary(cfg);
  let inStaticDevicesList: boolean | null = null;
  if (session.discoveryMode === "static" && session.staticDevicesList) {
    inStaticDevicesList = session.staticDevicesList.includes(wbDevice.name);
  }

  const hasMappableEarly = deviceHasMappableControlEarlyCheck(
    wbDevice,
    typeOverrides,
    skippedFromConfig,
  );

  const validateDevicePasses =
    cfg.loaded && !skippedByPrefix
      ? validateDeviceConfig(whiteList, blackList, [
          titleForValidation,
          wbDevice.name,
        ])
      : true;

  let exposureHint = "would-register";
  if (skippedByPrefix) exposureHint = `skipped:prefix-${skippedByPrefix}`;
  else if (!hasMappableEarly) exposureHint = "skipped:no-mappable-controls";
  else if (cfg.loaded && !validateDevicePasses)
    exposureHint = "skipped:whitelist-blacklist";

  const controls: ControlAnnotation[] = [];
  for (const ctrl of sortedControlsByCanonicalName(wbDevice.controls)) {
    const hidden = ctrl.meta.hidden === true;
    const hiddenExcludedByConfig = hidden && !opts.includeHidden;
    const skippedByOverride = skippedFromConfig?.has(ctrl.name) ?? false;
    let typeOverride: string | null = null;
    if (typeOverrides && typeOverrides[ctrl.name]) {
      const dt = typeOverrides[ctrl.name];
      typeOverride =
        typeof dt === "object" && dt !== null && "name" in dt
          ? String((dt as { name?: string }).name ?? "")
          : String(dt);
    }
    const mappable =
      !skippedByOverride &&
      !hiddenExcludedByConfig &&
      findMapping(ctrl.meta, ctrl.name, typeOverrides) !== undefined;

    controls.push({
      name: ctrl.name,
      mappable,
      skippedByOverride,
      typeOverride:
        typeOverride && typeOverride.length > 0 ? typeOverride : null,
      hidden,
      hiddenExcludedByConfig,
    });
  }

  return {
    device: {
      id: wbDevice.name,
      titleForValidation,
      skippedByPrefix,
      inStaticDevicesList,
      validateDevicePasses,
      hasMappableEarly,
      exposureHint,
    },
    controls,
  };
}
