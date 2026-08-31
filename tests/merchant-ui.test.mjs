import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('merchant runtime and UI are wired into navigation and Pages state',()=>{
  assert.match(html,/<script src="scripts\/merchant-core\.js"><\/script>/);
  assert.match(html,/data-tab="merchants"/);
  assert.match(html,/id="tab-merchants"/);
  assert.match(html,/function renderMerchants\(\)/);
  assert.match(html,/function merchantCreate\(\)/);
  assert.match(html,/function merchantBuy\(itemId\)/);
  assert.match(html,/function merchantSell\(\)/);
});

test('merchant state participates in snapshot, export, import and BG3 hydration',()=>{
  assert.match(html,/harvestedSources,\s*economyState,\s*merchantState,\s*worldState,[^}]*catalogRefs/);
  assert.match(html,/persist\('dndworld2:merchant-state',merchantState\)/);
  assert.match(html,/merchantState=normalizeMerchantState\(data\.merchantState\)/);
  assert.match(html,/chars,\s*journal,\s*combat,\s*harvestedSources,\s*economyState,\s*merchantState,[^}]*items:/);
  assert.match(html,/merchantState&&merchantState\.instances\|\|\[\]\)\.forEach\(instance=>walk\(instance\.inventory\)\)/);
});

test('merchant UI exposes manual stock, money, price, availability and relationship controls',()=>{
  for(const functionName of ['merchantSetMoney','merchantSetMultiplier','merchantSetStockQty','merchantToggleAvailability','merchantAddStock','merchantRelationshipSave','merchantRestock'])
    assert.match(html,new RegExp('function '+functionName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\('));
  assert.match(html,/Явно разрешить мастеру покрыть нехватку/);
  assert.match(html,/Разрешение, автор и причина будут записаны в журнале/);
  assert.match(html,/Item ID:/);
});
