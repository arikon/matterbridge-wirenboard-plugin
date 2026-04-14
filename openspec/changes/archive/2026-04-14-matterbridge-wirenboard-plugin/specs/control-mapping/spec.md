## ADDED Requirements

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
The system SHALL map WB control `value` with units `%` or `RH` to Matter `humiditySensor`, converter `×100`.

#### Scenario: Humidity conversion
- **WHEN** WB control value is `"65.3"` with units `%`
- **THEN** Matter `measuredValue` is set to `6530`

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
The system SHALL map WB `value` controls with electrical units: W→activePower(×1000), V→voltage(×1000), mV→voltage(×1), A→activeCurrent(×1000), mA→activeCurrent(×1) to Matter `electricalSensor`. For **kWh** mapped to `ElectricalEnergyMeasurement.cumulativeEnergyImported`, the value SHALL be `{ energy: Math.round(kWh × 1_000_000) }` (EnergyMeasurement struct), not a bare scalar.

#### Scenario: Power in watts
- **WHEN** WB control value is `"150.5"` with units `W`
- **THEN** Matter `activePower` is set to `150500`

#### Scenario: Current in milliamps passthrough
- **WHEN** WB control value is `"350"` with units `mA`
- **THEN** Matter `activeCurrent` is set to `350`

#### Scenario: Energy imported in kWh
- **WHEN** WB control value is `"1"` with units `kWh` on an endpoint with `ElectricalEnergyMeasurement`
- **THEN** Matter `cumulativeEnergyImported` is set to `{ energy: 1000000 }`

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
The system SHALL skip controls with no Matter equivalent (text, enum without override, sound_level, wind_speed, rainfall, water_consumption, resistance, heat_power, heat_energy, unixtime, w1-id, value with unknown units) and log a warning.

#### Scenario: Text control skipped
- **WHEN** WB control has `meta.type: "text"`
- **THEN** system skips the control and logs warning with control name and type

#### Scenario: Enum without override skipped
- **WHEN** WB control has `meta.type: "enum"` and no `deviceOverrides` configured for it
- **THEN** system skips the control and logs warning

### Requirement: Enum control mapping via deviceOverrides
The system SHALL map WB control type `enum` to a Matter device type ONLY when explicitly configured via `deviceOverrides`. The override SHALL specify the target Matter device type. The enum values from `meta.enum` SHALL be used for state conversion.

#### Scenario: Enum mapped via override
- **WHEN** WB control has `meta.type: "enum"` and `deviceOverrides` specifies `deviceType: "onOffOutlet"` for it
- **THEN** system maps the control to `onOffOutlet` using the override configuration

#### Scenario: Enum without override remains skipped
- **WHEN** WB control has `meta.type: "enum"` and no `deviceOverrides` entry exists
- **THEN** system skips the control and logs warning

#### Scenario: Skip types without Matter equivalent
- **WHEN** WB control has `meta.type` of `unixtime`, `w1-id`, or deprecated types `sound_level`, `wind_speed`, `rainfall`, `water_consumption`, `resistance`, `heat_power`, `heat_energy`
- **THEN** system skips the control and logs warning

#### Scenario: Unknown units skipped
- **WHEN** WB control has `meta.type: "value"` and `units: "m/s"`
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