# BG3 item economy audit — bg3-24532579-v10

Проверен объединённый набор из **10284** идентификаторов. Источник подтверждает Standard для **10282**; ещё **2** записи проверены, но не выдаются Standard-загрузчиком.

Неразрешённых значений: **0**. Настоящий ноль хранится как число; неприменимость хранится как `null` и показывается «не применяется».

Проверено конфликтов между применимыми ветвями источника: **12**; каждый разрешён явно, непросмотренных конфликтов: **0**.

| Область | Предметов | Вес: значения | Вес: 0 | Вес: неприменим | Цена: значения | Цена: 0 | Цена: неприменима |
|---|---:|---:|---:|---:|---:|---:|---:|
| Аудит union | 10284 | 10200 | 130 | 84 | 10130 | 88 | 154 |
| Production Standard | 10282 | 10198 | 129 | 84 | 10128 | 88 | 154 |

## Основания веса — Production Standard

| Метод | Количество |
|---|---:|
| embedded-root-uuid | 1 |
| not-applicable | 72 |
| physics-template | 9 |
| reviewed-conflict | 3 |
| reviewed-conflict-not-applicable | 8 |
| reviewed-exception | 1 |
| reviewed-not-applicable | 3 |
| root-ancestor | 62 |
| root-resolved-stats | 1 |
| root-sibling | 4 |
| root-source-not-applicable | 1 |
| source-weight | 10111 |
| visual-and-physics-template | 3 |
| visual-template | 3 |

## Основания стоимости — Production Standard

| Метод | Количество |
|---|---:|
| embedded-root-price | 1 |
| gold-value-curve | 9252 |
| not-applicable | 32 |
| reviewed-not-applicable | 3 |
| root-ancestor-price | 13 |
| root-not-applicable | 118 |
| root-resolved-stats | 1 |
| root-source-not-applicable | 1 |
| value-override | 861 |

Каждый fallback и каждый заблокированный для Standard идентификатор перечислен в `item-economy-report.json`.
