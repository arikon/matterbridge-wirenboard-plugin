## ADDED Requirements

### Requirement: Optional Wirenboard web UI URL

The system SHALL support optional `wirenboardUrl` (string). When present and non-empty after leading and trailing ASCII whitespace trim, the string SHALL be used as the full value for `endpoint.configUrl` on every registered Matter endpoint (see platform-lifecycle: ConfigUrl). When `wirenboardUrl` is absent, empty, or whitespace-only after trim, the system SHALL fall back to `http://<mqttHost>` for `endpoint.configUrl`.

The configuration schema exposed to Matterbridge UI SHALL document `wirenboardUrl` as the operator-configurable link to the Wirenboard web UI (or reverse-proxy URL), distinct from MQTT connection settings.

#### Scenario: Omitted uses MQTT-based fallback

- **WHEN** `wirenboardUrl` is omitted from config and `mqttHost` is `"192.168.1.100"`
- **THEN** `endpoint.configUrl` SHALL resolve per platform-lifecycle fallback to `"http://192.168.1.100"`

#### Scenario: Non-empty explicit URL

- **WHEN** `wirenboardUrl` is `"https://wb.lan:8443/"` (after trim)
- **THEN** each registered endpoint SHALL have `configUrl` equal to `"https://wb.lan:8443/"`

#### Scenario: Whitespace-only falls back

- **WHEN** `wirenboardUrl` is `"   "` and `mqttHost` is `"10.0.0.5"`
- **THEN** `endpoint.configUrl` SHALL be `"http://10.0.0.5"`
