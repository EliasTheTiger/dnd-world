# Потоки данных

## Игровое действие

```mermaid
sequenceDiagram
  participant UI
  participant Eval as Action evaluation
  participant Kernel as Action Kernel
  participant World
  participant Store as Envelope repository
  UI->>Eval: intent + evaluationToken
  Eval->>Eval: context/rules/targets/cost validation
  Eval-->>UI: blocked + reason OR allowed
  UI->>Kernel: execute(intent)
  Kernel->>World: snapshot
  Kernel->>Kernel: prepare (no mutation)
  Kernel->>World: one commit of resources
  Kernel->>World: consequences per target
  Kernel->>Store: CAS commit + checksum + read-back
  alt durable receipt
    Store-->>Kernel: revision/checksum/transactionId
    Kernel-->>UI: ActionResult + explanation
  else conflict/write failure
    Store-->>Kernel: coded failure
    Kernel->>World: rollback snapshot
    Kernel-->>UI: FAILED_TO_PERSIST
  end
```

Игровые кости не генерируются: roll requirements переходят в UI, а игрок/мастер вводит фактические значения. `ResourceCommitToken` отклоняет повторный коммит одного resource key.

## Локальное сохранение

1. Runtime создаёт `world-snapshot/1` как state payload.
2. `ProjectionCache.stripDerived` удаляет объявленные вычисляемые поля.
3. `EnvelopeRepository.commit` сверяет expected revision.
4. Создаётся `campaign-envelope/1` с parent revision, ruleset/catalog refs и SHA-256.
5. Storage adapter выполняет compare-and-set.
6. Репозиторий читает запись обратно и выдаёт durable receipt.
7. Legacy snapshot/per-key keys записываются только для переходной совместимости.

Повреждённый envelope не трактуется как пустая новая кампания. Старый snapshot мигрируется один раз, исходные bytes сохраняются в backup.

## Одна локальная кампания

С 22 октября 2026 года приложение продолжает только текущую сохранённую игру. Облако, авторизация, комнаты, импорт и экспорт кампании удалены. Загрузка не запускает сброс группы или боя; прежние пользовательские ключи не очищаются. Журнал сохраняется отдельно, поэтому общий атомарный коммит мира и журнала не заявляется. Подробности и приёмка: [локальное сохранение](local-persistence-2026-10-22.md).

## Торговля

`MerchantService` делает preflight stock/category/price/funds/revision, затем в одной транзакции меняет exact-minor wallets, stock и inventory. Request ID защищает от replay. Ошибка journal commit возвращает все четыре части snapshot. Недостаток денег торговца требует подтверждённый GM override с автором и причиной.

## Каталог

Source manifest → ruleset/source/license gate → duplicate/expected-ID/executable coverage → import plan → Definition layer. Локальные spell/features остаются открытым авторским набором, а `open5e-cc-v1` теперь имеет отдельный зафиксированный census: 837 retained spells и 616 retained features с CC-BY provenance. Полнота заявляется только относительно выбранных документов, не относительно всех когда-либо изданных материалов D&D.
