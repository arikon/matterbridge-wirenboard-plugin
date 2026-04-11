/**
 * Unit tests for controlMapping converters.
 */

import { describe, expect, it } from '@jest/globals';
import {
  AirQuality,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  DoorLock,
  FanControl,
  FormaldehydeConcentrationMeasurement,
  NitrogenDioxideConcentrationMeasurement,
  OzoneConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  RadonConcentrationMeasurement,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
} from 'matterbridge/matter/clusters';
import {
  classifyCO2,
  findMapping,
  hsvToRgbString,
  levelToRange,
  liftPercent100thsToRange,
  normalizeDeprecatedType,
  rangeToLevel,
  rangeToLiftPercent100ths,
  rgbStringToHsv,
  roundToPrecision,
} from '../src/controlMapping.js';
import { WbControlMeta } from '../src/wirenboardTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function meta(overrides: Partial<WbControlMeta> = {}): WbControlMeta {
  return { type: 'value', ...overrides };
}

// ---------------------------------------------------------------------------
// switch converter
// ---------------------------------------------------------------------------

describe('switch converter', () => {
  it("converts '1' → true", () => {
    const m = findMapping(meta({ type: 'switch' }));
    expect(m).toBeDefined();
    expect(m!.converter('1', meta({ type: 'switch' }))).toBe(true);
  });

  it("converts '0' → false", () => {
    const m = findMapping(meta({ type: 'switch' }));
    expect(m!.converter('0', meta({ type: 'switch' }))).toBe(false);
  });

  it('reverse: true → "1"', () => {
    const m = findMapping(meta({ type: 'switch' }));
    expect(m!.reverseConverter!(true, meta({ type: 'switch' }))).toBe('1');
  });

  it('reverse: false → "0"', () => {
    const m = findMapping(meta({ type: 'switch' }));
    expect(m!.reverseConverter!(false, meta({ type: 'switch' }))).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Temperature converter
// ---------------------------------------------------------------------------

describe('temperature converter (value + deg C)', () => {
  const ctrl = meta({ type: 'value', units: 'deg C' });

  it('23.5 → 2350', () => {
    const m = findMapping(ctrl);
    expect(m).toBeDefined();
    expect(m!.converter('23.5', ctrl)).toBe(2350);
  });

  it('-10 → -1000', () => {
    const m = findMapping(ctrl);
    expect(m!.converter('-10', ctrl)).toBe(-1000);
  });
});

// ---------------------------------------------------------------------------
// Pressure converters
// ---------------------------------------------------------------------------

describe('pressure converter', () => {
  it('Pa × 0.01: 10000 Pa → 100 hPa', () => {
    const ctrl = meta({ type: 'value', units: 'Pa' });
    const m = findMapping(ctrl)!;
    expect(m.converter('10000', ctrl)).toBe(100);
  });

  it('mbar × 1: 1013 mbar → 1013', () => {
    const ctrl = meta({ type: 'value', units: 'mbar' });
    const m = findMapping(ctrl)!;
    expect(m.converter('1013', ctrl)).toBe(1013);
  });

  it('bar × 1000: 1 bar → 1000', () => {
    const ctrl = meta({ type: 'value', units: 'bar' });
    const m = findMapping(ctrl)!;
    expect(m.converter('1', ctrl)).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Illuminance converter
// ---------------------------------------------------------------------------

describe('illuminance converter (lx)', () => {
  const ctrl = meta({ type: 'value', units: 'lx' });

  it('lux=0 → 0', () => {
    const m = findMapping(ctrl)!;
    expect(m.converter('0', ctrl)).toBe(0);
  });

  it('lux=1 → 1 (Matter: 10000*log10(1)+1 = 1)', () => {
    const m = findMapping(ctrl)!;
    expect(m.converter('1', ctrl)).toBe(1);
  });

  it('lux=100 → 20001 (10000*log10(100)+1 = 20001)', () => {
    const m = findMapping(ctrl)!;
    expect(m.converter('100', ctrl)).toBe(20001);
  });
});

// ---------------------------------------------------------------------------
// WindowCovering (inverted)
// ---------------------------------------------------------------------------

describe('WindowCovering converter (inverted)', () => {
  it('rangeToLiftPercent100ths: 0 (closed) → 10000', () => {
    expect(rangeToLiftPercent100ths(0, 100)).toBe(10000);
  });

  it('rangeToLiftPercent100ths: max (open) → 0', () => {
    expect(rangeToLiftPercent100ths(100, 100)).toBe(0);
  });

  it('rangeToLiftPercent100ths: 50% → 5000', () => {
    expect(rangeToLiftPercent100ths(50, 100)).toBe(5000);
  });

  it('liftPercent100thsToRange: 10000 → 0 (closed)', () => {
    expect(liftPercent100thsToRange(10000, 100)).toBe(0);
  });

  it('liftPercent100thsToRange: 0 → max (open)', () => {
    expect(liftPercent100thsToRange(0, 100)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Electrical converters
// ---------------------------------------------------------------------------

describe('electrical converters', () => {
  it('A × 1000: 1.5 A → 1500 mA', () => {
    const ctrl = meta({ type: 'value', units: 'A' });
    const m = findMapping(ctrl)!;
    expect(m.converter('1.5', ctrl)).toBe(1500);
  });

  it('mA × 1: 500 mA → 500', () => {
    const ctrl = meta({ type: 'value', units: 'mA' });
    const m = findMapping(ctrl)!;
    expect(m.converter('500', ctrl)).toBe(500);
  });

  it('W × 1000: 2.5 W → 2500 mW', () => {
    const ctrl = meta({ type: 'value', units: 'W' });
    const m = findMapping(ctrl)!;
    expect(m.converter('2.5', ctrl)).toBe(2500);
  });

  it('kWh × 1000000: 1 kWh → 1000000 mWh', () => {
    const ctrl = meta({ type: 'value', units: 'kWh' });
    const m = findMapping(ctrl)!;
    expect(m.converter('1', ctrl)).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// RGB ↔ HSV
// ---------------------------------------------------------------------------

describe('RGB ↔ HSV conversion', () => {
  it('black "0;0;0" → hue=0, sat=0, val=0', () => {
    const hsv = rgbStringToHsv('0;0;0');
    expect(hsv.hue).toBe(0);
    expect(hsv.sat).toBe(0);
    expect(hsv.val).toBe(0);
  });

  it('white "255;255;255" → sat=0, val=254', () => {
    const hsv = rgbStringToHsv('255;255;255');
    expect(hsv.sat).toBe(0);
    expect(hsv.val).toBe(254);
  });

  it('round-trip "128;0;255" → HSV → back', () => {
    const original = '128;0;255';
    const hsv = rgbStringToHsv(original);
    const back = hsvToRgbString(hsv);
    // Allow ±2 per channel due to rounding
    const origParts = original.split(';').map(Number);
    const backParts = back.split(';').map(Number);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(backParts[i]! - origParts[i]!)).toBeLessThanOrEqual(3);
    }
  });

  it('red "255;0;0" → hue~0, sat=254, val=254', () => {
    const hsv = rgbStringToHsv('255;0;0');
    expect(hsv.sat).toBe(254);
    expect(hsv.val).toBe(254);
    expect(hsv.hue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AirQuality CO2 classification
// ---------------------------------------------------------------------------

describe('classifyCO2', () => {
  it('300 ppm → Good', () => {
    expect(classifyCO2(300)).toBe(AirQuality.AirQualityEnum.Good);
  });

  it('400 ppm → Fair', () => {
    expect(classifyCO2(400)).toBe(AirQuality.AirQualityEnum.Fair);
  });

  it('1000 ppm → Moderate', () => {
    expect(classifyCO2(1000)).toBe(AirQuality.AirQualityEnum.Moderate);
  });

  it('2000 ppm → Poor', () => {
    expect(classifyCO2(2000)).toBe(AirQuality.AirQualityEnum.Poor);
  });

  it('3000 ppm → VeryPoor', () => {
    expect(classifyCO2(3000)).toBe(AirQuality.AirQualityEnum.VeryPoor);
  });
});

// ---------------------------------------------------------------------------
// range / dimmer converters
// ---------------------------------------------------------------------------

describe('rangeToLevel', () => {
  it('0 → 0', () => {
    expect(rangeToLevel(0, 0, 255)).toBe(0);
  });

  it('255 (max) → 254', () => {
    expect(rangeToLevel(255, 0, 255)).toBe(254);
  });

  it('127/255 → ~127', () => {
    const level = rangeToLevel(127, 0, 255);
    expect(level).toBeGreaterThan(124);
    expect(level).toBeLessThan(130);
  });
});

describe('range converter via findMapping', () => {
  it('range 0 → level 0', () => {
    const ctrl = meta({ type: 'range', min: 0, max: 255 });
    const m = findMapping(ctrl)!;
    expect(m.converter('0', ctrl)).toBe(0);
  });

  it('range 255 → level 254', () => {
    const ctrl = meta({ type: 'range', min: 0, max: 255 });
    const m = findMapping(ctrl)!;
    expect(m.converter('255', ctrl)).toBe(254);
  });
});

describe('dimmer converter via findMapping', () => {
  it('dimmer 0 → level 0', () => {
    const ctrl = meta({ type: 'dimmer', min: 0, max: 65535 });
    const m = findMapping(ctrl)!;
    expect(m.converter('0', ctrl)).toBe(0);
  });

  it('dimmer 65535 → level 254', () => {
    const ctrl = meta({ type: 'dimmer', min: 0, max: 65535 });
    const m = findMapping(ctrl)!;
    expect(m.converter('65535', ctrl)).toBe(254);
  });
});

// ---------------------------------------------------------------------------
// deprecated type normalization
// ---------------------------------------------------------------------------

describe('normalizeDeprecatedType', () => {
  it("'temperature' → {type:'value', units:'deg C'}", () => {
    const result = normalizeDeprecatedType({ type: 'temperature' });
    expect(result.type).toBe('value');
    expect(result.units).toBe('deg C');
  });

  it("'lux' → {type:'value', units:'lx'}", () => {
    const result = normalizeDeprecatedType({ type: 'lux' });
    expect(result.type).toBe('value');
    expect(result.units).toBe('lx');
  });

  it("'power' → {type:'value', units:'W'}", () => {
    const result = normalizeDeprecatedType({ type: 'power' });
    expect(result.type).toBe('value');
    expect(result.units).toBe('W');
  });

  it("'switch' is unchanged", () => {
    const m = { type: 'switch' as const };
    const result = normalizeDeprecatedType(m);
    expect(result.type).toBe('switch');
  });

  it("deprecated type maps via findMapping: 'temperature' finds temperatureSensor", () => {
    const m = findMapping({ type: 'temperature' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('measuredValue');
  });

  it("'rel_humidity' → findMapping finds humiditySensor", () => {
    const m = findMapping({ type: 'rel_humidity' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('measuredValue');
  });

  it("'voltage' → findMapping finds electricalSensor (voltage)", () => {
    const m = findMapping({ type: 'voltage' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('voltage');
  });

  it("'current' → findMapping finds electricalSensor (activeCurrent)", () => {
    const m = findMapping({ type: 'current' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('activeCurrent');
  });

  it("'pressure' → findMapping finds pressureSensor", () => {
    const m = findMapping({ type: 'pressure' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('measuredValue');
  });

  it("'power_consumption' → findMapping finds electricalSensor (kWh)", () => {
    const m = findMapping({ type: 'power_consumption' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('cumulativeEnergyImported');
  });

  it("'water_flow' → findMapping finds flowSensor", () => {
    const m = findMapping({ type: 'water_flow' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('measuredValue');
  });

  it("'atmospheric_pressure' → findMapping finds pressureSensor", () => {
    const m = findMapping({ type: 'atmospheric_pressure' });
    expect(m).toBeDefined();
    expect(m!.matterAttribute).toBe('measuredValue');
  });

  it("'concentration' → findMapping finds airQualitySensor (ppm fallback)", () => {
    const m = findMapping({ type: 'concentration' });
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(CarbonDioxideConcentrationMeasurement.Cluster.id);
  });
});

// ---------------------------------------------------------------------------
// Air quality — 9 gas concentration clusters
// ---------------------------------------------------------------------------

describe('air quality concentration clusters', () => {
  const ppmMeta = meta({ type: 'value', units: 'ppm' });

  it('co2 name → CarbonDioxideConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_co2_level');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(CarbonDioxideConcentrationMeasurement.Cluster.id);
  });

  it('co name → CarbonMonoxideConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_co_concentration');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(CarbonMonoxideConcentrationMeasurement.Cluster.id);
  });

  it('no2 name → NitrogenDioxideConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_no2');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(NitrogenDioxideConcentrationMeasurement.Cluster.id);
  });

  it('ozone name → OzoneConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_ozone');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(OzoneConcentrationMeasurement.Cluster.id);
  });

  it('formaldehyde name → FormaldehydeConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_hcho');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(FormaldehydeConcentrationMeasurement.Cluster.id);
  });

  it('tvoc name → TotalVolatileOrganicCompoundsConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_tvoc');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id);
  });

  it('radon name → RadonConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_radon');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(RadonConcentrationMeasurement.Cluster.id);
  });

  it('pm1 name → Pm1ConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_pm1');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(Pm1ConcentrationMeasurement.Cluster.id);
  });

  it('pm25 name → Pm25ConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_pm25');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(Pm25ConcentrationMeasurement.Cluster.id);
  });

  it('pm10 name → Pm10ConcentrationMeasurement', () => {
    const m = findMapping(ppmMeta, 'sensor_pm10');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(Pm10ConcentrationMeasurement.Cluster.id);
  });

  it('ppm no name → fallback CO2 cluster', () => {
    const m = findMapping(ppmMeta, '');
    expect(m).toBeDefined();
    expect(m!.matterClusterIds).toContain(CarbonDioxideConcentrationMeasurement.Cluster.id);
  });

  it('converter: 800 ppm → 800', () => {
    const m = findMapping(ppmMeta, 'sensor_co2_level')!;
    expect(m.converter('800', ppmMeta)).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// lock / fan name-based mappings
// ---------------------------------------------------------------------------

describe('switch lock/fan name-based mappings', () => {
  const sw = meta({ type: 'switch' });

  it('switch + "lock" name → doorLockDevice (MA-doorLock), lockState Locked on 1', () => {
    const m = findMapping(sw, 'door_lock');
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-doorLock');
    expect(m!.converter('1', sw)).toBe(DoorLock.LockState.Locked);
    expect(m!.converter('0', sw)).toBe(DoorLock.LockState.Unlocked);
  });

  it('switch + "замок" name → doorLockDevice', () => {
    const m = findMapping(sw, 'замок_входной');
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-doorLock');
  });

  it('doorLock reverseConverter: Locked → "1", Unlocked → "0"', () => {
    const m = findMapping(sw, 'door_lock')!;
    expect(m.reverseConverter!(DoorLock.LockState.Locked, sw)).toBe('1');
    expect(m.reverseConverter!(DoorLock.LockState.Unlocked, sw)).toBe('0');
  });

  it('switch + "fan" name → fanDevice (MA-fan), fanMode Off on 0', () => {
    const m = findMapping(sw, 'bathroom_fan');
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-fan');
    expect(m!.converter('0', sw)).toBe(FanControl.FanMode.Off);
    expect(m!.converter('1', sw)).toBe(FanControl.FanMode.High);
  });

  it('switch + "вент" name → fanDevice', () => {
    const m = findMapping(sw, 'вентилятор_кухня');
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-fan');
  });

  it('fan reverseConverter: Off → "0", High → "1"', () => {
    const m = findMapping(sw, 'bathroom_fan')!;
    expect(m.reverseConverter!(FanControl.FanMode.Off, sw)).toBe('0');
    expect(m.reverseConverter!(FanControl.FanMode.High, sw)).toBe('1');
  });

  it('switch + "valve" name → waterValve (MA-waterValve)', () => {
    const m = findMapping(sw, 'hot_water_valve');
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-waterValve');
  });
});

// ---------------------------------------------------------------------------
// deviceOverrides
// ---------------------------------------------------------------------------

describe('findMapping with deviceOverrides', () => {
  it('override forces doorLock mapping for a generic switch control', () => {
    const sw = meta({ type: 'switch' });
    // find the doorLock mapping's deviceType from CONTROL_MAPPINGS via name
    const lockMapping = findMapping(sw, 'door_lock');
    expect(lockMapping).toBeDefined();
    const lockDeviceType = lockMapping!.matterDeviceType;
    const m = findMapping(sw, 'my_switch', { my_switch: lockDeviceType });
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-doorLock');
  });

  it('override forces fan mapping for a generic switch control', () => {
    const sw = meta({ type: 'switch' });
    const fanMapping = findMapping(sw, 'bathroom_fan');
    expect(fanMapping).toBeDefined();
    const fanDeviceType = fanMapping!.matterDeviceType;
    const m = findMapping(sw, 'my_switch', { my_switch: fanDeviceType });
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-fan');
  });

  it('without override, name-based matching still works', () => {
    const sw = meta({ type: 'switch' });
    const m = findMapping(sw, 'door_lock', {});
    expect(m).toBeDefined();
    expect(m!.matterDeviceType.name).toBe('MA-doorLock');
  });
});

// ---------------------------------------------------------------------------
// roundToPrecision
// ---------------------------------------------------------------------------

describe('roundToPrecision', () => {
  it('precision=0.1 → 1 decimal place', () => {
    expect(roundToPrecision(23.567, 0.1)).toBeCloseTo(23.6, 5);
  });

  it('precision=0.5 → rounds to nearest 0.5', () => {
    expect(roundToPrecision(23.3, 0.5)).toBeCloseTo(23.5, 5);
    expect(roundToPrecision(23.2, 0.5)).toBeCloseTo(23, 5);
  });

  it('precision=1 → integer', () => {
    expect(roundToPrecision(23.7, 1)).toBe(24);
  });

  it('precision=undefined → value unchanged', () => {
    expect(roundToPrecision(23.567, undefined)).toBe(23.567);
  });

  it('precision=0 → value unchanged', () => {
    expect(roundToPrecision(23.567, 0)).toBe(23.567);
  });
});

// ---------------------------------------------------------------------------
// precision in reverseConverter
// ---------------------------------------------------------------------------

describe('precision handling in reverseConverter', () => {
  it('temperature reverseConverter with precision=0.1', () => {
    const ctrl = meta({ type: 'value', units: 'deg C', precision: 0.1 });
    const m = findMapping(ctrl)!;
    // Matter value 2356 → 23.56°C → rounded to 23.6 with precision=0.1
    expect(m.reverseConverter!(2356, ctrl)).toBe('23.6');
  });

  it('temperature reverseConverter without precision → raw', () => {
    const ctrl = meta({ type: 'value', units: 'deg C' });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(2350, ctrl)).toBe('23.5');
  });

  it('pressure mbar reverseConverter with precision=1', () => {
    const ctrl = meta({ type: 'value', units: 'mbar', precision: 1 });
    const m = findMapping(ctrl)!;
    expect(m.reverseConverter!(1013, ctrl)).toBe('1013');
  });
});

// ---------------------------------------------------------------------------
// bounds clamping in rangeToLevel / levelToRange
// ---------------------------------------------------------------------------

describe('bounds clamping', () => {
  it('rangeToLevel clamps above 254 to 254', () => {
    // value > max still clamps
    expect(rangeToLevel(300, 0, 255)).toBe(254);
  });

  it('rangeToLevel clamps below 0 to 0', () => {
    expect(rangeToLevel(-10, 0, 255)).toBe(0);
  });

  it('levelToRange clamps level > 254 to 254 before scaling', () => {
    // level=300 → clamped to 254 → same as max
    expect(levelToRange(300, 0, 255)).toBe(255);
  });

  it('levelToRange clamps level < 0 to 0 before scaling', () => {
    expect(levelToRange(-10, 0, 255)).toBe(0);
  });
});
