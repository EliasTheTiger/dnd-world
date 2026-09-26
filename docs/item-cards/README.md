# Item cards: gameplay presentation

The public game contains 2,115 canonical item cards after the normal spell and
item migrations. Catalog, inventory and equipped-item tooltips now share one
gameplay body. A seed-only snapshot taken before migration
contains ten additional legacy spell-scroll records; it is not the public count.

## Player surface

Cards show the illustration, name, rarity, purpose, weapon damage or armor class,
equipment properties, named abilities, activation costs, targets, saving throws,
duration, recharge, crafting/harvesting information, description, weight and price.
Conditions have separate expandable explanations. Standard D&D conditions use the
game's existing tabletop condition definitions. Native recipe adaptations keep
their own rules and descriptions. Reading a card does not execute a property.

The former item-contract block, execution support badges, internal operation
counts, provenance, source identifiers and engine instructions are absent from
cards, list previews and the full-rules dialog. Item editor prose is cleaned too;
its hidden structured controls still preserve mechanics when saving an edit.
Custom gameplay properties remain visible after editing and reloading a former
catalog item. Existing saved definitions use the same presentation; inventory
entries keep their quantities, charges, attunement, equipment slots and notes.
Rendering charges uses a copy, so hovering a card does not initialise or change
the saved resource. Combat inspection and contextual item help open the same
full gameplay rules. Material inspection uses readable crafting categories.

The previous audit missed a separate inventory tooltip renderer. That renderer
showed raw `props`, source-operation trees and inconsistent weapon facts. The
replacement shares the full card body instead of maintaining another prose
filter or fetching technical presentation shards when inventory is rendered.

Presentation references:

- [BG3 item comparison examples](https://www.gamerguides.com/baldurs-gate-3/database/weapons/longbow): prominent damage, rarity, named features and a weight/value footer.
- [Larian tooltip cleanup](https://baldursgate3.game/news/stress-test-update-2_136): remove leaked implementation notation from player tooltips.
- [Larian's final patch notes](https://baldursgate3.game/news/the-final-patch-new-subclasses-photo-mode-and-cross-play_138): clarify which ability modifier a property uses and explain linked conditions.

These are presentation references; the application retains its existing game
mechanics and human dice entry. Descriptions are not parsed to create effects.

## Offline authoring and engineering records

Everything in this directory is excluded from the GitHub Pages allow-list.

- `all-items-audit.json` contains a separate record for every public item: original
  description/properties/engineering notes, rule references, a mechanics digest,
  player presentation, full-rules text and checks.
- `rule-copy-source.json` contains the relevant Russian text and parameter facts
  from the user's installed BG3 build 24532579, matching the pinned game catalog.
  Only rules referenced by these items and their explanatory links are included.
- `rule-copy-overrides.json` supplies individual explanations where a hidden
  state has no player tooltip, including healing, washing and regeneration.
- `equipment-facts-source.json` preserves the per-item source fields behind
  numeric equipment facts, resistances, proficiencies and weapon enchantments.
  Object durability/cinematic flags are excluded from player copy. These facts
  describe the item; rendering them does not apply or change combat modifiers.

`scripts/build-item-player-copy.mjs` produces the small runtime dictionary of
gameplay text. The source/adaptation notes above are never copied into it.
Identity keys in that dictionary connect descriptions to existing engine rules;
they are not rendered as labels or instructions.

## Reproducible checks

```text
node scripts/build-item-player-copy.mjs --check
node scripts/audit-item-player-cards.mjs --write
node --test tests/item-player-cards.test.mjs
node qa/item-player-cards.e2e.cjs
node --test tests/*.test.*
git diff --check
```

The exhaustive audit renders all 2,115 items through the actual inventory panel,
catalog card, list preview, equipment description and full rules. It checks
visible text and hover/accessibility labels, preserves complete gameplay content,
and checks both item mechanics and the hero for mutation while reading.
The browser regression fails against the previous published version immediately
after granting Markoheshkir. It now grants nine representative items using the
public controls, compares catalog and inventory prose, opens full rules, edits
gameplay properties, equips an item, saves, reloads, and checks the saved cards
again, including a 390-pixel inventory tooltip. Existing execution, inventory,
crafting and persistence regression tests remain part of the complete suite.
