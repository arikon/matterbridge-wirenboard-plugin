# Platform lifecycle

Purpose: Matterbridge DynamicPlatform lifecycle, discovery, registration, reachability, and retained value replay.

## Requirements

### Requirement: Matterbridge version verification

The system SHALL verify matterbridge version >= 3.7.0 in the constructor and throw an error immediately if the version is incompatible.

#### Scenario: Incompatible version

- **WHEN** matterbridge version is below 3.7.0
- **THEN** constructor throws an error with a message indicating the required version

### Requirement: MQTT connection in constructor

The system SHALL create and start the MQTT client in the constructor, subscribing to device events to begin accumulating retained messages before `onStart()`.

#### Scenario: Retained messages before onStart

- **WHEN** constructor completes and MQTT broker sends retained messages
- **THEN** device metadata and control values accumulate in `deviceMap` and `controlValueCache`

### Requirement: Idle-based auto discovery

In `discoveryMode: "auto"`, the system SHALL wait in `onStart()` until no new meta messages arrive for `discoveryIdleMs` (default 1000ms), with a hard timeout of `discoveryTimeout` seconds (default 30).

#### Scenario: Discovery completes on idle

- **WHEN** all retained messages arrive within 5 seconds and no new meta for 1000ms
- **THEN** discovery completes at ~6 seconds and proceeds to registration

#### Scenario: Discovery timeout with partial results

- **WHEN** meta messages keep arriving past `discoveryTimeout`
- **THEN** system logs a warning and proceeds to register devices found so far

#### Scenario: Discovery idle threshold

- **WHEN** `deviceMap.size > 0` AND `Date.now() - lastMetaTimestamp > discoveryIdleMs`
- **THEN** `isDiscoveryIdle()` returns `true` and discovery completes

### Requirement: Static discovery mode

In `discoveryMode: "static"`, the system SHALL wait for each device listed in `config.devices[]` to appear in `deviceMap` or until timeout.

#### Scenario: All static devices found

- **WHEN** config lists `["wb-mr6c_28", "wb-msw3"]` and both appear in `deviceMap`
- **THEN** discovery completes and registers only those devices

#### Scenario: Static device timeout

- **WHEN** config lists `["wb-mr6c_28", "wb-missing"]` and only "wb-mr6c_28" appears within `discoveryTimeout`
- **THEN** system logs warning for "wb-missing" and registers only "wb-mr6c_28"

### Requirement: Failsafe count protection

The system SHALL refuse to register devices if `config.failsafeCount > 0` and fewer devices than `failsafeCount` are discovered, throwing an error to protect controller automations.

#### Scenario: Failsafe triggered after wait

- **WHEN** `failsafeCount` is 10 and only 3 devices are discovered
- **THEN** system waits up to 60 seconds for more devices via `waiter()`, and if still below threshold, throws an error: `"Only 3 devices found, failsafeCount=10"`

#### Scenario: Failsafe passed

- **WHEN** `failsafeCount` is 5 and 8 devices are discovered
- **THEN** registration proceeds normally

### Requirement: Log warning for unsupported Matter device types

The system SHALL log a warning when registering devices with Matter device types not supported by all controllers (e.g., waterValve, pressureSensor, electricalSensor).

#### Scenario: Unsupported type warning

- **WHEN** system registers an endpoint of type `waterValve`
- **THEN** system logs warning indicating this device type may not be visible in Apple Home or other controllers

### Requirement: Device registration with whitelist/blacklist

The system SHALL filter devices through whitelist/blacklist before registration, using `setSelectDevice` and `validateDevice` from matterbridge API.

#### Scenario: Device in blacklist

- **WHEN** device "wb-mr6c_28" is in `config.blackList`
- **THEN** device is NOT registered

#### Scenario: Whitelist mode

- **WHEN** `config.whiteList` contains `["wb-mr6c_28"]`
- **THEN** only "wb-mr6c_28" is registered, all others skipped

### Requirement: Entity-level blacklisting

The system SHALL support blacklisting individual controls via `setSelectDeviceEntity` for per-control filtering in matterbridge UI.

#### Scenario: Control blacklisted

- **WHEN** user blacklists "Temperature" control of "wb-mr6c_28" in matterbridge UI
- **THEN** system registers the device without the Temperature endpoint

### Requirement: ConfigUrl on registered endpoints

The system SHALL set `endpoint.configUrl` to `http://<mqttHost>` on each registered endpoint to link to the Wirenboard web UI.

#### Scenario: ConfigUrl set

- **WHEN** `mqttHost` is `"192.168.1.100"`
- **THEN** each endpoint has `configUrl` = `"http://192.168.1.100"`

### Requirement: Retained value replay in onConfigure

The system SHALL replay all values from `controlValueCache` to Matter attributes in `onConfigure()`, applying them through `updateFromMqtt()`. This is the authoritative replay: it overrides any stale persisted attribute values that matter.js may have restored from storage when the server started (between `onStart` and `onConfigure`).

Note: `replayRetainedValues()` is NOT called in `onStart()` because the matter.js server starts asynchronously after `onStart()` returns — endpoints do not have node assignments yet and `setAttribute` would fail. The 30-second window between server start and `onConfigure()` is covered by `shouldConfigure = true` set at the end of `onStart()`, which routes incoming live MQTT updates directly to Matter attributes.

#### Scenario: Retained values applied in onConfigure

