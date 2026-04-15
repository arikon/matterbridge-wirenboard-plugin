## Context

`WirenboardPlatform.onStart()` вызывает `matterbridge` `waiter()` для discovery/failsafe и затем последовательно `registerWbDevice` → `registerDevice` для каждого endpoint. Пока промис `onStart` не завершён, Matterbridge обычно не переводит процесс в shutdown; **SIGINT** обрабатывается между тиками event loop — длинные цепочки `await` без проверки отмены удерживают процесс.

## Goals / Non-Goals

**Goals:**

- Кооперативная отмена: флаг, выставляемый по **SIGINT** / **SIGTERM** и в начале **`onShutdown`**.
- Прерываемые ожидания discovery/failsafe (проверка флага на каждом интервале в production).
- Выход из циклов регистрации устройств и эндпоинтов; при сигнале во время startup — **`mqtt.stop()`**, чтобы не копить трафик.
- Не регистрировать обработчики сигналов при **`NODE_ENV=test`** (Jest): сохранить замоканный `waiter` и отсутствие утечек слушателей.
- Задокументировать: один уже выполняющийся **`await registerDevice`** отменить из плагина нельзя (ограничение Matterbridge/Matter.js).

**Non-Goals:**

- Отмена или таймаут внутри `matterbridge.registerDevice` / Matter.js.
- Изменение контракта Matterbridge lifecycle.

## Decisions

1. **Флаг `startupAbortRequested`** — простой bool, проверяется в циклах ожидания и регистрации. Альтернатива `AbortController`: избыточно для одного сценария.

2. **Два пути для ожиданий** — в **production** собственный цикл с `setTimeout` + проверка флага; в **`NODE_ENV=test`** делегирование в **`matterbridge/utils` `waiter`** (уже замокан в `module.test.ts` для быстрого failsafe). Иначе тест «failsafe not met» ждёт реальные 60 с.

3. **`process.on('SIGINT'|'SIGTERM')` только вне тестов** — условие `process.env.NODE_ENV === "test"` в `attachStartupAbortHandlers`.

4. **`setImmediate` между устройствами** в `registerDiscoveredDevices` — чаще отдать управление event loop (обработка сигналов).

## Risks / Trade-offs

- **[Частично зарегистрированное устройство]** при прерывании внутри цикла по эндпоинтам → Mitigation: лог предупреждения; при необходимости оператор перезапускает или включает `unregisterOnShutdown`.

- **[Дублирование слушателей]** при горячей перезагрузке плагина → Mitigation: в типичном процессе один экземпляр платформы; при необходимости расширить в будущем `removeListener`.

## Migration Plan

Только обновление кода и документации; конфиг не меняется.

## Open Questions

_None._
