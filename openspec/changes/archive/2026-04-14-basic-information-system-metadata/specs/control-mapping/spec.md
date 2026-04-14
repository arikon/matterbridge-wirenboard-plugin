# Delta: control-mapping — basic-information-system-metadata

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: System metadata `text` — name patterns for Bridged Device Basic Information

The system SHALL treat readonly `meta.type: "text"` controls on the WB **`system`** device only (controller — paths `system/…`) as **out of scope for `findMapping()`** when they match documented **controller metadata** name patterns. Those controls SHALL be routed to the device builder’s Bridged Device Basic Information pipeline for **that** bridged device (see device-builder capability). The same name patterns on **other** WB devices SHALL NOT use this pipeline. Name matching SHALL be case-insensitive and SHALL use substring or exact rules consistent with Wirenboard’s titles (e.g. "Batch No", "Short SN", "HW Revision", "Manufacturing Date", "DTS Version", "Release name", "Release suite", "Temperature Grade").

#### Scenario: Metadata text bypasses generic type mapping on controller device

- **WHEN** WB device id is **`system`** and a readonly `text` control name matches a controller metadata pattern
- **THEN** `findMapping()` is not required to return a Matter device type for that control

#### Scenario: Same name on a peripheral does not use metadata pipeline

- **WHEN** WB device id is **not** `system` and a `text` control name coincidentally matches a controller metadata pattern
- **THEN** system does NOT treat it as controller Basic Information metadata; normal skip/mapping rules apply
