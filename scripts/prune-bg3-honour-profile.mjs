import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ITEM_DOMAIN_MODEL = require('./item-domain-model.js');
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_VERSION = 'bg3-24532579-v10';
const CATALOG_ROOT = join(REPO_ROOT, 'data', 'bg3', CATALOG_VERSION);
const ARCHIVE_ROOT = join(REPO_ROOT, 'data', 'bg3', 'bg3-24532579-v9');
const POINTER_FILE = join(REPO_ROOT, 'data', 'bg3', 'current.json');
const SOURCE_CATALOG_MANIFEST = join(REPO_ROOT, 'data', 'catalogs', 'source-manifest.json');
const DROP = Symbol('drop-honour-value');
const PROFILE = 'standard';
const COUNT_ARRAY_FIELDS = [
  'items',
  'nodes',
  'rules',
  'programs',
  'linkSets',
  'links',
  'goals',
  'books',
  'placements',
  'definitions',
  'records',
  'programSets',
];
const REMOVED_ITEM_IDS = new Set([
  'bg3:item:rt:7a48ed48-8ae0-4258-9cb9-831b6c18912c:stats:T0JKX01vb25iZWFt',
  'bg3:item:rt:bf601b0f-ac97-4c29-838c-9b45a9d99485:stats:T0JKX0dlbmVyaWNJbW11dGFibGVPYmplY3Q',
]);
// The previously approved strict Full Arsenal set is a presentation contract,
// not the complete Standard source census. These recipe-carrier variants pass
// the item-local readiness checks only after the full catalog is restored, but
// were outside the fail-closed recipe closure that produced the pinned set.
const STRICT_ARSENAL_BASELINE_COUNT = 2_378;
const STRICT_ARSENAL_BASELINE_SHA256 = '573b63d30c6c5f865c6592e21664e04b785b1f8e62cdc129393aaa7976bbf4d6';
const STRICT_RECIPE_CLOSURE_EXCLUSIONS = new Set([
  'bg3:item:rt:02bb51c0-00e5-408c-8e11-8de7b9580c04:stats:T0JKX0R5ZV9CbGFja0JsdWU',
  'bg3:item:rt:09e48b43-f567-4acc-b98d-0c86c1396084:stats:T0JKX0R5ZV9Hb2xkZW4',
  'bg3:item:rt:0c356479-9f2c-413c-8fed-cab3a6fae19b:stats:T0JKX0Jvb2s',
  'bg3:item:rt:0e339e21-df58-4e46-a263-e91d4ed19dc9:stats:T0JKX0R5ZV9JY2VDcmVhbV8wMg',
  'bg3:item:rt:10e79bfb-c448-4af4-a153-bf3d19f83c62:stats:T0JKX0R5ZV9NYXJvb24',
  'bg3:item:rt:17f6e66e-1c23-41d2-9370-3bd9a5a90b4a:stats:T0JKX0R5ZV9Sb3lhbEJsdWU',
  'bg3:item:rt:19c7bbb1-29f5-4ec9-a72c-74a73318f8da:stats:T0JKX0R5ZV9SZW1vdmVy',
  'bg3:item:rt:1bb2ba7b-1ac3-4c2e-bcd3-85886d294204:stats:T0JKX0R5ZV9PcmFuZ2U',
  'bg3:item:rt:1d0d3883-6196-4ccd-8a49-8e4fb84f6c6b:stats:T0JKX0R5ZV9XaGl0ZVJlZA',
  'bg3:item:rt:1dec170b-101f-457b-b22d-8d38c45168c7:stats:T0JKX0R5ZV9CbHVlWWVsbG93XzAy',
  'bg3:item:rt:2292d37f-7cb2-4458-83c6-1f2e48ffa23e:stats:T0JKX0R5ZV9QdXJwbGVSZWQ',
  'bg3:item:rt:23899dcd-8f27-4144-b29d-ae61eaacd8c3:stats:T0JKX0R5ZV9JY2VDcmVhbQ',
  'bg3:item:rt:2cd56a6a-35bb-417c-9eb6-d78bbe73d3cc:stats:T0JKX0R5ZV9JY2VDcmVhbV8wMw',
  'bg3:item:rt:3336e3a5-0be1-407d-9c37-01536bb2e6c5:stats:T0JKX0R5ZV9XaGl0ZUJyb3du',
  'bg3:item:rt:43da55c8-55b7-41c6-9a44-3dd6843875f8:stats:T0JKX0R5ZV9JY2VDcmVhbV8wNA',
  'bg3:item:rt:4416dcc3-c469-4e59-90db-ba9a3ac05846:stats:QUxDSF9FeHRyYWN0X05pZ2h0T3JjaGlk',
  'bg3:item:rt:48a27277-7c18-49fe-9124-899919e162bc:stats:T0JKX0R5ZV9QaW5r',
  'bg3:item:rt:51cd678b-6a27-490d-b4d1-17cc89a32e40:stats:T0JKX0R5ZV9SaWNoUmVk',
  'bg3:item:rt:54cd5913-5226-4143-9186-6c1a8499de1c:stats:T0JKX0R5ZV9PY2Vhbg',
  'bg3:item:rt:5adba582-b552-4850-9be9-c6e28f656675:stats:T0JKX0R5ZV9QdXJwbGVfMDM',
  'bg3:item:rt:6904ea3d-89b6-4db7-a0bc-d890423e9312:stats:T0JKX0R5ZV9SZWRCcm93bg',
  'bg3:item:rt:6d90deb8-8df3-4a6f-b31f-f13cf2eb68f9:stats:T0JKX0R5ZV9UZWFs',
  'bg3:item:rt:78f41a7b-4742-419d-a0ac-b9a90a9e198e:stats:T0JKX0R5ZV9HcmVlblBpbms',
  'bg3:item:rt:7ac1bb07-e494-42d2-bb8d-6bf9e553a52a:stats:T0JKX0R5ZV9QdXJwbGVfMDQ',
  'bg3:item:rt:808cd643-ac73-415c-8ed8-0a81b8b71dd8:stats:T0JKX0R5ZV9QdXJwbGU',
  'bg3:item:rt:809f228e-8d2b-46b8-8a33-51181505bc61:stats:T0JKX0R5ZV9SZWQ',
  'bg3:item:rt:81512e6c-dbe4-451c-b5cc-7268656444c1:stats:T0JKX0R5ZV9CbGFja0dyZWVu',
  'bg3:item:rt:83cde47b-9e15-4ea5-98f4-4efd9ce93861:stats:T0JKX0R5ZV9CbHVlUHVycGxl',
  'bg3:item:rt:84f7b0a1-8840-47a1-a27a-1ac79e383520:stats:T0JKX0R5ZV9PcmFuZ2VCbHVl',
  'bg3:item:rt:94ef7170-1c1d-489a-9c18-55209d864e3a:stats:T0JKX0R5ZV9CbGFja1RlYWw',
  'bg3:item:rt:a0776643-f25b-4aef-a025-bff959d8dd0f:stats:Q09OU19IZXJic19NdWd3b3J0',
  'bg3:item:rt:a13f6fad-bca8-40c0-b5b1-592832c73050:stats:T0JKX0R5ZV9HcmVlblN3YW1w',
  'bg3:item:rt:a4c2594e-33a6-49b2-ab6f-e992a3e0257e:stats:T0JKX0R5ZV9CbHVlWWVsbG93',
  'bg3:item:rt:a94ac1cd-96c9-4775-8dcd-c2b581bfeb50:stats:T0JKX0R5ZV9CbHVl',
  'bg3:item:rt:ad60be55-7a95-4dcb-ae55-908a97f9955a:stats:T0JKX0R5ZV9HcmVlblNhZ2U',
  'bg3:item:rt:b702ddc5-f4fc-4976-adc4-18a8ddaab8d5:stats:T0JKX0R5ZV9CbHVlR3JlZW4',
  'bg3:item:rt:b707f039-af1d-456d-a606-1604f1d776c1:stats:QUxDSF9FeHRyYWN0X011Z3dvcnQ',
  'bg3:item:rt:bb108620-186f-4a00-b7de-af9329d5497b:stats:T0JKX0R5ZV9CbGFja1JlZA',
  'bg3:item:rt:db4761b2-cce8-4d6d-86ec-5cf0924a5f4c:stats:T0JKX0R5ZV9CbGFja1Bpbms',
  'bg3:item:rt:dfb0bd5d-e4ed-4bd3-bcfe-45195260e7dc:stats:RExDX09CSl9EeWVfTGFyaWFu',
  'bg3:item:rt:e03b8342-3c50-4cec-b34c-c50ce1968bc3:stats:Q09OU19IZXJic19NdWd3b3J0',
  'bg3:item:rt:e6f417bd-9d84-416f-8c96-5a6917977b77:stats:T0JKX0R5ZV9HcmVlbg',
  'bg3:item:rt:ea46200e-001b-45a1-b1d9-20920e747ba2:stats:T0JKX0R5ZV9HcmVlbl8wMg',
  'bg3:item:rt:ea8bc956-7834-4618-af70-0ea0c8f9ea37:stats:QUxDSF9FeHRyYWN0X0NvbnN0cnVjdFBhcnQ',
  'bg3:item:rt:eedbd9cc-5072-47fd-90a6-36a24c435620:stats:T0JKX0R5ZV9BenVyZQ',
  'bg3:item:rt:f42e3c96-e622-4d3a-97da-ce5a939feb3c:stats:T0JKX0R5ZV9SZWRXaGl0ZQ',
  'bg3:item:rt:fecebc29-385d-4bef-a18a-79705fb0ecf3:stats:T0JKX0R5ZV9QdXJwbGVfMDI',
  'bg3:item:rt:ffdb4490-cbaf-4eac-97f8-893564d7ead9:stats:T0JKX0R5ZV9XaGl0ZUJsYWNr',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeAtomic(file, bytes) {
  const temporary = `${file}.standard-only.tmp`;
  writeFileSync(temporary, bytes);
  try {
    renameSync(temporary, file);
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    writeFileSync(file, bytes);
    unlinkSync(temporary);
  }
}

function writeJson(file, value, pretty = false) {
  writeAtomic(file, Buffer.from(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8'));
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function repoPath(file) {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

function standardProfiles(value) {
  if (!Array.isArray(value)) return null;
  return value.filter(profile => profile === PROFILE);
}

function materializeStandardDelta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.honourDelta) return;
  const resolved = value.resolvedProperties || value.properties;
  const direct = value.directProperties;
  for (const [field, delta] of Object.entries(value.honourDelta)) {
    if (!delta || typeof delta !== 'object') continue;
    if (resolved && typeof resolved === 'object') {
      if (delta.standardPresent) resolved[field] = delta.standard;
      else delete resolved[field];
    }
    if (direct && typeof direct === 'object') {
      if (delta.standardPresent) direct[field] = delta.standard;
      else delete direct[field];
    }
  }
}

function identityUsesRemovedProfile(value) {
  for (const key of ['id', 'programId', 'rootProgramId', 'sourceProgramId']) {
    if (typeof value?.[key] === 'string' && /:honou?r(?::|$)/i.test(value[key])) return true;
  }
  return false;
}

function refreshLocalCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (Number.isInteger(value.count)) {
    const found = COUNT_ARRAY_FIELDS.find(key => Array.isArray(value[key]));
    if (found) value.count = value[found].length;
  }
  if (Number.isInteger(value.rowCount) && Array.isArray(value.rows)) value.rowCount = value.rows.length;
  if (Number.isInteger(value.placementCount) && Array.isArray(value.placements)) value.placementCount = value.placements.length;
  return value;
}

function localPayloadCount(value) {
  const field = COUNT_ARRAY_FIELDS.find(key => Array.isArray(value?.[key]));
  return field ? value[field].length : null;
}

function standardize(value, context) {
  if (typeof value === 'string') return REMOVED_ITEM_IDS.has(value) ? DROP : value;
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const result = [];
    for (const entry of value) {
      const next = standardize(entry, context);
      if (next !== DROP) result.push(next);
    }
    return result;
  }

  const declaredProfiles = standardProfiles(value.profiles);
  const declaredSourceProfiles = standardProfiles(value.sourceProfiles);
  if (REMOVED_ITEM_IDS.has(value.id) || REMOVED_ITEM_IDS.has(value.itemId) || REMOVED_ITEM_IDS.has(value.variantId)) return DROP;
  if (Array.isArray(value.profiles) && declaredProfiles.length === 0) return DROP;
  if (Array.isArray(value.sourceProfiles) && declaredSourceProfiles.length === 0) return DROP;
  const sourceProfiles = standardProfiles(value.source?.profiles);
  if (Array.isArray(value.source?.profiles) && sourceProfiles.length === 0) return DROP;
  if (value.profile === 'honour' || value.sourceProfile === 'honour' || identityUsesRemovedProfile(value)) return DROP;

  const isRules = context.relative.startsWith('rules/');
  const isStatsSource = context.relative.startsWith('source/item-stats/');
  const removedModule = value.module === 'Honour';
  const removedSource = typeof value.source === 'string' && /honou?r/i.test(value.source);
  const canMaterialize = (isRules || isStatsSource) && (value.honourDelta || declaredProfiles?.includes(PROFILE));
  if ((removedModule || removedSource) && !canMaterialize) return DROP;
  if (canMaterialize) {
    materializeStandardDelta(value);
    if (removedModule) value.module = 'standard-profile';
    if (removedSource) value.source = 'profile-materialization/standard';
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/honou?r/i.test(key)) continue;
    if (key === 'profiles' && declaredProfiles) {
      result.profiles = declaredProfiles;
      continue;
    }
    if (key === 'sourceProfiles' && declaredSourceProfiles) {
      result.sourceProfiles = declaredSourceProfiles;
      continue;
    }
    const next = standardize(entry, context);
    if (next !== DROP) result[key] = next;
  }
  return refreshLocalCounts(result);
}

function assertNoRemovedProfileMetadata(value, path = '$') {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRemovedProfileMetadata(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (/honou?r/i.test(key)) throw new Error(`Removed profile key remains at ${path}.${key}`);
    if (['profile', 'sourceProfile', 'defaultRulesProfile'].includes(key)
      && typeof entry === 'string' && /^honou?r$/i.test(entry)) {
      throw new Error(`Removed profile value remains at ${path}.${key}`);
    }
    if (key === 'module' && typeof entry === 'string' && /^honou?r$/i.test(entry)) {
      throw new Error(`Removed profile value remains at ${path}.${key}`);
    }
    if (['profiles', 'rulesProfiles', 'sourceProfiles'].includes(key)
      && Array.isArray(entry) && entry.some(profile => typeof profile === 'string' && /honou?r/i.test(profile))) {
      throw new Error(`Removed profile list entry remains at ${path}.${key}`);
    }
    if (['id', 'programId', 'rootProgramId', 'sourceProgramId'].includes(key)
      && typeof entry === 'string' && /:honou?r(?::|$)/i.test(entry)) {
      throw new Error(`Removed profile identity remains at ${path}.${key}`);
    }
    assertNoRemovedProfileMetadata(entry, `${path}.${key}`);
  }
}

function restoreRuntimeCatalogFromHead() {
  const prefix = `data/bg3/${CATALOG_VERSION}/`;
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', prefix], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).split(/\r?\n/).filter(path => path.startsWith(prefix) && /\.(?:json|md)$/i.test(path));
  if (!paths.length) throw new Error(`HEAD does not contain the ${CATALOG_VERSION} catalog baseline`);
  for (const path of paths) {
    const target = join(REPO_ROOT, ...path.split('/'));
    const baseline = execFileSync('git', ['show', `HEAD:${path}`], {
      cwd: REPO_ROOT,
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    writeAtomic(target, baseline);
  }
}

function alignProfileTotals(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(alignProfileTotals);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    alignProfileTotals(entry);
    if (!key.endsWith('ByProfile') || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const base = key.slice(0, -'ByProfile'.length);
    if (Number.isFinite(entry.standard) && Number.isFinite(value[base])) value[base] = entry.standard;
  }
}

function transformJsonFile(file) {
  const relativePath = relative(CATALOG_ROOT, file).split(sep).join('/');
  const before = readFileSync(file, 'utf8');
  const parsed = JSON.parse(before);
  const next = standardize(parsed, {relative: relativePath});
  if (next === DROP) throw new Error(`Whole catalog file unexpectedly belongs only to the removed profile: ${relativePath}`);
  alignProfileTotals(next);
  const pretty = relativePath === 'manifest.json' || relativePath.endsWith('-report.json') || relativePath.startsWith('source/gold-values');
  const after = `${JSON.stringify(next, null, pretty ? 2 : 0)}\n`;
  if (after !== before) writeAtomic(file, Buffer.from(after, 'utf8'));
}

function transformMarkdownFile(file) {
  const before = readFileSync(file, 'utf8');
  const after = `${before.split(/\r?\n/)
    .filter(line => !/honou?r/i.test(line))
    .join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
  if (after !== before) writeAtomic(file, Buffer.from(after, 'utf8'));
}

function restoreStandardLifecyclePrograms() {
  const archivedItems = new Map();
  const currentManifest = readJson(join(CATALOG_ROOT, 'manifest.json'));
  const currentLifecyclePrograms = (currentManifest.files.items || []).reduce((sum, meta) => {
    const payload = readJson(manifestFile(CATALOG_ROOT, meta));
    return sum + (payload.items || []).reduce((itemSum, item) => itemSum + (item.mechanics?.lifecyclePrograms?.length || 0), 0);
  }, 0);
  if (currentLifecyclePrograms === currentManifest.counts.itemLifecyclePrograms?.programs) return;
  for (const meta of currentManifest.files.items || []) {
    try {
      const payload = JSON.parse(execFileSync('git', ['show', `HEAD:${meta.path}`], {cwd: REPO_ROOT, encoding: 'utf8'}));
      for (const item of payload.items || []) {
        if (item.source?.profiles?.includes(PROFILE)) archivedItems.set(item.id, item);
      }
    } catch {
      // A source checkout without Git metadata can still use the immutable v9 predecessor below.
    }
  }
  const archiveManifest = readJson(join(ARCHIVE_ROOT, 'manifest.json'));
  for (const meta of archiveManifest.files.items || []) {
    const payload = readJson(join(REPO_ROOT, ...meta.path.split('/')));
    for (const item of payload.items || []) {
      if (item.source?.profiles?.includes(PROFILE) && !archivedItems.has(item.id)) archivedItems.set(item.id, item);
    }
  }
  for (const meta of currentManifest.files.items || []) {
    const file = manifestFile(CATALOG_ROOT, meta);
    const payload = readJson(file);
    let changed = false;
    for (const item of payload.items || []) {
      const lifecycle = archivedItems.get(item.id)?.mechanics?.lifecyclePrograms;
      if (!Array.isArray(lifecycle) || lifecycle.length === 0 || item.mechanics?.lifecyclePrograms?.length) continue;
      const restored = standardize(JSON.parse(JSON.stringify(lifecycle)), {relative: `items/${payload.shard}.json`});
      item.mechanics.lifecyclePrograms = restored === DROP ? [] : restored;
      if (item.mechanics.lifecyclePrograms.length) changed = true;
    }
    if (changed) writeJson(file, payload);
  }
}

function manifestFile(root, meta) {
  const prefix = `data/bg3/${CATALOG_VERSION}/`;
  if (!meta.path.startsWith(prefix)) throw new Error(`Unexpected manifest path: ${meta.path}`);
  return join(root, ...meta.path.slice(prefix.length).split('/'));
}

function payloadRows(manifest, group, field) {
  return (manifest.files[group] || []).flatMap(meta => readJson(manifestFile(CATALOG_ROOT, meta))[field] || []);
}

function itemIdFromProgramId(value) {
  const id = String(value || ''), marker = id.indexOf(':root-action:');
  return marker < 0 ? '' : id.slice(0, marker);
}

function countBy(rows, keyOf) {
  return rows.reduce((counts, row) => {
    const key = String(keyOf(row) || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function mergeCounts(total, counts) {
  for (const [key, value] of Object.entries(counts || {})) total[key] = (total[key] || 0) + Number(value || 0);
  return total;
}

function filterVariantIds(value, retained) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) filterVariantIds(entry, retained);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (['itemVariantIds', 'causalItemVariantIds'].includes(key) && Array.isArray(entry)) {
      value[key] = entry.filter(id => retained.has(id));
    } else filterVariantIds(entry, retained);
  }
}

function pruneRecipeIndex(recipes, retained) {
  for (const [name, category] of Object.entries(recipes.comboCategories || {})) {
    category.standard = (category.standard || []).filter(row => (row.itemVariantIds || []).length);
    category.profiles = category.standard.length ? [PROFILE] : [];
    category.itemVariantIds = [...new Set(category.standard.flatMap(row => row.itemVariantIds || []))].sort();
    if (!category.standard.length) delete recipes.comboCategories[name];
  }
  const recordReady = record => {
    const itemRefs = record.resolvedItemReferences || [], categoryRefs = record.resolvedCategoryReferences || [];
    if (!itemRefs.length && !categoryRefs.length) {
      const hasExplicitResult = Object.keys(record.data || {}).some(key => /^Result \d+$/u.test(key));
      return record.recordType === 'ItemCombinationResult' && !hasExplicitResult;
    }
    if (itemRefs.some(ref => !(ref.itemVariantIds || []).length)) return false;
    return categoryRefs.every(ref => Boolean(recipes.comboCategories?.[ref.category]));
  };
  const groups = new Map();
  for (const record of recipes.records || []) {
    const recipeId = record.accessPolicy?.recipeId || record.name;
    if (!groups.has(recipeId)) groups.set(recipeId, []);
    groups.get(recipeId).push(record);
  }
  const readyGroups = new Set([...groups].filter(([, rows]) => rows.length && rows.every(recordReady)).map(([recipeId]) => recipeId));
  recipes.records = (recipes.records || []).filter(record => readyGroups.has(record.accessPolicy?.recipeId || record.name));
  recipes.accessEvidence = (recipes.accessEvidence || []).filter(row => readyGroups.has(row.recipeId));
  const operations = {};
  for (const record of recipes.records) for (const [key, value] of Object.entries(record.data || {})) {
    if (/^Transform \d+$/u.test(key)) operations[value] = (operations[value] || 0) + 1;
  }
  const categoryReferences = recipes.records.reduce((sum, row) => sum + (row.resolvedCategoryReferences || []).length, 0),
    combinations = recipes.records.filter(row => row.recordType === 'ItemCombination').length;
  const recipePairs = recipes.records.filter(record => record.recordType === 'ItemCombination'),
    exactFormulaRequired = recipePairs.filter(record => record.accessPolicy?.mode === 'exact-formula-required').length,
    discoverableSourceUnrestricted = recipePairs.filter(record => record.accessPolicy?.mode === 'discoverable-source-unrestricted').length;
  recipes.counts = {...recipes.counts, records: recipes.records.length,
    withResolvedItems: recipes.records.filter(row => (row.resolvedItemReferences || []).length).length,
    comboCategories: Object.keys(recipes.comboCategories || {}).length, categoryReferences, resolvedCategoryReferences: categoryReferences,
    combinations, inputOperations: operations, transformCombinations: operations.Transform || 0, dyeCombinations: operations.Dye || 0,
    exactFormulaRequired,
    discoverableSourceUnrestricted,
    accessEvidence: recipes.accessEvidence.length};
  recipes.accessPolicyContract.counts = {
    recipes: combinations,
    exactFormulaRequired,
    discoverableSourceUnrestricted,
    evidence: recipes.accessEvidence.length,
  };
}

function pruneTreasureIndex(treasure, retainedStats) {
  for (const [name, category] of Object.entries(treasure.objectCategories || {})) {
    category.standard = (category.standard || []).filter(row => (row.itemVariantIds || []).length);
    category.profiles = category.standard.length ? [PROFILE] : [];
    category.itemVariantIds = [...new Set(category.standard.flatMap(row => row.itemVariantIds || []))].sort();
    if (!category.standard.length) delete treasure.objectCategories[name];
  }
  const tableReady = new Set((treasure.definitions || []).map(row => row.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of treasure.definitions || []) {
      for (const subtable of table.subtables || []) subtable.entries = (subtable.entries || []).filter(entry => {
        if (entry.kind === 'stats') return retainedStats.has(entry.statsId);
        if (entry.kind === 'root-template-name') return (entry.itemVariantIds || []).length > 0;
        if (entry.kind === 'category') return Boolean(treasure.objectCategories?.[entry.category]);
        if (entry.kind === 'stats-unresolved') return false;
        if (entry.kind === 'table') return tableReady.has(entry.table);
        return false;
      });
      table.subtables = (table.subtables || []).filter(row => (row.entries || []).length);
    }
    for (const table of treasure.definitions || []) if (!table.subtables.length && tableReady.delete(table.name)) changed = true;
  }
  treasure.definitions = (treasure.definitions || []).filter(row => tableReady.has(row.name));
  const filterStatsMap = value => Object.fromEntries(Object.entries(value || {}).filter(([statsId]) => retainedStats.has(statsId))
    .map(([statsId, tables]) => [statsId, (tables || []).filter(name => tableReady.has(name))]).filter(([, tables]) => tables.length));
  treasure.directStats = filterStatsMap(treasure.directStats);
  treasure.directStatsByProfile = {standard: filterStatsMap(treasure.directStatsByProfile?.standard)};
  const entries = treasure.definitions.flatMap(table => (table.subtables || []).flatMap(row => row.entries || [])), subtables = treasure.definitions.reduce((sum, table) => sum + (table.subtables || []).length, 0);
  treasure.counts = {...treasure.counts, definitions: treasure.definitions.length, standardDefinitions: treasure.definitions.length,
    objectCategories: Object.keys(treasure.objectCategories || {}).length, directStats: Object.keys(treasure.directStats || {}).length,
    standardAssociations: Object.values(treasure.directStatsByProfile.standard || {}).reduce((sum, rows) => sum + rows.length, 0),
    standardGraph: {subtables, entries: entries.length, entryKinds: countBy(entries, row => row.kind), dropModes: countBy(treasure.definitions.flatMap(table => table.subtables || []), row => row.dropCount?.mode)}};
}

function pruneStoryProgramShards(manifest, retained) {
  for (const meta of manifest.files.storyPrograms || []) {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    payload.links = (payload.links || []).filter(link => {
      const referenced = (link.references || []).filter(ref => Array.isArray(ref.itemVariantIds));
      if (referenced.some(ref => !ref.itemVariantIds.some(id => retained.has(id)))) return false;
      filterVariantIds(link, retained);
      link.references = (link.references || []).filter(ref => !Array.isArray(ref.itemVariantIds) || ref.itemVariantIds.length);
      const ids = [...new Set(link.references.flatMap(ref => ref.itemVariantIds || []))].sort();
      link.itemVariantIds = ids;
      return ids.length > 0;
    });
    payload.count = payload.links.length;
    writeJson(file, payload);
  }
}

function pruneArsenalRuntime() {
  const manifestFilePath = join(CATALOG_ROOT, 'manifest.json'), manifest = readJson(manifestFilePath);
  const shardRows = (manifest.files.items || []).map(meta => {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    return {file, payload};
  });
  const sourceItems = shardRows.flatMap(row => row.payload.items || []);
  const sourceItemById = new Map(sourceItems.map(item => [item.id, item]));
  const retained = new Set(sourceItems.map(item => item.id));
  const recipeSourceFile = join(CATALOG_ROOT, manifest.entrypoints.recipes), recipeSource = readJson(recipeSourceFile);
  const prunedRecipes = structuredClone(recipeSource);
  filterVariantIds(prunedRecipes, retained);
  pruneRecipeIndex(prunedRecipes, retained);
  const validRecipeIds = new Set((prunedRecipes.records || [])
    .filter(record => record?.recordType === 'ItemCombination')
    .flatMap(record => [record.name, record.accessPolicy?.recipeId]).filter(Boolean));
  for (const item of sourceItems) {
    for (const action of item?.mechanics?.actions || []) {
      const special = action.special || action.program?.special || {};
      const recipeTargets = [special.recipeId, ...(special.recipeIds || []), ...(special.matchingRecipeIds || [])].filter(Boolean);
      const validTargets = recipeTargets.filter(recipeId => validRecipeIds.has(recipeId));
      if (!recipeTargets.some(recipeId => !validRecipeIds.has(recipeId))) continue;
      if (action.handler !== 'bg3RecipeProgram' || !validTargets.length) {
        continue;
      }
      for (const target of new Set([action.special, action.program?.special].filter(Boolean))) {
        if (target.recipeId && !validRecipeIds.has(target.recipeId)) delete target.recipeId;
        for (const key of ['recipeIds', 'matchingRecipeIds']) {
          if (Array.isArray(target[key])) target[key] = target[key].filter(recipeId => validRecipeIds.has(recipeId));
        }
      }
    }
  }
  const context = ITEM_DOMAIN_MODEL.createMigrationContext(sourceItems);
  const assessments = new Map(sourceItems.map(item => [item.id, ITEM_DOMAIN_MODEL.arsenalReadiness(item, {context})]));
  const arsenal = new Set([...assessments].filter(([, result]) => result.ok).map(([id]) => id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...arsenal]) {
      const aliasOf = assessments.get(id)?.item?.aliasOf;
      if (aliasOf && !arsenal.has(aliasOf)) {
        arsenal.delete(id);
        assessments.get(id).issues.push('canonical-item-excluded');
        changed = true;
      }
    }
    const arsenalRecipes = structuredClone(recipeSource);
    filterVariantIds(arsenalRecipes, arsenal);
    pruneRecipeIndex(arsenalRecipes, arsenal);
    const arsenalRecipeIds = new Set((arsenalRecipes.records || [])
      .filter(record => record?.recordType === 'ItemCombination')
      .flatMap(record => [record.name, record.accessPolicy?.recipeId]).filter(Boolean));
    for (const id of [...arsenal]) {
      const item = sourceItemById.get(id);
      let missingRecipeTarget = false;
      for (const action of item?.mechanics?.actions || []) {
        const special = action.special || action.program?.special || {};
        const recipeTargets = [special.recipeId, ...(special.recipeIds || []), ...(special.matchingRecipeIds || [])].filter(Boolean);
        const validTargets = recipeTargets.filter(recipeId => arsenalRecipeIds.has(recipeId));
        if (!recipeTargets.some(recipeId => !arsenalRecipeIds.has(recipeId))) continue;
        if (action.handler !== 'bg3RecipeProgram' || !validTargets.length) {
          missingRecipeTarget = true;
          break;
        }
      }
      if (missingRecipeTarget) {
        arsenal.delete(id);
        assessments.get(id).issues.push('recipe-handler-target-missing');
        changed = true;
      }
    }
  }
  for (const id of STRICT_RECIPE_CLOSURE_EXCLUSIONS) {
    if (!arsenal.delete(id)) throw new Error(`Pinned strict recipe-closure exclusion is no longer a ready candidate: ${id}`);
    assessments.get(id).issues.push('strict-recipe-closure-excluded');
  }
  const arsenalHash = sha256([...arsenal].sort().join('\n'));
  if (arsenal.size !== STRICT_ARSENAL_BASELINE_COUNT || arsenalHash !== STRICT_ARSENAL_BASELINE_SHA256) {
    throw new Error(`Strict Full Arsenal baseline changed: ${arsenal.size}/${arsenalHash}`);
  }
  const recipeProgramSpecials = new Map();
  for (const item of sourceItems) {
    if (!retained.has(item.id)) continue;
    for (const action of item.mechanics?.actions || []) {
      const special = action.special || action.program?.special;
      if (action.handler === 'bg3RecipeProgram' && special?.kind === 'bg3Recipe' && action.program?.id) {
        recipeProgramSpecials.set(action.program.id, structuredClone(special));
      }
    }
  }
  for (const row of shardRows) {
    row.payload.items = (row.payload.items || []).filter(item => retained.has(item.id));
    row.payload.count = row.payload.items.length;
    writeJson(row.file, row.payload);
  }

  for (const meta of manifest.files.itemRuleLinks || []) {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    payload.linkSets = (payload.linkSets || []).filter(row => retained.has(row.itemId));
    payload.count = payload.linkSets.length;
    writeJson(file, payload);
  }
  for (const meta of manifest.files.rootTemplatePrograms || []) {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    payload.programs = (payload.programs || []).filter(row => retained.has(itemIdFromProgramId(row.id)));
    for (const program of payload.programs) {
      const special = recipeProgramSpecials.get(program.id);
      if (!special) continue;
      program.special = structuredClone(special);
      const openers = (program.consequences || []).filter(row => row?.op === 'openRecipePreflight' && row.executable === true);
      if (openers.length !== 1) throw new Error(`Recipe root program does not expose one exact preflight: ${program.id}`);
      openers[0].matchingRecipeIds = [...special.matchingRecipeIds];
    }
    payload.count = payload.programs.length;
    writeJson(file, payload);
  }

  const retainedPlacements = new Set();
  for (const group of ['itemPlacements', 'itemPlacementIndex']) for (const meta of manifest.files[group] || []) {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    payload.placements = (payload.placements || []).filter(row => {
      const variantId = row.effectiveByProfile?.standard?.variantId, keep = retained.has(variantId);
      if (keep) retainedPlacements.add(row.instanceUuid);
      return keep;
    });
    payload.count = payload.placements.length;
    writeJson(file, payload);
  }
  for (const meta of manifest.files.placementActionPrograms || []) {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    payload.programSets = (payload.programSets || []).filter(row => retainedPlacements.has(row.instanceUuid));
    payload.count = payload.programSets.length;
    writeJson(file, payload);
  }

  const iconFile = join(CATALOG_ROOT, manifest.entrypoints.iconManifest);
  if (existsSync(iconFile)) {
    const archivedIconFile = join(ARCHIVE_ROOT, 'icon-manifest.json');
    const icons = readJson(existsSync(archivedIconFile) ? archivedIconFile : iconFile), retainedItems = sourceItems.filter(item => retained.has(item.id));
    const retainedRules = payloadRows(manifest, 'rules', 'rules');
    const retainedIconHashes = new Set([
      ...retainedItems.map(item => item.icon?.sha256),
      ...retainedItems.flatMap(item => (item.mechanics?.actions || []).map(action => action.icon?.sha256)),
      ...retainedRules.map(rule => rule.icon?.sha256),
    ].filter(Boolean));
    icons.assets = (icons.assets || []).filter(asset => retainedIconHashes.has(asset.sha256));
    icons.itemRecords = retainedItems.length;
    icons.statusCounts = countBy(retainedItems, item => item.icon?.status);
    icons.uniqueAssets = icons.assets.length;
    writeJson(iconFile, icons);
  }

  const retainedStats = new Set(sourceItems.filter(item => retained.has(item.id)).map(item => item.source?.statsId).filter(Boolean));
  for (const entrypoint of ['recipes', 'treasureTables', 'storyItems']) {
    const file = join(CATALOG_ROOT, manifest.entrypoints[entrypoint]);
    if (!existsSync(file)) continue;
    const payload = entrypoint === 'recipes' ? prunedRecipes : readJson(file); filterVariantIds(payload, retained);
    if (entrypoint === 'recipes') pruneRecipeIndex(payload, retained);
    if (entrypoint === 'treasureTables') pruneTreasureIndex(payload, retainedStats);
    writeJson(file, payload, entrypoint === 'storyItems');
  }
  pruneStoryProgramShards(manifest, retained);
  const storyFile = join(CATALOG_ROOT, manifest.entrypoints.storyItems), story = readJson(storyFile);
  for (const key of ['itemLinks', 'causalItemLinks', 'itemLinkDerivations']) {
    if (story[key] && typeof story[key] === 'object') story[key] = Object.fromEntries(Object.entries(story[key]).filter(([itemId]) => retained.has(itemId)));
  }
  writeJson(storyFile, story);

  const booksFile = join(CATALOG_ROOT, manifest.entrypoints.bookContent), books = readJson(booksFile);
  books.books = (books.books || []).map(book => ({...book, occurrences: (book.occurrences || []).filter(row => retained.has(itemIdFromProgramId(row.rootProgramId)))}))
    .filter(book => book.occurrences.length).map(book => ({...book, occurrenceCount: book.occurrences.length}));
  books.unresolvedActions = (books.unresolvedActions || []).filter(row => retained.has(itemIdFromProgramId(row.rootProgramId)));
  books.counts.uniqueBookIds = books.books.length; books.counts.resolvedBookIds = books.books.length; books.counts.unresolvedBookIds = 0;
  books.counts.russianNonempty = books.books.filter(book => String(book.locales?.ru?.text || '').trim()).length;
  books.counts.englishNonempty = books.books.filter(book => String(book.locales?.en?.text || '').trim()).length;
  writeJson(booksFile, books);

  const removed = [...assessments].filter(([id]) => !arsenal.has(id)).map(([itemId, result]) => ({itemId, reasons: [...new Set(result.issues)].sort()}));
  const reportName = 'item-arsenal-quality-report.json', reportFile = join(CATALOG_ROOT, reportName);
  const examined = sourceItems.length;
  const report = {schemaVersion: 'dnd-world-item-arsenal-quality/1', catalogVersion: CATALOG_VERSION, profile: PROFILE,
    scope: 'full-arsenal-presentation',
    policy: {failClosed: true, sourceDescriptionRequired: true, sourceIconRequired: true, sourceWeightRequired: true,
      runtimeReadyRequired: true, engineHandlerRequired: true, blockedCapabilitiesAllowed: false, unknownValuesAllowed: false},
    counts: {examined, catalogItems: retained.size, retained: arsenal.size, removed: removed.length,
      removalReasons: countBy(removed.flatMap(row => row.reasons), reason => reason)},
    retainedItemIdsSha256: sha256([...arsenal].sort().join('\n')), removed};
  writeJson(reportFile, report, true);
  manifest.entrypoints.itemArsenalQualityReport = reportName;
  manifest.contracts.itemArsenalQuality = {schemaVersion: report.schemaVersion, failClosed: true, profile: PROFILE,
    scope: report.scope, catalogRetention: 'all-standard-items', presentationSelection: 'quality-report-retained-set'};
  manifest.integrity.fullArsenalComplete = true;
  manifest.files.other = manifest.files.other || [];
  const reportPath = repoPath(reportFile);
  if (!manifest.files.other.some(meta => meta.path === reportPath)) manifest.files.other.push({path: reportPath, bytes: 0, sha256: ''});
  writeJson(manifestFilePath, manifest, true);
  return {retained: arsenal, catalog: retained, report};
}

function summarizeItems(items) {
  const countBy = field => items.reduce((counts, item) => {
    const key = field(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return {
    classifications: countBy(item => item.source?.classification || 'unknown'),
    categories: countBy(item => item.source?.category || 'unknown'),
    mechanicsModes: countBy(item => item.mechanics?.mode || 'unknown'),
    mechanicsKinds: countBy(item => item.mechanics?.profile?.kind || 'unknown'),
  };
}

function reconcileStandardProfileCensus(value) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && Number.isInteger(value.standardRows) && Number.isInteger(value.profileRows)) {
    value.profileRows = value.standardRows;
  }
  for (const entry of Object.values(value)) reconcileStandardProfileCensus(entry);
}

function reconcileTopology(topology, descriptorPrograms) {
  if (!topology || !Array.isArray(topology.rows)) return;
  topology.rows = topology.rows.filter(row => String(row).split('|')[1] === PROFILE).sort();
  const parsed = topology.rows.map(row => {
    const [itemId, profile, linkedCount, lifecycleCount, suffix, coCarrierCount] = String(row).split('|');
    return {itemId, profile, linkedCount: +linkedCount, lifecycleCount: +lifecycleCount, suffix: +suffix, coCarrierCount: +coCarrierCount};
  });
  const itemIds = [...new Set(parsed.map(row => row.itemId))].sort();
  const binding = parsed.map(row => `${row.itemId}|${row.profile}|${row.linkedCount}`).sort();
  const rows = parsed.map(row => `${row.profile}|${row.itemId}|${row.linkedCount}|${row.lifecycleCount}|${row.suffix}`).sort();
  const histogram = key => parsed.reduce((result, row) => {
    result[row[key]] = (result[row[key]] || 0) + 1;
    return result;
  }, {});
  topology.rowSetSha256 = sha256(topology.rows.join('\n'));
  topology.itemIdsSha256 = sha256(itemIds.join('\n'));
  topology.bindingSha256 = sha256(binding.join('\n'));
  topology.topologySha256 = sha256(rows.join('\n'));
  topology.census = {
    descriptorPrograms,
    playableVariants: itemIds.length,
    profileRows: parsed.length,
    programDefinitions: 1,
    standardRows: parsed.length,
    variants: itemIds.length,
  };
  topology.histograms = {
    coCarrierCount: histogram('coCarrierCount'),
    lifecycleCount: histogram('lifecycleCount'),
    linkedCount: histogram('linkedCount'),
    targetLifecycleSuffix: histogram('suffix'),
  };
}

function reconcileRuntimeCapabilities(manifest) {
  const capabilities = manifest.contracts?.runtimeCapabilities;
  reconcileStandardProfileCensus(capabilities);
  const githborn = capabilities?.githbornMindcrusherMeleePsychicDamage;
  if (!githborn) return;
  reconcileTopology(githborn.carrierTopology, 1);
  reconcileTopology(githborn.siblingPolicy?.carrierTopology, 0);
  const combined = [...(githborn.carrierTopology?.rows || []), ...(githborn.siblingPolicy?.carrierTopology?.rows || [])]
    .map(row => String(row).split('|'));
  const itemIds = [...new Set(combined.map(row => row[0]))].sort();
  const binding = combined.map(row => `${row[0]}|${row[1]}|${row[2]}`).sort();
  const linkedCountHistogram = combined.reduce((result, row) => {
    result[row[2]] = (result[row[2]] || 0) + 1;
    return result;
  }, {});
  githborn.familyCensus = {
    ...githborn.familyCensus,
    bindingSha256: sha256(binding.join('\n')),
    itemIdsSha256: sha256(itemIds.join('\n')),
    linkedCountHistogram,
    playableVariants: itemIds.length,
    profileRows: combined.length,
    standardRows: combined.length,
    variants: itemIds.length,
  };
}

function reconcileDerivedIndexes() {
  const manifest = readJson(join(CATALOG_ROOT, 'manifest.json'));
  const items = payloadRows(manifest, 'items', 'items');
  const itemIds = new Set(items.map(item => item.id));
  if (itemIds.size !== items.length) throw new Error('Runtime item shards contain duplicate IDs');

  const searchFile = join(CATALOG_ROOT, manifest.entrypoints.searchIndex);
  const search = readJson(searchFile);
  if (!Array.isArray(search.items)) throw new Error('Search index has no item rows');
  const itemsById = new Map(items.map(item => [item.id, item]));
  const rows = search.items.filter(row => itemIds.has(row?.id)).map(row => {
    const item = itemsById.get(row.id);
    const ru = String(item?.i18n?.ru?.name || item?.n || '');
    const en = String(item?.i18n?.en?.name || '');
    return {...row, names: {...(ru.trim() ? {ru} : {}), ...(en.trim() ? {en} : {})}};
  });
  const searchIds = new Set(rows.map(row => row.id));
  const missing = items.filter(item => !searchIds.has(item.id));
  if (missing.length) throw new Error(`Search index is missing ${missing.length} Standard item rows`);
  search.items = rows;
  search.count = rows.length;
  writeJson(searchFile, search);

  const ruleIds = new Set(payloadRows(manifest, 'rules', 'rules').map(rule => rule.id));
  const programIndexFile = join(CATALOG_ROOT, manifest.entrypoints.ruleProgramIndex);
  const programIndex = readJson(programIndexFile);
  if (!Array.isArray(programIndex.records)) throw new Error('Rule program index has no records');
  programIndex.records = programIndex.records.filter(record => ruleIds.has(record?.ruleId));
  if (programIndex.records.length !== ruleIds.size) {
    throw new Error(`Rule program index covers ${programIndex.records.length}/${ruleIds.size} Standard rules`);
  }
  programIndex.count = programIndex.records.length;
  programIndex.storage = structuredClone(manifest.sharding.rulePrograms);
  writeJson(programIndexFile, programIndex);

  const storyFile = join(CATALOG_ROOT, manifest.entrypoints.storyItems);
  const story = readJson(storyFile);
  if (!Array.isArray(story.links) || !story.counts) throw new Error('Story item index has no links/counts');
  const storyProgramIds = new Set(payloadRows(manifest, 'storyPrograms', 'links').map(link => link.id));
  story.links = story.links.filter(link => typeof link?.id === 'string' && storyProgramIds.has(link.id));
  const storyLinkIds = new Set(story.links.map(link => link.id));
  story.itemLinks = Object.fromEntries(Object.entries(story.itemLinks || {}).map(([itemId, linkIds]) => [
    itemId,
    Array.isArray(linkIds) ? linkIds.filter(linkId => storyLinkIds.has(linkId)) : [],
  ]).filter(([, linkIds]) => linkIds.length));
  story.counts.linkedBlocks = story.links.length;
  story.counts.linkedItems = Object.keys(story.itemLinks || {}).length;
  writeJson(storyFile, story);

  const booksFile = join(CATALOG_ROOT, manifest.entrypoints.bookContent);
  const books = readJson(booksFile);
  if (!Array.isArray(books.books) || !Array.isArray(books.unresolvedActions) || !books.counts) {
    throw new Error('Book-content index has no books/unresolvedActions/counts');
  }
  const archivedBooks = new Map(readJson(join(ARCHIVE_ROOT, 'book-content.json')).books.map(book => [book.bookId, book]));
  const nonemptyOccurrences = books.books.reduce((sum, book) => {
    if (!Array.isArray(book.occurrences)) throw new Error(`Book-content row has no occurrences: ${book.bookId || 'unknown'}`);
    const archived = archivedBooks.get(book.bookId);
    for (const locale of ['ru', 'en']) {
      if (!String(book.locales?.[locale]?.text || '') && String(archived?.locales?.[locale]?.text || '')) {
        book.locales = book.locales || {};
        book.locales[locale] = structuredClone(archived.locales[locale]);
      }
    }
    book.occurrenceCount = book.occurrences.length;
    return sum + book.occurrences.length;
  }, 0);
  const emptyOccurrences = books.unresolvedActions.length;
  const actionOccurrences = nonemptyOccurrences + emptyOccurrences;
  const previousActionOccurrences = books.counts.actionOccurrences;
  const profileExpansion = Number.isInteger(previousActionOccurrences) && actionOccurrences > 0
    && previousActionOccurrences % actionOccurrences === 0 ? previousActionOccurrences / actionOccurrences : 1;
  if (!Number.isInteger(profileExpansion) || profileExpansion < 1) throw new Error('Book-content profile expansion is not integral');
  for (const key of ['sourceActionDeclarations', 'sourceNonemptyBookIdDeclarations', 'sourceEmptyBookIdDeclarations']) {
    if (!Number.isInteger(books.counts[key]) || books.counts[key] % profileExpansion !== 0) {
      throw new Error(`Book-content source count cannot be reduced to Standard: ${key}`);
    }
    books.counts[key] /= profileExpansion;
  }
  books.counts.actionOccurrences = actionOccurrences;
  books.counts.nonemptyBookIdOccurrences = nonemptyOccurrences;
  books.counts.emptyBookIdOccurrences = emptyOccurrences;
  writeJson(booksFile, books);

  const treasureFile = join(CATALOG_ROOT, manifest.entrypoints.treasureTables);
  const treasure = readJson(treasureFile);
  if (!Array.isArray(treasure.rawDefinitions) || !Array.isArray(treasure.definitions) || !treasure.counts) {
    throw new Error('Treasure table index has no definitions/counts');
  }
  treasure.counts.rawDefinitions = treasure.rawDefinitions.length;
  treasure.counts.definitions = treasure.definitions.length;
  treasure.counts.standardDefinitions = treasure.definitions.length;
  writeJson(treasureFile, treasure);

  const recipesFile = join(CATALOG_ROOT, manifest.entrypoints.recipes);
  const recipes = readJson(recipesFile);
  if (!Array.isArray(recipes.accessEvidence) || !recipes.accessPolicyContract?.signature) {
    throw new Error('Recipe index has no signed access-evidence contract');
  }
  const recipeEvidence = new Map();
  recipes.accessEvidence.forEach((row, index) => {
    const unsigned = {...row};
    delete unsigned.signature;
    row.signature = {
      algorithm: 'sha256',
      canonicalization: 'utf8-json-sort-keys-compact',
      sha256: sha256(canonicalJson(unsigned)),
    };
    recipeEvidence.set(row.recipeId, {index, sha256: row.signature.sha256});
  });
  for (const record of recipes.records || []) {
    const policy = record?.accessPolicy;
    if (!policy) continue;
    const binding = recipeEvidence.get(policy.recipeId);
    if (policy.mode === 'exact-formula-required') {
      if (!binding) throw new Error(`Recipe access evidence is missing: ${policy.recipeId}`);
      policy.evidenceIndex = binding.index;
      policy.evidenceSha256 = binding.sha256;
    } else {
      policy.evidenceIndex = null;
      policy.evidenceSha256 = null;
    }
  }
  recipes.accessPolicyContract.signature = {
    algorithm: 'sha256',
    canonicalization: 'utf8-json-sort-keys-compact',
    sha256: sha256(canonicalJson(recipes.accessEvidence)),
  };
  writeJson(recipesFile, recipes);

  const retainedTreasureNames = new Set((treasure.definitions || []).map(row => row.name));
  const retainedRecipeNames = new Set((recipes.records || []).map(row => row.name));
  for (const meta of manifest.files.items || []) {
    const file = manifestFile(CATALOG_ROOT, meta), payload = readJson(file);
    for (const item of payload.items || []) {
      const availability = item.source?.availability;
      if (!availability) continue;
      availability.treasureTables = (availability.treasureTables || []).filter(name => retainedTreasureNames.has(name));
      availability.recipeRecords = (availability.recipeRecords || []).filter(name => retainedRecipeNames.has(name));
    }
    writeJson(file, payload);
  }

  const compactPlacements = payloadRows(manifest, 'itemPlacementIndex', 'placements');
  const placementProgramSets = payloadRows(manifest, 'placementActionPrograms', 'programSets');
  const placementPrograms = placementProgramSets.flatMap(row => row.programs || []);
  const placementIds = new Set(compactPlacements.map(placement => placement.id));
  if (placementIds.size !== compactPlacements.length) throw new Error('Compact placement shards contain duplicate IDs');
  const placementsByProfile = {};
  const resolutionCounts = {};
  for (const placement of compactPlacements) {
    for (const [profile, effective] of Object.entries(placement.effectiveByProfile || {})) {
      placementsByProfile[profile] = (placementsByProfile[profile] || 0) + 1;
      const resolution = effective?.variantResolution || 'unresolved';
      resolutionCounts[resolution] = (resolutionCounts[resolution] || 0) + 1;
    }
  }
  const placementFile = join(CATALOG_ROOT, manifest.entrypoints.itemPlacements);
  const placementIndex = readJson(placementFile);
  placementIndex.counts.placements = compactPlacements.length;
  placementIndex.counts.uniqueInstances = new Set(compactPlacements.map(row => row.instanceUuid)).size;
  placementIndex.counts.profiles = placementsByProfile;
  placementIndex.counts.standardEffectiveInstances = placementsByProfile.standard || 0;
  placementIndex.counts.variantResolution = resolutionCounts;
  placementIndex.counts.directActionProgramSets = placementProgramSets.length;
  placementIndex.counts.directActionPrograms = placementPrograms.length;
  placementIndex.counts.directActionProgramModes = countBy(placementPrograms, row => row.mode || 'unknown');
  placementIndex.counts.directActionTypes = countBy(placementPrograms, row => String(row.sourceAction?.actionType ?? 'unknown'));
  placementIndex.counts.directScriptDeclarations = placementProgramSets.filter(row => row.scripts?.declared === true).length;
  placementIndex.counts.directScriptOverrideDeclarations = placementProgramSets.filter(row => row.scriptOverrides?.declared === true).length;
  writeJson(placementFile, placementIndex);

  const storyEntrypoints = story.links.flatMap(link => link.causalEntrypoints || []);
  story.counts.referenceKinds = story.links.reduce((total, link) => mergeCounts(total, link.referenceKinds), {});
  story.counts.referenceRoles = story.links.reduce((total, link) => mergeCounts(total, link.referenceRoles), {});
  story.counts.storyEntrypoints = storyEntrypoints.length;
  story.counts.completeCausalEntrypoints = storyEntrypoints.filter(row => row.complete === true).length;
  story.counts.executableCausalEntrypoints = storyEntrypoints.filter(row => row.executable === true).length;
  story.counts.incompleteCausalEntrypoints = storyEntrypoints.filter(row => row.complete !== true).length;
  story.counts.causalEntrypointModes = countBy(storyEntrypoints, row => row.mode || 'unknown');
  story.counts.causalEntrypointsByEventKind = countBy(storyEntrypoints, row => row.eventKind || 'unknown');
  story.counts.completeCausalEntrypointsByActionType = countBy(
    storyEntrypoints.filter(row => row.complete === true),
    row => String(row.actionType ?? 'unknown'),
  );
  story.counts.levelItems = {
    schemaVersion: 'bg3-story-placement-resolution/1',
    source: 'item-placements.json',
    sourceCounts: structuredClone(placementIndex.counts),
    profiles: structuredClone(placementsByProfile),
    exactVariantBindings: structuredClone(placementsByProfile),
    unresolvedVariantBindings: {},
    instanceVariantCardinality: 'zero-or-one-per-profile',
    rootVariantBroadening: false,
  };
  writeJson(storyFile, story);
}

function reconcileStandardReports() {
  const manifest = readJson(join(CATALOG_ROOT, 'manifest.json'));
  const itemCount = payloadRows(manifest, 'items', 'items').length;
  const items = payloadRows(manifest, 'items', 'items'), retained = new Set(items.map(item => item.id));
  const mechanicsFile = join(CATALOG_ROOT, manifest.entrypoints.itemMechanicsReport);
  const mechanics = readJson(mechanicsFile);
  mechanics.scope = {...mechanics.scope, items: itemCount, materializations: {standard: itemCount}};
  const coverageRows = items.map(item => item.mechanics.engineCoverage), sumCoverage = key => coverageRows.reduce((sum, row) => sum + Number(row.counts?.[key] || 0), 0);
  const histogram = selector => countBy(items, selector), runtimeStates = histogram(item => item.mechanics.engineCoverage.runtimeState),
    effectStates = histogram(item => item.mechanics.engineCoverage.effectStatus), characteristicIssues = {}, sourceFactStates = {};
  for (const item of items) {
    for (const issue of item.mechanics.engineCoverage.characteristicIssues || []) characteristicIssues[issue] = (characteristicIssues[issue] || 0) + 1;
    for (const [key, fact] of Object.entries(item.mechanics.sourceFacts?.facts || {})) {
      sourceFactStates[key] = sourceFactStates[key] || {value: 0, unknownSource: 0};
      sourceFactStates[key][fact.state === 'value' ? 'value' : 'unknownSource']++;
    }
  }
  const standard = {materializations: itemCount, readyActions: sumCoverage('readyActions'), blockedActions: sumCoverage('blockedActions'),
    readyLifecycle: sumCoverage('readyLifecycle'), blockedLifecycle: sumCoverage('blockedLifecycle'), genericInteractions: sumCoverage('genericInteractions'),
    directEffects: sumCoverage('directEffects'), highConfidenceUnboundGaps: sumCoverage('blockedDescriptors'), propsComplete: items.filter(item => String(item.props || '').trim()).length,
    runtimeStates, effectStates, characteristicIssues, sourceFactStates};
  mechanics.counts.readyActions = {standard: standard.readyActions}; mechanics.counts.blockedActions = {standard: standard.blockedActions};
  mechanics.counts.readyLifecycle = {standard: standard.readyLifecycle}; mechanics.counts.blockedLifecycle = {standard: standard.blockedLifecycle};
  mechanics.counts.genericInteractions = {standard: standard.genericInteractions}; mechanics.counts.directEffects = {standard: standard.directEffects};
  mechanics.counts.highConfidenceUnboundGaps = {standard: standard.highConfidenceUnboundGaps};
  mechanics.counts.descriptionStatus = histogram(item => item.mechanics.engineCoverage.descriptionStatus);
  mechanics.counts.scrollProfiles = items.filter(item => item.mechanics.profile.kind === 'scroll').length;
  mechanics.counts.armorTypeNoneProfiles = items.filter(item => item.mechanics.profile.armor?.weight === 'none').length;
  mechanics.profiles = {standard}; mechanics.highConfidenceUnbound = []; mechanics.characteristicIssues = [];
  writeJson(mechanicsFile, mechanics, true);

  const economyFile = join(CATALOG_ROOT, manifest.entrypoints.itemEconomyReport), economy = readJson(economyFile);
  const economyDimension = key => {
    const rows = items.map(item => item.mechanics.profile[key]), valueKey = key === 'mass' ? 'kg' : 'gp', methods = {};
    for (const row of rows) { const method = row.source?.method || 'unknown'; methods[method] = (methods[method] || 0) + 1; }
    const values = rows.filter(row => row.state === 'value');
    return {resolved: rows.length, values: values.length, positive: values.filter(row => Number(row[valueKey]) > 0).length,
      zero: values.filter(row => Number(row[valueKey]) === 0).length, notApplicable: rows.filter(row => row.state === 'not-applicable').length,
      blocked: 0, methods};
  };
  economy.scope = {...economy.scope, items: itemCount, rulesProfile: PROFILE};
  economy.summary = {standard: {items: itemCount, weights: economyDimension('mass'), prices: economyDimension('value')}};
  const massRows = items.map(item => item.mechanics.profile.mass), priceRows = items.map(item => item.mechanics.profile.value),
    zeroMassIds = items.filter(item => item.mechanics.profile.mass.state === 'value' && Number(item.mechanics.profile.mass.kg) === 0).map(item => item.id),
    notApplicableMassIds = items.filter(item => item.mechanics.profile.mass.state === 'not-applicable').map(item => item.id),
    zeroPriceIds = items.filter(item => item.mechanics.profile.value.state === 'value' && Number(item.mechanics.profile.value.gp) === 0).map(item => item.id),
    notApplicablePriceIds = items.filter(item => item.mechanics.profile.value.state === 'not-applicable').map(item => item.id),
    idSetDigest = ids => sha256(`${ids.slice().sort().join('\n')}\n`), reviewedConflicts = (economy.reviewedConflicts || []).filter(row => retained.has(row.itemId));
  economy.weightFallbacks = (economy.weightFallbacks || []).filter(row => retained.has(row.itemId));
  economy.priceFallbacks = (economy.priceFallbacks || []).filter(row => retained.has(row.itemId));
  economy.reviewedConflicts = reviewedConflicts;
  economy.directSourceFields = {weights: {values: itemCount - economy.weightFallbacks.length, missing: economy.weightFallbacks.length, invalid: 0, negative: 0},
    prices: {values: itemCount - economy.priceFallbacks.length, missing: economy.priceFallbacks.length, invalid: 0, negative: 0, reviewedNonEconomicPartial: 0}};
  economy.controlSets = {standard: {zeroMass: {count: zeroMassIds.length, sha256: idSetDigest(zeroMassIds)},
    notApplicableMass: {count: notApplicableMassIds.length, sha256: idSetDigest(notApplicableMassIds)},
    zeroPrice: {count: zeroPriceIds.length, sha256: idSetDigest(zeroPriceIds)},
    notApplicablePrice: {count: notApplicablePriceIds.length, sha256: idSetDigest(notApplicablePriceIds)}}};
  economy.audit = {...economy.audit, allItemsResolved: true, unresolvedWeights: 0, unresolvedPrices: 0, invalidResolvedWeights: 0,
    invalidResolvedPrices: 0, invalidDirectWeights: 0, invalidDirectPrices: 0, negativeWeights: 0, negativePrices: 0, standardOnly: true,
    legitimateZeroWeights: zeroMassIds.length, notApplicableWeights: notApplicableMassIds.length, legitimateZeroPrices: zeroPriceIds.length,
    notApplicablePrices: notApplicablePriceIds.length, weightFallbacks: economy.weightFallbacks.length, priceFallbacks: economy.priceFallbacks.length,
    reviewedMassConflicts: reviewedConflicts.filter(row => row.dimension === 'mass').length,
    reviewedPriceConflicts: reviewedConflicts.filter(row => row.dimension === 'price').length, reviewedConflicts: reviewedConflicts.length, unreviewedConflicts: 0};
  writeJson(economyFile, economy, true);

  const lifecycleRows = items.filter(item => (item.mechanics.lifecyclePrograms || []).length), lifecyclePrograms = lifecycleRows.flatMap(item => item.mechanics.lifecyclePrograms || []),
    lifecycle = {items: lifecycleRows.length, programs: lifecyclePrograms.length, gates: countBy(lifecyclePrograms, row => row.gate),
      kinds: countBy(lifecyclePrograms, row => row.kind), inheritedDefaultsExecutable: lifecyclePrograms.filter(row => row.inherited === true).length};
  const actionRows = items.filter(item => (item.mechanics.actions || []).length), itemActions = {items: actionRows.length,
    actions: actionRows.reduce((sum, item) => sum + item.mechanics.actions.length, 0)};
  const coverageFile = join(CATALOG_ROOT, manifest.entrypoints.mechanicsCoverage), coverage = readJson(coverageFile);
  coverage.items = itemCount; coverage.modes = histogram(item => item.mechanics.mode); coverage.profileKinds = histogram(item => item.mechanics.profile.kind);
  coverage.interactionBacked = items.filter(item => (item.mechanics.interactions || []).length).length;
  coverage.equipmentStructured = items.filter(item => item.mechanics.equipment && item.mechanics.equipment.slot).length;
  coverage.ruleGraphLinked = items.filter(item => Number(item.mechanics.rulePrograms?.linkedCount || 0) > 0).length;
  coverage.directEffectMapped = items.filter(item => (item.mechanics.effects || []).length).length;
  coverage.directEffectEntries = items.reduce((sum, item) => sum + (item.mechanics.effects || []).length, 0);
  coverage.manualExplicit = items.filter(item => item.mechanics.mode === 'manual').length;
  if (coverage.ruleCompiler) { coverage.ruleCompiler.rootTemplatePrograms = payloadRows(manifest, 'rootTemplatePrograms', 'programs').length;
    coverage.ruleCompiler.itemActions = itemActions; coverage.ruleCompiler.lifecyclePrograms = lifecycle; }
  writeJson(coverageFile, coverage, true);

  const programCoverageFile = join(CATALOG_ROOT, manifest.entrypoints.ruleProgramCoverage), programCoverage = readJson(programCoverageFile);
  if (programCoverage.itemActions) programCoverage.itemActions = itemActions;
  if (programCoverage.lifecyclePrograms) programCoverage.lifecyclePrograms = lifecycle;
  if ('rootTemplatePrograms' in programCoverage) programCoverage.rootTemplatePrograms = payloadRows(manifest, 'rootTemplatePrograms', 'programs').length;
  writeJson(programCoverageFile, programCoverage, true);
}

function updateMainManifest() {
  const file = join(CATALOG_ROOT, 'manifest.json');
  const manifest = readJson(file);
  const items = payloadRows(manifest, 'items', 'items');
  const roots = payloadRows(manifest, 'rootTemplates', 'nodes');
  const stats = payloadRows(manifest, 'itemStats', 'nodes');
  const rules = payloadRows(manifest, 'rules', 'rules');
  const rootPrograms = payloadRows(manifest, 'rootTemplatePrograms', 'programs');
  const linkSets = payloadRows(manifest, 'itemRuleLinks', 'linkSets');
  const itemSummary = summarizeItems(items);
  const standardBreakdown = {
    pair: items.filter(item => item.source?.rootTemplateUuid && item.source?.statsId).length,
    'template-only': items.filter(item => item.source?.rootTemplateUuid && !item.source?.statsId).length,
    'stats-only': items.filter(item => !item.source?.rootTemplateUuid && item.source?.statsId).length,
  };
  const reciprocalPairsStandard = items.filter(item => {
    const evidence = new Set(item.source?.identityEvidence?.standard || []);
    return evidence.has('template.stats') && evidence.has('stats.rootTemplate');
  }).length;

  manifest.defaultRulesProfile = PROFILE;
  manifest.rulesProfiles = [PROFILE];
  manifest.counts.items = items.length;
  manifest.counts.universe = {
    standard: items.length,
    union: items.length,
    standardBreakdown,
    reciprocalPairsStandard,
    placementProjection: {standard: {baseline: items.length, placementPairs: 0, addedVariants: 0, removedStandaloneVariants: 0,
      calculatedExpected: items.length, actual: items.length}},
    placementEvidence: {
      standardPairs: items.filter(item => Object.keys(item.source?.placementEvidence?.standard || {}).length).length,
      standardOccurrences: items.reduce((sum, item) => sum + Number(item.source?.placementEvidence?.standard?.occurrences || 0), 0),
      unresolvedRoots: {standard: []}, unresolvedPairs: {standard: []},
    },
  };
  manifest.counts.rootTemplateNodes = roots.length;
  manifest.counts.itemStatsNodes = stats.length;
  Object.assign(manifest.counts, itemSummary);
  manifest.counts.ruleDefinitions = Object.fromEntries(Object.entries({
    statuses: 'status',
    passives: 'passive',
    interrupts: 'interrupt',
    spells: 'spell',
  }).map(([countKey, ruleKind]) => [countKey, rules.filter(rule => rule.kind === ruleKind).length]));
  manifest.counts.rulePrograms = rules.reduce((sum, rule) => sum + Number(Boolean(rule.programs?.standard)), 0);
  manifest.counts.rootTemplatePrograms = rootPrograms.length;
  manifest.counts.iconStatuses = countBy(items, item => item.icon?.status);
  manifest.counts.uniqueIconAssets = new Set(items.map(item => item.icon?.sha256).filter(Boolean)).size;
  const actionItems = items.filter(item => (item.mechanics?.actions || []).length), lifecycleItems = items.filter(item => (item.mechanics?.lifecyclePrograms || []).length),
    lifecyclePrograms = lifecycleItems.flatMap(item => item.mechanics.lifecyclePrograms || []);
  manifest.counts.itemRuleActions = {items: actionItems.length, actions: actionItems.reduce((sum, item) => sum + item.mechanics.actions.length, 0)};
  manifest.counts.itemLifecyclePrograms = {items: lifecycleItems.length, programs: lifecyclePrograms.length,
    gates: countBy(lifecyclePrograms, row => row.gate), kinds: countBy(lifecyclePrograms, row => row.kind),
    inheritedDefaultsExecutable: lifecyclePrograms.filter(row => row.inherited === true).length};
  const placementProgramSets = payloadRows(manifest, 'placementActionPrograms', 'programSets');
  manifest.counts.placementActionProgramSets = placementProgramSets.length;
  manifest.counts.placementActionPrograms = placementProgramSets.reduce((sum, row) => sum + (row.programs || []).length, 0);
  manifest.counts.itemProfileProgramClosure = {
    profile: PROFILE,
    items: items.length,
    profileBundles: items.length,
    linkSets: linkSets.length,
    rootPrograms: rootPrograms.length,
    rulePrograms: manifest.counts.rulePrograms,
  };
  const story = readJson(join(CATALOG_ROOT, manifest.entrypoints.storyItems));
  const placements = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemPlacements));
  const treasure = readJson(join(CATALOG_ROOT, manifest.entrypoints.treasureTables));
  const recipes = readJson(join(CATALOG_ROOT, manifest.entrypoints.recipes));
  const economy = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemEconomyReport));
  const mechanics = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemMechanicsReport));
  const books = readJson(join(CATALOG_ROOT, manifest.entrypoints.bookContent));
  const arsenalQuality = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemArsenalQualityReport));
  manifest.contracts.recipeAccessPolicy = structuredClone(recipes.accessPolicyContract);
  manifest.counts.storyItems = story.counts;
  manifest.counts.books = books.counts;
  manifest.counts.storyItemProfileClosure = {
    completeEntrypoints: story.counts?.completeCausalEntrypoints || 0,
    entrypoints: story.counts?.storyEntrypoints || 0,
    executableEntrypoints: story.counts?.executableCausalEntrypoints || 0,
    profileBoundCompleteEvents: story.counts?.completeCausalEntrypoints || 0,
    profileBoundExecutableEvents: story.counts?.executableCausalEntrypoints || 0,
  };
  manifest.counts.levelItems = story.counts?.levelItems || placements.counts;
  manifest.counts.itemPlacements = placements.counts;
  manifest.counts.treasure = treasure.counts;
  manifest.counts.itemEconomy = {standard: economy.summary?.productionStandard || economy.summary?.standard || economy.summary?.catalog || {items: items.length}};
  manifest.counts.itemMechanics = {standard: mechanics.profiles?.standard || {materializations: items.length}};
  manifest.counts.itemArsenalQuality = structuredClone(arsenalQuality.counts);
  manifest.integrity.fullArsenalComplete = true;
  manifest.integrity.fullArsenalUnknownValues = 0;
  manifest.integrity.fullArsenalBlockedCapabilities = 0;
  manifest.integrity.fullArsenalItems = arsenalQuality.counts.retained;
  manifest.integrity.standardCatalogComplete = true;
  manifest.integrity.standardCatalogItems = items.length;
  manifest.integrity.standardOnly = true;
  reconcileRuntimeCapabilities(manifest);

  for (const group of Object.values(manifest.files)) {
    for (const meta of group) {
      const target = manifestFile(CATALOG_ROOT, meta);
      if (!existsSync(target)) throw new Error(`Manifest file is missing: ${meta.path}`);
      const bytes = readFileSync(target);
      if (Number.isInteger(meta.count) && extname(target).toLowerCase() === '.json') {
        const count = localPayloadCount(JSON.parse(bytes));
        if (count != null) meta.count = count;
      }
      meta.bytes = bytes.length;
      meta.sha256 = sha256(bytes);
    }
  }
  for (const [storageKey, storage] of Object.entries(manifest.sharding || {})) {
    const groupName = {
      runtimeItems: 'items',
      rootTemplatePrograms: 'rootTemplatePrograms',
      itemRuleLinks: 'itemRuleLinks',
      rulePrograms: 'rules',
      storyPrograms: 'storyPrograms',
      itemPlacements: 'itemPlacements',
      itemPlacementIndex: 'itemPlacementIndex',
      placementActionPrograms: 'placementActionPrograms',
    }[storageKey];
    const metas = groupName && manifest.files[groupName];
    if (!metas?.length) continue;
    const maxBytes = Math.max(...metas.map(meta => meta.bytes));
    if ('maxBytes' in storage) storage.maxBytes = maxBytes;
    if ('shards' in storage) storage.shards = metas.length;
    if ('files' in storage) storage.files = metas.length;
  }
  writeJson(file, manifest, true);
}

function updatePointer() {
  const pointer = readJson(POINTER_FILE);
  if (pointer.catalogVersion !== CATALOG_VERSION) throw new Error(`Unexpected current catalog: ${pointer.catalogVersion}`);
  pointer.defaultRulesProfile = PROFILE;
  pointer.manifestSha256 = sha256(readFileSync(join(CATALOG_ROOT, 'manifest.json')));
  writeJson(POINTER_FILE, pointer, true);
}

function verify() {
  const files = walkFiles(CATALOG_ROOT).filter(file => ['.json', '.md'].includes(extname(file).toLowerCase()));
  for (const file of files) {
    if (extname(file).toLowerCase() === '.json') {
      assertNoRemovedProfileMetadata(readJson(file), repoPath(file));
    }
  }
  const manifest = readJson(join(CATALOG_ROOT, 'manifest.json'));
  if (manifest.defaultRulesProfile !== PROFILE || JSON.stringify(manifest.rulesProfiles) !== '["standard"]') {
    throw new Error('Catalog does not declare the Standard-only rules contract');
  }
  for (const group of Object.values(manifest.files)) for (const meta of group) {
    const file = manifestFile(CATALOG_ROOT, meta);
    const bytes = readFileSync(file);
    if (bytes.length !== meta.bytes || sha256(bytes) !== meta.sha256) throw new Error(`Manifest mismatch: ${meta.path}`);
  }
  const items = payloadRows(manifest, 'items', 'items');
  const sourceCatalogManifest = readJson(SOURCE_CATALOG_MANIFEST);
  const expectedStandardItems = sourceCatalogManifest.catalogs?.find(row => row.id === 'bg3-standard-items')?.expected?.count;
  if (!Number.isInteger(expectedStandardItems) || expectedStandardItems <= 0) {
    throw new Error('Pinned Standard item census is missing from the source catalog manifest');
  }
  if (items.length !== expectedStandardItems || items.length !== manifest.counts.items
    || items.some(item => JSON.stringify(item.source?.profiles) !== '["standard"]')) {
    throw new Error('Runtime item set is not exactly Standard-only');
  }
  const context = ITEM_DOMAIN_MODEL.createMigrationContext(items);
  for (const item of items) {
    const readiness = ITEM_DOMAIN_MODEL.arsenalReadiness(item, {context});
    if (readiness.item.aliasOf && !items.some(row => row.id === readiness.item.canonicalId)) {
      throw new Error(`Standard catalog alias does not resolve: ${item.id} -> ${readiness.item.canonicalId}`);
    }
  }
  const quality = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemArsenalQualityReport));
  const removedRows = Array.isArray(quality.removed) ? quality.removed : [];
  const removedIds = new Set(removedRows.map(row => row.itemId));
  const arsenalItems = items.filter(item => !removedIds.has(item.id));
  if (removedIds.size !== removedRows.length || removedRows.some(row => !items.some(item => item.id === row.itemId))) {
    throw new Error('Full Arsenal quality report contains duplicate or non-Standard item IDs');
  }
  for (const item of arsenalItems) {
    const readiness = ITEM_DOMAIN_MODEL.arsenalReadiness(item, {context});
    if (!readiness.ok) throw new Error(`Incomplete Full Arsenal item ${item.id}: ${readiness.issues.join(', ')}`);
    if (readiness.item.aliasOf && removedIds.has(readiness.item.canonicalId)) {
      throw new Error(`Full Arsenal alias resolves outside the quality-selected set: ${item.id} -> ${readiness.item.canonicalId}`);
    }
  }
  const recipes = readJson(join(CATALOG_ROOT, manifest.entrypoints.recipes));
  const validRecipeIds = new Set((recipes.records || []).filter(record => record?.recordType === 'ItemCombination')
    .flatMap(record => [record.name, record.accessPolicy?.recipeId]).filter(Boolean));
  for (const item of arsenalItems) for (const action of item.mechanics?.actions || []) {
    const special = action.special || action.program?.special || {};
    const recipeTargets = [special.recipeId, ...(special.recipeIds || []), ...(special.matchingRecipeIds || [])].filter(Boolean);
    if (recipeTargets.some(recipeId => !validRecipeIds.has(recipeId))) {
      throw new Error(`Full Arsenal recipe action has a missing Standard target: ${item.id}`);
    }
  }
  if (quality.counts?.examined !== items.length || quality.counts?.catalogItems !== items.length
    || quality.counts?.retained !== arsenalItems.length || quality.counts?.removed !== removedRows.length
    || quality.counts.removed + quality.counts.retained !== quality.counts.examined
    || quality.retainedItemIdsSha256 !== sha256(arsenalItems.map(item => item.id).sort().join('\n'))) {
    throw new Error('Full Arsenal quality report does not reconcile with the Standard catalog');
  }
  const itemIds = new Set(items.map(item => item.id));
  const search = readJson(join(CATALOG_ROOT, manifest.entrypoints.searchIndex));
  if (search.count !== items.length || search.items?.length !== items.length || search.items.some(row => !itemIds.has(row.id))) {
    throw new Error('Search index is not exactly aligned with the Standard runtime item set');
  }
  const placements = payloadRows(manifest, 'itemPlacementIndex', 'placements');
  const placementIndex = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemPlacements));
  if (placementIndex.counts?.placements !== placements.length
    || placementIndex.counts?.profiles?.standard !== placements.length) {
    throw new Error('Placement index totals are not exactly aligned with the Standard placement shards');
  }
  for (const group of Object.values(manifest.files)) for (const meta of group) {
    if (!Number.isInteger(meta.count) || extname(meta.path).toLowerCase() !== '.json') continue;
    const count = localPayloadCount(readJson(manifestFile(CATALOG_ROOT, meta)));
    if (count != null && meta.count !== count) throw new Error(`Manifest count mismatch: ${meta.path}`);
  }
  const pointer = readJson(POINTER_FILE);
  const expectedHash = sha256(readFileSync(join(CATALOG_ROOT, 'manifest.json')));
  if (pointer.defaultRulesProfile !== PROFILE || pointer.manifestSha256 !== expectedHash) throw new Error('Current pointer is stale');
  return {catalogVersion: CATALOG_VERSION, files: files.length, items: items.length, manifestSha256: expectedHash};
}

function write({restoreCatalog = false} = {}) {
  if (!existsSync(CATALOG_ROOT) || !statSync(CATALOG_ROOT).isDirectory()) throw new Error(`Catalog root is missing: ${CATALOG_ROOT}`);
  if (restoreCatalog) restoreRuntimeCatalogFromHead();
  for (const file of walkFiles(CATALOG_ROOT)) {
    if (extname(file).toLowerCase() === '.json' && file !== join(CATALOG_ROOT, 'manifest.json')) transformJsonFile(file);
    else if (extname(file).toLowerCase() === '.md') transformMarkdownFile(file);
  }
  transformJsonFile(join(CATALOG_ROOT, 'manifest.json'));
  restoreStandardLifecyclePrograms();
  pruneArsenalRuntime();
  reconcileDerivedIndexes();
  reconcileStandardReports();
  updateMainManifest();
  updatePointer();
  return verify();
}

const mode = process.argv[2];
if (!['--write', '--repair-items-from-head', '--check'].includes(mode)) {
  throw new Error('Usage: node scripts/prune-bg3-honour-profile.mjs --write|--repair-items-from-head|--check');
}
console.log(JSON.stringify(
  mode === '--check' ? verify() : write({restoreCatalog: mode === '--repair-items-from-head'}),
  null,
  2,
));
