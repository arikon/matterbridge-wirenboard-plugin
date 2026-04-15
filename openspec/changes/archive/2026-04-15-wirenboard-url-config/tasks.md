## 1. Configuration surface

- [x] 1.1 Add `wirenboardUrl` to `matterbridge-wirenboard-plugin.schema.json` (optional string, default empty, description EN/RU).
- [x] 1.2 Add `wirenboardUrl` to example `matterbridge-wirenboard-plugin.config.json` if useful (comment or empty string).

## 2. Implementation

- [x] 2.1 In `src/module.ts`, compute `endpoint.configUrl` from trimmed `wirenboardUrl` when non-empty; otherwise `http://${mqttHost}` as today.
- [x] 2.2 Document the option in `README.md` (All options table) with fallback behavior.

## 3. Tests and quality

- [x] 3.1 Add or extend tests (e.g. `module.test.ts`) so that when config includes `wirenboardUrl`, registered endpoints receive that exact URL; when omitted, behavior matches `http://<mqttHost>`.
- [x] 3.2 Run `npm test` and `npm run lint`.

## 4. Specs sync (after implementation review)

- [x] 4.1 Merge delta specs into `openspec/specs/configuration/spec.md` and `openspec/specs/platform-lifecycle/spec.md`, or run project `openspec` sync workflow before archive.
