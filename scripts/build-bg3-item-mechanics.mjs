import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_VERSION = 'bg3-24532579-v10';
const CATALOG_ROOT = join(REPO_ROOT, 'data', 'bg3', CATALOG_VERSION);
const STANDARD_ONLY_BUILDER = join(SCRIPT_DIR, 'prune-bg3-honour-profile.mjs');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function verifyMechanicsContract() {
  const manifest = readJson(join(CATALOG_ROOT, 'manifest.json'));
  const report = readJson(join(CATALOG_ROOT, manifest.entrypoints.itemMechanicsReport));
  if (manifest.catalogVersion !== CATALOG_VERSION) throw new Error(`Unexpected catalog ${manifest.catalogVersion}`);
  if (manifest.defaultRulesProfile !== 'standard' || JSON.stringify(manifest.rulesProfiles) !== '["standard"]') {
    throw new Error('The item mechanics catalog is not Standard-only');
  }
  if (JSON.stringify(Object.keys(manifest.counts.itemMechanics || {})) !== '["standard"]'
    || JSON.stringify(Object.keys(report.profiles || {})) !== '["standard"]') {
    throw new Error('Item mechanics still exposes an alternate rules profile');
  }
  if (report.profiles.standard.materializations !== manifest.counts.items) {
    throw new Error('Standard mechanics materialization count differs from the runtime item count');
  }
  return {
    catalogVersion: manifest.catalogVersion,
    profile: 'standard',
    items: manifest.counts.items,
    materializations: report.profiles.standard.materializations,
  };
}

const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) {
  throw new Error('Usage: node scripts/build-bg3-item-mechanics.mjs --write|--check');
}
execFileSync(process.execPath, [STANDARD_ONLY_BUILDER, mode], {cwd: REPO_ROOT, stdio: 'inherit'});
console.log(JSON.stringify(verifyMechanicsContract(), null, 2));
