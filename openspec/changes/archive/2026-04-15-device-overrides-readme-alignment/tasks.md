## 1. Parsing and types

- [x] 1.1 Add `normalizeDeviceOverridesEntry()` (or dedicated module) that accepts only README shape `{ name?, controls }` and returns `displayName?`, `skippedControls: Set<string>`, `typeOverrides: DeviceOverrides`.
- [x] 1.2 Add string-to-`DeviceTypeDefinition` registry for known Matter types used in overrides (align with `matterbridge` exports / mapping table).

## 2. Platform integration

- [x] 2.1 In `module.ts`, replace direct cast of `deviceOverridesConfig[wbDevice.name]` with normalized output; pass `displayName` into device registration / titles where appropriate.
- [x] 2.2 Pass `skippedControls` into `WirenboardDevice.create` (or equivalent) so skipped controls never enter the mappable loop.

## 3. Device builder

- [x] 3.1 In `wirenboardDevice.ts`, skip controls listed in `skippedControls` before `findMapping` / endpoint creation; ensure no spurious warn for skipped controls.

## 4. Documentation and schema

- [x] 4.1 Update README **deviceOverrides** — только вложенный формат; явно указать **BREAKING** и пример миграции с плоского вида.
- [x] 4.2 Update `matterbridge-wirenboard-plugin.schema.json` description for `deviceOverrides` (nested `controls` / `name`).

## 5. Tests and quality

- [x] 5.1 Add unit tests for normalizer (nested `controls`, `skip`, `name`; отсутствие `controls`).
- [x] 5.2 Add or extend integration tests for registration with README-shaped config.
- [x] 5.3 Run `npm test` and `npm run lint`.

## 6. Main specs sync

- [x] 6.1 Merge this delta into `openspec/specs/configuration/spec.md` after implementation review (or use project sync workflow before archive).
