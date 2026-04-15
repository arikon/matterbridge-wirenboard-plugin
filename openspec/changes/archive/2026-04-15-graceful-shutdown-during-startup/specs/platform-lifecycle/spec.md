## ADDED Requirements

### Requirement: Startup abort flag on shutdown signal

The system SHALL maintain an internal **startup abort** flag. The flag SHALL be set when **`onShutdown`** begins and when the process receives **SIGINT** or **SIGTERM** during normal runtime (not in Jest test environment).

When the flag is set due to **SIGINT** or **SIGTERM**, the system SHALL call **`mqtt.stop()`** (best-effort) so MQTT I/O does not block exit.

The system SHALL NOT register **SIGINT** / **SIGTERM** handlers when **`NODE_ENV`** is **`test`**, so Jest runs do not attach duplicate listeners and continue to use the mocked **`waiter`** from **`matterbridge/utils`**.

#### Scenario: Flag set at onShutdown start

- **WHEN** **`onShutdown`** is invoked
- **THEN** the startup abort flag is set before other shutdown work proceeds

#### Scenario: No signal handlers in test environment

- **WHEN** the platform is constructed with **`NODE_ENV=test`**
- **THEN** no **`process.on('SIGINT')`** or **`process.on('SIGTERM')`** handlers are registered for startup abort

### Requirement: Interruptible discovery and failsafe waits

Outside the Jest test environment, waits in **`onStart`** for **auto discovery idle**, **static device presence**, and **failsafe device count** SHALL poll the wait condition at a configurable interval and SHALL exit early with **false** when the startup abort flag becomes **true**, logging a warning that the wait was aborted.

In the Jest test environment, the implementation MAY delegate to **`matterbridge/utils` `waiter`** unchanged so existing mocks preserve fast test behavior.

#### Scenario: Discovery wait aborted by shutdown signal

- **WHEN** a shutdown signal sets the startup abort flag while **`onStart`** is still waiting for discovery idle
- **THEN** the wait ends without waiting the full discovery timeout (returns failure to proceed as if idle not reached, and registration may be skipped or shortened per implementation)

#### Scenario: Failsafe wait respects abort

- **WHEN** the startup abort flag is set during the failsafe wait
- **THEN** the wait stops without blocking for the full failsafe duration when using the interruptible path

### Requirement: Interruptible device and endpoint registration loops

During **`registerDiscoveredDevices`**, the system SHALL check the startup abort flag before each Wirenboard device and SHALL yield to the event loop between devices (e.g. **`setImmediate`**) so signal handling can run.

During **`registerWbDevice`**, after filter checks and before **`WirenboardDevice.create`**, and before each **`registerDevice`** call for an endpoint, the system SHALL check the startup abort flag and SHALL stop further registration for that device when the flag is set, logging a warning.

#### Scenario: Registration loop exits early on abort

- **WHEN** the startup abort flag is set before the next WB device is processed
- **THEN** remaining devices in the discovery list are not registered

#### Scenario: Endpoint loop exits early on abort

- **WHEN** the startup abort flag is set after some endpoints of a device were registered but before all endpoints are registered
- **THEN** no further **`registerDevice`** calls are made for that device

### Requirement: Long registerDevice call not cancellable from plugin

The plugin SHALL NOT claim to cancel an in-flight **`await registerDevice(endpoint)`** from Matterbridge. Documentation SHALL state that shutdown may wait until that promise settles.

#### Scenario: Documented limitation

- **WHEN** operators read project documentation for startup shutdown behavior
- **THEN** they are informed that a single long **`registerDevice`** may still delay exit until it completes

## MODIFIED Requirements

### Requirement: Failsafe count protection

The system SHALL refuse to register devices if `config.failsafeCount > 0` and fewer devices than `failsafeCount` are discovered, throwing an error to protect controller automations.

While waiting for enough devices, the wait SHALL be interruptible by the **startup abort** flag (see **Interruptible discovery and failsafe waits**). If the wait ends because of startup abort, the system SHALL NOT throw the failsafe error for that reason alone; registration SHALL stop per the abort path instead.

#### Scenario: Failsafe triggered after wait

- **WHEN** `failsafeCount` is 10 and only 3 devices are discovered and startup is not aborted during the wait
- **THEN** system waits up to 60 seconds for more devices, and if still below threshold, throws an error: `"Failsafe: only 3 devices found, failsafeCount=10"` (or equivalent including device count and failsafe value)

#### Scenario: Failsafe passed

- **WHEN** `failsafeCount` is 5 and 8 devices are discovered
- **THEN** registration proceeds normally
