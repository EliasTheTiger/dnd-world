import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import merchants from '../scripts/merchant-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
import {localCampaignFixture} from './helpers/local-campaign-fixture.mjs';

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

test('merchant state participates in local snapshots and BG3 hydration',()=>{
  assert.match(html,/harvestedSources,\s*economyState,\s*merchantState,\s*worldState,[^}]*catalogRefs/);
  assert.match(html,/persist\('dndworld2:merchant-state',merchantState,statusVersion\)/);
  assert.match(html,/merchantState&&merchantState\.instances\|\|\[\]\)\.forEach\(instance=>walk\(instance\.inventory\)\)/);
});

test('merchant stock, balances, prices and trade history survive local migration and restart',async()=>{
  const engine=loadRuntimeIntegrationEngine(),fixture=localCampaignFixture();
  fixture.snapshot.merchantState=merchants.normalizeState({instances:[{
    id:'kept-shop',templateId:'general-store',name:'Торговец текущей игры',revision:8,
    createdAt:'2026-10-21T00:00:00.000Z',updatedAt:'2026-10-22T00:00:00.000Z',
    inventory:[{itemId:'kept-item',quantity:7,available:false,buyPriceOverrideMinor:'213',salePriceOverrideMinor:'97'}],
    wallet:{id:'merchant:kept-shop',ruleset:'dnd5e-2014',version:4,balances:{zm:'31',mm:'2'}},
    priceMultipliers:{purchaseBasisPoints:'13500',saleBasisPoints:'4500'},
    relationships:{char_septih:{notes:'Долг за провизию'}},overdraftMinor:'125'
  }],transactions:[{schemaVersion:merchants.MERCHANT_TRANSACTION_SCHEMA,id:'kept-trade',actorId:'char_septih',itemId:'kept-item',quantity:2}]});
  await engine.storeSet('dndworld2:world-snapshot',JSON.stringify(fixture.snapshot));
  await engine.loadAll();
  const actual=()=>JSON.parse(JSON.stringify(engine.economyApi.state().merchantState));
  assert.deepEqual(actual(),fixture.snapshot.merchantState);
  assert.equal(await engine.saveWorldNow(),true);
  assert.deepEqual(JSON.parse(await engine.storeGet('dndworld2:merchant-state')),fixture.snapshot.merchantState);
  await engine.loadAll();
  assert.deepEqual(actual(),fixture.snapshot.merchantState);
});

test('merchant UI exposes manual stock, money, price, availability and relationship controls',()=>{
  for(const functionName of ['merchantSetMoney','merchantSetMultiplier','merchantSetStockQty','merchantToggleAvailability','merchantAddStock','merchantRelationshipSave','merchantRestock'])
    assert.match(html,new RegExp('function '+functionName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\('));
  assert.match(html,/Явно разрешить мастеру покрыть нехватку/);
  assert.match(html,/Разрешение, автор и причина будут записаны в журнале/);
  assert.match(html,/function merchantSellPreview\(/);
  assert.match(html,/function merchantBuyPreview\(/);
  assert.match(html,/function tradePicker\(/);
});
