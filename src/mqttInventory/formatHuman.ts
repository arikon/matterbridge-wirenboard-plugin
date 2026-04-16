/**
 * Human-readable inventory report.
 *
 * @file mqttInventory/formatHuman.ts
 */

import { compareCanonicalControlNames } from "../canonicalOrdering.js";
import { formatBadge } from "./badges.js";
import type { InventoryJsonReport } from "./formatJson.js";

/** Effective flags used for annotations (from config or defaults). */
export interface HumanReportAnnotationContext {
  includeHidden: boolean;
  ignoreSystemPrefixedDevices: boolean;
  ignoreNetworkPrefixedDevices: boolean;
}

/**
 *
 */
function controlLine(
  c: InventoryJsonReport["devices"][0]["controls"][0],
  useColor: boolean,
): string {
  const parts: string[] = [];
  parts.push(
    c.mappable
      ? formatBadge("mappable", "mappable", useColor)
      : formatBadge("unmappable", "unmappable", useColor),
  );
  if (c.skippedByOverride) parts.push(formatBadge("skip", "skip", useColor));
  if (c.typeOverride) parts.push(formatBadge("override", "override", useColor));
  if (c.hidden) parts.push(formatBadge("hidden", "hidden", useColor));
  let extra = "";
  if (c.hiddenExcludedByConfig) {
    extra = "  (hidden in WB; not bridged while includeHidden=false)";
  }
  let line = `  - ${c.name}  ${parts.join(" ")}`;
  if (c.typeOverride) line += `  override=${c.typeOverride}`;
  line += `${extra}\n`;
  return line;
}

/**
 *
 */
function matterExplanation(
  da: InventoryJsonReport["devices"][0]["annotations"],
): string {
  if (da.skippedByPrefix) {
    return `Not registered in Matter (ignored: ${da.skippedByPrefix}-prefixed device id)`;
  }
  if (!da.hasMappableEarly) {
    return "Not registered (no mappable controls)";
  }
  if (!da.validateDevicePasses) {
    return "Not registered (blocked by white/black list)";
  }
  return "Would register in Matter (has at least one mappable control)";
}

/**
 *
 */
function staticDevicesNote(
  da: InventoryJsonReport["devices"][0]["annotations"],
): string | undefined {
  if (da.inStaticDevicesList === null || da.inStaticDevicesList === undefined) {
    return undefined;
  }
  return da.inStaticDevicesList
    ? "discoveryMode static: id is in devices[] (startup wait list)"
    : "discoveryMode static: id is not in devices[]";
}

/**
 *
 */
function printLegend(useColor: boolean, write: (s: string) => void): void {
  write("Legend:\n");
  write(
    `  ${formatBadge("mappable", "mappable", useColor)} / ${formatBadge("unmappable", "unmappable", useColor)} — Matter mapping for this control after overrides & hidden rules\n`,
  );
  write(
    "  matter: — whether the device would be registered as a bridged device (prefix / lists / mappable count)\n",
  );
  write(
    "  Full MQTT walk: list filters do not hide rows; they only affect Matter annotations.\n\n",
  );
}

/**
 *
 */
export function printHumanReport(
  report: InventoryJsonReport,
  useColor: boolean,
  write: (s: string) => void,
  annotationCtx?: HumanReportAnnotationContext,
): void {
  write("\n--- mb-wirenboard-verify-mqtt ---\n");
  write(
    `Broker: ${report.broker.protocol}://${report.broker.host}:${report.broker.port}\n`,
  );
  write(`Config loaded: ${report.configLoaded ? "yes" : "no"}`);
  if (report.configPath) write(` (${report.configPath})`);
  write("\n");
  write(
    `Grouping: ${report.effectiveGroupingMode} — ${report.groupingTopologyHint}\n`,
  );
  if (report.discoveryMode) {
    write(`discoveryMode: ${report.discoveryMode}\n`);
  }

  if (annotationCtx) {
    write(
      `Annotation flags: includeHidden=${annotationCtx.includeHidden}, ignoreSystemPrefixedDevices=${annotationCtx.ignoreSystemPrefixedDevices}, ignoreNetworkPrefixedDevices=${annotationCtx.ignoreNetworkPrefixedDevices}\n`,
    );
    if (!report.configLoaded) {
      write(
        "(above defaults apply when no plugin JSON was loaded — use --config or a standard path to match Matterbridge)\n",
      );
    }
  }

  write("\n");
  printLegend(useColor, write);

  const ids = [...report.devices.map((d) => d.id)].sort(
    compareCanonicalControlNames,
  );

  if (ids.length === 0) {
    write(
      "No Wiren Board devices in this inventory (no /devices/…/meta seen). Check broker address, credentials, and that the controller publishes device meta.\n\n",
    );
  }

  for (const id of ids) {
    const d = report.devices.find((x) => x.id === id);
    if (!d) continue;
    const da = d.annotations;

    const total = d.controls.length;
    const mappableN = d.controls.filter((c) => c.mappable).length;
    const unmappableN = total - mappableN;

    write(`── ${d.id} ──\n`);
    write(`  title: ${d.titleForValidation}\n`);
    write(
      `  controls: ${total} total · ${mappableN} mappable · ${unmappableN} unmappable\n`,
    );
    write(`  matter: ${matterExplanation(da)}\n`);
    const staticNote = staticDevicesNote(da);
    if (staticNote) write(`  ${staticNote}\n`);

    if (da.skippedByPrefix && mappableN > 0) {
      write(
        "  note: controls still listed for inventory; device is excluded by prefix rule before Matter registration.\n",
      );
    }

    if (total === 0) {
      write(
        "  (no controls in this inventory — nothing under /devices/.../controls/... yet)\n\n",
      );
      continue;
    }

    for (const c of d.controls) {
      write(controlLine(c, useColor));
    }
    write("\n");
  }
  write("OK — inventory complete.\n");
}
