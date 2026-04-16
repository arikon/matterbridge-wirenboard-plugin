## ADDED Requirements

### Requirement: Shared implementation without duplicated business rules

The inventory CLI implementation SHALL **reuse** the plugin’s existing modules for MQTT, ordering, mapping, and device-override parsing (e.g. `WirenboardMqtt`, `findMapping`, `sortedControlsByCanonicalName`, `normalizeDeviceOverridesEntry`, and prefix / skip predicates as exposed from `src/`).

Where behavior today lives only inside the Matterbridge platform class or large methods, the codebase SHALL be **refactored** so that pure functions or small facades in `src/` are imported by **both** the platform and the CLI. The CLI SHALL **not** maintain a second copy of registration rules, mapping rules, or `deviceOverrides` parsing.

For whitelist/blacklist semantics compatible with Matterbridge **`validateDevice`**, the implementation SHALL use a **single** shared function (or module) covered by unit tests; that module MAY be used by the CLI without importing the full `matterbridge` runtime for inventory.

#### Scenario: Prefix skip uses shared predicate

- **WHEN** the CLI annotates whether a device is skipped for `ignoreSystemPrefixedDevices` or `ignoreNetworkPrefixedDevices`
- **THEN** the implementation SHALL call the same exported predicate (or refactored equivalent) used by the plugin’s registration path, not a reimplemented string check in the CLI file alone

#### Scenario: Device overrides use shared normalization

- **WHEN** the CLI resolves skips and type overrides from config
- **THEN** the implementation SHALL use `normalizeDeviceOverridesEntry` (or extracted shared core) as the plugin does

### Requirement: Installed CLI entrypoint

The system SHALL expose an executable command via the plugin npm package (`package.json` `bin` field) that runs the MQTT inventory tool without requiring a developer-only `npm run build` from a git checkout on the target machine (the published package SHALL ship the compiled CLI artifact). The published binary name SHALL be `mb-wirenboard-verify-mqtt`.

#### Scenario: User invokes global binary

- **WHEN** the user runs `mb-wirenboard-verify-mqtt` after installing the package (for example globally or via `npx`)
- **THEN** the process connects to MQTT using the resolved configuration (see below) and produces inventory output

### Requirement: Default MQTT settings from plugin config file

The CLI SHALL load Wiren Board MQTT connection defaults from a Matterbridge plugin configuration JSON file that uses the same `mqttHost`, `mqttPort`, `mqttProtocol`, `mqttUsername`, `mqttPassword`, `mqttCaPath`, `mqttCertPath`, and `mqttKeyPath` fields as documented for the plugin.

### Requirement: Standard Wiren Board config paths and `--config` override

When the user does not pass **`--config`**, the CLI SHALL probe a **fixed ordered list** of candidate file paths (standard locations on a Wiren Board controller) and SHALL load the **first** path that exists, is readable as a regular file, and contains valid JSON. The list SHALL be documented in `--help` and user-facing documentation. The candidate paths SHALL include at least:

1. `/root/.matterbridge/matterbridge-wirenboard-plugin.config.json`
2. The path `${HOME}/.matterbridge/matterbridge-wirenboard-plugin.config.json` where `${HOME}` is the current process home directory used for config resolution

The implementation MAY skip duplicate paths when they refer to the same file.

When the user passes **`--config <path>`**, the CLI SHALL load MQTT defaults **only** from that path (no search list). The long option name SHALL be **`--config`**.

#### Scenario: First matching standard path wins

- **WHEN** the user does not pass `--config` and the first candidate path in the ordered list exists and is readable JSON
- **THEN** the CLI SHALL load that file and SHALL NOT use a later candidate solely because it also exists

#### Scenario: Fallback to next standard path

- **WHEN** the user does not pass `--config` and an earlier candidate path does not exist or is not readable, and a later candidate path exists and is readable JSON
- **THEN** the CLI SHALL load the first later candidate that satisfies existence and readability

#### Scenario: No standard config file found

- **WHEN** the user does not pass `--config` and no candidate path in the ordered list yields a readable JSON file
- **THEN** the CLI SHALL not treat that as a fatal error by itself and SHALL use built-in MQTT fallback defaults per the configuration precedence requirement

