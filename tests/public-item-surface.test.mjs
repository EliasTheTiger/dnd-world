import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = require('../scripts/item-domain-model.js');
const surface = require('../scripts/public-item-surface.js');
const {manifest, catalogRoot} = selectBg3Catalog(root);
const forbidden = /(?:\bBG3\b|Baldur(?:'|’)?s\s+Gate\s*3)/iu;

function sourceItems() {
  const removed = new Set(JSON.parse(fs.readFileSync(
    path.join(catalogRoot, manifest.entrypoints.itemArsenalQualityReport),
    'utf8',
  )).removed.map(row => row.itemId));
  return fs.readdirSync(path.join(catalogRoot, 'items'))
    .filter(file => file.endsWith('.json'))
    .sort()
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(catalogRoot, 'items', file), 'utf8')).items)
    .filter(item => !removed.has(item.id) && item.source?.profiles?.includes('standard'));
}

test('public item surface removes catalog-origin branding without changing handler cardinality', () => {
  const rows = sourceItems();
  const context = model.createMigrationContext(rows);
  assert.ok(rows.length >= 2_000, 'the public audit must cover the full Standard arsenal');

  for (const source of rows) {
    const domain = model.migrateItemToDomainV7(source, {context});
    const publicId = surface.publicItemId(domain.id);
    const tags = surface.publicTagValues(domain.tags);
    const handlers = surface.publicHandlerValues(domain.handlers);
    const visibleRules = surface.publicStructuredText({
      requirements: domain.equipment.requirements,
      charges: domain.charges,
      consumable: domain.consumable,
      gameplay: domain.gameplay,
    });

    assert.match(publicId, /^dnd-world:item:/u, domain.id);
    assert.doesNotMatch(publicId, forbidden, domain.id);
    assert.doesNotMatch(surface.sanitizePublicText(domain.name), forbidden, domain.id);
    assert.doesNotMatch(surface.sanitizePublicText(domain.description.text), forbidden, domain.id);
    assert.doesNotMatch(surface.publicSourceLabel(), forbidden, domain.id);
    assert.doesNotMatch(surface.publicIconLabel(domain.icon), forbidden, domain.id);
    assert.doesNotMatch(tags.join(' '), forbidden, domain.id);
    assert.equal(handlers.length, domain.handlers.length, `${domain.id}: handler reference count`);
    assert.ok(handlers.every(reference => reference.id && reference.executor), `${domain.id}: public handler reference`);
    assert.doesNotMatch(JSON.stringify(handlers), forbidden, domain.id);
    assert.doesNotMatch(visibleRules, forbidden, domain.id);
  }
});

test('public text sanitizer covers labels, attributes, errors and legacy source phrases', () => {
  const samples = [
    'BG3',
    'BG3-заклинание',
    'Каталог BG3 пока недоступен',
    "Baldur's Gate 3 Steam build 24532579",
    'Baldur’s Gate 3',
  ];
  for (const sample of samples) {
    assert.equal(surface.containsForbiddenBranding(sample), true, sample);
    assert.doesNotMatch(surface.sanitizePublicText(sample), forbidden, sample);
  }
});

test('checked-in HTML has a public surface guard and no catalog-origin branding outside scripts', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const outsideScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
  assert.doesNotMatch(outsideScripts, forbidden);
  assert.match(html, /scripts\/public-item-surface\.js/);
  assert.match(html, /attachDomGuard\(document\)/);
  assert.match(html, /containsForbiddenBranding\(query\)\)return \[\]/);
});
