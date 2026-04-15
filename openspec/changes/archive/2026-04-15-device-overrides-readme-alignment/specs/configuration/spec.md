## MODIFIED Requirements

### Requirement: Device overrides configuration

The system SHALL support `deviceOverrides` (object) for per-device/per-control overrides. Keys at the top level SHALL be WB device ids (`<deviceName>`).

For each device id, the value SHALL be an object with:

- **`controls`** (required object) — keys are WB control names; each value is an object that MAY include **`deviceType`** (string or Matter `DeviceTypeDefinition`) and **`skip`** (boolean). When **`skip`** is `true`, the system SHALL NOT create a Matter endpoint for that control and SHALL NOT emit generic “no mapping” logs for it. When **`deviceType`** is set, the system SHALL map that control to the corresponding Matter device type instead of the default mapping.

- **`name`** (optional string) — when provided, the system SHALL use it as the operator display name for that bridged device in Matterbridge UI registration.

The system SHALL NOT support a legacy flat form where control names appear as top-level keys alongside `name` without a `controls` object.

The system SHALL resolve string **`deviceType`** values to the plugin’s known Matter device type definitions consistently with `CONTROL_MAPPINGS`.

#### Scenario: Override control type

- **WHEN** `deviceOverrides` contains `"wb-mr6c_28": { "controls": { "Relay 1": { "deviceType": "onOffLight" } } }`
- **THEN** the control `"Relay 1"` maps as `onOffLight` instead of the default `onOffOutlet` for a writable switch

#### Scenario: Skip specific control

- **WHEN** `deviceOverrides` contains `"wb-mr6c_28": { "controls": { "Temperature": { "skip": true } } }`
- **THEN** no Matter endpoint is created for `"Temperature"` and no unmappable-control warning is emitted for that skip

#### Scenario: Optional device display name

- **WHEN** `deviceOverrides` contains `"wb-mr6c_28": { "name": "Lighting Panel", "controls": { "Relay 1": { "deviceType": "onOffLight" } } }`
- **THEN** the bridged device uses display name `"Lighting Panel"` for Matterbridge UI registration for that WB device

#### Scenario: Missing controls object is invalid

- **WHEN** `deviceOverrides` contains a device entry without a `controls` object (e.g. only top-level control keys)
- **THEN** the system SHALL NOT apply per-control overrides from that legacy shape (implementation MAY log a warning and ignore the entry or reject normalization for that device)
