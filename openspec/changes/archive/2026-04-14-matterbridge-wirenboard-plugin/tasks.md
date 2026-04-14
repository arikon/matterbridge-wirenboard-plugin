## 1. Project Scaffolding

- [x] 1.1 Инициализировать npm-проект: `package.json` (name `matterbridge-wirenboard-plugin`, type `module`, dependencies: `mqtt`, `node-ansi-logger`, `node-persist-manager`, devDependencies: matterbridge types)
- [x] 1.2 Создать `tsconfig.base.json` и `tsconfig.build.json` (target ES2023, module NodeNext, strict mode)
- [x] 1.3 Создать `.gitignore` (`node_modules`, `dist`, `*.js`, `*.d.ts`, `*.map`)
- [x] 1.4 Проверить `npm install && npm run build` — компиляция без ошибок

## 2. TypeScript Types

- [x] 2.1 Создать `src/wirenboardTypes.ts`: интерфейсы `WbDeviceMeta`, `WbControlMeta`, `WbDevice`, `WbControl`, типы `WbControlType`, `WbDeprecatedControlType` (включая `wo-switch`, `dimmer`)
- [x] 2.2 Проверить компиляцию типов против matterbridge API

## 3. Control Mapping Table

- [x] 3.1 Создать `src/controlMapping.ts`: интерфейс `WbToMatterMapping` (wbType, wbUnits, readonly, matterDeviceType, matterClusterIds, matterAttribute, converter, reverseConverter, additionalSetup)
- [x] 3.2 Реализовать `normalizeDeprecatedType()` — нормализация deprecated типов (temperature→value+deg C, rel_humidity→value+%, voltage→value+V и т.д.)
- [x] 3.3 Реализовать маппинг switches & actuators: switch→onOffOutlet, readonly switch→contactSensor, wo-switch/pushbutton→genericSwitch
- [x] 3.4 Реализовать маппинг range/dimmer: range→dimmableLight, dimmer→dimmableLight (default max=65535); для `LevelControl.currentLevel` — масштаб **1–254** (Matter `minLevel`..`maxLevel`), не 0
- [x] 3.5 Реализовать маппинг RGB: rgb→extendedColorLight с конвертером R;G;B↔HSV
- [x] 3.6 Реализовать маппинг alarm: smoke→smokeCoAlarm, leak→waterLeakDetector, freeze→waterFreezeDetector, rain→rainSensor, fallback→contactSensor
- [x] 3.7 Реализовать маппинг temperature/humidity/pressure sensors (с отдельными конвертерами для Pa, mbar, bar)
- [x] 3.8 Реализовать маппинг illuminance (log scale), occupancy sensor (readonly switch + name match)
- [x] 3.9 Реализовать маппинг electrical measurements (W×1000, V×1000, mV×1, A×1000, mA×1); kWh→`cumulativeEnergyImported` как **`{ energy: ×1000000 }`** (EnergyMeasurement struct)
- [x] 3.10 Реализовать маппинг air quality sensors (CO2, CO, NO2, ozone, formaldehyde, PM1, PM2.5, PM10, radon, TVOC) с `classifyCO2()` и name-based определением газа
- [x] 3.11 Реализовать маппинг flow sensor (m³/h × 10)
- [x] 3.12 Реализовать name-based override маппинг: valve→waterValve, lock→doorLockDevice, fan→fanDevice, pump→pumpDevice, cover→coverDevice (с инвертированной конвертацией)
- [x] 3.13 Реализовать функцию `findMapping(meta, controlName, deviceOverrides?)` с приоритетом: config override → name match → type fallback
- [x] 3.14 Реализовать precision handling в reverse-конвертерах (округление до meta.precision)

## 4. Validation Spike — Unit Tests для конвертеров

- [x] 4.1 Настроить тестовый фреймворк (vitest или jest) в проекте
- [x] 4.2 Написать тесты для temperature конвертера: 23.5→2350, -10→-1000
- [x] 4.3 Написать тесты для pressure конвертеров: Pa×0.01, mbar×1, bar×1000
- [x] 4.4 Написать тесты для illuminance: lux=0→0, lux=1→1, lux=100→20001
- [x] 4.5 Написать тесты для WindowCovering: 0→10000 (closed), max→0 (open), reverse
- [x] 4.6 Написать тесты для electrical: A×1000, mA×1, W×1000, kWh×1000000
- [x] 4.7 Написать тесты для RGB: '128;0;255'→HSV→обратно '128;0;255'
- [x] 4.8 Написать тесты для AirQuality classification: <400→Good, 400-800→Fair, 800-1500→Moderate, 1500-2500→Poor, >2500→VeryPoor
- [x] 4.9 Написать тесты для switch: '1'→true, '0'→false, reverse
- [x] 4.10 Написать тесты для range/dimmer: min→**1** (Level Control), max→254, bounds clamping; hue/sat — отдельно 0–254
- [x] 4.11 Написать тесты для normalizeDeprecatedType() — все deprecated типы
- [x] 4.12 Написать тесты для findMapping() — приоритет config override > name match > fallback
- [x] 4.13 Проверить `npm run build && npm test` — всё компилируется и тесты проходят

