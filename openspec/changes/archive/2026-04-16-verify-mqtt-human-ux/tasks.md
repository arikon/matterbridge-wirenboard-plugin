## 1. Badge formatting (`badges.ts`)

- [x] 1.1 Fix inner width for `mappable` / `unmappable` and center the shorter label (`centerInFixedWidth`).

## 2. Human report (`formatHuman.ts`)

- [x] 2.1 Pad control names per device to align the first badge column (`maxControlNameWidth`, `controlLine`).
- [x] 2.2 Extend `printLegend` with `skip`, `override`, and `hidden` using `formatBadge`.

## 3. Tests

- [x] 3.1 Update `test/formatHuman.test.ts` for legend lines, aligned rows, and padded `[ mappable ]` text.

## 4. Spec sync

- [x] 4.1 Add OpenSpec change `verify-mqtt-human-ux` with proposal, design, delta spec, and tasks (this document).
- [x] 4.2 Merge delta into `openspec/specs/mb-wirenboard-verify-mqtt/spec.md` (human layout requirement + scenarios).
