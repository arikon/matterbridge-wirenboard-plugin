## ADDED Requirements

### Requirement: Device mode grouping — one WB device to one Matter device
The system SHALL create one Matter bridged device per WB device in `groupingMode: 'device'`, with each mappable control as a child endpoint.

#### Scenario: Multi-control device
- **WHEN** WB device "wb-mr6c_28" has 6 relay controls (all type `switch`)
- **THEN** system creates one `MatterbridgeEndpoint` with `BridgedDeviceBasicInformation` and 6 child endpoints of type `onOffOutlet`

#### Scenario: Mixed control types
- **WHEN** WB device has controls: switch "Relay 1", value+degC "Temperature", value+% "Humidity"
- **THEN** system creates one bridged device with 3 child endpoints: onOffOutlet, temperatureSensor, humiditySensor

#### Scenario: No mappable controls
- **WHEN** WB device has only `text` type controls
- **THEN** system does NOT register the device and logs info message

### Requirement: Control mode grouping — one WB control to one Matter device
The system SHALL create one Matter bridged device per WB control in `groupingMode: 'control'`.

#### Scenario: Control mode naming
- **WHEN** WB device "wb-mr6c_28" (title "WB-MR6C") has control "Relay 1"
- **THEN** system creates a bridged device with name `"WB-MR6C - Relay 1"` and serial `"wb-mr6c_28_Relay 1"`

### Requirement: Semantic tags for same-type child endpoints
In `device` grouping mode, the system SHALL assign semantic tags to all child endpoints of the same Matter device type using Matter Common Number namespace (id=7) with sequential tag value (1, 2, 3, ...). The tagList MUST never be empty — Matter spec constraint `"1 to 6"` on `Descriptor.tagList` (feature TAGLIST) requires at least one entry; an empty tagList causes matter.js transaction rollback.

#### Scenario: Six relays get sequential tags
- **WHEN** WB device has 6 switch controls all mapping to `onOffOutlet`
- **THEN** child endpoints receive tags `{ namespaceId: 7, tag: 1 }` through `{ namespaceId: 7, tag: 6 }`

#### Scenario: More than 16 same-type endpoints — same scheme
- **WHEN** WB device has 20 switch controls all mapping to `onOffOutlet`
- **THEN** all 20 endpoints receive `{ namespaceId: 7, tag: 1 }` through `{ namespaceId: 7, tag: 20 }` (no artificial limit at 16)

### Requirement: Child endpoints built before registration
The system SHALL build the complete child endpoint hierarchy BEFORE calling `registerDevice()`.

#### Scenario: Endpoint tree complete before register
- **WHEN** WB device with 3 controls is being registered
- **THEN** all 3 child endpoints are added to the root endpoint before `registerDevice()` is called

### Requirement: Command handlers for writable controls
The system SHALL register Matter command handlers (on, off, toggle, moveToLevel, moveToHue, moveToSaturation, etc.) for non-readonly controls that publish values to MQTT via `mqtt.publish(deviceName, controlName, value)`.

#### Scenario: Switch on command
- **WHEN** Matter controller sends `on` command to a switch endpoint
- **THEN** system publishes `"1"` to `/devices/<name>/controls/<ctrl>/on`

#### Scenario: Level control command (WB `range` → dimmableLight)
- **WHEN** Matter controller sends `moveToLevel(127)` to a dimmable light endpoint that maps a WB **`range`** control (non-cover fallback: dimmableLight + `LevelControl`), with `meta.min: 0`, `meta.max: 255` (mapping defaults)
- **THEN** system reverse-converts with `levelControlToRange(127, 0, 255)` and publishes the resulting string (e.g. `"127"` for this level) to `/devices/<device>/controls/<ctrl>/on`

#### Scenario: Level control command (WB `dimmer` → dimmableLight)
- **WHEN** Matter controller sends `moveToLevel(127)` to a dimmable light endpoint that maps a WB **`dimmer`** control, with `meta.min: 0`, `meta.max: 65535` (mapping defaults for dimmer)
- **THEN** system reverse-converts with `levelControlToRange(127, 0, 65535)` and publishes the resulting string (e.g. `"32638"` — same Matter level as `range`/255 maps to a much larger WB value, not `"127"`) to `/devices/<device>/controls/<ctrl>/on`

### Requirement: Bidirectional state sync — MQTT to Matter
The system SHALL update Matter endpoint attributes when MQTT control values change, using the appropriate converter from the mapping table.

#### Scenario: MQTT value updates Matter attribute
- **WHEN** MQTT message `"0"` arrives for switch control
- **THEN** system sets Matter `OnOff.onOff` to `false`

#### Scenario: Skip unchanged values
- **WHEN** MQTT value arrives identical to current Matter attribute value
- **THEN** system does NOT call `setAttribute()`

#### Scenario: Skip unchanged — object-shaped converted values
- **WHEN** the mapping converter returns an object (e.g. `{ energy: N }`) and the new converted value deep-equals the last stored value
- **THEN** system does NOT call `setAttribute()`

