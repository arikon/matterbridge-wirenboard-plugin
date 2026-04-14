# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Setup dev environment (required after clone or matterbridge update)
npm ci --no-fund --no-audit
npm run dev:link          # npm link matterbridge from ../matterbridge (symlink)
npm run build             # compile TypeScript → dist/

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
```

## Architecture

Five source files:

| File                      | Role                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/module.ts`           | `WirenboardPlatform` — Matterbridge `DynamicPlatform` entry point. Handles lifecycle (`onStart`/`onConfigure`/`onShutdown`), MQTT event fan-out, device registration, whitelist/blacklist, `controlValueCache`, retained value replay.                       |
| `src/wirenboardMqtt.ts`   | `WirenboardMqtt` — MQTT client, topic parser, `EventEmitter`. Emits typed events: `device-meta`, `control-meta`, `control-value`, `control-error`, `device-removed`, `mqtt_connect`, `mqtt_disconnect`.                                                      |
| `src/wirenboardDevice.ts` | `WirenboardDevice` — builds `MatterbridgeEndpoint` objects from `WbDevice`. Static factory `WirenboardDevice.create()`. Owns `propertyMap` for per-endpoint control routing. Implements `updateFromMqtt()` (MQTT→Matter) and command handlers (Matter→MQTT). |
| `src/controlMapping.ts`   | Mapping table: WB control type + units → Matter device type + cluster IDs + value converters. `findMapping()` is the main lookup. Also exports CCT converters: `cctRangeToMireds`, `miredsToCtRange`.                                                        |
| `src/wirenboardTypes.ts`  | TypeScript interfaces: `WbDevice`, `WbControl`, `WbControlMeta`, `WbDeviceMeta`, `WbControlType`.                                                                                                                                                            |

### Key data flow

1. MQTT retained messages → `WirenboardMqtt` emits events → `WirenboardPlatform` populates `deviceMap`
2. `onStart`: waits for discovery idle/timeout → calls `WirenboardDevice.create()` per device → `registerDevice(endpoint)`
3. `onConfigure`: replays `controlValueCache` via `wbDev.updateFromMqtt()` to set initial Matter attributes
4. Live updates: `onControlValue` → `wbDev.updateFromMqtt(controlName, value)`
5. Matter commands → endpoint `addCommandHandler` → `mqtt.publish('/devices/.../controls/.../on', value)`

### Grouping modes

- `device` (default): one `MatterbridgeEndpoint` per WB device, child endpoints per control
- `control`: one `MatterbridgeEndpoint` per WB control

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

### Integration tests

`test/integration/` — requires a live MQTT broker. Not run in normal `npm test`.
