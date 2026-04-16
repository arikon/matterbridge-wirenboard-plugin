/**
 * Back-compat wrapper: same CLI as `dist/mqttInventoryCliEntry.js` after `npm run build`.
 *
 * Prefer: `npm run verify:mqtt` or `node dist/mqttInventoryCliEntry.js`.
 *
 * @file real-mqtt-verify.mjs
 */
import { main } from "../dist/mqttInventoryCli.js";

void main();
