/**
 * Unit tests for controlMapping converters.
 */

import { describe, expect, it } from "@jest/globals";
import {
  AirQuality,
  BooleanState,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  DoorLock,
  FanControl,
  FormaldehydeConcentrationMeasurement,
  NitrogenDioxideConcentrationMeasurement,
  OccupancySensing,
  OnOff,
  OzoneConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  RadonConcentrationMeasurement,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  WindowCovering,
} from "matterbridge/matter/clusters";

import {
  classifyCO2,
  CONTROL_MAPPINGS,
  findMapping,
  hsvToRgbString,
  levelControlToRange,
  levelToRange,
  liftPercent100thsToRange,
  normalizeDeprecatedType,
  rangeToLevel,
  rangeToLevelControl,
  rangeToLiftPercent100ths,
  rgbStringToHsv,
  roundToPrecision,
} from "../src/controlMapping.js";
import { WbControlMeta } from "../src/wirenboardTypes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function meta(overrides: Partial<WbControlMeta> = {}): WbControlMeta {
  return { type: "value", ...overrides };
}

// ---------------------------------------------------------------------------
// switch converter
// ---------------------------------------------------------------------------

describe("switch converter", () => {
  it("converts '1' → true", () => {
    const m = findMapping(meta({ type: "switch" }));
    expect(m).toBeDefined();
    expect(m!.converter("1", meta({ type: "switch" }))).toBe(true);
  });

  it("converts '0' → false", () => {
    const m = findMapping(meta({ type: "switch" }));
    expect(m!.converter("0", meta({ type: "switch" }))).toBe(false);
  });

  it('reverse: true → "1"', () => {
    const m = findMapping(meta({ type: "switch" }));
    expect(m!.reverseConverter!(true, meta({ type: "switch" }))).toBe("1");
  });

  it('reverse: false → "0"', () => {
    const m = findMapping(meta({ type: "switch" }));
    expect(m!.reverseConverter!(false, meta({ type: "switch" }))).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Temperature converter
// ---------------------------------------------------------------------------

describe("temperature converter (value + deg C)", () => {
  const ctrl = meta({ type: "value", units: "deg C" });

  it("23.5 → 2350", () => {
    const m = findMapping(ctrl);
    expect(m).toBeDefined();
    expect(m!.converter("23.5", ctrl)).toBe(2350);
  });

  it("-10 → -1000", () => {
    const m = findMapping(ctrl);
    expect(m!.converter("-10", ctrl)).toBe(-1000);
  });
});

// ---------------------------------------------------------------------------
// Pressure converters
// ---------------------------------------------------------------------------

describe("pressure converter", () => {
  it("Pa × 0.01: 10000 Pa → 100 hPa", () => {
    const ctrl = meta({ type: "value", units: "Pa" });
    const m = findMapping(ctrl)!;
    expect(m.converter("10000", ctrl)).toBe(100);
  });

  it("mbar × 1: 1013 mbar → 1013", () => {
    const ctrl = meta({ type: "value", units: "mbar" });
    const m = findMapping(ctrl)!;
    expect(m.converter("1013", ctrl)).toBe(1013);
  });

  it("bar × 1000: 1 bar → 1000", () => {
    const ctrl = meta({ type: "value", units: "bar" });
    const m = findMapping(ctrl)!;
    expect(m.converter("1", ctrl)).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Illuminance converter
// ---------------------------------------------------------------------------

describe("illuminance converter (lx)", () => {
  const ctrl = meta({ type: "value", units: "lx" });

  it("lux=0 → 0", () => {
    const m = findMapping(ctrl)!;
    expect(m.converter("0", ctrl)).toBe(0);
  });

  it("lux=1 → 1 (Matter: 10000*log10(1)+1 = 1)", () => {
    const m = findMapping(ctrl)!;
    expect(m.converter("1", ctrl)).toBe(1);
  });

  it("lux=100 → 20001 (10000*log10(100)+1 = 20001)", () => {
    const m = findMapping(ctrl)!;
    expect(m.converter("100", ctrl)).toBe(20001);
  });
});

// ---------------------------------------------------------------------------
// WindowCovering (inverted)
// ---------------------------------------------------------------------------

describe("WindowCovering converter (inverted)", () => {
  it("rangeToLiftPercent100ths: 0 (closed) → 10000", () => {
    expect(rangeToLiftPercent100ths(0, 100)).toBe(10000);
  });

  it("rangeToLiftPercent100ths: max (open) → 0", () => {
    expect(rangeToLiftPercent100ths(100, 100)).toBe(0);
  });

  it("rangeToLiftPercent100ths: 50% → 5000", () => {
    expect(rangeToLiftPercent100ths(50, 100)).toBe(5000);
  });

  it("liftPercent100thsToRange: 10000 → 0 (closed)", () => {
    expect(liftPercent100thsToRange(10000, 100)).toBe(0);
  });

  it("liftPercent100thsToRange: 0 → max (open)", () => {
    expect(liftPercent100thsToRange(0, 100)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Electrical converters
// ---------------------------------------------------------------------------

describe("electrical converters", () => {
  it("A × 1000: 1.5 A → 1500 mA", () => {
    const ctrl = meta({ type: "value", units: "A" });
    const m = findMapping(ctrl)!;
    expect(m.converter("1.5", ctrl)).toBe(1500);
  });

  it("mA × 1: 500 mA → 500", () => {
    const ctrl = meta({ type: "value", units: "mA" });
    const m = findMapping(ctrl)!;
    expect(m.converter("500", ctrl)).toBe(500);
  });

  it("W × 1000: 2.5 W → 2500 mW", () => {
    const ctrl = meta({ type: "value", units: "W" });
    const m = findMapping(ctrl)!;
    expect(m.converter("2.5", ctrl)).toBe(2500);
  });

  it("kWh → EnergyMeasurement struct (mWh in energy field)", () => {
    const ctrl = meta({ type: "value", units: "kWh" });
    const m = findMapping(ctrl)!;
    expect(m.converter("1", ctrl)).toEqual({ energy: 1_000_000 });
  });
});

// ---------------------------------------------------------------------------
// RGB ↔ HSV
// ---------------------------------------------------------------------------

describe("RGB ↔ HSV conversion", () => {
  it('black "0;0;0" → hue=0, sat=0, val=0', () => {
    const hsv = rgbStringToHsv("0;0;0");
    expect(hsv.hue).toBe(0);
    expect(hsv.sat).toBe(0);
    expect(hsv.val).toBe(0);
  });

  it('white "255;255;255" → sat=0, val=254', () => {
    const hsv = rgbStringToHsv("255;255;255");
    expect(hsv.sat).toBe(0);
    expect(hsv.val).toBe(254);
  });

  it('round-trip "128;0;255" → HSV → back', () => {
    const original = "128;0;255";
    const hsv = rgbStringToHsv(original);
    const back = hsvToRgbString(hsv);
    // Allow ±2 per channel due to rounding
    const origParts = original.split(";").map(Number);
    const backParts = back.split(";").map(Number);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(backParts[i]! - origParts[i]!)).toBeLessThanOrEqual(3);
    }
  });

  it('red "255;0;0" → hue~0, sat=254, val=254', () => {
    const hsv = rgbStringToHsv("255;0;0");
    expect(hsv.sat).toBe(254);
    expect(hsv.val).toBe(254);
    expect(hsv.hue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AirQuality CO2 classification
// ---------------------------------------------------------------------------

describe("classifyCO2", () => {
  it("300 ppm → Good", () => {
    expect(classifyCO2(300)).toBe(AirQuality.AirQualityEnum.Good);
  });

  it("400 ppm → Fair", () => {
    expect(classifyCO2(400)).toBe(AirQuality.AirQualityEnum.Fair);
  });

  it("1000 ppm → Moderate", () => {
    expect(classifyCO2(1000)).toBe(AirQuality.AirQualityEnum.Moderate);
  });

  it("2000 ppm → Poor", () => {
    expect(classifyCO2(2000)).toBe(AirQuality.AirQualityEnum.Poor);
  });

  it("3000 ppm → VeryPoor", () => {
    expect(classifyCO2(3000)).toBe(AirQuality.AirQualityEnum.VeryPoor);
  });
});

// ---------------------------------------------------------------------------
// range / dimmer converters
// ---------------------------------------------------------------------------

describe("rangeToLevel", () => {
  it("0 → 0", () => {
    expect(rangeToLevel(0, 0, 255)).toBe(0);
  });

  it("255 (max) → 254", () => {
    expect(rangeToLevel(255, 0, 255)).toBe(254);
  });

  it("127/255 → ~127", () => {
    const level = rangeToLevel(127, 0, 255);
    expect(level).toBeGreaterThan(124);
    expect(level).toBeLessThan(130);
  });
});

describe("rangeToLevelControl", () => {
  it("WB min maps to Matter 1 (not 0)", () => {
    expect(rangeToLevelControl(0, 0, 255)).toBe(1);
  });

  it("WB max maps to 254", () => {
    expect(rangeToLevelControl(255, 0, 255)).toBe(254);
  });

  it("inverse: level 1 → WB 0", () => {
    expect(levelControlToRange(1, 0, 255)).toBe(0);
  });
});

describe("range converter via findMapping", () => {
  it("range 0 → level 1 (Matter Level Control min)", () => {
    const ctrl = meta({ type: "range", min: 0, max: 255 });
    const m = findMapping(ctrl)!;
    expect(m.converter("0", ctrl)).toBe(1);
  });

  it("range 255 → level 254", () => {
    const ctrl = meta({ type: "range", min: 0, max: 255 });
    const m = findMapping(ctrl)!;
    expect(m.converter("255", ctrl)).toBe(254);
  });
});

describe("dimmer converter via findMapping", () => {
  it("dimmer 0 → level 1", () => {
    const ctrl = meta({ type: "dimmer", min: 0, max: 65535 });
    const m = findMapping(ctrl)!;
    expect(m.converter("0", ctrl)).toBe(1);
  });

  it("dimmer 65535 → level 254", () => {
    const ctrl = meta({ type: "dimmer", min: 0, max: 65535 });
    const m = findMapping(ctrl)!;
    expect(m.converter("65535", ctrl)).toBe(254);
  });
});

// ---------------------------------------------------------------------------
// deprecated type normalization
// ---------------------------------------------------------------------------

describe("normalizeDeprecatedType", () => {
  it("'temperature' → {type:'value', units:'deg C'}", () => {
    const result = normalizeDeprecatedType({ type: "temperature" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("deg C");
  });

  it("'lux' → {type:'value', units:'lx'}", () => {
    const result = normalizeDeprecatedType({ type: "lux" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("lx");
  });

  it("'power' → {type:'value', units:'W'}", () => {
    const result = normalizeDeprecatedType({ type: "power" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("W");
  });

  it("'switch' is unchanged", () => {
    const m = { type: "switch" as const };
    const result = normalizeDeprecatedType(m);
    expect(result.type).toBe("switch");
  });

  it("deprecated type maps via findMapping: 'temperature' finds temperatureSensor", () => {
    const m = findMapping({ type: "temperature" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("measuredValue");
  });

  it("'rel_humidity' → findMapping finds humiditySensor", () => {
    const m = findMapping({ type: "rel_humidity" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("measuredValue");
  });

  it("'voltage' → findMapping finds electricalSensor (voltage)", () => {
    const m = findMapping({ type: "voltage" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("voltage");
  });

  it("'current' → findMapping finds electricalSensor (activeCurrent)", () => {
    const m = findMapping({ type: "current" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("activeCurrent");
  });

  it("'pressure' → findMapping finds pressureSensor", () => {
    const m = findMapping({ type: "pressure" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("measuredValue");
  });

  it("'power_consumption' → findMapping finds electricalSensor (kWh)", () => {
    const m = findMapping({ type: "power_consumption" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("cumulativeEnergyImported");
  });

  it("'water_flow' → findMapping finds flowSensor", () => {
    const m = findMapping({ type: "water_flow" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("measuredValue");
  });

  it("'atmospheric_pressure' → findMapping finds pressureSensor", () => {
    const m = findMapping({ type: "atmospheric_pressure" });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe("measuredValue");
  });

  it("'concentration' → findMapping finds airQualitySensor (ppm fallback)", () => {
    const m = findMapping({ type: "concentration" });
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      CarbonDioxideConcentrationMeasurement.Cluster.id,
    );
  });
});

// ---------------------------------------------------------------------------
// Air quality — 9 gas concentration clusters
// ---------------------------------------------------------------------------

describe("air quality concentration clusters", () => {
  const ppmMeta = meta({ type: "value", units: "ppm" });

  it("co2 name → CarbonDioxideConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_co2_level");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      CarbonDioxideConcentrationMeasurement.Cluster.id,
    );
  });

  it("co name → CarbonMonoxideConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_co_concentration");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      CarbonMonoxideConcentrationMeasurement.Cluster.id,
    );
  });

  it("no2 name → NitrogenDioxideConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_no2");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      NitrogenDioxideConcentrationMeasurement.Cluster.id,
    );
  });

  it("ozone name → OzoneConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_ozone");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      OzoneConcentrationMeasurement.Cluster.id,
    );
  });

  it("formaldehyde name → FormaldehydeConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_hcho");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      FormaldehydeConcentrationMeasurement.Cluster.id,
    );
  });

  it("tvoc name → TotalVolatileOrganicCompoundsConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_tvoc");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id,
    );
  });

  it("radon name → RadonConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_radon");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      RadonConcentrationMeasurement.Cluster.id,
    );
  });

  it("pm1 name → Pm1ConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_pm1");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      Pm1ConcentrationMeasurement.Cluster.id,
    );
  });

  it("pm25 name → Pm25ConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_pm25");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      Pm25ConcentrationMeasurement.Cluster.id,
    );
  });

  it("pm10 name → Pm10ConcentrationMeasurement", () => {
    const m = findMapping(ppmMeta, "sensor_pm10");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      Pm10ConcentrationMeasurement.Cluster.id,
    );
  });

  it("ppm no name → fallback CO2 cluster", () => {
    const m = findMapping(ppmMeta, "");
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(
      CarbonDioxideConcentrationMeasurement.Cluster.id,
    );
  });

  it("converter: 800 ppm → 800", () => {
    const m = findMapping(ppmMeta, "sensor_co2_level")!;
    expect(m.converter("800", ppmMeta)).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// lock / fan name-based mappings
// ---------------------------------------------------------------------------

describe("switch lock/fan name-based mappings", () => {
  const sw = meta({ type: "switch" });

  it('switch + "lock" name → doorLockDevice (MA-doorLock), lockState Locked on 1', () => {
    const m = findMapping(sw, "door_lock");
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-doorLock");
    expect(m!.converter("1", sw)).toBe(DoorLock.LockState.Locked);
    expect(m!.converter("0", sw)).toBe(DoorLock.LockState.Unlocked);
  });

  it('switch + "замок" name → doorLockDevice', () => {
    const m = findMapping(sw, "замок_входной");
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-doorLock");
  });

  it('doorLock reverseConverter: Locked → "1", Unlocked → "0"', () => {
    const m = findMapping(sw, "door_lock")!;
    expect(m.reverseConverter!(DoorLock.LockState.Locked, sw)).toBe("1");
    expect(m.reverseConverter!(DoorLock.LockState.Unlocked, sw)).toBe("0");
  });

  it('switch + "fan" name → fanDevice (MA-fan), fanMode Off on 0', () => {
    const m = findMapping(sw, "bathroom_fan");
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-fan");
    expect(m!.converter("0", sw)).toBe(FanControl.FanMode.Off);
    expect(m!.converter("1", sw)).toBe(FanControl.FanMode.High);
  });

  it('switch + "вент" name → fanDevice', () => {
    const m = findMapping(sw, "вентилятор_кухня");
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-fan");
  });

  it('fan reverseConverter: Off → "0", High → "1"', () => {
    const m = findMapping(sw, "bathroom_fan")!;
    expect(m.reverseConverter!(FanControl.FanMode.Off, sw)).toBe("0");
    expect(m.reverseConverter!(FanControl.FanMode.High, sw)).toBe("1");
  });

  it('switch + "valve" name → waterValve (MA-waterValve)', () => {
    const m = findMapping(sw, "hot_water_valve");
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-waterValve");
  });
});

// ---------------------------------------------------------------------------
// deviceOverrides
// ---------------------------------------------------------------------------

describe("findMapping with deviceOverrides", () => {
  it("override forces doorLock mapping for a generic switch control", () => {
    const sw = meta({ type: "switch" });
    // find the doorLock mapping's deviceType from CONTROL_MAPPINGS via name
    const lockMapping = findMapping(sw, "door_lock");
    expect(lockMapping).toBeDefined();
    const lockDeviceType = lockMapping!.matterDeviceType;
    const m = findMapping(sw, "my_switch", { my_switch: lockDeviceType });
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-doorLock");
  });

  it("override forces fan mapping for a generic switch control", () => {
    const sw = meta({ type: "switch" });
    const fanMapping = findMapping(sw, "bathroom_fan");
    expect(fanMapping).toBeDefined();
    const fanDeviceType = fanMapping!.matterDeviceType;
    const m = findMapping(sw, "my_switch", { my_switch: fanDeviceType });
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-fan");
  });

  it("without override, name-based matching still works", () => {
    const sw = meta({ type: "switch" });
    const m = findMapping(sw, "door_lock", {});
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe("MA-doorLock");
  });
});

// ---------------------------------------------------------------------------
// roundToPrecision
// ---------------------------------------------------------------------------

describe("roundToPrecision", () => {
  it("precision=0.1 → 1 decimal place", () => {
    expect(roundToPrecision(23.567, 0.1)).toBeCloseTo(23.6, 5);
  });

  it("precision=0.5 → rounds to nearest 0.5", () => {
    expect(roundToPrecision(23.3, 0.5)).toBeCloseTo(23.5, 5);
    expect(roundToPrecision(23.2, 0.5)).toBeCloseTo(23, 5);
  });

  it("precision=1 → integer", () => {
    expect(roundToPrecision(23.7, 1)).toBe(24);
  });

  it("precision=undefined → value unchanged", () => {
    expect(roundToPrecision(23.567, undefined)).toBe(23.567);
  });

  it("precision=0 → value unchanged", () => {
    expect(roundToPrecision(23.567, 0)).toBe(23.567);
  });
});

// ---------------------------------------------------------------------------
// precision in reverseConverter
// ---------------------------------------------------------------------------

describe("precision handling in reverseConverter", () => {
  it("temperature reverseConverter with precision=0.1", () => {
    const ctrl = meta({ type: "value", units: "deg C", precision: 0.1 });
    const m = findMapping(ctrl)!;
    // Matter value 2356 → 23.56°C → rounded to 23.6 with precision=0.1
    expect(m.reverseConverter!(2356, ctrl)).toBe("23.6");
  });

  it("temperature reverseConverter without precision → raw", () => {
    const ctrl = meta({ type: "value", units: "deg C" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(2350, ctrl)).toBe("23.5");
  });

  it("pressure mbar reverseConverter with precision=1", () => {
    const ctrl = meta({ type: "value", units: "mbar", precision: 1 });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(1013, ctrl)).toBe("1013");
  });
});

// ---------------------------------------------------------------------------
// bounds clamping in rangeToLevel / levelToRange
// ---------------------------------------------------------------------------

describe("bounds clamping", () => {
  it("rangeToLevel clamps above 254 to 254", () => {
    // value > max still clamps
    expect(rangeToLevel(300, 0, 255)).toBe(254);
  });

  it("rangeToLevel clamps below 0 to 0", () => {
    expect(rangeToLevel(-10, 0, 255)).toBe(0);
  });

  it("levelToRange clamps level > 254 to 254 before scaling", () => {
    // level=300 → clamped to 254 → same as max
    expect(levelToRange(300, 0, 255)).toBe(255);
  });

  it("levelToRange clamps level < 0 to 0 before scaling", () => {
    expect(levelToRange(-10, 0, 255)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Humidity converters
// ---------------------------------------------------------------------------

describe("humidity converter (% and RH)", () => {
  it("% units: 50 → 5000", () => {
    const ctrl = meta({ type: "value", units: "%" });
    const m = findMapping(ctrl)!;
    expect(m.converter("50", ctrl)).toBe(5000);
  });

  it('% reverseConverter: 5000 → "50"', () => {
    const ctrl = meta({ type: "value", units: "%" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(5000, ctrl)).toBe("50");
  });

  it("RH units: 75 → 7500", () => {
    const ctrl = meta({ type: "value", units: "RH" });
    const m = findMapping(ctrl)!;
    expect(m.converter("75", ctrl)).toBe(7500);
  });

  it('RH reverseConverter: 7500 → "75"', () => {
    const ctrl = meta({ type: "value", units: "RH" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(7500, ctrl)).toBe("75");
  });
});

// ---------------------------------------------------------------------------
// Pressure reverseConverter
// ---------------------------------------------------------------------------

describe("pressure reverseConverter", () => {
  it("Pa reverseConverter: 100 hPa → 10000 Pa", () => {
    const ctrl = meta({ type: "value", units: "Pa" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(100, ctrl)).toBe("10000");
  });

  it('bar reverseConverter: 1000 → "1"', () => {
    const ctrl = meta({ type: "value", units: "bar" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(1000, ctrl)).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Electrical reverseConverter
// ---------------------------------------------------------------------------

describe("electrical reverseConverter", () => {
  it('W reverseConverter: 2500 mW → "2.5"', () => {
    const ctrl = meta({ type: "value", units: "W" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(2500, ctrl)).toBe("2.5");
  });

  it('V reverseConverter: 220000 → "220"', () => {
    const ctrl = meta({ type: "value", units: "V" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(220000, ctrl)).toBe("220");
  });

  it("mV converter: 220 → 220", () => {
    const ctrl = meta({ type: "value", units: "mV" });
    const m = findMapping(ctrl)!;
    expect(m.converter("220", ctrl)).toBe(220);
  });

  it('mV reverseConverter: 220 → "220"', () => {
    const ctrl = meta({ type: "value", units: "mV" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(220, ctrl)).toBe("220");
  });

  it('A reverseConverter: 1500 mA → "1.5"', () => {
    const ctrl = meta({ type: "value", units: "A" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(1500, ctrl)).toBe("1.5");
  });

  it('mA reverseConverter: 500 → "500"', () => {
    const ctrl = meta({ type: "value", units: "mA" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(500, ctrl)).toBe("500");
  });

  it('kWh reverseConverter: { energy: 1000000 } → "1"', () => {
    const ctrl = meta({ type: "value", units: "kWh" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!({ energy: 1_000_000 }, ctrl)).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Illuminance reverseConverter
// ---------------------------------------------------------------------------

describe("illuminance reverseConverter", () => {
  it("lx reverseConverter: 1 → ~1 lux", () => {
    const ctrl = meta({ type: "value", units: "lx" });
    const m = findMapping(ctrl)!;
    const result = parseFloat(m.reverseConverter!(1, ctrl) as string);
    expect(result).toBeCloseTo(1, 0);
  });

  it("lx reverseConverter: 20001 → ~100 lux", () => {
    const ctrl = meta({ type: "value", units: "lx" });
    const m = findMapping(ctrl)!;
    const result = parseFloat(m.reverseConverter!(20001, ctrl) as string);
    expect(result).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// Flow converter
// ---------------------------------------------------------------------------

describe("flow converter (m³/h)", () => {
  it("1.5 m³/h → 15", () => {
    const ctrl = meta({ type: "value", units: "m³/h" });
    const m = findMapping(ctrl)!;
    expect(m.converter("1.5", ctrl)).toBe(15);
  });

  it('reverseConverter: 15 → "1.5"', () => {
    const ctrl = meta({ type: "value", units: "m³/h" });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(15, ctrl)).toBe("1.5");
  });
});

// ---------------------------------------------------------------------------
// RGB converter
// ---------------------------------------------------------------------------

describe("rgb converter via findMapping", () => {
  it("converter returns HSV object for RGB string", () => {
    const ctrl = meta({ type: "rgb" });
    const m = findMapping(ctrl)!;
    expect(m).toBeDefined();
    const result = m.converter("255;0;0", ctrl) as {
      hue: number;
      sat: number;
      val: number;
    };
    expect(result.sat).toBe(254);
    expect(result.val).toBe(254);
  });

  it("reverseConverter converts HSV back to RGB string", () => {
    const ctrl = meta({ type: "rgb" });
    const m = findMapping(ctrl)!;
    const hsv = { hue: 0, sat: 254, val: 254 };
    const result = m.reverseConverter!(hsv, ctrl) as string;
    expect(result).toMatch(/^\d+;\d+;\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Alarm type converters
// ---------------------------------------------------------------------------

describe("alarm converter — smoke", () => {
  it('smoke alarm "1" → Critical', () => {
    const ctrl = meta({ type: "alarm" });
    const m = findMapping(ctrl, "smoke_sensor")!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBeTruthy();
  });

  it('smoke alarm "0" → Normal', () => {
    const ctrl = meta({ type: "alarm" });
    const m = findMapping(ctrl, "smoke_sensor")!;
    expect(m.converter("0", ctrl)).toBeFalsy();
  });
});

describe("alarm converter — leak", () => {
  it('water leak "1" → true', () => {
    const ctrl = meta({ type: "alarm" });
    const m = findMapping(ctrl, "water_leak")!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBe(true);
  });
});

describe("alarm converter — freeze", () => {
  it('freeze "1" → true', () => {
    const ctrl = meta({ type: "alarm" });
    const m = findMapping(ctrl, "freeze_sensor")!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBe(true);
  });
});

describe("alarm converter — rain", () => {
  it('rain "1" → true', () => {
    const ctrl = meta({ type: "alarm" });
    const m = findMapping(ctrl, "rain_sensor")!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBe(true);
  });
});

describe("alarm converter — fallback contact sensor", () => {
  it('generic alarm "1" → true', () => {
    const ctrl = meta({ type: "alarm" });
    const m = findMapping(ctrl, "generic_alarm")!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBe(true);
    expect(m.converter("0", ctrl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pushbutton / wo-switch converters
// ---------------------------------------------------------------------------

describe("pushbutton converter", () => {
  it('"1" → true', () => {
    const ctrl = meta({ type: "pushbutton" });
    const m = findMapping(ctrl)!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBe(true);
  });

  it('"0" → false', () => {
    const ctrl = meta({ type: "pushbutton" });
    const m = findMapping(ctrl)!;
    expect(m.converter("0", ctrl)).toBe(false);
  });
});

describe("wo-switch converter", () => {
  it('"1" → true', () => {
    const ctrl = meta({ type: "wo-switch" });
    const m = findMapping(ctrl)!;
    expect(m).toBeDefined();
    expect(m.converter("1", ctrl)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// switch readonly — contactSensor mapping has BooleanState cluster
// ---------------------------------------------------------------------------

describe("switch readonly contact sensor mapping", () => {
  it("CONTROL_MAPPINGS has contactSensor (readonly switch, BooleanState, no reverseConverter)", () => {
    const contactMapping = CONTROL_MAPPINGS.find(
      (m) => m.wbType === "switch" && m.readonly === true && !m.nameKeywords,
    );
    expect(contactMapping).toBeDefined();
    expect(contactMapping!.matterClusterIds).toContain(BooleanState.Cluster.id);
    expect(contactMapping!.reverseConverter).toBeUndefined();
    const ctrl = meta({ type: "switch", readonly: true });
    expect(contactMapping!.converter("1", ctrl)).toBe(true);
    expect(contactMapping!.converter("0", ctrl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// occupancy sensor (readonly switch with motion name)
// ---------------------------------------------------------------------------

describe("occupancy sensor", () => {
  it("switch readonly + motion name → occupancySensor (OccupancySensing cluster)", () => {
    const ctrl = meta({ type: "switch", readonly: true });
    const m = findMapping(ctrl, "motion_sensor")!;
    expect(m).toBeDefined();
    expect(m.matterClusterIds).toContain(OccupancySensing.Cluster.id);
    const result = m.converter("1", ctrl) as { occupied: boolean };
    expect(result.occupied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pump switch mapping
// ---------------------------------------------------------------------------

describe("pump switch mapping", () => {
  it("switch + pump name → pumpDevice (OnOff cluster)", () => {
    const sw = meta({ type: "switch" });
    const m = findMapping(sw, "water_pump")!;
    expect(m).toBeDefined();
    // pump maps to onOff
    expect(m.matterClusterIds).toContain(OnOff.Cluster.id);
    expect(m.matterAttribute).toBe("onOff");
  });

  it('pump reverseConverter: true → "1"', () => {
    const sw = meta({ type: "switch" });
    const m = findMapping(sw, "water_pump")!;
    expect(m.reverseConverter!(true, sw)).toBe("1");
    expect(m.reverseConverter!(false, sw)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// water valve converter/reverseConverter
// ---------------------------------------------------------------------------

describe("water valve converter/reverseConverter", () => {
  it('"1" converts to Open state', () => {
    const sw = meta({ type: "switch" });
    const m = findMapping(sw, "hot_water_valve")!;
    expect(m).toBeDefined();
    expect(m.matterAttribute).toBe("currentState");
    // ValveState.Open > ValveState.Closed
    const open = m.converter("1", sw) as number;
    const closed = m.converter("0", sw) as number;
    expect(open).toBeGreaterThan(closed);
  });
});

// ---------------------------------------------------------------------------
// range curtain/blind mapping (WindowCovering)
// ---------------------------------------------------------------------------

describe("range curtain/blind mapping (WindowCovering)", () => {
  it("range + blind name → WindowCovering cluster", () => {
    const ctrl = meta({ type: "range", min: 0, max: 100 });
    const m = findMapping(ctrl, "window_blind")!;
    expect(m).toBeDefined();
    expect(m.matterClusterIds).toContain(WindowCovering.Cluster.id);
  });

  it("converter: 50 (half open) → 5000", () => {
    const ctrl = meta({ type: "range", min: 0, max: 100 });
    const m = findMapping(ctrl, "window_blind")!;
    expect(m.converter("50", ctrl)).toBe(5000);
  });

  it('reverseConverter: 5000 → "50"', () => {
    const ctrl = meta({ type: "range", min: 0, max: 100 });
    const m = findMapping(ctrl, "window_blind")!;
    expect(m.reverseConverter!(5000, ctrl)).toBe("50");
  });
});

// ---------------------------------------------------------------------------
// range/dimmer reverseConverter
// ---------------------------------------------------------------------------

describe("range reverseConverter", () => {
  it('254 → "255" (max)', () => {
    const ctrl = meta({ type: "range", min: 0, max: 255 });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(254, ctrl)).toBe("255");
  });

  it('1 → "0" (Matter min level)', () => {
    const ctrl = meta({ type: "range", min: 0, max: 255 });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(1, ctrl)).toBe("0");
  });
});

describe("dimmer reverseConverter", () => {
  it('254 → "65535" (max)', () => {
    const ctrl = meta({ type: "dimmer", min: 0, max: 65535 });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(254, ctrl)).toBe("65535");
  });
});

// ---------------------------------------------------------------------------
// Air quality reverseConverter
// ---------------------------------------------------------------------------

describe("air quality reverseConverter", () => {
  it('CO2 reverseConverter: 800 → "800"', () => {
    const ctrl = meta({ type: "value", units: "ppm" });
    const m = findMapping(ctrl, "sensor_co2_level")!;
    expect(m.reverseConverter!(800, ctrl)).toBe("800");
  });
});

// ---------------------------------------------------------------------------
// normalizeDeprecatedType — all remaining deprecated types
// ---------------------------------------------------------------------------

describe("normalizeDeprecatedType — remaining deprecated types", () => {
  it("'rel_humidity' → {type:'value', units:'%'}", () => {
    const result = normalizeDeprecatedType({ type: "rel_humidity" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("%");
  });

  it("'atmospheric_pressure' → {type:'value', units:'mbar'}", () => {
    const result = normalizeDeprecatedType({ type: "atmospheric_pressure" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("mbar");
  });

  it("'pressure' → {type:'value', units:'mbar'}", () => {
    const result = normalizeDeprecatedType({ type: "pressure" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("mbar");
  });

  it("'voltage' → {type:'value', units:'V'}", () => {
    const result = normalizeDeprecatedType({ type: "voltage" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("V");
  });

  it("'current' → {type:'value', units:'A'}", () => {
    const result = normalizeDeprecatedType({ type: "current" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("A");
  });

  it("'power_consumption' → {type:'value', units:'kWh'}", () => {
    const result = normalizeDeprecatedType({ type: "power_consumption" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("kWh");
  });

  it("'concentration' → {type:'value', units:'ppm'}", () => {
    const result = normalizeDeprecatedType({ type: "concentration" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("ppm");
  });

  it("'water_flow' → {type:'value', units:'m³/h'}", () => {
    const result = normalizeDeprecatedType({ type: "water_flow" });
    expect(result.type).toBe("value");
    expect(result.units).toBe("m³/h");
  });

  it("unrecognized deprecated type → unchanged", () => {
    const result = normalizeDeprecatedType({ type: "sound_level" as never });
    expect(result.type).toBe("sound_level");
  });
});

// ---------------------------------------------------------------------------
// findMapping — no match cases
// ---------------------------------------------------------------------------

describe("findMapping — no match", () => {
  it("unknown type returns undefined", () => {
    const ctrl = meta({ type: "w1-id" });
    const m = findMapping(ctrl);
    expect(m).toBeUndefined();
  });

  it("value without matching units returns undefined", () => {
    const ctrl = meta({ type: "value", units: "unknown-unit-xyz" });
    const m = findMapping(ctrl);
    expect(m).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// rangeToLiftPercent100ths edge cases
// ---------------------------------------------------------------------------

describe("rangeToLiftPercent100ths edge cases", () => {
  it("max=0 → 10000 (fully closed)", () => {
    expect(rangeToLiftPercent100ths(0, 0)).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// liftPercent100thsToRange
// ---------------------------------------------------------------------------

describe("liftPercent100thsToRange", () => {
  it("5000 → 50% of max", () => {
    expect(liftPercent100thsToRange(5000, 100)).toBe(50);
  });
});
