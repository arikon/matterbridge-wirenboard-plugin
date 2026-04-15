# Control mapping

Purpose: Wirenboard MQTT control types and converters mapped to Matter clusters for the matterbridge-wirenboard-plugin.

## Requirements

### Requirement: Switch control mapping

The system SHALL map WB control type `switch` to Matter `onOffOutlet` with `OnOff` cluster. Readonly switch SHALL map to `contactSensor` with `BooleanState` cluster.

#### Scenario: Writable switch to onOffOutlet

- **WHEN** WB control has `meta.type: "switch"` and `meta.readonly: false`
- **THEN** mapping returns Matter device type `onOffOutlet`, cluster `OnOff`, attribute `onOff`, converter `'1'→true, '0'→false`

#### Scenario: Readonly switch to contactSensor

- **WHEN** WB control has `meta.type: "switch"` and `meta.readonly: true`
- **THEN** mapping returns Matter device type `contactSensor`, cluster `BooleanState`, attribute `stateValue`

### Requirement: Name-based switch override

The system SHALL override default switch mapping based on control name substring matching (case-insensitive) with priority: valve/кран→waterValve, lock/замок→doorLockDevice, fan/вентилятор→fanDevice, pump/насос→pumpDevice.

#### Scenario: Valve detected by name

- **WHEN** WB control has `meta.type: "switch"` and name contains "valve"
- **THEN** mapping returns Matter device type `waterValve` with `ValveConfigurationAndControl` cluster

#### Scenario: Lock detected by Russian name

- **WHEN** WB control has `meta.type: "switch"` and name contains "замок"
- **THEN** mapping returns Matter device type `doorLockDevice` with `DoorLock` cluster

### Requirement: Range control mapping

The system SHALL map WB control type `range` to Matter `dimmableLight` with `OnOff` + `LevelControl` clusters. For `LevelControl.currentLevel`, level SHALL be scaled from `[meta.min, meta.max]` to **[1, 254]** (see also ADDED: Matter cluster validation). ColorControl hue/saturation and similar use separate `rangeToLevel` scaling **[0, 254]** where applicable.

#### Scenario: Range to dimmable light at endpoints

- **WHEN** WB control has `meta.type: "range"`, `meta.min: 0`, `meta.max: 255` (non-cover fallback)
- **THEN** converter maps `0→1`, `255→254`, midpoints proportionally in **1..254**

#### Scenario: Range with custom bounds

- **WHEN** WB control has `meta.type: "range"`, `meta.min: 10`, `meta.max: 100`
- **THEN** converter maps endpoints to **1** and **254** and interpolates linearly between them

### Requirement: Name-based range override

The system SHALL override default range mapping: blind/curtain/штор/жалюзи→coverDevice, fan+speed→fanDevice.

#### Scenario: Cover detected by name

- **WHEN** WB control has `meta.type: "range"` and name contains "blind"
- **THEN** mapping returns `coverDevice` with `WindowCovering` cluster, inverted conversion: `liftPercent100ths = Math.round((1 - value/meta.max) * 10000)`

### Requirement: Dimmer control mapping

The system SHALL map WB control type `dimmer` to Matter `dimmableLight` with default max=65535 (wb-mqtt-serial specific). `LevelControl.currentLevel` SHALL use scaling to **[1, 254]**, not **0–254**.

#### Scenario: Dimmer mapping

- **WHEN** WB control has `meta.type: "dimmer"`
- **THEN** mapping returns `dimmableLight`, scales WB `0–65535` → Matter level **1–254**

#### Scenario: Dimmer default max when meta.max absent

- **WHEN** WB control has `meta.type: "dimmer"` and `meta.max` is not specified
- **THEN** system uses `65535` as default max (NOT `255` as for `range`)

#### Scenario: Dimmer reverse conversion (Matter → MQTT)

- **WHEN** Matter controller sends `moveToLevel(127)` to a dimmer endpoint with `meta.min: 0`, `meta.max: 65535`
- **THEN** reverse converter uses `levelControlToRange(127, 0, 65535)` (linear map from Matter **1..254** to WB range), producing a decimal string for MQTT publish

### Requirement: RGB control mapping

The system SHALL map WB control type `rgb` to Matter `extendedColorLight` with `OnOff` + `ColorControl` clusters. Converter SHALL transform `'R;G;B'` string to HSV and back.

#### Scenario: RGB to HSV conversion

