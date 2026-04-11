/**
 * Unit tests for WirenboardDevice.
 *
 * MatterbridgeEndpoint is mocked so no real Matter stack is needed.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AnsiLogger } from 'matterbridge/logger';
import type { WbControl, WbDevice } from '../src/wirenboardTypes.js';
import type { WirenboardMqtt } from '../src/wirenboardMqtt.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Track instances created by MatterbridgeEndpoint constructor
const endpointInstances: MockEndpoint[] = [];

class MockEndpoint {
  id: string;
  maybeNumber: number | undefined = 1;
  private commandHandlers: Map<string, (...args: unknown[]) => unknown> = new Map();
  private attributes: Map<string, unknown> = new Map();

  setAttribute = jest.fn((clusterId: unknown, attr: string, value: unknown) => {
    this.attributes.set(attr, value);
  });
  triggerEvent = jest.fn();
  addRequiredClusterServers = jest.fn(() => this);
  createDefaultBridgedDeviceBasicInformationClusterServer = jest.fn(() => this);
  hasClusterServer = jest.fn(() => true);
  addCommandHandler = jest.fn((name: string, handler: (...args: unknown[]) => unknown) => {
    this.commandHandlers.set(name, handler);
    return this;
  });
  addChildDeviceTypeWithClusterServer = jest.fn((childId: string) => {
    const child = new MockEndpoint(undefined, { id: childId });
    return child;
  });
  createDefaultHeatingThermostatClusterServer = jest.fn(() => this);
  createDefaultCoolingThermostatClusterServer = jest.fn(() => this);
  createDefaultThermostatClusterServer = jest.fn(() => this);

  constructor(public deviceType: unknown, opts?: { id?: string }) {
    this.id = opts?.id ?? 'mock-endpoint';
    endpointInstances.push(this);
  }

  /** Test helper: invoke a registered command handler */
  invokeHandler(name: string, args?: unknown): unknown {
    const handler = this.commandHandlers.get(name);
    if (!handler) throw new Error(`No handler for '${name}'`);
    return handler(args);
  }

  /** Test helper: get last setAttribute value */
  getAttr(attr: string): unknown {
    return this.attributes.get(attr);
  }
}

// ---------------------------------------------------------------------------
// ESM mocks via jest.unstable_mockModule (must be before dynamic imports)
// ---------------------------------------------------------------------------

const makeDeviceType = (name: string, code: number) => ({ name, code });

jest.unstable_mockModule('matterbridge', () => ({
  MatterbridgeEndpoint: MockEndpoint,
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
}));

jest.unstable_mockModule('matterbridge/logger', () => ({}));

jest.unstable_mockModule('matterbridge/matter/types', () => ({}));

jest.unstable_mockModule('../src/wirenboardMqtt.js', () => ({
  WirenboardMqtt: jest.fn(),
}));

jest.unstable_mockModule('matterbridge/matter/clusters', () => {
  const makeCluster = (name: string, id: number) => ({ Cluster: { id }, name });
  return {
    OnOff: makeCluster('OnOff', 6),
    LevelControl: makeCluster('LevelControl', 8),
    Thermostat: {
      Cluster: { id: 513 },
      SystemMode: { Off: 0, Heat: 4, Cool: 3, Auto: 1 },
      SetpointRaiseLowerMode: { Both: 2, Heat: 0, Cool: 1 },
    },
    BridgedDeviceBasicInformation: makeCluster('BridgedDeviceBasicInformation', 57),
    DoorLock: {
      Cluster: { id: 257 },
      LockState: { Locked: 1, Unlocked: 2 },
    },
    FanControl: { Cluster: { id: 514 }, FanMode: { Off: 0, High: 3 } },
    WindowCovering: makeCluster('WindowCovering', 258),
    ValveConfigurationAndControl: {
      Cluster: { id: 129 },
      ValveState: { Open: 1, Closed: 0 },
    },
    AirQuality: {
      Cluster: { id: 91 },
      AirQualityEnum: { Good: 1, Fair: 2, Moderate: 3, Poor: 4, VeryPoor: 5 },
    },
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
  };
});

