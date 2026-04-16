/**
 * @file validateDeviceConfig.test.ts
 */

import { describe, expect, it } from "@jest/globals";

import { validateDeviceConfig } from "../src/validateDeviceConfig.js";

describe("validateDeviceConfig (Matterbridge-compatible)", () => {
  it("validates with white and black list", () => {
    const whiteList = ["white1", "white2", "white3"];
    const blackList = ["black1", "black2", "black3"];
    expect(validateDeviceConfig(whiteList, blackList, "white1")).toBe(true);
    expect(validateDeviceConfig(whiteList, blackList, "black2")).toBe(false);
    expect(
      validateDeviceConfig(whiteList, blackList, ["white1", "black2"]),
    ).toBe(false);
    expect(validateDeviceConfig(whiteList, blackList, "xDevice")).toBe(false);
    expect(validateDeviceConfig(whiteList, blackList, "")).toBe(false);
  });

  it("validates with white list only", () => {
    const whiteList = ["white1", "white2", "white3"];
    expect(validateDeviceConfig(whiteList, [], "white1")).toBe(true);
    expect(validateDeviceConfig(whiteList, [], "black2")).toBe(false);
    expect(validateDeviceConfig(whiteList, [], ["white1", "black2"])).toBe(
      true,
    );
    expect(validateDeviceConfig(whiteList, [], "xDevice")).toBe(false);
    expect(validateDeviceConfig(whiteList, [], "")).toBe(false);
  });

  it("validates with black list only", () => {
    const blackList = ["black1", "black2", "black3"];
    expect(validateDeviceConfig([], blackList, "whiteDevice")).toBe(true);
    expect(validateDeviceConfig([], blackList, "black1")).toBe(false);
    expect(validateDeviceConfig([], blackList, ["x", "y", "z"])).toBe(true);
    expect(validateDeviceConfig([], blackList, ["x", "y", "z", "black3"])).toBe(
      false,
    );
    expect(validateDeviceConfig([], blackList, "xDevice")).toBe(true);
    expect(validateDeviceConfig([], blackList, "")).toBe(true);
  });

  it("validates with no white and no black list", () => {
    expect(validateDeviceConfig([], [], "any")).toBe(true);
    expect(validateDeviceConfig(undefined, undefined, "any")).toBe(true);
  });
});
