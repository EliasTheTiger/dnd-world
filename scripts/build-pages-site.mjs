import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(repositoryRoot, 'data', 'bg3');
const outputRoot = join(repositoryRoot, '_site');
const checkOnly = process.argv.slice(2).includes('--check');
const runtimeFiles = ['economy-core.js', 'merchant-core.js', 'item-domain-model.js', 'definition-repository.js', 'ruleset-registry.js', 'persistence-core.js', 'action-kernel.js', 'chest-core.js', 'catalog-governance.js', 'world-state-core.js', 'ui-action-contract.js', 'projection-cache.js', 'public-item-surface.js'];
const RELEASE_PLACEHOLDER = '__DND_WORLD_RELEASE__';
const PAGES_BASE = '/dnd-world/';
const OPEN_CATALOG_PATH = 'data/dnd5e/open5e-cc-v1/catalog.js';

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function releaseId() {
  const configured = String(process.env.DND_WORLD_RELEASE || process.env.GITHUB_SHA || '').trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(configured)) return configured;
  const commit = String(execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })).trim().toLowerCase();
  invariant(/^[0-9a-f]{40}$/.test(commit), 'unable to resolve the release commit');
  return commit;
}

function renderPublishedIndex(source, release) {
  let rendered = source.replaceAll(RELEASE_PLACEHOLDER, release);
  const assets = [
    { attribute: 'href', path: 'styles.css' },
    ...runtimeFiles.map(name => ({ attribute: 'src', path: `scripts/${name}` })),
    { attribute: 'src', path: OPEN_CATALOG_PATH },
  ];

  for (const asset of assets) {
    const original = `${asset.attribute}="${asset.path}"`;
    invariant(rendered.includes(original), `index.html is missing published asset: ${asset.path}`);
    rendered = rendered.replaceAll(original, `${asset.attribute}="${PAGES_BASE}${asset.path}?release=${release}"`);
  }

  invariant(rendered.includes('<head>'), 'index.html is missing <head>');
  return rendered.replace('<head>', `<head>\n<base href="${PAGES_BASE}">`);
}

async function inspectTree(root) {
  let files = 0;
  let bytes = 0;

  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`GitHub Pages artifact must not contain symlinks: ${relative(repositoryRoot, absolute)}`);
      }
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files += 1;
        bytes += (await stat(absolute)).size;
      }
    }
  }

  await visit(root);
  return { files, bytes };
}

