/**
 * Canonical ordering for Wiren Board control and device names.
 * Used so Matter endpoint construction order does not depend on Map insertion order.
 * Matter.js/Matterbridge assign endpoint numbers from construction order; explicit
 * `EndpointNumber` in endpoint options is reserved for a future follow-up if needed.
 *
 * @file canonicalOrdering.ts
 */

import type { WbControl } from "./wirenboardTypes.js";

/**
 * Stable lexicographic order for control/device identifiers (en, numeric-aware).
 *
 * @param a - control or device name
 * @param b - control or device name
 */
export function compareCanonicalControlNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/**
 * Control values sorted by control name — single source for thermostat detection,
 * mappable list, and any logic that must not depend on `Map` iteration order.
 *
 * @param controls - WB device controls map
 */
export function sortedControlsByCanonicalName(
  controls: Map<string, WbControl>,
): WbControl[] {
  return [...controls.values()].sort((x, y) =>
    compareCanonicalControlNames(x.name, y.name),
  );
}
