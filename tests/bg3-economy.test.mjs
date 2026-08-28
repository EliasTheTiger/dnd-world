import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
import {
  inspectNonNegativeSourceNumber,
  inspectStatsPriceSource,
  inspectWeightSource,
} from '../scripts/audit-bg3-v10-economy.mjs';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {current, catalogRoot, manifest} = selectBg3Catalog(repo);
const revision = Number(/^bg3-24532579-v(\d+)$/.exec(current.catalogVersion)?.[1] || 0);
const requiresEconomy = {skip: revision < 10 ? 'requires the selected v10 catalog' : false};

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function idDigest(ids) {
  return crypto.createHash('sha256').update(`${[...ids].sort().join('\n')}\n`).digest('hex');
}

const items = revision >= 10
  ? manifest.files.items.flatMap(meta => readJson(repoFile(meta.path)).items)
  : [];

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

test('source-field audit rejects malformed and negative economy values before fallback', requiresEconomy, () => {
  const snapshot = readJson(catalogFile(manifest.entrypoints.goldValues));
  assert.deepEqual(inspectNonNegativeSourceNumber({Weight: -0.01}, 'Weight'), {
    state: 'invalid', value: null, reason: 'negative', raw: -0.01,
  });
  assert.deepEqual(inspectNonNegativeSourceNumber({Weight: 'not-a-number'}, 'Weight'), {
    state: 'invalid', value: null, reason: 'invalid-number-format', raw: 'not-a-number',
  });
  assert.equal(inspectNonNegativeSourceNumber({Weight: '1e2'}, 'Weight').state, 'invalid');
  assert.equal(inspectWeightSource({Weight: 0.0001}).reason, 'unsupported-kg-precision');
  assert.equal(inspectStatsPriceSource({ValueOverride: -1}, snapshot.curves).state, 'invalid');
  assert.equal(inspectStatsPriceSource({ValueOverride: 1.5}, snapshot.curves).reason, 'fractional-value-override');
  assert.equal(inspectStatsPriceSource({ValueUUID: snapshot.curves[0].uuid, ValueLevel: 1, ValueScale: -1}, snapshot.curves).state, 'invalid');
  assert.equal(inspectStatsPriceSource({ValueUUID: snapshot.curves[0].uuid, ValueLevel: 1, ValueScale: 1, ValueRounding: 2}, snapshot.curves).reason, 'invalid-value-rounding');
  assert.equal(inspectStatsPriceSource({ValueUUID: snapshot.curves[0].uuid}, snapshot.curves).state, 'invalid');
  assert.deepEqual(inspectStatsPriceSource({ValueOverride: 0}, snapshot.curves), {
    state: 'value', value: 0, method: 'value-override',
  });
});

