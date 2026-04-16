/**
 * Accumulate `WbDevice` map from MQTT meta events (same idea as platform / verify script).
 *
 * @file mqttInventory/collectModel.ts
 */

import type { AnsiLogger } from "matterbridge/logger";

import type {
  ControlMetaEvent,
  DeviceMetaEvent,
  WirenboardMqtt,
} from "../wirenboardMqtt.js";
import type {
  WbControlMeta,
  WbDevice,
  WbDeviceMeta,
} from "../wirenboardTypes.js";

export type DeviceMap = Map<string, WbDevice>;

/**
 *
 */
export function createEmptyDeviceMap(): DeviceMap {
  return new Map();
}

/**
 *
 */
export function attachInventoryCollectors(
  mqtt: WirenboardMqtt,
  deviceMap: DeviceMap,
  onMeta: () => void,
): void {
  mqtt.on("device-meta", (evt: DeviceMetaEvent) => {
    onMeta();
    upsertDeviceMeta(deviceMap, evt.deviceName, evt.meta);
  });
  mqtt.on("control-meta", (evt: ControlMetaEvent) => {
    onMeta();
    upsertControlMeta(deviceMap, evt.deviceName, evt.controlName, evt.meta);
  });
}

/**
 *
 */
export function upsertDeviceMeta(
  deviceMap: DeviceMap,
  deviceName: string,
  meta: WbDeviceMeta,
): void {
  const existing = deviceMap.get(deviceName);
  if (existing) {
    existing.meta = meta;
  } else {
    deviceMap.set(deviceName, {
      name: deviceName,
      meta,
      controls: new Map(),
    });
  }
}

/**
 *
 */
export function upsertControlMeta(
  deviceMap: DeviceMap,
  deviceName: string,
  controlName: string,
  meta: WbControlMeta,
): void {
  let device = deviceMap.get(deviceName);
  if (!device) {
    device = {
      name: deviceName,
      meta: { driver: "", title: deviceName },
      controls: new Map(),
    };
    deviceMap.set(deviceName, device);
  }
  const existing = device.controls.get(controlName);
  if (existing) {
    existing.meta = meta;
  } else {
    device.controls.set(controlName, {
      name: controlName,
      meta,
      value: undefined,
      error: undefined,
    });
  }
}

/**
 * Logger for the inventory CLI: diagnostics to **stderr** so stdout stays clean
 * for `--json` / human report only.
 */
export function inventoryMqttLog(): AnsiLogger {
  const line = (m: string) => {
    process.stderr.write(`${String(m)}\n`);
  };
  return {
    info: line,
    warn: line,
    error: line,
    debug: () => {},
  } as unknown as AnsiLogger;
}
