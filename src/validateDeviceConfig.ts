/**
 * Pure whitelist/blacklist check aligned with Matterbridge `MatterbridgePlatform.validateDevice`.
 *
 * @file validateDeviceConfig.ts
 */

/**
 *
 */
function isValidArrayMin(
  value: unknown,
  minLength: number,
): value is unknown[] {
  return Array.isArray(value) && value.length >= minLength;
}

/**
 * @param whiteList - plugin config `whiteList` (string array or undefined)
 * @param blackList - plugin config `blackList`
 * @param device - same as `validateDevice([title, serial])`: one or more strings
 */
export function validateDeviceConfig(
  whiteList: string[] | undefined,
  blackList: string[] | undefined,
  device: string | string[],
): boolean {
  const ids = Array.isArray(device) ? device : [device];

  let blackListBlocked = 0;
  if (isValidArrayMin(blackList, 1)) {
    for (const d of ids) {
      if (blackList.includes(d)) blackListBlocked++;
    }
  }
  if (blackListBlocked > 0) return false;

  let whiteListPassed = 0;
  if (isValidArrayMin(whiteList, 1)) {
    for (const d of ids) {
      if (whiteList.includes(d)) whiteListPassed++;
    }
  } else {
    whiteListPassed++;
  }
  return whiteListPassed > 0;
}