**Gate:** Если тесты конвертеров выявляют проблемы — исправить маппинг и конвертеры ДО продолжения. Не переходить к Step 5+ пока все тесты не проходят.

## 5. MQTT Client

- [x] 5.1 Создать `src/wirenboardMqtt.ts`: класс `WirenboardMqtt extends EventEmitter`
- [x] 5.2 Реализовать конструктор с конфигом: mqttHost, mqttPort, mqttUsername, mqttPassword, mqttProtocol, mqttCaPath, mqttCertPath, mqttKeyPath
- [x] 5.3 Реализовать `start()`: подключение через `mqtt.connectAsync()`, reconnectPeriod=5000, connectTimeout=60000, TLS при mqtts/wss
- [x] 5.4 Реализовать подписку на `/devices/#` при подключении
- [x] 5.5 Реализовать `messageHandler()`: парсинг топиков по regex — device-meta, control-meta, control-value, control-error, device-error, device-removed, control-removed
- [x] 5.6 Реализовать поддержку JSON и legacy subtopic meta-форматов (JSON если payload начинается с `{`, иначе — отдельное поле)
- [x] 5.7 Реализовать обработку пустого payload как removal (emit device-removed/control-removed)
- [x] 5.8 Реализовать `publish(deviceName, controlName, value)` → публикация в `/devices/<name>/controls/<ctrl>/on`
- [x] 5.9 Реализовать `stop()` → `client.endAsync()`
- [x] 5.10 Реализовать эмиссию событий mqtt_connect/mqtt_disconnect
- [x] 5.11 Написать unit-тесты для messageHandler(): парсинг всех типов топиков, JSON и legacy meta, пустой payload

## 6. Device Builder

- [x] 6.1 Создать `src/wirenboardDevice.ts`: класс `WirenboardDevice`
- [x] 6.2 Реализовать `static async create()` для groupingMode 'device': корневой endpoint с BridgedDeviceBasicInformation, child endpoints для каждого маппящегося контрола
- [x] 6.3 Реализовать `static async create()` для groupingMode 'control': отдельный endpoint на каждый контрол
- [x] 6.4 Реализовать semantic tags через Matter Common Number namespace (id=7) с sequential tag для всех однотипных child endpoints (tagList никогда не пустой)
- [x] 6.5 Реализовать HW metadata extraction: Serial→serialNumber, FW Version→softwareVersionString, HW Batch Number→hardwareVersionString (без создания endpoints)
- [x] 6.6 Реализовать фильтрацию: hidden controls, unsupported types (log.warn), пустые устройства (log.info)
- [x] 6.7 Реализовать command handlers для writable контролов: on/off/toggle, moveToLevel, moveToHue/Saturation, setpointRaiseLower, valve open/close, lock/unlock
- [x] 6.8 Реализовать `updateFromMqtt(controlName, value)`: lookup в propertyMap, конвертация, setAttribute. Для airQualitySensor — дополнительно обновлять AirQuality.airQuality
- [x] 6.9 Реализовать echo suppression: noUpdate флаг на 2 секунды после команды, skip если значение не изменилось; для объектных converted — сравнение структурное (`matterConvertedValuesEqual`)
- [x] 6.10 Реализовать composite thermostat detection: temperature + setpoint → thermostatDevice (HeatingOnly / CoolingOnly / CoolingAndHeating), min/max из meta
- [x] 6.11 Написать unit-тесты для device builder: device mode, control mode, thermostat detection, HW metadata, echo suppression

## 7. Platform (Entry Point)

- [x] 7.1 Создать `src/module.ts`: класс `WirenboardPlatform extends MatterbridgeDynamicPlatform`
- [x] 7.2 Реализовать constructor: verifyMatterbridgeVersion('3.7.0'), создание WirenboardMqtt, mqtt.start(), подписка на все MQTT-события, накопление в deviceMap и controlValueCache
- [x] 7.3 Реализовать `onStart()`: await this.ready, clearSelect(), shouldStart=true, idle-based discovery (waiter + isDiscoveryIdle) с hard timeout; после registerDiscoveredDevices() — shouldConfigure=true (live обновления начинают поступать в Matter немедленно после старта сервера)
- [x] 7.4 Реализовать static discovery mode: ожидание конкретных устройств из config.devices[]
- [x] 7.5 Реализовать `registerDiscoveredDevices()`: failsafe check, валидация, setSelectDevice/setSelectDeviceEntity, validateDevice (whitelist/blacklist), WirenboardDevice.create(), configUrl, fixedLabel, registerDevice()
- [x] 7.6 Реализовать `onConfigure()`: super.onConfigure(), shouldConfigure=true, replayRetainedValues() (авторитетный override stale persisted значений, загруженных matter.js при старте сервера), coverDevice init (setWindowCoveringTargetAsCurrentAndStopped), colorMode init
- [x] 7.7 Реализовать обработку control-value после onConfigure: прямой вызов wbDevice.updateFromMqtt()
- [x] 7.8 Реализовать reachability management: error flags (r→unreachable, ""→reachable, w/p→log only), setAttribute + triggerEvent pattern, проверка maybeNumber
- [x] 7.9 Реализовать MQTT disconnect→all unreachable, reconnect→all reachable
- [x] 7.10 Реализовать dynamic registration: новые устройства после onStart() регистрируются динамически
- [x] 7.11 Реализовать device removal: пустой retained → unregisterDevice()
- [x] 7.12 Реализовать `onShutdown()`: super.onShutdown() → mqtt.stop() → опционально unregisterAllDevices()

