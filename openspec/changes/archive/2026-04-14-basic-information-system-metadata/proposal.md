# Proposal: Basic Information from system `text` controls

## Why

Wirenboard exposes manufacturing and release metadata as readonly `text` controls on the **`system`** device (paths `system/…`, e.g. Short SN, HW Revision, Batch No). Those controls describe **the Wirenboard controller itself**, not peripheral modules. The plugin currently skips them (`no mapping for type 'text'`) and only fills three HW strings via narrow keyword heuristics. We should map these fields onto the **Bridged Device Basic Information** cluster on the **root endpoint of the single Matter bridged device that represents the WB controller** (WB device id **`system`** — the same cluster server created by `createDefaultBridgedDeviceBasicInformationClusterServer` for that device only), so serial, part number, manufacturing date, and version strings align with Matter semantics and do not appear on unrelated endpoints (relays, sensors, etc.).

## What Changes

- Extend HW/metadata extraction **only for the WB device id `system`** (controller): deterministic **control name → Matter attribute** mapping for readonly `text` controls (SerialNumber, PartNumber, HardwareVersionString, SoftwareVersionString, ManufacturingDate, and composed/auxiliary strings where no single attribute fits).
- Populate **Bridged Device Basic Information** attributes on that device’s **root Matter endpoint** from retained/current MQTT values when endpoints are built, and **update attributes** when matching MQTT `control-value` events arrive (readonly text still drives Matter-side updates).
- Mark consumed controls so they are **not** registered as separate child endpoints and do **not** emit duplicate “Skipping control … no mapping” warnings when successfully consumed as metadata.
- Document normalization rules (e.g. **ManufacturingDate** Matter format `YYYYMMDD`) and fallback when a WB value is not parseable.

## Capabilities

### New Capabilities

_None — behavior is an extension of existing device construction and MQTT sync._

### Modified Capabilities

- **`device-builder`**: REQUIREMENTS change — the bridged device that represents the **WB controller** (device id **`system`**) SHALL reflect `system/*` `text` metadata in Bridged Device Basic Information where mapping rules apply; other WB devices SHALL NOT receive this controller metadata on their roots; consumed controls SHALL be excluded from generic control mapping and SHALL NOT produce spurious skip logs.
- **`control-mapping`**: REQUIREMENTS change — add explicit, documented rules for **system metadata** `text` controls → Matter attribute names (by control title/name patterns), separate from generic `findMapping()` for sensors/actuators.

## Impact

- **`src/wirenboardDevice.ts`**: `extractHwMetadata` (or successor), `WirenboardDevice.create`, `updateFromMqtt` paths touching Bridged Device Basic Information attributes.
- **Tests**: new/updated unit tests for mapping table, date normalization, and consumption of controls.
- **Dependencies**: Matterbridge / `@matter/*` types for Bridged Device Basic Information attributes (existing cluster usage).
