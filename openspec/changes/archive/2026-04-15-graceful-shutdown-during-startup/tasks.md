## 1. Реализация и соответствие спеке

- [x] 1.1 Проверить `WirenboardPlatform` в `src/module.ts`: флаг `startupAbortRequested`, `onShutdown`, SIGINT/SIGTERM вне `NODE_ENV=test`, `mqtt.stop()` при сигнале, отсутствие обработчиков в тестах.
- [x] 1.2 Проверить прерываемые ожидания в `onStart`: production — цикл с интервалом и проверкой флага; test — делегирование в `matterbridge/utils` `waiter` для совместимости с моками.
- [x] 1.3 Проверить выход из циклов в `registerDiscoveredDevices` / `registerWbDevice`, `setImmediate` между устройствами, логи при прерывании.
- [x] 1.4 Убедиться, что при abort во время failsafe-wait не выбрасывается ошибка failsafe «только из-за abort»; при полном ожидании без abort — прежнее поведение failsafe.

## 2. Тесты и регрессии

- [x] 2.1 Прогнать `npm test` (или целевой suite плагина); убедиться, что сценарий failsafe не ждёт 60 с в Jest (мок `waiter`).
- [x] 2.2 При необходимости добавить/уточнить тесты на флаг abort и отсутствие SIG handlers при `NODE_ENV=test`.

## 3. Документация

- [x] 3.1 Проверить `README.md`: остановка во время startup, ограничение по одному «длинному» `await registerDevice`.

## 4. Завершение OpenSpec

- [x] 4.1 Выполнить `openspec verify` для change (или эквивалент в проекте) и при готовности синхронизировать дельту в `openspec/specs/platform-lifecycle/spec.md` либо заархивировать change по workflow репозитория.
