# D&D World save formats

The offline inspector recognizes the following persisted shapes. Since 2026-10-22 the application uses one local campaign; cloud transport and campaign import/export have been removed. Historical wrappers below remain read-only diagnostic inputs and cannot be loaded into the app:

| Format | Identity | Authority during migration |
|---|---|---|
| World snapshot | `dnd-world-world-snapshot/1` | Current local authority until envelope migration completes |
| Legacy per-key | `dndworld2:*` key map | Recovery input only; never newer than a valid snapshot |
| Legacy cloud channel | `{by, at, j}` | Transport wrapper; inner payload must be inspected independently |
| Cloud channel | `dnd-world-cloud-channel/1` with `payload` | Transport wrapper; inner payload must be inspected independently |
| Campaign envelope | `dnd-world-campaign-envelope/1` | Target authority with revision, parent revision, transaction and checksum |

`node scripts/save-inspector.mjs <file...>` is read-only. Its `status` distinguishes `verified` (campaign checksum and envelope contract verified through `persistence-core`), `unverified` (readable legacy data without a campaign checksum), `corrupt`, `missing`, `incompatible` and `unreadable`. It never repairs, rewrites or uploads a campaign. Exit code 0 means the files were inspectable (`verified` or `unverified`); any other status returns 1. Callers must also check `validationStatus` and `issues` before treating a campaign as playable.

`validationStatus` describes structural/reference diagnostics (`ok`, `needs-attention` or a failure status). A verified checksum does not establish that every gameplay reference exists. `references.catalogStatus: "unverified"` and `references.status: "partial"` explicitly mark catalog dependencies that this offline tool has not hydrated. The report includes pins and pending IDs; a missing pin or conflicting pins is diagnostic. Cloud transport metadata is also unverified, even when the inner campaign envelope is verified. SHA-256 confirms content consistency, not the author's identity or the freshness of a backup.

The synchronous `inspectSave` / `inspectFile` APIs remain available for structural inspection: legacy fixtures retain `ok` / `needs-attention`; an envelope never gets `ok` before checksum verification. Use asynchronous `inspectSaveVerified` / `inspectFileVerified` for the CLI's integrity verdict. Neither API modifies its input. Reference checks cover local definition IDs, character inventory/spellbook/abilities and combat participants; they are not a complete simulation of every rule in the save.

The fixtures under `tests/fixtures/saves/` are synthetic. They contain no campaign text, user account, Firebase URL, room key or personal identifier.

## Recovery policy

1. Never interpret corrupt JSON as an empty campaign.
2. Never replace an unsupported future schema with seeds.
3. Keep the original serialized payload before any forward migration.
4. Report duplicate IDs and unresolved references before rendering actions.
5. A pinned-catalog item reference may remain unresolved until its catalog is hydrated; a missing local item reference is immediately diagnostic.
6. A migration is complete only after write, checksum verification and read-back of the new envelope.
