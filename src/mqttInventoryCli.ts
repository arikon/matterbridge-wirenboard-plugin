/**
 * `mb-wirenboard-verify-mqtt` — Wiren Board MQTT inventory + plugin-config annotations.
 * Installed `bin` uses `mqttInventoryCliEntry.ts` for fast `--help`.
 *
 * @file mqttInventoryCli.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareCanonicalControlNames } from "./canonicalOrdering.js";
import {
  annotateDevice,
  buildSessionSummary,
} from "./mqttInventory/annotate.js";
import { printHelp } from "./mqttInventory/cliHelp.js";
import {
  attachInventoryCollectors,
  createEmptyDeviceMap,
  inventoryMqttLog,
} from "./mqttInventory/collectModel.js";
import {
  ENV_PLUGIN_CONFIG_PATH,
  standardPluginConfigCandidates,
  tryReadFirstExistingConfigPath,
} from "./mqttInventory/configPaths.js";
import {
  type HumanReportAnnotationContext,
  printHumanReport,
} from "./mqttInventory/formatHuman.js";
import {
  type InventoryJsonReport,
  serializeInventoryJson,
} from "./mqttInventory/formatJson.js";
import {
  mergeWirenboardMqttConfig,
  type MqttCliOverrides,
  mqttOptionsFromEnv,
  mqttOptionsFromPluginJson,
} from "./mqttInventory/mqttConfigMerge.js";
import { WirenboardMqtt } from "./wirenboardMqtt.js";
import type { WbDevice } from "./wirenboardTypes.js";

export interface CliOptions {
  help: boolean;
  json: boolean;
  noColor: boolean;
  configPath?: string;
  idleMs: number;
  maxMs: number;
  mqttHost?: string;
  mqttPort?: number;
}

/**
 *
 */
export function parseArgv(argv: string[]): CliOptions {
  const o: CliOptions = {
    help: false,
    json: false,
    noColor: false,
    idleMs: Number(process.env.WB_VERIFY_IDLE_MS ?? "3000"),
    maxMs: Number(process.env.WB_VERIFY_MAX_MS ?? "60000"),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--no-color") o.noColor = true;
    else if (a === "--config") {
      const v = argv[++i];
      if (!v) throw new Error("--config requires a path");
      o.configPath = v;
    } else if (a === "--mqtt-host") {
      const v = argv[++i];
      if (!v) throw new Error("--mqtt-host requires a value");
      o.mqttHost = v;
    } else if (a === "--mqtt-port") {
      const v = argv[++i];
      if (!v) throw new Error("--mqtt-port requires a value");
      o.mqttPort = Number(v);
    } else if (a === "--idle-ms") {
      const v = argv[++i];
      if (!v) throw new Error("--idle-ms requires a value");
      o.idleMs = Number(v);
    } else if (a === "--max-ms") {
      const v = argv[++i];
      if (!v) throw new Error("--max-ms requires a value");
      o.maxMs = Number(v);
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    }
  }
  return o;
}

/**
 *
 */
function loadPluginConfigRecord(opts: CliOptions): {
  raw?: Record<string, unknown>;
  loaded: boolean;
  path?: string;
} {
  const readPath = (p: string): Record<string, unknown> => {
    const text = fs.readFileSync(p, "utf8");
    const j = JSON.parse(text) as unknown;
    if (typeof j !== "object" || j === null || Array.isArray(j)) {
      throw new Error(`Invalid plugin JSON (expected object): ${p}`);
    }
    return j as Record<string, unknown>;
  };

  if (opts.configPath) {
    if (!fs.existsSync(opts.configPath)) {
      throw new Error(`Config not found: ${opts.configPath}`);
    }
    return {
      raw: readPath(opts.configPath),
      loaded: true,
      path: opts.configPath,
    };
  }

  const envP = process.env[ENV_PLUGIN_CONFIG_PATH];
  if (envP && envP.length > 0) {
    if (!fs.existsSync(envP)) {
      throw new Error(`Config not found (${ENV_PLUGIN_CONFIG_PATH}): ${envP}`);
    }
    return { raw: readPath(envP), loaded: true, path: envP };
  }

  const found = tryReadFirstExistingConfigPath(
    standardPluginConfigCandidates(),
  );
  if (found) {
    try {
      return {
        raw: JSON.parse(found.content) as Record<string, unknown>,
        loaded: true,
        path: found.path,
      };
    } catch (e) {
      const msg = `Invalid plugin JSON at ${found.path}: ${e instanceof Error ? e.message : String(e)}`;
      throw e instanceof Error ? new Error(msg, { cause: e }) : new Error(msg);
    }
  }
  return { loaded: false };
}

/**
 *
 */
function boolCfg(
  raw: Record<string, unknown> | undefined,
  key: string,
  def: boolean,
): boolean {
  if (!raw) return def;
  const v = raw[key];
  if (typeof v === "boolean") return v;
  return def;
}

/**
 *
 */
