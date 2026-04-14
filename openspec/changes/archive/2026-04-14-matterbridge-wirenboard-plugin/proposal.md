## Why

Wirenboard -- популярный контроллер автоматизации с MQTT-интерфейсом, но он не поддерживает протокол Matter напрямую. Пользователи не могут интегрировать устройства WB в экосистемы Apple Home, Google Home и другие Matter-совместимые платформы. Плагин для matterbridge решает эту проблему, создавая мост между MQTT-конвенциями Wirenboard и Matter-устройствами.

## What Changes

- Создание нового npm-пакета `matterbridge-wirenboard-plugin` -- плагина для matterbridge (DynamicPlatform)
- MQTT-клиент для подключения к брокеру Wirenboard (mqtt/mqtts/ws/wss) с автоматическим reconnect и TLS
- Автоматическое обнаружение устройств через retained MQTT-топики `/devices/+/meta` и `/devices/+/controls/+/meta`
- Маппинг всех типов контролов WB (switch, value, range, dimmer, rgb, alarm, pushbutton, wo-switch) на Matter device types с двунаправленной синхронизацией состояний
- Поддержка name-based маппинга (valve, lock, fan, cover, smoke sensor и т.д.) и deviceOverrides в конфигурации
- Составной маппинг термостата из отдельных WB-контролов (temperature + setpoint + mode)
- Извлечение HW-метаданных (Serial, FW Version) из служебных контролов для BridgedDeviceBasicInformation
- Два режима группировки: `device` (1 WB device = 1 Matter bridged device с child endpoints) и `control` (1 WB control = 1 Matter device)
- Whitelist/blacklist фильтрация, failsafe count, dynamic registration новых устройств
- Поддержка deprecated WB control types через нормализацию в стандартную форму
- Обработка error flags (r/w/p) для управления reachability
- Конфигурация через JSON schema для UI matterbridge

**Доработки после интеграции в production (ветка `main`, в т.ч. коммиты `2e638ee`, `47b0e04`):**

- **Level Control / диммеры:** яркость в Matter задаётся в допустимом для кластера диапазоне **1..254** (`currentLevel`), а не **0** — иначе matter.js откатывает транзакцию (constraint `minLevel`..`maxLevel`). `OnOff` для range/dimmer синхронизируется по **сырому** значению WB (0 = выкл). Обработчики on/toggle учитывают, что «выкл» по WB соответствует уровню **1** в Matter.
- **Энергия kWh:** `ElectricalEnergyMeasurement.cumulativeEnergyImported` задаётся как структура **`{ energy }`** (EnergyMeasurement), не скаляр.
- **Сравнение «значение не изменилось»:** для объектных конвертеров (энергия) используется глубокое сравнение, иначе `updateFromMqtt` некорректно пропускает обновления.
- **Lifecycle / порядок старта:** `shouldConfigure` в конце `onStart`; авторитетный `replayRetainedValues()` в `onConfigure` для override stale persisted state (см. задачи 11.1–11.2 и platform-lifecycle spec).
- **Репозиторий:** добавлены `CLAUDE.md` (обзор для ассистентов) и `eslint.config.js` (flat config для линтинга).

## Capabilities

### New Capabilities

- `mqtt-client`: MQTT-подключение к брокеру Wirenboard -- протоколы (mqtt/mqtts/ws/wss), TLS, reconnect, парсинг топиков `/devices/#`, обработка retained messages, поддержка JSON и legacy subtopic meta-форматов
- `control-mapping`: Маппинг типов контролов WB на Matter device types и кластеры -- таблица маппинга, конвертеры значений (включая RGB<->HSV, lux->log scale, pressure units, electrical units), name-based routing (valve/lock/fan/cover/smoke и т.д.), нормализация deprecated типов, AirQuality classification
- `device-builder`: Построение Matter endpoint tree из WB-устройств -- два режима группировки (device/control), child endpoints с semantic tags, command handlers для двунаправленной синхронизации, echo suppression, HW metadata extraction, составной thermostat mapping
- `platform-lifecycle`: Lifecycle плагина matterbridge -- idle-based и static discovery, failsafe count, device registration, retained value replay в onConfigure, reachability management (error flags + MQTT disconnect/reconnect), dynamic registration после onStart, graceful shutdown
- `configuration`: Конфигурация плагина -- JSON config и JSON Schema для UI matterbridge, параметры MQTT-подключения, discovery settings, grouping mode, whitelist/blacklist, deviceOverrides для переопределения маппинга

### Modified Capabilities

_(нет существующих capability для модификации -- это новый проект)_

## Impact

- **Зависимости**: matterbridge >= 3.7.0, mqtt (npm), node-ansi-logger, node-persist-manager
- **Платформа**: Node.js, TypeScript (ES2023, NodeNext modules, strict mode)
- **Внешние системы**: MQTT-брокер Wirenboard (read/write), Matter fabric через matterbridge
- **Совместимость**: Matter controllers (Apple Home, Google Home, Amazon Alexa и др.) -- некоторые device types (waterValve, pressureSensor) могут не поддерживаться всеми контроллерами
- **Лимиты**: ~250 Matter endpoints на bridge -- в режиме `control` исчерпывается быстрее
