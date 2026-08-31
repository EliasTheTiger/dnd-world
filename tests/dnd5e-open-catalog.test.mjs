import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const manifest = JSON.parse(fs.readFileSync('data/dnd5e/open5e-cc-v1/manifest.json', 'utf8'));
const catalogText = fs.readFileSync('data/dnd5e/open5e-cc-v1/catalog.js', 'utf8');
const localizationText = fs.readFileSync('data/dnd5e/open5e-cc-v1/localization.ru.json', 'utf8');
const localization = JSON.parse(localizationText);
const noticeText = fs.readFileSync('data/dnd5e/open5e-cc-v1/NOTICE.md', 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');

function loadCatalog() {
  const context = vm.createContext({});
  vm.runInContext(catalogText, context, {filename: 'catalog.js'});
  return context.DND5E_OPEN_CATALOG;
}

test('generated D&D 5e catalog is pinned, attributed, and reproducibly checkable', () => {
  assert.equal(manifest.schemaVersion, 'dnd5e-open-catalog/1');
  assert.equal(manifest.licensePolicy.required, 'CC-BY-4.0');
  assert.equal(manifest.licensePolicy.closedBookTextAllowed, false);
  assert.deepEqual(manifest.localization, {
    schemaVersion: 'dnd5e-open-catalog-localization/1', locale: 'ru', sourceLanguage: 'en', revision: 'ru-2026-08-31.1',
  });
  assert.ok(manifest.documents.length >= 4);
  assert.ok(manifest.documents.every(document => document.licenses.some(license => license.key === 'cc-by-40')));
  assert.equal(manifest.artifacts['catalog.js'].bytes, Buffer.byteLength(catalogText));
  assert.equal(manifest.artifacts['catalog.js'].sha256, sha256(catalogText));
  assert.equal(manifest.artifacts['localization.ru.json'].bytes, Buffer.byteLength(localizationText));
  assert.equal(manifest.artifacts['localization.ru.json'].sha256, sha256(localizationText));
  assert.equal(manifest.artifacts['NOTICE.md'].bytes, Buffer.byteLength(noticeText));
  assert.equal(manifest.artifacts['NOTICE.md'].sha256, sha256(noticeText));
  execFileSync(process.execPath, ['scripts/build-dnd5e-open-catalog.mjs', '--check'], {stdio: 'pipe'});
});
test('retained catalog clears the 500+ census with complete source and engine metadata', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.spells.length, 837);
  assert.equal(catalog.abilities.length, 616);
  assert.ok(new Set(catalog.spells.map(row => row.n.toLocaleLowerCase('en'))).size >= 500);
  assert.equal(new Set(catalog.spells.map(row => row.id)).size, catalog.spells.length);
  assert.equal(new Set(catalog.abilities.map(row => row.id)).size, catalog.abilities.length);
  for (const row of [...catalog.spells, ...catalog.abilities]) {
    assert.ok(row.id && row.n && row.x, row.id || 'incomplete record');
    assert.equal(row.catalogSource.provider, 'Open5e');
    assert.equal(row.catalogSource.license, 'CC-BY-4.0');
    assert.equal(row.catalogSource.language, 'ru');
    assert.equal(row.catalogSource.sourceLanguage, 'en');
    assert.equal(row.catalogSource.localizationRevision, 'ru-2026-08-31.1');
    assert.match(row.n, /[А-ЯЁа-яё]/, row.id);
    assert.match(row.x, /[А-ЯЁа-яё]/, row.id);
    const cyrillic = (row.x.match(/[А-ЯЁа-яё]/g) || []).length;
    const latin = (row.x.match(/[A-Za-z]/g) || []).length;
    assert.ok(latin <= 40 || latin <= cyrillic * 0.35, `${row.id} still contains predominantly English prose`);
    assert.ok(['dnd5e-2014-local', 'dnd5e-2024-reference'].includes(row.rulesetRef.id));
    assert.ok(['structured', 'manual-fail-closed'].includes(row.enginePolicy.mode));
    const visibleRussianText = (row.l === undefined
      ? [row.n, row.source, row.x]
      : [row.n, row.c, row.t, row.r, row.cm, row.d, row.x, row.hi]
    ).join('\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\bBlack Flag\b/g, '')
      .replace(/\bSRD\b/g, '');
    assert.doesNotMatch(visibleRussianText, /[A-Za-z]{2,}/, `${row.id} retains an English display term`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(catalog.exclusions)), [{
    kind: 'spell',
    id: 'sp_open5e_srd_2024_srd_2024_greater_invisibility',
    sourceKey: 'srd-2024_greater-invisibility',
    documentKey: 'srd-2024',
    reason: 'missing-description',
  }]);
  assert.equal(localization.locale, 'ru');
  assert.equal(Object.keys(localization.spells).length, 837);
  assert.equal(Object.keys(localization.abilities).length, 616);
  const magicMissile = catalog.spells.find(row => row.open5e.originalName === 'Magic Missile');
  const actionSurge = catalog.abilities.find(row => row.open5e.originalName === 'Action Surge');
  const alert = catalog.abilities.find(row => row.open5e.originalName === 'Alert');
  const shield = catalog.spells.find(row => row.open5e.originalName === 'Shield');
  assert.equal(magicMissile.n, 'Волшебная стрела');
  assert.match(magicMissile.x, /дротик|стрел/i);
  assert.equal(actionSurge.n, 'Всплеск действий');
  assert.match(actionSurge.source, /^Воин · Справочный документ/);
  assert.equal(alert.n, 'Бдительный');
  assert.equal(shield.r, 'На себя');
  assert.equal(shield.cm, 'В, С');
  assert.doesNotMatch(shield.x, /\b(?:AC|Magic Missile)\b/);
});

test('HTML loads the pinned catalog before the engine and governance scopes both editions honestly', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const catalogTag = '<script src="data/dnd5e/open5e-cc-v1/catalog.js"></script>';
  assert.ok(html.indexOf(catalogTag) >= 0);
  assert.ok(html.indexOf(catalogTag) < html.indexOf('<script>', html.indexOf(catalogTag)));
  assert.doesNotMatch(html, /язык: English/);
  assert.match(html, /язык: русский/);
  const sources = JSON.parse(fs.readFileSync('data/catalogs/source-manifest.json', 'utf8'));
  const rulesets = JSON.parse(fs.readFileSync('data/rulesets/manifest.json', 'utf8'));
  assert.equal(sources.catalogs.find(row => row.id === 'open5e-cc-2014-spells-v1').expected.count, 499);
  assert.equal(sources.catalogs.find(row => row.id === 'open5e-cc-2024-spells-v1').expected.count, 338);
  assert.equal(sources.catalogs.find(row => row.id === 'open5e-cc-2014-features-v1').expected.count, 307);
  assert.equal(sources.catalogs.find(row => row.id === 'open5e-cc-2024-features-v1').expected.count, 309);
  assert.equal(rulesets.active.some(row => row.id === 'dnd5e-2024-reference'), false);
  assert.equal(rulesets.rulesets.find(row => row.id === 'dnd5e-2024-reference').status, 'reference-only');
});
