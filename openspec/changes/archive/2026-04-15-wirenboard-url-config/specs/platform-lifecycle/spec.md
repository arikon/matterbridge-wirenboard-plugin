## MODIFIED Requirements

### Requirement: ConfigUrl on registered endpoints

The system SHALL set `endpoint.configUrl` on each registered endpoint to link to the Wirenboard web UI (or another operator-chosen page opened from Matterbridge).

When platform config contains `wirenboardUrl` and the value is non-empty after leading and trailing ASCII whitespace trim, the system SHALL set `endpoint.configUrl` to exactly that trimmed string (full URL as provided by the operator, including scheme, host, port, and path).

When `wirenboardUrl` is absent, empty, or whitespace-only after trim, the system SHALL set `endpoint.configUrl` to `http://<mqttHost>`.

#### Scenario: ConfigUrl from wirenboardUrl

- **WHEN** `wirenboardUrl` is `"https://192.168.1.100:443"`
- **THEN** each endpoint has `configUrl` = `"https://192.168.1.100:443"`

#### Scenario: ConfigUrl fallback from mqttHost

- **WHEN** `wirenboardUrl` is omitted and `mqttHost` is `"192.168.1.100"`
- **THEN** each endpoint has `configUrl` = `"http://192.168.1.100"`

#### Scenario: Empty wirenboardUrl uses mqttHost fallback

- **WHEN** `wirenboardUrl` is `""` and `mqttHost` is `"192.168.1.100"`
- **THEN** each endpoint has `configUrl` = `"http://192.168.1.100"`
