#!/usr/bin/env node
/**
 * Thin CLI entry: fast `--help` without loading MQTT / inventory modules.
 *
 * @file mqttInventoryCliEntry.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { printHelp } from "./mqttInventory/cliHelp.js";

/**
 * True when this file is the process entrypoint (realpath matches symlink targets).
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

/**
 *
 */
function wantsHelp(argv: string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

/**
 *
 */
async function bootstrap(): Promise<void> {
  if (!isRunAsCli()) return;
  const argv = process.argv;
  if (wantsHelp(argv)) {
    printHelp();
    return;
  }
  const { main } = await import("./mqttInventoryCli.js");
  await main();
}

if (isRunAsCli()) {
  void bootstrap();
}
