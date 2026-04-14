## Context

Wirenboard -- контроллер автоматизации зданий, все устройства и контролы которого доступны через MQTT-брокер по конвенции `/devices/<name>/controls/<ctrl>`. Matterbridge -- Node.js-платформа для создания Matter-мостов через плагины. Плагин должен связать эти два мира: читать MQTT-топики WB, строить Matter endpoints и обеспечивать двунаправленную синхронизацию.

Архитектурно плагин следует паттернам существующих matterbridge-плагинов (zigbee2mqtt, shelly) — extends `MatterbridgeDynamicPlatform`, lifecycle через `onStart`/`onConfigure`/`onShutdown`, idle-based discovery.

**Ключевые ограничения:**

- Matterbridge API >= 3.7.0 (обязательная проверка в конструкторе)
- Matter: лимит ~250 endpoints на bridge
- WB MQTT: retained messages, JSON и legacy subtopic meta-форматы, deprecated control types
- Lifecycle ordering: child endpoints строятся ДО `registerDevice()`, values replay — только в `onConfigure()` (matter.js сервер стартует после `onStart()`, `setAttribute` до старта невозможен)

## Goals / Non-Goals

**Goals:**

- Автоматическое обнаружение всех WB-устройств через MQTT retained messages
- Полный маппинг актуальных и deprecated типов контролов WB на Matter device types
- Двунаправленная синхронизация состояний с echo suppression
- Составной thermostat из отдельных WB-контролов
- Name-based и config-based переопределение маппинга (valve, lock, fan, cover и т.д.)
- Конфигурация через JSON Schema UI matterbridge
- Graceful handling: reconnect, error flags, dynamic registration

**Non-Goals:**

- MQTT RPC (`/rpc/v1/`) -- не используется в v1
- Firmware update устройств через Matter OTA
- Кастомные Matter кластеры для WB-специфичных функций
- Поддержка контролов без Matter-аналога (text, sound_level, wind_speed, rainfall, water_consumption, resistance, heat_power, heat_energy)

## Decisions

### 1. DynamicPlatform вместо AccessoryPlatform

**Выбор:** `MatterbridgeDynamicPlatform`

**Почему:** WB-инсталляции содержат произвольное количество устройств, обнаруживаемых динамически. AccessoryPlatform подходит для одного устройства. DynamicPlatform позволяет регистрировать/удалять устройства в runtime.

### 2. Idle-based discovery вместо таймера

**Выбор:** Discovery завершается, когда нет новых meta-сообщений в течение `discoveryIdleMs` (default 1000ms), с hard timeout `discoveryTimeout` (default 30s).

**Альтернатива:** Фиксированный таймер. Отклонено — при медленном MQTT-брокере можно не дождаться всех retained, при быстром — ждать впустую.

**Почему:** Retained messages приходят пачкой при подключении. Idle detection адаптируется к скорости брокера. Hard timeout защищает от бесконечного ожидания.

### 3. Два режима группировки

**Выбор:** `groupingMode: 'device'` (default) и `groupingMode: 'control'`.

**Почему:** В режиме `device` — компактная структура (меньше endpoints, ближе к физической модели). В режиме `control` — каждый контрол виден отдельно в Apple Home/Google Home (лучший UX, но быстрее исчерпывается лимит ~250 endpoints).

### 4. Event-driven архитектура (EventEmitter)

**Выбор:** `WirenboardMqtt extends EventEmitter` эмитирует typed events (`device-meta`, `control-meta`, `control-value`, `control-error`).

**Альтернатива:** Callback-based или polling. Отклонено — EventEmitter даёт loose coupling между MQTT-клиентом и Platform, упрощает тестирование.

### 5. Накопление данных до onStart, replay в onConfigure, shouldConfigure в onStart

**Выбор:**

- В конструкторе: MQTT подключается, retained messages накапливаются в `deviceMap` и `controlValueCache`
- В `onStart()`: ожидание idle → `registerDevices()` → `shouldConfigure=true`
- В `onConfigure()`: `replayRetainedValues()` применяет cached values к Matter-атрибутам (authoritative override stale persisted state)

