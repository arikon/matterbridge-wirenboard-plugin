/**
 * Wirenboard controller (`system` device) → Bridged Device Basic Information mapping.
 * Applies only when WB device id is `system` (not peripheral modules).
 *
 * @file systemMetadataMapping.ts
 */

import type { MatterbridgeEndpoint } from "matterbridge";
import type { AnsiLogger } from "matterbridge/logger";
import { BridgedDeviceBasicInformation } from "matterbridge/matter/clusters";

import type { WbControl } from "./wirenboardTypes.js";

/** WB MQTT device id for the Wirenboard controller */
export const WB_SYSTEM_DEVICE_ID = "system";

/** Matter string length limits (Bridged Device Basic Information / Basic Information) */
export const BI_MAX = {
  serialNumber: 32,
  partNumber: 32,
  softwareVersionString: 64,
  hardwareVersionString: 64,
  manufacturingDate: 16,
  productLabel: 64,
} as const;

export interface ControllerHwMetadata {
  serialNumber?: string;
  softwareVersionString?: string;
  hardwareVersionString?: string;
  partNumber?: string;
  manufacturingDate?: string;
  productLabel?: string;
  consumedControls: Set<string>;
  productLabelParts: {
    releaseName?: string;
    releaseSuite?: string;
    temperatureGrade?: string;
  };
}

interface MatchRule {
  test: (nameLower: string) => boolean;
  kind:
    | "serial"
    | "partNumber"
    | "hardwareVersionString"
    | "manufacturingDate"
    | "fw"
    | "dts"
    | "releaseName"
    | "releaseSuite"
    | "temperatureGrade";
}

const RULES: MatchRule[] = [
  { test: (n) => n.includes("short sn"), kind: "serial" },
  {
    test: (n) =>
      n.includes("batch no") || (n.includes("batch") && n.includes("no")),
    kind: "partNumber",
  },
  { test: (n) => n.includes("manufacturing date"), kind: "manufacturingDate" },
  { test: (n) => n.includes("hw revision"), kind: "hardwareVersionString" },
  { test: (n) => n.includes("dts version"), kind: "dts" },
  { test: (n) => n.includes("release suite"), kind: "releaseSuite" },
  {
    test: (n) => n.includes("release name") && !n.includes("suite"),
    kind: "releaseName",
  },
  {
    test: (n) => n.includes("temperature grade"),
    kind: "temperatureGrade",
  },
  {
    test: (n) =>
      (n.includes("fw version") ||
        n.includes("firmware version") ||
        n.includes("fw_version")) &&
      !n.includes("dts"),
    kind: "fw",
  },
  {
    test: (n) =>
      (n.includes("hw batch") ||
        n.includes("hw_batch") ||
        n.includes("hardware version")) &&
      !n.includes("hw revision"),
    kind: "hardwareVersionString",
  },
  { test: (n) => n.includes("serial"), kind: "serial" },
];

/**
 * Normalize WB date string to Matter Bridged Device Basic Information format (YYYYMMDD).
 */
