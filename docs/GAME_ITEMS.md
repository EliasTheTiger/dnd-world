# One item collection for the game

The item workspace has one membership (`source: 'game'`) and one item total.
Built-in definitions, saved definitions and imported definitions share search,
filters, cards, editing and the inventory grant transaction. The hero inventory
uses the same canonical search as the Items tab. There is no origin filter,
origin counter, special “grant variant” confirmation or campaign-only editor.

The default saved game still displays 1,991 canonical items. The un-migrated seed
fixture displays 2,001; normal legacy alias migration accounts for that difference.
The change does not replace inventory IDs, recreate instances or collapse +1/+2
upgrades. Presentation readiness and item portability remain gameplay checks.

`gameItemDefinition(id)` resolves the current definition; persisted edits are
marked `gameDefinition: true` and take precedence over the installed asset with
the same ID. They use the existing snapshot, export/import and synchronization
storage. Legacy name/alias cleanup cannot remove or remap these saved definitions.
Canonical name folding is a view. Hiding an item prevents new grants and preserves
its existing inventory instances, equipment and world references.

The engine retains immutable compiled-program identities for unchanged rules.
Presentation changes must not invalidate attested actions, lifecycle programs or
source facts. `itemOf` returns the compiled definition when its gameplay properties
are unchanged; cards, names, descriptions and economic quotes resolve the saved
game definition. Exact action bridges accept a saved presentation overlay only
after comparing all relevant properties and complete mechanics. Differing rules
remain blocked. The generic editor refuses to rebuild linked programs it cannot
compile, for any definition using those programs.

The DOM presentation sanitizer skips textareas and code/data nodes, so opening an
editor cannot rewrite serialized handler IDs or mechanics. A description-only
save preserves the complete mechanics object. A stale editor is rejected.

Validation covers the single collection and counter, search and duplicate checks,
reference auditing, persistence and legacy migration, property-based portability,
the exact Dethrone and Arrow execution boundaries after presentation edits, and a
real browser journey that edits, grants, reloads, searches, stacks and hides an
item without losing its inventory. The Pages workflow runs that journey against
the built candidate before deployment.
