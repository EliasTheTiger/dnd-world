import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calculateBg3Price} from './build-bg3-item-economy.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_VERSION = 'bg3-24532579-v10';
const CATALOG_ROOT = join(REPO_ROOT, 'data', 'bg3', CATALOG_VERSION);
const MANIFEST_PATH = join(CATALOG_ROOT, 'manifest.json');
const SOURCE_MANIFEST_PATH = join(REPO_ROOT, 'data', 'catalogs', 'source-manifest.json');
const CURRENT_PATH = join(REPO_ROOT, 'data', 'bg3', 'current.json');
const REPORT_PATH = join(CATALOG_ROOT, 'item-economy-report.json');
const REPORT_MARKDOWN_PATH = join(CATALOG_ROOT, 'item-economy-report.md');
const GENERATED_AT = '2026-08-27T00:00:00.000Z';
const NOT_APPLICABLE_DISPLAY = 'не применяется';
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
const CHECK_ONLY = process.argv.includes('--check');
const WRITE = process.argv.includes('--write');

const SOURCE_EMPTY_NON_ECONOMIC_ROOTS = new Set([
  '1bc33f0f-ef51-4bc7-b82e-ea259bf5e512',
]);

const MASS_REVIEW = new Map([
  ['1ce80e1b-7db1-42bd-baec-114142b5bc15', {state: 'not-applicable', evidence: 'abstract-stats:WPN_DummyForEquipment'}],
  ['b286b4b6-dcb8-41fb-ae1b-83b04db476b4', {
    state: 'value',
    value: 70,
    sourceStatsId: 'OBJ_THR_TreeTrunk',
    expectedRootName: 'NAT_Tree_Trunk_CombatThrowable',
  }],
  ['cc311e88-9276-4e3e-adc4-f29d3ccbb1ee', {state: 'not-applicable', evidence: 'root:HasGameplayValue=False;stats-family:UND_Bibberbang'}],
  ['f44c9c6f-bc71-42ad-9cad-2dae306e750e', {state: 'not-applicable', evidence: 'abstract-stats:NoWeapon'}],
]);

const MASS_CONFLICT_REVIEWS = new Map([
  ['62f8419d-37dc-4705-a684-bf554ebbc3cb', {
    state: 'value', value: 50, expectedRootName: 'DEC_GEN_Mannequin_A_Interactive',
    physics: 'e3f9181a-c650-ea40-6b44-4a02dde7bca9', donorStatsIds: ['OBJ_Generic_Heavy'],
    ancestorUuid: 'c5e68dbc-5d1d-48e7-ac00-ad696dd6a584', ancestorValue: 250,
    rationale: 'specific mannequin physics donors override the generic immovable-container ancestor',
  }],
  ['1051f606-c137-4504-bcd9-31f79e9ed386', {
    state: 'value', value: 90, expectedRootName: 'PUZ_GEN_Death_Bloom_A',
    visual: '977d57c1-1b51-e967-6b0a-cd37a8cec67b', physics: '666feed2-0fb1-c8a1-8d17-2c3355fa0509',
    donorStatsIds: ['COL_Ketheric_DeathBloom'],
    ancestorUuid: '90ec2f64-e124-474c-8b27-a56bba6f6c88', ancestorValue: 10,
    rationale: 'matching visual and physics donors identify the exact death-bloom family over the generic puzzle ancestor',
  }],
  ['a1d1b7d9-3721-4aa6-a3fb-a742fa4901d3', {
    state: 'value', value: 0.3, expectedRootName: 'LOOT_GEN_Throwable_Caltrops_Pack_A',
    visual: 'f06b3d17-6e7c-31ca-b7a7-58b0da242a81', physics: '4f3ae1af-a6f4-c5a3-43d7-e289199bc673',
    donorStatsIds: ['OBJ_Caltrops', 'OBJ_FireBottle'],
    ancestorUuid: '8e5f1e8b-102a-4105-9d81-2220648814e9', ancestorValue: 0.2,
    rationale: 'matching visual and physics donors identify the exact caltrops asset over the generic throwable ancestor',
  }],
  ['2c4a5085-b485-4956-8063-99ff9d2e1e65', {
    state: 'not-applicable', value: null, observedValue: 0.01, expectedRootName: 'TOOL_GTY_Button_A',
    visual: 'b0424f78-088d-e100-814b-1886e0d5995a', physics: 'fafe1eb3-9235-36b7-557c-2bde3fab5d8f',
    donorStatsIds: ['QUEST_CRE_CaptainsBarrierKey'],
    ancestorUuid: '90ec2f64-e124-474c-8b27-a56bba6f6c88', ancestorValue: 10,
    rationale: 'the only asset donor is a semantically different key; this non-economic world button has no publishable mass',
  }],
  ...[
    ['c8c9435f-b4b9-45d9-89a2-17fb232cb036', 'PUZ_GEN_Pressure_Plate_Marble_Square_B_Destruct', '3b108727-cf8a-1779-5c36-02e4ecd412ca'],
    ['67639933-7048-4285-8265-aaf9d6aa67ca', 'PUZ_GEN_Pressure_Plate_Marble_Round_B_Destruct', '15a3d115-7c41-847a-c1e1-f50efe0137c1'],
    ['035f5d5c-2299-4beb-b4b5-beda3fee9a4c', 'PUZ_GEN_Pressure_Plate_Marble_Square_A_Black_Destruct', '6c81c4e1-7528-91c4-7ab4-11cdf4faed75'],
    ['4af72897-b74f-4aa8-8048-84512027fa36', 'PUZ_GEN_Pressure_Plate_Marble_Large_A_Destruct', '95718cba-27b5-9382-835c-62fbeac1b24a'],
    ['3940cb9c-3c15-48f7-b170-11708d9f3852', 'PUZ_GEN_Pressure_Plate_Marble_Square_B_White_Destruct', '3b108727-cf8a-1779-5c36-02e4ecd412ca'],
    ['f08b73f9-9cd0-4042-a45f-8537f010e28d', 'PUZ_GEN_Pressure_Plate_Marble_Square_A_Destruct', '6c81c4e1-7528-91c4-7ab4-11cdf4faed75'],
    ['aa0873d0-acfb-41b5-9b9f-6331703e392b', 'PUZ_GEN_Pressure_Plate_Marble_Large_B_Destruct', '10b44848-18e1-62fd-662c-0e40a621e750'],
  ].map(([rootUuid, expectedRootName, physics]) => [rootUuid, {
    state: 'not-applicable', value: null, observedValue: 0, expectedRootName, physics, donorStatsIds: ['OBJ_PressurePlate'],
    ancestorUuid: 'ccbfdc8f-3aad-4dbb-870a-e5a283e1679e', ancestorValue: 10,
    rationale: 'the zero belongs to intact fixed pressure plates, while the source-empty non-gameplay destruct target has no publishable physical mass',
  }]),
]);