**Почему:** matter.js сервер стартует асинхронно после возврата из `onStart()`. Вызов `setAttribute` до старта сервера невозможен — endpoints не имеют node assignment (matter.js бросает "Endpoint storage inaccessible"). Поэтому `replayRetainedValues()` вызывается только в `onConfigure()`, когда сервер уже запущен. `shouldConfigure=true` в `onStart` нужен для live MQTT обновлений: 30-секундное окно между стартом сервера и `onConfigure()` покрывается прямой маршрутизацией входящих `control-value` событий через `updateFromMqtt()`.

### 6. Echo suppression через noUpdate флаг

**Выбор:** После отправки команды Matter→MQTT — устанавливается `noUpdate` флаг на 2 секунды. MQTT-ответ с тем же значением игнорируется.

**Почему:** WB-устройства публикуют текущее состояние после получения команды. Без echo suppression Matter-контроллер получает "лишнее" обновление, что может вызывать мерцание UI.

### 7. Failsafe count

**Выбор:** Опциональный `failsafeCount` — минимальное количество устройств для регистрации. Если найдено меньше — ошибка.

**Почему:** Защита от ситуации, когда MQTT-брокер вернул мало устройств (сетевая проблема). Без failsafe matterbridge удалит "пропавшие" устройства и пользователь потеряет автоматизации контроллера.

### 8. Нормализация deprecated типов

**Выбор:** `normalizeDeprecatedType()` преобразует deprecated типы (`temperature`, `rel_humidity`, `voltage` и т.д.) в стандартную форму `value` + units перед поиском маппинга.

**Альтернатива:** Отдельные записи в таблице маппинга для каждого deprecated типа. Отклонено — дублирование логики конвертеров.

**Почему:** Единая точка входа в маппинг. Deprecated типы — legacy, но активно используются старыми WB-драйверами.

### 9. Name-based маппинг с приоритетами

**Выбор:** Приоритет определения Matter device type:

1. `deviceOverrides` в конфиге (безусловно)
2. Substring match по имени контрола (case-insensitive): valve→waterValve, lock→doorLockDevice и т.д.
3. Fallback по `meta.type`: switch→onOffOutlet, alarm→contactSensor, range→dimmableLight

**Почему:** Один и тот же WB тип `switch` может быть розеткой, клапаном, замком или вентилятором. Имя контрола — наиболее надёжный эвристический признак. Config override — для случаев, когда эвристика не работает.

### 10. Составной thermostat

**Выбор:** Автоматическое обнаружение комбинации контролов (temperature readonly + setpoint range + опционально mode enum) в одном WB-устройстве → создание единого `thermostatDevice`.

**Почему:** WB не имеет единого "thermostat" контрола. Без объединения пользователь видит отдельные сенсор температуры и range setpoint — бесполезно для автоматизации Climate в Apple Home.

### 11. File structure — 5 модулей

```
src/
├── module.ts           # WirenboardPlatform — entry point, lifecycle
├── wirenboardMqtt.ts   # MQTT client, topic parsing, EventEmitter
├── wirenboardDevice.ts # Matter endpoint construction, bidirectional state sync
├── wirenboardTypes.ts  # TypeScript interfaces для WB MQTT conventions
└── controlMapping.ts   # Mapping table: WB control type → Matter device type/cluster
```

**Почему:** Каждый модуль имеет чёткую ответственность. `controlMapping` — чистые функции без side-effects (легко тестировать). `wirenboardMqtt` изолирует MQTT-протокол. `wirenboardDevice` инкапсулирует Matter endpoint logic.

### 12. Level Control: не записывать `currentLevel = 0`

**Выбор:** Для `LevelControl.currentLevel` (диммер, range→свет, яркость в композите света) масштабировать WB→Matter в **1..254** (`rangeToLevelControl` / `levelControlToRange`). Для Hue/Saturation оставить отдельные конвертеры **0..254**, где это допустимо кластером ColorControl.

