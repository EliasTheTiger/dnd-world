import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

function measureTree(directory) {
  let files = 0, bytes = 0;
  for (const entry of readdirSync(directory, {withFileTypes:true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = measureTree(path);
      files += nested.files;
      bytes += nested.bytes;
    } else {
      files++;
      bytes += statSync(path).size;
    }
  }
  return {files, bytes};
}

test('Pages build validates and publishes only the current immutable catalog', () => {
  const release = '1234567890abcdef1234567890abcdef12345678';
  const result = spawnSync(process.execPath, ['scripts/build-pages-site.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, DND_WORLD_RELEASE: release},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.match(report.catalogVersion, /^bg3-\d+-v\d+$/);
  assert.equal(report.status, 'verified');
  assert.equal(report.release, release);
  assert.deepEqual(report.runtime, ['scripts/economy-core.js', 'scripts/merchant-core.js', 'scripts/campaign-item-art.js', 'scripts/item-domain-model.js', 'scripts/definition-repository.js', 'scripts/ruleset-registry.js', 'scripts/persistence-core.js', 'scripts/action-kernel.js', 'scripts/chest-core.js', 'scripts/catalog-governance.js', 'scripts/world-state-core.js', 'scripts/ui-action-contract.js', 'scripts/projection-cache.js', 'scripts/public-item-surface.js', 'scripts/item-player-copy.js', 'scripts/character-rules.js', 'scripts/magic-rules.js', 'scripts/grimoire-rules.js', 'scripts/hobbyworld-ability-terms.js', 'scripts/ability-rules.js', 'scripts/ability-gameplay.js', 'scripts/recipe-item-links.js', 'scripts/recipe-rules.js', 'scripts/recipe-workbench.js', 'scripts/recipe-tabletop-rules.js', 'scripts/recipe-tabletop-items.js', 'scripts/recipe-tabletop-runtime.js', 'scripts/arcanum-core.js', 'scripts/arcanum-conditions.js', 'scripts/arcanum-summons.js', 'scripts/arcanum-runtime.js', 'scripts/arcanum-long-cast.js', 'scripts/gm-reference-data.js', 'scripts/gm-reference.js', 'scripts/world-navigation.js', 'scripts/dialog-accessibility.js', 'scripts/action-ui-guard.js']);
  assert.ok(report.runtime.includes('scripts/ability-gameplay.js'));
  assert.ok(report.runtime.includes('scripts/world-navigation.js'));
  assert.ok(report.ui.includes(`${report.catalogVersion}-item-presentation`));
  assert.ok(report.ui.includes(`${report.catalogVersion}-placement-browser`));
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /href="styles\.css"/);

  const build = spawnSync(process.execPath, ['scripts/build-pages-site.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, DND_WORLD_RELEASE: release},
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const builtReport = JSON.parse(build.stdout);
  const measured = measureTree(fileURLToPath(new URL('../_site/', import.meta.url)));
  assert.equal(builtReport.files, measured.files, 'report must count every published file');
  assert.equal(builtReport.bytes, measured.bytes, 'report must count rendered indexes, release manifest and all styles');
  assert.equal(report.files, builtReport.files);
  assert.equal(report.bytes, builtReport.bytes);
  assert.equal(existsSync(new URL('../_site/docs', import.meta.url)), false, 'per-item engineering and authoring records must not be deployed');
  for (const path of ['qa', 'tests', `data/bg3/${report.catalogVersion}/item-economy-report.json`, `data/bg3/${report.catalogVersion}/item-mechanics-report.md`, `data/bg3/${report.catalogVersion}/story-items-report.json`]) {
    assert.equal(existsSync(new URL(`../_site/${path}`, import.meta.url)), false, `${path} stays in GitHub, outside the public release`);
  }
  const builtIndex = readFileSync(new URL('../_site/index.html', import.meta.url), 'utf8');
  const versionedIndex = readFileSync(new URL(`../_site/releases/${release}/index.html`, import.meta.url), 'utf8');
  const releaseManifest = JSON.parse(readFileSync(new URL('../_site/release.json', import.meta.url), 'utf8'));
  assert.equal(builtIndex, versionedIndex);
  assert.match(builtIndex, new RegExp(`href="/dnd-world/styles/treasure-workspaces\\.css\\?release=${release}"`));
  assert.match(builtIndex, new RegExp(`href="/dnd-world/styles/gm-reference\\.css\\?release=${release}"`));
  assert.match(readFileSync(new URL('../_site/styles/treasure-workspaces.css', import.meta.url), 'utf8'), /\.trade-workspace/);
  assert.doesNotMatch(builtIndex, /__DND_WORLD_RELEASE__/);
  assert.match(builtIndex, new RegExp(`<meta name="dnd-world-release" content="${release}">`));
  assert.match(builtIndex, /<base href="\/dnd-world\/">/);
  assert.match(builtIndex, new RegExp(`href="/dnd-world/styles\\.css\\?release=${release}"`));
  for (const path of [...report.runtime, 'data/dnd5e/open5e-cc-v1/catalog.js', 'data/dnd5e/srd51-spell-facts.js']) {
    assert.match(builtIndex, new RegExp(`src="/dnd-world/${path.replaceAll('.', '\\.')}\\?release=${release}"`), `${path} must be release-addressed`);
  }
  for (const [, path] of builtIndex.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"?#]+\.(?:js|css))[^"]*"/gu)) {
    if (/^https?:/u.test(path)) continue;
    assert.ok(builtIndex.includes(`"${path}?release=${release}"`), `${path} must not retain stale assets after a release`);
  }
  assert.deepEqual(releaseManifest, {
    schemaVersion: 'dnd-world-release/1',
    commit: release,
    catalogVersion: report.catalogVersion,
  });

  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node scripts\/build-dnd5e-open-catalog\.mjs --check/);
  assert.match(workflow, /node scripts\/build-pages-site\.mjs/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
});

test('Pages preflight rejects a missing runtime tag without replacing the previous build', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'dnd-world-pages-preflight-'));
  t.after(() => rmSync(fixture, {recursive:true, force:true}));
  const write = (path, content) => {
    const target = join(fixture, path);
    mkdirSync(dirname(target), {recursive:true});
    writeFileSync(target, content);
  };
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tags = [...source.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="((?:scripts\/|styles\/|data\/)[^"?#]+\.(?:js|css)|styles\.css)"[^>]*>/gu)];
  for (const [, path] of tags) write(path, '/* fixture asset */');
  for (const directory of ['assets', 'data/rulesets', 'data/catalogs']) mkdirSync(join(fixture, directory), {recursive:true});
  const version = 'bg3-1-v1', manifest = JSON.stringify({catalogVersion:version, immutable:true});
  write(`data/bg3/${version}/manifest.json`, manifest);
  write('data/bg3/current.json', JSON.stringify({catalogVersion:version, manifest:`${version}/manifest.json`, manifestSha256:createHash('sha256').update(manifest).digest('hex')}));
  for (const projection of ['item-presentation', 'placement-browser']) write(`data/bg3/ui/${version}-${projection}/manifest.json`, JSON.stringify({catalogVersion:version}));
  const privatePaths = ['assets/saved-audit.html', 'data/catalogs/tests/snapshot.json', `data/bg3/${version}/item-economy-report.json`, `data/bg3/${version}/item-economy-report.md`, `data/bg3/ui/${version}-item-presentation/diagnostics/result.json`];
  for (const path of privatePaths) write(path, 'historical diagnostic evidence');
  const runtimePaths = [`data/bg3/${version}/mechanics-coverage.json`, `data/bg3/${version}/rule-program-coverage.json`, `data/bg3/${version}/source/gold-values.json`, 'data/dnd5e/SRD51-NOTICE.md'];
  for (const path of runtimePaths) write(path, 'required runtime contract or notice');
  const index = `<head><meta name="dnd-world-release" content="__DND_WORLD_RELEASE__">${tags.map(([tag])=>tag).join('\n')}</head>`;
  write('index.html', index);
  copyFileSync(new URL('../scripts/build-pages-site.mjs', import.meta.url), join(fixture, 'scripts/build-pages-site.mjs'));
  write('_site/index.html', 'previous working release');
  const run = (...args) => spawnSync(process.execPath, ['scripts/build-pages-site.mjs', ...args], {
    cwd:fixture, encoding:'utf8', env:{...process.env, DND_WORLD_RELEASE:'1234567890abcdef1234567890abcdef12345678'},
  });
  const valid = run('--check');
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  const published = run();
  assert.equal(published.status, 0, published.stderr || published.stdout);
  assert.deepEqual(measureTree(join(fixture, '_site')), (({files,bytes})=>({files,bytes}))(JSON.parse(published.stdout)));
  for (const path of privatePaths) {
    assert.equal(existsSync(join(fixture, '_site', path)), false, `${path} must not be published`);
    assert.equal(readFileSync(join(fixture, path), 'utf8'), 'historical diagnostic evidence', `${path} must remain in the repository`);
  }
  for (const path of runtimePaths) assert.equal(readFileSync(join(fixture, '_site', path), 'utf8'), 'required runtime contract or notice');
  write('_site/index.html', 'previous working release');
  write('index.html', index.replace('src="scripts/economy-core.js"', 'data-missing="scripts/economy-core.js"'));
  for (const args of [['--check'], []]) {
    const result = run(...args);
    assert.notEqual(result.status, 0, 'a missing runtime asset must fail preflight');
    assert.match(result.stderr, /index\.html is missing published asset: scripts\/economy-core\.js/u);
    assert.equal(readFileSync(join(fixture, '_site/index.html'), 'utf8'), 'previous working release');
  }
});

test('cached canonical page replaces itself with the newly deployed versioned release', async () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const bootstrap = source.match(/<script data-release-bootstrap>\s*([\s\S]*?)<\/script>/u)?.[1];
  assert.ok(bootstrap, 'release bootstrap');
  const oldRelease = '1111111111111111111111111111111111111111';
  const newRelease = '2222222222222222222222222222222222222222';
  const written = [];
  const requests = [];
  const context = {
    URL,
    location: {hostname: 'eliasthetiger.github.io', origin: 'https://eliasthetiger.github.io', href: 'https://eliasthetiger.github.io/dnd-world/'},
    document: {
      open() { written.push('open'); },
      write(value) { written.push(value); },
      close() { written.push('close'); },
    },
    fetch: async url => {
      requests.push(String(url));
      if (String(url).endsWith('/dnd-world/release.json')) return {ok: true, json: async () => ({schemaVersion: 'dnd-world-release/1', commit: newRelease})};
      return {ok: true, text: async () => `<meta name="dnd-world-release" content="${newRelease}"><main>new release</main>`};
    },
  };
  context.globalThis = context;
  vm.runInNewContext(bootstrap.replaceAll('__DND_WORLD_RELEASE__', oldRelease), context);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(requests, [
    'https://eliasthetiger.github.io/dnd-world/release.json',
    `https://eliasthetiger.github.io/dnd-world/releases/${newRelease}/index.html`,
  ]);
  assert.ok(requests.every(url => new URL(url).origin === context.location.origin), 'release bootstrap must not depend on a rate-limited cross-origin API');
  assert.equal(written[0], 'open');
  assert.match(written[1], /new release/);
  assert.equal(written[2], 'close');
});
