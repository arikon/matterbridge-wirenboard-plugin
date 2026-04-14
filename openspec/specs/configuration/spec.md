# Configuration

Purpose: Plugin JSON config and Matterbridge UI schema for the Wirenboard MQTT bridge.

## Requirements

### Requirement: MQTT connection configuration

The system SHALL support configuration of MQTT connection via: `mqttHost` (string, default "localhost"), `mqttPort` (number, default 1883), `mqttUsername` (string, optional), `mqttPassword` (string, optional), `mqttProtocol` (enum: mqtt/mqtts/ws/wss, default "mqtt").

#### Scenario: Minimal config

- **WHEN** only `mqttHost` is provided
- **THEN** system connects to `mqtt://<mqttHost>:1883` without authentication

#### Scenario: Full TLS config

- **WHEN** `mqttProtocol: "mqtts"`, `mqttCaPath`, `mqttCertPath`, `mqttKeyPath` are provided
- **THEN** system connects with TLS using specified certificates

### Requirement: TLS certificate paths

The system SHALL support optional TLS certificate paths: `mqttCaPath`, `mqttCertPath`, `mqttKeyPath` (all strings). These SHALL be used only when protocol is `mqtts` or `wss`.

#### Scenario: Certificates ignored for plain MQTT

- **WHEN** `mqttProtocol: "mqtt"` and certificate paths are provided
- **THEN** system ignores certificate paths

### Requirement: Discovery mode configuration

The system SHALL support `discoveryMode` (enum: "auto"/"static", default "auto"), `discoveryTimeout` (number, seconds, default 30), `discoveryIdleMs` (number, milliseconds, default 1000).

#### Scenario: Auto discovery with custom timeout

- **WHEN** `discoveryMode: "auto"`, `discoveryTimeout: 60`, `discoveryIdleMs: 2000`
- **THEN** system waits up to 60 seconds for discovery, considers idle after 2 seconds of silence

#### Scenario: Static discovery

- **WHEN** `discoveryMode: "static"` and `devices: ["wb-mr6c_28"]`
- **THEN** system waits only for the listed device

### Requirement: Grouping mode configuration

The system SHALL support `groupingMode` (enum: "device"/"control", default "device") controlling how WB devices map to Matter endpoints.

#### Scenario: Device mode default

- **WHEN** `groupingMode` is not specified
- **THEN** system uses "device" mode (one Matter device per WB device)

### Requirement: Static device list configuration

The system SHALL support `devices` (string array, default []) listing WB device names for static discovery mode. When `discoveryMode: "static"`, only devices in this list SHALL be waited for and registered.

#### Scenario: Static device list

- **WHEN** `discoveryMode: "static"` and `devices: ["wb-mr6c_28", "wb-msw3"]`
- **THEN** system waits only for these two devices during discovery

### Requirement: Device filtering configuration

The system SHALL support `whiteList` (string array), `blackList` (string array) for device-level filtering, and `failsafeCount` (number, default 0) for minimum device protection.

#### Scenario: Whitelist filtering

- **WHEN** `whiteList: ["wb-mr6c_28"]`
- **THEN** only "wb-mr6c_28" is registered

#### Scenario: Failsafe disabled

- **WHEN** `failsafeCount: 0`
- **THEN** any number of discovered devices (including 0) is accepted

### Requirement: Hidden controls configuration

The system SHALL support `includeHidden` (boolean, default false) controlling whether controls with `meta.hidden: true` are processed.

#### Scenario: Include hidden enabled

- **WHEN** `includeHidden: true`
- **THEN** system processes controls with `meta.hidden: true`

### Requirement: Config option `ignoreSystemControls`

The system SHALL expose `ignoreSystemControls` (boolean, default **`true`** when omitted). For WB device names starting with `system__`, when a control has no mapping the skip message SHALL use **debug** if this option is **true**, and **warn** if **false**. Non-system devices SHALL always use **warn** on this path regardless of the option.