**Почему:** Matter валидирует уровень относительно `minLevel`/`maxLevel` кластера; значение **0** часто вне допустимого интервала → rollback транзакции (`setStateOf`).

### 13. Электроэнергия: `cumulativeEnergyImported` как struct

**Выбор:** Конвертер kWh выдаёт `{ energy: Math.round(kWh × 1_000_000) }`, reverse читает `v.energy` при объекте.

**Почему:** В спецификации атрибут имеет тип `EnergyMeasurement`, не `uint64` в корне.

### 14. Равенство значений после конвертации (MQTT→Matter)

**Выбор:** Сравнение `lastValue` с новым `converted` для пропуска лишних `setAttribute` — для объектов через структурное сравнение (например `JSON.stringify`), не через `String(obj)`.

**Почему:** Иначе все объекты сравниваются как `"[object Object]"` и обновления энергии не доходят до Matter.

### 15. Документация и линтер в репозитории

**Выбор:** В корне плагина — `CLAUDE.md` (навигация по модулям для ИИ/разработчиков), `eslint.config.js` (ESLint flat config).

**Почему:** Единый стиль и быстрый онбординг без изменения runtime-поведения плагина.

## Risks / Trade-offs

**[Matter endpoint limit ~250]** → В режиме `control` при большой WB-инсталляции (50+ устройств с 5+ контролами) лимит исчерпывается. Mitigation: режим `device` по умолчанию, whitelist/blacklist для фильтрации.

**[Name-based heuristics false positives]** → Контрол с именем "Valve Status" может быть readonly sensor, а не actuator. Mitigation: `deviceOverrides` позволяет переопределить любой маппинг; readonly контролы маппятся на sensor types.

**[MQTT reconnect — потеря промежуточных значений]** → При обрыве MQTT retained messages не теряются на брокере, но non-retained изменения могут быть пропущены. Mitigation: при reconnect все retained приходят заново; non-retained обновления синхронизируются при следующем publish.

**[Thermostat detection false positives]** → Устройство с temperature sensor и range контролом может быть не термостатом. Mitigation: требуется совпадение по именам (setpoint/target) и units (deg C) одновременно. Config override как fallback.

**[Matterbridge API breaking changes]** → `verifyMatterbridgeVersion('3.7.0')` защищает от запуска на несовместимой версии. При обновлении matterbridge может потребоваться адаптация.

**[Apple Home не поддерживает все Matter device types]** → waterValve, pressureSensor, electricalSensor и другие типы могут не отображаться. Mitigation: log.warn при регистрации неподдерживаемых типов; пользователь может skip через blacklist.

## Controller Compatibility

| Controller   | Endpoint Limit | Known Quirks                                                                                                            |
| ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Apple Home   | ~149           | Composed devices (device mode) могут работать нестабильно; waterValve, pressureSensor, electricalSensor не отображаются |
| Google Home  | ~250           | Полная поддержка composed devices                                                                                       |
| Amazon Alexa | ~50            | Инвертированные шторы (WindowCovering) могут работать некорректно                                                       |

При регистрации device types, не поддерживаемых контроллерами — логировать warning.

## Matter 1.5 Roadmap (out of scope for v1)

Следующие device types появятся в matter.js при поддержке Matter 1.5 и могут быть добавлены в будущих версиях:

- `soilMoistureSensor` / `soilTemperatureSensor` — для WB датчиков почвы
- `closureSensor` / `closurePanel` — для WB контактных датчиков
- `irrigationSystem` — для WB контроллеров полива

Также out of scope для v1: `airConditioner`, `waterHeater`, `evse`, `speakerDevice`, reactive power measurement.

## Open Questions

- Оптимальное значение `discoveryIdleMs` для инсталляций с 100+ устройствами — может потребоваться увеличение
- Стратегия обновления при изменении meta.type контрола в runtime (wb-rules dynamic controls) — пересоздание endpoint требует unregister/register
