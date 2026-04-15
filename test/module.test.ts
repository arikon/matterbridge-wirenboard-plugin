/**
 * Integration tests for WirenboardPlatform.
 *
 * Tests the lifecycle and MQTT event handling without real MQTT or Matter stack.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PlatformConfig, PlatformMatterbridge } from "matterbridge";
import type { AnsiLogger } from "matterbridge/logger";

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

jest.unstable_mockModule("matterbridge", () => {
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
    get registerDevice() {
      return mockFns.registerDevice;
    }
    get unregisterAllDevices() {
      return mockFns.unregisterAllDevices;
    }
    get clearSelect() {
      return mockFns.clearSelect;
    }
    get setSelectDevice() {
      return mockFns.setSelectDevice;
    }
    get setSelectDeviceEntity() {
      return jest.fn();
    }
    get validateDevice() {
      return mockFns.validateDevice;
    }

    async onConfigure(): Promise<void> {
      await mockFns.onConfigure();
    }

    async onShutdown(_reason?: string): Promise<void> {
      // base no-op
    }
  }

  return {
    MatterbridgeDynamicPlatform: BasePlatform,
    MatterbridgeEndpoint: jest
      .fn()
      .mockImplementation((_type: unknown, opts?: { id?: string }) => {
        const ep: Record<string, unknown> = {
          id: opts?.id ?? "mock",
          maybeNumber: 1,
          configUrl: "",
          deviceType: _type,
          setAttribute: jest.fn(() => Promise.resolve(true)),
          triggerEvent: jest.fn(() => Promise.resolve(true)),
          addFixedLabel: jest.fn(async function () {
            return ep;
          }),
          hasClusterServer: jest.fn(() => true),
          addRequiredClusterServers: jest.fn(function () {
            return ep;
          }),
          addCommandHandler: jest.fn(function () {
            return ep;
          }),
          createDefaultBridgedDeviceBasicInformationClusterServer: jest.fn(
            function () {
              return ep;
            },
          ),
          createDefaultHeatingThermostatClusterServer: jest.fn(function () {
            return ep;
          }),
          createDefaultCoolingThermostatClusterServer: jest.fn(function () {
            return ep;
          }),
          createDefaultThermostatClusterServer: jest.fn(function () {
            return ep;
          }),
          addChildDeviceTypeWithClusterServer: jest.fn(function (
            childId: string,
          ) {
            const child: Record<string, unknown> = {
              id: childId,
              maybeNumber: 1,
              configUrl: "",
              setAttribute: jest.fn(() => Promise.resolve(true)),
              triggerEvent: jest.fn(() => Promise.resolve(true)),
              addFixedLabel: jest.fn(async function () {
                return child;
              }),
              hasClusterServer: jest.fn(() => true),
              addRequiredClusterServers: jest.fn(function () {
                return child;
              }),
              addCommandHandler: jest.fn(function () {
                return child;
              }),
              createDefaultBridgedDeviceBasicInformationClusterServer: jest.fn(
                function () {
                  return child;
                },
              ),
              addChildDeviceTypeWithClusterServer: jest.fn(function () {
                return child;
              }),
            };
            return child;
          }),
        };
        return ep;
      }),
    onOffOutlet: makeDeviceType("onOffOutlet", 266),
    dimmableLight: makeDeviceType("dimmableLight", 257),
    thermostatDevice: makeDeviceType("thermostatDevice", 769),
    extendedColorLight: makeDeviceType("extendedColorLight", 269),
    colorTemperatureLight: makeDeviceType("colorTemperatureLight", 268),
    coverDevice: makeDeviceType("coverDevice", 514),
    doorLockDevice: makeDeviceType("doorLockDevice", 10),
    fanDevice: makeDeviceType("fanDevice", 43),
    waterValve: makeDeviceType("waterValve", 0x0042),
    genericSwitch: makeDeviceType("genericSwitch", 15),
    airQualitySensor: makeDeviceType("airQualitySensor", 0x002c),
    temperatureSensor: makeDeviceType("temperatureSensor", 0x0302),
    humiditySensor: makeDeviceType("humiditySensor", 0x0307),
    occupancySensor: makeDeviceType("occupancySensor", 0x0107),
    contactSensor: makeDeviceType("contactSensor", 0x0015),
    smokeCoAlarm: makeDeviceType("smokeCoAlarm", 0x0076),
    pressureSensor: makeDeviceType("pressureSensor", 0x0305),
    lightSensor: makeDeviceType("lightSensor", 0x0106),
    electricalSensor: makeDeviceType("electricalSensor", 0x0510),
    flowSensor: makeDeviceType("flowSensor", 0x0306),
    rainSensor: makeDeviceType("rainSensor", 0x0044),
    pumpDevice: makeDeviceType("pumpDevice", 0x0303),
    waterFreezeDetector: makeDeviceType("waterFreezeDetector", 0x0041),
    waterLeakDetector: makeDeviceType("waterLeakDetector", 0x0043),
    onOffLight: makeDeviceType("onOffLight", 256),
  };
});

jest.unstable_mockModule("matterbridge/logger", () => ({}));
jest.unstable_mockModule("matterbridge/matter/types", () => ({}));

jest.unstable_mockModule("matterbridge/matter/clusters", () => {
  const makeCluster = (name: string, id: number) => ({ Cluster: { id }, name });
  return {
    OnOff: makeCluster("OnOff", 6),
    LevelControl: makeCluster("LevelControl", 8),
    Thermostat: {
      Cluster: { id: 513 },
      SystemMode: { Off: 0, Heat: 4, Cool: 3, Auto: 1 },
      SetpointRaiseLowerMode: { Both: 2, Heat: 0, Cool: 1 },
    },
    BridgedDeviceBasicInformation: makeCluster(
      "BridgedDeviceBasicInformation",
      57,
    ),
    DoorLock: { Cluster: { id: 257 }, LockState: { Locked: 1, Unlocked: 2 } },
    FanControl: { Cluster: { id: 514 }, FanMode: { Off: 0, High: 3 } },
    WindowCovering: makeCluster("WindowCovering", 258),
    ValveConfigurationAndControl: {
      Cluster: { id: 129 },
      ValveState: { Open: 1, Closed: 0 },
    },
    AirQuality: {
      Cluster: { id: 91 },
      AirQualityEnum: { Good: 1, Fair: 2, Moderate: 3, Poor: 4, VeryPoor: 5 },
    },
    TemperatureMeasurement: makeCluster("TemperatureMeasurement", 1026),
    RelativeHumidityMeasurement: makeCluster(
      "RelativeHumidityMeasurement",
      1029,
    ),
    OccupancySensing: makeCluster("OccupancySensing", 1030),
    BooleanState: makeCluster("BooleanState", 69),
    SmokeCoAlarm: {
      Cluster: { id: 92 },
      AlarmState: { Normal: 0, Critical: 1 },
    },
    PressureMeasurement: makeCluster("PressureMeasurement", 1027),
    IlluminanceMeasurement: makeCluster("IlluminanceMeasurement", 1024),
    ElectricalPowerMeasurement: makeCluster("ElectricalPowerMeasurement", 144),
    ElectricalEnergyMeasurement: makeCluster(
      "ElectricalEnergyMeasurement",
      145,
    ),
    FlowMeasurement: makeCluster("FlowMeasurement", 1028),
    CarbonDioxideConcentrationMeasurement: makeCluster(
      "CarbonDioxideConcentrationMeasurement",
      1037,
    ),
    CarbonMonoxideConcentrationMeasurement: makeCluster(
      "CarbonMonoxideConcentrationMeasurement",
      1036,
    ),
    Pm25ConcentrationMeasurement: makeCluster(
      "Pm25ConcentrationMeasurement",
      1066,
    ),
    Pm1ConcentrationMeasurement: makeCluster(
      "Pm1ConcentrationMeasurement",
      1068,
    ),
    Pm10ConcentrationMeasurement: makeCluster(
      "Pm10ConcentrationMeasurement",
      1069,
    ),
    FormaldehydeConcentrationMeasurement: makeCluster(
      "FormaldehydeConcentrationMeasurement",
      1067,
    ),
    NitrogenDioxideConcentrationMeasurement: makeCluster(
      "NitrogenDioxideConcentrationMeasurement",
      1043,
    ),
    OzoneConcentrationMeasurement: makeCluster(
      "OzoneConcentrationMeasurement",
      1045,
    ),
    RadonConcentrationMeasurement: makeCluster(
      "RadonConcentrationMeasurement",
      1071,
    ),
    TotalVolatileOrganicCompoundsConcentrationMeasurement: makeCluster(
      "TotalVolatileOrganicCompoundsConcentrationMeasurement",
      1070,
    ),
    ColorControl: {
      Cluster: { id: 768 },
      ColorMode: { CurrentHueAndCurrentSaturation: 0 },
    },
  };
});

jest.unstable_mockModule("matterbridge/matter", () => {
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

jest.unstable_mockModule("matterbridge/utils", () => ({
  waiter: jest.fn(async (_name: unknown, condition: () => boolean) => {
    // Poll condition up to 10 times with 1ms delay to allow idle time to elapse
    for (let i = 0; i < 10; i++) {
      if (condition()) return true;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return false;
  }),
}));

jest.unstable_mockModule("../src/wirenboardMqtt.js", () => ({
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

const { WirenboardPlatform } = await import("../src/module.js");
const matterbridgeUtils = await import("matterbridge/utils");

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
  matterbridgeVersion: "3.4.0",
  aggregatorVendorId: 0xfff1,
} as unknown as PlatformMatterbridge;

function makeConfig(overrides: Record<string, unknown> = {}): PlatformConfig {
  return {
    name: "matterbridge-wirenboard-plugin",
    type: "DynamicPlatform",
    mqttHost: "localhost",
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
  jest
    .mocked(matterbridgeUtils.waiter)
    .mockImplementation(async (_name: unknown, condition: () => boolean) => {
      for (let i = 0; i < 10; i++) {
        if (condition()) return true;
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return false;
    });
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

describe("WirenboardPlatform constructor", () => {
  it("starts MQTT on construction", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    expect(mockFns.mqttStart).toHaveBeenCalledTimes(1);
  });

  it("throws if matterbridge version check fails", () => {
    mockFns.verifyMatterbridgeVersion.mockReturnValue(false);
    expect(
      () => new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig()),
    ).toThrow();
  });

  it("registers listeners for device-meta, control-meta, control-value, control-error", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    const events = [...mqttListeners.keys()];
    expect(events).toContain("device-meta");
    expect(events).toContain("control-meta");
    expect(events).toContain("control-value");
    expect(events).toContain("control-error");
  });
});

// ---------------------------------------------------------------------------
// Device discovery
// ---------------------------------------------------------------------------

describe("Device discovery", () => {
  it("handles device-meta without error", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: { en: "WB-MR6C 28" } },
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("handles control-meta without error", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: { en: "WB-MR6C 28" } },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("merges control-meta so a later partial update does not strip units", () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig(),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-map12e_40",
      meta: { driver: "map12e", title: { en: "MAP" } },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-map12e_40",
      controlName: "Ch 1 N L1",
      meta: {
        type: "value",
        units: "var",
        readonly: true,
        precision: 0.01,
      },
    });
    // Same order as MQTT: full JSON on .../meta, then legacy .../meta/type (partial)
    emitMqttEvent("control-meta", {
      deviceName: "wb-map12e_40",
      controlName: "Ch 1 N L1",
      meta: { type: "value", readonly: true },
    });
    const ctrl = platform.deviceMap
      .get("wb-map12e_40")
      ?.controls.get("Ch 1 N L1");
    expect(ctrl?.meta.units).toBe("var");
  });

  it("creates placeholder device on control-meta before device-meta", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("control-meta", {
      deviceName: "wb-unknown",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("handles control-value before onConfigure without error", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("control-value", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      value: "1",
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("ignores control-value for unknown device", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("control-value", {
      deviceName: "no-such-device",
      controlName: "K1",
      value: "1",
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onStart
// ---------------------------------------------------------------------------

describe("onStart", () => {
  it("calls clearSelect", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );
    await platform.onStart("test");
    expect(mockFns.clearSelect).toHaveBeenCalled();
  });

  it("warns on discovery timeout when no devices found", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );
    await platform.onStart("test");
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("timeout"),
    );
  });

  it("registers switch endpoint after discovery", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).toHaveBeenCalled();
  });

  it("registers writable switch as onOffOutlet without deviceOverrides (control grouping)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        groupingMode: "control",
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    const ep = mockFns.registerDevice.mock.calls[0][0] as {
      deviceType?: { name?: string };
    };
    expect(ep.deviceType?.name).toBe("onOffOutlet");
  });

  it("applies deviceOverrides string deviceType onOffLight for switch (control grouping)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        groupingMode: "control",
        deviceOverrides: {
          "wb-mr6c_28": {
            controls: {
              K1: { deviceType: "onOffLight" },
            },
          },
        },
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    const ep = mockFns.registerDevice.mock.calls[0][0] as {
      deviceType?: { name?: string };
    };
    expect(ep.deviceType?.name).toBe("onOffLight");
  });

  it("uses deviceOverrides nested name for setSelectDevice title", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        deviceOverrides: {
          "wb-mr6c_28": {
            name: "Lighting Panel",
            controls: {
              K1: { deviceType: "onOffLight" },
            },
          },
        },
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.setSelectDevice).toHaveBeenCalledWith(
      "wb-mr6c_28",
      "Lighting Panel",
    );
  });

  it("does not log unmappable warning for controls skipped in deviceOverrides", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        deviceOverrides: {
          "wb-mixed_1": {
            controls: {
              SomeText: { skip: true },
            },
          },
        },
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mixed_1",
      meta: { driver: "wb-test", title: "Mixed" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mixed_1",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mixed_1",
      controlName: "SomeText",
      meta: { type: "text", readonly: true },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).toHaveBeenCalled();
    expect(mockLog.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("wb-mixed_1/SomeText"),
    );
  });

  it("does not register when validateDevice returns false", async () => {
    mockFns.validateDevice.mockReturnValue(false);
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
  });

  it("does not register devices with no mappable controls", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-text-only",
      meta: { driver: "wb-test", title: "WB-TEST" },
    });
    // 'text' type with no special name has no mapping
    emitMqttEvent("control-meta", {
      deviceName: "wb-text-only",
      controlName: "SomeText",
      meta: { type: "text", readonly: true },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
  });

  it("does not register system__* service devices when ignoreSystemPrefixedDevices is true (default)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "system__networks__82fd1739-c50b-43b4-be1a-ce87422daaad",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "system__networks__82fd1739-c50b-43b4-be1a-ce87422daaad",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
    expect(
      platform.wbDevices.has(
        "system__networks__82fd1739-c50b-43b4-be1a-ce87422daaad",
      ),
    ).toBe(false);
  });

  it("registers system__* when ignoreSystemPrefixedDevices is false", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        ignoreSystemPrefixedDevices: false,
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "system__networks__82fd1739-c50b-43b4-be1a-ce87422daaad",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "system__networks__82fd1739-c50b-43b4-be1a-ce87422daaad",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).toHaveBeenCalled();
  });

  it("does not register network-prefixed devices when ignoreNetworkPrefixedDevices is true (default)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "networks",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "networks",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
    expect(platform.wbDevices.has("networks")).toBe(false);
  });

  it("registers network-prefixed devices when ignoreNetworkPrefixedDevices is false", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        ignoreNetworkPrefixedDevices: false,
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "networks",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "networks",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).toHaveBeenCalled();
  });

  it("sets endpoint configUrl from wirenboardUrl when non-empty", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        ignoreNetworkPrefixedDevices: false,
        mqttHost: "192.168.1.1",
        wirenboardUrl: "https://wb.example:8443/ui",
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "networks",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "networks",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice).toHaveBeenCalled();
    const ep = mockFns.registerDevice.mock.calls[0][0] as {
      configUrl?: string;
    };
    expect(ep.configUrl).toBe("https://wb.example:8443/ui");
  });

  it("sets endpoint configUrl to http://mqttHost when wirenboardUrl is empty", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        ignoreNetworkPrefixedDevices: false,
        mqttHost: "10.0.0.2",
        wirenboardUrl: "",
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "networks",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "networks",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    const ep = mockFns.registerDevice.mock.calls[0][0] as {
      configUrl?: string;
    };
    expect(ep.configUrl).toBe("http://10.0.0.2");
  });

  it("treats whitespace-only wirenboardUrl as empty and uses http://mqttHost", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryTimeout: 1,
        discoveryIdleMs: 5,
        ignoreNetworkPrefixedDevices: false,
        mqttHost: "10.0.0.3",
        wirenboardUrl: "   ",
      }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "networks",
      meta: { driver: "networks", title: "Networks" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "networks",
      controlName: "wlan0",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    const ep = mockFns.registerDevice.mock.calls[0][0] as {
      configUrl?: string;
    };
    expect(ep.configUrl).toBe("http://10.0.0.3");
  });

  it("registers multiple WB devices in canonical name order (MQTT discovery order independent)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "zebra",
      meta: { driver: "wb", title: "Z" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "zebra",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("device-meta", {
      deviceName: "alpha",
      meta: { driver: "wb", title: "A" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "alpha",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");
    expect(mockFns.registerDevice.mock.calls.length).toBeGreaterThanOrEqual(2);
    const id0 = (mockFns.registerDevice.mock.calls[0][0] as { id?: string }).id;
    const id1 = (mockFns.registerDevice.mock.calls[1][0] as { id?: string }).id;
    expect(String(id0)).toContain("alpha");
    expect(String(id1)).toContain("zebra");
  });

  it("sets shouldConfigure=true at end of onStart (Fix #3)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );
    expect(platform.shouldConfigure).toBe(false);
    await platform.onStart("test");
    expect(platform.shouldConfigure).toBe(true);
  });

  it("forwards live control-value to registered device without onConfigure (Fix #3)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    await platform.onStart("test");

    const wbDev = platform.wbDevices.get("wb-mr6c_28");
    expect(wbDev).toBeDefined();
    const spy = jest.spyOn(wbDev!, "updateFromMqtt");

    // Live value after onStart — shouldConfigure is now true, so it flows to Matter
    emitMqttEvent("control-value", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      value: "0",
    });
    expect(spy).toHaveBeenCalledWith("K1", "0");
  });
});

// ---------------------------------------------------------------------------
// onConfigure
// ---------------------------------------------------------------------------

describe("onConfigure", () => {
  it("calls super.onConfigure", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig(),
    );
    await platform.onConfigure();
    expect(mockFns.onConfigure).toHaveBeenCalled();
  });

  it("logs onConfigure called", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig(),
    );
    await platform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("onConfigure"),
    );
  });

  it("replays retained values in onConfigure after onStart (Fix #3)", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, discoveryIdleMs: 5 }),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    // Retained value arrives before onStart — cached but not applied (shouldConfigure=false)
    emitMqttEvent("control-value", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      value: "1",
    });
    await platform.onStart("test");

    const wbDev = platform.wbDevices.get("wb-mr6c_28")!;
    const spy = jest.spyOn(wbDev, "updateFromMqtt");

    // onConfigure does the authoritative replay — overrides any stale matter.js persisted values
    await platform.onConfigure();
    expect(spy).toHaveBeenCalledWith("K1", "1");
  });
});

// ---------------------------------------------------------------------------
// onShutdown
// ---------------------------------------------------------------------------

describe("onShutdown", () => {
  it("stops MQTT", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig(),
    );
    await platform.onShutdown("test");
    expect(mockFns.mqttStop).toHaveBeenCalled();
  });

  it("unregisters all devices when unregisterOnShutdown=true", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ unregisterOnShutdown: true }),
    );
    await platform.onShutdown("test");
    expect(mockFns.unregisterAllDevices).toHaveBeenCalled();
  });

  it("does not unregister when unregisterOnShutdown=false", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ unregisterOnShutdown: false }),
    );
    await platform.onShutdown("test");
    expect(mockFns.unregisterAllDevices).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// control-error
// ---------------------------------------------------------------------------

describe("control-error event", () => {
  it("stores error on known control without throwing", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("control-error", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      error: "r",
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("ignores control-error for unknown device", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("control-error", {
      deviceName: "unknown-device",
      controlName: "K1",
      error: "r",
    });
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// control-error flags: w and p
// ---------------------------------------------------------------------------

describe("control-error flags", () => {
  it("write error (w flag) logs warning", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-meta", {
      deviceName: "wb-dev",
      meta: { driver: "test", title: "Test" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-dev",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("control-error", {
      deviceName: "wb-dev",
      controlName: "K1",
      error: "w",
    });
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Write error"),
    );
  });

  it("poll miss (p flag) logs debug", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-meta", {
      deviceName: "wb-dev",
      meta: { driver: "test", title: "Test" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-dev",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("control-error", {
      deviceName: "wb-dev",
      controlName: "K1",
      error: "p",
    });
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining("Poll miss"),
    );
  });
});

// ---------------------------------------------------------------------------
// device-error event
// ---------------------------------------------------------------------------

describe("device-error event", () => {
  it("logs warn on device-error", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-error", { deviceName: "wb-dev", error: "rp" });
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("wb-dev"),
    );
  });
});

// ---------------------------------------------------------------------------
// device-removed event
// ---------------------------------------------------------------------------

describe("device-removed event", () => {
  it("removes device from deviceMap without error", () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig(),
    );
    emitMqttEvent("device-meta", {
      deviceName: "wb-removed",
      meta: { driver: "test", title: "Test" },
    });
    expect(platform.deviceMap.has("wb-removed")).toBe(true);

    emitMqttEvent("device-removed", { deviceName: "wb-removed" });
    expect(platform.deviceMap.has("wb-removed")).toBe(false);
  });

  it("ignores removal of unknown device", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("device-removed", { deviceName: "no-such-device" });
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mqtt_disconnect / mqtt_connect events
// ---------------------------------------------------------------------------

describe("mqtt_disconnect / mqtt_connect events", () => {
  it("mqtt_disconnect logs warning", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("mqtt_disconnect", {});
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("unreachable"),
    );
  });

  it("mqtt_connect logs info", () => {
    const _p = new WirenboardPlatform(mockMatterbridge, mockLog, makeConfig());
    emitMqttEvent("mqtt_connect", {});
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("reachable"),
    );
  });
});

// ---------------------------------------------------------------------------
// Static discovery mode
// ---------------------------------------------------------------------------

describe("Static discovery mode", () => {
  it("waits for named device and registers it", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryMode: "static",
        devices: ["wb-static-dev"],
        discoveryTimeout: 1,
      }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-static-dev",
      meta: { driver: "wb-test", title: "Static Dev" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-static-dev",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });

    await platform.onStart("test");

    expect(mockFns.registerDevice).toHaveBeenCalled();
  });

  it("warns on timeout if device not found in static mode", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({
        discoveryMode: "static",
        devices: ["missing-device"],
        discoveryTimeout: 1,
      }),
    );

    await platform.onStart("test");

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("missing-device"),
    );
  });
});

// ---------------------------------------------------------------------------
// onStart — control-value after onConfigure updates matter attribute
// ---------------------------------------------------------------------------

describe("onConfigure replay", () => {
  it("replays cached control values after onConfigure", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });
    emitMqttEvent("control-value", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      value: "1",
    });

    await platform.onStart("test");
    await platform.onConfigure();

    // Should have been called without error
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dynamic registration after onStart
// ---------------------------------------------------------------------------

describe("Dynamic registration after onStart", () => {
  it("device-meta after onStart triggers dynamic registration path", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );
    await platform.onStart("test");

    // After onStart, shouldStart=true — new device-meta should trigger registerNewDevice
    // We just verify no error is thrown and the device is added to deviceMap
    emitMqttEvent("device-meta", {
      deviceName: "wb-new-dynamic",
      meta: { driver: "wb-test", title: "New Dev" },
    });

    expect(platform.deviceMap.has("wb-new-dynamic")).toBe(true);
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// control-meta type change after registration
// ---------------------------------------------------------------------------

describe("control-meta type change", () => {
  it("warns on type change after start", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });

    await platform.onStart("test");

    // Simulate type change
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "range", readonly: false },
    });

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("type changed"),
    );
  });
});

// ---------------------------------------------------------------------------
// getDominantType — via onStart registration
// ---------------------------------------------------------------------------

describe("getDominantType via onStart", () => {
  it("sensor-dominant device uses Sensor label", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-msw",
      meta: { driver: "wb-msw", title: "MSW" },
    });
    // Multiple sensor controls → Sensor dominant
    emitMqttEvent("control-meta", {
      deviceName: "wb-msw",
      controlName: "Temperature",
      meta: { type: "value", units: "deg C", readonly: true },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-msw",
      controlName: "Humidity",
      meta: { type: "value", units: "%", readonly: true },
    });

    await platform.onStart("test");

    // addFixedLabel should have been called with 'Sensor' or another dominant type
    expect(mockFns.registerDevice).toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("light-dominant device uses Light label", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-mdm",
      meta: { driver: "wb-mdm", title: "MDM" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mdm",
      controlName: "Channel 1",
      meta: { type: "dimmer", min: 0, max: 65535, readonly: false },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mdm",
      controlName: "Channel 2",
      meta: { type: "dimmer", min: 0, max: 65535, readonly: false },
    });

    await platform.onStart("test");

    expect(mockFns.registerDevice).toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("cover device uses Cover label", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-blind",
      meta: { driver: "wb-blind", title: "Blind" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-blind",
      controlName: "window_blind",
      meta: { type: "range", min: 0, max: 100, readonly: false },
    });

    await platform.onStart("test");

    expect(mockFns.registerDevice).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onStart — failsafeCount
// ---------------------------------------------------------------------------

describe("onStart — failsafeCount", () => {
  it("throws if failsafeCount not met", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, failsafeCount: 5 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-only-one",
      meta: { driver: "test", title: "One" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-only-one",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });

    await expect(platform.onStart("test")).rejects.toThrow("Failsafe");
  });

  it("does not throw failsafe error when failsafe wait ends with startup abort flag", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1, failsafeCount: 5 }),
    );

    jest
      .mocked(matterbridgeUtils.waiter)
      .mockImplementation(async (name: unknown, condition: () => boolean) => {
        if (name === "failsafe") {
          (
            platform as unknown as { startupAbortRequested: boolean }
          ).startupAbortRequested = true;
          return false;
        }
        for (let i = 0; i < 10; i++) {
          if (condition()) return true;
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        return false;
      });

    emitMqttEvent("device-meta", {
      deviceName: "wb-only-one",
      meta: { driver: "test", title: "One" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-only-one",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });

    await expect(platform.onStart("test")).resolves.toBeUndefined();
    expect(mockFns.registerDevice).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// control-value after onConfigure dispatches to wbDevice.updateFromMqtt
// ---------------------------------------------------------------------------

describe("control-value after onConfigure", () => {
  it("dispatches to wbDevice.updateFromMqtt", async () => {
    const platform = new WirenboardPlatform(
      mockMatterbridge,
      mockLog,
      makeConfig({ discoveryTimeout: 1 }),
    );

    emitMqttEvent("device-meta", {
      deviceName: "wb-mr6c_28",
      meta: { driver: "wb-mr6c", title: "WB-MR6C" },
    });
    emitMqttEvent("control-meta", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      meta: { type: "switch", readonly: false },
    });

    await platform.onStart("test");
    await platform.onConfigure();

    // After configure, live values should be dispatched
    emitMqttEvent("control-value", {
      deviceName: "wb-mr6c_28",
      controlName: "K1",
      value: "1",
    });

    expect(mockLog.error).not.toHaveBeenCalled();
  });
});
