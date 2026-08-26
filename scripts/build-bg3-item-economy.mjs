import {createHash} from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SOURCE_VERSION = 'bg3-24532579-v8';
const TARGET_VERSION = 'bg3-24532579-v9';
const SOURCE_ROOT = join(REPO_ROOT, 'data', 'bg3', SOURCE_VERSION);
const TARGET_ROOT = join(REPO_ROOT, 'data', 'bg3', TARGET_VERSION);
const GENERATED_AT = '2026-08-26T00:00:00.000Z';
const DEFAULT_GOLD_VALUES = resolve(
  'C:/Program Files (x86)/Steam/steamapps/common/Baldurs Gate 3/Data/Editor/Mods/Shared/Levelmaps/GoldValues.tbl',
);
const GOLD_VALUES_PATH = resolve(process.env.BG3_GOLD_VALUES_PATH || DEFAULT_GOLD_VALUES);
const EXPECTED_GOLD_VALUES_SHA256 = 'a1ad765d1413c5c5b7ed49a14066bf90d905646ecc87a909f7d4f72e4c01d115';
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
const MASS_OVERRIDES = new Map([
  ['b286b4b6-dcb8-41fb-ae1b-83b04db476b4', {kg: 70, evidence: 'stats-family:OBJ_THR_TreeTrunk'}],
  ['cc311e88-9276-4e3e-adc4-f29d3ccbb1ee', {kg: 0, evidence: 'stats-family:UND_Bibberbang'}],
  ['1ce80e1b-7db1-42bd-baec-114142b5bc15', {kg: 0, evidence: 'abstract-stats:WPN_DummyForEquipment'}],
  ['f44c9c6f-bc71-42ad-9cad-2dae306e750e', {kg: 0, evidence: 'abstract-stats:NoWeapon'}],
  ['1bc33f0f-ef51-4bc7-b82e-ea259bf5e512', {kg: 0.09, evidence: 'food-family:BASE_CONS_Food'}],
]);
const PRICE_ZERO_ROOTS = new Map([
  ['1ce80e1b-7db1-42bd-baec-114142b5bc15', 'abstract-stats:WPN_DummyForEquipment'],
  ['f44c9c6f-bc71-42ad-9cad-2dae306e750e', 'abstract-stats:NoWeapon'],
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value, pretty = false) {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8');
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

function cloneCatalog() {
  cpSync(SOURCE_ROOT, TARGET_ROOT, {recursive: true, force: true, preserveTimestamps: true});
  const targetManifest = join(TARGET_ROOT, 'manifest.json');
  if (!existsSync(targetManifest)) throw new Error(`Incomplete target catalog: ${targetManifest}`);
  for (const file of walkFiles(TARGET_ROOT)) {
    if (!['.json', '.md'].includes(extname(file).toLowerCase())) continue;
    const before = readFileSync(file, 'utf8');
    const after = before.replaceAll(SOURCE_VERSION, TARGET_VERSION);
    if (after !== before) writeFileSync(file, after, 'utf8');
  }
  const manifest = readJson(targetManifest);
  if (manifest.catalogVersion !== TARGET_VERSION) {
    throw new Error(`Refusing unexpected target catalog ${manifest.catalogVersion}`);
  }
}

function decodeXml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parseGoldValues(xml) {
  const rows = [];
  for (const match of String(xml).matchAll(/<stat_object\b[^>]*>([\s\S]*?)<\/stat_object>/g)) {
    const fields = {};
    for (const field of match[1].matchAll(/<field\s+name="([^"]+)"[^>]*\svalue="([^"]*)"[^>]*\/>/g)) {
      fields[field[1]] = decodeXml(field[2]);
    }
    if (!fields.UUID) continue;
    const levels = {};
    for (const [key, value] of Object.entries(fields)) {
      const level = /^Level(\d+)$/.exec(key);
      if (level) levels[level[1]] = Number(value);
    }
    rows.push({
      uuid: fields.UUID.toLowerCase(),
      name: fields.Name || '',
      using: fields.Using ? fields.Using.toLowerCase() : null,
      parentScale: fields.ParentScale == null ? 1 : Number(fields.ParentScale),
      levels,
    });
  }
  rows.sort((a, b) => a.uuid.localeCompare(b.uuid));
  if (!rows.length) throw new Error('GoldValues.tbl contained no stat objects');
  return rows;
}

export function roundHalfUp(value, step = 1) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0 || value < 0) {
    throw new Error(`Invalid non-negative rounding input: ${value}, step ${step}`);
  }
  return Math.floor(value / step + 0.5) * step;
}

