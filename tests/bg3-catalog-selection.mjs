import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION_RE = /^bg3-24532579-v[1-9][0-9]*$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function repoPathOf(repo) {
  return repo instanceof URL ? fileURLToPath(repo) : path.resolve(repo);
}

/**
 * Select the immutable BG3 catalog audited by real-artifact tests.
 *
 * Normal test runs follow current.json. Candidate-release runs must pin both
 * BG3_CATALOG_VERSION and BG3_MANIFEST_SHA256, so they can audit a dormant
 * immutable release without changing the live pointer first.
 */
export function selectBg3Catalog(repo) {
  const repoPath = repoPathOf(repo);
  const dataRoot = path.join(repoPath, 'data', 'bg3');
  const pointerPath = path.join(dataRoot, 'current.json');
  const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
  const requestedVersion = String(process.env.BG3_CATALOG_VERSION || '').trim();
  const requestedSha = String(process.env.BG3_MANIFEST_SHA256 || '').trim().toLowerCase();
  const candidate = requestedVersion.length > 0 || requestedSha.length > 0;

  if (candidate) {
    if (!VERSION_RE.test(requestedVersion)) {
      throw new Error('BG3 candidate audit requires a canonical BG3_CATALOG_VERSION');
    }
    if (!SHA256_RE.test(requestedSha)) {
      throw new Error('BG3 candidate audit requires an exact BG3_MANIFEST_SHA256');
    }
  }

  const catalogVersion = candidate ? requestedVersion : pointer.catalogVersion;
  if (!VERSION_RE.test(String(catalogVersion || ''))) {
    throw new Error('selected BG3 catalog version is not canonical');
  }
  const catalogRoot = path.join(dataRoot, catalogVersion);
  const manifestPath = path.join(catalogRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`selected BG3 manifest does not exist: ${catalogVersion}`);
  }
  const manifestSha256 = sha256File(manifestPath);
  const expectedSha = candidate ? requestedSha : String(pointer.manifestSha256 || '').toLowerCase();
  if (!SHA256_RE.test(expectedSha) || manifestSha256 !== expectedSha) {
    throw new Error(`selected BG3 manifest SHA-256 mismatch: ${catalogVersion}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.catalogVersion !== catalogVersion || manifest.immutable !== true) {
    throw new Error(`selected BG3 manifest identity is invalid: ${catalogVersion}`);
  }

  const current = candidate ? {
    schemaVersion: 'dnd-world-bg3-current/1',
    catalogVersion,
    manifest: `${catalogVersion}/manifest.json`,
    manifestSha256,
    defaultRulesProfile: 'standard',
  } : pointer;
  return {candidate, pointer, current, catalogRoot, manifestPath, manifest};
}
