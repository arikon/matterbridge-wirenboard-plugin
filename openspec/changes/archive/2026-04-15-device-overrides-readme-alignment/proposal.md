## Why

В README и в `openspec/specs/configuration/spec.md` для `deviceOverrides` описана вложенная структура с объектом **`controls`**, флагами **`skip`**, опциональным **`name`** на уровне устройства. Текущий код в `module.ts` передаёт объект устройства в `findMapping` как плоский `DeviceOverrides` **без** разбора `controls`, поэтому конфиг как в документации **не работает**. Ранее использовавшийся неофициально плоский вид без `controls` **не сохраняем** — допустим **только** формат как в README (**BREAKING** для старых плоских конфигов).

## What Changes

- Единый контракт: для каждого WB device id значение — объект с обязательным **`controls`** (и опционально **`name`**), как в README.
- Поддержка **`skip: true`** на уровне контрола: контрол не участвует в маппинге и **не** создаёт endpoint (как в спеке).
- Поддержка опционального **`name`** на уровне устройства: отображаемое имя при регистрации в Matterbridge.
- Разрешение строкового **`deviceType`** в значения `DeviceTypeDefinition`, согласованные с таблицей маппинга плагина.
- Обновить **README / schema**: только вложенный формат; явно указать **BREAKING** для плоских конфигов.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- **`configuration`**: требование **Device overrides configuration** — только README-форма с `controls`, без legacy flat.
- **`device-builder`** (при необходимости): отсылка к пропуску контролов по `deviceOverrides.skip` — только если нужен явный сценарий в main spec.

## Impact

- **BREAKING:** конфиги с плоским `deviceOverrides` нужно переписать под `{ "controls": { ... } }`.
- `src/module.ts`, `src/wirenboardDevice.ts`, `src/controlMapping.ts` (или новый модуль нормализации).
- Тесты и документация.
