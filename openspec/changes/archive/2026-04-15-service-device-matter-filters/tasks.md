## 1. Configuration surface

- [x] 1.1 Добавить `ignoreNetworkPrefixedDevices` в `matterbridge-wirenboard-plugin.schema.json` (boolean, default `true`, описание EN/RU).
- [x] 1.2 Обновить пример конфига и таблицу в `README.md`; кратко — в `AGENTS.md` при необходимости.

## 2. Registration logic

- [x] 2.1 В `registerWbDevice` (и проброс значения из `registerDiscoveredDevices` / `registerNewDevice`) читать `ignoreNetworkPrefixedDevices` (default `true`).
- [x] 2.2 Если `ignoreNetworkPrefixedDevices && wbDevice.name.startsWith("network")` — `log.debug` и ранний return (после проверки `system__` / `ignoreSystemPrefixedDevices`, см. design).
- [x] 2.3 Вынести проверки в `shouldSkipMatterRegistration(...)` (boolean) и предикаты `appliesSystemPrefixedSkip` / `appliesNetworkPrefixedSkip`; сообщения для `log.debug` — только в `registerWbDevice`.

## 3. Tests

- [x] 3.1 В `test/module.test.ts`: при default — устройство `networks` + mappable switch не вызывает `registerDevice`.
- [x] 3.2 При `ignoreNetworkPrefixedDevices: false` — регистрация вызывается.

## 4. Spec sync после merge

- [x] 4.1 После реализации выполнить sync дельты в `openspec/specs/configuration/spec.md` (скрипт/процесс проекта) и при необходимости заархивировать change.