#### Scenario: Explicit path via `--config`

- **WHEN** the user passes **`--config`** with a file path and that file exists and is valid JSON
- **THEN** the CLI SHALL read MQTT defaults from that file only and SHALL NOT apply the standard-path search for that run

#### Scenario: Missing or unreadable explicit `--config`

- **WHEN** the user passes **`--config`** and the file is missing, unreadable, or not valid JSON
- **THEN** the CLI SHALL fail with a non-zero exit code and an error message that includes the path

#### Scenario: Optional environment override for config path

- **WHEN** the user sets the documented environment variable for plugin config path (without `--config`, if such env is supported)
- **THEN** the CLI SHALL behave as specified in documentation for precedence between that variable and the standard-path list

### Requirement: Configuration precedence

The CLI SHALL resolve each MQTT connection parameter using this precedence (highest first): explicit CLI arguments for that parameter; documented environment variable overrides for MQTT fields; value from the plugin JSON config file selected by **`--config`** or by standard-path search; built-in fallback defaults consistent with the plugin when no file is loaded or a field is absent.

#### Scenario: CLI overrides file

- **WHEN** the plugin config file sets `mqttHost` to one value and the user passes a CLI option or environment variable that maps to host for this run
- **THEN** the CLI SHALL use the value from the CLI/environment, not from the file

### Requirement: Full MQTT inventory independent of list-style config

The CLI SHALL enumerate **all** devices and controls discovered from MQTT for the session. The presence of `devices`, `whiteList`, `blackList`, `deviceOverrides`, `ignoreSystemPrefixedDevices`, `ignoreNetworkPrefixedDevices`, or `includeHidden` in the loaded plugin config SHALL **not** cause devices or controls to be omitted from the inventory walk solely because of those keys.

#### Scenario: Whitelist does not hide devices from inventory

- **WHEN** the loaded config has a non-empty `whiteList` and MQTT reports devices not listed there
- **THEN** those devices SHALL still appear in the inventory output with annotations explaining whitelist impact on Matter exposure

### Requirement: Inventory semantics

The CLI SHALL discover devices and controls using the same MQTT subscription and parsing behavior as the plugin’s MQTT client, SHALL order controls with the same canonical ordering as the plugin, and SHALL indicate which controls have a Matter mapping via the same mapping resolution used at runtime (`findMapping`), taking into account `deviceOverrides` control type overrides where applicable (same as `WirenboardDevice`).

#### Scenario: Output lists device and control identifiers

- **WHEN** discovery completes successfully
- **THEN** the output SHALL include each Wiren Board device identifier and each control name under that device, with a per-control indication of whether a mapping exists (after overrides)

### Requirement: Plugin config enriches output (Matter exposure hints)

When a plugin configuration JSON object is loaded (full object, not only MQTT fields), the CLI SHALL compute and include **annotations** that explain how that configuration would interact with registration logic, without reducing MQTT coverage.

The CLI SHALL annotate **devices** for:

- Effects of **`ignoreSystemPrefixedDevices`** and **`ignoreNetworkPrefixedDevices`** (same skip rules as the plugin’s `shouldSkipMatterRegistration` / equivalent).
- Effects of **`whiteList`** and **`blackList`** using the same semantics as Matterbridge **`validateDevice`** when called with **`[deviceTitle, deviceSerial]`** as the plugin does, where **`deviceTitle`** resolves **`deviceOverrides.<id>.name`** (display name override) when present, otherwise the same title resolution as `registerWbDevice` (blacklist checked first; if whitelist is non-empty, at least one of the passed strings must be included).
- **`discoveryMode`** and **`devices`:** an informational marker whether the device id is listed in `devices` when `discoveryMode` is `static` (startup wait list), without implying that the CLI omitted other devices from inventory.
- **`groupingMode`:** a **session-level** annotation (summary block or header, not necessarily repeated on every control row) stating the effective value (`device` or `control`) and **what it means for Matter topology** (one bridged Matter device per Wiren Board device with child endpoints vs one bridged Matter device per WB control), consistent with the plugin’s behavior.