#### Scenario: Object value changes
- **WHEN** the mapping converter returns an object and the `energy` field (or equivalent) changes
- **THEN** system calls `setAttribute()` with the new object

### Requirement: Echo suppression
The system SHALL suppress MQTT-to-Matter updates for 2 seconds after sending a Matter-to-MQTT command for the same control, to prevent echo feedback loops.

#### Scenario: Echo suppressed after command
- **WHEN** system publishes `"1"` to MQTT for "Relay 1", and within 2 seconds receives MQTT value `"1"` back
- **THEN** system does NOT update the Matter attribute (echo suppressed)

#### Scenario: Genuine update after timeout
- **WHEN** system published a command 3 seconds ago, and a new MQTT value arrives
- **THEN** system updates the Matter attribute normally

### Requirement: HW metadata extraction for BridgedDeviceBasicInformation
The system SHALL extract hardware metadata from WB service controls (Serial→serialNumber, FW Version→softwareVersionString, HW Batch Number→hardwareVersionString) and use them in `BridgedDeviceBasicInformation` cluster. These controls SHALL NOT create separate Matter endpoints.

#### Scenario: Serial number extracted
- **WHEN** WB device has a `text` control named "Serial" with value `"12345678"`
- **THEN** system uses `"12345678"` as `serialNumber` in BridgedDeviceBasicInformation and does NOT create an endpoint for this control

#### Scenario: Internal diagnostics skipped
- **WHEN** WB device has controls "Supply Voltage", "MCU Temperature", or "Uptime"
- **THEN** system skips these controls by default (no endpoint, no BasicInfo field) unless `includeHidden` is true or explicitly included via `deviceOverrides`

### Requirement: Composite thermostat detection and mapping
The system SHALL detect thermostat pattern when a WB device has: (1) readonly temperature control with units `deg C`, (2) range control named setpoint/target with units `deg C`. Optional: enum mode control. The system SHALL create a single `thermostatDevice` instead of separate endpoints.

#### Scenario: Heating-only thermostat
- **WHEN** WB device has readonly temperature + heating setpoint (range, min=5, max=35)
- **THEN** system creates `thermostatDevice` with `HeatingOnly` cluster, `occupiedHeatingSetpoint`, min=500, max=3500

#### Scenario: Cooling-only thermostat
- **WHEN** WB device has readonly temperature + cooling setpoint only (no heating setpoint)
- **THEN** system creates `thermostatDevice` with `CoolingOnly` cluster, `occupiedCoolingSetpoint`, `controlSequenceOfOperation: CoolingOnly`

#### Scenario: Heating and cooling thermostat
- **WHEN** WB device has temperature + heating setpoint + cooling setpoint (or mode contains auto)
- **THEN** system creates `thermostatDevice` with `CoolingAndHeating` cluster, both setpoints active, `controlSequenceOfOperation: CoolingAndHeating`

#### Scenario: HeatingOnly/CoolingOnly excludes running_state
- **WHEN** thermostat is created with `HeatingOnly` or `CoolingOnly` cluster
- **THEN** system removes `running_state` from propertyMap (cluster without AutoMode does not support this attribute)

#### Scenario: Thermostat setpointRaiseLower command
- **WHEN** Matter controller sends `setpointRaiseLower` command to a thermostat endpoint
- **THEN** system calculates new setpoint value and publishes it to the WB setpoint control's `/on` topic

#### Scenario: Thermostat systemMode command
- **WHEN** Matter controller changes `systemMode` on a thermostat endpoint with mode control
- **THEN** system publishes the corresponding mode value to the WB mode control's `/on` topic

#### Scenario: Incomplete thermostat — separate endpoints
- **WHEN** WB device has only temperature sensor without setpoint control
- **THEN** system maps controls individually (temperatureSensor), NOT as thermostat

### Requirement: Hidden controls skipped by default
The system SHALL skip controls with `meta.hidden: true` unless config `includeHidden` is `true` or the control is explicitly included via `deviceOverrides`.

#### Scenario: Hidden control skipped
- **WHEN** WB control has `meta.hidden: true` and `includeHidden: false`
- **THEN** system skips the control

#### Scenario: Hidden control included by config
- **WHEN** WB control has `meta.hidden: true` and `includeHidden: true`
- **THEN** system processes the control normally

### Requirement: Fixed label with dominant type
In `device` grouping mode, the system SHALL add `endpoint.addFixedLabel('composed', dominantType)` to each registered device, where `dominantType` is the most frequent Matter device type category among child endpoints (Light, Switch, Sensor).

#### Scenario: Relay device gets Switch label
- **WHEN** WB device has 6 switch controls (onOffOutlet) and 1 temperature sensor
- **THEN** system adds `fixedLabel('composed', 'Switch')` to the root endpoint

### Requirement: Range bounds clamping
The system SHALL clamp values to `[meta.min, meta.max]` when publishing to MQTT from reverse conversion.

#### Scenario: Value clamped to max
- **WHEN** reverse conversion produces value `300` for a range control with `meta.max: 255`
- **THEN** system publishes `"255"` to MQTT