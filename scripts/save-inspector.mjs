import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import persistence from './persistence-core.js';

export const WORLD_SNAPSHOT_SCHEMA = persistence.WORLD_SNAPSHOT_SCHEMA;
export const CAMPAIGN_ENVELOPE_SCHEMA = persistence.ENVELOPE_SCHEMA;
export const CLOUD_CHANNEL_SCHEMA = persistence.CLOUD_SCHEMA;

const REQUIRED_WORLD_ARRAYS = ['chars', 'items', 'spells', 'abilities', 'races', 'classes', 'rules', 'foes'];

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function string(value) { return typeof value === 'string' ? value : ''; }

function list(value, field, issues) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  issues.push({code:'INVALID_LIST', field});
  return [];
}

function parse(raw) {
  if (raw == null || raw === '') return {ok:false, status:'missing', error:'save payload is missing'};
  if (typeof raw !== 'string') return {ok:true, value:raw};
  try { return {ok:true, value:JSON.parse(raw)}; }
  catch (error) { return {ok:false, status:'corrupt', error:String(error && error.message || error)}; }
}

function uniqueIds(rows, kind, issues) {
  const ids = new Set();
  for (let index = 0; index < (Array.isArray(rows) ? rows.length : 0); index++) {
    const row = object(rows[index]);
    if (!row) { issues.push({code:'INVALID_RECORD', kind, index}); continue; }
    const id = string(row.id).trim();
    if (!id) issues.push({code:row.id == null || row.id === '' ? 'MISSING_ID' : 'INVALID_ID', kind, index});
    else if (ids.has(id)) issues.push({code:'DUPLICATE_ID', kind, id});
    else ids.add(id);
  }
  return ids;
}

function inspectReferences(state, envelope, issues) {
  const itemIds = uniqueIds(state.items, 'item', issues);
  const spellIds = uniqueIds(state.spells, 'spell', issues);
  const abilityIds = uniqueIds(state.abilities, 'ability', issues);
  const charIds = uniqueIds(state.chars, 'character', issues);
  const foeIds = uniqueIds(state.foes, 'foe', issues);

  for (const kind of ['races', 'classes', 'rules']) uniqueIds(state[kind], kind, issues);
  const catalogs = new Map();
  for (const [field, value] of [['catalogRefs', state.catalogRefs], ['envelope.catalogRefs', envelope && envelope.catalogRefs]]) {
    for (const [index, entry] of list(value, field, issues).entries()) {
      if (!object(entry) || !string(entry.id).trim() || !string(entry.version).trim()) {
        issues.push({code:'INVALID_CATALOG_REFERENCE', field, index}); continue;
      }
      const pin = {id:entry.id, version:entry.version, profile:string(entry.profile), manifestSha256:string(entry.manifestSha256)};
      if (catalogs.has(entry.id) && JSON.stringify(catalogs.get(entry.id)) !== JSON.stringify(pin)) issues.push({code:'CONFLICTING_CATALOG_PIN', field, id:entry.id});
      catalogs.set(entry.id, pin);
    }
  }
  const catalogReferences = [];
  let checkedLocal = 0;
  const reference = (entry, field, owner, ids, kind) => {
    const value = string(entry).trim();
    if (!value) { issues.push({code:'MISSING_REFERENCE', owner, field, value}); return; }
    if (ids.has(value)) { checkedLocal++; return; }
    const namespace = value.split(':')[0];
    // A namespace identifies where to look; it does not prove this definition exists.
    if ((namespace === 'bg3' || catalogs.has(namespace)) && value.includes(':')) {
      catalogReferences.push({owner, field, value, kind, catalogId:namespace, pinned:catalogs.has(namespace)});
      if (!catalogs.has(namespace)) issues.push({code:'MISSING_CATALOG_PIN', owner, field, value, catalogId:namespace});
    } else issues.push({code:'UNRESOLVED_REFERENCE', owner, field, value});
  };
  for (const character of state.chars) {
    if (!object(character)) continue;
    const owner = string(character.id) || 'unknown-character';
    for (const [key, idKey, ids, kind] of [['inventory', 'itemId', itemIds, 'item'], ['spellbook', 'spellId', spellIds, 'spell'], ['abilities', 'abilityId', abilityIds, 'ability']]) {
      for (const [index, entry] of list(character[key], owner+'.'+key, issues).entries()) {
        if (!object(entry)) { issues.push({code:'INVALID_RECORD', owner, field:key, index}); continue; }
        reference(entry[idKey] || (key === 'spellbook' ? entry.id : ''), key+'.'+idKey, owner, ids, kind);
      }
    }
  }
  if (state.combat != null && !object(state.combat)) issues.push({code:'INVALID_RECORD', field:'combat'});
  for (const [index, entry] of list(object(state.combat) && state.combat.order, 'combat.order', issues).entries()) {
    if (!object(entry)) { issues.push({code:'INVALID_RECORD', field:'combat.order', index}); continue; }
    if (!['ally', 'foe'].includes(entry.kind)) { issues.push({code:'INVALID_ACTOR_KIND', field:'combat.order', index}); continue; }
    const id = string(entry.id).trim();
    const known = entry.kind === 'ally' ? charIds.has(id) : foeIds.has(id);
    if (!id) issues.push({code:'MISSING_REFERENCE', owner:'combat.order', field:entry.kind, value:id});
    else if (!known) issues.push({code:'UNRESOLVED_REFERENCE', owner:'combat.order', field:entry.kind, value:id});
    else checkedLocal++;
  }
  const catalogPending = catalogs.size > 0 || catalogReferences.length > 0;
  return {
    counts:{items:itemIds.size, spells:spellIds.size, abilities:abilityIds.size, characters:charIds.size, foes:foeIds.size},
    references:{status:catalogPending ? 'partial' : issues.length ? 'needs-attention' : 'checked', checkedLocal,
      catalogStatus:catalogPending ? 'unverified' : 'not-referenced', catalogs:[...catalogs.values()], catalogReferences}
  };
}

