/**
 * JSON report for `mb-wirenboard-verify-mqtt --json`.
 * Stable shape for `schemaVersion` 1 is validated in tests against `mqtt-inventory-report.schema.json`.
 *
 * @file mqttInventory/formatJson.ts
 */

import type { DeviceAnnotation } from "./annotate.js";

export interface InventoryJsonReport {
  schemaVersion: 1;
  configLoaded: boolean;
  configPath?: string;
  effectiveGroupingMode: string;
  groupingTopologyHint: string;
  discoveryMode?: string;
  broker: { protocol: string; host: string; port: number };
  devices: Array<{
    id: string;
    titleForValidation: string;
    annotations: {
      skippedByPrefix: DeviceAnnotation["skippedByPrefix"];
      inStaticDevicesList: DeviceAnnotation["inStaticDevicesList"];
      validateDevicePasses: boolean;
      hasMappableEarly: boolean;
      exposureHint: string;
    };
    controls: Array<{
      name: string;
      mappable: boolean;
      skippedByOverride: boolean;
      typeOverride: string | null;
      hidden: boolean;
      hiddenExcludedByConfig: boolean;
    }>;
  }>;
}

/**
 *
 */
export function serializeInventoryJson(report: InventoryJsonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
