# Design: Extended Bridged Device Basic Information from system `text` controls

## Context

Wirenboard publishes manufacturing and release data as readonly `text` controls on the `system` device (e.g. `system/Batch No`, `system/Short SN`). The plugin logs `Skipping control … no mapping for type 'text'` and only fills **Serial**, **FW Version**, and **HW Batch**-style fields via `extractHwMetadata()` keyword lists. Matter **Bridged Device Basic Information** (same cluster server as today via `createDefaultBridgedDeviceBasicInformationClusterServer`) exposes additional string attributes (`PartNumber`, `ManufacturingDate`, `ProductLabel`, etc.) that align with this data.

## Goals / Non-Goals

**Goals:**

- Map named `text` controls from the WB **`system`** device only (paths `system/*`, readonly) to **Bridged Device Basic Information** on the **root endpoint of the Matter bridged device that represents that controller** — i.e. when `wbDevice.name === 'system'`. Do **not** attach controller factory metadata to bridged roots for other WB devices (relays, sensors, `system__…` service devices unless explicitly specified elsewhere).
- Consume those controls so they do **not** appear as child endpoints and do **not** emit generic “no mapping for text” warnings.
- Update Matter attributes when MQTT delivers new retained/live values for those controls (`updateFromMqtt` or equivalent path).
- Normalize **ManufacturingDate** to Matter’s **YYYYMMDD** string (8 chars) when the WB string is parseable; otherwise omit or log debug (decision below).

**Non-Goals:**

- Copying **`system/*` metadata onto Matter devices that represent peripheral WB modules** — controller identity stays on the controller bridged device only.
- Mapping arbitrary user `text` controls on non-`system` WB devices via this pipeline (unless explicitly added to a separate allowlist later).
- Writable `text` controls (if any) — out of scope; metadata path is readonly-only.
- Full **Fixed Label** / **User Label** cluster for every spare string in v1 (optional follow-up for overflow fields).
- Changing Matterbridge’s numeric **HardwareVersion** / **SoftwareVersion** uint fields if the stack only exposes string setters easily — prefer string attributes first; document if uints stay default.

## Decisions

1. **Controller-only scope**
   Apply the extended **`system/*` metadata** pipeline **only** when building or updating the `WirenboardDevice` for WB device id **`system`**. The Matter user sees factory data on the **one** bridged device that models the Wirenboard controller, not on every endpoint along with relays.

2. **Cluster and endpoint**
   On that controller device only, use the existing **Bridged Device Basic Information** cluster on the **root `MatterbridgeEndpoint`** (the endpoint that already calls `createDefaultBridgedDeviceBasicInformationClusterServer`). Do not model metadata as separate child endpoints.

3. **Name → attribute mapping (initial set, case-insensitive substring or exact match as implemented)**

   | WB control name (typical)                          | Matter attribute (Bridged Device Basic Information)                                                                                                                               |
   | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Short SN, Serial                                   | `SerialNumber` (same slot; extend keywords)                                                                                                                                       |
   | Batch No                                           | `PartNumber`                                                                                                                                                                      |
   | HW Revision                                        | `HardwareVersionString`                                                                                                                                                           |
   | Manufacturing Date                                 | `ManufacturingDate` (normalized to `YYYYMMDD`)                                                                                                                                    |
   | FW / Firmware / DTS Version (disambiguate in code) | `SoftwareVersionString` — FW line first; DTS appended as ` \| DTS: <value>` in the same string when both exist                                                                    |
   | Release suite, Release name, Temperature Grade     | `ProductLabel` — single string: non-empty parts in order **Release suite · Release name · Temperature grade**, separated by **`·`** (space-middle dot-space); empty parts omitted |

   **Precedence:** If multiple controls map to the same attribute, deterministic order (documented in code) wins; first successful parse or last-write wins per product choice — recommend **last MQTT update wins** per attribute.

4. **Consumption vs `findMapping()`**
   Run **metadata extraction** before generic control mapping **only for WB device id `system`**. Consumed control names are added to `consumedControls` (or equivalent) so the main loop skips them without warning.

5. **“Text skipped” logging**
   Controls consumed as Basic Information metadata **SHALL NOT** trigger the generic “Unsupported types — text” warning.

6. **Registration when only metadata**
   If the **`system`** WB device has **only** metadata `text` controls and no mappable actuator/sensor controls: **Open question** — either skip registration (metadata invisible) or register a **root-only** bridged device for **`system`** when at least one metadata field is present so controllers can read BI; align with product preference in tasks.

## Risks / Trade-offs

- **[Risk]** `ManufacturingDate` formats from WB vary → **Mitigation:** try ISO / `DD.MM.YYYY` / raw `YYYYMMDD`; on failure leave attribute unchanged and log debug.
- **[Risk]** String length limits on Matter attributes → **Mitigation:** truncate with debug log or split overflow to ProductLabel only.
- **[Risk]** Overwriting `SoftwareVersionString` when both “FW Version” and “DTS Version” exist → **Mitigation:** concatenate with separator or prefer FW for primary string and append DTS.
- **[Trade-off]** Exposing factory data on Matter increases information leakage to anyone on the fabric — acceptable for home bridge use case.

## Migration Plan

- Deploy with new mapping; no DB migration. Existing devices get updated BI on next MQTT retained replay / reconnect.
- Rollback: revert code; metadata falls back to current behavior (warnings + no extra fields).

## Open Questions

- Should **`system`** with **only** metadata texts register a visible bridged device (root-only)? **Recommendation:** yes for `system`, so Home apps can show serial/part info. (Implemented: `buildSystemMetadataRootOnly` when consumed metadata exists and nothing else is registered.)