function normalizePerKey(value) {
  const row = object(value);
  if (!row || row.schemaVersion != null || !REQUIRED_WORLD_ARRAYS.some(key => Object.hasOwn(row, 'dndworld2:'+key))) return null;
  const errors = [];
  const read = (key, fallback) => {
    if (!Object.hasOwn(row, key)) return fallback;
    const parsed = parse(row[key]);
    if (!parsed.ok) errors.push({code:'CORRUPT_LEGACY_KEY', field:key, error:parsed.error});
    return parsed.ok ? parsed.value : fallback;
  };
  const state = {
    schemaVersion:WORLD_SNAPSHOT_SCHEMA,
    snapshotRevision:0,
    chars:read('dndworld2:chars', []), items:read('dndworld2:items', []), spells:read('dndworld2:spells', []),
    abilities:read('dndworld2:abilities', []), races:read('dndworld2:races', []), classes:read('dndworld2:classes', []),
    rules:read('dndworld2:rules', []), foes:read('dndworld2:foes', []), combat:read('dndworld2:combat', null),
    journal:read('dndworld2:journal', []), catalogRefs:read('dndworld2:catalog-refs', [])
  };
  return {state, errors};
}

function unwrapCloud(value) {
  const row = object(value);
  if (!row || (row.schemaVersion !== CLOUD_CHANNEL_SCHEMA && (row.schemaVersion != null || !Object.hasOwn(row, 'j')))) return null;
  const current = row.schemaVersion === CLOUD_CHANNEL_SCHEMA;
  const payload = current ? row.payload : row.j;
  if (payload == null || (!current && typeof payload !== 'string')) return {ok:false, error:'cloud channel has no valid payload'};
  const parsed = parse(payload);
  if (!parsed.ok) return parsed;
  return {ok:true, value:parsed.value, cloud:{by:string(row.by), at:row.at ?? 0, revision:row.revision ?? 0, integrity:'unverified'}};
}

