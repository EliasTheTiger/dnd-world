# Дорожная карта и статус реализации

Все этапы выполняются независимо и не требуют pull request. `Done` означает завершение архитектурного контракта и тестов; переходные legacy paths перечислены отдельно.

| Этап | Статус | Проблема и решение | Файлы / миграция | Тесты | Риски и критерий завершения |
|---|---|---|---|---|---|
| R0 Save forensics | Done | Форматы нельзя было отличить от пустой кампании. Добавлен read-only inspector и fixtures. | `scripts/save-inspector.mjs`, `docs/SAVE_FORMATS.md`, `tests/fixtures/saves/*`; данных не меняет. | `save-inspector.test.mjs` | Corrupt/incompatible/duplicates/missing refs диагностируются без записи. |
| R1 CI gate | Done | Pages мог публиковаться без полного теста. Deploy зависит от test→build. | `.github/workflows/pages.yml`; миграций нет. | `ci-contract.test.mjs`, `pages-build.test.mjs` | `node --test tests/*.test.*` обязан пройти до artifact. |
| R2 Persistence | Done | Lost update, partial save, silent seed. Envelope checksum/CAS/backup/receipt и Firebase ETag CAS. | `persistence-core.js`, schema, `index.html`; world-snapshot мигрируется с backup. | `persistence-core.test.cjs` | Один из concurrent writers; повреждение fail-closed; успешное действие имеет receipt. |
| R3 Ruleset | Done | Редакция была неявной. Зафиксирован 2014 core и Standard-расширение предметов. | `ruleset-registry.js`, `data/rulesets/manifest.json`; envelope хранит refs. | `ruleset-registry.test.cjs` | Unknown/mismatch definition не исполняется. |
| R4 Definitions | Done / migration ongoing | Поиск по дублирующим массивам. Введены kind:id, layers и duplicate gate. | `definition-repository.js`, `itemOf/spellOf/abilityOf`; legacy arrays остаются source layer. | `definition-repository.test.cjs` | Один приоритетный результат; missing refs имеют owner. Осталось заменить 60 прямых `.find`. |
| R5 Action Kernel | Done / adapters ongoing | Не было общей последовательности и rollback на save failure. | `action-kernel.js`, боевой adapter в `index.html`, `ACTION_PIPELINE_CONTRACTS.md`. | `action-kernel.test.cjs`, effect regressions | validate→prepare→one commit→consequences→persist; replay/concurrency blocked. Остальные subflow handlers мигрируются отдельно. |
| R6 Spell/feature catalogs | Scoped corpus integrated | «Максимум» не имел source/license/expected census. Введён import/completeness gate. | `catalog-governance.js`, `data/catalogs/source-manifest.json`, `data/dnd5e/open5e-cc-v1`, `build-dnd5e-open-catalog.mjs` | `catalog-governance.test.cjs`, `dnd5e-open-catalog.test.mjs`, effect-engine census | 837 spell и 616 feature записей импортированы из CC-BY источников; сложные правила fail-closed до отдельного обработчика. |
| R7 Economy/trade | Done | Строковые цены, дробные ошибки, частичные сделки. Exact minor units, wallets, price provenance, atomic merchant journal. | `economy-core.js`, `merchant-core.js`, app merchant state; wallet migration при normalize. | economy + merchant suites | Money/stock/item/journal commit once; replay and journal failure roll back. |
| R8 Scene/NPC/World | Core done; legacy migration ongoing | Scene, combat, BG3 overlays не имели общей сущности. | `world-state-core.js`; `worldState` сохраняется/export/cloud; старые scene states пока рядом. | `world-state-core.test.cjs` | CAS world commands, no orphan refs, drafts inert до GM approval. Завершение legacy migration: BG3/combat перестают быть write-models. |
| R9 UI actions/errors | Core done; route migration ongoing | Кнопки могли не иметь маршрута/причины. | `ui-action-contract.js`, combat descriptor, `audit-capabilities.mjs`; данных нет. | `ui-action-contract.test.cjs`, capability audit | 0 missing handlers сейчас. Остальные 37 route names классифицировать как UI-only либо подключить descriptor. |
| R10 Projections | Done / compatibility ongoing | Вычисляемые модели могли сохраняться как truth. | `projection-cache.js`, item domain cache, envelope sanitizer; legacy mechanics не удалён. | `projection-cache.test.cjs`, item-domain suite | Forbidden derived fields отсутствуют в save; cache invalidates by source version. |
| R11 Capability audit | Done | Долг не измерялся. | `audit-capabilities.mjs`, этот аудит; миграций нет. | `capability-audit.test.mjs` | Report парсится в CI: handlers, catches, direct finds, catalogs, rulesets. |

## Следующие независимые cleanup-пакеты

1. `definitions-read-path`: заменить по одному домену 60 прямых `.find`, начиная со spells, с regression matrix.
2. `error-surface`: заменить 58 пустых `catch` на coded error в persistence/cloud/catalog/action, затем в editor/presentation.
3. `world-write-path`: перенести combat scene, BG3 objects и story events в WorldState commands; после dual-read периода удалить legacy writes.
4. `ui-route-classification`: пометить 37 имён как `presentation/control` либо ActionDescriptor; прямые gameplay mutations запретить тестом.
5. `open-catalog-handlers`: расширять явное исполнение импортированных записей по одной проверенной механике, сохраняя reference-only/fail-closed режим для ещё не типизированных правил.

Ни один cleanup-пакет не требует массовой смены формата одновременно: Campaign Envelope и Definition layers поддерживают dual-read/migrate/write-new.
