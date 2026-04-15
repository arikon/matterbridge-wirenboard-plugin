# Delta: control-mapping — wb-map-units-matter-mapping

## MODIFIED Requirements

### Requirement: Humidity sensor mapping

The system SHALL map WB control `value` with units `RH` to Matter `humiditySensor`, converter `×100`. The system SHALL map WB control `value` with units `%` to Matter `humiditySensor` with the same converter **when** no WB-MAP electrical harmonic rule applies (see ADDED Requirement: Total harmonic distortion and `%` disambiguation). Note: **`%` is overloaded** — climate sensors use it for **relative humidity**; MAP may use **`%`** for **THD** (harmonics), which must not use the humidity mapping.

#### Scenario: Humidity conversion

- **WHEN** WB control value is `"65.3"` with units `%` and harmonic keywords do not apply
- **THEN** Matter `measuredValue` is set to `6530`

#### Scenario: Humidity name still uses humidity mapping when not THD

- **WHEN** WB control value is `"50"` with units `%` and name suggests climate humidity (e.g. contains `humidity`) and does **not** match harmonic distortion keywords from the WB-MAP electrical rule
- **THEN** mapping targets `humiditySensor` and Matter `measuredValue` is set to `5000`

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

**kvarh** and **kVAh** SHALL follow ADDED Requirement: WB-MAP reactive and apparent energy (kvarh, kVAh).

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

## ADDED Requirements

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
- **THEN** mapping targets `humiditySensor` as in the MODIFIED humidity requirement
