## 1. Анализ API Matter (@matter/main)

- [x] 1.1 Проверить в зависимостях matterbridge точные имена атрибутов `ElectricalPowerMeasurement` (reactivePower, apparentPower, powerFactor, frequency) и `ElectricalEnergyMeasurement` для reactive/apparent cumulative energy (kvarh/kVAh), а также типы `harmonicCurrents` / `harmonicPhases` для `%` THD
- [x] 1.2 Зафиксировать кодирование `powerFactor` и `frequency` (int64s), чтобы сценарии из delta-spec совпадали с реализацией

## 2. Маппинг в `controlMapping.ts`

- [x] 2.1 Добавить записи `CONTROL_MAPPINGS` для `var`, `VA`, `ratio`, `Hz`; конвертеры согласовать с масштабами W/V/A и с кластером EPM
- [x] 2.2 Добавить `kvarh` и `kVAh` на соответствующие атрибуты `ElectricalEnergyMeasurement` (структура `{ energy }` как для kWh, при отсутствии раздельных полей — задокументировать ограничение из design)
- [x] 2.3 Добавить `deg` для фазового угла (не путать с `deg C`)
- [x] 2.4 Добавить правило `value` + `%` с `nameKeywords` (`thd`, `hr`, `harm`) для гармоник **перед** общим `%` → humidity (порядок и Pass 1/2 как в `findMapping`)
- [x] 2.5 При необходимости расширить список `matterClusterIds` / серверные кластеры для `electricalSensor`, если текущий тип не экспортирует нужные опциональные атрибуты

## 3. Тесты и регрессия

- [x] 3.1 Unit-тесты в `test/controlMapping.test.ts` на новые `wbUnits` и на различение `%` THD vs humidity
- [x] 3.2 При изменении endpoint’ов — обновить/дополнить `test/wirenboardDevice.test.ts` или связанные тесты

## 4. Документация

- [x] 4.1 Кратко описать поддерживаемые единицы MAP и ограничения (kvarh/kVAh, гармоники) в `AGENTS.md` или `README.md` плагина
- [x] 4.2 Прогнать `npm test` и `npm run lint`