- **WHEN** `onConfigure()` is called and `controlValueCache` has 50 entries
- **THEN** all 50 values are applied to their corresponding Matter endpoints

### Requirement: Cover and color init in onConfigure

In `onConfigure()`, the system SHALL initialize coverDevice endpoints with `setWindowCoveringTargetAsCurrentAndStopped()` and extendedColorLight endpoints with `colorMode = CurrentHueAndCurrentSaturation`.

#### Scenario: Cover initialized

- **WHEN** `onConfigure()` runs and a coverDevice endpoint exists
- **THEN** system calls `setWindowCoveringTargetAsCurrentAndStopped()` on it

### Requirement: Live MQTT updates after device registration

`shouldConfigure` is set to `true` at the end of `onStart()` (after `registerDiscoveredDevices()` completes), so that incoming MQTT `control-value` events are applied directly to Matter attributes via `updateFromMqtt()` immediately after devices are registered — without waiting for `onConfigure()`. It is also set to `true` in `onConfigure()` for idempotency.

#### Scenario: Live update after onStart registration

- **WHEN** MQTT value `"0"` arrives for "Relay 1" after `onStart()` completes registration
- **THEN** system immediately updates Matter `OnOff.onOff` to `false`

### Requirement: Error flags → reachability management

The system SHALL manage endpoint reachability based on MQTT error flags: `r` or `rp` → `reachable=false`, empty → `reachable=true`. Write errors (`w`) and poll misses (`p`) SHALL only produce log messages.

#### Scenario: Read error makes endpoint unreachable

- **WHEN** control error topic receives `"r"`
- **THEN** system sets `BridgedDeviceBasicInformation.reachable = false` AND triggers `reachableChanged` event

#### Scenario: Error cleared restores reachability

- **WHEN** control error topic receives `""`
- **THEN** system sets `reachable = true` AND triggers `reachableChanged` event

#### Scenario: Write error only logged

- **WHEN** control error topic receives `"w"`
- **THEN** system logs warning (`log.warn`), does NOT change reachability

#### Scenario: Poll miss only logged at debug level

- **WHEN** control error topic receives `"p"`
- **THEN** system logs at debug level (`log.debug`), does NOT change reachability (poll miss is typically transient)

#### Scenario: All controls unreachable → device unreachable

- **WHEN** all controls of a device have `r` error flag
- **THEN** the root device endpoint is set to `reachable = false`

### Requirement: MQTT disconnect → all devices unreachable

The system SHALL set all registered devices to `reachable=false` on MQTT disconnect, and restore to `reachable=true` on reconnect.

#### Scenario: Disconnect unreachable

- **WHEN** MQTT connection drops
- **THEN** all registered endpoints have `reachable = false` with `reachableChanged` event

#### Scenario: Reconnect restores reachability

- **WHEN** MQTT reconnects
- **THEN** all registered endpoints have `reachable = true` with `reachableChanged` event

### Requirement: Dynamic device registration

In auto mode after `onStart()`, the system SHALL dynamically register new devices that appear via `device-meta` events.

#### Scenario: New device appears after startup

- **WHEN** a new WB device "wb-new" publishes meta after `onStart()` completed
- **THEN** system creates and registers a new Matter endpoint for it

### Requirement: Dynamic control-meta type change

After `onStart()`, the system SHALL handle `control-meta` events where a control's type has changed (e.g., wb-rules dynamic controls). The system SHALL unregister the old endpoint and re-create it with the new type.

#### Scenario: Control type changed dynamically

- **WHEN** control "Custom" of device "wb-rules" changes `meta.type` from `"switch"` to `"range"` after `onStart()`
- **THEN** system unregisters the old `onOffOutlet` endpoint and creates a new `dimmableLight` endpoint for this control

### Requirement: Device removal on empty retained

The system SHALL unregister a Matter device when its MQTT retained payload becomes empty (device-removed event).

#### Scenario: Device removed

- **WHEN** `device-removed` event fires for "wb-old" which was registered
- **THEN** system calls `unregisterDevice()` for that endpoint

### Requirement: Graceful shutdown

In `onShutdown()`, the system SHALL first call `super.onShutdown()` to finalize Matter context, then `mqtt.stop()`. If `config.unregisterOnShutdown` is true, it SHALL also unregister all devices.

#### Scenario: Normal shutdown

- **WHEN** `onShutdown()` is called
- **THEN** system calls `super.onShutdown()` first, then `mqtt.stop()`

#### Scenario: Shutdown with unregister

- **WHEN** `onShutdown()` is called and `config.unregisterOnShutdown` is `true`
- **THEN** system also calls `unregisterAllDevices()`

### Requirement: Reachability event pattern

The system SHALL both set the `reachable` attribute AND trigger the `reachableChanged` event when changing reachability, but only if the endpoint is registered (`endpoint.maybeNumber !== undefined`).

#### Scenario: Reachability change on registered endpoint

- **WHEN** reachability changes and `endpoint.maybeNumber !== undefined`
- **THEN** system calls `setAttribute(BridgedDeviceBasicInformation, 'reachable', value)` AND `triggerEvent(BridgedDeviceBasicInformation, 'reachableChanged', {reachableNewValue: value})`

#### Scenario: Skip unregistered endpoint

- **WHEN** reachability changes but `endpoint.maybeNumber === undefined`
- **THEN** system does NOT attempt to set attribute or trigger event