- **WHEN** WB control value is `"128;0;255"`
- **THEN** converter produces correct `currentHue` and `currentSaturation` values in Matter HSV space

#### Scenario: HSV to RGB reverse conversion

- **WHEN** Matter command sets hue and saturation
- **THEN** reverse converter produces `"R;G;B"` string for MQTT publish

### Requirement: Alarm control mapping with name-based specialization

The system SHALL map WB control type `alarm` based on control name: smoke/дым→smokeCoAlarm, leak/утечка/water→waterLeakDetector, freeze/замерз→waterFreezeDetector, rain/дождь→rainSensor. Fallback: contactSensor.

#### Scenario: Smoke alarm

- **WHEN** WB control has `meta.type: "alarm"` and name contains "smoke"
- **THEN** mapping returns `smokeCoAlarm` with `SmokeCoAlarm` cluster, converter `'1'→Critical, '0'→Normal`

#### Scenario: Water leak alarm

- **WHEN** WB control has `meta.type: "alarm"` and name contains "leak"
- **THEN** mapping returns `waterLeakDetector` with `BooleanState` cluster

#### Scenario: Generic alarm fallback

- **WHEN** WB control has `meta.type: "alarm"` and name matches no specialization
- **THEN** mapping returns `contactSensor` with `BooleanState` cluster

### Requirement: Pushbutton and wo-switch mapping

The system SHALL map WB control types `pushbutton` and `wo-switch` to Matter `genericSwitch` with `Switch` cluster (MomentarySwitch feature), triggering `InitialPress` event on value `'1'`.

#### Scenario: Pushbutton press

- **WHEN** WB control has `meta.type: "pushbutton"` and value changes to `"1"`
- **THEN** system triggers `InitialPress` event on Matter `genericSwitch`

#### Scenario: Write-only switch (wo-switch)

- **WHEN** WB control has `meta.type: "wo-switch"` and value changes to `"1"`
- **THEN** system triggers `InitialPress` event on Matter `genericSwitch` (stateless, no retained value)

### Requirement: Temperature sensor mapping

The system SHALL map WB control `value` with units `deg C` to Matter `temperatureSensor` with `TemperatureMeasurement` cluster, converter `×100`.

#### Scenario: Temperature conversion

- **WHEN** WB control value is `"23.5"` with units `deg C`
- **THEN** Matter `measuredValue` is set to `2350`

#### Scenario: Negative temperature

- **WHEN** WB control value is `"-10"` with units `deg C`
- **THEN** Matter `measuredValue` is set to `-1000`

### Requirement: Humidity sensor mapping

The system SHALL map WB control `value` with units `RH` to Matter `humiditySensor`, converter `×100`. The system SHALL map WB control `value` with units `%` to Matter `humiditySensor` with the same converter **when** no WB-MAP electrical harmonic rule applies (see Requirement: Total harmonic distortion and `%` disambiguation). Note: **`%` is overloaded** — climate sensors use it for **relative humidity**; MAP may use **`%`** for **THD** (harmonics), which must not use the humidity mapping.

#### Scenario: Humidity conversion

- **WHEN** WB control value is `"65.3"` with units `%` and harmonic keywords do not apply
- **THEN** Matter `measuredValue` is set to `6530`

#### Scenario: Humidity name still uses humidity mapping when not THD

- **WHEN** WB control value is `"50"` with units `%` and name suggests climate humidity (e.g. contains `humidity`) and does **not** match harmonic distortion keywords from the WB-MAP electrical rule
- **THEN** mapping targets `humiditySensor` and Matter `measuredValue` is set to `5000`

### Requirement: Pressure sensor mapping

The system SHALL map WB control `value` with units `Pa` (×0.01), `mbar` (×1), or `bar` (×1000) to Matter `pressureSensor` with `PressureMeasurement` cluster (hPa).

#### Scenario: Pascal to hPa

- **WHEN** WB control value is `"101325"` with units `Pa`
- **THEN** Matter `measuredValue` is set to `1013` (rounded)

#### Scenario: Millibar passthrough

- **WHEN** WB control value is `"1013"` with units `mbar`
- **THEN** Matter `measuredValue` is set to `1013`

#### Scenario: Bar to hPa

- **WHEN** WB control value is `"1.013"` with units `bar`
- **THEN** Matter `measuredValue` is set to `1013`

### Requirement: Illuminance sensor mapping

The system SHALL map WB control `value` with units `lx` to Matter `lightSensor` with `IlluminanceMeasurement` cluster, converter `lux<=0 ? 0 : Math.round(10000*log10(lux)+1)`.

