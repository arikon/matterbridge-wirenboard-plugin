# Delta: device-builder — basic-information-system-metadata

## MODIFIED Requirements

### Requirement: HW metadata extraction for BridgedDeviceBasicInformation

The system SHALL extract hardware and manufacturing metadata from readonly WB `text` controls whose MQTT paths are under the **`system`** device (`system/…` — the Wirenboard **controller**), using **case-insensitive name matching**, and SHALL apply values to the **Bridged Device Basic Information** cluster on the **root** `MatterbridgeEndpoint` **only for that WB device** (device id **`system`**). The system SHALL NOT copy these controller metadata fields onto the root endpoints of other WB devices (e.g. peripheral modules). Matched controls SHALL NOT create separate Matter child endpoints and SHALL be recorded as consumed so generic `text` skip logic does not run.

The system SHALL map at minimum the following name patterns to Matter attributes:

- **Serial number** (names containing `serial`, or **Short SN**) → `SerialNumber`
- **Batch** (e.g. **Batch No**) → `PartNumber`
- **HW Revision** / hardware batch style names → `HardwareVersionString` (single string; if multiple sources exist, concatenate or last-write per implementation with documented precedence)
- **Manufacturing Date** → `ManufacturingDate` (Matter string format **YYYYMMDD**; normalize from common WB date strings when possible)
- **Firmware / software version** (existing FW keyword list, plus **DTS Version** if present) → `SoftwareVersionString` (merge policy documented in implementation)
- **Release name**, **Release suite**, **Temperature grade** → `ProductLabel` and/or appended segments so all can be represented without losing data where attribute length allows

The system SHALL invoke the same attribute writes when retained or live MQTT values arrive for these controls after registration (MQTT → Matter path for readonly metadata).

#### Scenario: Serial number extracted on controller device

- **WHEN** WB device id is **`system`** and it has a `text` control named "Serial" with value `"12345678"`
- **THEN** system uses `"12345678"` as `SerialNumber` in BridgedDeviceBasicInformation for that bridged device and does NOT create an endpoint for this control

#### Scenario: Short SN maps to SerialNumber

- **WHEN** WB device id is **`system`** and it has readonly `text` control named "Short SN" with value `"ABC123"`
- **THEN** system sets `SerialNumber` to `"ABC123"` on that controller’s root endpoint and consumes the control

#### Scenario: Batch No maps to PartNumber

- **WHEN** WB device id is **`system`** and it has readonly `text` control named "Batch No" with value `"B-99"`
- **THEN** system sets `PartNumber` to `"B-99"` on the controller bridged device and consumes the control

#### Scenario: Manufacturing date normalized

- **WHEN** WB device id is **`system`** and readonly `text` control "Manufacturing Date" has a parseable date value
- **THEN** system sets `ManufacturingDate` to an 8-character `YYYYMMDD` string on the controller bridged device

#### Scenario: Peripheral device does not receive controller metadata

- **WHEN** WB device id is **not** `system` (e.g. a relay or sensor module)
- **THEN** system does NOT populate Bridged Device Basic Information from the controller-only `system/*` metadata mapping table on that device’s root endpoint

#### Scenario: Internal diagnostics skipped

- **WHEN** WB device has controls "Supply Voltage", "MCU Temperature", or "Uptime"
- **THEN** system skips these controls by default (no endpoint, no BasicInfo field) unless `includeHidden` is true or explicitly included via `deviceOverrides`

#### Scenario: Consumed metadata does not log generic text skip

- **WHEN** a `text` control is consumed for BridgedDeviceBasicInformation
- **THEN** system does NOT log `Skipping control … no mapping for type 'text'` for that control

## ADDED Requirements

### Requirement: MQTT updates for BridgedDeviceBasicInformation metadata attributes

The system SHALL update Bridged Device Basic Information string attributes on the root endpoint when MQTT publishes a new value for a control that is bound to that attribute, using the same converters/normalization as at device build time.

#### Scenario: Retained metadata replay after connect

- **WHEN** MQTT delivers a retained value for `system`/`HW Revision` after the **`system`** bridged device already exists
- **THEN** system updates `HardwareVersionString` on that controller’s root endpoint to match the new value
