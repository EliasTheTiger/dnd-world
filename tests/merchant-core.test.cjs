const assert = require('node:assert/strict');
const test = require('node:test');
const Economy = require('../scripts/economy-core.js');
const Merchants = require('../scripts/merchant-core.js');

function fixture(options = {}) {
  let sequence = 0;
  const items = [
    {id:'item-rope',n:'Верёвка',type:'equipment',rarity:'обычный',tags:['general-goods','rope'],priceMinor:'100'},
    {id:'item-sword',n:'Меч',type:'weapon',rarity:'обычный',tags:['weapon'],priceMinor:'1500'},
    {id:'item-herb',n:'Солнечник',type:'equipment',rarity:'обычный',tags:['herb','herbalism'],priceMinor:'50'},
    {id:'item-scroll',n:'Свиток',type:'scroll',rarity:'необычный',tags:['scroll','magical'],priceMinor:'5000'},
  ];
  const byId = new Map(items.map(item => [item.id,item])), operations = [], transactions = options.transactions || [];
  const economy = new Economy.CurrencyService({
    currencies:Economy.DND5E_CURRENCIES,journal:operations,
    clock:() => '2026-08-30T17:00:00.000Z',idFactory:() => `money-${++sequence}`,
  });
  const service = new Merchants.MerchantService({
    economy,itemResolver:id => byId.get(id) || null,listItems:() => items,
    priceResolver:(item) => ({ok:true,amountMinor:item.priceMinor}),journal:transactions,
    clock:() => '2026-08-30T17:00:00.000Z',idFactory:() => `merchant-${++sequence}`,
  });
  return {items,byId,operations,transactions,economy,service};
}

function character(id, money) {
  return {
    actor:{id,name:id,inventory:[],equipment:{}},
    account:Economy.createWallet(`character:${id}`,Economy.DND5E_RULESET,money || {}),
  };
}

test('ten extensible base templates expose every required policy group', () => {
  assert.ok(Merchants.DEFAULT_MERCHANT_TEMPLATES.length >= 10);
  const professions = Merchants.DEFAULT_MERCHANT_TEMPLATES.map(row => row.profession);
  for (const expected of ['Трактирщик','Торговец общими товарами','Кузнец','Оружейник','Бронник','Травник','Алхимик','Торговец магическими предметами','Ювелир','Писец и продавец книг']) {
    assert.ok(professions.includes(expected), expected);
  }
  for (const row of Merchants.DEFAULT_MERCHANT_TEMPLATES) {
    assert.equal(row.schemaVersion,Merchants.MERCHANT_TEMPLATE_SCHEMA);
    assert.ok(row.merchantType);
    assert.ok(Array.isArray(row.buyCategories));
    assert.ok(Array.isArray(row.sellCategories));
    assert.ok(Array.isArray(row.initialStock));
    assert.ok(row.startingFunds && row.pricingRules && row.rarity && row.restockRules && row.restrictions);
  }
});

test('instance auto-stock contains Item ID references and never embeds item definitions', () => {
  const {service,byId}=fixture(),instance=service.createInstance('general-store',{id:'shop'});
  assert.ok(instance.inventory.length > 0);
  for (const entry of instance.inventory) {
    assert.ok(byId.has(entry.itemId));
    assert.deepEqual(Object.keys(entry).sort(),['available','buyPriceOverrideMinor','itemId','quantity','salePriceOverrideMinor']);
    assert.equal(Object.hasOwn(entry,'n'),false);
    assert.equal(Object.hasOwn(entry,'tags'),false);
    assert.equal(Object.hasOwn(entry,'priceMinor'),false);
  }
});

test('category rules do not treat every equipment record as general goods', () => {
  assert.equal(Merchants.itemMatches({id:'poison',type:'equipment',tags:['poison','consumable']},['general-goods']),false);
  assert.equal(Merchants.itemMatches({id:'rope',type:'equipment',tags:['rope']},['general-goods']),true);
});

