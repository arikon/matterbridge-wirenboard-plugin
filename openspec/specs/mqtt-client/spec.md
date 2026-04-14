# MQTT client

Purpose: Wirenboard MQTT subscription, topic parsing, and publish semantics.

## Requirements

### Requirement: MQTT connection with multiple protocols
The system SHALL connect to a Wirenboard MQTT broker using configurable protocol (mqtt, mqtts, ws, wss), host, port, and optional credentials (username/password).

#### Scenario: Connect via plain MQTT
- **WHEN** config specifies `mqttProtocol: "mqtt"`, `mqttHost: "192.168.1.100"`, `mqttPort: 1883`
- **THEN** system establishes MQTT connection to `mqtt://192.168.1.100:1883`

#### Scenario: Connect via MQTTS with TLS certificates
- **WHEN** config specifies `mqttProtocol: "mqtts"` and provides `mqttCaPath`, `mqttCertPath`, `mqttKeyPath`
- **THEN** system reads certificate files into Buffers and establishes TLS-secured MQTT connection

#### Scenario: Connect with authentication
- **WHEN** config specifies `mqttUsername` and `mqttPassword`
- **THEN** system authenticates with the broker using provided credentials

### Requirement: Automatic reconnection
The system SHALL automatically reconnect to the MQTT broker on connection loss with a reconnect period of 5000ms and connect timeout of 60000ms.

#### Scenario: Broker connection lost
- **WHEN** the MQTT connection drops
- **THEN** system automatically attempts reconnection every 5 seconds

#### Scenario: Reconnect emits event
- **WHEN** system reconnects after a connection loss
- **THEN** system emits `mqtt_connect` event

### Requirement: Subscribe to all device topics
The system SHALL subscribe to `/devices/#` upon connection to receive all retained and live messages for Wirenboard devices.

#### Scenario: Initial subscription
- **WHEN** MQTT connection is established
- **THEN** system subscribes to `/devices/#` topic

### Requirement: Topic parsing — device meta
The system SHALL parse topic `/devices/<name>/meta` and emit `device-meta` event with parsed JSON payload containing device metadata.

#### Scenario: JSON device meta received
- **WHEN** message arrives on `/devices/wb-mr6c_28/meta` with JSON payload `{"driver":"wb-mqtt-serial","title":{"en":"WB-MR6C","ru":"WB-MR6C"}}`
- **THEN** system emits `device-meta` event with deviceName `"wb-mr6c_28"` and parsed meta object

#### Scenario: Legacy subtopic device meta
- **WHEN** message arrives on `/devices/wb-mr6c_28/meta/name` with non-JSON payload `"WB-MR6C"`
- **THEN** system emits `device-meta` event with deviceName `"wb-mr6c_28"` and field `name` set to `"WB-MR6C"`

### Requirement: Topic parsing — control meta
The system SHALL parse topic `/devices/<name>/controls/<ctrl>/meta` and emit `control-meta` event with parsed JSON payload.

#### Scenario: JSON control meta received
- **WHEN** message arrives on `/devices/wb-mr6c_28/controls/Relay 1/meta` with JSON payload `{"type":"switch","order":1,"readonly":false}`
- **THEN** system emits `control-meta` event with deviceName `"wb-mr6c_28"`, controlName `"Relay 1"`, and parsed meta

#### Scenario: Legacy subtopic control meta — type
- **WHEN** message arrives on `/devices/wb-mr6c_28/controls/Relay 1/meta/type` with payload `"switch"`
- **THEN** system emits `control-meta` event with deviceName, controlName, and field `type` set to `"switch"`

#### Scenario: Legacy subtopic control meta — max, order, readonly
- **WHEN** messages arrive on `/devices/wb-mr6c_28/controls/Dimmer/meta/max` with `"255"`, `/meta/order` with `"3"`, `/meta/readonly` with `"0"`
- **THEN** system emits `control-meta` events updating fields `max=255`, `order=3`, `readonly=false` for that control

### Requirement: Topic parsing — control value
The system SHALL parse topic `/devices/<name>/controls/<ctrl>` (not `/meta`, not `/on`) and emit `control-value` event with the raw string payload.

#### Scenario: Control value received
- **WHEN** message arrives on `/devices/wb-mr6c_28/controls/Relay 1` with payload `"1"`
- **THEN** system emits `control-value` event with deviceName `"wb-mr6c_28"`, controlName `"Relay 1"`, value `"1"`

### Requirement: Topic parsing — error topics
The system SHALL parse `/devices/<name>/meta/error` as `device-error` and `/devices/<name>/controls/<ctrl>/meta/error` as `control-error` events.

#### Scenario: Control error received
- **WHEN** message arrives on `/devices/wb-mr6c_28/controls/Temperature/meta/error` with payload `"r"`
- **THEN** system emits `control-error` event with deviceName, controlName, and error `"r"`

#### Scenario: Error cleared
- **WHEN** message arrives on error topic with empty payload `""`
- **THEN** system emits `control-error` event with error `""`

### Requirement: Empty payload means removal
The system SHALL treat empty payload (`""`) on any retained topic as removal of that entity and emit `device-removed` or `control-removed` event accordingly.

#### Scenario: Device removed via empty retained
- **WHEN** message arrives on `/devices/wb-old/meta` with empty payload
- **THEN** system emits `device-removed` event with deviceName `"wb-old"`

#### Scenario: Control removed via empty retained
- **WHEN** message arrives on `/devices/wb-mr6c_28/controls/Relay 1` with empty payload
- **THEN** system emits `control-removed` event with deviceName `"wb-mr6c_28"` and controlName `"Relay 1"`

### Requirement: Publish control commands
The system SHALL provide a `publish(deviceName, controlName, value)` method that publishes to `/devices/<name>/controls/<ctrl>/on`.

#### Scenario: Publish switch command
- **WHEN** `publish("wb-mr6c_28", "Relay 1", "1")` is called
- **THEN** system publishes message `"1"` to topic `/devices/wb-mr6c_28/controls/Relay 1/on`

### Requirement: Graceful disconnect
The system SHALL provide a `stop()` method that gracefully disconnects from the MQTT broker via `client.endAsync()`.

#### Scenario: Stop called
- **WHEN** `stop()` is called
- **THEN** MQTT client disconnects gracefully and emits `mqtt_disconnect` event

### Requirement: Connection event emission
The system SHALL emit `mqtt_connect` on successful connection and `mqtt_disconnect` on disconnect.

#### Scenario: Connection established
- **WHEN** MQTT client connects successfully
- **THEN** system emits `mqtt_connect` event

#### Scenario: Connection lost
- **WHEN** MQTT client disconnects
- **THEN** system emits `mqtt_disconnect` event