#### Scenario: Illuminance conversion

- **WHEN** WB control value is `"100"` with units `lx`
- **THEN** Matter `measuredValue` is set to `20001`

#### Scenario: Zero lux

- **WHEN** WB control value is `"0"` with units `lx`
- **THEN** Matter `measuredValue` is set to `0`

### Requirement: Occupancy sensor mapping

The system SHALL map readonly switch with name containing motion/движ/occupancy to Matter `occupancySensor` with `OccupancySensing` cluster.

#### Scenario: Motion detected

- **WHEN** WB readonly switch named "Motion Sensor" has value `"1"`
- **THEN** Matter `occupancy` is set to `{occupied: true}`

### Requirement: Electrical measurement mapping

The system SHALL map WB `value` controls with electrical units to Matter `electricalSensor` using `ElectricalPowerMeasurement` (and `ElectricalEnergyMeasurement` where noted):

- **W** → `activePower` (×1000 to `power_mw`)
- **var** → `reactivePower` (×1000 to `power_mvar`)
- **VA** → `apparentPower` (×1000 to `power_mva`)
- **V** → `voltage` (×1000), **mV** → `voltage` (×1)
- **A** → `activeCurrent` (×1000), **mA** → `activeCurrent` (×1)
- **ratio** (power factor) → `powerFactor`: Matter encoding **±1/100ths of a percent** (PF **0.97** → **9700**)
- **Hz** → `frequency`: WB hertz × **1000** → **millihertz** (e.g. **50.02** Hz → **50020**)

For **kWh** mapped to `ElectricalEnergyMeasurement.cumulativeEnergyImported`, the value SHALL be `{ energy: Math.round(kWh × 1_000_000) }` (EnergyMeasurement struct), not a bare scalar.

**kvarh** and **kVAh** SHALL follow Requirement: WB-MAP reactive and apparent energy (kvarh, kVAh).

#### Scenario: Power in watts

- **WHEN** WB control value is `"150.5"` with units `W`
- **THEN** Matter `activePower` is set to `150500`

#### Scenario: Reactive power in var

- **WHEN** WB control value is `"25"` with units `var`
- **THEN** Matter `reactivePower` is set to `25000`

#### Scenario: Apparent power in VA

- **WHEN** WB control value is `"330"` with units `VA`
- **THEN** Matter `apparentPower` is set to `330000`

#### Scenario: Power factor

- **WHEN** WB control value is `"0.97"` with units `ratio`
- **THEN** Matter `powerFactor` is set to `9700`

#### Scenario: Line frequency in Hz

- **WHEN** WB control value is `"50.02"` with units `Hz`
- **THEN** Matter `frequency` is set to `50020` (millihertz)

#### Scenario: Current in milliamps passthrough

- **WHEN** WB control value is `"350"` with units `mA`
- **THEN** Matter `activeCurrent` is set to `350`

#### Scenario: Energy imported in kWh

- **WHEN** WB control value is `"1"` with units `kWh` on an endpoint with `ElectricalEnergyMeasurement`
- **THEN** Matter `cumulativeEnergyImported` is set to `{ energy: 1000000 }`

### Requirement: WB-MAP reactive and apparent energy (kvarh, kVAh)

The default Matterbridge `electricalSensor` stack for this plugin exposes **`ElectricalEnergyMeasurement.cumulativeEnergyImported`** but **not** separate reactive/apparent cumulative attributes in the same form as upstream Matter 1.4+ optional features. The system SHALL map WB `value` with units **`kvarh`** and **`kVAh`** each to **`cumulativeEnergyImported`** on **that control’s Matter endpoint**, using the same `EnergyMeasurementStruct` scaling as **kWh**: `energy = Math.round(kilo_units × 1_000_000)`. Each WB counter channel keeps its own endpoint, so reactive and apparent **WB** channels do not overwrite each other.

#### Scenario: Reactive energy in kvarh

- **WHEN** WB control value is `"0.5"` with units `kvarh`
- **THEN** Matter `cumulativeEnergyImported` is set to `{ energy: 500000 }`

#### Scenario: Apparent energy in kVAh

- **WHEN** WB control value is `"2"` with units `kVAh`
- **THEN** Matter `cumulativeEnergyImported` is set to `{ energy: 2000000 }`

### Requirement: WB-MAP AC phase angle (deg)

