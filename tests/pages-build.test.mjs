import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('Pages build validates and publishes only the current immutable catalog', () => {
  const result = spawnSync(process.execPath, ['scripts/build-pages-site.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.match(report.catalogVersion, /^bg3-\d+-v\d+$/);
  assert.equal(report.status, 'verified');
  assert.ok(report.ui.includes(`${report.catalogVersion}-item-presentation`));
  assert.ok(report.ui.includes(`${report.catalogVersion}-placement-browser`));

  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node scripts\/build-pages-site\.mjs/);
});
