## Why

При открытии служебных устройств Wirenboard (префикс `system__`, например `system__networks__…`) плагин логирует каждый немаппируемый контрол на уровне **warn**, что засоряет лог и не отражает серьёзность ситуации (отсутствие маппинга для `text` ожидаемо). Нужна опция в конфигурации: для таких устройств по умолчанию не засорять **warn**, а писать о пропуске только в **debug**; при необходимости можно вернуть прежнюю болтливость.

## What Changes

- Новый **флаг в конфиге платформы** Matterbridge (плагин Wirenboard MQTT): **`ignoreSystemControls`**, тип boolean, **по умолчанию `true`**.
- Когда **`ignoreSystemControls` включён** (`true`, в т.ч. если ключ опущен), устройства по правилу **`system__*`** при отсутствии маппинга для контрола логируют сообщение о пропуске **только на уровне `debug`**.
- Когда **`ignoreSystemControls` выключен** (`false`), поведение как у текущего кода без флага: сообщение о пропуске немаппируемого контрола — **`warn`** и для `system__*`, и для остальных устройств.
- **Не** меняется логика отбора контролов в Matter: по-прежнему только отсутствие маппинга; меняется **уровень лога** для подмножества `system__*` в зависимости от флага.

## Capabilities

### New Capabilities

_(нет — расширяем существующую capability конфигурации.)_

### Modified Capabilities

- `configuration`: добавляется булев параметр **`ignoreSystemControls`** с дефолтом **`true`**; для устройств `system__*` текст лога — отдельный (например `System device …: skipping unmappable control …`), при **`true`** — только **debug**, при **`false`** — **warn**. Для прочих устройств — прежний формат `Skipping control … no mapping`, всегда **warn**. Требования — дельта в `specs/configuration/spec.md` этого change; после merge — обновление `openspec/specs/configuration/spec.md`.

## Impact

- Код: `matterbridge-wirenboard-plugin` (`WirenboardDevice.create`, передача опции из `module.ts` / `PlatformConfig`).
- Документация конфигурации плагина и JSON Schema UI (описание флага и дефолта).
- **Поведение по умолчанию для новых установок:** меньше шума в **warn** по служебным устройствам. Кто полагался на **warn** по `system__*`, явно задаёт **`ignoreSystemControls: false`**.
