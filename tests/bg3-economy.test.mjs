import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  calculateBg3Price,
  parseGoldValues,
  resolveGoldValue,
  roundHalfUp,
} from '../scripts/build-bg3-item-economy.mjs';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {current, catalogRoot, manifest} = selectBg3Catalog(repo);
const revision = Number(/^bg3-24532579-v(\d+)$/.exec(current.catalogVersion)?.[1] || 0);
const requiresEconomy = {skip: revision < 9 ? 'requires a selected v9+ catalog' : false};

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const items = revision >= 9
  ? manifest.files.items.flatMap(meta => readJson(repoFile(meta.path)).items)
  : [];

function bundles() {
  return items.flatMap(item => [
    {item, profile: 'catalog', bundle: item},
    ...(item.source?.honourOverlay?.item
      ? [{item, profile: 'honour', bundle: item.source.honourOverlay.item}]
      : []),
  ]);
}

function histogram(values) {
  return Object.fromEntries([...values.reduce((map, value) => {
    map.set(String(value), (map.get(String(value)) || 0) + 1);
    return map;
  }, new Map())].sort(([a], [b]) => Number(a) - Number(b)));
}

test('BG3 base-value rounding uses pinned half-up thresholds', requiresEconomy, () => {
  assert.equal(roundHalfUp(21, 5), 20);
  assert.equal(roundHalfUp(23, 5), 25);
  assert.equal(roundHalfUp(765, 10), 770);
  assert.equal(roundHalfUp(1440, 50), 1450);
  assert.equal(roundHalfUp(1920, 50), 1900);
  assert.equal(roundHalfUp(2880, 50), 2900);

  const snapshot = readJson(catalogFile(manifest.entrypoints.goldValues));
  assert.equal(snapshot.count, 58);
  assert.equal(snapshot.source.sha256, 'a1ad765d1413c5c5b7ed49a14066bf90d905646ecc87a909f7d4f72e4c01d115');
  assert.deepEqual(parseGoldValues(`<stats><stat_objects><stat_object><fields>
    <field name="UUID" type="IdTableFieldDefinition" value="00000000-0000-0000-0000-000000000001" />
    <field name="Name" type="NameTableFieldDefinition" value="Fixture" />
    <field name="Level1" type="IntegerTableFieldDefinition" value="13" />
    <field name="ParentScale" type="FloatTableFieldDefinition" value="1" />
  </fields></stat_object></stat_objects></stats>`), [{
    uuid: '00000000-0000-0000-0000-000000000001',
    name: 'Fixture',
    using: null,
    parentScale: 1,
    levels: {1: 13},
  }]);
  assert.equal(resolveGoldValue(snapshot.curves, '8b2ad47c-891e-4a19-bab8-43cd5e964cb1', 4), 0);

  const expected = new Map([
    ['MAG_TheThorns_Trident', 840],
    ['UND_SocietyOfBrilliance_ResonanceStaff', 310],
    ['ARM_Amulet_Bronze', 20],
    ['ALCH_Extract_ViridianCrystal', 25],
    ['MAG_DeadShot_Longbow', 770],
    ['ARM_Splint_Body_2', 1450],
    ['ARM_Splint_Body_Dwarven', 1900],
    ['MAG_EndGame_HalfPlate', 2900],
    ['MAG_Infernal_Plate_Armor', 8000],
  ]);
  const byStats = new Map(items.map(item => [item.source.statsId, item]));
  for (const [statsId, gp] of expected) {
    const item = byStats.get(statsId);
    assert.ok(item, statsId);
    assert.equal(calculateBg3Price(item.mechanics.profile.value.bg3, snapshot.curves)?.gp, gp, statsId);
    assert.equal(item.mechanics.profile.value.gp, gp, statsId);
  }
});

test('all 10,284 items and every materialized profile have coherent weight and cost', requiresEconomy, () => {
  assert.equal(items.length, 10_284);
  const rows = bundles();
  assert.equal(rows.length, 20_566);
  for (const {item, profile, bundle} of rows) {
    const context = `${item.id}:${profile}`;
    const mass = bundle.mechanics?.profile?.mass;
    const value = bundle.mechanics?.profile?.value;
    assert.ok(Number.isFinite(mass?.kg) && mass.kg >= 0, context);
    assert.equal(mass.unit, 'kg', context);
    assert.equal(mass.display, `${mass.kg} кг`, context);
    assert.equal(bundle.weight, mass.display, context);
    assert.ok(Number.isInteger(value?.gp) && value.gp >= 0, context);
    assert.equal(value.cp, value.gp * 100, context);
    assert.equal(value.display, `${value.gp} зм`, context);
    assert.equal(bundle.cost, value.display, context);
    assert.notEqual(bundle.weight, '—', context);
    assert.notEqual(bundle.cost, '—', context);
  }
  assert.equal(manifest.integrity.allItemsHaveWeight, true);
  assert.equal(manifest.integrity.allItemsHaveCost, true);
  assert.equal(manifest.integrity.itemEconomyProfileBundlesExhaustive, true);
  assert.equal(manifest.integrity.itemEconomySourcePinned, true);
});

test('economy report accounts for every inferred fallback and direct formula', requiresEconomy, () => {
  const report = readJson(catalogFile(manifest.entrypoints.itemEconomyReport));
  const snapshot = readJson(catalogFile(manifest.entrypoints.goldValues));
  assert.equal(report.catalogVersion, current.catalogVersion);
  assert.equal(report.scope.items, items.length);
  assert.equal(report.scope.declaredProfileBundles, bundles().length);
  assert.equal(report.source.sha256, snapshot.source.sha256);
  assert.equal(report.audit.allWeightsComplete, true);
  assert.equal(report.audit.allPricesComplete, true);
  assert.equal(report.weightFallbacks.length, 342);
  assert.equal(report.priceFallbacks.length, 338);

  const catalogWeights = report.weightFallbacks.filter(row => row.profile === 'catalog');
  const catalogPrices = report.priceFallbacks.filter(row => row.profile === 'catalog');
  assert.equal(catalogWeights.length, 171);
  assert.equal(catalogWeights.filter(row => row.kg === 0).length, 83);
  assert.equal(catalogWeights.filter(row => row.kg > 0).length, 88);
  assert.equal(catalogPrices.length, 169);
  assert.deepEqual(histogram(catalogPrices.map(row => row.gp)), {
    0: 153,
    1: 12,
    3: 2,
    20: 1,
    190: 1,
  });

  const directByProfile = Object.fromEntries(['catalog', 'honour'].map(profile => [profile, 0]));
  for (const {profile, bundle} of bundles()) {
    const direct = calculateBg3Price(bundle.mechanics.profile.value.bg3, snapshot.curves);
    if (!direct) continue;
    directByProfile[profile]++;
    assert.equal(bundle.mechanics.profile.value.gp, direct.gp);
  }
  assert.deepEqual(directByProfile, {catalog: 10_115, honour: 10_113});
  assert.equal(directByProfile.catalog + catalogPrices.length, 10_284);
  assert.equal(directByProfile.honour + report.priceFallbacks.filter(row => row.profile === 'honour').length, 10_282);
});
