## Why

Служебные устройства Wirenboard (`system__*`) и устройства, чей идентификатор начинается с префикса `network`, не должны по умолчанию попадать в Matter: они дают шум в логах и лишние сущности в доме. Отдельно нужно явно исключать устройства с префиксом `network` (например `networks`, `networks_…`), которые не всегда совпадают с `system__*`.

## What Changes

- Зафиксировать в спецификации и задачах: при **`ignoreSystemPrefixedDevices: true`** (по умолчанию) устройства с префиксом **`system__`** не регистрируются как Matter endpoints (уже реализовано в коде).
- Добавить конфигурационный флаг (например **`ignoreNetworkPrefixedDevices`**, default **`true`**) и логику: при **`true`** не регистрировать в Matter устройства, чей WB **device id** начинается с **`network`** (ASCII, регистрозависимо).
- Обновить JSON Schema, README/AGENTS при необходимости; добавить тесты на пропуск регистрации для префикса `network` и на включение при **`false`**.

## Capabilities

### New Capabilities

- _(нет отдельной capability — поведение относится к конфигурации и жизненному циклу регистрации.)_

### Modified Capabilities

- `configuration`: добавить требование к опции отключения бриджинга устройств с префиксом `network`; уточнить связку с `ignoreSystemPrefixedDevices` и регистрацией Matter.

## Impact

- `src/module.ts` (`registerWbDevice`), конфиг и схема, тесты `module.test.ts`, документация плагина.
