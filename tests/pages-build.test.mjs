import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

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
  assert.deepEqual(report.runtime, ['scripts/economy-core.js', 'scripts/merchant-core.js', 'scripts/item-domain-model.js', 'scripts/definition-repository.js', 'scripts/ruleset-registry.js', 'scripts/persistence-core.js', 'scripts/action-kernel.js', 'scripts/chest-core.js', 'scripts/catalog-governance.js', 'scripts/world-state-core.js', 'scripts/ui-action-contract.js', 'scripts/projection-cache.js', 'scripts/public-item-surface.js']);
  assert.ok(report.ui.includes(`${report.catalogVersion}-item-presentation`));
  assert.ok(report.ui.includes(`${report.catalogVersion}-placement-browser`));
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /href="styles\.css"/);

  const build = spawnSync(process.execPath, ['scripts/build-pages-site.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, DND_WORLD_RELEASE: release},
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const builtIndex = readFileSync(new URL('../_site/index.html', import.meta.url), 'utf8');
  const versionedIndex = readFileSync(new URL(`../_site/releases/${release}/index.html`, import.meta.url), 'utf8');
  const releaseManifest = JSON.parse(readFileSync(new URL('../_site/release.json', import.meta.url), 'utf8'));
  assert.equal(builtIndex, versionedIndex);
  assert.doesNotMatch(builtIndex, /__DND_WORLD_RELEASE__/);
  assert.match(builtIndex, new RegExp(`<meta name="dnd-world-release" content="${release}">`));
  assert.match(builtIndex, /<base href="\/dnd-world\/">/);
  assert.match(builtIndex, new RegExp(`href="/dnd-world/styles\\.css\\?release=${release}"`));
  for (const path of [...report.runtime, 'data/dnd5e/open5e-cc-v1/catalog.js']) {
    assert.match(builtIndex, new RegExp(`src="/dnd-world/${path.replaceAll('.', '\\.')}\\?release=${release}"`), `${path} must be release-addressed`);
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
