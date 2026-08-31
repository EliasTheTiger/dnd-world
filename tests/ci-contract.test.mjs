import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
const testFiles = fs.readdirSync(path.join(root, 'tests')).filter(name => /\.test\.(?:mjs|cjs)$/.test(name)).sort();

test('Pages deployment is gated by the complete discovered Node test suite', () => {
  assert.match(workflow, /\n  test:\n/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /run:\s*node --test tests\/\*\.test\.\*/);
  assert.match(workflow, /\n  build:\n    needs: test\n/);
  assert.ok(testFiles.length >= 20, `expected the complete suite, found ${testFiles.length}`);
  assert.equal(new Set(testFiles).size, testFiles.length);
});

test('deploy still depends on the gated build artifact', () => {
  assert.match(workflow, /\n  deploy:[\s\S]*?needs: build/);
});
