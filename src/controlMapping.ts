/**
 * Static mapping table: WB control type → Matter device type / cluster / converter.
 *
 * @file controlMapping.ts
 */

import {
  airQualitySensor,
  contactSensor,
  coverDevice,
  DeviceTypeDefinition,
  dimmableLight,
  doorLockDevice,
  electricalSensor,
  extendedColorLight,
  fanDevice,
  flowSensor,
  genericSwitch,
  humiditySensor,
  lightSensor,
  occupancySensor,
  onOffOutlet,
  pressureSensor,
  pumpDevice,
  rainSensor,
  smokeCoAlarm,
  temperatureSensor,
  waterFreezeDetector,
  waterLeakDetector,
  waterValve,
} from "matterbridge";
import {
  AirQuality,
  BooleanState,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  ColorControl,
  DoorLock,
  ElectricalEnergyMeasurement,
  ElectricalPowerMeasurement,
  FanControl,
  FlowMeasurement,
  FormaldehydeConcentrationMeasurement,
  IlluminanceMeasurement,
  LevelControl,
  NitrogenDioxideConcentrationMeasurement,
  OccupancySensing,
  OnOff,
  OzoneConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  PressureMeasurement,
  RadonConcentrationMeasurement,
  RelativeHumidityMeasurement,
  SmokeCoAlarm,
  TemperatureMeasurement,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  ValveConfigurationAndControl,
  WindowCovering,
} from "matterbridge/matter/clusters";
import { ClusterId } from "matterbridge/matter/types";

import {
  WbControlMeta,
  WbControlType,
  WbDeprecatedControlType,
} from "./wirenboardTypes.js";

// ---------------------------------------------------------------------------
// AirQuality classification
// ---------------------------------------------------------------------------

/**
 *
 * @param ppm
 */
export function classifyCO2(ppm: number): AirQuality.AirQualityEnum {
  if (ppm < 400) return AirQuality.AirQualityEnum.Good;
  if (ppm < 800) return AirQuality.AirQualityEnum.Fair;
  if (ppm < 1500) return AirQuality.AirQualityEnum.Moderate;
  if (ppm < 2500) return AirQuality.AirQualityEnum.Poor;
  return AirQuality.AirQualityEnum.VeryPoor;
}

// ---------------------------------------------------------------------------
// RGB ↔ HSV conversion helpers
// ---------------------------------------------------------------------------

export interface HsvColor {
  hue: number; // 0–254 (Matter scale)
  sat: number; // 0–254
  val: number; // 0–254
}

/**
 * Convert WB rgb string "R;G;B" (0–255 each) to Matter HSV (0–254).
 *
 * @param rgb
 */
export function rgbStringToHsv(rgb: string): HsvColor {
  const parts = rgb.split(";");
  const r = parseInt(parts[0] ?? "0", 10) / 255;
  const g = parseInt(parts[1] ?? "0", 10) / 255;
  const b = parseInt(parts[2] ?? "0", 10) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
    h = (h * 60 + 360) % 360;
  }

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return {
    hue: Math.round((h / 360) * 254),
    sat: Math.round(s * 254),
    val: Math.round(v * 254),
  };
}

/**
 * Convert Matter HSV (0–254) back to WB rgb string "R;G;B".
 *
 * @param hsv
 */
export function hsvToRgbString(hsv: HsvColor): string {
  const h = (hsv.hue / 254) * 360;
  const s = hsv.sat / 254;
  const v = hsv.val / 254;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return `${Math.round((r + m) * 255)};${Math.round((g + m) * 255)};${Math.round((b + m) * 255)}`;
}

// ---------------------------------------------------------------------------
// Range / dimmer converters (WB value → Matter LevelControl 0–254)
// ---------------------------------------------------------------------------

/**
 * Matter Level Control: `currentLevel` must be within the cluster's minLevel..maxLevel.
 * Defaults are minLevel=1, maxLevel=254 — value 0 is invalid and triggers validation errors.
 */
export const MATTER_LEVEL_CONTROL_MIN = 1;
export const MATTER_LEVEL_CONTROL_MAX = 254;

/**
 * Scale WB range value to Matter level (0–254).
 * Used for ColorControl hue/saturation (full 0–254 span).
 *
 * @param value
 * @param min
 * @param max
 */
