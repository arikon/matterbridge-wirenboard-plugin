/**
 * Unit tests for canonical control/device name ordering.
 */

import { describe, expect, it } from "@jest/globals";

import {
  compareCanonicalControlNames,
  sortedControlsByCanonicalName,
} from "../src/canonicalOrdering.js";
import type { WbControl } from "../src/wirenboardTypes.js";

describe("canonicalOrdering", () => {
  it("compareCanonicalControlNames sorts lexically with numeric awareness", () => {
    expect(compareCanonicalControlNames("K2", "K10")).toBeLessThan(0);
    expect(compareCanonicalControlNames("K10", "K2")).toBeGreaterThan(0);
    expect(compareCanonicalControlNames("K1", "K1")).toBe(0);
    expect(compareCanonicalControlNames("a", "B")).toBeLessThan(0);
  });

  it("sortedControlsByCanonicalName is independent of Map insertion order", () => {
    const c1: WbControl = {
      name: "K1",
      meta: { type: "switch" },
      value: "0",
      error: undefined,
    };
    const c2: WbControl = {
      name: "K2",
      meta: { type: "switch" },
      value: "0",
      error: undefined,
    };
    const forward = new Map<string, WbControl>([
      [c1.name, c1],
      [c2.name, c2],
    ]);
    const reverse = new Map<string, WbControl>([
      [c2.name, c2],
      [c1.name, c1],
    ]);
    const a = sortedControlsByCanonicalName(forward).map((c) => c.name);
    const b = sortedControlsByCanonicalName(reverse).map((c) => c.name);
    expect(a).toEqual(["K1", "K2"]);
    expect(b).toEqual(["K1", "K2"]);
  });
});
