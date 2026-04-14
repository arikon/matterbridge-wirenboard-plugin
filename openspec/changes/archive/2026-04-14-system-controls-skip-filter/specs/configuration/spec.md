## ADDED Requirements

### Requirement: Config option `ignoreSystemControls`

The platform SHALL expose a boolean configuration option named **`ignoreSystemControls`** for the Wirenboard MQTT plugin, defaulting to **`true`** when the key is omitted.

#### Scenario: Default configuration (omit or true)

- **WHEN** `ignoreSystemControls` is omitted or set to `true`
- **THEN** for a **system device** (see below), a control skipped due to missing mapping SHALL be logged at **debug** only; for a non-system device, logging SHALL remain at **warn** (existing behavior for non-system).

#### Scenario: Legacy verbose logging

- **WHEN** `ignoreSystemControls` is set to `false`
- **THEN** logging for a control skipped due to missing mapping SHALL use **warn** for **all** devices, including system devices.

#### Scenario: Read at registration

- **WHEN** devices are registered
- **THEN** the effective value of `ignoreSystemControls` SHALL be read once per run (or per platform config load) and applied on the unmappable-control skip path.

### Requirement: Distinct message text for system devices

For a **system device**, the log line for an unmappable control SHALL state that a **system device** is involved and that the control is **skipped** (e.g. a prefix like `System device <name>: skipping unmappable control …`), not the generic non-system wording `Skipping control <device>/<control>: no mapping for …`.

#### Scenario: Non-system wording unchanged

- **WHEN** the device is not a system device and a control has no mapping
- **THEN** the message SHALL remain in the form `Skipping control … no mapping for type …` at **warn**.

#### Scenario: System device wording

- **WHEN** the device is a system device and a control has no mapping
- **THEN** the message SHALL use the system-specific template (system device + skipped unmappable control), at **debug** or **warn** per `ignoreSystemControls`.

### Requirement: System device identification

The plugin SHALL treat a Wirenboard device as a **system device** for this rule if its device name starts with the prefix `system__` (ASCII, case-sensitive).

#### Scenario: System device name

- **WHEN** the device name is `system__networks__c3e38405-9c17-4155-ad70-664311b49066` or any string starting with `system__`
- **THEN** the device SHALL be classified as a system device for the skip-logging rule.

#### Scenario: Non-system device name

- **WHEN** the device name does not start with `system__`
- **THEN** the device SHALL NOT be classified as a system device for this rule.

### Requirement: Log level when skipping unmapped controls on system devices

When **`ignoreSystemControls`** is **true** and a control on a **system device** is skipped because no mapping exists, the plugin SHALL emit the skip message at **debug** level only (not **info** or **warn**).

#### Scenario: Quiet skip on system device with ignore enabled

- **WHEN** `ignoreSystemControls` is `true`, the device is a system device, and a control has no mapping
- **THEN** the message describing the skipped control SHALL be logged with **debug** severity only.

#### Scenario: Unchanged verbosity for non-system devices

- **WHEN** the device is not a system device
- **THEN** the skip message SHALL use **warn** severity regardless of `ignoreSystemControls`.

### Requirement: Skip message severity for unmappable controls

For the unmappable-control skip message, the plugin SHALL use **`log.debug`** or **`log.warn`** only (never **`log.info`**) — i.e. observable severity is **debug** or **warn**, matching the rules above (system + `ignoreSystemControls` → **debug** or **warn**; non-system → **warn**).

#### Scenario: No info for this skip message

- **WHEN** a control is skipped due to missing mapping on this code path
- **THEN** the implementation SHALL call **`log.debug`** or **`log.warn`**, not **`log.info`**, for that message.