export function rangeToLevel(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const level = Math.round(((value - min) / (max - min)) * 254);
  return Math.max(0, Math.min(254, level));
}

/**
 * Scale Matter level (0–254) back to WB range value.
 *
 * @param level
 * @param min
 * @param max
 */
export function levelToRange(level: number, min: number, max: number): number {
  const clampedLevel = Math.max(0, Math.min(254, level));
  return Math.round((clampedLevel / 254) * (max - min) + min);
}

/**
 * WB range → Matter Level Control `currentLevel` (1–254, never 0).
 */
export function rangeToLevelControl(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) return MATTER_LEVEL_CONTROL_MIN;
  const t = (value - min) / (max - min);
  const span = MATTER_LEVEL_CONTROL_MAX - MATTER_LEVEL_CONTROL_MIN;
  const level = Math.round(MATTER_LEVEL_CONTROL_MIN + t * span);
  return Math.max(
    MATTER_LEVEL_CONTROL_MIN,
    Math.min(MATTER_LEVEL_CONTROL_MAX, level),
  );
}

/**
 * Matter Level Control level (1–254) → WB range. Invalid levels are clamped.
 */
export function levelControlToRange(
  level: number,
  min: number,
  max: number,
): number {
  if (max <= min) return min;
  const clamped = Math.max(
    MATTER_LEVEL_CONTROL_MIN,
    Math.min(MATTER_LEVEL_CONTROL_MAX, level),
  );
  const span = MATTER_LEVEL_CONTROL_MAX - MATTER_LEVEL_CONTROL_MIN;
  const t = (clamped - MATTER_LEVEL_CONTROL_MIN) / span;
  return Math.round(t * (max - min) + min);
}

/**
 * Clamp a value for Matter `currentLevel` (e.g. RGB brightness channel).
 */
export function clampLevelControlCurrentLevel(level: number): number {
  return Math.max(
    MATTER_LEVEL_CONTROL_MIN,
    Math.min(MATTER_LEVEL_CONTROL_MAX, level),
  );
}

// ---------------------------------------------------------------------------
// Precision rounding
// ---------------------------------------------------------------------------

/**
 * Round value to the precision step (e.g. precision=0.1 → 1 decimal place).
 * If precision is undefined or 0, return value unchanged.
 *
 * @param value
 * @param precision
 */
