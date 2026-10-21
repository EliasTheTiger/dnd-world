import assert from 'node:assert/strict';
import test from 'node:test';
import Economy from '../scripts/economy-core.js';
import Merchants from '../scripts/merchant-core.js';
import Recipes from '../scripts/recipe-rules.js';
import Chests from '../scripts/chest-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function serviceWorld() {
  const item={id:'rope',n:'Rope',type:'equipment',tags:['rope'],rarity:'common'};
  const operations=[],transactions=[],economy=new Economy.CurrencyService({journal:operations});
  let seq=0;
  const service=new Merchants.MerchantService({economy,itemResolver:id=>id===item.id?item:null,listItems:()=>[item],priceResolver:()=>({ok:true,amountMinor:'100'}),journal:transactions,idFactory:()=>String(++seq)});
  const shop=service.createInstance('general-store',{id:'shop'}),actor={id:'hero',inventory:[],equipment:{}},account=Economy.createWallet('hero','dnd5e-2014',{zm:'100'});
  const input={instance:shop,character:actor,characterAccount:account,itemId:item.id,quantity:1,requestId:'request'};
  return {item,operations,transactions,economy,service,shop,actor,account,input};
}
const snapshot=w=>JSON.stringify({actor:w.actor,account:w.account,shop:w.shop,operations:w.operations,transactions:w.transactions});

test('purchased items never inherit a personalized instance state',async()=>{
  for(const properties of [{charges:0},{att:true},{notes:'Gift'},{bg3Dye:{color:'red'}},{recipeCooldowns:{shot:'long'}},{inside:'bag'},{valueCp:'200'}]) {
    const w=serviceWorld(),special={id:'special',itemId:'rope',qty:1,notes:'',...properties};w.actor.inventory=[special];w.actor.equipment.MAIN_HAND=special.id;
    const before=JSON.stringify(special),result=await w.service.buy(w.input);
    assert.equal(result.ok,true,result.message);assert.equal(JSON.stringify(special),before);assert.equal(w.actor.inventory.length,2);assert.equal(w.actor.equipment.MAIN_HAND,'special');
    assert.equal(w.actor.inventory[1].qty,1);
  }
});

test('oversized stacks and fractional or coerced trade quantities never transfer money or stock',async()=>{
  for(const quantity of [0,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,true,{},[],'']) {
    const w=serviceWorld(),before=snapshot(w),result=await w.service.buy({...w.input,quantity});
    assert.equal(result.ok,false,String(quantity));assert.equal(snapshot(w),before);
  }
  for(const side of ['buy','sell']) {
    const w=serviceWorld();
    w.actor.inventory=[{id:'owned',itemId:'rope',qty:side==='buy'?Number.MAX_SAFE_INTEGER:1,notes:''}];
    if(side==='sell'){w.shop.inventory[0].quantity=Number.MAX_SAFE_INTEGER;w.actor.equipment.MAIN_HAND='owned';}
    const before=snapshot(w),result=await w.service[side](w.input);
    assert.equal(result.ok,false);assert.equal(snapshot(w),before,'overflow restores wallet, equipment, stock and both journals');
  }
  for(const invalid of [0.5,NaN,true,'bad']){
    const w=serviceWorld();w.actor.inventory=[{id:'owned',itemId:'rope',qty:invalid}];const before=snapshot(w);
    assert.equal((await w.service.sell(w.input)).ok,false);assert.equal(snapshot(w),before);
  }
});

function runtimeWorld() {
  const e=loadRuntimeIntegrationEngine(new URL('../',import.meta.url)),actor=e.buildBlank();actor.id='hero';actor.name='Герой';actor.hp=20;actor.inventory=[];actor.equipment={};actor.coins={mm:'0',sm:'0',em:'0',zm:'10',pm:'0'};
  const item={id:'it_test_rope',n:'Верёвка',type:'equipment',tags:['rope'],rarity:'обычный',cost:'1 зм',custom:true};e.itemsApi.upgrade(item);
  e.setState({chars:[actor],items:[item],activeCharId:actor.id});e.economyApi.quiet();e.economyApi.dialogs(()=> 'Проверка мастера');
  const shop=e.economyApi.createMerchant('general-store',actor.id);e.setElementValue('merchantBuyQty_'+e.economyApi.domKey(item.id),1);
  const state=()=>JSON.stringify({chars:e.state().chars,...e.economyApi.state()});
  return {e,actor,item,shop,state};
}

