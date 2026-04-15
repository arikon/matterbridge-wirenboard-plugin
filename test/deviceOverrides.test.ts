/**
 * Tests for deviceOverrides normalization and Matter type resolution.
 */

import { describe, expect, it, jest } from "@jest/globals";
import type { DeviceTypeDefinition } from "matterbridge";
import { onOffLight, onOffOutlet } from "matterbridge";

import {
  CONTROL_MAPPINGS,
  MATTER_DEVICE_TYPE_BY_NAME,
} from "../src/controlMapping.js";
import {
  normalizeDeviceOverridesEntry,
  resolveMatterDeviceType,
} from "../src/deviceOverrides.js";

describe("resolveMatterDeviceType", () => {
  it("resolves known string to DeviceTypeDefinition", () => {
    expect(resolveMatterDeviceType("onOffOutlet")).toBe(onOffOutlet);
  });

  it("returns undefined for unknown string", () => {
    expect(resolveMatterDeviceType("notARealType")).toBeUndefined();
  });
});

describe("normalizeDeviceOverridesEntry", () => {
  const warn = jest.fn();

  it("returns undefined for null/undefined", () => {
    expect(normalizeDeviceOverridesEntry(undefined, warn)).toBeUndefined();
    expect(normalizeDeviceOverridesEntry(null, warn)).toBeUndefined();
  });

  it("warns and returns undefined when controls is missing", () => {
    warn.mockClear();
    expect(
      normalizeDeviceOverridesEntry(
        { Relay: { deviceType: "onOffLight" } },
        warn,
      ),
    ).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("controls"))).toBe(
      true,
    );
  });

  it("parses nested controls with deviceType and skip", () => {
    const n = normalizeDeviceOverridesEntry(
      {
        name: " Panel ",
        controls: {
          "Relay 1": { deviceType: "onOffLight" },
          Temp: { skip: true },
        },
      },
      warn,
    );
    expect(n).toBeDefined();
    expect(n!.displayName).toBe("Panel");
    expect(n!.skippedControls.has("Temp")).toBe(true);
    expect(n!.typeOverrides["Relay 1"]).toBe(onOffLight);
    expect(n!.typeOverrides["Temp"]).toBeUndefined();
  });

  it("trims display name and skips empty name", () => {
    const n = normalizeDeviceOverridesEntry(
      { name: "   ", controls: {} },
      warn,
    );
    expect(n!.displayName).toBeUndefined();
  });

  it("accepts empty controls object", () => {
    const n = normalizeDeviceOverridesEntry({ controls: {} }, warn);
    expect(n!.skippedControls.size).toBe(0);
    expect(Object.keys(n!.typeOverrides).length).toBe(0);
  });
});

describe("MATTER_DEVICE_TYPE_BY_NAME", () => {
  it("contains exactly the DeviceTypeDefinition refs used in CONTROL_MAPPINGS", () => {
    const unique = new Set<DeviceTypeDefinition>();
    for (const row of CONTROL_MAPPINGS) {
      unique.add(row.matterDeviceType);
    }
    const fromRegistry = new Set(Object.values(MATTER_DEVICE_TYPE_BY_NAME));
    expect(fromRegistry.size).toBe(unique.size);
    for (const dt of unique) {
      expect(fromRegistry.has(dt)).toBe(true);
    }
  });
});