test('a new profession is injected as data without changing MerchantService', () => {
  const base=fixture(),cartographer=Merchants.normalizeTemplate({
    id:'cartographer',profession:'Картограф',merchantType:'specialist',buyCategories:['books-scrolls'],sellCategories:['books-scrolls'],
    initialStock:[{categories:['books-scrolls'],limit:3,quantity:2}],startingFunds:{zm:'30'},pricingRules:{purchaseBasisPoints:'10000',saleBasisPoints:'5000'},
    rarity:{maximum:2},restockRules:{cadenceDays:10},restrictions:{},
  }),service=new Merchants.MerchantService({
    economy:base.economy,templates:[...Merchants.DEFAULT_MERCHANT_TEMPLATES,cartographer],itemResolver:id=>base.byId.get(id)||null,listItems:()=>base.items,
    priceResolver:item=>({ok:true,amountMinor:item.priceMinor}),journal:[],idFactory:()=> 'custom',
  }),instance=service.createInstance('cartographer',{id:'map-shop'});
  assert.equal(instance.templateId,'cartographer');
  assert.deepEqual(instance.inventory.map(row=>row.itemId),['item-scroll']);
});

test('purchase atomically moves exact money and one stock quantity and rejects replay', async () => {
  const {service,economy,operations,transactions}=fixture(),instance=service.createInstance('general-store',{id:'shop'}),hero=character('hero',{zm:'10'}),stock=instance.inventory.find(row=>row.itemId==='item-rope');
  assert.ok(stock);stock.quantity=3;const merchantBefore=BigInt(economy.totalMinor(instance.wallet));
  const bought=await service.buy({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-rope',quantity:2,requestId:'buy-1',userId:'gm',reason:'Покупка верёвки'});
  assert.equal(bought.ok,true);
  assert.equal(economy.totalMinor(hero.account),'800');
  assert.equal(BigInt(economy.totalMinor(instance.wallet)),merchantBefore+200n);
  assert.equal(stock.quantity,1);
  assert.equal(hero.actor.inventory.find(row=>row.itemId==='item-rope').qty,2);
  assert.equal(operations.length,1);
  assert.equal(transactions.length,1);

  const snapshot=JSON.stringify({hero:hero.actor,account:hero.account,instance,operations,transactions});
  const replay=await service.buy({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-rope',quantity:2,requestId:'buy-1',userId:'gm'});
  assert.equal(replay.ok,false);assert.equal(replay.reason,'duplicate-request');
  assert.equal(JSON.stringify({hero:hero.actor,account:hero.account,instance,operations,transactions}),snapshot);
});

test('two concurrent deliveries with the same request ID commit exactly once', async () => {
  const {service,economy,transactions}=fixture(),instance=service.createInstance('general-store',{id:'shop'}),hero=character('hero',{zm:'10'}),stock=instance.inventory.find(row=>row.itemId==='item-rope');
  stock.quantity=4;
  const input={instance,character:hero.actor,characterAccount:hero.account,itemId:'item-rope',quantity:1,requestId:'same-request',userId:'gm'};
  const results=await Promise.all([service.buy(input),service.buy(input)]);
  assert.equal(results.filter(row=>row.ok).length,1);
  assert.equal(results.filter(row=>row.reason==='duplicate-request').length,1);
  assert.equal(hero.actor.inventory.find(row=>row.itemId==='item-rope').qty,1);
  assert.equal(stock.quantity,3);
  assert.equal(economy.totalMinor(hero.account),'900');
  assert.equal(transactions.length,1);
});

test('economy replay never reports a second merchant delivery when the merchant journal was lost', async () => {
  const {service,economy,transactions}=fixture(),instance=service.createInstance('general-store',{id:'shop'}),hero=character('hero',{zm:'10'}),stock=instance.inventory.find(row=>row.itemId==='item-rope');
  stock.quantity=4;const input={instance,character:hero.actor,characterAccount:hero.account,itemId:'item-rope',quantity:1,requestId:'partially-restored-request',userId:'gm'};
  const first=await service.buy(input);assert.equal(first.ok,true);const snapshot=JSON.stringify({inventory:hero.actor.inventory,stock:instance.inventory,account:hero.account,wallet:instance.wallet,operations:economy.getJournal({})});
  transactions.length=0;
  const replay=await service.buy(input);assert.equal(replay.ok,false);assert.equal(replay.reason,'duplicate-request');assert.equal(JSON.stringify({inventory:hero.actor.inventory,stock:instance.inventory,account:hero.account,wallet:instance.wallet,operations:economy.getJournal({})}),snapshot);assert.equal(transactions.length,0);
});

test('missing stock and poor buyer cause no partial mutation', async () => {
  const {service,economy,transactions}=fixture(),instance=service.createInstance('general-store',{id:'shop'}),hero=character('poor',{sm:'1'});
  const before=JSON.stringify({instance,hero:hero.actor,account:hero.account});
  const absent=await service.buy({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-sword',quantity:999,requestId:'absent',userId:'gm'});
  assert.equal(absent.ok,false);assert.equal(absent.reason,'out-of-stock');
  const poor=await service.buy({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-rope',quantity:1,requestId:'poor',userId:'gm'});
  assert.equal(poor.ok,false);assert.equal(poor.reason,'insufficient-funds');
  assert.equal(JSON.stringify({instance,hero:hero.actor,account:hero.account}),before);
  assert.equal(transactions.length,0);assert.equal(economy.getJournal({}).length,0);
});

test('sale is refused when merchant lacks money unless GM explicitly covers shortfall', async () => {
  const {service,economy,transactions}=fixture(),instance=service.createInstance('weaponsmith',{id:'shop'}),hero=character('seller',{});
  instance.wallet=Economy.createWallet('merchant:shop',Economy.DND5E_RULESET,{mm:'10'});
  hero.actor.inventory=[{id:'sword-entry',itemId:'item-sword',qty:1,notes:''}];
  const before=JSON.stringify({instance,hero:hero.actor,account:hero.account});
  const blocked=await service.sell({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-sword',quantity:1,requestId:'sale-blocked',userId:'gm'});
  assert.equal(blocked.ok,false);assert.equal(blocked.reason,'merchant-insufficient-funds');
  assert.equal(JSON.stringify({instance,hero:hero.actor,account:hero.account}),before);

  const sold=await service.sell({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-sword',quantity:1,requestId:'sale-approved',userId:'gm',reason:'Мастер покрывает кассовый разрыв',masterOverride:{confirmed:true,authorizedBy:'gm',reason:'Сюжетная сделка'}});
  assert.equal(sold.ok,true);
  assert.equal(economy.totalMinor(instance.wallet),'0');
  assert.equal(economy.totalMinor(hero.account),'900');
  assert.equal(instance.overdraftMinor,'890');
  assert.equal(hero.actor.inventory.length,0);
  assert.equal(instance.inventory.find(row=>row.itemId==='item-sword').quantity >= 1,true);
  assert.equal(transactions.at(-1).masterOverride.authorizedBy,'gm');
  assert.equal(transactions.at(-1).masterOverride.shortfallMinor,'890');
});

test('journal failure rolls back item, stock, money and account versions', async () => {
  const frozen=Object.freeze([]),{service,economy}=fixture({transactions:frozen}),instance=service.createInstance('general-store',{id:'shop'}),hero=character('hero',{zm:'10'}),before=JSON.stringify({instance,hero:hero.actor,account:hero.account});
  const result=await service.buy({instance,character:hero.actor,characterAccount:hero.account,itemId:'item-rope',quantity:1,requestId:'journal-fails',userId:'gm'});
  assert.equal(result.ok,false);
  assert.equal(JSON.stringify({instance,hero:hero.actor,account:hero.account}),before);
  assert.equal(economy.getJournal({}).length,0);
});

test('unknown Item ID can never enter stock or a transaction', async () => {
  const {service}=fixture(),instance=service.createInstance('general-store',{id:'shop'}),hero=character('hero',{pm:'1'});
  assert.throws(()=>Merchants.normalizeInstance(Object.assign({},instance,{inventory:[{itemId:'',quantity:1}]})),/предмет/i);
  const result=await service.buy({instance,character:hero.actor,characterAccount:hero.account,itemId:'missing-id',quantity:1,requestId:'unknown',userId:'gm'});
  assert.equal(result.ok,false);assert.equal(result.reason,'unknown-item');
});