async function validateInputs() {
  const currentPath = join(dataRoot, 'current.json');
  const current = await readJson(currentPath);
  const version = String(current.catalogVersion || '');
  invariant(/^bg3-\d+-v\d+$/.test(version), 'current.json contains an invalid catalogVersion');
  invariant(current.manifest === `${version}/manifest.json`, 'current.json must pin the active catalog manifest');
  invariant(/^[0-9a-f]{64}$/.test(String(current.manifestSha256 || '')), 'current.json must pin the manifest SHA-256');

  const catalogRoot = join(dataRoot, version);
  const manifestPath = join(catalogRoot, 'manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  invariant(manifest.catalogVersion === version, 'active manifest catalogVersion does not match current.json');
  invariant(sha256(manifestBytes) === current.manifestSha256, 'active manifest SHA-256 does not match current.json');
  invariant(manifest.immutable === true, 'active catalog must be immutable');

  const uiRoot = join(dataRoot, 'ui');
  const uiNames = (await readdir(uiRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(`${version}-`))
    .map(entry => entry.name)
    .sort();
  const requiredUi = [`${version}-item-presentation`, `${version}-placement-browser`];
  for (const name of requiredUi) invariant(uiNames.includes(name), `missing current UI projection: ${name}`);

  for (const name of uiNames) {
    const uiManifest = await readJson(join(uiRoot, name, 'manifest.json'));
    invariant(uiManifest.catalogVersion === version, `${name} targets a different catalog version`);
  }

  const roots = [
    join(repositoryRoot, 'assets'),
    join(repositoryRoot, 'data', 'rulesets'),
    join(repositoryRoot, 'data', 'catalogs'),
    join(repositoryRoot, 'data', 'dnd5e'),
    catalogRoot,
    ...uiNames.map(name => join(uiRoot, name)),
  ];
  const measurements = await Promise.all(roots.map(inspectTree));
  const indexPath = join(repositoryRoot, 'index.html');
  const indexSource = await readFile(indexPath, 'utf8');
  invariant(indexSource.includes(RELEASE_PLACEHOLDER), 'index.html is missing the release placeholder');
  const indexBytes = Buffer.byteLength(indexSource);
  const styleBytes = (await stat(join(repositoryRoot, 'styles.css'))).size;
  const currentBytes = (await stat(currentPath)).size;
  const runtimeBytes = (await Promise.all(runtimeFiles.map(name => stat(join(repositoryRoot, 'scripts', name))))).reduce((sum, row) => sum + row.size, 0);
  const bytes = measurements.reduce((sum, row) => sum + row.bytes, indexBytes + styleBytes + currentBytes + runtimeBytes);
  const files = measurements.reduce((sum, row) => sum + row.files, 6 + runtimeFiles.length);
  invariant(bytes < 10_000_000_000, 'current Pages artifact exceeds the 10 GB upload limit');

  return { currentPath, version, catalogRoot, uiRoot, uiNames, files, bytes, indexSource, release: releaseId() };
}

async function buildSite(inputs) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(join(outputRoot, 'data', 'bg3', 'ui'), { recursive: true });
  await mkdir(join(outputRoot, 'releases', inputs.release), { recursive: true });
  await mkdir(join(outputRoot, 'scripts'), { recursive: true });
  const renderedIndex = renderPublishedIndex(inputs.indexSource, inputs.release);
  await writeFile(join(outputRoot, 'index.html'), renderedIndex);
  await writeFile(join(outputRoot, 'releases', inputs.release, 'index.html'), renderedIndex);
  await writeFile(join(outputRoot, 'release.json'), `${JSON.stringify({
    schemaVersion: 'dnd-world-release/1',
    commit: inputs.release,
    catalogVersion: inputs.version,
  }, null, 2)}\n`);
  await cp(join(repositoryRoot, 'styles.css'), join(outputRoot, 'styles.css'));
  for (const name of runtimeFiles) await cp(join(repositoryRoot, 'scripts', name), join(outputRoot, 'scripts', name));
  await cp(join(repositoryRoot, 'assets'), join(outputRoot, 'assets'), { recursive: true });
  await cp(join(repositoryRoot, 'data', 'rulesets'), join(outputRoot, 'data', 'rulesets'), { recursive: true });
  await cp(join(repositoryRoot, 'data', 'catalogs'), join(outputRoot, 'data', 'catalogs'), { recursive: true });
  await cp(join(repositoryRoot, 'data', 'dnd5e'), join(outputRoot, 'data', 'dnd5e'), { recursive: true });
  await cp(inputs.currentPath, join(outputRoot, 'data', 'bg3', 'current.json'));
  await cp(inputs.catalogRoot, join(outputRoot, 'data', 'bg3', inputs.version), { recursive: true });
  for (const name of inputs.uiNames) {
    await cp(join(inputs.uiRoot, name), join(outputRoot, 'data', 'bg3', 'ui', name), { recursive: true });
  }
  await writeFile(join(outputRoot, '.nojekyll'), '');
}

const inputs = await validateInputs();
if (!checkOnly) await buildSite(inputs);
process.stdout.write(`${JSON.stringify({
  status: checkOnly ? 'verified' : 'built',
  release: inputs.release,
  catalogVersion: inputs.version,
  output: checkOnly ? null : relative(repositoryRoot, outputRoot).replaceAll('\\', '/'),
  files: inputs.files,
  bytes: inputs.bytes,
  runtime: runtimeFiles.map(name => `scripts/${name}`),
  ui: inputs.uiNames,
}, null, 2)}\n`);
