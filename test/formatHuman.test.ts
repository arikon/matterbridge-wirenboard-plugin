/**
 * @file formatHuman.test.ts
 */

import { describe, expect, it } from "@jest/globals";

import { printHumanReport } from "../src/mqttInventory/formatHuman.js";
import type { InventoryJsonReport } from "../src/mqttInventory/formatJson.js";

describe("printHumanReport", () => {
  it("prints legend, annotation flags, device summary, and matter line without redundant prefix badges", () => {
    const report: InventoryJsonReport = {
      schemaVersion: 1,
      configLoaded: false,
      effectiveGroupingMode: "device",
      groupingTopologyHint: "hint",
      broker: { protocol: "mqtt", host: "h", port: 1883 },
      devices: [
        {
          id: "network",
          titleForValidation: "Network",
          annotations: {
            skippedByPrefix: "network",
            inStaticDevicesList: null,
            validateDevicePasses: true,
            hasMappableEarly: true,
            exposureHint: "skipped:prefix-network",
          },
          controls: [
            {
              name: "Ethernet IP Connection Enabled",
              mappable: true,
              skippedByOverride: false,
              typeOverride: null,
              hidden: false,
              hiddenExcludedByConfig: false,
            },
          ],
        },
        {
          id: "wb-empty",
          titleForValidation: "Empty",
          annotations: {
            skippedByPrefix: null,
            inStaticDevicesList: null,
            validateDevicePasses: true,
            hasMappableEarly: false,
            exposureHint: "skipped:no-mappable-controls",
          },
          controls: [],
        },
      ],
    };
    let out = "";
    printHumanReport(
      report,
      false,
      (s) => {
        out += s;
      },
      {
        includeHidden: false,
        ignoreSystemPrefixedDevices: true,
        ignoreNetworkPrefixedDevices: true,
      },
    );
    expect(out).toContain("Legend:");
    expect(out).toContain(
      "  [skip] — control excluded from Matter mapping (deviceOverrides skip)\n",
    );
    expect(out).toContain(
      "  [override] — type override from config; control line may include override=<type>\n",
    );
    expect(out).toContain(
      "  [hidden] — hidden in Wiren Board; a suffix explains when includeHidden=false skips bridging\n",
    );
    expect(out).toContain("Annotation flags:");
    expect(out).toContain("── network ──");
    expect(out).toContain(
      "controls: 1 total · 1 × [ mappable ] · 0 × [unmappable]",
    );
    expect(out).toContain(
      "Not registered in Matter (ignored: network-prefixed device id)",
    );
    expect(out).toContain(
      "note: controls still listed for inventory; device is excluded by prefix rule before Matter registration.",
    );
    expect(out).toContain("── wb-empty ──");
    expect(out).toContain("(no controls in this inventory");
    expect(out).not.toContain("[prefix:network]");
    expect(out).not.toContain("[skipped:prefix-network]");
  });

  it("pads control names within a device so badge column aligns", () => {
    const report: InventoryJsonReport = {
      schemaVersion: 1,
      configLoaded: true,
      effectiveGroupingMode: "device",
      groupingTopologyHint: "hint",
      broker: { protocol: "mqtt", host: "h", port: 1883 },
      devices: [
        {
          id: "hwmon",
          titleForValidation: "HW Monitor",
          annotations: {
            skippedByPrefix: null,
            inStaticDevicesList: null,
            validateDevicePasses: true,
            hasMappableEarly: true,
            exposureHint: "ok",
          },
          controls: [
            {
              name: "CPU Temperature",
              mappable: true,
              skippedByOverride: false,
              typeOverride: null,
              hidden: false,
              hiddenExcludedByConfig: false,
            },
            {
              name: "Battery Temperature",
              mappable: true,
              skippedByOverride: false,
              typeOverride: null,
              hidden: false,
              hiddenExcludedByConfig: false,
            },
          ],
        },
      ],
    };
    let out = "";
    printHumanReport(report, false, (s) => {
      out += s;
    });
    expect(out).toContain(
      "  - CPU Temperature      [ mappable ]\n  - Battery Temperature  [ mappable ]\n",
    );
  });
});
