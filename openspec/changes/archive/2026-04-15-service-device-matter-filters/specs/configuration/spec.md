## ADDED Requirements

### Requirement: Config option `ignoreNetworkPrefixedDevices`

The system SHALL expose `ignoreNetworkPrefixedDevices` (boolean, default **`true`** when omitted).

When **`true`**, WB device names that start with the ASCII prefix `network` (case-sensitive) SHALL NOT be registered as Matter bridged devices (no Matter endpoints for those devices).

When **`false`**, such devices SHALL be registered like any other device that passes remaining filters and mapping rules.

This rule SHALL be independent of `ignoreSystemPrefixedDevices`: the plugin SHALL evaluate both options according to their respective rules (a device MAY be skipped by either rule).

#### Scenario: Default excludes network-prefixed devices

- **WHEN** `ignoreNetworkPrefixedDevices` is omitted or `true` and a discovered device name starts with `network`
- **THEN** the plugin SHALL NOT register Matter endpoints for that device

#### Scenario: Opt-in bridging for network-prefixed devices

- **WHEN** `ignoreNetworkPrefixedDevices` is `false` and a device name starts with `network`
- **THEN** the plugin SHALL allow normal registration for that device if other requirements are satisfied

#### Scenario: Read at registration

- **WHEN** devices are registered
- **THEN** the effective value of `ignoreNetworkPrefixedDevices` SHALL be read from platform config and applied on the Matter registration path

#### Scenario: Prefix matches networks driver style ids

- **WHEN** the device name is `networks` or `networks_abc` or any string starting with `network`
- **THEN** the device SHALL be treated as network-prefixed for this requirement

#### Scenario: system\_\_ without leading network

- **WHEN** the device name starts with `system__` but not with `network`
- **THEN** exclusion for that name SHALL follow `ignoreSystemPrefixedDevices` only; `ignoreNetworkPrefixedDevices` SHALL NOT apply based on the `network` prefix rule alone
