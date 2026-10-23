'use strict';
// Global function declarations intentionally share the classic app script scope.
function ensurePartyStarterCatalogs() {
  const service = globalThis.DndWorldPartyStarter;
  if (!service) return {ok: false, changed: false, reason: 'starter-service-unavailable'};
  let changed = false;
  for (const definition of service.items().concat(artificerElixirTemplates())) {
    if (itemsDB.some(item => item.id === definition.id)) continue;
    itemsDB.push(typeof upgradeItem === 'function' ? upgradeItem(definition) : definition);
    changed = true;
  }
  if (!classesDB.some(row => row.n === 'Изобретатель')) {
    const definition = service.classDefinition();
    classesDB.push(typeof upgradeClass === 'function' ? upgradeClass(definition) : definition);
    changed = true;
  }
  return {ok: true, changed};
}
function partyStarterSpellIds() {
  const wanted = {fireBolt: 'Fire Bolt', guidance: 'Guidance', cureWounds: 'Cure Wounds', faerieFire: 'Faerie Fire',
    grease: 'Grease', detectMagic: 'Detect Magic', healingWord: 'Healing Word', rayOfSickness: 'Ray of Sickness'};
  const ids = {}, missing = [];
  for (const [key, english] of Object.entries(wanted)) {
    const matches = spellsDB.filter(row => row.grimoire?.english === english && row.grimoire.status === 'active' && row.grimoire.edition === '2014');
    if (matches.length !== 1) missing.push(english);
    else ids[key] = matches[0].id;
  }
  return missing.length ? {ok: false, missing, reason: 'starter-active-spells-unavailable'} : {ok: true, ids};
}
function partyStarterPrepareLiora() {
  const selected = partyStarterSpellIds();
  if (!selected.ok) return selected;
  const c = globalThis.DndWorldPartyStarter.buildLiora({blank: buildBlank(), items: itemsDB, spellIds: selected.ids});
  characterEnsureBackground(c);
  c.characterBuild = {version: 1, legacy: false, applied: characterSnapshot(c)};
  characterSyncFeatures(c);
  applyClassSlots(c);
  syncClassSpellAccess(c);
  upgradeSpellcastingState(c);
  c.artificer.elixirs = {rest: 0, available: 1};
  artificerElixirRestReady(c);
  c._v3 = true;
  return {ok: true, character: c};
}
async function applyPartyStarterUpdate() {
  const service = globalThis.DndWorldPartyStarter;
  if (!service || typeof partyUpdates === 'undefined') return {ok: false, changed: false, pending: true, reason: 'starter-state-unavailable'};
  // Keep recovery/read-only campaigns untouched, including their higher-priority
  // status message. Retry naturally after a later successful storage/catalog load.
  if (typeof campaignEnvelopeReadOnlyFallback !== 'undefined' && campaignEnvelopeReadOnlyFallback)
    return {ok: true, changed: false, pending: true, deferredReason: 'storage-read-only'};
  if (typeof bg3CatalogNeedsProductionRecovery === 'function' && bg3CatalogNeedsProductionRecovery())
    return {ok: true, changed: false, pending: true, deferredReason: 'catalog-recovery'};
  const catalog = ensurePartyStarterCatalogs();
  if (!catalog.ok) return {...catalog, pending: true};
  const previousChars = chars, previousUpdates = partyUpdates;
  const previousCombat = typeof combat !== 'undefined' ? JSON.parse(JSON.stringify(combat)) : null;
  const updates = JSON.parse(JSON.stringify(partyUpdates || {}));
  const prior = updates.alchemist20261023;
  // A boolean receipt from the same release is also a valid completed migration.
  if (prior === true) return {ok: true, changed: false, pending: false};
  if (prior != null && (typeof prior !== 'object' || Array.isArray(prior) || !Number.isInteger(prior.version) || prior.version < 1 ||
      typeof prior.heroAdded !== 'boolean' || !Array.isArray(prior.equipment) || prior.equipment.some(id => typeof id !== 'string'))) {
    return {ok: false, changed: false, pending: true, reason: 'invalid-starter-receipt'};
  }
  const receipt = prior ? {...prior, equipment: prior.equipment.slice()}
    : {version: 1, heroAdded: false, equipment: []};
  const next = chars.slice(), pending = [], granted = [];
  let changed = false, heroAdded = false;
  if (!receipt.heroAdded) {
    if (!chars.some(c => c.id === service.HERO_ID)) {
      let built;
      try { built = partyStarterPrepareLiora(); }
      catch (error) { return {ok: false, changed: false, pending: true, reason: String(error.message || error)}; }
      if (!built.ok) return {...built, changed: false, pending: true};
      next.push(built.character); heroAdded = true;
    }
    receipt.heroAdded = true; changed = true;
  }
  for (const id of service.EXISTING_IDS) {
    if (receipt.equipment.includes(id)) continue;
    const index = next.findIndex(c => c.id === id);
    if (index === -1) { receipt.equipment.push(id); changed = true; continue; }
    const result = service.plan(next[index], {items: itemsDB, resolveItem: itemOf});
    if (!result.ok) { pending.push({id, reason: result.reason, missingIds: result.missingIds || []}); continue; }
    if (result.changed) { next[index] = result.character; granted.push({id, items: result.grants}); }
    receipt.equipment.push(id); changed = true;
  }
  if (!changed) return {ok: true, changed: false, pending: pending.length > 0, deferred: pending};
  updates.alchemist20261023 = receipt;
  const previousSeedPending = campaignSeedPending;
  chars = next; partyUpdates = updates;
  // This point is reached only after all normal seed heroes and saved catalogs have loaded.
  campaignSeedPending = false;
  try {
    if (typeof bg3GithbornMindcrusherTrustCharacters === 'function') bg3GithbornMindcrusherTrustCharacters(chars);
    if (typeof fxInvalidate === 'function') fxInvalidate();
    scheduleSave(); clearTimeout(saveTimer);
    if (!await runScheduledSave()) throw new Error('Не удалось надёжно сохранить нового героя и стартовое снаряжение.');
    return {ok: true, changed: true, pending: pending.length > 0, deferred: pending, heroAdded, granted};
  } catch (error) {
    chars = previousChars; partyUpdates = previousUpdates; campaignSeedPending = previousSeedPending;
    if (previousCombat) combat = previousCombat;
    if (typeof bg3GithbornMindcrusherTrustCharacters === 'function') bg3GithbornMindcrusherTrustCharacters(chars);
    if (typeof fxInvalidate === 'function') fxInvalidate();
    return {ok: false, changed: false, pending: true, reason: String(error.message || error)};
  }
}