## 8. Unit Tests — компоненты

- [x] 8.1 Написать unit-тесты для `WirenboardMqtt`: подключение, парсинг топиков, JSON и legacy meta, пустой payload, publish, reconnect events
- [x] 8.2 Написать unit-тесты для `WirenboardDevice`: device mode (child endpoints), control mode (отдельные endpoints), thermostat detection (HeatingOnly/CoolingOnly/CoolingAndHeating, running_state exclusion), HW metadata extraction, echo suppression, hidden controls skip
- [x] 8.3 Написать integration-тесты для `WirenboardPlatform`: lifecycle (onStart→onConfigure→onShutdown), discovery idle/timeout, failsafe, retained value replay, reachability management, dynamic registration
- [x] 8.4 Настроить mock: `setupTest()` helper с `addBridgedEndpointSpy` для перехвата вызовов matterbridge API
- [x] 8.5 Подготовить mock WB payload файлы (JSON): типичная инсталляция с разными типами устройств
- [x] 8.6 Покрытие Jest по `src/*.ts` (фактически, `npm test -- --coverage`): строки ~76% суммарно; `controlMapping.ts` / `wirenboardMqtt.ts` — **≥80%** строк; `wirenboardDevice.ts` — **~63%** (ветки composite/lighting/command handlers). Порог 80% для всех трёх файлов **не** выполнен — при необходимости расширить тесты позже.

## 9. Configuration

- [x] 9.1 Создать `matterbridge-wirenboard-plugin.config.json` со всеми параметрами и дефолтами
- [x] 9.2 Создать `matterbridge-wirenboard-plugin.schema.json`: JSON Schema для UI matterbridge (все поля, типы, enum, описания)

## 10. E2E Validation

- [x] 10.1 Подготовить mock MQTT retained dump: 3-5 устройств (реле, датчик температуры, диммер, RGB, термостат) с полным набором meta/value/error топиков
- [x] 10.2 Написать integration-тест: прогнать mock через WirenboardMqtt.messageHandler(), проверить корректное обнаружение всех устройств и контролов
- [ ] 10.3 **Ручная проверка** (не автоматизирована в репозитории): запуск в matterbridge — устройства в UI, Matter→MQTT switch, MQTT→Matter sensor
- [ ] 10.4 **Ручная проверка**: полный bidirectional + echo suppression на стенде
- [ ] 10.5 **Ручная проверка**: MQTT reconnect → unreachable/reachable

_Задачи 10.3–10.5 остаются чеклистом для оператора; код и unit/integration-тесты их не подтверждают._

## 11. Production Log Fixes

- [x] 11.1 Fix: tagList никогда не пустой — для >16 однотипных child endpoints использовать raw number в namespace 7 вместо пустого массива. Пустой tagList нарушает Matter spec constraint `"1 to 6"` на Descriptor.tagList (feature TAGLIST) и вызывает rollback транзакции в matter.js. Обнаружено из production-лога wb-map12e_221 (260 rollback транзакций).
- [x] 11.2 Fix: shouldConfigure=true устанавливается в конце onStart() (после registerDiscoveredDevices) — live MQTT обновления поступают в Matter сразу после старта сервера, не дожидаясь onConfigure. replayRetainedValues() вызывается только в onConfigure (авторитетный override stale persisted значений). Вызов в onStart был убран: matter.js сервер стартует асинхронно после onStart(), endpoints ещё не имеют node assignment, setAttribute бросает "Endpoint storage inaccessible".

## 12. Post-release Matter validation & repo tooling

- [x] 12.1 Level Control: `rangeToLevelControl` / `levelControlToRange`, OnOff по сырому WB, обработчики on/toggle с порогом `lastLevel > 1` (см. коммит `2e638ee`)
- [x] 12.2 kWh: `cumulativeEnergyImported` как `{ energy }`, reverseConverter с поддержкой struct
- [x] 12.3 `matterConvertedValuesEqual` в `updateFromMqtt` для object-shaped значений