The default `ElectricalPowerMeasurement` server uses **AlternatingCurrent** only (no `harmonicPhases` on the bridge). The system SHALL map WB `value` with units **`deg`** (AC phase angle from MAP, not **`deg C`**) to **`rmsCurrent`** using a **bridge proxy**: WB decimal degrees × **1000** as an integer in the mA-typed field (**millidegrees**), e.g. **12.5°** → **12500**. This is **not** RMS line current in amperes.

#### Scenario: Phase angle in degrees

- **WHEN** WB control value is `"12.5"` with units `deg` on a MAP phase channel
- **THEN** Matter `rmsCurrent` is set to `12500` (not `TemperatureMeasurement`)

### Requirement: Total harmonic distortion and `%` disambiguation

The plugin maps generic `value` + **`%`** to **relative humidity** unless **pass 1** matches a **`nameKeywords`** entry for harmonics (`thd`, `hr`, `harm`, `harmonic`, `нг`, …). For those controls, mapping SHALL target **`electricalSensor`** + **`ElectricalPowerMeasurement`**. The default server has **no** `harmonicCurrents` cluster feature; THD **percent** SHALL be stored in **`rmsPower`** as a **bridge proxy**: **`Math.round(THD_percent × 100)`** (milliwatt field; not true RMS power).

#### Scenario: THD uses electrical path, not humidity

- **WHEN** WB control has `meta.type: "value"`, `units: "%"`, and name contains `THD`
- **THEN** mapping targets `electricalSensor` with `ElectricalPowerMeasurement`, and value `"3.5"` yields `rmsPower` **350**

#### Scenario: Generic percent without harmonic keywords uses humidity

- **WHEN** WB control has `meta.type: "value"`, `units: "%"`, and name does not match harmonic keywords
- **THEN** mapping targets `humiditySensor` as in the humidity requirement above

### Requirement: Air quality sensor mapping

The system SHALL map WB `value` controls with concentration units (ppm, ppb, µg/m³) to Matter `airQualitySensor`, using control name to determine specific gas: CO2, CO, NO2, ozone, formaldehyde, PM1, PM2.5, PM10, radon, TVOC.

#### Scenario: CO2 measurement with AirQuality classification

- **WHEN** WB control named "CO2" has value `"1000"` with units `ppm`
- **THEN** Matter `CarbonDioxideConcentrationMeasurement.measuredValue` is set to `1000` AND `AirQuality.airQuality` is set to `Moderate`

#### Scenario: AirQuality classification thresholds

- **WHEN** CO2 values are: <400→Good, 400-800→Fair, 800-1500→Moderate, 1500-2500→Poor, >2500→VeryPoor
- **THEN** system classifies each value to the corresponding `AirQualityEnum`

#### Scenario: PM2.5 identified by name

- **WHEN** WB control named "PM2.5" has value `"25"` with units `µg/m³`
- **THEN** Matter `Pm25ConcentrationMeasurement.measuredValue` is set to `25`

### Requirement: Flow sensor mapping

The system SHALL map WB `value` with units `m³/h` to Matter `flowSensor` with `FlowMeasurement` cluster, converter `×10`.

#### Scenario: Flow conversion

- **WHEN** WB control value is `"1.5"` with units `m³/h`
- **THEN** Matter `measuredValue` is set to `15`

### Requirement: Deprecated type normalization

The system SHALL normalize deprecated WB control types to standard `value` + units form before mapping lookup: temperature→deg C, rel_humidity→%, atmospheric_pressure→mbar, pressure→mbar, lux→lx, power→W, voltage→V, current→A, power_consumption→kWh, concentration→ppm, water_flow→m³/h.

#### Scenario: Deprecated temperature type

- **WHEN** WB control has `meta.type: "temperature"`
- **THEN** system normalizes to `type: "value"`, `units: "deg C"` and applies standard temperature mapping

#### Scenario: Deprecated power_consumption type

- **WHEN** WB control has `meta.type: "power_consumption"`
- **THEN** system normalizes to `type: "value"`, `units: "kWh"` and applies energy measurement mapping

### Requirement: Unsupported types are skipped

The system SHALL skip controls with no Matter equivalent (`text` except those handled as **controller** metadata on WB device id **`system`** → Bridged Device Basic Information, `enum` without override, `sound_level`, `wind_speed`, `rainfall`, `water_consumption`, `resistance`, `heat_power`, `heat_energy`, `unixtime`, `w1-id`, `value` with unknown units) and log a warning.

