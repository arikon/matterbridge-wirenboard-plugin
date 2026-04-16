/**
 * Help text only — no heavy imports (MQTT, platform). Used for fast `--help`.
 *
 * @file mqttInventory/cliHelp.ts
 */

import {
  ENV_PLUGIN_CONFIG_PATH,
  PLUGIN_CONFIG_FILENAME,
} from "./configPaths.js";

/**
 *
 */
export function printHelp(): void {
  process.stdout
    .write(`mb-wirenboard-verify-mqtt — Wiren Board MQTT inventory for Matterbridge plugin diagnostics

Usage:
  mb-wirenboard-verify-mqtt [options]

Options:
  --help                 Show this help
  --config <path>        Plugin JSON (${PLUGIN_CONFIG_FILENAME} shape)
  --json                 Machine-readable JSON on stdout (no ANSI)
  --no-color             Disable ANSI badges
  --mqtt-host <host>     Override MQTT host (overrides config and WB_MQTT_HOST)
  --mqtt-port <port>     Override MQTT port
  --idle-ms <n>          Silence after last meta to finish (default: 3000)
  --max-ms <n>           Hard cap wait (default: 60000)

Config search (without --config):
  1. ${ENV_PLUGIN_CONFIG_PATH} if set
  2. /root/.matterbridge/${PLUGIN_CONFIG_FILENAME} then $HOME/.matterbridge/${PLUGIN_CONFIG_FILENAME}

Environment:
  WB_MQTT_HOST, WB_MQTT_PORT, WB_MQTT_PROTOCOL, WB_MQTT_USERNAME, WB_MQTT_PASSWORD, …
  WB_VERIFY_IDLE_MS, WB_VERIFY_MAX_MS

Output:
  Connection progress and inventory timing messages go to stderr; the report (human or --json) goes to stdout.

`);
}
