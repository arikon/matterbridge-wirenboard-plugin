/**
 * Integration tests for WirenboardPlatform.
 *
 * Tests the lifecycle and MQTT event handling without real MQTT or Matter stack.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AnsiLogger } from 'matterbridge/logger';
import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';

// ---------------------------------------------------------------------------
// Shared mock state — accessed inside jest.unstable_mockModule factories via closure.
// ---------------------------------------------------------------------------

const mockFns = {
  registerDevice: jest.fn().mockResolvedValue(undefined),
  unregisterAllDevices: jest.fn().mockResolvedValue(undefined),
  clearSelect: jest.fn().mockResolvedValue(undefined),
  setSelectDevice: jest.fn(),
  validateDevice: jest.fn().mockReturnValue(true),
  onConfigure: jest.fn().mockResolvedValue(undefined),
  verifyMatterbridgeVersion: jest.fn().mockReturnValue(true),
  mqttStart: jest.fn().mockResolvedValue(undefined),
  mqttStop: jest.fn().mockResolvedValue(undefined),
  mqttPublish: jest.fn().mockResolvedValue(undefined),
};

// MQTT listener registry — populated by mockMqttOn
const mqttListeners: Map<string, Array<(evt: unknown) => void>> = new Map();

const mockMqttOn = jest.fn((event: string, handler: (evt: unknown) => void) => {
  const existing = mqttListeners.get(event) ?? [];
  existing.push(handler);
  mqttListeners.set(event, existing);
});

// ---------------------------------------------------------------------------
// ESM mocks via jest.unstable_mockModule (must be before dynamic imports)
// ---------------------------------------------------------------------------

const makeDeviceType = (name: string, code: number) => ({ name, code });

jest.unstable_mockModule('matterbridge', () => {
  class BasePlatform {
    matterbridge: unknown;
    log: unknown;
    config: unknown;
    ready = Promise.resolve();

    constructor(mb: unknown, log: unknown, cfg: unknown) {
      this.matterbridge = mb;
      this.log = log;
      this.config = cfg;
    }

    get verifyMatterbridgeVersion() {
      return mockFns.verifyMatterbridgeVersion;
    }
    get registerDevice() { return mockFns.registerDevice; }
    get unregisterAllDevices() { return mockFns.unregisterAllDevices; }
    get clearSelect() { return mockFns.clearSelect; }
    get setSelectDevice() { return mockFns.setSelectDevice; }
    get setSelectDeviceEntity() { return jest.fn(); }
    get validateDevice() { return mockFns.validateDevice; }

    async onConfigure(): Promise<void> {
      await mockFns.onConfigure();
    }

    async onShutdown(_reason?: string): Promise<void> {
      // base no-op
    }
  }

  return {
    MatterbridgeDynamicPlatform: BasePlatform,
    MatterbridgeEndpoint: jest.fn().mockImplementation((_type: unknown, opts?: { id?: string }) => {
      const ep: Record<string, unknown> = {
        id: opts?.id ?? 'mock',
        maybeNumber: 1,
        deviceType: _type,
        setAttribute: jest.fn(),
        triggerEvent: jest.fn(),
        hasClusterServer: jest.fn(() => true),
        addRequiredClusterServers: jest.fn(function() { return ep; }),
        addCommandHandler: jest.fn(function() { return ep; }),
        createDefaultBridgedDeviceBasicInformationClusterServer: jest.fn(function() { return ep; }),
        createDefaultHeatingThermostatClusterServer: jest.fn(function() { return ep; }),
        createDefaultCoolingThermostatClusterServer: jest.fn(function() { return ep; }),
        createDefaultThermostatClusterServer: jest.fn(function() { return ep; }),
        addChildDeviceTypeWithClusterServer: jest.fn(function(childId: string) {
          const child: Record<string, unknown> = {
            id: childId,
            maybeNumber: 1,
            setAttribute: jest.fn(),
            triggerEvent: jest.fn(),
            hasClusterServer: jest.fn(() => true),
            addRequiredClusterServers: jest.fn(function() { return child; }),
            addCommandHandler: jest.fn(function() { return child; }),
            createDefaultBridgedDeviceBasicInformationClusterServer: jest.fn(function() { return child; }),
            addChildDeviceTypeWithClusterServer: jest.fn(function() { return child; }),
          };
          return child;
        }),
      };
      return ep;
    }),
    onOffOutlet: makeDeviceType('onOffOutlet', 266),
    dimmableLight: makeDeviceType('dimmableLight', 257),
    thermostatDevice: makeDeviceType('thermostatDevice', 769),
    extendedColorLight: makeDeviceType('extendedColorLight', 269),
    coverDevice: makeDeviceType('coverDevice', 514),
    doorLockDevice: makeDeviceType('doorLockDevice', 10),
    fanDevice: makeDeviceType('fanDevice', 43),
    waterValve: makeDeviceType('waterValve', 0x0042),
    genericSwitch: makeDeviceType('genericSwitch', 15),
    airQualitySensor: makeDeviceType('airQualitySensor', 0x002c),
    temperatureSensor: makeDeviceType('temperatureSensor', 0x0302),
    humiditySensor: makeDeviceType('humiditySensor', 0x0307),
    occupancySensor: makeDeviceType('occupancySensor', 0x0107),
    contactSensor: makeDeviceType('contactSensor', 0x0015),
    smokeCoAlarm: makeDeviceType('smokeCoAlarm', 0x0076),
    pressureSensor: makeDeviceType('pressureSensor', 0x0305),
    lightSensor: makeDeviceType('lightSensor', 0x0106),
    electricalSensor: makeDeviceType('electricalSensor', 0x0510),
    flowSensor: makeDeviceType('flowSensor', 0x0306),
    rainSensor: makeDeviceType('rainSensor', 0x0044),
    pumpDevice: makeDeviceType('pumpDevice', 0x0303),
    waterFreezeDetector: makeDeviceType('waterFreezeDetector', 0x0041),
    waterLeakDetector: makeDeviceType('waterLeakDetector', 0x0043),
    onOffLight: makeDeviceType('onOffLight', 256),
  };
});

jest.unstable_mockModule('matterbridge/logger', () => ({}));
jest.unstable_mockModule('matterbridge/matter/types', () => ({}));

jest.unstable_mockModule('matterbridge/matter/clusters', () => {
  const makeCluster = (name: string, id: number) => ({ Cluster: { id }, name });
  return {
    OnOff: makeCluster('OnOff', 6),
    LevelControl: makeCluster('LevelControl', 8),
    Thermostat: { Cluster: { id: 513 }, SystemMode: { Off: 0, Heat: 4, Cool: 3, Auto: 1 }, SetpointRaiseLowerMode: { Both: 2, Heat: 0, Cool: 1 } },
    BridgedDeviceBasicInformation: makeCluster('BridgedDeviceBasicInformation', 57),
    DoorLock: { Cluster: { id: 257 }, LockState: { Locked: 1, Unlocked: 2 } },
    FanControl: { Cluster: { id: 514 }, FanMode: { Off: 0, High: 3 } },
    WindowCovering: makeCluster('WindowCovering', 258),
    ValveConfigurationAndControl: { Cluster: { id: 129 }, ValveState: { Open: 1, Closed: 0 } },
    AirQuality: { Cluster: { id: 91 }, AirQualityEnum: { Good: 1, Fair: 2, Moderate: 3, Poor: 4, VeryPoor: 5 } },
    TemperatureMeasurement: makeCluster('TemperatureMeasurement', 1026),
    RelativeHumidityMeasurement: makeCluster('RelativeHumidityMeasurement', 1029),
    OccupancySensing: makeCluster('OccupancySensing', 1030),
    BooleanState: makeCluster('BooleanState', 69),
    SmokeCoAlarm: { Cluster: { id: 92 }, AlarmState: { Normal: 0, Critical: 1 } },
    PressureMeasurement: makeCluster('PressureMeasurement', 1027),
    IlluminanceMeasurement: makeCluster('IlluminanceMeasurement', 1024),
    ElectricalPowerMeasurement: makeCluster('ElectricalPowerMeasurement', 144),
    ElectricalEnergyMeasurement: makeCluster('ElectricalEnergyMeasurement', 145),
    FlowMeasurement: makeCluster('FlowMeasurement', 1028),
    CarbonDioxideConcentrationMeasurement: makeCluster('CarbonDioxideConcentrationMeasurement', 1037),
    CarbonMonoxideConcentrationMeasurement: makeCluster('CarbonMonoxideConcentrationMeasurement', 1036),
    Pm25ConcentrationMeasurement: makeCluster('Pm25ConcentrationMeasurement', 1066),
    Pm1ConcentrationMeasurement: makeCluster('Pm1ConcentrationMeasurement', 1068),
    Pm10ConcentrationMeasurement: makeCluster('Pm10ConcentrationMeasurement', 1069),
    FormaldehydeConcentrationMeasurement: makeCluster('FormaldehydeConcentrationMeasurement', 1067),
    NitrogenDioxideConcentrationMeasurement: makeCluster('NitrogenDioxideConcentrationMeasurement', 1043),
    OzoneConcentrationMeasurement: makeCluster('OzoneConcentrationMeasurement', 1045),
    RadonConcentrationMeasurement: makeCluster('RadonConcentrationMeasurement', 1071),
    TotalVolatileOrganicCompoundsConcentrationMeasurement: makeCluster('TotalVolatileOrganicCompoundsConcentrationMeasurement', 1070),
    ColorControl: { Cluster: { id: 768 }, ColorMode: { CurrentHueAndCurrentSaturation: 0 } },
  };
});

jest.unstable_mockModule('matterbridge/matter', () => {
  const tags = Array.from({ length: 16 }, (_, i) => ({ namespaceId: 7, tag: i + 1 }));
  return {
    NumberTag: {
      One: tags[0], Two: tags[1], Three: tags[2], Four: tags[3], Five: tags[4],
      Six: tags[5], Seven: tags[6], Eight: tags[7], Nine: tags[8], Ten: tags[9],
      Eleven: tags[10], Twelve: tags[11], Thirteen: tags[12], Fourteen: tags[13],
      Fifteen: tags[14], Sixteen: tags[15],
    },
  };
});

jest.unstable_mockModule('matterbridge/utils', () => ({
  waiter: jest.fn(async (_name: unknown, condition: () => boolean) => {
    // Poll condition up to 10 times with 1ms delay to allow idle time to elapse
    for (let i = 0; i < 10; i++) {
      if (condition()) return true;
      await new Promise((r) => setTimeout(r, 1));
    }
    return false;
  }),
}));

jest.unstable_mockModule('../src/wirenboardMqtt.js', () => ({
  WirenboardMqtt: jest.fn(() => ({
    start: mockFns.mqttStart,
    stop: mockFns.mqttStop,
    publish: mockFns.mqttPublish,
    on: mockMqttOn,
  })),
}));

// ---------------------------------------------------------------------------
// Dynamic import after mocks
// ---------------------------------------------------------------------------

const { WirenboardPlatform } = await import('../src/module.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function emitMqttEvent(event: string, payload: unknown): void {
  const handlers = mqttListeners.get(event) ?? [];
  for (const h of handlers) h(payload);
}

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

const mockMatterbridge = {
  matterbridgeVersion: '3.4.0',
  aggregatorVendorId: 0xfff1,
} as unknown as PlatformMatterbridge;

function makeConfig(overrides: Record<string, unknown> = {}): PlatformConfig {
  return {
    name: 'matterbridge-wirenboard-plugin',
    type: 'DynamicPlatform',
    mqttHost: 'localhost',
    discoveryTimeout: 1,
    discoveryIdleMs: 50,
    ...overrides,
  } as unknown as PlatformConfig;
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mqttListeners.clear();
  mockFns.registerDevice.mockResolvedValue(undefined);
  mockFns.unregisterAllDevices.mockResolvedValue(undefined);
  mockFns.clearSelect.mockResolvedValue(undefined);
  mockFns.onConfigure.mockResolvedValue(undefined);
  mockFns.verifyMatterbridgeVersion.mockReturnValue(true);
  mockFns.validateDevice.mockReturnValue(true);
  mockFns.mqttStart.mockResolvedValue(undefined);
  mockFns.mqttStop.mockResolvedValue(undefined);
  mockFns.mqttPublish.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('WirenboardPlatform constructor', () => {
  it('starts MQTT on construction', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    expect(mockFns.mqttStart).toHaveBeenCalledTimes(1);
  });

  it('throws if matterbridge version check fails', () => {
    mockFns.verifyMatterbridgeVersion.mockReturnValue(false);
    expect(() => new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig())).toThrow();
  });

  it('registers listeners for device-meta, control-meta, control-value, control-error', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    const events = [...mqttListeners.keys()];
    expect(events).toContain('device-meta');
    expect(events).toContain('control-meta');
    expect(events).toContain('control-value');
    expect(events).toContain('control-error');
  });
});

// ---------------------------------------------------------------------------
// Device discovery
// ---------------------------------------------------------------------------

describe('Device discovery', () => {
  it('handles device-meta without error', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('device-meta', {
      deviceName: 'wb-mr6c_28',
      meta: { driver: 'wb-mr6c', title: { en: 'WB-MR6C 28' } },
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('handles control-meta without error', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('device-meta', {
      deviceName: 'wb-mr6c_28',
      meta: { driver: 'wb-mr6c', title: { en: 'WB-MR6C 28' } },
    });
    emitMqttEvent('control-meta', {
      deviceName: 'wb-mr6c_28',
      controlName: 'K1',
      meta: { type: 'switch', readonly: false },
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('creates placeholder device on control-meta before device-meta', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('control-meta', {
      deviceName: 'wb-unknown',
      controlName: 'K1',
      meta: { type: 'switch', readonly: false },
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('handles control-value before onConfigure without error', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('device-meta', { deviceName: 'wb-mr6c_28', meta: { driver: 'wb-mr6c', title: 'WB-MR6C' } });
    emitMqttEvent('control-meta', { deviceName: 'wb-mr6c_28', controlName: 'K1', meta: { type: 'switch', readonly: false } });
    emitMqttEvent('control-value', { deviceName: 'wb-mr6c_28', controlName: 'K1', value: '1' });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('ignores control-value for unknown device', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('control-value', { deviceName: 'no-such-device', controlName: 'K1', value: '1' });
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onStart
// ---------------------------------------------------------------------------

describe('onStart', () => {
  it('calls clearSelect', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ discoveryTimeout: 1 }));
    await platform.onStart('test');
    expect(mockFns.clearSelect).toHaveBeenCalled();
  });

  it('warns on discovery timeout when no devices found', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ discoveryTimeout: 1 }));
    await platform.onStart('test');
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('registers switch endpoint after discovery', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }));
    emitMqttEvent('device-meta', { deviceName: 'wb-mr6c_28', meta: { driver: 'wb-mr6c', title: 'WB-MR6C' } });
    emitMqttEvent('control-meta', { deviceName: 'wb-mr6c_28', controlName: 'K1', meta: { type: 'switch', readonly: false } });
    await platform.onStart('test');
    expect(mockFns.registerDevice).toHaveBeenCalled();
  });

  it('does not register when validateDevice returns false', async () => {
    mockFns.validateDevice.mockReturnValue(false);
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ discoveryTimeout: 1 }));
    emitMqttEvent('device-meta', { deviceName: 'wb-mr6c_28', meta: { driver: 'wb-mr6c', title: 'WB-MR6C' } });
    emitMqttEvent('control-meta', { deviceName: 'wb-mr6c_28', controlName: 'K1', meta: { type: 'switch', readonly: false } });
    await platform.onStart('test');
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
  });

  it('does not register devices with no mappable controls', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ discoveryTimeout: 1 }));
    emitMqttEvent('device-meta', { deviceName: 'wb-text-only', meta: { driver: 'wb-test', title: 'WB-TEST' } });
    // 'text' type with no special name has no mapping
    emitMqttEvent('control-meta', { deviceName: 'wb-text-only', controlName: 'SomeText', meta: { type: 'text', readonly: true } });
    await platform.onStart('test');
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onConfigure
// ---------------------------------------------------------------------------

describe('onConfigure', () => {
  it('calls super.onConfigure', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    await platform.onConfigure();
    expect(mockFns.onConfigure).toHaveBeenCalled();
  });

  it('logs onConfigure called', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    await platform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('onConfigure'));
  });
});

// ---------------------------------------------------------------------------
// onShutdown
// ---------------------------------------------------------------------------

describe('onShutdown', () => {
  it('stops MQTT', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    await platform.onShutdown('test');
    expect(mockFns.mqttStop).toHaveBeenCalled();
  });

  it('unregisters all devices when unregisterOnShutdown=true', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ unregisterOnShutdown: true }));
    await platform.onShutdown('test');
    expect(mockFns.unregisterAllDevices).toHaveBeenCalled();
  });

  it('does not unregister when unregisterOnShutdown=false', async () => {
    const platform = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig({ unregisterOnShutdown: false }));
    await platform.onShutdown('test');
    expect(mockFns.unregisterAllDevices).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// control-error
// ---------------------------------------------------------------------------

describe('control-error event', () => {
  it('stores error on known control without throwing', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('device-meta', { deviceName: 'wb-mr6c_28', meta: { driver: 'wb-mr6c', title: 'WB-MR6C' } });
    emitMqttEvent('control-meta', { deviceName: 'wb-mr6c_28', controlName: 'K1', meta: { type: 'switch', readonly: false } });
    emitMqttEvent('control-error', { deviceName: 'wb-mr6c_28', controlName: 'K1', error: 'r' });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('ignores control-error for unknown device', () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent('control-error', { deviceName: 'unknown-device', controlName: 'K1', error: 'r' });
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});