export function inspectSave(raw, options = {}) {
  const parsed = parse(raw);
  if (!parsed.ok) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:parsed.status, error:parsed.error, issues:[]};

  let value = parsed.value, cloud = null, format = '';
  const cloudResult = unwrapCloud(value);
  if (cloudResult) {
    if (!cloudResult.ok) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'corrupt', error:'cloud channel contains invalid JSON: '+cloudResult.error, issues:[]};
    value = cloudResult.value; cloud = cloudResult.cloud; format = 'cloud-channel';
  }

  const perKey = normalizePerKey(value);
  if (perKey) {
    if (perKey.errors.length) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'corrupt', error:'legacy save contains invalid serialized fields', issues:perKey.errors};
    value = perKey.state; format = format || 'legacy-per-key';
  }

  const row = object(value);
  if (!row) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'incompatible', error:'save root must be an object', issues:[]};

  let state = row;
  const isEnvelope = row.schemaVersion === CAMPAIGN_ENVELOPE_SCHEMA;
  if (isEnvelope) {
    if (!object(row.state)) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'corrupt', format:'campaign-envelope', error:'campaign envelope has no state object', issues:[]};
    state = row.state; format = format || 'campaign-envelope';
  } else if (row.schemaVersion === WORLD_SNAPSHOT_SCHEMA) format = format || 'world-snapshot';
  else if (format !== 'legacy-per-key') return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'incompatible', format:'unknown', error:'unsupported schema '+(string(row.schemaVersion) || '(missing)'), issues:[]};

  if (isEnvelope && state.schemaVersion != null && state.schemaVersion !== WORLD_SNAPSHOT_SCHEMA) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'incompatible', format, error:'unsupported campaign state schema', issues:[]};

  const missingArrays = REQUIRED_WORLD_ARRAYS.filter(key => !Array.isArray(state[key]));
  if (missingArrays.length) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'corrupt', format, error:'missing required arrays: '+missingArrays.join(', '), issues:[]};

  const issues = [], {counts, references} = inspectReferences(state, isEnvelope ? row : null, issues);
  list(state.journal, 'journal', issues);
  if (isEnvelope) list(row.rulesetRefs, 'envelope.rulesetRefs', issues);
  if (!isEnvelope && row.snapshotRevision != null && (!Number.isSafeInteger(row.snapshotRevision) || row.snapshotRevision < 0)) issues.push({code:'INVALID_REVISION', field:'snapshotRevision'});
  const malformed = issues.some(issue => ['INVALID_LIST', 'INVALID_RECORD', 'INVALID_ID', 'INVALID_CATALOG_REFERENCE', 'INVALID_ACTOR_KIND', 'INVALID_REVISION'].includes(issue.code));
  return {
    schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:malformed ? 'corrupt' : issues.length ? 'needs-attention' : isEnvelope ? 'unverified' : 'ok', format,
    revision:row.revision ?? row.snapshotRevision ?? (cloud && cloud.revision) ?? 0, parentRevision:row.parentRevision ?? -1,
    campaignId:string(row.campaignId), checksum:string(row.checksum), cloud, counts, issues, references,
    integrity:{status:malformed ? 'corrupt' : 'unverified', scope:isEnvelope ? 'campaign-envelope' : 'legacy-payload',
      reason:isEnvelope ? 'Use inspectSaveVerified to verify the campaign checksum.' : 'This format has no campaign checksum.'}
  };
}

// Preserve the synchronous inspection API; trust verdicts require this async API.
export async function inspectSaveVerified(raw, options = {}) {
  const report = inspectSave(raw, options);
  report.validationStatus = report.status === 'unverified' ? 'ok' : report.status;
  if (!report.integrity) report.integrity = {status:report.status === 'corrupt' ? 'corrupt' : 'unverified'};
  if (!['ok', 'unverified', 'needs-attention'].includes(report.status)) return report;
  const parsed = parse(raw), cloudResult = unwrapCloud(parsed.value);
  const envelope = cloudResult ? cloudResult.value : parsed.value;
  if (envelope.schemaVersion !== CAMPAIGN_ENVELOPE_SCHEMA) { report.status = 'unverified'; return report; }
  let verified;
  try { verified = await persistence.verifyEnvelope(envelope); }
  catch (error) { verified = {ok:false, code:error.code || 'VERIFICATION_FAILED', reason:String(error.message || error)}; }
  if (!verified.ok) {
    report.status = 'corrupt';
    report.integrity = {status:'corrupt', scope:'campaign-envelope', code:verified.code, reason:verified.reason};
    report.issues.push({code:verified.code, field:'envelope', error:verified.reason});
    return report;
  }
  report.status = 'verified';
  report.integrity = {status:'verified', scope:'campaign-envelope', algorithm:'SHA-256'};
  return report;
}

export function inspectFile(file) {
  const absolute = path.resolve(file);
  let raw;
  try { raw = fs.readFileSync(absolute, 'utf8'); }
  catch (error) { return {schemaVersion:'dnd-world-save-inspection/1', source:absolute, status:error && error.code === 'ENOENT' ? 'missing' : 'unreadable', error:String(error && error.message || error), issues:[]}; }
  return inspectSave(raw, {source:absolute});
}

export async function inspectFileVerified(file) {
  const absolute = path.resolve(file);
  let raw;
  try { raw = fs.readFileSync(absolute, 'utf8'); }
  catch (error) { return {schemaVersion:'dnd-world-save-inspection/1', source:absolute, status:error && error.code === 'ENOENT' ? 'missing' : 'unreadable', error:String(error && error.message || error), issues:[], integrity:{status:'unverified'}}; }
  return inspectSaveVerified(raw, {source:absolute});
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = process.argv.slice(2);
  const report = files.length ? await Promise.all(files.map(inspectFileVerified)) : [await inspectSaveVerified('', {source:'stdin-not-supported'})];
  process.stdout.write(JSON.stringify(report.length === 1 ? report[0] : report, null, 2)+'\n');
  if (report.some(row => !['verified', 'unverified'].includes(row.status))) process.exitCode = 1;
}
