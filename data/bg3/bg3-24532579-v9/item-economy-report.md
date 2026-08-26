# BG3 item economy audit — bg3-24532579-v9

Проверены все **10284** предмета и все объявленные профильные materialization bundle. Пустых значений веса и цены после сборки: **0**.

## Итог

| Профиль | Материализаций | Заполнено пропусков веса | Нулевой вес | Заполнено цен | Нулевая цена |
|---|---:|---:|---:|---:|---:|
| catalog | 10284 | 171 | 212 | 10284 | 241 |
| honour | 10282 | 171 | 211 | 10282 | 241 |

## Источники веса (catalog)

| Метод | Количество |
|---|---:|
| embedded-root-uuid | 1 |
| not-applicable | 72 |
| physics-template | 17 |
| reviewed-exception | 5 |
| root-ancestor | 62 |
| root-resolved-stats | 1 |
| root-sibling | 4 |
| source-weight | 10113 |
| visual-and-physics-template | 6 |
| visual-template | 3 |

## Источники цены (catalog)

| Метод | Количество |
|---|---:|
| embedded-root-price | 1 |
| gold-value-curve | 9254 |
| not-applicable | 32 |
| reviewed-not-applicable | 3 |
| root-ancestor-price | 14 |
| root-not-applicable | 118 |
| root-resolved-stats | 1 |
| value-override | 861 |

Полная построчная трассировка всех заполненных fallback-случаев находится в `item-economy-report.json`.
