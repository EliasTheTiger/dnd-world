# Архитектурный аудит D&D World

Дата среза: 2026-08-30. Репозиторий: `EliasTheTiger/dnd-world`. Аудит выполнен по рабочему дереву и автоматизирован инструментом `scripts/audit-capabilities.mjs`.

## Вывод

Проект является статическим одностраничным приложением: UI, справочники, миграции, игровой движок, Firebase REST-синхронизация и большая часть состояния объединены в `index.html`. Отдельного backend/API и серверной схемы данных нет. Поэтому подсистемы исторически связывались через глобальные массивы и побочные эффекты, а не через версионированные доменные границы.

В ходе реализации дорожной карты добавлены: проверяемый Campaign Envelope с CAS и checksum, Ruleset Registry, Definition Repository, Action Kernel, точная экономика и торговля, каталоговый gate полноты, World State, структурированные UI-ошибки, неперсистентные projections и CI-gate. Эти слои не объявляют старый долг исчезнувшим: они делают его наблюдаемым и дают маршрут миграции без одномоментного переписывания монолита.

## Доказанные системные дефекты

| Приоритет | Дефект | Доказательство | Текущее состояние |
|---|---|---|---|
| P0 | Сохранение было набором независимых ключей и snapshot без CAS | `runScheduledSave`, `syncPersistLocal`, Firebase `PUT` | Добавлен `scripts/persistence-core.js`: checksum, revision/parentRevision, CAS, backup, read-back receipt. Legacy keys пока записываются как совместимость. |
| P0 | Облако могло перетереть параллельную запись | прежний `syncPushNow` выполнял безусловный `PUT` | GET+ETag, parent revision и `if-match`; stale writer получает явный конфликт. |
| P0 | Действия не имели обязательной durable-фазы | обработчики планировали `scheduleSave()` после мутации | Боевой маршрут подключён к `ActionKernel`; ошибка durable-save откатывает snapshot. |
| P1 | Нет единого источника правил | проверки `2014` и `5e-2014` были разбросаны по коду | `data/rulesets/manifest.json` фиксирует `dnd5e-2014-local` и BG3 Standard extension. |
| P1 | Определения искались напрямую в массивах | машинный аудит: 60 `itemsDB/spellsDB/...find` | `DefinitionRepository` уже владеет `itemOf`, `spellOf`, `abilityOf`; остальные прямые чтения — миграционный долг. |
| P1 | Полнота заклинаний/черт не измерялась | `seedSpellsDB`/`seedAbilitiesDB` + выборочные `ensure*Audit` | Каталоги помечены `expected.mode=unknown`; неподтверждённый импорт fail-closed. |
| P1 | Scene/world имеют параллельные формы | `combat`, `bg3SceneState`, `bg3StoryState`, новый `worldState` | `WorldState` введён и сохраняется, но перенос BG3/combat в единственный write-model ещё не завершён. |
| P1 | UI связан с глобальными функциями | 376 inline event-атрибутов | 0 отсутствующих обработчиков; боевые действия получают `ActionDescriptor`. Аудит остаётся обязательным CI-сигналом. |
| P2 | Ошибки скрываются | 58 пустых `catch` по машинному аудиту | Новые модули возвращают coded error/user error; старые пустые блоки перечисляются аудитом и должны заменяться по маршрутам. |
| P2 | Производные модели могли стать вторым источником истины | legacy fields + `mechanics`, item domain v7 | `ProjectionCache` и save sanitizer запрещают `domainV7`, `computedStats`, `actionDescriptors` в Campaign Envelope. Legacy `mechanics` пока совместим. |
| P2 | Монолит препятствует изоляции тестов и поставке | `index.html` около 4 MB | CSS вынесен в `styles.css`, новые ядра — в `scripts/*.js`; дальнейшее извлечение должно быть семантическим, не массовым. |

Текущий статический аудит: 376 inline-событий, 128 реально разрешённых имён обработчиков, 0 отсутствующих обработчиков, 37 имён прямых gameplay/UI маршрутов, 58 пустых `catch`, 60 прямых поисков по definition-массивам, 2 вызова случайности только для технических ID (не для игровых бросков).

## Почему запросы на максимум заклинаний и черт не были выполнены

Причина не в редакции правил: проект однозначно реализует 2014 ruleset. Это доказано проверкой `spellcasting.edition === '2014'`, предметным `rules.edition === '5e-2014'` и правилом бонусного заклинания, подписанным как 5e 2014.

Фактическая причина — отсутствие импортного контракта:

1. Нет утверждённого источника полного набора spell/feature ID.
2. Не зафиксированы лицензия и provenance этого корпуса.
3. Нет expected-ID census, поэтому слово «максимум» раньше невозможно было проверить тестом.
4. `ensureSpellAudit` и `ensureAbilityAudit` исправляют выбранные записи и migration flags, но не сравнивают базу с эталонным множеством.
5. Текстовая запись могла появиться в UI без доказательства исполнимости механики.

Теперь `data/catalogs/source-manifest.json` делает ограничение явным: локальные spell/feature каталоги `unverifiable`, а `planImport` отклоняет неутверждённый источник. Это предотвращает очередное частичное «расширение», но само по себе не даёт права копировать закрытый официальный корпус. Для завершения наполнения нужен одобренный пользователем легальный dataset с ID и provenance.

## Фактические источники истины

| Домен | Источник истины | Переходные копии |
|---|---|---|
| Campaign state | `dnd-world-campaign-envelope/1` | `world-snapshot/1`, per-key localStorage |
| Предметы | Definition Repository: local item layer + immutable pinned BG3 catalog | legacy item fields; item-domain v7 — derived projection |
| Персонажи и инвентарь | `chars` внутри Campaign Envelope | `dndworld2:chars` |
| Заклинания/черты | Definition Repository, ruleset ref | inline seeds и patch migrations |
| Цены/валюта | `DndEconomy`, exact minor units, wallets и audit journal | отображаемые строки `cost` |
| Торговля | `DndMerchants` transaction journal + merchant/character wallets | UI form state |
| Бой/действия | ActionDefinition/Evaluation/Result + Action Kernel | прямые subflow handlers cast/item |
| Scene/world | `WorldState` — целевая модель | `combat`, `bg3SceneState`, `bg3StoryState` пока остаются write-models |

## Проверяемые команды

- `node scripts/audit-capabilities.mjs`
- `node scripts/save-inspector.mjs <save-file>`
- `node --test tests/*.test.*`
- `git diff --check`
