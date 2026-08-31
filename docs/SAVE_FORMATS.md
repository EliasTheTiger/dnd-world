# D&D World save formats

The supported read window starts with the following persisted shapes:

| Format | Identity | Authority during migration |
|---|---|---|
| World snapshot | `dnd-world-world-snapshot/1` | Current local authority until envelope migration completes |
| Legacy per-key | `dndworld2:*` key map | Recovery input only; never newer than a valid snapshot |
| Legacy cloud channel | `{by, at, j}` | Transport wrapper; inner payload must be inspected independently |
| Campaign envelope | `dnd-world-campaign-envelope/1` | Target authority with revision, parent revision, transaction and checksum |

`node scripts/save-inspector.mjs <file...>` is read-only. It classifies a payload as `missing`, `corrupt`, `incompatible`, `needs-attention` or `ok`. It never repairs, rewrites or uploads a campaign.

The fixtures under `tests/fixtures/saves/` are synthetic. They contain no campaign text, user account, Firebase URL, room key or personal identifier.

## Recovery policy

1. Never interpret corrupt JSON as an empty campaign.
2. Never replace an unsupported future schema with seeds.
3. Keep the original serialized payload before any forward migration.
4. Report duplicate IDs and unresolved references before rendering actions.
5. A pinned-catalog item reference may remain unresolved until its catalog is hydrated; a missing local item reference is immediately diagnostic.
6. A migration is complete only after write, checksum verification and read-back of the new envelope.
