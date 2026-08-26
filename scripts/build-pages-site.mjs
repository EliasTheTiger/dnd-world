import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(repositoryRoot, 'data', 'bg3');
const outputRoot = join(repositoryRoot, '_site');
const checkOnly = process.argv.slice(2).includes('--check');

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
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
    catalogRoot,
    ...uiNames.map(name => join(uiRoot, name)),
  ];
  const measurements = await Promise.all(roots.map(inspectTree));
  const indexBytes = (await stat(join(repositoryRoot, 'index.html'))).size;
  const currentBytes = (await stat(currentPath)).size;
  const bytes = measurements.reduce((sum, row) => sum + row.bytes, indexBytes + currentBytes);
  const files = measurements.reduce((sum, row) => sum + row.files, 3);
  invariant(bytes < 10_000_000_000, 'current Pages artifact exceeds the 10 GB upload limit');

  return { currentPath, version, catalogRoot, uiRoot, uiNames, files, bytes };
}

async function buildSite(inputs) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(join(outputRoot, 'data', 'bg3', 'ui'), { recursive: true });
  await cp(join(repositoryRoot, 'index.html'), join(outputRoot, 'index.html'));
  await cp(join(repositoryRoot, 'assets'), join(outputRoot, 'assets'), { recursive: true });
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
  catalogVersion: inputs.version,
  output: checkOnly ? null : relative(repositoryRoot, outputRoot).replaceAll('\\', '/'),
  files: inputs.files,
  bytes: inputs.bytes,
  ui: inputs.uiNames,
}, null, 2)}\n`);