export function roundToPrecision(
  value: number,
  precision: number | undefined,
): number {
  if (!precision) return value;
  const factor = Math.round(1 / precision);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// WindowCovering converter (inverted: WB 0=closed,max=open; Matter 0=open,10000=closed)
// ---------------------------------------------------------------------------

/**
 *
 * @param value
 * @param max
 */
export function rangeToLiftPercent100ths(value: number, max: number): number {
  if (max <= 0) return 10000;
  return Math.round((1 - value / max) * 10000);
}

/**
 *
 * @param lift
 * @param max
 */
export function liftPercent100thsToRange(lift: number, max: number): number {
  return Math.round((1 - lift / 10000) * max);
}

// ---------------------------------------------------------------------------
// CCT (Color Temperature) converters
// ---------------------------------------------------------------------------

/**
 * Convert WB CCT range value (0–100, 0=warm/2700K, 100=cool/6500K) to Matter mireds.
 *
 * @param value
 */
export function cctRangeToMireds(value: number): number {
  return Math.round(370 - 2.16 * value);
}

/**
 * Convert Matter mireds back to WB CCT range value (0–100).
 *
 * @param mireds
 */
export function miredsToCtRange(mireds: number): number {
  return Math.max(0, Math.min(100, Math.round((370 - mireds) / 2.16)));
}

// ---------------------------------------------------------------------------
// Deprecated type normalization
// ---------------------------------------------------------------------------

const DEPRECATED_TYPE_MAP: Partial<
  Record<WbDeprecatedControlType, { type: "value"; units: string }>
> = {
  temperature: { type: "value", units: "deg C" },
  rel_humidity: { type: "value", units: "%" },
  atmospheric_pressure: { type: "value", units: "mbar" },
  pressure: { type: "value", units: "mbar" },
  lux: { type: "value", units: "lx" },
  power: { type: "value", units: "W" },
  voltage: { type: "value", units: "V" },
  current: { type: "value", units: "A" },
  power_consumption: { type: "value", units: "kWh" },
  concentration: { type: "value", units: "ppm" },
  water_flow: { type: "value", units: "m³/h" },
  // skip: sound_level, wind_speed, rainfall, water_consumption, resistance, heat_power, heat_energy
};

/**
 * Normalize deprecated WB control types to canonical {type:'value', units} form.
 *
 * @param meta
 */
export function normalizeDeprecatedType(meta: WbControlMeta): WbControlMeta {
  const norm = DEPRECATED_TYPE_MAP[meta.type as WbDeprecatedControlType];
  if (!norm) return meta;
  return { ...meta, type: norm.type, units: norm.units };
}

// ---------------------------------------------------------------------------
// Mapping interface
// ---------------------------------------------------------------------------

export interface WbToMatterMapping {
  wbType: WbControlType;
  wbUnits?: string;
  readonly?: boolean;
  /** Name keywords (lowercase) for name-based sub-type selection */
  nameKeywords?: string[];
  matterDeviceType: DeviceTypeDefinition;
  /** Cluster IDs used by this mapping */
  matterClusterIds: ClusterId[];
  /** Cluster that owns matterAttribute (defaults to matterClusterIds[0] if absent) */
  primaryClusterId?: ClusterId;
  matterAttribute: string;
  converter: (value: string, meta: WbControlMeta) => unknown;
  reverseConverter?: (value: unknown, meta: WbControlMeta) => string;
}

/**
 * Device overrides map: controlName → DeviceTypeDefinition.
 * When provided to findMapping(), overrides take highest priority.
 */
export type DeviceOverrides = Record<string, DeviceTypeDefinition>;

// ---------------------------------------------------------------------------
// Mapping table
// ---------------------------------------------------------------------------

export const CONTROL_MAPPINGS: WbToMatterMapping[] = [
  // ── switch ────────────────────────────────────────────────────────────────
  {
    wbType: "switch",
    matterDeviceType: onOffOutlet,
    matterClusterIds: [OnOff.Cluster.id],
    matterAttribute: "onOff",
    converter: (v) => v === "1",
    reverseConverter: (v) => (v ? "1" : "0"),
  },
  {
    wbType: "switch",
    readonly: true,
    matterDeviceType: contactSensor,
    matterClusterIds: [BooleanState.Cluster.id],
    matterAttribute: "stateValue",
    converter: (v) => v === "1",
  },
  // doorLock (name-based)
  {
    wbType: "switch",
    nameKeywords: ["lock", "замок"],
    matterDeviceType: doorLockDevice,
    matterClusterIds: [DoorLock.Cluster.id],
    matterAttribute: "lockState",
    converter: (v) =>
      v === "1" ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked,
    reverseConverter: (v) => (v === DoorLock.LockState.Locked ? "1" : "0"),
  },
  // fan (name-based)
  {
    wbType: "switch",
    nameKeywords: ["fan", "вент"],
    matterDeviceType: fanDevice,
    matterClusterIds: [FanControl.Cluster.id],
    matterAttribute: "fanMode",
    converter: (v) =>
      v === "1" ? FanControl.FanMode.High : FanControl.FanMode.Off,
    reverseConverter: (v) => (v === FanControl.FanMode.Off ? "0" : "1"),
  },
  // waterValve (name-based)
  {
    wbType: "switch",
    nameKeywords: ["valve", "кран"],
    matterDeviceType: waterValve,
    matterClusterIds: [ValveConfigurationAndControl.Cluster.id],
    matterAttribute: "currentState",
    converter: (v) =>
      v === "1"
        ? ValveConfigurationAndControl.ValveState.Open
        : ValveConfigurationAndControl.ValveState.Closed,
    reverseConverter: (v) =>
      v === ValveConfigurationAndControl.ValveState.Open ? "1" : "0",
  },
  // pump (name-based)
  {
    wbType: "switch",
    nameKeywords: ["pump", "насос"],
    matterDeviceType: pumpDevice,
    matterClusterIds: [OnOff.Cluster.id],
    matterAttribute: "onOff",
    converter: (v) => v === "1",
    reverseConverter: (v) => (v ? "1" : "0"),
  },
  // occupancy sensor (readonly, name-based)
  {
    wbType: "switch",
    readonly: true,
    nameKeywords: ["motion", "движ", "occupancy"],
    matterDeviceType: occupancySensor,
    matterClusterIds: [OccupancySensing.Cluster.id],
    matterAttribute: "occupancy",
    converter: (v) => ({ occupied: v === "1" }),
  },

  // ── alarm ─────────────────────────────────────────────────────────────────
  {
    wbType: "alarm",
    nameKeywords: ["smoke", "дым"],
    matterDeviceType: smokeCoAlarm,
    matterClusterIds: [SmokeCoAlarm.Cluster.id],
    matterAttribute: "smokeState",
    converter: (v) =>
      v === "1"
        ? SmokeCoAlarm.AlarmState.Critical
        : SmokeCoAlarm.AlarmState.Normal,
  },
  {
    wbType: "alarm",
    nameKeywords: ["leak", "утечка", "water"],
    matterDeviceType: waterLeakDetector,
    matterClusterIds: [BooleanState.Cluster.id],
    matterAttribute: "stateValue",
    converter: (v) => v === "1",
  },
  {
    wbType: "alarm",
    nameKeywords: ["freeze", "замерз"],
    matterDeviceType: waterFreezeDetector,
    matterClusterIds: [BooleanState.Cluster.id],
    matterAttribute: "stateValue",
    converter: (v) => v === "1",
  },
  {
    wbType: "alarm",
    nameKeywords: ["rain", "дождь"],
    matterDeviceType: rainSensor,
    matterClusterIds: [BooleanState.Cluster.id],
    matterAttribute: "stateValue",
    converter: (v) => v === "1",
  },
  // alarm fallback
  {
    wbType: "alarm",
    matterDeviceType: contactSensor,
    matterClusterIds: [BooleanState.Cluster.id],
    matterAttribute: "stateValue",
    converter: (v) => v === "1",
  },

  // ── pushbutton / wo-switch ────────────────────────────────────────────────
  {
    wbType: "pushbutton",
    matterDeviceType: genericSwitch,
    matterClusterIds: [],
    matterAttribute: "",
    converter: (v) => v === "1",
  },
  {
    wbType: "wo-switch",
    matterDeviceType: genericSwitch,
    matterClusterIds: [],
    matterAttribute: "",
    converter: (v) => v === "1",
  },

  // ── range ─────────────────────────────────────────────────────────────────
  {
    wbType: "range",
    nameKeywords: ["blind", "curtain", "штор", "жалюзи"],
    matterDeviceType: coverDevice,
    matterClusterIds: [WindowCovering.Cluster.id],
    matterAttribute: "currentPositionLiftPercent100ths",
    converter: (v, meta) =>
      rangeToLiftPercent100ths(parseFloat(v), meta.max ?? 255),
    reverseConverter: (v, meta) =>
      String(liftPercent100thsToRange(v as number, meta.max ?? 255)),
  },
  // range fallback → dimmableLight
  {
    wbType: "range",
    matterDeviceType: dimmableLight,
    matterClusterIds: [OnOff.Cluster.id, LevelControl.Cluster.id],
    primaryClusterId: LevelControl.Cluster.id,
    matterAttribute: "currentLevel",
    converter: (v, meta) =>
      rangeToLevelControl(parseFloat(v), meta.min ?? 0, meta.max ?? 255),
    reverseConverter: (v, meta) =>
      String(levelControlToRange(v as number, meta.min ?? 0, meta.max ?? 255)),
  },

  // ── dimmer ────────────────────────────────────────────────────────────────
  {
    wbType: "dimmer",
    matterDeviceType: dimmableLight,
    matterClusterIds: [OnOff.Cluster.id, LevelControl.Cluster.id],
    primaryClusterId: LevelControl.Cluster.id,
    matterAttribute: "currentLevel",
    // wb-mqtt-serial specific: default max=65535
    converter: (v, meta) =>
      rangeToLevelControl(parseFloat(v), meta.min ?? 0, meta.max ?? 65535),
    reverseConverter: (v, meta) =>
      String(
        levelControlToRange(v as number, meta.min ?? 0, meta.max ?? 65535),
      ),
  },

  // ── rgb ───────────────────────────────────────────────────────────────────
  {
    wbType: "rgb",
    matterDeviceType: extendedColorLight,
    matterClusterIds: [
      OnOff.Cluster.id,
      ColorControl.Cluster.id,
      LevelControl.Cluster.id,
    ],
    primaryClusterId: ColorControl.Cluster.id,
    matterAttribute: "currentHue",
    converter: (v) => rgbStringToHsv(v),
    reverseConverter: (v) => hsvToRgbString(v as HsvColor),
  },

  // ── value + units ──────────────────────────────────────────────────────────
  // Temperature
  {
    wbType: "value",
    wbUnits: "deg C",
    matterDeviceType: temperatureSensor,
    matterClusterIds: [TemperatureMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v) * 100),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 100, meta.precision)),
  },
  // Humidity
  {
    wbType: "value",
    wbUnits: "%",
    matterDeviceType: humiditySensor,
    matterClusterIds: [RelativeHumidityMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v) * 100),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 100, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "RH",
    matterDeviceType: humiditySensor,
    matterClusterIds: [RelativeHumidityMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v) * 100),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 100, meta.precision)),
  },
  // Pressure
  {
    wbType: "value",
    wbUnits: "Pa",
    matterDeviceType: pressureSensor,
    matterClusterIds: [PressureMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v) * 0.01),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 0.01, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "mbar",
    matterDeviceType: pressureSensor,
    matterClusterIds: [PressureMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v, meta) =>
      String(roundToPrecision(v as number, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "bar",
    matterDeviceType: pressureSensor,
    matterClusterIds: [PressureMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v) * 1000),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 1000, meta.precision)),
  },
  // Illuminance
  {
    wbType: "value",
    wbUnits: "lx",
    matterDeviceType: lightSensor,
    matterClusterIds: [IlluminanceMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => {
      const lux = parseFloat(v);
      return lux <= 0 ? 0 : Math.round(10000 * Math.log10(lux) + 1);
    },
    reverseConverter: (v) => String(Math.pow(10, ((v as number) - 1) / 10000)),
  },
  // Electrical
  {
    wbType: "value",
    wbUnits: "W",
    matterDeviceType: electricalSensor,
    matterClusterIds: [ElectricalPowerMeasurement.Cluster.id],
    matterAttribute: "activePower",
    converter: (v) => Math.round(parseFloat(v) * 1000),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 1000, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "V",
    matterDeviceType: electricalSensor,
    matterClusterIds: [ElectricalPowerMeasurement.Cluster.id],
    matterAttribute: "voltage",
    converter: (v) => Math.round(parseFloat(v) * 1000),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 1000, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "mV",
    matterDeviceType: electricalSensor,
    matterClusterIds: [ElectricalPowerMeasurement.Cluster.id],
    matterAttribute: "voltage",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v, meta) =>
      String(roundToPrecision(v as number, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "A",
    matterDeviceType: electricalSensor,
    matterClusterIds: [ElectricalPowerMeasurement.Cluster.id],
    matterAttribute: "activeCurrent",
    converter: (v) => Math.round(parseFloat(v) * 1000),
    reverseConverter: (v, meta) =>
      String(roundToPrecision((v as number) / 1000, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "mA",
    matterDeviceType: electricalSensor,
    matterClusterIds: [ElectricalPowerMeasurement.Cluster.id],
    matterAttribute: "activeCurrent",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v, meta) =>
      String(roundToPrecision(v as number, meta.precision)),
  },
  {
    wbType: "value",
    wbUnits: "kWh",
    matterDeviceType: electricalSensor,
    matterClusterIds: [ElectricalEnergyMeasurement.Cluster.id],
    matterAttribute: "cumulativeEnergyImported",
    /** Matter `EnergyMeasurement` struct — not a bare number (see ElectricalEnergyMeasurement cluster). */
    converter: (v) => ({
      energy: Math.round(parseFloat(v) * 1_000_000),
    }),
    reverseConverter: (v, meta) => {
      const raw =
        typeof v === "object" && v !== null && "energy" in v
          ? (v as { energy: number }).energy
          : (v as number);
      return String(roundToPrecision(raw / 1_000_000, meta.precision));
    },
  },
  // Air Quality – CO2 ppm (must be before CO to avoid 'co2' matching 'co')
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["co2", "углек", "carbon dioxide"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      CarbonDioxideConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – PM10 (must be before PM1 to avoid 'pm10' matching 'pm1')
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["pm10"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      Pm10ConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – PM2.5 (must be before PM1 to avoid 'pm25' matching 'pm1' via 'pm2.5')
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["pm2.5", "pm25"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      Pm25ConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – CO (carbon monoxide) ppm (after CO2 to avoid 'co2' matching 'co')
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["co", "угарный", "carbon monoxide"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      CarbonMonoxideConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – NO2
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["no2", "nitrogen", "диоксид азота"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      NitrogenDioxideConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – Ozone
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["ozone", "озон"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      OzoneConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – Formaldehyde (HCHO)
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["formaldehyde", "формальдегид", "hcho"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      FormaldehydeConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – TVOC
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["tvoc", "voc", "летуч"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – Radon
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["radon", "радон"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      RadonConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – PM1
  {
    wbType: "value",
    wbUnits: "ppm",
    nameKeywords: ["pm1"],
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      Pm1ConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Air Quality – ppm fallback (generic concentration, e.g. CO2)
  {
    wbType: "value",
    wbUnits: "ppm",
    matterDeviceType: airQualitySensor,
    matterClusterIds: [
      AirQuality.Cluster.id,
      CarbonDioxideConcentrationMeasurement.Cluster.id,
    ],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v)),
    reverseConverter: (v) => String(v),
  },
  // Flow
  {
    wbType: "value",
    wbUnits: "m³/h",
    matterDeviceType: flowSensor,
    matterClusterIds: [FlowMeasurement.Cluster.id],
    matterAttribute: "measuredValue",
    converter: (v) => Math.round(parseFloat(v) * 10),
    reverseConverter: (v) => String((v as number) / 10),
  },
];

// ---------------------------------------------------------------------------
// findMapping
// ---------------------------------------------------------------------------

/**
 * Find the best mapping for a WB control.
 *
 * Priority:
 * 1. deviceOverrides — if the controlName has an explicit DeviceTypeDefinition override,
 *    find the first mapping whose matterDeviceType matches it.
 * 2. Name-based matching — entries with nameKeywords matched against controlName.
 * 3. Fallback — entries without nameKeywords, matched by type + units + readonly.
 *
 * For name-based sub-types pass the control name via `controlName`.
 * For explicit device-type overrides pass `deviceOverrides`.
 *
 * @param meta
 * @param controlName
 * @param deviceOverrides
 */
export function findMapping(
  meta: WbControlMeta,
  controlName = "",
  deviceOverrides?: DeviceOverrides,
): WbToMatterMapping | undefined {
  const normalizedMeta = normalizeDeprecatedType(meta);
  const nameLower = controlName.toLowerCase();

  // Pass 0: deviceOverrides — find mapping whose matterDeviceType matches the override
  if (deviceOverrides && controlName && deviceOverrides[controlName]) {
    const overrideDeviceType = deviceOverrides[controlName];
    for (const mapping of CONTROL_MAPPINGS) {
      if (mapping.wbType !== normalizedMeta.type) continue;
      if (
        mapping.wbUnits !== undefined &&
        mapping.wbUnits !== normalizedMeta.units
      )
        continue;
      if (mapping.matterDeviceType === overrideDeviceType) return mapping;
    }
  }

  // Pass 1: name-based entries only (must have nameKeywords matching controlName)
  if (nameLower) {
    for (const mapping of CONTROL_MAPPINGS) {
      if (mapping.nameKeywords === undefined) continue;
      if (mapping.wbType !== normalizedMeta.type) continue;
      if (
        mapping.wbUnits !== undefined &&
        mapping.wbUnits !== normalizedMeta.units
      )
        continue;
      if (
        mapping.readonly !== undefined &&
        mapping.readonly !== (normalizedMeta.readonly ?? false)
      )
        continue;
      const matches = mapping.nameKeywords.some((kw) => nameLower.includes(kw));
      if (!matches) continue;
      return mapping;
    }
  }

  // Pass 2: fallback entries (no nameKeywords, matching type + units + readonly)
  for (const mapping of CONTROL_MAPPINGS) {
    if (mapping.nameKeywords !== undefined) continue;
    if (mapping.wbType !== normalizedMeta.type) continue;
    if (
      mapping.wbUnits !== undefined &&
      mapping.wbUnits !== normalizedMeta.units
    )
      continue;
    if (
      mapping.readonly !== undefined &&
      mapping.readonly !== (normalizedMeta.readonly ?? false)
    )
      continue;
    return mapping;
  }

  return undefined;
}
