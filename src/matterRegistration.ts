/**
 * Shared registration predicates and title resolution (platform + inventory CLI).
 *
 * @file matterRegistration.ts
 */

import { DeviceOverrides, findMapping } from "./controlMapping.js";
import type { NormalizedDeviceOverridesEntry } from "./deviceOverrides.js";
import { GroupingMode, isSystemDevice } from "./wirenboardDevice.js";
import type { WbDevice } from "./wirenboardTypes.js";

/** WB device ids for network-related drivers often start with this prefix (e.g. `networks`). */
export function isNetworkPrefixedDevice(deviceName: string): boolean {
  return deviceName.startsWith("network");
}

/**
 *
 */
export function appliesSystemPrefixedSkip(
  deviceName: string,
  ignoreSystemPrefixedDevices: boolean,
): boolean {
  return ignoreSystemPrefixedDevices && isSystemDevice(deviceName);
}

/**
 *
 */
export function appliesNetworkPrefixedSkip(
  deviceName: string,
  ignoreNetworkPrefixedDevices: boolean,
): boolean {
  return ignoreNetworkPrefixedDevices && isNetworkPrefixedDevice(deviceName);
}

export interface MatterRegistrationSkipOptions {
  ignoreSystemPrefixedDevices: boolean;
  ignoreNetworkPrefixedDevices: boolean;
}

/** Pure predicate: whether this WB device must not be registered as Matter (prefix rules only). */
export function shouldSkipMatterRegistration(
  deviceName: string,
  opts: MatterRegistrationSkipOptions,
): boolean {
  return (
    appliesSystemPrefixedSkip(deviceName, opts.ignoreSystemPrefixedDevices) ||
    appliesNetworkPrefixedSkip(deviceName, opts.ignoreNetworkPrefixedDevices)
  );
}

/**
 *
 */
export function resolveBaseDeviceTitle(wbDevice: WbDevice): string {
  const t = wbDevice.meta.title;
  if (typeof t === "string") return t || wbDevice.name;
  return t.en || wbDevice.name;
}

/**
 *
 */
export function resolveDeviceTitleForValidation(
  wbDevice: WbDevice,
  normalizedOv: NormalizedDeviceOverridesEntry | undefined,
): string {
  const baseTitle = resolveBaseDeviceTitle(wbDevice);
  return normalizedOv?.displayName ?? baseTitle;
}

/**
 * Same check as `registerWbDevice` before `WirenboardDevice.create`: any control maps after skips/overrides.
 */
export function deviceHasMappableControlEarlyCheck(
  wbDevice: WbDevice,
  typeOverrides: DeviceOverrides | undefined,
  skippedFromConfig: ReadonlySet<string> | undefined,
): boolean {
  return [...wbDevice.controls.values()].some((ctrl) => {
    if (skippedFromConfig?.has(ctrl.name)) return false;
    return findMapping(ctrl.meta, ctrl.name, typeOverrides) !== undefined;
  });
}

/** Short human description for `groupingMode` impact on Matter topology. */
export function describeGroupingModeTopology(mode: GroupingMode): string {
  return mode === "device"
    ? "One Matter bridged device per WB device (controls as child endpoints)"
    : "One Matter bridged device per WB control (more Matter nodes)";
}
