## Why

Matterbridge показывает для каждого bridged-устройства поле **Url**, которое берётся из `endpoint.configUrl`. Сейчас плагин всегда выставляет `http://<mqttHost>`. Если Matterbridge крутится не на контроллере, `mqttHost` часто `localhost` или не совпадает с адресом веб-интерфейса; кроме того, веб-UI может быть на **HTTPS**, другом **порте** или за **reverse proxy**. Нужна отдельная настройка полного URL без привязки только к хосту MQTT.

## What Changes

- Добавить в JSON-конфиг плагина опциональное поле **`wirenboardUrl`** (строка): полный URL для открытия веб-интерфейса Wiren Board (или прокси) из UI Matterbridge.
- При **непустом** значении (после trim) устанавливать `endpoint.configUrl` **ровно** в эту строку (со схемой, портом, путём — как задал оператор).
- При **отсутствии** или **пустой** строке сохранять текущее поведение: `endpoint.configUrl = http://<mqttHost>`.

## Capabilities

### New Capabilities

_None — расширяются существующие спеки._

### Modified Capabilities

- `configuration`: новое опциональное поле `wirenboardUrl` и описание в schema.
- `platform-lifecycle`: правило **ConfigUrl on registered endpoints** — разрешение URL через `wirenboardUrl` с fallback на `http://<mqttHost>`.

## Impact

- `src/module.ts` (присвоение `endpoint.configUrl`).
- `matterbridge-wirenboard-plugin.schema.json` (поле в UI Matterbridge).
- Таблица опций в `README.md`, при необходимости пример в `matterbridge-wirenboard-plugin.config.json`.
- Юнит-тесты конфигурации / регистрации endpoint.
