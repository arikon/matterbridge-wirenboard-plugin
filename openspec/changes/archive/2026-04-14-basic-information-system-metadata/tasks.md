# Tasks: basic-information-system-metadata

## 1. Mapping table and normalization

- [x] 1.1 Add a dedicated module or section (e.g. `systemMetadataMapping.ts` or exports from `controlMapping.ts`) listing **case-insensitive** name patterns → Bridged Device Basic Information attribute keys (`SerialNumber`, `PartNumber`, `HardwareVersionString`, `SoftwareVersionString`, `ManufacturingDate`, `ProductLabel`).
- [x] 1.2 Implement `normalizeManufacturingDate(value: string): string | undefined` for **YYYYMMDD** output (support ISO, `DD.MM.YYYY`, existing `YYYYMMDD`).
- [x] 1.3 Define merge rules for **SoftwareVersionString** when both FW-style and **DTS Version** controls exist (concatenation or precedence per `design.md`).

## 2. Extract and consume controls

- [x] 2.1 Extend `extractHwMetadata` (or replace with structured extractor) to fill new fields from readonly `text` controls **only when `wbDevice.name === 'system'`** (controller); add **all** matched control names to `consumedControls`.
- [x] 2.2 Ensure the main control loop skips consumed metadata controls **before** generic `findMapping()` / unsupported-type logging so no `no mapping for type 'text'` warning is emitted for them.

## 3. Apply to Matter at build time

- [x] 3.1 After `createDefaultBridgedDeviceBasicInformationClusterServer`, set additional string attributes from extracted metadata (via matterbridge API: `setAttribute` / cluster accessors — follow existing patterns in `wirenboardDevice.ts`).
- [x] 3.2 Apply extended metadata **only** on the `WirenboardDevice` for **`system`** (not on thermostat/lighting/peripheral device builders).

## 4. MQTT → Matter updates

- [x] 4.1 In `updateFromMqtt`, for **`system`** only, detect updates to consumed metadata controls and update the corresponding Bridged Device Basic Information attributes on the **root** endpoint (with echo-suppression behavior consistent with other readonly attributes, if applicable).

## 5. Edge cases and product decision

- [x] 5.1 Resolve **Open Question** from `design.md`: if a device has **only** metadata `text` controls and no mappable controls, either register root-only bridged device for `system` or document that metadata appears only when other controls register — implement chosen behavior.
- [x] 5.2 Truncate or split long strings that exceed Matter max length; log at **debug** when truncation occurs.

## 6. Tests and docs

- [x] 6.1 Unit tests: pattern matching, date normalization, merge rules, consumed-controls skip (no spurious warn).
- [x] 6.2 Update `CLAUDE.md` / `README.md` briefly: system metadata → Bridged Device Basic Information.
- [x] 6.3 Run `npm run lint` and `npm test`.
