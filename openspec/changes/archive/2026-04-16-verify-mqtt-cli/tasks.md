## 1. Refactor for reuse (before or alongside CLI)

- [x] 1.0 Extract **pure/shared helpers** from `module.ts` / related files for: prefix skip predicates, resolving display title for `validateDevice`, «has mappable control after skip/hidden» — **single implementation** imported by platform and CLI; adjust `module.ts` to call them (no behavior change intended).
- [x] 1.0b Add **`validateDeviceConfig`** (or similar) in `src/` matching Matterbridge `validateDevice` semantics; unit tests aligned with Matterbridge cases; use from CLI annotations (platform may keep calling `this.validateDevice` or optionally delegate — follow minimal diff).

## 2. CLI module and config resolution

- [x] 2.1 Add a compiled CLI entrypoint under `src/` (e.g. `mqttInventoryCli.ts`) that parses `--help`, **`--config <path>`**, `--json`, idle/max timing flags, and MQTT overrides; implements precedence (CLI/env/file/defaults); **default config resolution:** ordered standard WB paths (`/root/.matterbridge/…`, then `$HOME/.matterbridge/…`) until first readable JSON; on explicit **`--config`**, fail clearly if unreadable.
- [x] 2.2 Implement shared helpers to load MQTT options from plugin config JSON (subset of keys) and merge with `WirenboardMqttConfig`; optional env var for config path (document precedence vs `--config` and standard paths).
- [x] 2.3 Refactor logic from `scripts/real-mqtt-verify.mjs` into reusable code (imported by CLI) for device map accumulation, canonical sort, mappable counts, human and JSON serializers; **only** thin glue — core via existing `dist` modules; keep behavior equivalent.
- [x] 2.4 Implement **config annotation layer** using **only** shared helpers from 1.0 / `normalizeDeviceOverridesEntry` / `findMapping` / `validateDeviceConfig`; marker for `discoveryMode: static` + membership in `devices`; **session summary for `groupingMode`** (device vs control → Matter topology); merge into text and `--json` output.
- [x] 2.4b **Text renderer:** structured layout (sections/columns); **ANSI badge** helper with **background colors** per tag category; respect **`NO_COLOR`**, **`--no-color`**, non-TTY; **`--json`** path never emits ANSI; snapshot or unit tests for plain vs colored strings.
- [x] 2.5 Optional: one-line **exposure summary** per device using shared helpers aligned with `registerWbDevice` ordering (document in README).
- [x] 2.6 **Human UX pass:** legend + per-device control counts + single **matter:** explanation (no redundant prefix/exposure badges); note when prefix-skip but mappable controls listed; empty-device line; print effective annotation flags; README + `design.md`; unit test `formatHuman`.

## 3. Package wiring and scripts

- [x] 3.1 Add `bin` entry `mb-wirenboard-verify-mqtt` in `package.json` pointing to the compiled CLI; ensure `files` / publish layout includes `dist` paths needed for the binary.
- [x] 3.2 Add shebang-compatible output (build step or wrapper) so `node_modules/.bin` works on Unix; verify ESM `#!/usr/bin/env node` pattern matches project `type: module`.
- [x] 3.3 Update `verify:mqtt` npm script to invoke the new entrypoint (same behavior, no duplicate implementation in `scripts/` long-term — remove or thin `real-mqtt-verify.mjs` after extraction).

## 4. Tests and verification

- [x] 4.1 Add unit tests for config merge precedence, **`validateDeviceConfig`**, **annotation correctness** (reuse paths, **`groupingMode`** in JSON summary), and JSON output shape (fixtures: minimal plugin JSON + overrides).
- [x] 4.2 Run `npm run lint`, `npm test`, and `npm run build`; smoke-test CLI locally with `--help` and mock/no broker if applicable.

## 5. Documentation

- [x] 5.1 Add a **dedicated README section** for **`mb-wirenboard-verify-mqtt`** per spec (command name, purpose, run methods, `--config`, `--json`, **`--no-color` / `NO_COLOR`**, **tag color legend**, default config path order, MQTT env overrides, **`groupingMode` in summary**, **annotation scope vs v1 non-annotated keys**, **config authoring workflow** + **JSON fragment examples** + link to **`matterbridge-wirenboard-plugin.schema.json`**); link from table of contents or nearby if the README has one.
- [x] 5.3 If the main README **Static discovery** subsection contradicts `registerDiscoveredDevices` (only wait-list vs “expose only listed devices”), **rewrite** it to match code and cross-link the inventory CLI section.
- [x] 5.2 Update `AGENTS.md` developer notes: how `verify:mqtt` maps to the CLI, **shared modules**, and packaging expectations.
