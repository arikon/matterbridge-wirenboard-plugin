## 1. Configuration

- [x] 1.1 Зафиксировать ключ **`ignoreSystemControls`**: boolean, **default `true`** в схеме/README плагина.
- [x] 1.2 Читать значение в `WirenboardPlatform` из `PlatformConfig` с безопасным приведением типа; если ключ отсутствует — **`true`**.

## 2. WirenboardDevice

- [x] 2.1 Добавить в `WirenboardDevice.create` параметр **`ignoreSystemControls`** (или согласованное имя поля в опциях) с дефолтом **`true`** при вызове из платформы.
- [x] 2.2 Ввести функцию `isSystemDevice(deviceName: string): boolean` — `deviceName.startsWith("system__")`.
- [x] 2.3 В цикле немаппируемых контролов: если нет `mapping`, при **`ignoreSystemControls === true`** и `isSystemDevice(deviceName)` вызывать `log.debug(...)`; иначе **`log.warn(...)`** (включая system при **`false`**).

## 3. Вызовы и тесты

- [x] 3.1 Пробросить флаг из `registerWbDevice` / всех путей вызова `WirenboardDevice.create` в `module.ts`.
- [x] 3.2 Unit-тест(ы): при **`ignoreSystemControls: true`** (и дефолте) и имени `system__…` — ожидать **`log.debug`**, не `warn`; при **`false`** и system — **`warn`**; для не-system при **`true`** — по-прежнему **`warn`**.

## 4. Документация

- [x] 4.1 Обновить `CLAUDE.md` или раздел конфигурации плагина одной строкой про **`ignoreSystemControls`** и дефолт **`true`**.