test('all 10,284 union IDs have explicit source-backed mass and value states', requiresEconomy, () => {
  assert.equal(items.length, 10_284);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  const counts = {
    standard: 0,
    massValue: 0,
    massZero: 0,
    massNotApplicable: 0,
    priceValue: 0,
    priceZero: 0,
    priceNotApplicable: 0,
  };
  for (const item of items) {
    if (item.source?.profiles?.includes('standard')) counts.standard++;
    const mass = item.mechanics?.profile?.mass;
    const value = item.mechanics?.profile?.value;
    const context = item.id;
    assert.ok(mass && ['value', 'not-applicable'].includes(mass.state), `${context}: mass state`);
    assert.ok(value && ['value', 'not-applicable'].includes(value.state), `${context}: value state`);
    for (const [label, row] of [['mass', mass], ['value', value]]) {
      assert.equal(typeof row.source?.method, 'string', `${context}: ${label} method`);
      assert.equal(typeof row.source?.confidence, 'string', `${context}: ${label} confidence`);
      assert.ok(row.source?.evidence, `${context}: ${label} evidence`);
    }
    if (mass.state === 'value') {
      counts.massValue++;
      assert.ok(Number.isFinite(mass.kg) && mass.kg >= 0, context);
      assert.equal(mass.unit, 'kg', context);
      assert.equal(mass.display, `${mass.kg} кг`, context);
      assert.equal(item.weight, mass.display, context);
      assert.ok(String(mass.kg).split('.')[1]?.length <= 3 || Number.isInteger(mass.kg), context);
      if (mass.kg === 0) counts.massZero++;
    } else {
      counts.massNotApplicable++;
      assert.equal(mass.kg, null, context);
      assert.equal(mass.unit, 'kg', context);
      assert.equal(mass.display, 'не применяется', context);
      assert.equal(item.weight, mass.display, context);
    }
    if (value.state === 'value') {
      counts.priceValue++;
      assert.ok(Number.isInteger(value.gp) && value.gp >= 0, context);
      assert.equal(value.cp, value.gp * 100, context);
      assert.equal(value.display, `${value.gp} зм`, context);
      assert.equal(item.cost, value.display, context);
      if (value.gp === 0) counts.priceZero++;
    } else {
      counts.priceNotApplicable++;
      assert.equal(value.gp, null, context);
      assert.equal(value.cp, null, context);
      assert.equal(value.display, 'не применяется', context);
      assert.equal(item.cost, value.display, context);
    }
  }
  assert.deepEqual(counts, {
    standard: 10_282,
    massValue: 10_200,
    massZero: 130,
    massNotApplicable: 84,
    priceValue: 10_130,
    priceZero: 88,
    priceNotApplicable: 154,
  });
  assert.equal(manifest.integrity.allItemsHaveWeight, true);
  assert.equal(manifest.integrity.allItemsHaveCost, true);
  assert.equal(manifest.integrity.allItemsHaveWeightResolution, true);
  assert.equal(manifest.integrity.allItemsHaveCostResolution, true);
  assert.equal(manifest.integrity.itemEconomyStandardProductionExhaustive, true);
  assert.equal(manifest.integrity.itemEconomyUnionAuditExhaustive, true);
  assert.equal(manifest.integrity.itemEconomyNotApplicableUsesNull, true);
  assert.equal(manifest.integrity.itemEconomyUnresolvedValues, 0);
  assert.equal(manifest.integrity.itemEconomyNonEconomicFieldsPreserved, true);
  assert.equal(manifest.integrity.itemEconomyReviewedConflicts, 12);
  assert.equal(manifest.integrity.itemEconomyUnreviewedConflicts, 0);

  const sourceEmpty = items.find(item => item.source?.rootTemplateUuid === '1bc33f0f-ef51-4bc7-b82e-ea259bf5e512');
  assert.ok(sourceEmpty);
  assert.equal(sourceEmpty.mechanics.profile.mass.source.method, 'root-source-not-applicable');
  assert.equal(sourceEmpty.mechanics.profile.value.source.method, 'root-source-not-applicable');
  assert.equal(sourceEmpty.mechanics.profile.flags.portable, true, 'economy materialization does not rewrite inventory classification');

  const reviewedTree = items.find(item => item.source?.rootTemplateUuid === 'b286b4b6-dcb8-41fb-ae1b-83b04db476b4');
  assert.ok(reviewedTree);
  assert.equal(reviewedTree.mechanics.profile.mass.kg, 70);
  assert.match(reviewedTree.mechanics.profile.mass.source.evidence, /Stats\.OBJ_THR_TreeTrunk\.resolved\.Weight=70/);
});

