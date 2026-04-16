## Why

Human output of `mb-wirenboard-verify-mqtt` is the main SSH-friendly view of inventory. Ragged columns and a legend that only explained part of the badges made scanning harder and forced users to guess what `skip` / `override` / `hidden` meant.

## What Changes

- Per-device **alignment** of control names so the first badge column lines up within each device block.
- **Equal-width** `mappable` / `unmappable` badges with the shorter label **centered** inside the fixed width (plain `[ … ]` and ANSI).
- **Legend** extended to document every badge kind that appears on control rows (`skip`, `override`, `hidden`, plus `mappable` / `unmappable`), alongside existing `matter:` / MQTT walk context.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `mb-wirenboard-verify-mqtt`: human-readable layout, legend completeness, and badge formatting requirements updated to match the implemented UX.

## Impact

- Code: `src/mqttInventory/formatHuman.ts`, `src/mqttInventory/badges.ts`, tests under `test/formatHuman.test.ts`.
- JSON inventory schema and `--json` output: unchanged.
- User-visible: text-mode CLI and any scripts that parse fixed strings may need to account for padded `[ mappable ]` and aligned columns.
