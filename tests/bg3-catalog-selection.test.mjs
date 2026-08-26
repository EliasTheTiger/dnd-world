import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePointer = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'bg3', 'current.json'), 'utf8'));
const originalVersion = process.env.BG3_CATALOG_VERSION;
const originalSha = process.env.BG3_MANIFEST_SHA256;
const fixtureRoots = [];

function restoreEnvironment() {
  if (originalVersion == null) delete process.env.BG3_CATALOG_VERSION;
  else process.env.BG3_CATALOG_VERSION = originalVersion;
  if (originalSha == null) delete process.env.BG3_MANIFEST_SHA256;
  else process.env.BG3_MANIFEST_SHA256 = originalSha;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function dormantCatalogFixture() {
  const fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-world-bg3-selection-'));
  fixtureRoots.push(fixtureRepo);
  const dataRoot = path.join(fixtureRepo, 'data', 'bg3');
  const version = 'bg3-24532579-v9';
  const catalogRoot = path.join(dataRoot, version);
  fs.mkdirSync(catalogRoot, {recursive: true});
  fs.writeFileSync(path.join(dataRoot, 'current.json'), JSON.stringify(livePointer));
  const manifestPath = path.join(catalogRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 'dnd-world-bg3-manifest/1',
    catalogVersion: version,
    immutable: true,
  }));
  return {fixtureRepo, version, manifestPath};
}

test.afterEach(() => {
  restoreEnvironment();
  while (fixtureRoots.length) fs.rmSync(fixtureRoots.pop(), {recursive: true, force: true});
});

test('BG3 catalog audit follows the live pointer when no candidate is selected', () => {
  assert.equal(livePointer.catalogVersion, 'bg3-24532579-v10');
  delete process.env.BG3_CATALOG_VERSION;
  delete process.env.BG3_MANIFEST_SHA256;
  const selected = selectBg3Catalog(repo);
  assert.equal(selected.candidate, false);
  assert.equal(selected.current.catalogVersion, selected.pointer.catalogVersion);
  assert.equal(selected.current.manifestSha256, selected.pointer.manifestSha256);
});

test('BG3 candidate audit requires both immutable identity pins', () => {
  process.env.BG3_CATALOG_VERSION = livePointer.catalogVersion;
  delete process.env.BG3_MANIFEST_SHA256;
  assert.throws(() => selectBg3Catalog(repo), /BG3_MANIFEST_SHA256/);
  delete process.env.BG3_CATALOG_VERSION;
  process.env.BG3_MANIFEST_SHA256 = '0'.repeat(64);
  assert.throws(() => selectBg3Catalog(repo), /BG3_CATALOG_VERSION/);
});

test('BG3 candidate audit reads a dormant immutable version without moving current', () => {
  const {fixtureRepo, version, manifestPath} = dormantCatalogFixture();
  const pointerPath = path.join(fixtureRepo, 'data', 'bg3', 'current.json');
  const pointerBefore = fs.readFileSync(pointerPath);
  process.env.BG3_CATALOG_VERSION = version;
  process.env.BG3_MANIFEST_SHA256 = sha256(manifestPath);
  const selected = selectBg3Catalog(fixtureRepo);
  assert.equal(selected.candidate, true);
  assert.equal(selected.current.catalogVersion, version);
  assert.equal(selected.current.manifestSha256, process.env.BG3_MANIFEST_SHA256);
  assert.deepEqual(fs.readFileSync(pointerPath), pointerBefore);
});

test('BG3 candidate audit rejects the wrong manifest hash', () => {
  const {fixtureRepo, version} = dormantCatalogFixture();
  process.env.BG3_CATALOG_VERSION = version;
  process.env.BG3_MANIFEST_SHA256 = '0'.repeat(64);
  assert.throws(() => selectBg3Catalog(fixtureRepo), /SHA-256 mismatch/);
});
