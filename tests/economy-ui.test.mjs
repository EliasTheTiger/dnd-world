import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('inventory exposes journal integrity verification to the GM',()=>{
  assert.match(html,/function economyVerifyJournal\(\)/);
  assert.match(html,/onclick="economyVerifyJournal\(\)"[^>]*>Проверить журнал<\/button>/);
  assert.match(html,/service\.verifyJournal\(\)/);
  assert.match(html,/журнал цел/);
});

test('inventory journal shows an account statement and duplicate-request protection',()=>{
  assert.match(html,/service\.accountStatement\(accountId\)/);
  assert.match(html,/чистое изменение/);
  assert.match(html,/защита повтора/);
  assert.match(html,/idempotencyKey/);
  assert.match(html,/character-wallet-adjust:/);
  assert.match(html,/character-wallet-change:/);
  assert.match(html,/character-wallet-exchange:/);
  assert.match(html,/merchant-wallet-adjust:/);
});
