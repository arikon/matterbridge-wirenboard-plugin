/**
 * Resolve plugin JSON path: `--config` > env > standard WB paths.
 *
 * @file mqttInventory/configPaths.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PLUGIN_CONFIG_FILENAME =
  "matterbridge-wirenboard-plugin.config.json";

/** Env var: explicit path to plugin config JSON (optional). */
export const ENV_PLUGIN_CONFIG_PATH = "MATTERBRIDGE_WIRENBOARD_PLUGIN_CONFIG";

/**
 *
 */
export function standardPluginConfigCandidates(): string[] {
  const home = os.homedir();
  const list = [
    path.join("/root", ".matterbridge", PLUGIN_CONFIG_FILENAME),
    path.join(home, ".matterbridge", PLUGIN_CONFIG_FILENAME),
  ];
  const seen = new Set<string>();
  return list.filter((p) => {
    const real = path.resolve(p);
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

/**
 *
 */
export function tryReadFirstExistingConfigPath(
  candidates: string[],
): { path: string; content: string } | undefined {
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
      const content = fs.readFileSync(p, "utf8");
      return { path: p, content };
    } catch {
      /* skip */
    }
  }
  return undefined;
}