The CLI SHALL annotate **controls** for:

- **`deviceOverrides`:** whether the control is **skipped** (`skip: true`), has a **`deviceType`** override (resolved name or invalid/unresolved warning), and optional **display name** override at device level from normalized `deviceOverrides` (reuse `normalizeDeviceOverridesEntry` behavior).
- **`includeHidden`:** whether the control would be **excluded** from processing when `includeHidden` is `false` due to hidden metadata / the same hidden rules as `WirenboardDevice.create`, and that hidden controls are **included** when `includeHidden` is `true`.

When no plugin config file is loaded for annotations, the output SHALL still include inventory data and SHALL indicate that config-based annotations are absent or defaulted (documented field).

#### Scenario: groupingMode is visible when config is loaded

- **WHEN** the loaded plugin JSON includes **`groupingMode`** and annotations are enabled
- **THEN** the output SHALL surface that setting and SHALL explain its effect on how WB devices map to Matter bridged devices (at minimum in human-readable mode; in **`--json`**, a documented field such as `effectiveGroupingMode` or equivalent)

#### Scenario: Prefix flags appear on affected devices

- **WHEN** `ignoreSystemPrefixedDevices` is `true` and a device name would be skipped by the plugin for that reason
- **THEN** the output SHALL mark that device accordingly while still listing it in the inventory

#### Scenario: deviceOverrides skip and type override appear on controls

- **WHEN** `deviceOverrides` contains `controls.<name>.skip` or `controls.<name>.deviceType` for a discovered control
- **THEN** the output SHALL show those overrides and their effect on mapping / exposure

#### Scenario: includeHidden affects control annotation

- **WHEN** a control is hidden per plugin rules and `includeHidden` is `false`
- **THEN** the output SHALL indicate that the control would be filtered out unless `includeHidden` is enabled

#### Scenario: Blacklist blocks Matter exposure annotation

- **WHEN** the device serial or title matches `blackList` entries per `validateDevice` rules
- **THEN** the output SHALL indicate Matter registration would be blocked by blacklist while the device remains listed in MQTT inventory

### Requirement: Output formats

The CLI SHALL support a human-readable default output and a machine-readable JSON output mode selected by the long option **`--json`**.

### Requirement: Human-readable text layout and tag styling

In the default text mode (without **`--json`**), the CLI SHALL format output for **quick visual analysis**: clear sections (e.g. per device), a **session summary** where **`groupingMode`** fits (see plugin config enrichment), tabular or aligned columns for controls where practical, and **short tag labels** for annotation categories (such as hidden, overridden / device type override, skip, blacklist / whitelist block, system/network prefix skip, static `devices` membership, mappable vs unmappable).

The human-readable output SHOULD begin with a **Legend** (badge meanings) and SHOULD print the **effective annotation flags** used for that run (`includeHidden`, ignore-prefix toggles). For each device, the output SHOULD include a **single plain-language “matter” outcome line** (registration expectation) without duplicating the same skip reason in multiple redundant badges on one line; SHOULD include **per-device control counts** (total vs mappable vs unmappable); SHOULD explain when a **prefix-skipped** device still lists mappable controls (full MQTT inventory vs Matter registration); and SHOULD state clearly when a device has **no controls** in the inventory.

When tags are emitted, the CLI SHALL use **ANSI SGR styling** so that tags are visually distinct; **background colors** (with contrasting foreground) SHOULD be used for tag “badges” when color is enabled. Each annotation category SHOULD map to a **consistent** color/badge style documented in README (palette).

Color styling SHALL be **disabled** when the `NO_COLOR` environment variable is set (per common convention), when a documented **`--no-color`** (or equivalent) flag is passed, or when stdout is **not a TTY** (unless a documented force-color flag exists and is used).

#### Scenario: Default text output

- **WHEN** the user does not pass `--json`
- **THEN** the CLI SHALL print human-readable inventory output to stdout (not a JSON document as the sole format) with structured layout and, when colors are enabled, styled tags for annotation categories

#### Scenario: JSON mode via `--json`

