## Context

Плагин собирает WB устройства из MQTT и для каждого вызывает `registerWbDevice`. Уже есть ранний выход для `system__*` при `ignoreSystemPrefixedDevices === true`. На контроллерах встречаются устройства с идентификаторами, начинающимися с `network` (например драйвер `networks`), которые не обязаны иметь префикс `system__`.

## Goals / Non-Goals

**Goals:**

- Один явный булевый флаг в конфиге с default `true`: не бриджить устройства, чей `deviceName.startsWith("network")`.
- Общий порядок проверок в `registerWbDevice`: сначала `ignoreSystemPrefixedDevices` + `system__`, затем `ignoreNetworkPrefixedDevices` + префикс `network`, затем остальная логика.
- Сообщение в `log.debug` при пропуске (как для `system__`), чтобы не засорять info/warn.

**Non-Goals:**

- Поддержка произвольных префиксов/regex в этом change (можно отдельной задачей).
- Изменение whiteList/blackList — пользователь может по-прежнему явно включать устройства, но если устройство отфильтровано новым флагом, оно не регистрируется; при необходимости явного включения пользователь выставляет `ignoreNetworkPrefixedDevices: false`.

## Decisions

1. **Имя ключа: `ignoreNetworkPrefixedDevices` (default `true`)** — по смыслу симметрично `ignoreSystemPrefixedDevices`, однозначно указывает на префикс `network`, а не на тип контрола.

2. **Правило совпадения: префикс строки `network` (case-sensitive)** — совпадает с формулировкой «префикс network»; `networks` и `networkFoo` отфильтровываются.

3. **Независимость от `ignoreSystemPrefixedDevices`** — можно отключить бридж только `system__` или только `network*`, задавая комбинацию флагов.

**Альтернатива:** один массив префиксов — отклонено в пользу KISS и двух понятных булевых флагов.

## Risks / Trade-offs

- **[Риск]** Устройство с легитимным именем, начинающимся с `network`, не попадёт в Matter при default → **Mitigation:** документация и `ignoreNetworkPrefixedDevices: false`.
- **[Риск]** Дублирование проверок в `registerWbDevice` → **Mitigation:** предикаты `appliesSystemPrefixedSkip` / `appliesNetworkPrefixedSkip` и `shouldSkipMatterRegistration` (boolean); текст `log.debug` только в `registerWbDevice`.

## Migration Plan

Новый ключ с default `true`: поведение для `network*` меняется при обновлении (устройства перестают бриджиться). Откат: `ignoreNetworkPrefixedDevices: false`.

## Open Questions

- Нет.
