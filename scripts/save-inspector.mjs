import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const WORLD_SNAPSHOT_SCHEMA = 'dnd-world-world-snapshot/1';
export const CAMPAIGN_ENVELOPE_SCHEMA = 'dnd-world-campaign-envelope/1';
export const CLOUD_CHANNEL_SCHEMA = 'dnd-world-cloud-channel/1';

const REQUIRED_WORLD_ARRAYS = ['chars', 'items', 'spells', 'abilities', 'races', 'classes', 'rules', 'foes'];

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
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
    const id = String(rows[index] && rows[index].id || '').trim();
    if (!id) issues.push({code:'MISSING_ID', kind, index});
    else if (ids.has(id)) issues.push({code:'DUPLICATE_ID', kind, id});
    else ids.add(id);
  }
  return ids;
}

function inspectReferences(state, issues) {
  const itemIds = uniqueIds(state.items, 'item', issues);
  const spellIds = uniqueIds(state.spells, 'spell', issues);
  const abilityIds = uniqueIds(state.abilities, 'ability', issues);
  const charIds = uniqueIds(state.chars, 'character', issues);
  const foeIds = uniqueIds(state.foes, 'foe', issues);

  for (const character of state.chars || []) {
    const owner = String(character && character.id || 'unknown-character');
    for (const entry of character && character.inventory || []) {
      const itemId = String(entry && entry.itemId || '');
      if (!itemId) issues.push({code:'MISSING_REFERENCE', owner, field:'inventory.itemId', value:itemId});
      else if (!itemId.startsWith('bg3:item:') && !itemIds.has(itemId)) issues.push({code:'UNRESOLVED_REFERENCE', owner, field:'inventory.itemId', value:itemId});
    }
    for (const entry of character && character.spellbook || []) {
      const spellId = String(entry && (entry.spellId || entry.id) || '');
      if (spellId && !spellIds.has(spellId) && !spellId.startsWith('bg3:')) issues.push({code:'UNRESOLVED_REFERENCE', owner, field:'spellbook.spellId', value:spellId});
    }
    for (const entry of character && character.abilities || []) {
      const abilityId = String(entry && entry.abilityId || '');
      if (abilityId && !abilityIds.has(abilityId)) issues.push({code:'UNRESOLVED_REFERENCE', owner, field:'abilities.abilityId', value:abilityId});
    }
  }

  for (const entry of state.combat && state.combat.order || []) {
    const id = String(entry && entry.id || '');
    const known = entry && entry.kind === 'ally' ? charIds.has(id) : foeIds.has(id);
    if (id && !known) issues.push({code:'UNRESOLVED_REFERENCE', owner:'combat.order', field:String(entry.kind || 'actor'), value:id});
  }

  return {items:itemIds.size, spells:spellIds.size, abilities:abilityIds.size, characters:charIds.size, foes:foeIds.size};
}

function normalizePerKey(value) {
  const row = object(value);
  if (!row || !Object.keys(row).some(key => key.startsWith('dndworld2:'))) return null;
  const read = (key, fallback) => {
    const parsed = parse(row[key]);
    return parsed.ok ? parsed.value : fallback;
  };
  return {
    schemaVersion:WORLD_SNAPSHOT_SCHEMA,
    snapshotRevision:0,
    chars:read('dndworld2:chars', []), items:read('dndworld2:items', []), spells:read('dndworld2:spells', []),
    abilities:read('dndworld2:abilities', []), races:read('dndworld2:races', []), classes:read('dndworld2:classes', []),
    rules:read('dndworld2:rules', []), foes:read('dndworld2:foes', []), combat:read('dndworld2:combat', null),
    journal:read('dndworld2:journal', []), catalogRefs:read('dndworld2:catalog-refs', [])
  };
}

function unwrapCloud(value) {
  const row = object(value);
  if (!row || typeof row.j !== 'string') return null;
  const parsed = parse(row.j);
  if (!parsed.ok) return parsed;
  return {ok:true, value:parsed.value, cloud:{by:String(row.by || ''), at:Number(row.at || 0), revision:Number(row.revision || 0)}};
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
  if (perKey) { value = perKey; format = format || 'legacy-per-key'; }

  const row = object(value);
  if (!row) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'incompatible', error:'save root must be an object', issues:[]};

  let state = row;
  if (row.schemaVersion === CAMPAIGN_ENVELOPE_SCHEMA) {
    if (!object(row.state)) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'corrupt', format:'campaign-envelope', error:'campaign envelope has no state object', issues:[]};
    state = row.state; format = format || 'campaign-envelope';
  } else if (row.schemaVersion === WORLD_SNAPSHOT_SCHEMA) format = format || 'world-snapshot';
  else if (format !== 'legacy-per-key') return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'incompatible', format:'unknown', error:'unsupported schema '+String(row.schemaVersion || '(missing)'), issues:[]};

  const missingArrays = REQUIRED_WORLD_ARRAYS.filter(key => !Array.isArray(state[key]));
  if (missingArrays.length) return {schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:'corrupt', format, error:'missing required arrays: '+missingArrays.join(', '), issues:[]};

  const issues = [], counts = inspectReferences(state, issues);
  return {
    schemaVersion:'dnd-world-save-inspection/1', source:options.source || '', status:issues.length ? 'needs-attention' : 'ok', format,
    revision:Number(row.revision ?? row.snapshotRevision ?? (cloud && cloud.revision) ?? 0), parentRevision:Number(row.parentRevision ?? -1),
    campaignId:String(row.campaignId || ''), checksum:String(row.checksum || ''), cloud, counts, issues
  };
}

export function inspectFile(file) {
  const absolute = path.resolve(file);
  let raw;
  try { raw = fs.readFileSync(absolute, 'utf8'); }
  catch (error) { return {schemaVersion:'dnd-world-save-inspection/1', source:absolute, status:error && error.code === 'ENOENT' ? 'missing' : 'unreadable', error:String(error && error.message || error), issues:[]}; }
  return inspectSave(raw, {source:absolute});
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = process.argv.slice(2);
  const report = files.length ? files.map(inspectFile) : [inspectSave('', {source:'stdin-not-supported'})];
  process.stdout.write(JSON.stringify(report.length === 1 ? report[0] : report, null, 2)+'\n');
  if (report.some(row => !['ok', 'needs-attention'].includes(row.status))) process.exitCode = 1;
}
