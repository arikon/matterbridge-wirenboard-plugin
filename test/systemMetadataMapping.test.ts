/**
 * @file systemMetadataMapping.test.ts
 */

import { describe, expect, it } from "@jest/globals";

import {
  extractHwMetadataForDevice,
  extractSystemControllerMetadata,
  normalizeManufacturingDate,
  WB_SYSTEM_DEVICE_ID,
} from "../src/systemMetadataMapping.js";
import type { WbControl } from "../src/wirenboardTypes.js";

function textControl(name: string, value: string, readonly = true): WbControl {
  return {
    name,
    meta: { type: "text", readonly },
    value,
  };
}

describe("normalizeManufacturingDate", () => {
  it("passes through YYYYMMDD", () => {
    expect(normalizeManufacturingDate("20240315")).toBe("20240315");
  });

  it("parses ISO date prefix", () => {
    expect(normalizeManufacturingDate("2024-03-15")).toBe("20240315");
  });

  it("parses DMY with dots", () => {
    expect(normalizeManufacturingDate("15.03.2024")).toBe("20240315");
  });
});

describe("extractSystemControllerMetadata", () => {
  const noop = (): void => {};

  it("maps Short SN and Batch No on system device", () => {
    const controls = new Map<string, WbControl>([
      ["Short SN", textControl("Short SN", "ABC")],
      ["Batch No", textControl("Batch No", "B-1")],
    ]);
    const m = extractSystemControllerMetadata(controls, noop);
    expect(m.serialNumber).toBe("ABC");
    expect(m.partNumber).toBe("B-1");
    expect(m.consumedControls.has("Short SN")).toBe(true);
    expect(m.consumedControls.has("Batch No")).toBe(true);
  });

  it("merges FW and DTS into softwareVersionString", () => {
    const controls = new Map<string, WbControl>([
      ["FW Version", textControl("FW Version", "1.2.3")],
      ["DTS Version", textControl("DTS Version", "9")],
    ]);
    const m = extractSystemControllerMetadata(controls, noop);
    expect(m.softwareVersionString).toContain("1.2.3");
    expect(m.softwareVersionString).toContain("DTS:");
  });

  it("builds productLabel from release fields", () => {
    const controls = new Map<string, WbControl>([
      ["Release suite", textControl("Release suite", "stable")],
      ["Release name", textControl("Release name", "wb7")],
      ["Temperature Grade", textControl("Temperature Grade", "C")],
    ]);
    const m = extractSystemControllerMetadata(controls, noop);
    expect(m.productLabel).toContain("stable");
    expect(m.productLabel).toContain("wb7");
    expect(m.productLabel).toContain("C");
  });
});

describe("extractHwMetadataForDevice", () => {
  const noop = (): void => {};

  it("uses legacy path for non-system device", () => {
    const controls = new Map<string, WbControl>([
      ["Serial", textControl("Serial", "XYZ")],
    ]);
    const m = extractHwMetadataForDevice("wb-mr6c_28", controls, noop);
    expect(m.serialNumber).toBe("XYZ");
    expect(m.consumedControls.has("Serial")).toBe(true);
  });

  it("does not map Batch No on peripheral when name would match", () => {
    const controls = new Map<string, WbControl>([
      ["Batch No", textControl("Batch No", "X")],
    ]);
    const m = extractHwMetadataForDevice("wb-mr6c_28", controls, noop);
    expect(m.partNumber).toBeUndefined();
    expect(m.consumedControls.size).toBe(0);
  });

  it("uses controller path for system device id", () => {
    const controls = new Map<string, WbControl>([
      ["Batch No", textControl("Batch No", "P99")],
    ]);
    const m = extractHwMetadataForDevice(WB_SYSTEM_DEVICE_ID, controls, noop);
    expect(m.partNumber).toBe("P99");
  });
});