test('production merchant purchase and sale restore every balance, item and journal on failed persistence',async()=>{
  for(const kind of ['buy','sell']) {
    const {e,actor,item,shop,state}=runtimeWorld();
    if(kind==='sell'){actor.inventory.push({id:'owned',itemId:item.id,qty:1,notes:''});actor.equipment.MAIN_HAND='owned';e.setElementValue('merchantSellItem','owned');e.setElementValue('merchantSellQty',1);}
    const before=state(),wallet=shop.wallet,inventory=actor.inventory;
    let saves=0;e.economyApi.saveWith(async()=>{saves++;return false;});
    if(kind==='buy')await e.economyApi.buy(item.id);else await e.economyApi.sell();
    assert.equal(saves,1);assert.equal(state(),before);assert.equal(shop.wallet,wallet);assert.equal(actor.inventory,inventory);
    assert.match(e.elementText('saveStatus'),/сохранить|восстановлены/);
  }
});

test('production duplicate purchase remains locked until the durable save finishes',async()=>{
  const {e,item,actor,shop}=runtimeWorld(),beforeStock=shop.inventory[0].quantity;let release,started;
  const saving=new Promise(resolve=>{started=resolve;});
  e.economyApi.saveWith(()=>{started();return new Promise(resolve=>{release=resolve;});});
  const first=e.economyApi.buy(item.id);await saving;await e.economyApi.buy(item.id);
  assert.match(e.economyApi.tradeHTML(),/aria-busy="true"/);
  assert.match(e.economyApi.tradeHTML(),/Сохраняем сделку/,'pending purchase must explain why another click cannot start');
  assert.equal(e.economyApi.state().merchantState.transactions.length,1);assert.equal(actor.inventory[0].qty,1);
  release(true);await first;assert.equal(e.economyApi.state().economyState.operations.length,1);
  assert.equal(shop.inventory[0].quantity,beforeStock-1);
  assert.match(e.economyApi.tradeHTML(),/aria-busy="false"/);
});

test('merchant rendering failure cannot undo a saved purchase or leave the transaction locked',async()=>{
  const {e,item,actor,shop}=runtimeWorld(),beforeStock=shop.inventory[0].quantity;let saves=0;
  e.economyApi.saveWith(async()=>{saves++;return true;});e.economyApi.merchantRenderer(()=>{throw new Error('injected renderer failure');});
  await e.economyApi.buy(item.id);
  assert.equal(saves,1);assert.equal(actor.inventory[0].qty,1);assert.equal(shop.inventory[0].quantity,beforeStock-1);
  assert.equal(e.economyApi.state().merchantState.transactions.length,1);assert.match(e.elementText('saveStatus'),/Не удалось обновить окно/);
  await e.economyApi.buy(item.id);
  assert.equal(saves,2);assert.equal(actor.inventory[0].qty,2);assert.equal(shop.inventory[0].quantity,beforeStock-2);
});

test('production trades reject empty stock and cancelled overdrafts; completed sales unequip only the sold entry',async()=>{
  const {e,actor,item,shop,state}=runtimeWorld();let saves=0;e.economyApi.saveWith(async()=>{saves++;return true;});
  shop.inventory[0].quantity=0;let before=state();await e.economyApi.buy(item.id);assert.equal(state(),before);assert.equal(saves,0);
  actor.inventory=[{id:'sell',itemId:item.id,qty:1},{id:'keep',itemId:item.id,qty:1,notes:'Запасная'}];actor.equipment={MAIN_HAND:'sell',OFF_HAND:'keep'};
  e.setElementValue('merchantSellItem','sell');e.setElementValue('merchantSellQty',1);shop.wallet.balances={};before=state();e.economyApi.dialogs(()=> 'Причина',()=>false);
  await e.economyApi.sell();assert.equal(state(),before);assert.equal(saves,0);
  shop.wallet.balances={zm:'10'};await e.economyApi.sell();assert.equal(saves,1);assert.equal(actor.equipment.MAIN_HAND,undefined);assert.equal(actor.equipment.OFF_HAND,'keep');assert.equal(actor.inventory.length,1);assert.equal(actor.inventory[0].id,'keep');
});

test('manual wallets, merchant till and denomination exchange roll back failed saves and respect cancellation',async()=>{
  for(const action of ['coin','till','change','exchange']) {
    const {e,actor,state}=runtimeWorld();actor.coins.mm='150';
    if(action==='exchange'){e.economyApi.exchangeOpen();e.setElementValue('economyExchangeFrom','zm');e.setElementValue('economyExchangeTo','sm');e.setElementValue('economyExchangeAmount','1');e.setElementValue('economyExchangeReason','Размен');}
    const before=state();let saves=0;e.economyApi.saveWith(async()=>{saves++;return false;});
    if(action==='coin')await e.economyApi.coin('zm','25');
    if(action==='till')await e.economyApi.merchantMoney('zm','25');
    if(action==='change')await e.economyApi.change();
    if(action==='exchange')assert.equal(await e.economyApi.exchange(),false);
    assert.equal(saves,1,action);assert.equal(state(),before,action);
  }
  const {e,state}=runtimeWorld(),before=state();e.economyApi.dialogs(()=>null);e.economyApi.saveWith(async()=>{assert.fail('cancel must not save');});
  assert.equal(await e.economyApi.coin('zm','25'),false);assert.equal(await e.economyApi.change(),false);await e.economyApi.merchantMoney('zm','25');assert.equal(state(),before);
});

