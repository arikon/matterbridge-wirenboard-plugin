# Matterbridge Wirenboard Plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-wirenboard-plugin.svg)](https://www.npmjs.com/package/matterbridge-wirenboard-plugin)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

Matterbridge plugin that bridges [Wirenboard](https://wirenboard.com) devices to the Matter ecosystem. Connects to the Wirenboard MQTT broker, discovers devices automatically, and exposes them to Apple Home, Google Home, Amazon Alexa, and SmartThings — all local, no cloud.

Wirenboard devices are discovered via standard WB MQTT conventions (`/devices/+/meta`, `/devices/+/controls/+/meta`). Each control is mapped to the appropriate Matter device type based on its type and units. State changes sync bidirectionally: MQTT values update Matter attributes, and Matter commands publish to MQTT `/on` topics.

## Features

- Automatic device discovery via MQTT meta-topics (retained messages)
- Bidirectional state sync: MQTT → Matter and Matter → MQTT
- Supports all standard WB control types (see [mapping table](#supported-wirenboard-control-types))
- Two grouping modes: per-device (fewer Matter nodes) or per-control (granular)
- White list / black list filtering
- Static discovery mode for explicit device lists
- TLS support: `mqtts`, `wss`, mutual TLS, self-signed certificates
- Device overrides: rename, retype, or skip individual controls
- Composite thermostat detection (setpoint + temperature + mode)
- Failsafe: refuse startup if fewer than N devices are found (prevents config loss on network issues)
- Hardware metadata extraction: serial number, firmware version, hardware revision (peripheral WB devices)
- **Controller device `system`:** readonly `text` controls (e.g. Short SN, Batch No, manufacturing date) are mapped into Matter **Bridged Device Basic Information** on the Matter node that represents the controller — **when `groupingMode` is `device`**. With **`groupingMode: "control"`**, the plugin does not attach that extended factory snapshot to a single controller node (each control would be its own node); use **`device`** grouping for the controller if you want serial/part number and related fields visible in the app.

## Prerequisites

| Requirement                                            | Version                                         |
| ------------------------------------------------------ | ----------------------------------------------- |
| [Matterbridge](https://github.com/Luligu/matterbridge) | >= 3.7.0                                        |
| Node.js                                                | 20.19+ / 22.13+ / 24+                           |
| MQTT broker                                            | Wirenboard controller or any Mosquitto instance |

## Installation

### Via Matterbridge frontend (recommended)

Open the Matterbridge web UI, find `matterbridge-wirenboard-plugin`, and click Install.

### Via npm

```bash
sudo npm install -g matterbridge-wirenboard-plugin --omit=dev
matterbridge -add matterbridge-wirenboard-plugin
```

### Development (npm link)

```bash
git clone https://github.com/your-org/matterbridge-wirenboard-plugin
cd matterbridge-wirenboard-plugin
npm install
npm run dev:link
npm run build
matterbridge -add .
```

## Configuration

Configuration is stored in `~/.matterbridge/matterbridge-wirenboard-plugin.config.json`.

### All options

| Field                  | Type     | Default       | Description                                                                                                                                 |
| ---------------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mqttHost`             | string   | `"localhost"` | MQTT broker hostname or IP                                                                                                                  |
| `mqttPort`             | number   | `1883`        | MQTT broker port                                                                                                                            |
| `mqttUsername`         | string   | `""`          | MQTT username (leave empty if not required)                                                                                                 |
| `mqttPassword`         | string   | `""`          | MQTT password                                                                                                                               |
| `mqttProtocol`         | string   | `"mqtt"`      | Transport: `mqtt`, `mqtts`, `ws`, `wss`                                                                                                     |
| `mqttCaPath`           | string   | `""`          | Path to CA certificate (PEM) for TLS                                                                                                        |
| `mqttCertPath`         | string   | `""`          | Path to client certificate (PEM) for mutual TLS                                                                                             |
| `mqttKeyPath`          | string   | `""`          | Path to client private key (PEM) for mutual TLS                                                                                             |
| `discoveryMode`        | string   | `"auto"`      | `auto` — subscribe and discover; `static` — use `devices` list only                                                                         |
| `discoveryTimeout`     | number   | `30`          | Max seconds to wait for discovery (auto mode)                                                                                               |
| `discoveryIdleMs`      | number   | `1000`        | Idle time (ms) on meta-topics before discovery is considered complete                                                                       |
| `groupingMode`         | string   | `"device"`    | `device` — one Matter node per WB device; `control` — one Matter node per control                                                           |
| `includeHidden`        | boolean  | `false`       | Include controls marked hidden in WB meta                                                                                                   |
| `ignoreSystemControls` | boolean  | `true`        | When `true`, unmappable controls on `system__*` devices log at **debug** only (dedicated message). Set `false` for **warn** on those skips. |
| `devices`              | string[] | `[]`          | Device IDs to expose in `static` discovery mode                                                                                             |
| `whiteList`            | string[] | `[]`          | Only expose listed devices (empty = all)                                                                                                    |
| `blackList`            | string[] | `[]`          | Never expose listed devices                                                                                                                 |
| `deviceOverrides`      | object   | `{}`          | Per-device overrides (see [Advanced](#advanced))                                                                                            |
| `failsafeCount`        | number   | `0`           | Min devices required on startup (0 = disabled)                                                                                              |
| `debug`                | boolean  | `false`       | Enable verbose debug logging                                                                                                                |

### Example config

```json
{
  "name": "matterbridge-wirenboard-plugin",
  "type": "DynamicPlatform",
  "mqttHost": "192.168.1.100",
  "mqttPort": 1883,
  "mqttUsername": "",
  "mqttPassword": "",
  "mqttProtocol": "mqtt",
  "discoveryMode": "auto",
  "discoveryTimeout": 30,
  "discoveryIdleMs": 1000,
  "groupingMode": "device",
  "includeHidden": false,
  "ignoreSystemControls": true,
  "whiteList": [],
  "blackList": ["wb-hwmon_0"],
  "deviceOverrides": {},
  "failsafeCount": 5,
  "debug": false
}
```

## Supported Wirenboard Control Types

### Switches & Actuators

| WB `meta.type`            | Condition                                            | Matter Device Type   | Matter Cluster                          |
| ------------------------- | ---------------------------------------------------- | -------------------- | --------------------------------------- |
| `switch`                  | writable                                             | `onOffOutlet`        | `OnOff`                                 |
| `switch`                  | readonly                                             | `contactSensor`      | `BooleanState`                          |
| `switch`                  | name contains `valve`/`кран`                         | `waterValve`         | `ValveConfigurationAndControl`          |
| `switch`                  | name contains `lock`/`замок`                         | `doorLockDevice`     | `DoorLock`                              |
| `switch`                  | name contains `fan`/`вент`                           | `fanDevice`          | `FanControl`                            |
| `switch`                  | name contains `pump`/`насос`                         | `pumpDevice`         | `OnOff` + `PumpConfigurationAndControl` |
| `switch`                  | name contains `motion`/`движ`/`occupancy` (readonly) | `occupancySensor`    | `OccupancySensing`                      |
| `range`                   | —                                                    | `dimmableLight`      | `OnOff` + `LevelControl`                |
| `range`                   | name contains `blind`/`curtain`/`штор`/`жалюзи`      | `coverDevice`        | `WindowCovering`                        |
| `range`                   | name contains `fan`/`вент` + speed                   | `fanDevice`          | `FanControl`                            |
| `rgb`                     | —                                                    | `extendedColorLight` | `OnOff` + `ColorControl`                |
| `pushbutton`, `wo-switch` | —                                                    | `genericSwitch`      | `Switch` (MomentarySwitch)              |

### Sensors

| WB `meta.type` | `meta.units`                      | Matter Device Type    | Matter Cluster                                          |
| -------------- | --------------------------------- | --------------------- | ------------------------------------------------------- |
| `value`        | `deg C`                           | `temperatureSensor`   | `TemperatureMeasurement`                                |
| `value`        | `%`, `RH`                         | `humiditySensor`      | `RelativeHumidityMeasurement`                           |
| `value`        | `Pa` / `mbar` / `bar`             | `pressureSensor`      | `PressureMeasurement`                                   |
| `value`        | `lx`                              | `lightSensor`         | `IlluminanceMeasurement`                                |
| `value`        | `W` / `V` / `A` / `mA` / `mV`     | `electricalSensor`    | `ElectricalPowerMeasurement`                            |
| `value`        | `kWh`                             | `electricalSensor`    | `ElectricalEnergyMeasurement`                           |
| `value`        | `m³/h`                            | `flowSensor`          | `FlowMeasurement`                                       |
| `value`        | `ppm` (CO2)                       | `airQualitySensor`    | `AirQuality` + `CarbonDioxideConcentrationMeasurement`  |
| `value`        | `ppm` (CO, by name)               | `airQualitySensor`    | `AirQuality` + `CarbonMonoxideConcentrationMeasurement` |
| `value`        | `ppb` (NO2, by name)              | `airQualitySensor`    | `NitrogenDioxideConcentrationMeasurement`               |
| `value`        | `µg/m³` (PM1/PM2.5/PM10, by name) | `airQualitySensor`    | `Pm1/Pm25/Pm10ConcentrationMeasurement`                 |
| `value`        | `ppb`/`ppm` (TVOC, by name)       | `airQualitySensor`    | `TotalVolatileOrganicCompoundsConcentrationMeasurement` |
| `alarm`        | name contains `smoke`/`дым`       | `smokeCoAlarm`        | `SmokeCoAlarm`                                          |
| `alarm`        | name contains `leak`/`утечка`     | `waterLeakDetector`   | `BooleanState`                                          |
| `alarm`        | name contains `freeze`/`замерз`   | `waterFreezeDetector` | `BooleanState`                                          |
| `alarm`        | name contains `rain`/`дождь`      | `rainSensor`          | `BooleanState`                                          |
| `alarm`        | (fallback)                        | `contactSensor`       | `BooleanState`                                          |

Deprecated WB types (`temperature`, `rel_humidity`, `voltage`, `power`, `current`, etc.) are automatically normalized to `value` + appropriate units.

Types without a Matter equivalent (`text`, `enum` without override, `sound_level`, `wind_speed`, `rainfall`) are skipped with a warning in the log.

## Controller Compatibility

| Feature                     | Apple Home | Google Home | Amazon Alexa | SmartThings |
| --------------------------- | ---------- | ----------- | ------------ | ----------- |
| On/Off outlets & lights     | Yes        | Yes         | Yes          | Yes         |
| Dimmers (LevelControl)      | Yes        | Yes         | Yes          | Yes         |
| Color lights (RGB)          | Yes        | Yes         | Yes          | Yes         |
| Temperature sensors         | Yes        | Yes         | Yes          | Yes         |
| Humidity sensors            | Yes        | Yes         | Yes          | Yes         |
| Pressure sensors            | Partial¹   | Yes         | No           | Yes         |
| Air quality sensors         | Yes        | Yes         | Yes          | Yes         |
| Electrical sensors          | No         | No          | No           | No          |
| Flow sensors                | No         | Yes         | No           | Yes         |
| Occupancy sensors           | Yes        | Yes         | Yes          | Yes         |
| Contact sensors             | Yes        | Yes         | Yes          | Yes         |
| Smoke/CO alarms             | Yes²       | Partial³    | Yes          | Yes         |
| Water leak detectors        | Yes²       | No          | No           | Yes         |
| Water valve                 | Partial⁴   | No          | No           | Yes         |
| Window coverings            | Yes        | Yes         | Yes          | Yes         |
| Door locks                  | Yes        | Yes         | Yes          | Yes         |
| Fan control                 | Yes        | Yes         | Yes          | Yes         |
| Thermostats                 | Yes        | Yes         | Yes          | Yes         |
| Pump                        | No         | Yes         | No           | Yes         |
| Generic switch (pushbutton) | Yes⁵       | Partial     | Yes          | Yes         |
| Max bridged endpoints       | **150**    | ~250        | **50**       | ~50         |

¹ Pressure: Apple Home has no dedicated UI tile but automations work.
² Requires iOS 18.4+.
³ Google Home: full support for Nest Protect; partial for third-party Matter smoke alarms.
⁴ Water valve pairs but has no native Apple Home UI; works via automations.
⁵ Improved in iOS 18.2 (moved to Home View).

**Alexa hard limit: 50 bridged devices.** Use whitelist/blacklist to stay within the limit. Apple Home limit is 150 (149 + bridge). Electrical sensors and rain/freeze detectors are not supported by any major controller.

Sources:

- [Apple Home — Matter accessories](https://support.apple.com/en-us/102135)
- [Apple Home — iOS 18.4 smoke/CO/water leak](https://www.matteralpha.com/manufacturer-news/ios-18-4-expands-matter-support-with-smoke-co-and-water-leak-sensors)
- [Google Home — Supported Matter device types](https://developers.home.google.com/matter/supported-devices)
- [Amazon Alexa — Supported Matter device categories](https://developer.amazon.com/en-US/docs/alexa/smarthome/supported-matter-device-categories.html)
- [Samsung SmartThings — Matter support](https://partners.smartthings.com/matter)
- [Matterbridge — Controller limits and compatibility](https://matterbridge.io/README.html)
- Bridge endpoint limits: [1Home — Alexa (50 hard limit)](https://www.1home.io/docs/en/server/matter-bridge/apps/amazon-alexa), [1Home — Google Home (~250)](https://www.1home.io/docs/en/server/matter-bridge/apps/google-home), [1Home — SmartThings (~50)](https://www.1home.io/docs/en/server/matter-bridge/apps/samsung-smartthings), [Apple Home 150 limit (community)](https://community.hubitat.com/t/apple-homekit-150-device-limit/145073)

## Grouping Modes

### `groupingMode: "device"` (default)

One Matter bridged device per WB device. Each control becomes a child endpoint inside that device.

- Fewer Matter nodes — better for controllers with endpoint limits
- All relays of `wb-mr6c` appear as one device with multiple outlets
- Recommended for most setups
- Required if you want full **Bridged Device Basic Information** (factory metadata) on the Wirenboard **controller** device id `system`

### `groupingMode: "control"`

One Matter bridged device per WB control.

- Full granularity — each control appears separately in the controller app
- Better naming and room assignment in Apple Home / Google Home
- Reaches Matter endpoint limits faster (~250 total)
- Recommended when you have few devices but want per-control visibility
- For WB device **`system`**, extended controller metadata in Matter BI is **not** merged onto one dedicated node (see below); prefer **`device`** grouping for the controller if you rely on that metadata

### Wirenboard controller (`system`) and `groupingMode` (factory metadata in Matter)

The WB MQTT device id **`system`** represents the Wirenboard **controller** (factory info: Short SN, Batch No, firmware strings, etc.). The plugin maps readonly `text` controls from that device into Matter **Bridged Device Basic Information** — but only when it can attach them to **one** Matter bridged device that stands for the whole controller.

- **`groupingMode: "device"`** — there is exactly **one** Matter node per WB device, including `system`. All service controls are **child endpoints** under that node (or the node is root-only if there are no mappable controls). The plugin sets **`systemBiEndpoint`** to that node and writes the extended BI snapshot there. **Use this mode** if you want serial/part number and related fields visible in Apple Home / Google Home for the controller.

- **`groupingMode: "control"`** — each WB control becomes **its own** Matter bridged device. For `system` that means **many** small devices (one per text/control), and there is **no** single “controller” node the plugin currently uses for the **full** extended BI block. Factory metadata is therefore **not** merged into one dedicated controller card in this mode (implementation detail: `systemBiEndpoint` is only set in the `device` aggregation path).

**Practical rule:** need factory/controller info in Matter → **`groupingMode: "device"`** (default). Fine-grained per-control exposure for other WB devices can still be a reason to use `control` elsewhere, but for **`system`** specifically, prefer **`device`**.

## Advanced

### deviceOverrides

Override settings for individual devices or controls:

```json
{
  "deviceOverrides": {
    "wb-mr6c_28": {
      "name": "Lighting Panel",
      "controls": {
        "Relay 1": { "deviceType": "onOffLight" },
        "Relay 2": { "deviceType": "onOffLight" },
        "Temperature": { "skip": true }
      }
    },
    "wb-map12e_42": {
      "controls": {
        "Channel 1 Power": { "skip": true }
      }
    }
  }
}
```

### Thermostat composite detection

If a WB device has controls matching this combination, the plugin creates a `thermostatDevice` instead of separate sensor/range endpoints:

| Required | WB control name contains | WB type          | Maps to                                               |
| -------- | ------------------------ | ---------------- | ----------------------------------------------------- |
| Yes      | `temperature` (readonly) | `value`, `deg C` | `localTemperature`                                    |
| Yes      | `setpoint` or `target`   | `range`, `deg C` | `occupiedHeatingSetpoint` / `occupiedCoolingSetpoint` |
| No       | `mode` or `system_mode`  | `enum`           | `systemMode` (Off/Heat/Cool/Auto)                     |

Heating-only or cooling-only is detected automatically from available controls. Min/max setpoint bounds are taken from `meta.min`/`meta.max` of the setpoint control.

### Static discovery

Use `discoveryMode: "static"` to expose only a fixed list of devices, bypassing MQTT meta-topic subscription:

```json
{
  "discoveryMode": "static",
  "devices": ["wb-mr6c_28", "wb-msw-v3_42", "thermostat-room1"]
}
```

### TLS / mqtts

```json
{
  "mqttProtocol": "mqtts",
  "mqttPort": 8883,
  "mqttCaPath": "/etc/ssl/certs/my-ca.pem",
  "mqttCertPath": "/etc/ssl/certs/client.pem",
  "mqttKeyPath": "/etc/ssl/private/client.key"
}
```

## Development

### Build

```bash
npm install
npm run build        # compile TypeScript → dist/
npm run watch        # watch mode
npm run cleanBuild   # clean + build
```

### Tests

```bash
npm test             # run all tests
npm run test:watch   # watch mode
npm run test:verbose # verbose output
```

### Project structure

```
src/
  module.ts            # WirenboardPlatform — entry point, lifecycle
  wirenboardMqtt.ts    # MQTT client, topic parsing, event emitter
  wirenboardDevice.ts       # Matter endpoint construction, bidirectional state sync
  systemMetadataMapping.ts  # WB `system` controller → Bridged Device Basic Information
  wirenboardTypes.ts        # TypeScript interfaces for WB MQTT conventions
  controlMapping.ts         # WB control type → Matter device type mapping table
test/
  *.test.ts            # unit tests (Jest)
```

### Adding a new control type mapping

Edit `src/controlMapping.ts`. Each entry specifies the WB type/units match, the target Matter device type, cluster setup, and value converters (MQTT string → Matter attribute and reverse).

## Matter 1.5 Roadmap

The following device types are planned for future releases pending Matter controller support:

| WB Device / Use Case        | Planned Matter Type              |
| --------------------------- | -------------------------------- |
| Soil moisture sensors       | `soilMoistureSensor`             |
| Gate / garage door controls | `closureSensor`, `closureDevice` |
| Irrigation zone valves      | `irrigationSystem`               |

## License

Apache-2.0 — see [LICENSE](LICENSE).