function goldMap(rows) {
  return new Map(rows.map(row => [row.uuid, row]));
}

export function resolveGoldValue(rowsOrMap, uuid, level, seen = new Set()) {
  const rows = rowsOrMap instanceof Map ? rowsOrMap : goldMap(rowsOrMap);
  const key = String(uuid || '').toLowerCase();
  const numericLevel = Number(level);
  const row = rows.get(key);
  if (!row || !Number.isInteger(numericLevel) || numericLevel < 1) return null;
  const exact = row.levels[String(numericLevel)];
  if (Number.isFinite(exact)) return exact;
  if (seen.has(key)) throw new Error(`GoldValues inheritance cycle at ${key}`);
  const nextSeen = new Set(seen).add(key);
  if (row.using) {
    const parent = resolveGoldValue(rows, row.using, numericLevel, nextSeen);
    return parent == null ? null : roundHalfUp(parent * row.parentScale);
  }
  const defined = Object.values(row.levels).filter(Number.isFinite);
  if (defined.length === 1) return roundHalfUp(defined[0] * row.parentScale);
  return null;
}

export function calculateBg3Price(bg3, rowsOrMap) {
  if (!bg3 || typeof bg3 !== 'object') return null;
  if (bg3.override !== null && bg3.override !== undefined && bg3.override !== '') {
    const price = Number(bg3.override);
    return Number.isFinite(price) && price >= 0 ? {gp: roundHalfUp(price), method: 'value-override', raw: price} : null;
  }
  const level = Number(bg3.level);
  const scale = Number(bg3.scale);
  const base = resolveGoldValue(rowsOrMap, bg3.valueUUID, level);
  if (!Number.isFinite(base) || !Number.isFinite(scale) || scale < 0) return null;
  const raw = base * scale;
  const rounded = Number(bg3.rounding)
    ? roundHalfUp(raw, raw >= 1000 ? 50 : raw >= 100 ? 10 : raw >= 20 ? 5 : 1)
    : roundHalfUp(raw);
  return {gp: rounded, method: 'gold-value-curve', raw, base, level, scale};
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

function loadSourceCatalog() {
  const manifest = readJson(join(SOURCE_ROOT, 'manifest.json'));
  const loadNodes = group => manifest.files[group].flatMap(meta => readJson(join(REPO_ROOT, ...meta.path.split('/'))).nodes);
  const itemShards = manifest.files.items.map(meta => ({
    meta,
    payload: JSON.parse(readFileSync(join(REPO_ROOT, ...meta.path.split('/')), 'utf8').replaceAll(SOURCE_VERSION, TARGET_VERSION)),
  }));
  const items = itemShards.flatMap(row => row.payload.items);
  return {
    manifest,
    itemShards,
    items,
    roots: loadNodes('rootTemplates'),
    stats: loadNodes('itemStats'),
  };
}

function profileBundle(item, profile) {
  if (profile === 'catalog') return item;
  if (profile === 'honour') return item.source?.honourOverlay?.item || null;
  throw new Error(`Unknown profile bundle: ${profile}`);
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

function evidenceMaps(items, rootsByUuid, profile, priceOf) {
  const rootMass = new Map();
  const rootPrice = new Map();
  const visualMass = new Map();
  const physicsMass = new Map();
  const parentMass = new Map();
  const parentPrice = new Map();
  for (const item of items) {
    const bundle = profileBundle(item, profile);
    if (!bundle) continue;
    const rootUuid = item.source?.rootTemplateUuid?.toLowerCase();
    const root = rootsByUuid.get(rootUuid);
    const kg = bundle.mechanics?.profile?.mass?.kg;
    const price = priceOf(bundle)?.gp;
    if (Number.isFinite(kg)) {
      addSet(rootMass, rootUuid, kg);
      addSet(visualMass, root?.resolvedAttributes?.VisualTemplate, kg);
      addSet(physicsMass, root?.resolvedAttributes?.PhysicsTemplate, kg);
      addSet(parentMass, root?.parentUuid?.toLowerCase(), kg);
    }
    if (Number.isFinite(price)) {
      addSet(rootPrice, rootUuid, price);
      addSet(parentPrice, root?.parentUuid?.toLowerCase(), price);
    }
  }
  return {rootMass, rootPrice, visualMass, physicsMass, parentMass, parentPrice};
}

function inferMass(item, bundle, context) {
  const current = bundle.mechanics?.profile?.mass?.kg;
  if (Number.isFinite(current)) return {kg: current, method: 'source-weight', evidence: 'mechanics.profile.mass.kg'};
  const rootUuid = item.source?.rootTemplateUuid?.toLowerCase();
  const root = context.rootsByUuid.get(rootUuid);
  const resolvedStats = context.statsByName.get(root?.resolvedAttributes?.Stats);
  const statsWeight = Number(resolvedStats?.resolvedProperties?.Weight);
  if (Number.isFinite(statsWeight)) {
    return {kg: statsWeight, method: 'root-resolved-stats', evidence: resolvedStats.statsId};
  }
  const embeddedUuids = String(item.source?.statsId || '').match(UUID_PATTERN) || [];
  for (const embedded of embeddedUuids) {
    const value = singleton(context.maps.rootMass, embedded.toLowerCase());
    if (value != null) return {kg: value, method: 'embedded-root-uuid', evidence: embedded.toLowerCase()};
  }
  const override = MASS_OVERRIDES.get(rootUuid);
  if (override) return {kg: override.kg, method: 'reviewed-exception', evidence: override.evidence};
  const visual = singleton(context.maps.visualMass, root?.resolvedAttributes?.VisualTemplate);
  const physics = singleton(context.maps.physicsMass, root?.resolvedAttributes?.PhysicsTemplate);
  if (visual != null && physics != null && visual !== physics) {
    throw new Error(`Conflicting visual/physics masses for ${item.id}: ${visual} vs ${physics}`);
  }
  if (visual != null || physics != null) {
    return {
      kg: visual ?? physics,
      method: visual != null && physics != null ? 'visual-and-physics-template' : visual != null ? 'visual-template' : 'physics-template',
      evidence: [
        visual != null ? root?.resolvedAttributes?.VisualTemplate : null,
        physics != null ? root?.resolvedAttributes?.PhysicsTemplate : null,
      ].filter(Boolean).join('+'),
    };
  }
  const chain = Array.isArray(root?.inheritanceChain) ? root.inheritanceChain.slice(0, -1).reverse() : [];
  for (const ancestor of chain) {
    const value = singleton(context.maps.rootMass, String(ancestor).toLowerCase());
    if (value != null) return {kg: value, method: 'root-ancestor', evidence: String(ancestor).toLowerCase()};
  }
  const sibling = singleton(context.maps.parentMass, root?.parentUuid?.toLowerCase());
  if (sibling != null) return {kg: sibling, method: 'root-sibling', evidence: root.parentUuid.toLowerCase()};
  return {kg: 0, method: 'not-applicable', evidence: 'no-numeric-source;non-inventory-or-technical'};
}

function inferPrice(item, bundle, context) {
  const direct = context.priceOf(bundle);
  if (direct) return direct;
  const rootUuid = item.source?.rootTemplateUuid?.toLowerCase();
  const root = context.rootsByUuid.get(rootUuid);
  const rootStats = context.statsByName.get(root?.resolvedAttributes?.Stats);
  const viaStats = calculateBg3Price(statsPriceMetadata(rootStats?.resolvedProperties), context.gold);
  if (viaStats) return {...viaStats, method: 'root-resolved-stats', evidence: rootStats.statsId};
  for (const alias of (String(item.source?.statsId || '').match(UUID_PATTERN) || []).map(value => value.toLowerCase())) {
    const value = singleton(context.maps.rootPrice, alias);
    if (value != null) return {gp: value, method: 'embedded-root-price', evidence: alias};
  }
  const reviewedZero = PRICE_ZERO_ROOTS.get(rootUuid);
  if (reviewedZero) return {gp: 0, method: 'reviewed-not-applicable', evidence: reviewedZero};
  if (!rootUuid && item.source?.statsId === '_Unarmed') {
    return {gp: 0, method: 'reviewed-not-applicable', evidence: 'abstract-stats:_Unarmed'};
  }
  const canBePickedUp = root?.resolvedAttributes?.CanBePickedUp;
  const hasGameplayValue = root?.resolvedAttributes?.HasGameplayValue;
  if (canBePickedUp === 'False' || (hasGameplayValue === 'False' && canBePickedUp !== 'True')) {
    return {
      gp: 0,
      method: 'root-not-applicable',
      evidence: `HasGameplayValue=${hasGameplayValue || 'unset'};CanBePickedUp=${canBePickedUp || 'unset'}`,
    };
  }
  const sameRoot = singleton(context.maps.rootPrice, rootUuid);
  if (sameRoot != null) return {gp: sameRoot, method: 'same-root-price', evidence: rootUuid};
  const chain = Array.isArray(root?.inheritanceChain) ? root.inheritanceChain.slice(0, -1).reverse() : [];
  for (const ancestor of chain) {
    const value = singleton(context.maps.rootPrice, String(ancestor).toLowerCase());
    if (value != null) return {gp: value, method: 'root-ancestor-price', evidence: String(ancestor).toLowerCase()};
  }
  const sibling = singleton(context.maps.parentPrice, root?.parentUuid?.toLowerCase());
  if (sibling != null) return {gp: sibling, method: 'root-sibling-price', evidence: root.parentUuid.toLowerCase()};
  return {gp: 0, method: 'not-applicable', evidence: 'no-economic-source;non-inventory-or-technical'};
}

function formatMass(kg) {
  return `${String(kg)} кг`;
}

function formatPrice(gp) {
  return `${String(gp)} зм`;
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function confidenceFor(method) {
  if (['root-resolved-stats', 'source-weight', 'gold-value-curve', 'value-override'].includes(method)) return 'exact';
  if (['embedded-root-uuid', 'embedded-root-price', 'visual-and-physics-template', 'visual-template', 'physics-template'].includes(method)) return 'strong-inference';
  if (['reviewed-exception', 'reviewed-not-applicable'].includes(method)) return 'reviewed';
  if (['root-ancestor', 'root-sibling', 'root-ancestor-price', 'root-sibling-price'].includes(method)) return 'family-inference';
  return 'explicit-not-applicable';
}

function materialize(items, roots, stats, goldRows) {
  const rootsByUuid = new Map(roots.map(root => [root.uuid.toLowerCase(), root]));
  const statsByName = new Map(stats.map(row => [row.statsId, row]));
  const gold = goldMap(goldRows);
  const priceOf = bundle => calculateBg3Price(bundle?.mechanics?.profile?.value?.bg3, gold);
  const summary = {};
  const weightFallbacks = [];
  const priceFallbacks = [];
  for (const profile of ['catalog', 'honour']) {
    const maps = evidenceMaps(items, rootsByUuid, profile, priceOf);
    const context = {gold, maps, rootsByUuid, statsByName, priceOf};
    const profileSummary = {
      materializations: 0,
      declaredProfileBundles: 0,
      weights: {complete: 0, filled: 0, zero: 0, methods: {}},
      prices: {complete: 0, filled: 0, zero: 0, methods: {}},
    };
    for (const item of items) {
      const bundle = profileBundle(item, profile);
      if (!bundle) continue;
      profileSummary.materializations++;
      profileSummary.declaredProfileBundles++;
      const massWasMissing = !Number.isFinite(bundle.mechanics?.profile?.mass?.kg);
      const storedPriceWasMissing = !Number.isFinite(bundle.mechanics?.profile?.value?.gp);
      const directPriceWasMissing = !priceOf(bundle);
      const mass = inferMass(item, bundle, context);
      const price = inferPrice(item, bundle, context);
      if (!Number.isFinite(mass.kg) || mass.kg < 0) throw new Error(`Invalid mass for ${item.id} (${profile})`);
      if (!Number.isInteger(price.gp) || price.gp < 0) throw new Error(`Invalid price for ${item.id} (${profile})`);
      const massDisplay = formatMass(mass.kg);
      const priceDisplay = formatPrice(price.gp);
      bundle.mechanics.profile.mass = {kg: mass.kg, display: massDisplay, unit: 'kg'};
      bundle.weight = massDisplay;
      bundle.mechanics.profile.value.gp = price.gp;
      bundle.mechanics.profile.value.cp = price.gp * 100;
      bundle.mechanics.profile.value.display = priceDisplay;
      bundle.cost = priceDisplay;
      profileSummary.weights.complete++;
      profileSummary.prices.complete++;
      if (mass.kg === 0) profileSummary.weights.zero++;
      if (price.gp === 0) profileSummary.prices.zero++;
      increment(profileSummary.weights.methods, mass.method);
      increment(profileSummary.prices.methods, price.method);
      if (massWasMissing) {
        profileSummary.weights.filled++;
        weightFallbacks.push({
          itemId: item.id,
          profile,
          names: {ru: item.i18n?.ru?.name || item.n || '', en: item.i18n?.en?.name || ''},
          kg: mass.kg,
          method: mass.method,
          confidence: confidenceFor(mass.method),
          evidence: mass.evidence,
        });
      }
      if (storedPriceWasMissing) profileSummary.prices.filled++;
      if (directPriceWasMissing) {
        priceFallbacks.push({
          itemId: item.id,
          profile,
          names: {ru: item.i18n?.ru?.name || item.n || '', en: item.i18n?.en?.name || ''},
          gp: price.gp,
          method: price.method,
          confidence: confidenceFor(price.method),
          evidence: price.evidence || null,
        });
      }
    }
    summary[profile] = profileSummary;
  }
  weightFallbacks.sort((a, b) => `${a.itemId}\0${a.profile}`.localeCompare(`${b.itemId}\0${b.profile}`));
  priceFallbacks.sort((a, b) => `${a.itemId}\0${a.profile}`.localeCompare(`${b.itemId}\0${b.profile}`));
  return {summary, weightFallbacks, priceFallbacks};
}

function goldSnapshot(xmlBytes, rows) {
  return {
    schemaVersion: 'bg3-gold-values/1',
    catalogVersion: TARGET_VERSION,
    source: {
      game: "Baldur's Gate 3",
      steamBuildId: '24532579',
      path: 'Data/Editor/Mods/Shared/Levelmaps/GoldValues.tbl',
      bytes: xmlBytes.length,
      sha256: sha256(xmlBytes),
    },
    calculation: {
      override: 'ValueOverride is an absolute price when present, including zero',
      inheritance: 'resolve LevelN through Using and round half-up after every ParentScale',
      valueScale: 'multiply the resolved integer curve value by ValueScale',
      valueRounding: 'half-up step: raw>=1000:50; raw>=100:10; raw>=20:5; otherwise:1',
      valueRoundingFalse: 'half-up to an integer; all selected-build rows produce exactly 1 gp',
    },
    count: rows.length,
    curves: rows,
  };
}

function economyReport(result, goldSource) {
  return {
    schemaVersion: 'dnd-world-bg3-item-economy-report/1',
    catalogVersion: TARGET_VERSION,
    generatedAt: GENERATED_AT,
    sourceCatalogVersion: SOURCE_VERSION,
    scope: {
      items: 10_284,
      catalogMaterializations: result.summary.catalog.materializations,
      honourOverlayMaterializations: result.summary.honour.materializations,
      declaredProfileBundles: result.summary.catalog.declaredProfileBundles + result.summary.honour.declaredProfileBundles,
    },
    source: goldSource,
    formula: {
      inheritanceRounding: 'half-up after each ParentScale',
      finalSteps: [{minimum: 1000, step: 50}, {minimum: 100, step: 10}, {minimum: 20, step: 5}, {minimum: 0, step: 1}],
      currency: {unit: 'gp', copperPerGp: 100, displaySuffix: 'зм'},
    },
    summary: result.summary,
    audit: {
      allWeightsComplete: true,
      allPricesComplete: true,
      negativeWeights: 0,
      negativePrices: 0,
      weightFallbacks: result.weightFallbacks.length,
      priceFallbacks: result.priceFallbacks.length,
    },
    weightFallbacks: result.weightFallbacks,
    priceFallbacks: result.priceFallbacks,
  };
}

function reportMarkdown(report) {
  const c = report.summary.catalog;
  const h = report.summary.honour;
  const rows = object => Object.entries(object).sort(([a], [b]) => a.localeCompare(b)).map(([method, count]) => `| ${method} | ${count} |`).join('\n');
  return `# BG3 item economy audit — ${TARGET_VERSION}\n\n` +
    `Проверены все **${report.scope.items}** предмета и все объявленные профильные materialization bundle. ` +
    `Пустых значений веса и цены после сборки: **0**.\n\n` +
    `## Итог\n\n` +
    `| Профиль | Материализаций | Заполнено пропусков веса | Нулевой вес | Заполнено цен | Нулевая цена |\n` +
    `|---|---:|---:|---:|---:|---:|\n` +
    `| catalog | ${c.materializations} | ${c.weights.filled} | ${c.weights.zero} | ${c.prices.complete} | ${c.prices.zero} |\n` +
    `| honour | ${h.materializations} | ${h.weights.filled} | ${h.weights.zero} | ${h.prices.complete} | ${h.prices.zero} |\n\n` +
    `## Источники веса (catalog)\n\n| Метод | Количество |\n|---|---:|\n${rows(c.weights.methods)}\n\n` +
    `## Источники цены (catalog)\n\n| Метод | Количество |\n|---|---:|\n${rows(c.prices.methods)}\n\n` +
    `Полная построчная трассировка всех заполненных fallback-случаев находится в \`item-economy-report.json\`.\n`;
}

function fileMeta(file) {
  const bytes = readFileSync(file);
  return {bytes: bytes.length, sha256: sha256(bytes)};
}

function updateManifest(sourceManifest, report, snapshot) {
  const manifest = JSON.parse(JSON.stringify(sourceManifest).replaceAll(SOURCE_VERSION, TARGET_VERSION));
  manifest.catalogVersion = TARGET_VERSION;
  manifest.generatedAt = GENERATED_AT;
  manifest.source.economy = {
    schemaVersion: snapshot.schemaVersion,
    gameTable: snapshot.source,
    auditReport: 'item-economy-report.json',
  };
  manifest.contracts.itemEconomy = {
    schemaVersion: report.schemaVersion,
    currency: 'BG3 base value in gp',
    copperPerGp: 100,
    rounding: 'source GoldValues inheritance plus ValueRounding half-up steps',
    missingWeightFallback: 'source-backed graph inference, reviewed exception, or explicit not-applicable zero; confidence is recorded per row',
    missingPriceFallback: 'source-backed graph inference or explicit not-applicable zero; confidence is recorded per row',
  };
  manifest.counts.itemEconomy = {
    catalog: report.summary.catalog,
    honour: report.summary.honour,
  };
  manifest.entrypoints.itemEconomyReport = 'item-economy-report.json';
  manifest.entrypoints.goldValues = 'source/gold-values.json';
  manifest.integrity.allItemsHaveWeight = true;
  manifest.integrity.allItemsHaveCost = true;
  manifest.integrity.itemEconomyProfileBundlesExhaustive = true;
  manifest.integrity.itemEconomySourcePinned = true;
  const addedPaths = [
    `data/bg3/${TARGET_VERSION}/source/gold-values.json`,
    `data/bg3/${TARGET_VERSION}/item-economy-report.json`,
    `data/bg3/${TARGET_VERSION}/item-economy-report.md`,
  ];
  manifest.files.other = manifest.files.other.filter(meta => !addedPaths.includes(meta.path));
  manifest.files.other.push(...addedPaths.map(path => ({path, bytes: 0, sha256: ''})));
  manifest.files.other.sort((a, b) => a.path.localeCompare(b.path));
  for (const group of Object.values(manifest.files)) {
    for (const meta of group) {
      const file = join(REPO_ROOT, ...meta.path.split('/'));
      if (!existsSync(file)) throw new Error(`Manifest artifact missing: ${meta.path}`);
      Object.assign(meta, fileMeta(file));
    }
  }
  manifest.sharding.runtimeItems.targetBytes = 225_000;
  manifest.sharding.runtimeItems.maxBytes = Math.max(...manifest.files.items.map(meta => meta.bytes));
  if (manifest.sharding.runtimeItems.maxBytes >= manifest.sharding.runtimeItems.hardLimitBytes) {
    throw new Error(`Runtime item shard exceeds hard limit: ${manifest.sharding.runtimeItems.maxBytes}`);
  }
  writeJson(join(TARGET_ROOT, 'manifest.json'), manifest, true);
  return manifest;
}

function verifyMaterialization(items) {
  let rows = 0;
  for (const item of items) {
    for (const [profile, bundle] of [['catalog', item], ['honour', item.source?.honourOverlay?.item]]) {
      if (!bundle && profile === 'honour') continue;
      if (!bundle) throw new Error(`${item.id}: missing ${profile} materialization`);
      rows++;
      const mass = bundle.mechanics?.profile?.mass;
      const value = bundle.mechanics?.profile?.value;
      if (!Number.isFinite(mass?.kg) || mass.kg < 0 || mass.unit !== 'kg' || mass.display !== bundle.weight || mass.display !== formatMass(mass.kg)) {
        throw new Error(`${item.id}: inconsistent ${profile} mass`);
      }
      if (!Number.isInteger(value?.gp) || value.gp < 0 || value.cp !== value.gp * 100 || value.display !== bundle.cost || value.display !== formatPrice(value.gp)) {
        throw new Error(`${item.id}: inconsistent ${profile} value`);
      }
    }
  }
  return rows;
}

function verifyManifest(manifest) {
  let files = 0;
  for (const group of Object.values(manifest.files)) {
    for (const meta of group) {
      const file = join(REPO_ROOT, ...meta.path.split('/'));
      const actual = fileMeta(file);
      if (actual.bytes !== meta.bytes || actual.sha256 !== meta.sha256) throw new Error(`Manifest mismatch: ${meta.path}`);
      files++;
    }
  }
  return files;
}

function economyFields(item) {
  const pick = bundle => bundle ? {
    weight: bundle.weight,
    cost: bundle.cost,
    mass: bundle.mechanics?.profile?.mass,
    value: bundle.mechanics?.profile?.value,
  } : null;
  return {
    id: item.id,
    catalog: pick(item),
    honour: pick(item.source?.honourOverlay?.item),
  };
}

function build() {
  if (!existsSync(GOLD_VALUES_PATH)) throw new Error(`GoldValues.tbl not found: ${GOLD_VALUES_PATH}`);
  const xmlBytes = readFileSync(GOLD_VALUES_PATH);
  const sourceSha256 = sha256(xmlBytes);
  if (sourceSha256 !== EXPECTED_GOLD_VALUES_SHA256) {
    throw new Error(`GoldValues.tbl SHA-256 mismatch: ${sourceSha256}`);
  }
  const goldRows = parseGoldValues(xmlBytes.toString('utf8'));
  if (goldRows.length !== 58) throw new Error(`Expected 58 GoldValues curves, found ${goldRows.length}`);
  cloneCatalog();
  const source = loadSourceCatalog();
  const result = materialize(source.items, source.roots, source.stats, goldRows);
  for (const shard of source.itemShards) {
    writeJson(join(TARGET_ROOT, 'items', `${shard.meta.shard}.json`), shard.payload);
  }
  const snapshot = goldSnapshot(xmlBytes, goldRows);
  writeJson(join(TARGET_ROOT, 'source', 'gold-values.json'), snapshot, true);
  const report = economyReport(result, snapshot.source);
  writeJson(join(TARGET_ROOT, 'item-economy-report.json'), report, true);
  writeFileSync(join(TARGET_ROOT, 'item-economy-report.md'), reportMarkdown(report), 'utf8');
  const manifest = updateManifest(source.manifest, report, snapshot);
  const materializations = verifyMaterialization(source.items);
  const files = verifyManifest(manifest);
  const manifestHash = sha256(readFileSync(join(TARGET_ROOT, 'manifest.json')));
  console.log(JSON.stringify({
    mode: 'write',
    catalogVersion: TARGET_VERSION,
    items: source.items.length,
    materializations,
    files,
    manifestSha256: manifestHash,
    summary: report.summary,
  }, null, 2));
}

function check() {
  const manifest = readJson(join(TARGET_ROOT, 'manifest.json'));
  const items = manifest.files.items.flatMap(meta => readJson(join(REPO_ROOT, ...meta.path.split('/'))).items);
  const materializations = verifyMaterialization(items);
  const files = verifyManifest(manifest);
  const report = readJson(join(TARGET_ROOT, manifest.entrypoints.itemEconomyReport));
  const snapshot = readJson(join(TARGET_ROOT, manifest.entrypoints.goldValues));
  if (manifest.catalogVersion !== TARGET_VERSION || items.length !== manifest.counts.items) throw new Error('Catalog item count mismatch');
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate catalog item ID');
  if (!report.audit?.allWeightsComplete || !report.audit?.allPricesComplete) throw new Error('Economy audit is not complete');
  if (snapshot.source.sha256 !== manifest.source.economy.gameTable.sha256) throw new Error('GoldValues source pin mismatch');
  if (snapshot.source.sha256 !== EXPECTED_GOLD_VALUES_SHA256 || snapshot.count !== 58) throw new Error('Unexpected GoldValues source identity');
  const source = loadSourceCatalog();
  const expectedResult = materialize(source.items, source.roots, source.stats, snapshot.curves);
  const expectedReport = economyReport(expectedResult, snapshot.source);
  if (JSON.stringify(report) !== JSON.stringify(expectedReport)) throw new Error('Economy report does not reproduce from pinned sources');
  if (JSON.stringify(manifest.counts.itemEconomy) !== JSON.stringify({
    catalog: expectedReport.summary.catalog,
    honour: expectedReport.summary.honour,
  })) throw new Error('Manifest economy summary mismatch');
  const actualById = new Map(items.map(item => [item.id, item]));
  for (const expected of source.items) {
    const actual = actualById.get(expected.id);
    if (!actual || JSON.stringify(economyFields(actual)) !== JSON.stringify(economyFields(expected))) {
      throw new Error(`Economy materialization mismatch: ${expected.id}`);
    }
  }
  console.log(JSON.stringify({
    mode: 'check',
    catalogVersion: manifest.catalogVersion,
    items: items.length,
    materializations,
    files,
    manifestSha256: sha256(readFileSync(join(TARGET_ROOT, 'manifest.json'))),
  }, null, 2));
}

function main() {
  if (process.argv.includes('--write')) build();
  else if (process.argv.includes('--check')) check();
  else throw new Error('Usage: node scripts/build-bg3-item-economy.mjs --write|--check');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
