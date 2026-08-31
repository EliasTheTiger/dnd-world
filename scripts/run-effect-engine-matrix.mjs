import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const file = process.argv[2] || 'tests/effect-engine.test.mjs';
const shardSize = Math.max(1, Number.parseInt(process.env.DND_EFFECT_TEST_SHARD_SIZE || '25', 10) || 25);
const requestedStart = Math.max(0, Number.parseInt(process.env.DND_EFFECT_TEST_START_INDEX || '0', 10) || 0);
const requestedEnd = Number.parseInt(process.env.DND_EFFECT_TEST_END_INDEX || '', 10);
const timeoutMs = Math.max(60_000, Number.parseInt(process.env.DND_EFFECT_TEST_TIMEOUT_MS || '3600000', 10) || 3_600_000);
const source = readFileSync(file, 'utf8');
const names = [];

for (const line of source.split(/\r?\n/)) {
  if (!line.startsWith('test(')) continue;
  const match = line.match(/^test\((['"`])((?:\\.|(?!\1).)*)\1/);
  assert.ok(match, `Не удалось извлечь имя теста: ${line.slice(0, 160)}`);
  names.push(match[2].replace(/\\(['"`\\])/g, '$1'));
}

assert.ok(names.length >= 500, `Матрица должна содержать не менее 500 тестов, найдено ${names.length}`);
assert.equal(new Set(names).size, names.length, 'Имена developer-тестов должны быть уникальны для точного шардирования');
const startIndex = Math.min(requestedStart, names.length);
const endIndex = Math.min(Number.isFinite(requestedEnd) ? Math.max(startIndex, requestedEnd) : names.length, names.length);
const selectedNames = names.slice(startIndex, endIndex);
assert.ok(selectedNames.length, `Пустой диапазон developer-матрицы: ${startIndex}..${endIndex}`);

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let passed = 0;
const startedAt = Date.now();

for (let offset = startIndex, shard = 1; offset < endIndex; offset += shardSize, shard++) {
  const selected = names.slice(offset, Math.min(offset + shardSize, endIndex));
  const pattern = `^(?:${selected.map(escapeRegExp).join('|')})$`;
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=spec', `--test-name-pattern=${pattern}`, file],
    {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs});
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const passMatch = output.match(/(?:ℹ|#)\s*pass\s+(\d+)/);
  const failMatch = output.match(/(?:ℹ|#)\s*fail\s+(\d+)/);
  const shardPassed = passMatch ? Number(passMatch[1]) : 0;
  const shardFailed = failMatch ? Number(failMatch[1]) : (result.status === 0 ? 0 : 1);
  if (result.error || result.status !== 0 || shardPassed !== selected.length || shardFailed !== 0) {
    process.stderr.write(`\n✕ developer shard ${shard}: ожидалось ${selected.length}, зелёных ${shardPassed}, ошибок ${shardFailed}\n`);
    process.stderr.write(output);
    if (result.error) process.stderr.write(`\n${result.error.stack || result.error}\n`);
    process.exit(1);
  }
  passed += shardPassed;
  process.stdout.write(`✓ developer shard ${shard}: ${shardPassed}/${selected.length} · сегмент ${passed}/${selectedNames.length} · матрица ${offset + selected.length}/${names.length}\n`);
}

assert.equal(passed, selectedNames.length);
process.stdout.write(`✓ developer matrix segment: ${passed}/${selectedNames.length} зелёных · индексы ${startIndex + 1}–${endIndex} из ${names.length} · ${((Date.now() - startedAt) / 1000).toFixed(1)} с\n`);
