# Matter endpoints

Purpose: стабильные и предсказуемые номера Matter endpoint’ов для bridged-устройств Wiren Board в плагине Matterbridge.

## Requirements

### Requirement: Deterministic Matter endpoint numbers for unchanged device model

The system SHALL ensure that for a given WB device name, unchanged set of controls (names and mappable mappings), and unchanged plugin configuration, Matter **endpoint numbers** assigned to that device’s bridged endpoint(s) and their parts remain **stable across process restarts** when the MQTT broker delivers the same retained model (same logical device).

#### Scenario: Restart with same control set

- **WHEN** the plugin restarts, discovers the same WB device with the same control names and meta relevant to mapping, and registers it
- **THEN** Matter endpoint numbers for that device’s endpoints do not differ from the previous run’s numbers for the same `uniqueId` / endpoint `id` values

### Requirement: Canonical ordering is independent of MQTT Map insertion order

The system SHALL NOT rely on `Map` iteration order of `wbDevice.controls` as the sole ordering rule for building endpoints or assigning implicit endpoint order. Ordering SHALL be derived from a documented canonical rule (layered: thermostat composite if present, then lighting composites, then remaining mappable controls with deterministic tie-break, e.g. lexicographic by control name).

#### Scenario: Control order differs in Map

- **WHEN** two runs deliver the same controls but `Map` iteration order differs (simulated or via test doubles)
- **THEN** the resulting sequence of created Matter parts and their endpoint numbers is identical between runs

### Requirement: Explicit endpoint numbers when implementation requires

If implicit numbering after canonical ordering is insufficient for stability on the supported Matterbridge/Matter.js stack, the system SHALL assign explicit `EndpointNumber` values via supported `MatterbridgeEndpoint` / child-creation options such that no two bridged parts under the same aggregator conflict and valid Matter ranges are respected.

#### Scenario: Explicit numbers avoid collision

- **WHEN** explicit numbers are enabled for a bridged device tree
- **THEN** each part receives a distinct valid endpoint number and registration succeeds without Matter.js allocation errors