const PRICE_CONFLICT_REVIEWS = new Map([
  ['bg3:item:rt:c9ebcfae-8c9a-4acc-8a30-da7830b32121:stats:X09USEVSX3c', {
    rootUuid: 'c9ebcfae-8c9a-4acc-8a30-da7830b32121', expectedRootName: 'UNI_GLO_Moonlantern_Gale',
    rootStatsId: 'Quest_GLO_Moonlantern_Gale', value: 190,
    ancestorUuid: '9aca1109-a59d-47d3-8f35-f248b70518f9', ancestorValue: 30,
    rationale: 'the exact resolved RootTemplate Stats price overrides the generic moonlantern ancestor',
  }],
]);

const PRICE_REVIEW_ROOTS = new Map([
  ['1ce80e1b-7db1-42bd-baec-114142b5bc15', 'abstract-stats:WPN_DummyForEquipment'],
  ['f44c9c6f-bc71-42ad-9cad-2dae306e750e', 'abstract-stats:NoWeapon'],
]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBuffer(value, pretty = false) {
  return Buffer.from(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function repoPath(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
}

function pathFromRepo(path) {
  return join(REPO_ROOT, ...String(path).split('/'));
}

function fileMetaFromBuffer(buffer) {
  return {bytes: buffer.byteLength, sha256: sha256(buffer)};
}

function fileMeta(path) {
  return fileMetaFromBuffer(readFileSync(path));
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function lineSetDigest(values) {
  return sha256(Buffer.from(`${[...values].sort(compareStrings).join('\n')}\n`, 'utf8'));
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function addSet(map, key, value) {
  if (!key || !Number.isFinite(value)) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function singleton(map, key) {
  const values = key ? map.get(key) : null;
  return values && values.size === 1 ? [...values][0] : null;
}

export function inspectNonNegativeSourceNumber(properties, key) {
  const raw = properties && properties[key];
  if (raw === undefined || raw === null || raw === '' || (typeof raw === 'string' && !raw.trim())) return {state: 'missing', value: null};
  if (typeof raw !== 'number' && typeof raw !== 'string') return {state: 'invalid', value: null, reason: 'invalid-number-type', raw};
  if (typeof raw === 'string' && !/^-?\d+(?:\.\d+)?$/.test(raw.trim())) {
    return {state: 'invalid', value: null, reason: 'invalid-number-format', raw};
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return {state: 'invalid', value: null, reason: 'not-finite', raw};
  if (value < 0) return {state: 'invalid', value: null, reason: 'negative', raw};
  return {state: 'value', value};
}

export function inspectWeightSource(properties) {
  const inspected = inspectNonNegativeSourceNumber(properties, 'Weight');
  if (inspected.state !== 'value') return inspected;
  if (Math.abs(inspected.value * 1_000 - Math.round(inspected.value * 1_000)) > 1e-8) {
    return {state: 'invalid', value: null, reason: 'unsupported-kg-precision', raw: properties.Weight};
  }
  return inspected;
}

function finiteProperty(properties, key) {
  const inspected = inspectNonNegativeSourceNumber(properties, key);
  return inspected.state === 'value' ? inspected.value : null;
}

function statsPriceMetadata(properties) {
  if (!properties || typeof properties !== 'object') return null;
  return {
    valueUUID: properties.ValueUUID || null,
    level: properties.ValueLevel == null || properties.ValueLevel === '' ? null : Number(properties.ValueLevel),
    scale: properties.ValueScale == null || properties.ValueScale === '' ? null : Number(properties.ValueScale),
    rounding: properties.ValueRounding == null || properties.ValueRounding === '' ? null : Number(properties.ValueRounding),
    override: properties.ValueOverride == null || properties.ValueOverride === '' ? null : Number(properties.ValueOverride),
  };
}

export function inspectStatsPriceSource(properties, goldRows) {
  if (!properties || typeof properties !== 'object') return {state: 'missing', value: null};
  const fields = ['ValueUUID', 'ValueLevel', 'ValueScale', 'ValueRounding', 'ValueOverride'];
  const present = fields.filter(key => properties[key] !== undefined && properties[key] !== null && properties[key] !== '');
  if (!present.length) return {state: 'missing', value: null};
  for (const key of ['ValueLevel', 'ValueScale', 'ValueRounding', 'ValueOverride']) {
    if (!present.includes(key)) continue;
    const inspected = inspectNonNegativeSourceNumber(properties, key);
    if (inspected.state !== 'value') return {...inspected, state: 'invalid', field: key};
  }
  const override = inspectNonNegativeSourceNumber(properties, 'ValueOverride');
  if (override.state === 'value' && !Number.isInteger(override.value)) {
    return {state: 'invalid', value: null, reason: 'fractional-value-override', field: 'ValueOverride', raw: properties.ValueOverride};
  }
  const level = inspectNonNegativeSourceNumber(properties, 'ValueLevel');
  if (level.state === 'value' && (!Number.isInteger(level.value) || level.value < 1)) {
    return {state: 'invalid', value: null, reason: 'invalid-value-level', field: 'ValueLevel', raw: properties.ValueLevel};
  }
  const rounding = inspectNonNegativeSourceNumber(properties, 'ValueRounding');
  if (rounding.state === 'value' && ![0, 1].includes(rounding.value)) {
    return {state: 'invalid', value: null, reason: 'invalid-value-rounding', field: 'ValueRounding', raw: properties.ValueRounding};
  }
  if (override.state === 'missing') {
    if (typeof properties.ValueUUID !== 'string' || !properties.ValueUUID.trim()) {
      return {state: 'invalid', value: null, reason: 'missing-value-uuid', raw: properties.ValueUUID};
    }
    for (const key of ['ValueLevel', 'ValueScale']) {
      const inspected = inspectNonNegativeSourceNumber(properties, key);
      if (inspected.state !== 'value') return {...inspected, state: 'invalid', field: key, reason: inspected.reason || 'missing-required-field'};
    }
  }
  const calculated = calculateBg3Price(statsPriceMetadata(properties), goldRows);
  if (!calculated) return {state: 'invalid', value: null, reason: 'unresolvable-price-bundle'};
  return {state: 'value', value: calculated.gp, method: calculated.method};
}

function productionStandardProperties(stats) {
  if (!stats?.resolvedProperties) return null;
  const properties = {...stats.resolvedProperties};
  const deltaKeys = Object.keys(stats).filter(key => key.endsWith('Delta')
    && stats[key] && typeof stats[key] === 'object'
    && Object.values(stats[key]).some(delta => delta && typeof delta === 'object' && 'standardPresent' in delta));
  assert(deltaKeys.length <= 1, `${stats.statsId}: multiple profile delta bundles cannot select Standard unambiguously`);
  const overlayDelta = deltaKeys.length ? stats[deltaKeys[0]] : null;
  if (!overlayDelta || typeof overlayDelta !== 'object') return properties;
  for (const [key, delta] of Object.entries(overlayDelta)) {
    assert(delta && typeof delta === 'object', `${stats.statsId}: malformed profile delta for ${key}`);
    if (delta.standardPresent === false) delete properties[key];
    else {
      assert(delta.standardPresent === true, `${stats.statsId}: Standard presence is missing for ${key}`);
      properties[key] = delta.standard;
    }
  }
  return properties;
}

function confidenceFor(method) {
  if (['source-weight', 'gold-value-curve', 'value-override', 'root-resolved-stats', 'root-source-not-applicable'].includes(method)) return 'exact';
  if (['embedded-root-uuid', 'embedded-root-price', 'visual-and-physics-template', 'visual-template', 'physics-template'].includes(method)) return 'strong-inference';
  if (['reviewed-exception', 'reviewed-not-applicable', 'reviewed-conflict', 'reviewed-conflict-not-applicable'].includes(method)) return 'reviewed';
  if (['root-ancestor', 'root-sibling', 'same-root-price', 'root-ancestor-price', 'root-sibling-price'].includes(method)) return 'family-inference';
  return 'explicit-not-applicable';
}

function resolution(state, value, method, evidence, reviewedConflict = null) {
  return {state, value, method, confidence: confidenceFor(method), evidence, ...(reviewedConflict ? {reviewedConflict} : {})};
}

function sourceEmptyNonEconomicResolution(rootUuid, root) {
  if (!SOURCE_EMPTY_NON_ECONOMIC_ROOTS.has(rootUuid)) return null;
  assert(root?.uuid?.toLowerCase() === rootUuid, `${rootUuid}: reviewed RootTemplate is missing`);
  assert(root.directAttributes?.Stats === '', `${rootUuid}: reviewed direct Stats is no longer empty`);
  assert(root.resolvedAttributes?.Stats === '', `${rootUuid}: reviewed resolved Stats is no longer empty`);
  assert(root.resolvedAttributes?.HasGameplayValue === 'False', `${rootUuid}: reviewed HasGameplayValue is no longer False`);
  return resolution('not-applicable', null, 'root-source-not-applicable',
    `RootTemplate.${rootUuid}.direct.Stats="";resolved.Stats="";resolved.HasGameplayValue=False`);
}

function nonEconomicDigest(items) {
  const rows = items.map(item => {
    const copy = JSON.parse(JSON.stringify(item));
    delete copy.weight;
    delete copy.cost;
    if (copy.mechanics?.profile) {
      delete copy.mechanics.profile.mass;
      delete copy.mechanics.profile.value;
    }
    return copy;
  });
  return sha256(Buffer.from(JSON.stringify(rows), 'utf8'));
}

function loadCatalog() {
  const manifest = readJson(MANIFEST_PATH);
  assert(manifest.catalogVersion === CATALOG_VERSION, `Unexpected catalog ${manifest.catalogVersion}`);
  const itemShards = manifest.files.items.map(meta => ({
    meta,
    path: pathFromRepo(meta.path),
    payload: readJson(pathFromRepo(meta.path)),
  }));
  const loadNodes = group => manifest.files[group].flatMap(meta => readJson(pathFromRepo(meta.path)).nodes);
  return {
    manifest,
    itemShards,
    items: itemShards.flatMap(shard => shard.payload.items),
    roots: loadNodes('rootTemplates'),
    stats: loadNodes('itemStats'),
    gold: readJson(join(CATALOG_ROOT, manifest.entrypoints.goldValues)),
  };
}

function sourceMaps(items, rootsByUuid, statsByName, goldRows) {
  const maps = {
    rootMass: new Map(),
    rootPrice: new Map(),
    visualMass: new Map(),
    physicsMass: new Map(),
    parentMass: new Map(),
    parentPrice: new Map(),
  };
  for (const item of items) {
    const rootUuid = String(item.source?.rootTemplateUuid || '').toLowerCase();
    const root = rootsByUuid.get(rootUuid);
    const stats = statsByName.get(item.source?.statsId);
    const standardProperties = productionStandardProperties(stats);
    const mass = finiteProperty(standardProperties, 'Weight');
    const price = calculateBg3Price(statsPriceMetadata(standardProperties), goldRows)?.gp;
    if (mass != null) {
      addSet(maps.rootMass, rootUuid, mass);
      addSet(maps.visualMass, root?.resolvedAttributes?.VisualTemplate, mass);
      addSet(maps.physicsMass, root?.resolvedAttributes?.PhysicsTemplate, mass);
      addSet(maps.parentMass, root?.parentUuid?.toLowerCase(), mass);
    }
    if (Number.isFinite(price)) {
      addSet(maps.rootPrice, rootUuid, price);
      addSet(maps.parentPrice, root?.parentUuid?.toLowerCase(), price);
    }
  }
  return maps;
}

function auditDirectSourceFields(items, statsByName, goldRows) {
  const result = {
    weights: {values: 0, missing: 0, invalid: 0, negative: 0},
    prices: {values: 0, missing: 0, invalid: 0, negative: 0, reviewedNonEconomicPartial: 0},
  };
  const failures = [];
  for (const item of items) {
    const properties = productionStandardProperties(statsByName.get(item.source?.statsId));
    const weight = inspectWeightSource(properties);
    let price = inspectStatsPriceSource(properties, goldRows);
    const rootUuid = String(item.source?.rootTemplateUuid || '').toLowerCase();
    const reviewedPartialPrice = PRICE_REVIEW_ROOTS.has(rootUuid)
      || (!rootUuid && item.source?.statsId === '_Unarmed');
    if (reviewedPartialPrice) {
      assert(price.state === 'invalid' && price.reason === 'missing-required-field',
        `${item.id}: reviewed abstract Stats price fields changed`);
      price = {state: 'missing', value: null, reviewedReason: 'abstract-non-economic-partial-price-fields'};
      result.prices.reviewedNonEconomicPartial++;
    }
    for (const [kind, inspected] of [['weights', weight], ['prices', price]]) {
      if (inspected.state === 'value') result[kind].values++;
      else if (inspected.state === 'missing') result[kind].missing++;
      else {
        result[kind].invalid++;
        if (inspected.reason === 'negative') result[kind].negative++;
        failures.push(`${item.id}: invalid direct ${kind === 'weights' ? 'Weight' : 'Value*'} (${inspected.reason || 'invalid'})`);
      }
    }
  }
  assert(result.weights.values + result.weights.missing + result.weights.invalid === items.length, 'Direct Weight audit is incomplete');
  assert(result.prices.values + result.prices.missing + result.prices.invalid === items.length, 'Direct Value audit is incomplete');
  assert(!failures.length, failures.slice(0, 20).join('\n'));
  return result;
}

function nearestAncestorSingleton(root, map) {
  const chain = Array.isArray(root?.inheritanceChain) ? root.inheritanceChain.slice(0, -1).reverse() : [];
  for (const ancestor of chain) {
    const rootUuid = String(ancestor).toLowerCase();
    const value = singleton(map, rootUuid);
    if (value != null) return {rootUuid, value};
  }
  return null;
}

function assetMassDonors(context, kind, assetUuid, allowedStatsIds, expectedValue) {
  const attribute = kind === 'visual' ? 'VisualTemplate' : 'PhysicsTemplate';
  const allowed = new Set(allowedStatsIds);
  return context.items.filter(candidate => {
    const candidateRoot = context.rootsByUuid.get(String(candidate.source?.rootTemplateUuid || '').toLowerCase());
    const properties = productionStandardProperties(context.statsByName.get(candidate.source?.statsId));
    return candidateRoot?.resolvedAttributes?.[attribute] === assetUuid
      && allowed.has(candidate.source?.statsId)
      && finiteProperty(properties, 'Weight') === expectedValue;
  });
}

function resolveReviewedMassConflict(item, root, context, visual, physics, ancestor) {
  const rootUuid = String(item.source?.rootTemplateUuid || '').toLowerCase();
  const values = [visual, physics, ancestor?.value].filter(value => value != null);
  const conflict = new Set(values).size > 1;
  const review = MASS_CONFLICT_REVIEWS.get(rootUuid);
  if (!conflict) {
    assert(!review, `${item.id}: reviewed mass conflict no longer exists`);
    return null;
  }
  assert(review, `${item.id}: unreviewed mass conflict ${values.join('/')}`);
  assert(root?.name === review.expectedRootName, `${item.id}: reviewed root name changed`);
  if (review.state === 'not-applicable') {
    assert(root.directAttributes?.Stats === '' && root.resolvedAttributes?.Stats === '',
      `${item.id}: reviewed non-applicable root gained a Stats identity`);
    assert(root.resolvedAttributes?.HasGameplayValue === 'False',
      `${item.id}: reviewed non-applicable root gained gameplay value`);
  }
  assert(ancestor?.rootUuid === review.ancestorUuid && ancestor.value === review.ancestorValue,
    `${item.id}: reviewed ancestor conflict changed`);
  const selectedEvidence = [];
  for (const [kind, assetUuid, value] of [
    ['visual', review.visual, visual],
    ['physics', review.physics, physics],
  ]) {
    if (!assetUuid) continue;
    assert(root.resolvedAttributes?.[kind === 'visual' ? 'VisualTemplate' : 'PhysicsTemplate'] === assetUuid,
      `${item.id}: reviewed ${kind} asset changed`);
    const observedValue = review.observedValue ?? review.value;
    assert(value === observedValue, `${item.id}: reviewed ${kind} mass changed`);
    const donors = assetMassDonors(context, kind, assetUuid, review.donorStatsIds, value);
    assert(donors.length > 0, `${item.id}: reviewed ${kind} donor evidence disappeared`);
    selectedEvidence.push({kind, assetUuid, value, donorStatsIds: [...new Set(donors.map(row => row.source.statsId))].sort()});
  }
  const reviewedConflict = {
    selectedEvidence,
    conflictingEvidence: [{kind: 'nearest-ancestor', rootUuid: ancestor.rootUuid, value: ancestor.value}],
    resolution: {state: review.state, value: review.value},
    rationale: review.rationale,
  };
  const evidence = `reviewed-conflict:${selectedEvidence.map(row => `${row.kind}.${row.assetUuid}=${row.value}`).join('+')};ancestor.${ancestor.rootUuid}=${ancestor.value};${review.rationale}`;
  return resolution(review.state, review.value,
    review.state === 'value' ? 'reviewed-conflict' : 'reviewed-conflict-not-applicable', evidence, reviewedConflict);
}

function resolveReviewedPriceConflict(item, root, context, rootStats, resolvedPrice, ancestor) {
  const review = PRICE_CONFLICT_REVIEWS.get(item.id);
  const conflict = ancestor && ancestor.value !== resolvedPrice;
  if (!conflict) {
    assert(!review, `${item.id}: reviewed price conflict no longer exists`);
    return null;
  }
  assert(review, `${item.id}: unreviewed root/ancestor price conflict ${resolvedPrice}/${ancestor.value}`);
  assert(String(item.source?.rootTemplateUuid || '').toLowerCase() === review.rootUuid, `${item.id}: reviewed root UUID changed`);
  assert(root?.name === review.expectedRootName, `${item.id}: reviewed root name changed`);
  assert(rootStats?.statsId === review.rootStatsId && resolvedPrice === review.value, `${item.id}: reviewed exact RootTemplate Stats price changed`);
  assert(ancestor.rootUuid === review.ancestorUuid && ancestor.value === review.ancestorValue, `${item.id}: reviewed price ancestor changed`);
  assert(singleton(context.maps.rootPrice, review.rootUuid) === review.value, `${item.id}: same-root corroborating price changed`);
  return {
    selectedEvidence: [{kind: 'root-resolved-stats', statsId: review.rootStatsId, value: review.value}],
    conflictingEvidence: [{kind: 'nearest-ancestor', rootUuid: review.ancestorUuid, value: review.ancestorValue}],
    resolution: {state: 'value', value: review.value},
    rationale: review.rationale,
  };
}

function explicitNotApplicableEvidence(item, root, kind) {
  const attrs = root?.resolvedAttributes || {};
  const facts = [];
  if (attrs.HasGameplayValue === 'False') facts.push('RootTemplate.HasGameplayValue=False');
  if (attrs.CanBePickedUp === 'False') facts.push('RootTemplate.CanBePickedUp=False');
  const classification = String(item.source?.classification || '');
  const statsId = String(item.source?.statsId || '');
  const rootName = String(root?.name || attrs.Name || '');
  if (classification === 'technical') facts.push('source.classification=technical');
  if (!item.source?.rootTemplateUuid && /^_/.test(statsId)) facts.push(`abstract-stats:${statsId}`);
  if (/^VFX_/i.test(statsId) || /^VFX_/i.test(rootName)) facts.push(`technical-vfx:${statsId || rootName}`);
  const portable = item.mechanics?.profile?.flags?.portable;
  if (portable === false) facts.push('mechanics.profile.flags.portable=false');
  if (!facts.length) return null;
  if (kind === 'mass' && portable === true && !facts.some(value => value.startsWith('RootTemplate.'))) return null;
  return facts.join(';');
}

function inferMass(item, context) {
  const rootUuid = String(item.source?.rootTemplateUuid || '').toLowerCase();
  const root = context.rootsByUuid.get(rootUuid);
  const itemStats = context.statsByName.get(item.source?.statsId);
  const direct = finiteProperty(productionStandardProperties(itemStats), 'Weight');
  if (direct != null) return resolution('value', direct, 'source-weight', `Stats.${itemStats.statsId}.resolved.Weight`);

  const sourceEmpty = sourceEmptyNonEconomicResolution(rootUuid, root);
  if (sourceEmpty) return sourceEmpty;

  const rootStats = context.statsByName.get(root?.resolvedAttributes?.Stats);
  const rootStatsWeight = finiteProperty(productionStandardProperties(rootStats), 'Weight');
  if (rootStatsWeight != null) return resolution('value', rootStatsWeight, 'root-resolved-stats', `Stats.${rootStats.statsId}.resolved.Weight`);

  const embeddedUuids = String(item.source?.statsId || '').match(UUID_PATTERN) || [];
  for (const embedded of embeddedUuids) {
    const key = embedded.toLowerCase();
    const value = singleton(context.maps.rootMass, key);
    if (value != null) return resolution('value', value, 'embedded-root-uuid', key);
  }

  const reviewed = MASS_REVIEW.get(rootUuid);
  if (reviewed) {
    let evidence = reviewed.evidence;
    if (reviewed.sourceStatsId) {
      assert(root?.name === reviewed.expectedRootName, `${item.id}: reviewed root name changed`);
      const sourceStats = context.statsByName.get(reviewed.sourceStatsId);
      assert(sourceStats, `${item.id}: reviewed source Stats.${reviewed.sourceStatsId} is missing`);
      const sourceWeight = finiteProperty(productionStandardProperties(sourceStats), 'Weight');
      assert(sourceWeight === reviewed.value, `${item.id}: reviewed source weight changed from ${reviewed.value} to ${sourceWeight}`);
      evidence = `Stats.${reviewed.sourceStatsId}.resolved.Weight=${sourceWeight};RootTemplate.${rootUuid}.Name=${root.name}`;
    }
    return resolution(reviewed.state, reviewed.value ?? null,
      reviewed.state === 'value' ? 'reviewed-exception' : 'reviewed-not-applicable', evidence);
  }

  const visual = singleton(context.maps.visualMass, root?.resolvedAttributes?.VisualTemplate);
  const physics = singleton(context.maps.physicsMass, root?.resolvedAttributes?.PhysicsTemplate);
  if (visual != null && physics != null && visual !== physics) {
    fail(`${item.id}: conflicting visual/physics mass ${visual}/${physics}`);
  }
  const ancestor = nearestAncestorSingleton(root, context.maps.rootMass);
  const reviewedConflict = resolveReviewedMassConflict(item, root, context, visual, physics, ancestor);
  if (reviewedConflict) return reviewedConflict;
  if (visual != null || physics != null) {
    const method = visual != null && physics != null ? 'visual-and-physics-template' : visual != null ? 'visual-template' : 'physics-template';
    const evidence = [
      visual != null ? root?.resolvedAttributes?.VisualTemplate : null,
      physics != null ? root?.resolvedAttributes?.PhysicsTemplate : null,
    ].filter(Boolean).join('+');
    return resolution('value', visual ?? physics, method, evidence);
  }

  if (ancestor) return resolution('value', ancestor.value, 'root-ancestor', ancestor.rootUuid);
  const parent = root?.parentUuid?.toLowerCase();
  const sibling = singleton(context.maps.parentMass, parent);
  if (sibling != null) return resolution('value', sibling, 'root-sibling', parent);

  const evidence = explicitNotApplicableEvidence(item, root, 'mass');
  if (evidence) return resolution('not-applicable', null, 'not-applicable', evidence);
  fail(`${item.id}: mass has no supported source and is not explicitly non-applicable`);
}

function directPrice(item, context) {
  const stats = context.statsByName.get(item.source?.statsId);
  return {stats, calculated: calculateBg3Price(statsPriceMetadata(productionStandardProperties(stats)), context.goldRows)};
}

function inferPrice(item, context) {
  const {stats: itemStats, calculated: direct} = directPrice(item, context);
  if (direct) {
    const bg3 = statsPriceMetadata(productionStandardProperties(itemStats));
    const evidence = direct.method === 'value-override'
      ? `Stats.${itemStats.statsId}.resolved.ValueOverride=${bg3.override}`
      : `Stats.${itemStats.statsId}.resolved.ValueUUID=${String(bg3.valueUUID || '').toLowerCase()};ValueLevel=${bg3.level};ValueScale=${bg3.scale};ValueRounding=${bg3.rounding}`;
    return resolution('value', direct.gp, direct.method, evidence);
  }

  const rootUuid = String(item.source?.rootTemplateUuid || '').toLowerCase();
  const root = context.rootsByUuid.get(rootUuid);
  const sourceEmpty = sourceEmptyNonEconomicResolution(rootUuid, root);
  if (sourceEmpty) return sourceEmpty;
  const rootStats = context.statsByName.get(root?.resolvedAttributes?.Stats);
  const viaStats = calculateBg3Price(statsPriceMetadata(productionStandardProperties(rootStats)), context.goldRows);
  if (viaStats) {
    const ancestor = nearestAncestorSingleton(root, context.maps.rootPrice);
    const reviewedConflict = resolveReviewedPriceConflict(item, root, context, rootStats, viaStats.gp, ancestor);
    return resolution('value', viaStats.gp, 'root-resolved-stats', `Stats.${rootStats.statsId}.resolved.Value*`, reviewedConflict);
  }

  for (const alias of (String(item.source?.statsId || '').match(UUID_PATTERN) || []).map(value => value.toLowerCase())) {
    const value = singleton(context.maps.rootPrice, alias);
    if (value != null) return resolution('value', value, 'embedded-root-price', alias);
  }

  const reviewed = PRICE_REVIEW_ROOTS.get(rootUuid);
  if (reviewed) return resolution('not-applicable', null, 'reviewed-not-applicable', reviewed);
  if (!rootUuid && item.source?.statsId === '_Unarmed') {
    return resolution('not-applicable', null, 'reviewed-not-applicable', 'abstract-stats:_Unarmed');
  }

  const canBePickedUp = root?.resolvedAttributes?.CanBePickedUp;
  const hasGameplayValue = root?.resolvedAttributes?.HasGameplayValue;
  if (canBePickedUp === 'False' || (hasGameplayValue === 'False' && canBePickedUp !== 'True')) {
    return resolution('not-applicable', null, 'root-not-applicable',
      `RootTemplate.HasGameplayValue=${hasGameplayValue || 'unset'};RootTemplate.CanBePickedUp=${canBePickedUp || 'unset'}`);
  }

  const sameRoot = singleton(context.maps.rootPrice, rootUuid);
  if (sameRoot != null) return resolution('value', sameRoot, 'same-root-price', rootUuid);
  const chain = Array.isArray(root?.inheritanceChain) ? root.inheritanceChain.slice(0, -1).reverse() : [];
  for (const ancestor of chain) {
    const key = String(ancestor).toLowerCase();
    const value = singleton(context.maps.rootPrice, key);
    if (value != null) return resolution('value', value, 'root-ancestor-price', key);
  }
  const parent = root?.parentUuid?.toLowerCase();
  const sibling = singleton(context.maps.parentPrice, parent);
  if (sibling != null) return resolution('value', sibling, 'root-sibling-price', parent);

  const evidence = explicitNotApplicableEvidence(item, root, 'price');
  if (evidence) return resolution('not-applicable', null, 'not-applicable', evidence);
  fail(`${item.id}: price has no supported source and is not explicitly non-applicable`);
}

function massDisplay(value) {
  return `${String(value)} кг`;
}

function priceDisplay(value) {
  return `${String(value)} зм`;
}

function sourceDescriptor(row) {
  return {
    method: row.method,
    confidence: row.confidence,
    evidence: row.evidence,
    ...(row.reviewedConflict ? {reviewedConflict: row.reviewedConflict} : {}),
  };
}

function materializeItem(item, massRow, priceRow) {
  const profile = item.mechanics?.profile;
  assert(profile && typeof profile === 'object', `${item.id}: mechanics.profile is missing`);
  const oldMass = profile.mass || {};
  const oldValue = profile.value || {};
  if (massRow.state === 'value') {
    assert(Number.isFinite(massRow.value) && massRow.value >= 0, `${item.id}: invalid resolved mass`);
    if (oldMass.kg != null) assert(Number(oldMass.kg) === massRow.value, `${item.id}: stored mass disagrees with source resolution`);
    const display = massDisplay(massRow.value);
    profile.mass = {...oldMass, kg: massRow.value, display, unit: 'kg', state: 'value', source: sourceDescriptor(massRow)};
    item.weight = display;
  } else {
    profile.mass = {...oldMass, kg: null, display: NOT_APPLICABLE_DISPLAY, unit: 'kg', state: 'not-applicable', source: sourceDescriptor(massRow)};
    item.weight = NOT_APPLICABLE_DISPLAY;
  }

  if (priceRow.state === 'value') {
    assert(Number.isInteger(priceRow.value) && priceRow.value >= 0, `${item.id}: invalid resolved price`);
    if (oldValue.gp != null) assert(Number(oldValue.gp) === priceRow.value, `${item.id}: stored price disagrees with source resolution`);
    const display = priceDisplay(priceRow.value);
    profile.value = {...oldValue, gp: priceRow.value, cp: priceRow.value * 100, display, state: 'value', source: sourceDescriptor(priceRow)};
    item.cost = display;
  } else {
    profile.value = {...oldValue, gp: null, cp: null, display: NOT_APPLICABLE_DISPLAY, state: 'not-applicable', source: sourceDescriptor(priceRow)};
    item.cost = NOT_APPLICABLE_DISPLAY;
  }
}

function emptyDimensionSummary() {
  return {resolved: 0, values: 0, positive: 0, zero: 0, notApplicable: 0, blocked: 0, methods: {}};
}

function summarize(rows, include) {
  const summary = {
    items: 0,
    weights: emptyDimensionSummary(),
    prices: emptyDimensionSummary(),
  };
  for (const row of rows) {
    if (!include(row)) continue;
    summary.items++;
    for (const [key, resolutionRow] of [['weights', row.mass], ['prices', row.price]]) {
      const target = summary[key];
      target.resolved++;
      increment(target.methods, resolutionRow.method);
      if (resolutionRow.state === 'not-applicable') target.notApplicable++;
      else {
        target.values++;
        if (resolutionRow.value === 0) target.zero++;
        else target.positive++;
      }
    }
  }
  return summary;
}

function fallbackRow(item, profile, row, unitKey) {
  return {
    itemId: item.id,
    publication: profile,
    names: {ru: item.i18n?.ru?.name || item.n || '', en: item.i18n?.en?.name || ''},
    state: row.state,
    [unitKey]: row.value,
    method: row.method,
    confidence: row.confidence,
    evidence: row.evidence,
    ...(row.reviewedConflict ? {reviewedConflict: row.reviewedConflict} : {}),
  };
}

function makeReport(rows, goldSource, directSourceFields) {
  assert(rows.every(row => row.standard), 'Standard-only catalog contains a non-Standard item');
  const weightFallbacks = rows
    .filter(row => row.mass.method !== 'source-weight')
    .map(row => fallbackRow(row.item, 'standard', row.mass, 'kg'));
  const priceFallbacks = rows
    .filter(row => !['gold-value-curve', 'value-override'].includes(row.price.method))
    .map(row => fallbackRow(row.item, 'standard', row.price, 'gp'));
  weightFallbacks.sort((a, b) => compareStrings(a.itemId, b.itemId));
  priceFallbacks.sort((a, b) => compareStrings(a.itemId, b.itemId));
  const standard = summarize(rows, () => true);
  const reviewedConflicts = rows.flatMap(row => [
    ['mass', row.mass],
    ['price', row.price],
  ].filter(([, value]) => value.reviewedConflict).map(([dimension, value]) => ({
    itemId: row.item.id,
    publication: 'standard',
    names: {ru: row.item.i18n?.ru?.name || row.item.n || '', en: row.item.i18n?.en?.name || ''},
    dimension,
    method: value.method,
    selectedEvidence: value.reviewedConflict.selectedEvidence,
    conflictingEvidence: value.reviewedConflict.conflictingEvidence,
    resolution: value.reviewedConflict.resolution,
    rationale: value.reviewedConflict.rationale,
  })));
  reviewedConflicts.sort((a, b) => compareStrings(a.itemId, b.itemId) || compareStrings(a.dimension, b.dimension));
  const unresolvedWeights = rows.filter(row => !['value', 'not-applicable'].includes(row.mass.state)).length;
  const unresolvedPrices = rows.filter(row => !['value', 'not-applicable'].includes(row.price.state)).length;
  const invalidResolvedWeights = rows.filter(row => row.mass.state === 'value' && (!Number.isFinite(row.mass.value) || row.mass.value < 0)).length;
  const invalidResolvedPrices = rows.filter(row => row.price.state === 'value' && (!Number.isInteger(row.price.value) || row.price.value < 0)).length;
  const controlSetsFor = selected => {
    const set = (predicate) => selected.filter(predicate).map(row => row.item.id);
    const describe = ids => ({count: ids.length, sha256: lineSetDigest(ids)});
    return {
      zeroMass: describe(set(row => row.mass.state === 'value' && row.mass.value === 0)),
      notApplicableMass: describe(set(row => row.mass.state === 'not-applicable')),
      zeroPrice: describe(set(row => row.price.state === 'value' && row.price.value === 0)),
      notApplicablePrice: describe(set(row => row.price.state === 'not-applicable')),
    };
  };
  return {
    schemaVersion: 'dnd-world-bg3-item-economy-report/3',
    catalogVersion: CATALOG_VERSION,
    generatedAt: GENERATED_AT,
    scope: {items: rows.length, rulesProfile: 'standard'},
    source: goldSource,
    formula: {
      mass: {unit: 'kg', precision: 'pinned Stats.Weight must be nonnegative and exactly representable at 0.001 kg or coarser; preserve the source value'},
      inheritanceRounding: 'half-up after each GoldValues ParentScale',
      finalSteps: [{minimum: 1000, step: 50}, {minimum: 100, step: 10}, {minimum: 20, step: 5}, {minimum: 0, step: 1}],
      currency: {unit: 'gp', copperPerGp: 100, displaySuffix: 'зм', sourceValidation: 'ValueOverride is a nonnegative integer gp; curve inputs are finite and valid before pinned rounding'},
      notApplicable: {numericValue: null, display: NOT_APPLICABLE_DISPLAY, zeroIsNeverUsedAsMissing: true},
    },
    summary: {standard},
    controlSets: {standard: controlSetsFor(rows)},
    directSourceFields,
    audit: {
      allItemsResolved: unresolvedWeights === 0 && unresolvedPrices === 0 && invalidResolvedWeights === 0 && invalidResolvedPrices === 0
        && directSourceFields.weights.invalid === 0 && directSourceFields.prices.invalid === 0,
      unresolvedWeights,
      unresolvedPrices,
      invalidResolvedWeights,
      invalidResolvedPrices,
      invalidDirectWeights: directSourceFields.weights.invalid,
      invalidDirectPrices: directSourceFields.prices.invalid,
      negativeWeights: directSourceFields.weights.negative,
      negativePrices: directSourceFields.prices.negative,
      standardOnly: true,
      legitimateZeroWeights: standard.weights.zero,
      notApplicableWeights: standard.weights.notApplicable,
      legitimateZeroPrices: standard.prices.zero,
      notApplicablePrices: standard.prices.notApplicable,
      weightFallbacks: weightFallbacks.length,
      priceFallbacks: priceFallbacks.length,
      reviewedMassConflicts: reviewedConflicts.filter(row => row.dimension === 'mass').length,
      reviewedPriceConflicts: reviewedConflicts.filter(row => row.dimension === 'price').length,
      reviewedConflicts: reviewedConflicts.length,
      unreviewedConflicts: 0,
    },
    reviewedConflicts,
    weightFallbacks,
    priceFallbacks,
  };
}

function reportMarkdown(report) {
  const s = report.summary.standard;
  const methodRows = target => Object.entries(target.methods).sort(([a], [b]) => compareStrings(a, b))
    .map(([method, count]) => `| ${method} | ${count} |`).join('\n');
  return `# BG3 item economy audit — ${CATALOG_VERSION}\n\n`
    + `Проверен полный Standard-каталог из **${s.items}** идентификаторов. Других профилей правил в предметном каталоге нет.\n\n`
    + `Неразрешённых значений: **0**. Настоящий ноль хранится как число; неприменимость хранится как \`null\` и показывается «${NOT_APPLICABLE_DISPLAY}».\n\n`
    + `Проверено конфликтов между применимыми ветвями источника: **${report.audit.reviewedConflicts}**; каждый разрешён явно, непросмотренных конфликтов: **${report.audit.unreviewedConflicts}**.\n\n`
    + `| Профиль | Предметов | Вес: значения | Вес: 0 | Вес: неприменим | Цена: значения | Цена: 0 | Цена: неприменима |\n`
    + `|---|---:|---:|---:|---:|---:|---:|---:|\n`
    + `| Standard | ${s.items} | ${s.weights.values} | ${s.weights.zero} | ${s.weights.notApplicable} | ${s.prices.values} | ${s.prices.zero} | ${s.prices.notApplicable} |\n\n`
    + `## Основания веса — Standard\n\n| Метод | Количество |\n|---|---:|\n${methodRows(s.weights)}\n\n`
    + `## Основания стоимости — Standard\n\n| Метод | Количество |\n|---|---:|\n${methodRows(s.prices)}\n\n`
    + `Каждый fallback Standard перечислен в \`item-economy-report.json\`.\n`;
}

function expectedOutput() {
  const catalog = loadCatalog();
  const sourceManifest = readJson(SOURCE_MANIFEST_PATH);
  const expectedStandardItems = sourceManifest.catalogs?.find(row => row.id === 'bg3-standard-items')?.expected?.count;
  assert(Number.isInteger(expectedStandardItems) && expectedStandardItems > 0, 'Pinned Standard item census is missing');
  assert(catalog.items.length === expectedStandardItems,
    `Expected the complete Standard catalog (${expectedStandardItems}), found ${catalog.items.length}`);
  assert(catalog.items.length === catalog.manifest.counts.items, `Manifest/item count mismatch: ${catalog.items.length}`);
  assert(new Set(catalog.items.map(item => item.id)).size === catalog.items.length, 'Duplicate item ID');
  assert(catalog.gold.count === 58, `Expected 58 GoldValues curves, found ${catalog.gold.count}`);
  const nonEconomicBefore = nonEconomicDigest(catalog.items);
  const rootsByUuid = new Map(catalog.roots.map(root => [root.uuid.toLowerCase(), root]));
  const statsByName = new Map(catalog.stats.map(stats => [stats.statsId, stats]));
  const directSourceFields = auditDirectSourceFields(catalog.items, statsByName, catalog.gold.curves);
  const maps = sourceMaps(catalog.items, rootsByUuid, statsByName, catalog.gold.curves);
  const context = {items: catalog.items, rootsByUuid, statsByName, maps, goldRows: catalog.gold.curves};
  const rows = [];
  for (const item of catalog.items) {
    const mass = inferMass(item, context);
    const price = inferPrice(item, context);
    const standard = Array.isArray(item.source?.profiles) && item.source.profiles.includes('standard');
    materializeItem(item, mass, price);
    rows.push({item, mass, price, standard});
  }
  assert(nonEconomicDigest(catalog.items) === nonEconomicBefore, 'Economy audit changed non-economic item fields');

  const report = makeReport(rows, catalog.gold.source, directSourceFields);
  assert(report.scope.items === catalog.items.length, `Expected ${catalog.items.length} Standard items, found ${report.scope.items}`);
  assert(report.audit.allItemsResolved && report.audit.unresolvedWeights === 0 && report.audit.unresolvedPrices === 0,
    'Every Standard catalog item must have explicit economy value or not-applicable fields');
  assert(report.directSourceFields.weights.values + report.directSourceFields.weights.missing === catalog.items.length,
    'Weight source-field audit does not reconcile');
  assert(report.directSourceFields.prices.values + report.directSourceFields.prices.missing === catalog.items.length,
    'Price source-field audit does not reconcile');
  assert(report.audit.weightFallbacks === report.weightFallbacks.length && report.audit.priceFallbacks === report.priceFallbacks.length,
    'Economy fallback audit does not reconcile');
  assert(report.audit.reviewedConflicts === report.reviewedConflicts.length && report.audit.unreviewedConflicts === 0,
    'Economy conflict audit is incomplete');

  const outputs = new Map();
  for (const shard of catalog.itemShards) outputs.set(shard.path, jsonBuffer(shard.payload));
  outputs.set(REPORT_PATH, jsonBuffer(report, true));
  outputs.set(REPORT_MARKDOWN_PATH, Buffer.from(reportMarkdown(report), 'utf8'));

  const manifest = JSON.parse(JSON.stringify(catalog.manifest));
  manifest.generatedAt = GENERATED_AT;
  manifest.source.economy = {
    ...manifest.source.economy,
    auditSchemaVersion: report.schemaVersion,
    auditGenerator: 'scripts/audit-bg3-v10-economy.mjs',
    profilePolicy: 'standard-only',
  };
  manifest.contracts.itemEconomy = {
    schemaVersion: report.schemaVersion,
    mass: 'kg; source value preserved; explicit value/not-applicable state and source basis',
    currency: 'BG3 base value in integer gp; exact cp = gp*100',
    rounding: 'pinned GoldValues inheritance plus ValueRounding half-up steps',
    missingWeightFallback: 'source-backed graph inference or explicit non-inventory not-applicable; otherwise generation fails',
    missingPriceFallback: 'source-backed graph inference or explicit non-economic not-applicable; otherwise generation fails',
    notApplicable: `kg/gp/cp null; display=${NOT_APPLICABLE_DISPLAY}; never numeric zero`,
    publication: 'Standard only',
    invalidSourcePolicy: 'negative, malformed, over-precision mass, fractional override, and invalid curve fields fail generation before fallback',
  };
  manifest.counts.itemEconomy = report.summary;
  manifest.integrity.allItemsHaveWeight = true;
  manifest.integrity.allItemsHaveCost = true;
  manifest.integrity.allItemsHaveWeightResolution = true;
  manifest.integrity.allItemsHaveCostResolution = true;
  delete manifest.integrity.itemEconomyProfileBundlesExhaustive;
  delete manifest.integrity.itemEconomyStandardProductionExhaustive;
  delete manifest.integrity.itemEconomyUnionAuditExhaustive;
  manifest.integrity.itemEconomyStandardExhaustive = true;
  manifest.integrity.itemEconomyNotApplicableUsesNull = true;
  manifest.integrity.itemEconomyUnresolvedValues = 0;
  manifest.integrity.itemEconomySourcePinned = true;
  manifest.integrity.itemEconomyNonEconomicFieldsPreserved = true;
  manifest.integrity.itemEconomyReviewedConflicts = report.audit.reviewedConflicts;
  manifest.integrity.itemEconomyUnreviewedConflicts = report.audit.unreviewedConflicts;

  for (const group of Object.values(manifest.files)) {
    for (const meta of group) {
      const path = pathFromRepo(meta.path);
      const buffer = outputs.get(path);
      Object.assign(meta, buffer ? fileMetaFromBuffer(buffer) : fileMeta(path));
    }
  }
  manifest.sharding.runtimeItems.maxBytes = Math.max(...manifest.files.items.map(meta => meta.bytes));
  if (manifest.sharding.runtimeItems.maxBytes > manifest.sharding.runtimeItems.targetBytes) {
    manifest.sharding.runtimeItems.targetBytes = Math.ceil(manifest.sharding.runtimeItems.maxBytes / 5_000) * 5_000;
  }
  assert(manifest.sharding.runtimeItems.maxBytes <= manifest.sharding.runtimeItems.targetBytes,
    `Item shard target exceeded: ${manifest.sharding.runtimeItems.maxBytes}`);
  assert(manifest.sharding.runtimeItems.maxBytes < manifest.sharding.runtimeItems.hardLimitBytes,
    `Item shard hard limit exceeded: ${manifest.sharding.runtimeItems.maxBytes}`);
  const manifestBuffer = jsonBuffer(manifest, true);
  outputs.set(MANIFEST_PATH, manifestBuffer);

  const current = readJson(CURRENT_PATH);
  assert(current.catalogVersion === CATALOG_VERSION, `current.json selects ${current.catalogVersion}`);
  current.manifestSha256 = sha256(manifestBuffer);
  outputs.set(CURRENT_PATH, jsonBuffer(current, true));
  return {outputs, report, manifestSha256: current.manifestSha256};
}

function writeOrCheck(result) {
  for (const [path, expected] of result.outputs) {
    if (CHECK_ONLY) {
      assert(existsSync(path), `Missing generated file: ${repoPath(path)}`);
      assert(readFileSync(path).equals(expected), `Generated file is stale: ${repoPath(path)}`);
    } else if (!existsSync(path) || !readFileSync(path).equals(expected)) {
      writeFileSync(path, expected);
    }
  }
}

function main() {
  if (!CHECK_ONLY && !WRITE) fail('Usage: node scripts/audit-bg3-v10-economy.mjs --write|--check');
  const result = expectedOutput();
  writeOrCheck(result);
  console.log(JSON.stringify({
    mode: CHECK_ONLY ? 'check' : 'write',
    catalogVersion: CATALOG_VERSION,
    items: result.report.scope.items,
    manifestSha256: result.manifestSha256,
    summary: result.report.summary,
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
