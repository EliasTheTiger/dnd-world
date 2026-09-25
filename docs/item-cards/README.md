# Item cards: gameplay presentation

The public game contains 2,115 canonical item cards after the normal spell and
item migrations. The audit uses those migrations and the same card renderer as
the inventory and item workspace. A seed-only snapshot taken before migration
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

The exhaustive audit checks cards, list previews and full rules for technical
leaks, illustrations, descriptions and mutation while reading. Browser checks
cover ordinary and legendary equipment, a potion, poison and tools on desktop,
plus the adapted crossbow on a 390-pixel screen. Existing execution, inventory,
crafting and persistence regression tests remain part of the complete suite.
