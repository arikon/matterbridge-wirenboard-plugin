# Device builder (delta — stable ordering)

Delta for capability `device-builder`. Base spec: `openspec/specs/device-builder/spec.md`.

## ADDED Requirements

### Requirement: Canonical ordering before endpoint construction

The system SHALL build lists of mappable controls and lighting composites used for `WirenboardDevice.create` in a **canonical order** that does not depend on `Map` insertion order from MQTT: thermostat detection unchanged; lighting composites ordered deterministically (e.g. by switch control name or composite id); remaining mappable controls ordered deterministically (e.g. lexicographic by control name) after excluding consumed controls.

#### Scenario: Semantic tags align with canonical child order

- **WHEN** `groupingMode` is `device` and multiple child endpoints of the same Matter device type are created from an ordered list of controls
- **THEN** semantic tag values `1..n` assigned per same-type sequence correspond to that **canonical** order, not the raw `Map` iteration order

### Requirement: Stable registration sequence matches canonical tree build

The system SHALL register Matter endpoints (calls to `registerDevice` and order of `addChildDeviceType*` relative to canonical lists) such that the resulting endpoint numbering is consistent with the **canonical** order defined for the device builder.

#### Scenario: Device mode children order

- **WHEN** a WB device has multiple mappable controls in `device` grouping mode
- **THEN** child endpoints are attached to the root in canonical order, independent of the order in which control meta first arrived over MQTT
