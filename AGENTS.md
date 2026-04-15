# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Commands

`matterbridge` **не** входит в `package.json`: типы и модули берутся через **`npm link`** (как в [matterbridge-plugin-template](https://github.com/Luligu/matterbridge-plugin-template)). Без линка `npm run build` / тесты не найдут `matterbridge`.

```bash
# Setup dev environment (required after clone or matterbridge update)
npm ci --no-fund --no-audit
npm run dev:link          # npm link matterbridge — нужен установленный глобально/рядом пакет matterbridge (см. README)
npm run build             # compile TypeScript → dist/; regenerate matterbridge-wirenboard-plugin.schema.json ($defs.matterDeviceTypeEnum.enum from CONTROL_MAPPINGS)

# Development
npm run watch             # tsc --watch
npm run cleanBuild        # clean dist/ + build

# Tests
npm test                  # run all tests
npm run test:watch        # watch mode
npm run test:verbose      # verbose output
npm run test:typecheck    # type-check test files without emit

# Run a single test file
npm test -- test/controlMapping.test.ts

# Live MQTT smoke (build first; uses WB_MQTT_* env, default host 192.168.55.15)
npm run build && npm run verify:mqtt

# Lint (ESLint on the whole tree; exits non-zero if any warning — --max-warnings=0)
npm run lint
```

## Engineering principles

When changing this codebase, prefer:

- **SOLID** — Single responsibility (e.g. pure predicates vs logging vs MQTT); keep interfaces small; depend on abstractions where it already pays off; avoid god objects.
- **KISS** — Simplest change that fixes the issue; avoid speculative generalization.
- **YAGNI** — Do not add features, config knobs, or abstractions until there is a concrete need.
- **DRY** — Reuse existing helpers and patterns; duplicate only when abstraction would obscure intent.
- **Separation of concerns** — Configuration and rules in one place; I/O (`log`, MQTT, Matter registration) at boundaries; pure functions for decisions when practical (see `shouldSkipMatterRegistration` / `applies*PrefixedSkip` in `module.ts`).
- **Focused diffs** — Touch only what the task requires; no drive-by refactors or unrelated formatting.
- **Tests** — Add or extend tests for new behavior; keep mocks in sync when imports from `matterbridge` change (see [Testing](#testing)).

These align with project conventions and keep reviews small and safe.

## OpenSpec

Spec-driven requirements live under **`openspec/`** in this repo:

- **`openspec/specs/<capability>/spec.md`** — canonical capability specs (e.g. `configuration`, `control-mapping`).
- **`openspec/changes/archive/`** — archived change folders (proposal, design, tasks, delta specs).

Run the **`openspec`** CLI from the **repository root** (the directory that contains `openspec/`). Typical commands:

```bash
openspec list --json
openspec status --change "<change-name>" --json
openspec instructions apply --change "<change-name>" --json
```

Use **`--help`** on subcommands for options. After moving or cloning, ensure the shell’s current directory is this project so paths resolve correctly.

## Architecture

Core source files:

| File                           | Role                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/module.ts`                | `WirenboardPlatform` — Matterbridge `DynamicPlatform` entry point. Handles lifecycle (`onStart`/`onConfigure`/`onShutdown`), MQTT event fan-out, device registration, whitelist/blacklist, `controlValueCache`, retained value replay.                                                    |
| `src/wirenboardMqtt.ts`        | `WirenboardMqtt` — MQTT client, topic parser, `EventEmitter`. Emits typed events: `device-meta`, `control-meta`, `control-value`, `control-error`, `device-removed`, `mqtt_connect`, `mqtt_disconnect`.                                                                                   |
| `src/wirenboardDevice.ts`      | `WirenboardDevice` — builds `MatterbridgeEndpoint` objects from `WbDevice`. Static factory `WirenboardDevice.create()`. Owns `propertyMap` for per-endpoint control routing. Implements `updateFromMqtt()` (MQTT→Matter) and command handlers (Matter→MQTT).                              |
| `src/systemMetadataMapping.ts` | WB device id **`system`** (controller) only: maps readonly `text` controls (e.g. Short SN, Batch No) to **Bridged Device Basic Information** attributes via `extractSystemControllerMetadata()` / `applyControllerBridgedBiSnapshot()`. Other devices use legacy Serial/FW/HW hints only. |
| `src/controlMapping.ts`        | Mapping table: WB type + units → Matter device + clusters + converters; `findMapping()`. CCT helpers. WB-MAP: extra electrical `units` (see README); `deg` → `rmsCurrent` proxy; THD `%` (name keywords) → `rmsPower` proxy.                                                              |
| `src/wirenboardTypes.ts`       | TypeScript interfaces: `WbDevice`, `WbControl`, `WbControlMeta`, `WbDeviceMeta`, `WbControlType`.                                                                                                                                                                                         |

### Key data flow

1. MQTT retained messages → `WirenboardMqtt` emits events → `WirenboardPlatform` populates `deviceMap`
2. `onStart`: waits for discovery idle/timeout → calls `WirenboardDevice.create()` per device → `registerDevice(endpoint)`
3. `onConfigure`: replays `controlValueCache` via `wbDev.updateFromMqtt()` to set initial Matter attributes
4. Live updates: `onControlValue` → `wbDev.updateFromMqtt(controlName, value)`
5. Matter commands → endpoint `addCommandHandler` → `mqtt.publish('/devices/.../controls/.../on', value)`

### Grouping modes

- `device` (default): one `MatterbridgeEndpoint` per WB device, child endpoints per control
- `control`: one `MatterbridgeEndpoint` per WB control

### `ignoreSystemPrefixedDevices` (default `true`)

When **true**, Wirenboard service devices (MQTT device id prefix `system__`, e.g. `system__networks__…`) are **not** registered as Matter bridged devices. When **false**, they are bridged like any other device.

If you set **`false`** and a `system__*` device is bridged but some controls have no mapping, those skips use a dedicated line (`System device <id>: skipping unmappable control …`) at **warn**. Non-system devices always use `Skipping control … no mapping` at **warn**.

### `ignoreNetworkPrefixedDevices` (default `true`)

When **true**, WB device ids that start with the prefix **`network`** (case-sensitive; covers e.g. `networks`) are **not** registered as Matter bridged devices. When **false**, they follow normal registration. This is **independent** of `ignoreSystemPrefixedDevices` (a device may be excluded by either rule).

### Composite detection in `wirenboardDevice.ts`

**Thermostat**: detected when device has `temperature`(readonly) + `setpoint`/`target`(range) controls → single `thermostatDevice` endpoint.

**Composite lighting** (CCT/dimmable): structural detection by control name suffix matching. For each writable `switch "X"`:

- `"X Brightness"` exists → dimmable composite
- - `"X Temperature"` → `colorTemperatureLight`
- - `"X Hue"` + `"X Saturation"` → `extendedColorLight`

`lightingConsumed` set tracks which controls were absorbed into composites and skips them in normal per-control processing.

### `primaryClusterId` in mappings

`WbToMatterMapping.primaryClusterId` overrides `matterClusterIds[0]` when the Matter attribute lives on a non-first cluster. Range/dimmer: `primaryClusterId = LevelControl.Cluster.id`. RGB: `primaryClusterId = ColorControl.Cluster.id`. Used in `buildDeviceGrouping` and `buildControlGrouping`.

## Testing

Tests use `jest.unstable_mockModule` (ESM-compatible). All `matterbridge` imports are replaced before modules load — this is why the Jest config needs **no** custom `moduleNameMapper` for `matterbridge/*` paths.

### Mock completeness rule

The mock objects in `jest.unstable_mockModule('matterbridge', ...)` and `jest.unstable_mockModule('matterbridge/matter/clusters', ...)` must export **every named export** that source files import. Missing exports cause runtime `undefined` errors at test time, not compile errors. When adding new imports from `matterbridge` to source files, add matching entries to mocks in all affected test files.

Current required exports by test file:

- `test/wirenboardDevice.test.ts`: `matterbridge` mock needs all device types including `colorTemperatureLight`; `matterbridge/matter/clusters` mock needs `ColorControl`
- `test/module.test.ts`: same `matterbridge` mock shape

### Mock shape pattern

```ts
const makeDeviceType = (name: string, code: number) => ({ name, code });
const makeCluster = (name: string, id: number) => ({
  Cluster: { id },
  // add feature-specific fields as needed
});
```

### Dev environment note

`matterbridge` v3.7.3+ uses a monorepo structure: `dist/export.js` is a stub that re-exports from `@matterbridge/core`, which exists only in matterbridge's own `node_modules`. Running `npm run dev:link` creates the correct symlink so the real package resolves. The Jest mock intercepts `matterbridge` before `@matterbridge/core` is ever loaded, so no transitive resolution is needed in tests.

### Matter endpoint order (stability)

Endpoint numbering does not depend on the order in which controls arrive into the in-memory `Map` from MQTT. Sorting is defined in `src/canonicalOrdering.ts` using a stable, locale-aware rule (`en`, numeric). Per Wiren Board device: thermostat detection and lighting-composite grouping behave as before; remaining mappable controls and lighting composites are ordered by control name; when several devices are registered, their registration order follows sorted device names. After upgrading this plugin, a Matter controller may report endpoint numbers that differ from those produced by an older plugin version; that mismatch is an expected consequence of adopting deterministic ordering.

### Integration tests

`test/integration/` uses an in-process **aedes** MQTT broker (see `mqtt-integration.test.ts`); no external broker is required. Jest does **not** exclude this folder — these tests run as part of the default `npm test`.
