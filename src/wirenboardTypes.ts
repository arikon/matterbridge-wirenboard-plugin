/**
 * TypeScript types for Wirenboard MQTT conventions.
 *
 * @file wirenboardTypes.ts
 */

/** Actual control types supported by Wirenboard */
export type WbControlType =
  | "switch"
  | "wo-switch"
  | "alarm"
  | "pushbutton"
  | "range"
  | "dimmer"
  | "rgb"
  | "text"
  | "value"
  | "enum"
  | "unixtime"
  | "w1-id";

/**
 * Deprecated control types from older WB drivers.
 * These get normalized to 'value' + appropriate units before mapping.
 */
export type WbDeprecatedControlType =
  | "temperature"
  | "rel_humidity"
  | "atmospheric_pressure"
  | "rainfall"
  | "wind_speed"
  | "power"
  | "power_consumption"
  | "voltage"
  | "water_flow"
  | "water_consumption"
  | "resistance"
  | "concentration"
  | "heat_power"
  | "heat_energy"
  | "current"
  | "pressure"
  | "lux"
  | "sound_level";

export interface WbDeviceMeta {
  driver: string;
  title: { en: string; ru?: string } | string;
  error?: string;
}

export interface WbControlMeta {
  type: WbControlType | WbDeprecatedControlType;
  units?: string;
  readonly?: boolean;
  /** Default: 0 for range */
  min?: number;
  /** Default: 255 for range, 10^9 for value */
  max?: number;
  /** Rounding precision when sending values to MQTT */
  precision?: number;
  /** Display order in UI */
  order?: number;
  /** Hidden control — skip by default */
  hidden?: boolean;
  title?: { en: string; ru?: string } | string;
  enum?: Record<string, { en: string; ru?: string }>;
}

export interface WbDevice {
  name: string;
  meta: WbDeviceMeta;
  controls: Map<string, WbControl>;
}

export interface WbControl {
  name: string;
  meta: WbControlMeta;
  value: string | undefined;
  error: string | undefined;
}