#### Scenario: Text control skipped

- **WHEN** WB control has `meta.type: "text"` and it is **not** consumed as Bridged Device Basic Information metadata (including: not on device **`system`**, or not matching a controller metadata pattern)
- **THEN** system skips the control and logs warning with control name and type

#### Scenario: Enum without override skipped

- **WHEN** WB control has `meta.type: "enum"` and no `deviceOverrides` configured for it
- **THEN** system skips the control and logs warning

#### Scenario: Skip types without Matter equivalent

- **WHEN** WB control has `meta.type` of `unixtime`, `w1-id`, or deprecated types `sound_level`, `wind_speed`, `rainfall`, `water_consumption`, `resistance`, `heat_power`, `heat_energy`
- **THEN** system skips the control and logs warning

#### Scenario: Unknown units skipped

- **WHEN** WB control has `meta.type: "value"` and `units: "m/s"`
- **THEN** system skips the control and logs warning

### Requirement: System metadata `text` — name patterns for Bridged Device Basic Information

The system SHALL treat readonly `meta.type: "text"` controls on the WB **`system`** device only (controller — paths `system/…`) as **out of scope for `findMapping()`** when they match documented **controller metadata** name patterns. Those controls SHALL be routed to the device builder’s Bridged Device Basic Information pipeline for **that** bridged device (see device-builder capability). The same name patterns on **other** WB devices SHALL NOT use this pipeline. Name matching SHALL be case-insensitive and SHALL use substring or exact rules consistent with Wirenboard’s titles (e.g. "Batch No", "Short SN", "HW Revision", "Manufacturing Date", "DTS Version", "Release name", "Release suite", "Temperature Grade").

#### Scenario: Metadata text bypasses generic type mapping on controller device

- **WHEN** WB device id is **`system`** and a readonly `text` control name matches a controller metadata pattern
- **THEN** `findMapping()` is not required to return a Matter device type for that control

#### Scenario: Same name on a peripheral does not use metadata pipeline

- **WHEN** WB device id is **not** `system` and a `text` control name coincidentally matches a controller metadata pattern
- **THEN** system does NOT treat it as controller Basic Information metadata; normal skip/mapping rules apply

### Requirement: Enum control mapping via deviceOverrides

The system SHALL map WB control type `enum` to a Matter device type ONLY when explicitly configured via `deviceOverrides`. The override SHALL specify the target Matter device type. The enum values from `meta.enum` SHALL be used for state conversion.

#### Scenario: Enum mapped via override

- **WHEN** WB control has `meta.type: "enum"` and `deviceOverrides` specifies `deviceType: "onOffOutlet"` for it
- **THEN** system maps the control to `onOffOutlet` using the override configuration

#### Scenario: Enum without override remains skipped

- **WHEN** WB control has `meta.type: "enum"` and no `deviceOverrides` entry exists
- **THEN** system skips the control and logs warning

### Requirement: Mapping priority order

The system SHALL resolve Matter device type in priority order: (1) `deviceOverrides` from config, (2) control name substring match, (3) fallback by `meta.type`.

#### Scenario: Config override takes precedence

- **WHEN** config has `deviceOverrides` setting control to `onOffLight` AND control name contains "valve"
- **THEN** mapping uses `onOffLight` (config override), not `waterValve` (name match)

#### Scenario: Name match over fallback

- **WHEN** WB switch control named "Water Valve" has no config override
- **THEN** mapping uses `waterValve` (name match), not `onOffOutlet` (type fallback)

### Requirement: Precision handling in reverse conversion

The system SHALL round values to `meta.precision` digits when converting Matter values to MQTT strings.

#### Scenario: Precision rounding

- **WHEN** reverse converter produces value `23.456` and `meta.precision` is `0.1`
- **THEN** system publishes `"23.5"` to MQTT

### Requirement: Matter validation — Level Control must not use 0 for currentLevel

For any mapping that sets `LevelControl.currentLevel`, Matter SHALL receive levels in **1..254** only; value **0** SHALL NOT be written (cluster constraint / rollback). `ColorControl` hue/saturation use separate converters and MAY still use **0..254** where valid for that cluster.

#### Scenario: Off at WB zero for dimmer

- **WHEN** WB sends `"0"` for brightness on a dimmer/range→LevelControl path
- **THEN** `currentLevel` is **1** and `OnOff` off is derived from raw WB brightness `> 0` check in `updateFromMqtt`, not from `currentLevel === 0`
