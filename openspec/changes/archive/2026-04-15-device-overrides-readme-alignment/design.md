## Context

Сейчас `deviceOverrides[<wbDeviceId>]` приводится к типу `DeviceOverrides` без нормализации. README задаёт объект с **`name`**, **`controls`**, внутри — **`deviceType`** и **`skip`**. Обратная совместимость с плоским видом **не требуется** — поддерживается только этот формат.

## Goals / Non-Goals

**Goals:**

- Парсинг формата README: обязательный объект **`controls`**, опциональный **`name`**.
- **`skip`**, строковый **`deviceType`**, разрешение строк в `DeviceTypeDefinition`.
- Пропуск контролов с `skip: true` до создания endpoint.

**Non-Goals:**

- Поддержка плоского вида без `controls`.
- Сложная JSON Schema на всё дерево (допустимы `additionalProperties` + описание в README).

## Decisions

1. **Нормализация** — функция/модуль: на вход объект устройства из конфига (ожидается `{ name?, controls }`), на выход `{ displayName?; skippedControls: Set<string>; typeOverrides: DeviceOverrides }`. Отсутствие или неверный тип **`controls`** → ошибка конфига / log warn и отсутствие overrides для устройства (конкретика в реализации).

2. **`skip: true`** — в `skippedControls`; не вызывать `findMapping`, не создавать endpoint; не логировать «no mapping».

3. **Строковый `deviceType`** — реестр имён → `DeviceTypeDefinition` из `matterbridge`, согласованный с `CONTROL_MAPPINGS`.

4. **`name`** — использовать для отображаемого имени bridged-устройства в Matterbridge UI при регистрации.

## Risks / Trade-offs

- **BREAKING** — пользователи с плоским конфигом должны мигрировать вручную.

- **Строка не из таблицы** — log warn, override игнорируется.

## Migration Plan

Все записи `deviceOverrides.<id>` перевести на вид `{ "controls": { ... } }`; при необходимости добавить `"name"`.

## Open Questions

_None._