- **WHEN** the user passes **`--json`**
- **THEN** the CLI SHALL print exactly one JSON document to stdout with **no ANSI escape sequences**, using a stable documented shape (devices array with nested controls, mappable/mapping data, and **config-derived annotations** as specified in the plugin config enrichment requirement)

#### Scenario: Plain text when color disabled

- **WHEN** `NO_COLOR` is set or **`--no-color`** is passed
- **THEN** the human-readable output SHALL not contain ANSI color or style codes (tags may appear as plain bracketed labels)

### Requirement: Operational help

The CLI SHALL provide `--help` (or equivalent) describing purpose, the **ordered standard Wiren Board config paths**, the **`--config <path>`** override, environment variables, the **`--json`** output flag, **`--no-color`** (or equivalent) and **`NO_COLOR`**, that **non-MQTT config keys annotate Matter exposure** (including **`groupingMode`**) without filtering MQTT inventory, and exit behavior on connection failure.

#### Scenario: Help lists config defaults

- **WHEN** the user requests help
- **THEN** the help text SHALL mention the standard-path search (including at least `/root/.matterbridge/…` and `$HOME/.matterbridge/…`) and the **`--config`** option

#### Scenario: Help documents `--json`

- **WHEN** the user requests help
- **THEN** the help text SHALL document the **`--json`** flag and its effect on stdout format

### Requirement: README documents the inventory CLI

The plugin **`README.md`** (project root of the npm package) SHALL include a dedicated subsection or clearly marked section that documents **`mb-wirenboard-verify-mqtt`**: what it is for (inventory and config-impact analysis for Wiren Board MQTT), how to run it after installing the package (global `bin`, `npx`, or `npm run` alias if applicable), **`--config`**, **`--json`**, default config path search order on the Wiren Board controller, MQTT override env vars, and that non-MQTT plugin config keys annotate output without filtering the MQTT walk.

### Requirement: README documents config annotation scope and authoring workflow

The same README section (or an immediately following subsection) SHALL:

1. **Scope:** list which plugin config keys **drive annotations** in this tool (including **`groupingMode`**, list-style filters, overrides, hidden, prefixes, static `devices` membership) and which keys are **not diagnosed in v1** (e.g. `failsafeCount`, `discoveryTimeout`, `discoveryIdleMs`, `unregisterOnShutdown`, `wirenboardUrl`) so users’ expectations are clear.

2. **Authoring workflow:** explain how to use **`--json`** output to **edit** the plugin config — e.g. copying **device ids** and **control names** into **`whiteList`** / **`blackList`**, and building **`deviceOverrides`** using the nested `controls` shape; reference the plugin JSON Schema (**`matterbridge-wirenboard-plugin.schema.json`**) for valid enums and structure.

3. Include at least **one minimal JSON fragment example** for **`whiteList` or `blackList`** (array of strings taken from printed ids) and **one skeleton** for **`deviceOverrides`** for a single device id (nested `controls` with `skip` and/or `deviceType` as applicable).

If the main README still describes **`discoveryMode: "static"`** in a way that contradicts actual registration behavior, that paragraph SHALL be **aligned** with `registerDiscoveredDevices` in the same documentation pass (so CLI users are not misled).

#### Scenario: README mentions the command name

- **WHEN** a reader opens the plugin `README.md`
- **THEN** they SHALL find the exact command name **`mb-wirenboard-verify-mqtt`** and a short explanation of its purpose

#### Scenario: README covers operational basics

- **WHEN** a reader follows the README section for this tool
- **THEN** they SHALL find enough information to connect to the broker using the plugin config file, to interpret **`--json`** output versus human-readable output, and to understand **tag colors / `--no-color` / `NO_COLOR`**

#### Scenario: README explains annotation scope vs non-annotated keys

- **WHEN** a reader wants to know what the CLI reflects from their config
- **THEN** they SHALL find an explicit distinction between keys that affect **CLI annotations** and keys that are **out of scope for v1 diagnostics**

#### Scenario: README supports config authoring from tool output

- **WHEN** a reader wants to build or adjust **`whiteList`**, **`blackList`**, or **`deviceOverrides`**
- **THEN** they SHALL find a short workflow and **concrete JSON fragment examples** as specified above