For **system devices**, the message text SHALL identify the device as a system device and the skipped unmappable control (not the same template as for non-system devices). Non-system devices keep the `Skipping control … no mapping for …` form.

#### Scenario: Default quiets system-device skip logs

- **WHEN** `ignoreSystemControls` is omitted or `true`, the device name starts with `system__`, and a control has no mapping
- **THEN** the skip message SHALL be logged at **debug** only

#### Scenario: Legacy verbosity for system devices

- **WHEN** `ignoreSystemControls` is `false` and the device name starts with `system__`
- **THEN** the skip message SHALL use **warn**, with the system-specific message template

#### Scenario: Read at registration

- **WHEN** devices are registered
- **THEN** the effective value of `ignoreSystemControls` SHALL be read from platform config and applied on the unmappable-control skip path

#### Scenario: Non-system wording unchanged

- **WHEN** the device is not a system device and a control has no mapping
- **THEN** the message SHALL remain in the form `Skipping control … no mapping for type …` at **warn**

#### Scenario: System device wording

- **WHEN** the device is a system device and a control has no mapping
- **THEN** the message SHALL use the system-specific template (system device + skipped unmappable control), at **debug** or **warn** per `ignoreSystemControls`

### Requirement: System device identification

The plugin SHALL treat a Wirenboard device as a **system device** for this rule if its device name starts with the prefix `system__` (ASCII, case-sensitive).

#### Scenario: System device name

- **WHEN** the device name is `system__networks__c3e38405-9c17-4155-ad70-664311b49066` or any string starting with `system__`
- **THEN** the device SHALL be classified as a system device for the skip-logging rule

#### Scenario: Non-system device name

- **WHEN** the device name does not start with `system__`
- **THEN** the device SHALL NOT be classified as a system device for this rule

### Requirement: Skip message severity for unmappable controls

For the unmappable-control skip message, the plugin SHALL use **`log.debug`** or **`log.warn`** only (never **`log.info`**) — observable severity is **debug** or **warn**, matching the rules above.

#### Scenario: No info for this skip message

- **WHEN** a control is skipped due to missing mapping on this code path
- **THEN** the implementation SHALL call **`log.debug`** or **`log.warn`**, not **`log.info`**, for that message

### Requirement: Device overrides configuration

The system SHALL support `deviceOverrides` (object) for per-device/per-control mapping overrides with structure: `{ "<deviceName>": { "controls": { "<controlName>": { "deviceType": "<matterType>", "skip": boolean } } } }`.

#### Scenario: Override control type

- **WHEN** `deviceOverrides` sets "Relay 1" of "wb-mr6c_28" to `deviceType: "onOffLight"`
- **THEN** system maps that control to `onOffLight` instead of default `onOffOutlet`

#### Scenario: Skip specific control

- **WHEN** `deviceOverrides` sets "Temperature" of "wb-mr6c_28" to `skip: true`
- **THEN** system skips that control, no endpoint created

### Requirement: Operational flags configuration

The system SHALL support `debug` (boolean, default false) for verbose logging and `unregisterOnShutdown` (boolean, default false) for cleanup on shutdown.

#### Scenario: Debug enabled

- **WHEN** `debug: true`
- **THEN** system outputs additional diagnostic logs

### Requirement: JSON Schema for matterbridge UI

The system SHALL provide a JSON Schema file (`matterbridge-wirenboard-plugin.schema.json`) describing all configuration parameters with types, defaults, descriptions, and enum values for rendering in matterbridge configuration UI.

#### Scenario: Schema covers all fields

- **WHEN** matterbridge loads the schema
- **THEN** all configuration parameters are represented with correct types, descriptions, and defaults

### Requirement: Plugin metadata

The system SHALL declare itself as `type: "DynamicPlatform"` in config with `name: "matterbridge-wirenboard-plugin"`.

#### Scenario: Plugin type

- **WHEN** matterbridge reads plugin config
- **THEN** it recognizes the plugin as a DynamicPlatform
