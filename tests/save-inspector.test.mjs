import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {inspectFile, inspectSave} from '../scripts/save-inspector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = name => path.join(root, 'tests', 'fixtures', 'saves', name);

test('world snapshot fixture is identified without mutation', () => {
  const file = fixture('world-snapshot-v1.json'), before = fs.readFileSync(file, 'utf8'), report = inspectFile(file);
  assert.equal(report.status, 'ok');
  assert.equal(report.format, 'world-snapshot');
  assert.equal(report.revision, 7);
  assert.deepEqual(report.counts, {items:1, spells:1, abilities:1, characters:1, foes:1});
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('legacy per-key fixture is distinguished from a complete snapshot', () => {
  const report = inspectFile(fixture('per-key-v2.json'));
  assert.equal(report.status, 'ok');
  assert.equal(report.format, 'legacy-per-key');
  assert.equal(report.counts.characters, 1);
});

test('legacy cloud wrapper is unwrapped and retains transport evidence', () => {
  const report = inspectFile(fixture('cloud-campaign-legacy.json'));
  assert.equal(report.status, 'ok');
  assert.equal(report.format, 'cloud-channel');
  assert.equal(report.cloud.by, 'fixture-client');
  assert.equal(report.cloud.at, 1700000000000);
});

test('corrupt, missing and incompatible payloads are not treated as empty campaigns', () => {
  assert.equal(inspectFile(fixture('corrupt-save.txt')).status, 'corrupt');
  assert.equal(inspectFile(fixture('absent.json')).status, 'missing');
  assert.equal(inspectSave('{"schemaVersion":"future/99"}').status, 'incompatible');
});

test('unresolved references are quarantined in a diagnostic report', () => {
  const base = JSON.parse(fs.readFileSync(fixture('world-snapshot-v1.json'), 'utf8'));
  base.chars[0].inventory[0].itemId = 'missing-item';
  base.combat.order.push({kind:'foe', id:'missing-foe'});
  const report = inspectSave(base);
  assert.equal(report.status, 'needs-attention');
  assert.deepEqual(report.issues.filter(row => row.code === 'UNRESOLVED_REFERENCE').map(row => row.value).sort(), ['missing-foe', 'missing-item']);
});

test('duplicate definition IDs are reported explicitly', () => {
  const base = JSON.parse(fs.readFileSync(fixture('world-snapshot-v1.json'), 'utf8'));
  base.items.push({...base.items[0]});
  const report = inspectSave(base);
  assert.equal(report.status, 'needs-attention');
  assert.ok(report.issues.some(row => row.code === 'DUPLICATE_ID' && row.id === 'fixture-rope'));
});