function approvedChest(itemId) {
  const row=Chests.createChest({id:'cache',name:'Тайник',templateId:'wooden-cache'});row.state='opened';row.placement.placed=true;
  row.container.loot.status='approved';row.container.loot.approved={items:[{itemId,qty:1}],currency:{gp:2,totalCopper:200}};return Chests.normalizeChest(row);
}
test('chest claims preflight all awards and preserve individual item properties',()=>{
  const {e,actor,item,state}=runtimeWorld(),row=approvedChest(item.id),special={id:'special',itemId:item.id,qty:1,charges:0,att:true};actor.inventory.push(special);e.economyApi.setChests([row]);
  row.container.loot.approved.items.push({itemId:'missing-catalog-id',qty:1});const before=state();assert.throws(()=>e.economyApi.claim(row,actor),/не существует/);assert.equal(state(),before);
  row.container.loot.approved.items.pop();const checkpoint=e.economyApi.snapshot(),clean=state();e.economyApi.claim(row,actor);
  assert.equal(special.qty,1);assert.equal(actor.inventory.length,2);assert.equal(actor.coins.zm,'12');assert.equal(e.economyApi.state().economyState.operations.length,1);
  assert.equal(e.economyApi.claim(row,actor).items,0,'claimed chest cannot duplicate loot');
  e.economyApi.restore(checkpoint);assert.equal(state(),clean,'full rollback includes the money journal and chest receipt');
});

test('invalid chest coins and overflowing awards do not partially grant earlier items',()=>{
  for(const mode of ['coins','stack','fractional']){
    const {e,actor,item,state}=runtimeWorld(),row=approvedChest(item.id);e.economyApi.setChests([row]);
    if(mode==='coins')row.container.loot.approved.currency.gp=-1;
    if(mode==='stack')actor.inventory=[{id:'full',itemId:item.id,qty:Number.MAX_SAFE_INTEGER,notes:''}];
    if(mode==='fractional')row.container.loot.approved.items[0].qty=0.5;
    const before=state();assert.throws(()=>e.economyApi.claim(row,actor));assert.equal(state(),before);
  }
});

test('deleting an equipped container with contents leaves inventory and equipment intact',()=>{
  const {e,actor,item,state}=runtimeWorld();actor.inventory=[{id:'bag',itemId:item.id,qty:1},{id:'child',itemId:item.id,qty:1,inside:'bag'}];actor.equipment.MAIN_HAND='bag';const before=state();
  assert.equal(e.economyApi.remove('bag'),false);assert.equal(state(),before);assert.match(e.elementText('saveStatus'),/содержимое/);
});

test('crafting cannot orphan contained items or overflow the result stack',()=>{
  const recipe={id:'test-craft',inputs:[{ids:['input'],qty:1,operation:'Consume',label:'Основа'}],resultIds:['output'],resultQty:1};
  const actor={inventory:[{id:'bag',itemId:'input',qty:1},{id:'child',itemId:'coin',qty:1,inside:'bag'}],equipment:{MAIN_HAND:'bag'}},before=JSON.stringify(actor);
  assert.equal(Recipes.plan(recipe,actor).code,'CONTAINER_NOT_EMPTY');assert.equal(JSON.stringify(actor),before);
  actor.inventory=[{id:'input',itemId:'input',qty:1},{id:'output',itemId:'output',qty:Number.MAX_SAFE_INTEGER,notes:''}];
  assert.equal(Recipes.plan(recipe,actor).code,'QUANTITY_OVERFLOW');
});

test('craft output overflow follows the surviving stack after an earlier stack is fully consumed',()=>{
  const recipe={id:'repack',inputs:[{ids:['output'],qty:1,operation:'Consume',label:'Основа'}],resultIds:['output'],resultQty:2};
  const actor={inventory:[{id:'consumed',itemId:'output',qty:1},{id:'full',itemId:'output',qty:Number.MAX_SAFE_INTEGER}],equipment:{MAIN_HAND:'consumed'}};
  const before=JSON.stringify(actor);
  assert.equal(Recipes.plan(recipe,actor).code,'QUANTITY_OVERFLOW','the consumed entry is removed before the result merges into the next stack');
  assert.equal(JSON.stringify(actor),before,'rejection cannot consume the first stack or unequip it');
  actor.inventory[1].qty=Number.MAX_SAFE_INTEGER-2;
  assert.equal(Recipes.plan(recipe,actor).ok,true,'a surviving stack with exact capacity remains craftable');
  actor.inventory.pop();
  assert.equal(Recipes.plan(recipe,actor).ok,true,'when all old stacks are consumed the result creates a safe new stack');
});