test('economy report separates genuine zero, non-applicability and Standard production exclusions', requiresEconomy, () => {
  const report = readJson(catalogFile(manifest.entrypoints.itemEconomyReport));
  const snapshot = readJson(catalogFile(manifest.entrypoints.goldValues));
  assert.equal(report.schemaVersion, 'dnd-world-bg3-item-economy-report/3');
  assert.equal(report.catalogVersion, current.catalogVersion);
  assert.equal(report.scope.auditedUnionItems, items.length);
  assert.equal(report.scope.productionStandardItems, 10_282);
  assert.equal(report.scope.excludedFromStandardProductionItems, 2);
  assert.equal(report.source.sha256, snapshot.source.sha256);
  assert.equal(report.audit.allItemsResolved, true);
  assert.equal(report.audit.unresolvedWeights, 0);
  assert.equal(report.audit.unresolvedPrices, 0);
  assert.equal(report.audit.invalidResolvedWeights, 0);
  assert.equal(report.audit.invalidResolvedPrices, 0);
  assert.equal(report.audit.invalidDirectWeights, 0);
  assert.equal(report.audit.invalidDirectPrices, 0);
  assert.equal(report.audit.negativeWeights, 0);
  assert.equal(report.audit.negativePrices, 0);
  assert.equal(report.audit.legitimateZeroWeights, 129);
  assert.equal(report.audit.notApplicableWeights, 84);
  assert.equal(report.audit.legitimateZeroPrices, 88);
  assert.equal(report.audit.notApplicablePrices, 154);
  assert.equal(report.weightFallbacks.length, 171);
  assert.equal(report.priceFallbacks.length, 169);
  assert.deepEqual(report.directSourceFields, {
    weights: {values: 10_113, missing: 171, invalid: 0, negative: 0},
    prices: {values: 10_115, missing: 169, invalid: 0, negative: 0, reviewedNonEconomicPartial: 3},
  });
  assert.equal(report.audit.reviewedMassConflicts, 11);
  assert.equal(report.audit.reviewedPriceConflicts, 1);
  assert.equal(report.audit.reviewedConflicts, 12);
  assert.equal(report.audit.unreviewedConflicts, 0);
  assert.deepEqual(report.controlSets.auditedUnion, {
    zeroMass: {count: 130, sha256: 'aa13e1dd7adeea1cf158bba6bc8f9ef616c6e1869a812ba27fe433345692c180'},
    notApplicableMass: {count: 84, sha256: 'd2197d59214ddbd6d0a7e1ff94820790423e3d04b125abe616c57945b043271e'},
    zeroPrice: {count: 88, sha256: '44aa24810c2dfef85408d34f3d216c26c6ab12d26eb56d18d3343bc74ef3d388'},
    notApplicablePrice: {count: 154, sha256: '043aae4b2f8b9be1eb6069cd3a5d8fd1389ab9a76fd789dace3c8646c1861011'},
  });
  assert.equal(idDigest(report.reviewedConflicts.map(row => `${row.dimension}:${row.itemId}`)),
    'c958bcf356d70a3d63a3ae38d197d0df8eabd4de2cde0ea79fe55659a42f1299');
  assert.equal(report.reviewedConflicts.filter(row => row.resolution.state === 'not-applicable').length, 8);
  const shadowLantern = report.reviewedConflicts.find(row => row.dimension === 'price');
  assert.equal(shadowLantern.itemId, 'bg3:item:rt:c9ebcfae-8c9a-4acc-8a30-da7830b32121:stats:X09USEVSX3c');
  assert.deepEqual(shadowLantern.resolution, {state: 'value', value: 190});
  assert.equal(idDigest(report.excludedFromStandardProduction.map(row => row.itemId)),
    '4b61cbb3a03af17081878cfce1e2feec2db1a02af1ca62fc2d28e9c692a89fc3');

  const notApplicablePrices = items.filter(item => item.mechanics.profile.value.state === 'not-applicable');
  const zeroPrices = items.filter(item => item.mechanics.profile.value.state === 'value' && item.mechanics.profile.value.gp === 0);
  const notApplicableMasses = items.filter(item => item.mechanics.profile.mass.state === 'not-applicable');
  const zeroMasses = items.filter(item => item.mechanics.profile.mass.state === 'value' && item.mechanics.profile.mass.kg === 0);
  assert.equal(idDigest(notApplicableMasses.map(item => item.id)),
    'd2197d59214ddbd6d0a7e1ff94820790423e3d04b125abe616c57945b043271e');
  assert.equal(idDigest(zeroMasses.map(item => item.id)),
    'aa13e1dd7adeea1cf158bba6bc8f9ef616c6e1869a812ba27fe433345692c180');
  assert.equal(idDigest(notApplicablePrices.map(item => item.id)),
    '043aae4b2f8b9be1eb6069cd3a5d8fd1389ab9a76fd789dace3c8646c1861011');
  assert.equal(idDigest(zeroPrices.map(item => item.id)),
    '44aa24810c2dfef85408d34f3d216c26c6ab12d26eb56d18d3343bc74ef3d388');

  let direct = 0;
  for (const item of items) {
    const calculated = calculateBg3Price(item.mechanics.profile.value.bg3, snapshot.curves);
    if (!calculated) continue;
    direct++;
    assert.equal(item.mechanics.profile.value.state, 'value', item.id);
    assert.equal(item.mechanics.profile.value.gp, calculated.gp, item.id);
  }
  assert.equal(direct, 10_115);
  assert.equal(direct + report.priceFallbacks.length, items.length);
});
