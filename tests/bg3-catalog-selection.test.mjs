import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalVersion = process.env.BG3_CATALOG_VERSION;
const originalSha = process.env.BG3_MANIFEST_SHA256;

function restoreEnvironment() {
  if (originalVersion == null) delete process.env.BG3_CATALOG_VERSION;
  else process.env.BG3_CATALOG_VERSION = originalVersion;
  if (originalSha == null) delete process.env.BG3_MANIFEST_SHA256;
  else process.env.BG3_MANIFEST_SHA256 = originalSha;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test.afterEach(restoreEnvironment);

test('BG3 catalog audit follows the live pointer when no candidate is selected', () => {
  delete process.env.BG3_CATALOG_VERSION;
  delete process.env.BG3_MANIFEST_SHA256;
  const selected = selectBg3Catalog(repo);
  assert.equal(selected.candidate, false);
  assert.equal(selected.current.catalogVersion, selected.pointer.catalogVersion);
  assert.equal(selected.current.manifestSha256, selected.pointer.manifestSha256);
});

test('BG3 candidate audit requires both immutable identity pins', () => {
  process.env.BG3_CATALOG_VERSION = 'bg3-24532579-v3';
  delete process.env.BG3_MANIFEST_SHA256;
  assert.throws(() => selectBg3Catalog(repo), /BG3_MANIFEST_SHA256/);
  delete process.env.BG3_CATALOG_VERSION;
  process.env.BG3_MANIFEST_SHA256 = '0'.repeat(64);
  assert.throws(() => selectBg3Catalog(repo), /BG3_CATALOG_VERSION/);
});

test('BG3 candidate audit reads a dormant immutable version without moving current', () => {
  const pointerBefore = fs.readFileSync(path.join(repo, 'data', 'bg3', 'current.json'));
  const version = 'bg3-24532579-v3';
  const manifestPath = path.join(repo, 'data', 'bg3', version, 'manifest.json');
  process.env.BG3_CATALOG_VERSION = version;
  process.env.BG3_MANIFEST_SHA256 = sha256(manifestPath);
  const selected = selectBg3Catalog(repo);
  assert.equal(selected.candidate, true);
  assert.equal(selected.current.catalogVersion, version);
  assert.equal(selected.current.manifestSha256, process.env.BG3_MANIFEST_SHA256);
  assert.deepEqual(fs.readFileSync(path.join(repo, 'data', 'bg3', 'current.json')), pointerBefore);
});

test('BG3 candidate audit rejects the wrong manifest hash', () => {
  process.env.BG3_CATALOG_VERSION = 'bg3-24532579-v3';
  process.env.BG3_MANIFEST_SHA256 = '0'.repeat(64);
  assert.throws(() => selectBg3Catalog(repo), /SHA-256 mismatch/);
});
