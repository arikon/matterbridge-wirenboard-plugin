## MODIFIED Requirements

### Requirement: Human-readable text layout and tag styling

In the default text mode (without **`--json`**), the CLI SHALL format output for **quick visual analysis**: clear sections (e.g. per device), a **session summary** where **`groupingMode`** fits (see plugin config enrichment), tabular or aligned columns for controls where practical, and **short tag labels** for annotation categories (such as hidden, overridden / device type override, skip, blacklist / whitelist block, system/network prefix skip, static `devices` membership, mappable vs unmappable).

The human-readable output SHALL begin with a **Legend** that explains **every badge kind** emitted on control rows in that mode: **`mappable`**, **`unmappable`**, **`skip`**, **`override`**, and **`hidden`**, together with the existing **`matter:`** line semantics and **Full MQTT walk** note where printed. The output SHOULD print the **effective annotation flags** used for that run (`includeHidden`, ignore-prefix toggles). For each device, the output SHOULD include a **single plain-language “matter” outcome line** (registration expectation) without duplicating the same skip reason in multiple redundant badges on one line; SHOULD include **per-device control counts** (total vs mappable vs unmappable); SHOULD explain when a **prefix-skipped** device still lists mappable controls (full MQTT inventory vs Matter registration); and SHOULD state clearly when a device has **no controls** in the inventory.

Within each device section, the CLI SHALL pad control names so that the **first badge** on each control row starts at the same column (alignment by longest control name in that device).

For **`mappable`** and **`unmappable`** badges (including in the legend and in the per-device control-count line), the CLI SHALL render both with the **same inner text width**; the shorter label SHALL be **centered** with spaces inside the badge in plain (`[ … ]`) and ANSI modes.

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

#### Scenario: Legend lists control-line badge kinds

- **WHEN** the user runs the CLI in default human-readable mode
- **THEN** the Legend section SHALL describe the meanings of **`mappable`**, **`unmappable`**, **`skip`**, **`override`**, and **`hidden`** badges as used on control lines

#### Scenario: Control rows align first badge column within a device

- **WHEN** a device has more than one control in human-readable output
- **THEN** control names SHALL be padded so the first badge on each row begins in the same column for that device

#### Scenario: Mappable and unmappable share inner width with centered shorter label

- **WHEN** human-readable output prints **`mappable`** or **`unmappable`** badges (legend, control counts line, or control rows)
- **THEN** both badge kinds SHALL use the same inner text width and the shorter label SHALL be centered within that width in plain and ANSI modes
