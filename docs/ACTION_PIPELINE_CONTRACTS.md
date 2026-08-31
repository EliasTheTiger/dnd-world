# D&D World: authoritative action pipeline

Версия контрактов: `1`.

```text
Intent → Context Evaluation → Available Actions → Validation
       → Resolution → Effects → State Update → User Feedback
```

Движок — единственный источник доступности действий. UI не проверяет игровые правила и не вызывает специализированные обработчики. Он отображает `ActionEvaluation` и для любой разрешённой кнопки вызывает только `gameActionExecute(actionId, evaluationToken)`.

## GameContext

Runtime schema: `dnd-world-game-context/1`.

| Поле | Контракт |
|---|---|
| `contextVersion` | Отпечаток релевантного состояния; защищает от устаревшей оценки |
| `currentCharacter` | Текущий участник: id, тип, имя, жив/повержен |
| `characteristics` | Характеристики, КД и скорость |
| `resources` | Хиты, действие, атаки, бонусное действие, реакция, взаимодействие, ячейки и заряды способностей |
| `conditions` | Эффективные состояния персонажа |
| `inventory` | Точные экземпляры и количества предметов |
| `equipment` | Экипировка по слотам |
| `abilities` | Способности и их runtime-состояние |
| `spells` | Книга заклинаний и подготовка |
| `currentScene` | Бой, раунд, текущий и сфокусированный участник |
| `environment` | Активные зоны, предметы на земле и флаги окружения |
| `allies`, `enemies` | Участники с хитами, КД, состояниями и эффектами |
| `distances` | Пары участников. Неизвестная дистанция явно хранится как `known: false`, а не угадывается |
| `activeEffects` | Активные эффекты текущего персонажа |
| `restrictions` | Очередь, жизнеспособность и блокирующие состояния |
| `gameMasterRights` | Явные права мастера, включая `canOverrideResult` |

`gameContextContractCheck` закрывает действие при неполном контексте. `contextVersion` считается по всему публичному контексту, включая сцену, окружение, союзников и противников, поэтому изменение любой релевантной части делает прежнюю оценку устаревшей.

## ActionDefinition

Runtime schema: `dnd-world-action-definition/1`. Определение существует только внутри движка.

| Поле | Контракт |
|---|---|
| `action` | Стабильный id, название, описание и значок |
| `source` | Тип и точный id источника: core, spell, ability, item, equipment, effect или foe action |
| `possibleTargets` | Политика min/max/relation и рассчитанные движком живые цели |
| `actionCost` | Ресурс, количество и владелец |
| `requirements` | Положительные предусловия |
| `restrictions` | Запреты с `reasonCode` и объяснением |
| `handler` | Единственный исполнимый обработчик; отсутствие handler делает определение недопустимым |
| `possibleResults` | Непустой список допустимых исходов |
| `requiredRolls` | Броски, значения которых вводят живые игроки |

Стоимость хода проверяет общая функция `combatSpendEvaluation`. Её же используют `combatCanSpend` и commit-маршруты, поэтому правило не копируется между UI и выполнением.

## ActionEvaluation

Runtime schema: `dnd-world-action-evaluation/1`.

Обязательные поля: `allowed`, `reasonCode`, `explanation`, `availableTargets`, `additionalVariants`, `requiredRolls`, `predictedResourceCosts`, `contextVersion`, `evaluationToken`.

- Разрешённая кнопка всегда имеет зарегистрированный handler, evaluation token и единый binding.
- Запрещённое действие рендерится как `disabled` с конкретным объяснением или скрывается политикой `presentation: "hide"`.
- Неполное определение, неизвестная цена, повреждённое правило и отсутствие целей закрываются fail-closed.
- Перед resolution движок повторяет evaluation на свежем `GameContext` и сравнивает token.

## ActionResult

Runtime schema: `dnd-world-action-result/1`.

| Поле | Смысл |
|---|---|
| `success`, `outcome` | Успешность и resolved/pending-input/cancelled/rejected/failed/overridden |
| `rolls` | Подтверждённые игроками броски |
| `appliedEffects` | Применённые эффекты |
| `stateChanges` | Изменения ресурсов, состояний, инвентаря, сцены и мира |
| `resourcesSpent` | Фактически израсходованные ресурсы |
| `createdEvents` | События `ACTION_INPUT_REQUESTED` или `ACTION_RESOLVED` |
| `userMessages` | Непустая обратная связь пользователю |
| `auditData` | Версия определения и контекста, причина, actor, время и override мастера |

`gameActionResultContractCheck` запрещает пустой результат. Отмена, stale token, повторный клик и ошибка handler тоже возвращают полноценный `ActionResult` с объяснением и audit data.

## Атомарность и override мастера

`gameActionExecute` сохраняет полный identity-aware checkpoint мира до handler. Исключение или `false` от handler восстанавливает персонажей, противников, бой, сцену, Story/Tadpole/Treasure-состояния, журнал, очереди бросков, runtime-токены, длительности и UI-контекст; частичный commit не остаётся. Один глобальный transaction lock не позволяет двум разным действиям выполняться параллельно. Существующие специализированные обработчики сохраняют свою последовательность `preflight → commit resources → consequences` внутри этой внешней границы.

Успешное действие считается завершённым только после подтверждённой записи campaign envelope с checksum, revision и durable receipt. Если read-back не подтверждает commit, внешний checkpoint восстанавливается и пользователь получает `FAILED_TO_PERSIST`, а не ложный успех. Долговечное хранилище выбирается единым слоем `window.storage → localStorage → IndexedDB`; память сеанса является только аварийной копией и не выдаёт receipt.

`gameActionOverrideLastResult({ success, reason, userMessage })` доступен только при `gameMasterRights.canOverrideResult` и только для последнего результата текущего боя. Он сохраняет исходный outcome и success, пользователя, новое решение и обязательную причину в `combat.actionAudit` и в журнале боя. В журнале боя есть видимое поле причины и явные элементы управления «Засчитать успех» и «Засчитать неудачу»; до появления результата они disabled с объяснением. UI не зависит от нативного `prompt`, поэтому override воспроизводимо тестируется обычными пользовательскими controls.

## Инвариант отсутствия dead buttons

`gameActionDeadButtonAudit()` проверяет каждый отрисованный action control:

1. разрешённая кнопка имеет зарегистрированный handler;
2. разрешённая кнопка привязана к `gameActionExecute`;
3. целей не меньше `possibleTargets.min`;
4. запрещённая кнопка имеет `disabled` и непустое объяснение.

Отдельные regression tests выполняют реальную разрешённую кнопку и спасбросок смерти до непустого `ActionResult`, проверяют disabled-состояние после расхода ресурса, глобальную сериализацию, rollback поздней ошибки и отсутствие прежнего `ReferenceError` в маршруте предметов. Статический инвариант допускает ровно один шаблон `combat-action` во всём приложении и запрещает прямые bindings всех семейств боевых обработчиков.