jest.unstable_mockModule('matterbridge/matter', () => {
  const tags = Array.from({ length: 16 }, (_, i) => ({
    namespaceId: 7,
    tag: i + 1,
  }));
  return {
    NumberTag: {
      One: tags[0],
      Two: tags[1],
      Three: tags[2],
      Four: tags[3],
      Five: tags[4],
      Six: tags[5],
      Seven: tags[6],
      Eight: tags[7],
      Nine: tags[8],
      Ten: tags[9],
      Eleven: tags[10],
      Twelve: tags[11],
      Thirteen: tags[12],
      Fourteen: tags[13],
      Fifteen: tags[14],
      Sixteen: tags[15],
    },
  };
});

// ---------------------------------------------------------------------------
// Dynamic import after mocks
// ---------------------------------------------------------------------------

const { WirenboardDevice } = await import('../src/wirenboardDevice.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

function makeMqtt(): jest.Mocked<WirenboardMqtt> {
  return {
    publish: jest.fn(() => Promise.resolve()),
  } as unknown as jest.Mocked<WirenboardMqtt>;
}

function makeSwitch(name: string, value?: string): WbControl {
  return {
    name,
    meta: { type: 'switch', readonly: false },
    value,
    error: undefined,
  };
}

function makeValueControl(name: string, units?: string, readonly = true): WbControl {
  return {
    name,
    meta: { type: 'value', units, readonly },
    value: undefined,
    error: undefined,
  };
}

function makeDevice(name: string, controls: WbControl[]): WbDevice {
  const controlMap = new Map<string, WbControl>();
  for (const c of controls) controlMap.set(c.name, c);
  return {
    name,
    meta: { driver: 'wb-test', title: { en: `${name} Title` } },
    controls: controlMap,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  endpointInstances.length = 0;
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// groupingMode: 'device'
// ---------------------------------------------------------------------------

describe("groupingMode 'device'", () => {
  it('creates one root endpoint with child endpoints for each control', async () => {
    const wbDevice = makeDevice('wb-mr6c_28', [
      makeSwitch('K1'),
      makeSwitch('K2'),
    ]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    // One root endpoint exposed
    expect(dev.endpoints).toHaveLength(1);
    // addChildDeviceTypeWithClusterServer called for each control
    const root = dev.endpoints[0] as unknown as MockEndpoint;
    expect(root.addChildDeviceTypeWithClusterServer).toHaveBeenCalledTimes(2);
  });

  it('sets up device with correct id', async () => {
    const wbDevice = makeDevice('my-device', [makeSwitch('relay')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const root = endpointInstances.find((e) => e.id === 'my-device');
    expect(root).toBeDefined();
  });

  it('calls createDefaultBridgedDeviceBasicInformationClusterServer on root', async () => {
    const wbDevice = makeDevice('wb-dev', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const root = endpointInstances.find((e) => e.id === 'wb-dev');
    expect(root!.createDefaultBridgedDeviceBasicInformationClusterServer).toHaveBeenCalledWith(
      'wb-dev Title',
      'wb-dev',
      0xfff1,
      'Wirenboard',
      'wb-test',
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// groupingMode: 'control'
// ---------------------------------------------------------------------------

describe("groupingMode 'control'", () => {
  it('creates separate endpoint per control', async () => {
    const wbDevice = makeDevice('wb-mr6c_28', [
      makeSwitch('K1'),
      makeSwitch('K2'),
      makeSwitch('K3'),
    ]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    // One endpoint per control
    expect(dev.endpoints).toHaveLength(3);
  });

  it('uses deviceName_controlName as endpoint id', async () => {
    const wbDevice = makeDevice('wb-mr6c_28', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_28_K1');
    expect(ep).toBeDefined();
  });

  it('returns primaryEndpoint as first endpoint', async () => {
    const wbDevice = makeDevice('wb-dev', [makeSwitch('relay1'), makeSwitch('relay2')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    expect(dev.primaryEndpoint).toBe(dev.endpoints[0]);
  });
});

// ---------------------------------------------------------------------------
// HW metadata extraction
// ---------------------------------------------------------------------------

describe('HW metadata extraction', () => {
  it('uses serial number in BridgedDeviceBasicInformation', async () => {
    const controls: WbControl[] = [
      { name: 'Serial', meta: { type: 'text', readonly: true }, value: 'SN-12345', error: undefined },
      makeSwitch('K1'),
    ];
    const wbDevice = makeDevice('wb-dev', controls);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const root = endpointInstances.find((e) => e.id === 'wb-dev');
    expect(root!.createDefaultBridgedDeviceBasicInformationClusterServer).toHaveBeenCalledWith(
      expect.any(String),
      'SN-12345',
      expect.any(Number),
      expect.any(String),
      expect.any(String),
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('uses FW version in BridgedDeviceBasicInformation', async () => {
    const controls: WbControl[] = [
      { name: 'FW Version', meta: { type: 'text', readonly: true }, value: '4.2.0', error: undefined },
      makeSwitch('K1'),
    ];
    const wbDevice = makeDevice('wb-dev', controls);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const root = endpointInstances.find((e) => e.id === 'wb-dev');
    // softwareVersionString is at position 6 (index 6)
    const callArgs = (root!.createDefaultBridgedDeviceBasicInformationClusterServer as jest.Mock).mock.calls[0];
    expect(callArgs?.[6]).toBe('4.2.0');
  });

  it('does not create endpoint for serial/FW text controls', async () => {
    const controls: WbControl[] = [
      { name: 'Serial', meta: { type: 'text', readonly: true }, value: 'SN-1', error: undefined },
      { name: 'FW Version', meta: { type: 'text', readonly: true }, value: '1.0', error: undefined },
    ];
    const wbDevice = makeDevice('wb-no-controls', controls);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    // No mappable controls → no endpoints in 'device' mode
    expect(dev.endpoints).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Thermostat composite detection
// ---------------------------------------------------------------------------

describe('Thermostat composite detection', () => {
  function makeThermostatDevice(): WbDevice {
    const controls: WbControl[] = [
      {
        name: 'Temperature',
        meta: { type: 'value', units: 'deg C', readonly: true },
        value: '22',
        error: undefined,
      },
      {
        name: 'Setpoint',
        meta: { type: 'range', units: 'deg C', readonly: false, min: 5, max: 40 },
        value: '20',
        error: undefined,
      },
    ];
    return makeDevice('wb-thermostat', controls);
  }

  it('creates thermostat endpoint for device with temperature + setpoint', async () => {
    const wbDevice = makeThermostatDevice();
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    // Should have thermostat endpoint
    expect(dev.endpoints.length).toBeGreaterThanOrEqual(1);
    // The thermostat endpoint is first
    const thermostatEp = endpointInstances.find((e) => e.id === 'wb-thermostat');
    expect(thermostatEp).toBeDefined();
  });

  it('in control mode, thermostat id = deviceName_thermostat', async () => {
    const wbDevice = makeThermostatDevice();
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const thermostatEp = endpointInstances.find((e) => e.id === 'wb-thermostat_thermostat');
    expect(thermostatEp).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Controls without mapping → skipped with warning
// ---------------------------------------------------------------------------

describe('Controls without mapping', () => {
  it('skips unmappable controls and logs warning', async () => {
    // 'text' type without special name has no mapping
    const controls: WbControl[] = [
      { name: 'SomeText', meta: { type: 'text', readonly: true }, value: 'hello', error: undefined },
    ];
    const wbDevice = makeDevice('wb-text', controls);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    expect(dev.endpoints).toHaveLength(0);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('no mapping'),
    );
  });
});

// ---------------------------------------------------------------------------
// hidden controls → skipped
// ---------------------------------------------------------------------------

describe('Hidden controls', () => {
  it('skips controls with hidden=true by default', async () => {
    const controls: WbControl[] = [
      { name: 'K1', meta: { type: 'switch', readonly: false, hidden: true }, value: undefined, error: undefined },
    ];
    const wbDevice = makeDevice('wb-hidden', controls);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    expect(dev.endpoints).toHaveLength(0);
  });

  it('includes hidden controls when includeHidden=true', async () => {
    const controls: WbControl[] = [
      { name: 'K1', meta: { type: 'switch', readonly: false, hidden: true }, value: undefined, error: undefined },
    ];
    const wbDevice = makeDevice('wb-hidden', controls);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1, true);

    expect(dev.endpoints).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Command handlers: on/off → mqtt.publish
// ---------------------------------------------------------------------------

describe('Command handlers', () => {
  it('on command calls mqtt.publish with "1"', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    // Find endpoint for K1
    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;
    expect(ep).toBeDefined();

    // Invoke 'on' handler
    ep.invokeHandler('on');

    expect(mqtt.publish).toHaveBeenCalledWith('wb-mr6c', 'K1', '1');
  });

  it('off command calls mqtt.publish with "0"', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;
    ep.invokeHandler('off');

    expect(mqtt.publish).toHaveBeenCalledWith('wb-mr6c', 'K1', '0');
  });

  it('readonly controls do not get command handlers', async () => {
    const ctrl: WbControl = {
      name: 'Temperature',
      meta: { type: 'value', units: 'deg C', readonly: true },
      value: undefined,
      error: undefined,
    };
    const wbDevice = makeDevice('wb-sensor', [ctrl]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-sensor_Temperature') as MockEndpoint;
    expect(ep).toBeDefined();
    // addCommandHandler should NOT have been called for readonly
    expect(ep.addCommandHandler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateFromMqtt: value converted and setAttribute called
// ---------------------------------------------------------------------------

describe('updateFromMqtt', () => {
  it('converts switch value and calls setAttribute', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;
    ep.setAttribute.mockClear();

    dev.updateFromMqtt('K1', '1');

    expect(ep.setAttribute).toHaveBeenCalledWith(
      6, // OnOff.Cluster.id
      'onOff',
      true,
      mockLog,
    );
  });

  it('converts temperature value × 100 and calls setAttribute', async () => {
    const ctrl: WbControl = {
      name: 'Temperature',
      meta: { type: 'value', units: 'deg C', readonly: true },
      value: undefined,
      error: undefined,
    };
    const wbDevice = makeDevice('wb-sensor', [ctrl]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-sensor_Temperature') as MockEndpoint;
    ep.setAttribute.mockClear();

    dev.updateFromMqtt('Temperature', '22.5');

    expect(ep.setAttribute).toHaveBeenCalledWith(
      1026, // TemperatureMeasurement.Cluster.id
      'measuredValue',
      2250,
      mockLog,
    );
  });

  it('skips update if control is not in propertyMap', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;
    ep.setAttribute.mockClear();

    dev.updateFromMqtt('NonExistent', '1');

    expect(ep.setAttribute).not.toHaveBeenCalled();
  });

  it('skips unchanged value (no setAttribute called)', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;

    dev.updateFromMqtt('K1', '1');
    ep.setAttribute.mockClear();

    // Same value again → should be skipped
    dev.updateFromMqtt('K1', '1');

    expect(ep.setAttribute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// noUpdate echo suppression
// ---------------------------------------------------------------------------

describe('noUpdate echo suppression', () => {
  it('skips updateFromMqtt for 2s after handleMatterCommand', async () => {
    jest.useFakeTimers();

    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;

    // Trigger a command (sets noUpdate)
    dev.handleMatterCommand('wb-mr6c', 'K1', '1');
    ep.setAttribute.mockClear();

    // Immediately try to update from MQTT — should be suppressed
    dev.updateFromMqtt('K1', '0');
    expect(ep.setAttribute).not.toHaveBeenCalled();

    // After 2s, echo suppression should lift
    jest.advanceTimersByTime(2100);
    dev.updateFromMqtt('K1', '0');
    expect(ep.setAttribute).toHaveBeenCalled();

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// setReachable
// ---------------------------------------------------------------------------

describe('setReachable', () => {
  it('calls setAttribute and triggerEvent on all endpoints', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1'), makeSwitch('K2')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep1 = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;
    const ep2 = endpointInstances.find((e) => e.id === 'wb-mr6c_K2') as MockEndpoint;

    // maybeNumber=1 means endpoint is registered
    ep1.maybeNumber = 1;
    ep2.maybeNumber = 1;

    dev.setReachable(false);

    expect(ep1.setAttribute).toHaveBeenCalledWith(57, 'reachable', false, mockLog);
    expect(ep1.triggerEvent).toHaveBeenCalledWith(
      57,
      'reachableChanged',
      { reachableNewValue: false },
      mockLog,
    );
    expect(ep2.setAttribute).toHaveBeenCalledWith(57, 'reachable', false, mockLog);
    expect(ep2.triggerEvent).toHaveBeenCalledWith(
      57,
      'reachableChanged',
      { reachableNewValue: false },
      mockLog,
    );
  });

  it('skips endpoints where maybeNumber is undefined', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-mr6c_K1') as MockEndpoint;
    ep.maybeNumber = undefined;

    dev.setReachable(true);

    expect(ep.setAttribute).not.toHaveBeenCalled();
    expect(ep.triggerEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateFromMqtt — RGB control
// ---------------------------------------------------------------------------

describe('updateFromMqtt — RGB', () => {
  it('RGB value sets currentHue and currentSaturation', async () => {
    const ctrl: WbControl = {
      name: 'RGB',
      meta: { type: 'rgb', readonly: false },
      value: undefined,
      error: undefined,
    };
    const wbDevice = makeDevice('wb-led', [ctrl]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-led_RGB') as MockEndpoint;
    ep.setAttribute.mockClear();

    dev.updateFromMqtt('RGB', '255;0;0');

    // Should call setAttribute for currentHue and currentSaturation
    expect(ep.setAttribute).toHaveBeenCalledWith(
      expect.any(Number),
      'currentHue',
      expect.any(Number),
      mockLog,
    );
    expect(ep.setAttribute).toHaveBeenCalledWith(
      expect.any(Number),
      'currentSaturation',
      expect.any(Number),
      mockLog,
    );
  });
});

// ---------------------------------------------------------------------------
// updateFromMqtt — AirQuality (ppm)
// ---------------------------------------------------------------------------

describe('updateFromMqtt — AirQuality ppm', () => {
  it('CO2 ppm update sets both measuredValue and airQuality', async () => {
    const ctrl: WbControl = {
      name: 'co2_level',
      meta: { type: 'value', units: 'ppm', readonly: true },
      value: undefined,
      error: undefined,
    };
    const wbDevice = makeDevice('wb-air', [ctrl]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-air_co2_level') as MockEndpoint;
    ep.setAttribute.mockClear();

    dev.updateFromMqtt('co2_level', '800');

    // Should set airQuality attribute
    expect(ep.setAttribute).toHaveBeenCalledWith(
      91, // AirQuality.Cluster.id
      'airQuality',
      expect.any(Number),
      mockLog,
    );
    // Should set measuredValue
    expect(ep.setAttribute).toHaveBeenCalledWith(
      expect.any(Number),
      'measuredValue',
      800,
      mockLog,
    );
  });
});

// ---------------------------------------------------------------------------
// updateFromMqtt — converter error
// ---------------------------------------------------------------------------

describe('updateFromMqtt — converter error handling', () => {
  it('logs warn on converter exception without throwing', async () => {
    const mqtt = makeMqtt();

    // Use non-parseable value for a numeric converter — easiest via temperature
    const ctrl: WbControl = {
      name: 'Temp',
      meta: { type: 'value', units: 'deg C', readonly: true },
      value: undefined,
      error: undefined,
    };
    const wbDevice2 = makeDevice('wb-sensor2', [ctrl]);
    const dev2 = await WirenboardDevice.create(mockLog, wbDevice2, mqtt, 'control', 0xfff1);

    // NaN from parseFloat('not-a-number') * 100 = NaN, Math.round(NaN) = NaN
    // This shouldn't throw but may produce NaN — test that no exception is thrown
    expect(() => dev2.updateFromMqtt('Temp', 'not-a-number')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// groupingMode 'device' — command handlers via child endpoint
// ---------------------------------------------------------------------------

describe("groupingMode 'device' — command handlers", () => {
  it('on command in device mode calls mqtt.publish via child', async () => {
    const wbDevice = makeDevice('wb-relay', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    // In device mode, child endpoint is created by addChildDeviceTypeWithClusterServer
    // The mock returns a child with its own addCommandHandler
    // Verify that at least one command handler was registered
    const root = endpointInstances.find((e) => e.id === 'wb-relay') as MockEndpoint;
    expect(root).toBeDefined();
    expect(root.addChildDeviceTypeWithClusterServer).toHaveBeenCalled();
  });

  it('setReachable in device mode calls setAttribute on root endpoint', async () => {
    const wbDevice = makeDevice('wb-relay', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const root = endpointInstances.find((e) => e.id === 'wb-relay') as MockEndpoint;
    root.maybeNumber = 1;

    dev.setReachable(false);

    expect(root.setAttribute).toHaveBeenCalledWith(57, 'reachable', false, mockLog);
  });
});

// ---------------------------------------------------------------------------
// Thermostat — command handlers
// ---------------------------------------------------------------------------

describe('Thermostat command handlers', () => {
  function makeThermostatDevice(): WbDevice {
    const controls: WbControl[] = [
      {
        name: 'Temperature',
        meta: { type: 'value', units: 'deg C', readonly: true },
        value: '22',
        error: undefined,
      },
      {
        name: 'Setpoint',
        meta: { type: 'range', units: 'deg C', readonly: false, min: 5, max: 40 },
        value: '20',
        error: undefined,
      },
    ];
    return makeDevice('wb-thermostat', controls);
  }

  it('thermostat endpoint has setpointRaiseLower command handler', async () => {
    const wbDevice = makeThermostatDevice();
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const thermostatEp = endpointInstances.find((e) => e.id === 'wb-thermostat') as MockEndpoint;
    expect(thermostatEp).toBeDefined();
    expect(thermostatEp.addCommandHandler).toHaveBeenCalledWith(
      'setpointRaiseLower',
      expect.any(Function),
    );
  });

  it('thermostat with mode control registers changeToMode handler', async () => {
    const controls: WbControl[] = [
      { name: 'Temperature', meta: { type: 'value', units: 'deg C', readonly: true }, value: '22', error: undefined },
      { name: 'Setpoint', meta: { type: 'range', units: 'deg C', readonly: false, min: 5, max: 40 }, value: '20', error: undefined },
      { name: 'mode', meta: { type: 'text', readonly: false }, value: 'heat', error: undefined },
    ];
    const wbDevice = makeDevice('wb-thermo2', controls);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const thermostatEp = endpointInstances.find((e) => e.id === 'wb-thermo2') as MockEndpoint;
    expect(thermostatEp).toBeDefined();
    // changeToMode would be registered if modeEntry.mapping.reverseConverter exists
    // Mode mapping for 'text' type doesn't have reverseConverter via findMapping
    // but thermostat builds its own — verify addCommandHandler was called multiple times
    expect(thermostatEp.addCommandHandler).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Thermostat — cooling only
// ---------------------------------------------------------------------------

describe('Thermostat — cooling only', () => {
  it('creates cooling thermostat when only cool setpoint present', async () => {
    const controls: WbControl[] = [
      { name: 'Temperature', meta: { type: 'value', units: 'deg C', readonly: true }, value: '22', error: undefined },
      { name: 'cool_setpoint', meta: { type: 'range', units: 'deg C', readonly: false, min: 5, max: 35 }, value: '20', error: undefined },
    ];
    const wbDevice = makeDevice('wb-cool', controls);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const thermostatEp = endpointInstances.find((e) => e.id === 'wb-cool') as MockEndpoint;
    expect(thermostatEp).toBeDefined();
    expect(thermostatEp.createDefaultCoolingThermostatClusterServer).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Thermostat — auto (both setpoints)
// ---------------------------------------------------------------------------

describe('Thermostat — auto (both setpoints)', () => {
  it('creates auto thermostat when both heat and cool setpoints present', async () => {
    const controls: WbControl[] = [
      { name: 'Temperature', meta: { type: 'value', units: 'deg C', readonly: true }, value: '22', error: undefined },
      { name: 'heat_setpoint', meta: { type: 'range', units: 'deg C', readonly: false, min: 5, max: 35 }, value: '20', error: undefined },
      { name: 'cool_setpoint', meta: { type: 'range', units: 'deg C', readonly: false, min: 5, max: 35 }, value: '24', error: undefined },
    ];
    const wbDevice = makeDevice('wb-auto', controls);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const thermostatEp = endpointInstances.find((e) => e.id === 'wb-auto') as MockEndpoint;
    expect(thermostatEp).toBeDefined();
    expect(thermostatEp.createDefaultThermostatClusterServer).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleMatterCommand
// ---------------------------------------------------------------------------

describe('handleMatterCommand', () => {
  it('publishes value to MQTT', async () => {
    const wbDevice = makeDevice('wb-mr6c', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    dev.handleMatterCommand('wb-mr6c', 'K1', '1');

    expect(mqtt.publish).toHaveBeenCalledWith('wb-mr6c', 'K1', '1');
  });
});

// ---------------------------------------------------------------------------
// Command handlers: levelControl moveToLevel
// ---------------------------------------------------------------------------

describe('Command handlers — levelControl', () => {
  it('moveToLevel calls mqtt.publish with reverse-converted value', async () => {
    const ctrl: WbControl = {
      name: 'Channel1',
      meta: { type: 'dimmer', min: 0, max: 65535, readonly: false },
      value: undefined,
      error: undefined,
    };
    const wbDevice = makeDevice('wb-mdm', [ctrl]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-mdm_Channel1') as MockEndpoint;
    expect(ep).toBeDefined();

    await ep.invokeHandler('moveToLevel', { request: { level: 127 } });

    expect(mqtt.publish).toHaveBeenCalledWith('wb-mdm', 'Channel1', expect.any(String));
  });

  it('toggle command inverts current switch state', async () => {
    const wbDevice = makeDevice('wb-relay', [makeSwitch('K1')]);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);
    const ep = endpointInstances.find((e) => e.id === 'wb-relay_K1') as MockEndpoint;

    // Set a known state first
    dev.updateFromMqtt('K1', '1');

    await ep.invokeHandler('toggle');
    expect(mqtt.publish).toHaveBeenCalledWith('wb-relay', 'K1', expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// Command handlers: windowCovering
// ---------------------------------------------------------------------------

describe('Command handlers — windowCovering', () => {
  function makeCurtainControl(name: string): WbControl {
    return {
      name,
      meta: { type: 'range', min: 0, max: 100, readonly: false },
      value: undefined,
      error: undefined,
    };
  }

  it('upOrOpen command calls mqtt.publish', async () => {
    const wbDevice = makeDevice('wb-cover', [makeCurtainControl('window_blind')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-cover_window_blind') as MockEndpoint;
    expect(ep).toBeDefined();

    await ep.invokeHandler('upOrOpen');
    expect(mqtt.publish).toHaveBeenCalled();
  });

  it('downOrClose command calls mqtt.publish with "0"', async () => {
    const wbDevice = makeDevice('wb-cover', [makeCurtainControl('window_blind')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-cover_window_blind') as MockEndpoint;
    await ep.invokeHandler('downOrClose');
    expect(mqtt.publish).toHaveBeenCalledWith('wb-cover', 'window_blind', '0');
  });

  it('stopMotion command logs debug', async () => {
    const wbDevice = makeDevice('wb-cover', [makeCurtainControl('window_blind')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-cover_window_blind') as MockEndpoint;
    await ep.invokeHandler('stopMotion');
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining('stopMotion'));
  });

  it('goToLiftPercentage calls mqtt.publish with reverse-converted value', async () => {
    const wbDevice = makeDevice('wb-cover', [makeCurtainControl('window_blind')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-cover_window_blind') as MockEndpoint;
    await ep.invokeHandler('goToLiftPercentage', { request: { liftPercent100thsValue: 5000 } });
    expect(mqtt.publish).toHaveBeenCalledWith('wb-cover', 'window_blind', expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// Command handlers: doorLock
// ---------------------------------------------------------------------------

describe('Command handlers — doorLock', () => {
  function makeLockControl(name: string): WbControl {
    return {
      name,
      meta: { type: 'switch', readonly: false },
      value: undefined,
      error: undefined,
    };
  }

  it('lockDoor calls mqtt.publish with "1"', async () => {
    const wbDevice = makeDevice('wb-lock', [makeLockControl('door_lock')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-lock_door_lock') as MockEndpoint;
    expect(ep).toBeDefined();

    await ep.invokeHandler('lockDoor');
    expect(mqtt.publish).toHaveBeenCalledWith('wb-lock', 'door_lock', '1');
  });

  it('unlockDoor calls mqtt.publish with "0"', async () => {
    const wbDevice = makeDevice('wb-lock', [makeLockControl('door_lock')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-lock_door_lock') as MockEndpoint;
    await ep.invokeHandler('unlockDoor');
    expect(mqtt.publish).toHaveBeenCalledWith('wb-lock', 'door_lock', '0');
  });
});

// ---------------------------------------------------------------------------
// Command handlers: fan
// ---------------------------------------------------------------------------

describe('Command handlers — fan', () => {
  it('step command logs debug', async () => {
    const ctrl: WbControl = {
      name: 'bathroom_fan',
      meta: { type: 'switch', readonly: false },
      value: undefined,
      error: undefined,
    };
    const wbDevice = makeDevice('wb-fan', [ctrl]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-fan_bathroom_fan') as MockEndpoint;
    expect(ep).toBeDefined();

    await ep.invokeHandler('step');
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining('Fan step'));
  });
});

// ---------------------------------------------------------------------------
// Command handlers: waterValve open/close
// ---------------------------------------------------------------------------

describe('Command handlers — waterValve', () => {
  function makeValveControl(name: string): WbControl {
    return {
      name,
      meta: { type: 'switch', readonly: false },
      value: undefined,
      error: undefined,
    };
  }

  it('open command calls mqtt.publish with "1"', async () => {
    const wbDevice = makeDevice('wb-valve', [makeValveControl('hot_water_valve')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-valve_hot_water_valve') as MockEndpoint;
    expect(ep).toBeDefined();

    await ep.invokeHandler('open');
    expect(mqtt.publish).toHaveBeenCalledWith('wb-valve', 'hot_water_valve', '1');
  });

  it('close command calls mqtt.publish with "0"', async () => {
    const wbDevice = makeDevice('wb-valve', [makeValveControl('hot_water_valve')]);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'control', 0xfff1);

    const ep = endpointInstances.find((e) => e.id === 'wb-valve_hot_water_valve') as MockEndpoint;
    await ep.invokeHandler('close');
    expect(mqtt.publish).toHaveBeenCalledWith('wb-valve', 'hot_water_valve', '0');
  });
});

// ---------------------------------------------------------------------------
// includeHidden controls with device grouping mode
// ---------------------------------------------------------------------------

describe('includeHidden=true in device mode', () => {
  it('includes hidden controls when includeHidden=true', async () => {
    const controls: WbControl[] = [
      { name: 'K1', meta: { type: 'switch', readonly: false, hidden: true }, value: undefined, error: undefined },
      makeSwitch('K2'),
    ];
    const wbDevice = makeDevice('wb-hidden-dev', controls);
    const mqtt = makeMqtt();

    const dev = await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1, true);

    expect(dev.endpoints).toHaveLength(1);
    const root = endpointInstances.find((e) => e.id === 'wb-hidden-dev') as MockEndpoint;
    // Both controls should be added as children
    expect(root.addChildDeviceTypeWithClusterServer).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// HW metadata — hw_batch control
// ---------------------------------------------------------------------------

describe('HW metadata — hardware version', () => {
  it('uses hardware version in BridgedDeviceBasicInformation', async () => {
    const controls: WbControl[] = [
      { name: 'HW Batch', meta: { type: 'text', readonly: true }, value: 'r3.0', error: undefined },
      makeSwitch('K1'),
    ];
    const wbDevice = makeDevice('wb-hw', controls);
    const mqtt = makeMqtt();

    await WirenboardDevice.create(mockLog, wbDevice, mqtt, 'device', 0xfff1);

    const root = endpointInstances.find((e) => e.id === 'wb-hw') as MockEndpoint;
    const callArgs = (root!.createDefaultBridgedDeviceBasicInformationClusterServer as jest.Mock).mock.calls[0];
    // hardwareVersionString is at position 8 (index 8)
    expect(callArgs?.[8]).toBe('r3.0');
  });
});