export async function runMqttInventoryCli(
  opts: CliOptions,
  hooks: {
    stdout: (s: string) => void;
    isTTY: boolean;
  },
): Promise<void> {
  const plugin = loadPluginConfigRecord(opts);
  const filePartial = mqttOptionsFromPluginJson(plugin.raw);
  const envPartial = mqttOptionsFromEnv();
  const cliPartial: MqttCliOverrides = {};
  if (opts.mqttHost) cliPartial.mqttHost = opts.mqttHost;
  if (opts.mqttPort !== undefined) cliPartial.mqttPort = opts.mqttPort;

  const mqttCfg = mergeWirenboardMqttConfig(
    filePartial,
    envPartial,
    cliPartial,
  );
  const log = inventoryMqttLog();
  const mqtt = new WirenboardMqtt(mqttCfg, log);
  const deviceMap = createEmptyDeviceMap();

  let lastMetaAt = 0;
  const touch = () => {
    lastMetaAt = Date.now();
  };
  attachInventoryCollectors(mqtt, deviceMap, touch);

  await mqtt.start();
  lastMetaAt = Date.now();

  process.stderr.write(
    `Inventory: collecting /devices/… meta (idle quit: ${opts.idleMs} ms after last meta, hard cap: ${opts.maxMs} ms).\n`,
  );

  await new Promise<void>((resolve) => {
    let lastHeartbeat = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const quietOk = now - lastMetaAt >= opts.idleMs;
      const done =
        (deviceMap.size > 0 && quietOk) ||
        (deviceMap.size === 0 && now - lastMetaAt >= opts.maxMs);
      if (done) {
        clearInterval(interval);
        clearTimeout(maxTimer);
        resolve();
        return;
      }
      if (deviceMap.size === 0 && now - lastHeartbeat >= 10_000) {
        lastHeartbeat = now;
        const elapsed = Math.round((now - lastMetaAt) / 1000);
        process.stderr.write(
          `Inventory: no device meta yet (${elapsed}s since subscribe); still listening (max ${Math.round(opts.maxMs / 1000)}s)…\n`,
        );
      }
    }, 200);
    const maxTimer = setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, opts.maxMs);
  });

  await mqtt.stop();

  const annotationCfg = {
    raw: plugin.raw,
    loaded: plugin.loaded,
    path: plugin.path,
  };

  const includeHidden = boolCfg(plugin.raw, "includeHidden", false);
  const ignoreSystem = boolCfg(plugin.raw, "ignoreSystemPrefixedDevices", true);
  const ignoreNetwork = boolCfg(
    plugin.raw,
    "ignoreNetworkPrefixedDevices",
    true,
  );

  const session = buildSessionSummary(annotationCfg);
  const sortedNames = [...deviceMap.keys()].sort(compareCanonicalControlNames);

  const devicesOut: InventoryJsonReport["devices"] = [];
  for (const name of sortedNames) {
    const wb = deviceMap.get(name);
    if (!wb) continue;
    const { device, controls } = annotateDevice(wb as WbDevice, annotationCfg, {
      includeHidden,
      ignoreSystemPrefixedDevices: ignoreSystem,
      ignoreNetworkPrefixedDevices: ignoreNetwork,
    });
    devicesOut.push({
      id: device.id,
      titleForValidation: device.titleForValidation,
      annotations: {
        skippedByPrefix: device.skippedByPrefix,
        inStaticDevicesList: device.inStaticDevicesList,
        validateDevicePasses: device.validateDevicePasses,
        hasMappableEarly: device.hasMappableEarly,
        exposureHint: device.exposureHint,
      },
      controls: controls.map((c) => ({
        name: c.name,
        mappable: c.mappable,
        skippedByOverride: c.skippedByOverride,
        typeOverride: c.typeOverride,
        hidden: c.hidden,
        hiddenExcludedByConfig: c.hiddenExcludedByConfig,
      })),
    });
  }

  const report: InventoryJsonReport = {
    schemaVersion: 1,
    configLoaded: plugin.loaded,
    configPath: plugin.path,
    effectiveGroupingMode: session.effectiveGroupingMode,
    groupingTopologyHint: session.groupingTopologyHint,
    discoveryMode: session.discoveryMode,
    broker: {
      protocol: mqttCfg.mqttProtocol ?? "mqtt",
      host: mqttCfg.mqttHost ?? "localhost",
      port: mqttCfg.mqttPort ?? 1883,
    },
    devices: devicesOut,
  };

  const useColor =
    !opts.json &&
    !opts.noColor &&
    process.env.NO_COLOR === undefined &&
    hooks.isTTY;

  if (opts.json) {
    hooks.stdout(serializeInventoryJson(report));
  } else {
    const annotationCtx: HumanReportAnnotationContext = {
      includeHidden,
      ignoreSystemPrefixedDevices: ignoreSystem,
      ignoreNetworkPrefixedDevices: ignoreNetwork,
    };
    printHumanReport(report, useColor, hooks.stdout, annotationCtx);
  }
}

/**
 * Entry point for `mb-wirenboard-verify-mqtt` and `scripts/real-mqtt-verify.mjs`.
 */
export async function main(): Promise<void> {
  try {
    const opts = parseArgv(process.argv);
    if (opts.help) {
      printHelp();
      return;
    }
    await runMqttInventoryCli(opts, {
      stdout: (s) => {
        process.stdout.write(s);
      },
      isTTY: process.stdout.isTTY,
    });
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}

/**
 * True when this file is the process entrypoint. Uses realpath so symlinks
 * (e.g. `/usr/bin/mb-wirenboard-verify-mqtt` → `…/mqttInventoryCli.js`) match;
 * plain `argv[1] === import.meta.url` fails for symlinks and skips `main()`.
 */
function isRunAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const resolvedEntry = fs.realpathSync(path.resolve(entry));
    const resolvedThis = fs.realpathSync(fileURLToPath(import.meta.url));
    return resolvedEntry === resolvedThis;
  } catch {
    return false;
  }
}

if (isRunAsCli()) {
  void main();
}