export function normalizeManufacturingDate(value: string): string | undefined {
  const s = value.trim();
  if (!s) return undefined;
  if (/^\d{8}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && iso[1] && iso[2] && iso[3]) return `${iso[1]}${iso[2]}${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    const dd = dmy[1]?.padStart(2, "0") ?? "01";
    const mm = dmy[2]?.padStart(2, "0") ?? "01";
    const yyyy = dmy[3] ?? "";
    if (yyyy.length === 4) return `${yyyy}${mm}${dd}`;
  }
  return undefined;
}

/** Truncate to Matter BI string max length; log once when truncated. */
function truncate(
  key: keyof typeof BI_MAX,
  value: string,
  logDebug: (msg: string) => void,
): string {
  const max = BI_MAX[key];
  if (value.length <= max) return value;
  logDebug(
    `BridgedDeviceBasicInformation ${String(key)} truncated to ${max} chars`,
  );
  return value.slice(0, max);
}

/** Combine release / grade parts for `productLabel`. */
function buildProductLabel(
  parts: ControllerHwMetadata["productLabelParts"],
): string {
  const bits: string[] = [];
  if (parts.releaseSuite?.trim()) bits.push(parts.releaseSuite.trim());
  if (parts.releaseName?.trim()) bits.push(parts.releaseName.trim());
  if (parts.temperatureGrade?.trim()) bits.push(parts.temperatureGrade.trim());
  return bits.join(" · ");
}

/** Merge FW line and DTS into one `softwareVersionString`. */
function mergeSoftwareVersion(fw?: string, dts?: string): string | undefined {
  const f = fw?.trim();
  const d = dts?.trim();
  if (f && d) return `${f} | DTS: ${d}`;
  if (f) return f;
  if (d) return `DTS: ${d}`;
  return undefined;
}

/**
 * Extract controller-only metadata for WB device `system`.
 * Only readonly `text` controls participate.
 */
export function extractSystemControllerMetadata(
  controls: Map<string, WbControl>,
  logDebug: (msg: string) => void,
): ControllerHwMetadata {
  const consumed = new Set<string>();
  const parts: ControllerHwMetadata["productLabelParts"] = {};
  let serial: string | undefined;
  let partNumber: string | undefined;
  let hardwareVersionString: string | undefined;
  let manufacturingDate: string | undefined;
  let fw: string | undefined;
  let dts: string | undefined;

  for (const [, ctrl] of controls) {
    if (ctrl.meta.type !== "text" || ctrl.meta.readonly !== true) continue;
    const nameLower = ctrl.name.toLowerCase();
    const val = ctrl.value?.trim();
    if (val === undefined || val === "") continue;

    for (const rule of RULES) {
      if (!rule.test(nameLower)) continue;
      consumed.add(ctrl.name);
      switch (rule.kind) {
        case "serial":
          serial = truncate("serialNumber", val, logDebug);
          break;
        case "partNumber":
          partNumber = truncate("partNumber", val, logDebug);
          break;
        case "hardwareVersionString":
          hardwareVersionString = truncate(
            "hardwareVersionString",
            val,
            logDebug,
          );
          break;
        case "manufacturingDate": {
          const norm = normalizeManufacturingDate(val);
          if (norm)
            manufacturingDate = truncate("manufacturingDate", norm, logDebug);
          else logDebug(`Manufacturing Date not parseable: ${val}`);
          break;
        }
        case "fw":
          fw = val;
          break;
        case "dts":
          dts = val;
          break;
        case "releaseName":
          parts.releaseName = val;
          break;
        case "releaseSuite":
          parts.releaseSuite = val;
          break;
        case "temperatureGrade":
          parts.temperatureGrade = val;
          break;
        default:
          break;
      }
      break;
    }
  }

  const mergedSw = mergeSoftwareVersion(fw, dts);
  const softwareVersionString = mergedSw
    ? truncate("softwareVersionString", mergedSw, logDebug)
    : undefined;
  const productLabelRaw = buildProductLabel(parts);
  const productLabel = productLabelRaw
    ? truncate("productLabel", productLabelRaw, logDebug)
    : undefined;

  return {
    serialNumber: serial,
    softwareVersionString,
    hardwareVersionString,
    partNumber,
    manufacturingDate,
    productLabel,
    consumedControls: consumed,
    productLabelParts: parts,
  };
}

/**
 * Legacy per-device HW hints (Serial / FW / HW batch keywords) for non-`system` WB devices.
 */
export function extractLegacyHwMetadata(
  controls: Map<string, WbControl>,
): Pick<
  ControllerHwMetadata,
  | "serialNumber"
  | "softwareVersionString"
  | "hardwareVersionString"
  | "consumedControls"
> {
  const consumed = new Set<string>();
  let serialNumber: string | undefined;
  let softwareVersionString: string | undefined;
  let hardwareVersionString: string | undefined;

  const matches = (name: string, kws: string[]) => {
    const lower = name.toLowerCase();
    return kws.some((kw) => lower.includes(kw));
  };

  for (const [, ctrl] of controls) {
    if (ctrl.meta.type !== "text") continue;
    if (matches(ctrl.name, ["serial"])) {
      if (ctrl.value !== undefined) serialNumber = ctrl.value;
      consumed.add(ctrl.name);
    } else if (
      matches(ctrl.name, ["fw version", "firmware version", "fw_version"])
    ) {
      if (ctrl.value !== undefined) softwareVersionString = ctrl.value;
      consumed.add(ctrl.name);
    } else if (
      matches(ctrl.name, ["hw batch", "hw_batch", "hardware version"])
    ) {
      if (ctrl.value !== undefined) hardwareVersionString = ctrl.value;
      consumed.add(ctrl.name);
    }
  }

  return {
    serialNumber,
    softwareVersionString,
    hardwareVersionString,
    consumedControls: consumed,
  };
}

/** Per-device HW hints (controller `system` uses {@link ControllerHwMetadata}). */
export type UnifiedHwMetadata = ControllerHwMetadata;

/**
 * Merge legacy extract with controller extract shape for WirenboardDevice storage.
 */
export function extractHwMetadataForDevice(
  deviceName: string,
  controls: Map<string, WbControl>,
  logDebug: (msg: string) => void,
): UnifiedHwMetadata {
  if (deviceName === WB_SYSTEM_DEVICE_ID) {
    return extractSystemControllerMetadata(controls, logDebug);
  }
  const leg = extractLegacyHwMetadata(controls);
  return {
    serialNumber: leg.serialNumber,
    softwareVersionString: leg.softwareVersionString,
    hardwareVersionString: leg.hardwareVersionString,
    partNumber: undefined,
    manufacturingDate: undefined,
    productLabel: undefined,
    consumedControls: leg.consumedControls,
    productLabelParts: {},
  };
}

const BI_SNAPSHOT_ATTRS = [
  "serialNumber",
  "softwareVersionString",
  "hardwareVersionString",
  "manufacturingDate",
  "partNumber",
  "productLabel",
] as const;

/**
 * Push controller metadata into Bridged Device Basic Information (after cluster server exists).
 */
export function applyControllerBridgedBiSnapshot(
  endpoint: MatterbridgeEndpoint,
  meta: ControllerHwMetadata,
  log: AnsiLogger,
): void {
  const cid = BridgedDeviceBasicInformation.Cluster.id;
  const snap: Record<string, string | undefined> = {
    serialNumber: meta.serialNumber,
    softwareVersionString: meta.softwareVersionString,
    hardwareVersionString: meta.hardwareVersionString,
    manufacturingDate: meta.manufacturingDate,
    partNumber: meta.partNumber,
    productLabel: meta.productLabel,
  };
  for (const key of BI_SNAPSHOT_ATTRS) {
    const val = snap[key];
    if (val === undefined || val === "") continue;
    void endpoint.setAttribute(cid, key, val, log).catch((err: unknown) => {
      log.debug(
        `BridgedDeviceBasicInformation.${key} setAttribute: ${String(err)}`,
      );
    });
  }
}
