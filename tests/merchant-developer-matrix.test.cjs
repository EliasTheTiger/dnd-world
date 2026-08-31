const assert = require('node:assert/strict');
const test = require('node:test');
const Economy = require('../scripts/economy-core.js');
const Merchants = require('../scripts/merchant-core.js');

let globalSequence = 0;

function matrixTemplate(overrides = {}) {
  return Merchants.normalizeTemplate(Object.assign({
    id:'matrix-merchant',profession:'Испытатель торговли',merchantType:'test',
    buyCategories:['all'],sellCategories:['all'],
    initialStock:[{itemIds:['matrix-item'],categories:['all'],limit:1,quantity:50}],
    startingFunds:{mm:'1000000'},
    pricingRules:{purchaseBasisPoints:'10000',saleBasisPoints:'10000'},
    rarity:{maximum:5},restockRules:{mode:'restore-to-target',cadenceDays:1,requiresGM:true},
    restrictions:{},
  }, overrides));
}

function fixture(options = {}) {
  const item = Object.assign({
    id:'matrix-item',n:'Матричный предмет',type:'equipment',rarity:'обычный',
    tags:['general-goods','weapon','alchemy','scroll','magical'],priceMinor:String(options.priceMinor == null ? 100 : options.priceMinor),
  }, options.item || {});
  const items = options.items || [item];
  const byId = new Map(items.map(row => [row.id,row]));
  const operations = [];
  const transactions = options.transactions == null ? [] : options.transactions;
  const economy = new Economy.CurrencyService({
    currencies:Economy.DND5E_CURRENCIES,journal:operations,
    clock:()=>'2026-08-30T18:00:00.000Z',idFactory:()=>`money-matrix-${++globalSequence}`,
  });
  const template = options.template || matrixTemplate();
  const service = new Merchants.MerchantService({
    economy,templates:options.templates || [template],itemResolver:id=>byId.get(id)||null,listItems:()=>items,
    priceResolver:row=>options.priceFailure ? {ok:false,reason:'price-unavailable'} : {ok:true,amountMinor:String(row.priceMinor)},
    inventoryGuard:options.inventoryGuard || (()=>({ok:true})),journal:transactions,
    clock:()=>'2026-08-30T18:00:00.000Z',idFactory:()=>`merchant-matrix-${++globalSequence}`,
  });
  const instance = service.createInstance(template.id,{id:`shop-${++globalSequence}`,name:'Матричная лавка'});
  const actor = {id:`hero-${++globalSequence}`,name:'Испытатель',inventory:[],equipment:{}};
  const account = Economy.createWallet(`character:${actor.id}`,Economy.DND5E_RULESET,{mm:String(options.heroMoney == null ? 1000000 : options.heroMoney)});
  return {item,items,byId,operations,transactions,economy,template,service,instance,actor,account};
}

function snapshot(world) {
  return JSON.stringify({instance:world.instance,actor:world.actor,account:world.account,operations:world.operations,transactions:world.transactions});
}

function expectedPrice(base, instanceFactor, relationshipFactor) {
  const denominator = 100000000n;
  return ((BigInt(base)*BigInt(instanceFactor)*BigInt(relationshipFactor)+denominator/2n)/denominator).toString();
}

// 1-100: all ten built-in templates, their policies, restrictions and Item-ID-only stock.
for (let index=0; index<100; index++) {
  test(`developer template ${index+1}/100 preserves policy and reference-only stock`, () => {
    const source = Merchants.DEFAULT_MERCHANT_TEMPLATES[index%Merchants.DEFAULT_MERCHANT_TEMPLATES.length];
    const tags = [...new Set(['common',...source.sellCategories,...source.initialStock.flatMap(rule=>rule.categories)])];
    const item = {id:`template-item-${index}`,n:`Шаблонный предмет ${index}`,type:tags[0]||'equipment',rarity:'обычный',tags,priceMinor:String(index+1)};
    const economy = new Economy.CurrencyService({currencies:Economy.DND5E_CURRENCIES,journal:[]});
    const service = new Merchants.MerchantService({economy,itemResolver:id=>id===item.id?item:null,listItems:()=>[item],priceResolver:()=>({ok:true,amountMinor:'1'}),journal:[],idFactory:()=>`template-${index}`});
    const instance = service.createInstance(source.id,{id:`template-shop-${index}`});
    assert.equal(source.schemaVersion,Merchants.MERCHANT_TEMPLATE_SCHEMA);
    assert.ok(source.profession && source.merchantType);
    assert.ok(Array.isArray(source.buyCategories) && Array.isArray(source.sellCategories));
    assert.ok(source.pricingRules && source.rarity && source.restockRules && source.restrictions);
    assert.ok(instance.inventory.length > 0);
    for (const entry of instance.inventory) {
      assert.equal(entry.itemId,item.id);
      assert.deepEqual(Object.keys(entry).sort(),['available','buyPriceOverrideMinor','itemId','quantity','salePriceOverrideMinor']);
    }
  });
}

// 101-200: exact, integer-only price arithmetic across both trade directions.
for (let index=0; index<100; index++) {
  test(`developer quote ${index+1}/100 uses exact basis-point arithmetic`, () => {
    const base = 1+(index*37)%10000, instanceFactor = 2500+(index*977)%30000, relationshipFactor = 3000+(index*613)%22000;
    const world = fixture({priceMinor:base});
    const side = index%2 ? 'sale' : 'purchase';
    world.instance.priceMultipliers[side==='purchase'?'purchaseBasisPoints':'saleBasisPoints']=String(instanceFactor);
    world.instance.relationships[world.actor.id]={reputation:'matrix',purchaseBasisPoints:String(relationshipFactor),saleBasisPoints:String(relationshipFactor)};
    const quantity = 1+(index%7), quote = world.service.quote(world.instance,world.actor,world.item.id,side,quantity), unit = expectedPrice(base,instanceFactor,relationshipFactor);
    assert.equal(quote.ok,true);
    assert.equal(quote.unitMinor,unit);
    assert.equal(quote.totalMinor,(BigInt(unit)*BigInt(quantity)).toString());
    assert.equal(quote.factors.instanceBasisPoints,String(instanceFactor));
    assert.equal(quote.factors.relationshipBasisPoints,String(relationshipFactor));
  });
}

// 201-300: successful purchase commits exactly once and rejected purchase changes nothing.
for (let index=0; index<100; index++) {
  test(`developer purchase ${index+1}/100 is atomic and has an explicit outcome`, async () => {
    const mode = index%4, quantity=1+(index%5), price=5+(index%17), world=fixture({priceMinor:price,heroMoney:mode===1?0:1000000});
    const stock=world.instance.inventory[0];stock.quantity=mode===2?quantity-1:quantity+10;if(mode===3)stock.available=false;
    const before=snapshot(world),result=await world.service.buy({instance:world.instance,character:world.actor,characterAccount:world.account,itemId:world.item.id,quantity,requestId:`purchase-${index}`,userId:'gm'});
    if(mode===0){
      assert.equal(result.ok,true);
      assert.equal(stock.quantity,10);
      assert.equal(world.actor.inventory.reduce((sum,row)=>sum+(row.qty||0),0),quantity);
      assert.equal(world.transactions.length,1);
      assert.equal(world.operations.length,1);
      assert.equal(world.economy.totalMinor(world.account),String(1000000-price*quantity));
    } else {
      assert.equal(result.ok,false);
      assert.equal(result.reason,mode===1?'insufficient-funds':mode===2?'out-of-stock':'item-unavailable');
      assert.equal(snapshot(world),before);
    }
  });
}

// 301-400: sales cover ordinary payment, insufficient cash, explicit GM coverage, and inventory guards.
for (let index=0; index<100; index++) {
  test(`developer sale ${index+1}/100 enforces merchant funds and rollback`, async () => {
    const mode=index%4,quantity=1+(index%3),price=20+(index%19),world=fixture({priceMinor:price,inventoryGuard:mode===3?()=>({ok:false,reason:'equipped'}):undefined});
    world.actor.inventory=[{id:`seller-entry-${index}`,itemId:world.item.id,qty:quantity,notes:''}];
    if(mode===1||mode===2)world.instance.wallet=Economy.createWallet(world.instance.wallet.id,Economy.DND5E_RULESET,{mm:'1'});
    const before=snapshot(world),input={instance:world.instance,character:world.actor,characterAccount:world.account,itemId:world.item.id,quantity,requestId:`sale-${index}`,userId:'gm'};
    if(mode===2)input.masterOverride={confirmed:true,authorizedBy:'gm',reason:'Матричное разрешение'};
    const result=await world.service.sell(input),total=price*quantity;
    if(mode===0||mode===2){
      assert.equal(result.ok,true);
      assert.equal(world.actor.inventory.length,0);
      assert.equal(world.economy.totalMinor(world.account),String(1000000+total));
      assert.equal(world.transactions.length,1);
      if(mode===2){assert.equal(world.economy.totalMinor(world.instance.wallet),'0');assert.equal(world.instance.overdraftMinor,String(total-1));assert.equal(result.transaction.masterOverride.authorizedBy,'gm');}
    } else {
      assert.equal(result.ok,false);
      assert.equal(result.reason,mode===1?'merchant-insufficient-funds':'inventory-guard');
      assert.equal(snapshot(world),before);
    }
  });
}

// 401-500: categorisation, regional/story restrictions, normalization and restocking.
const categoryCases = [
  [['weapon'],'weapons',true],[['armor'],'armor',true],[['shield'],'armor',true],[['ammo'],'ammunition',true],
  [['rope'],'general-goods',true],[['food'],'hospitality',true],[['herb'],'herbalism',true],[['potion'],'alchemy',true],
  [['magical'],'magic-items',true],[['gem'],'jewelry',true],[['book'],'books-scrolls',true],[['ore'],'craft-materials',true],
  [['poison'],'general-goods',false],[['equipment'],'weapons',false],[['valuable'],'alchemy',false],[['map'],'armor',false],
  [['writing'],'books-scrolls',true],[['ring'],'jewelry',true],[['scroll'],'magic-items',true],[['tool'],'general-goods',true],
];
for (let index=0; index<100; index++) {
  test(`developer data rule ${index+1}/100 is deterministic and fail-closed`, () => {
    const branch=index%4;
    if(branch===0){
      const [tags,category,expected]=categoryCases[(index/4)%categoryCases.length];
      assert.equal(Merchants.itemMatches({id:`category-${index}`,type:'equipment',tags},[category]),expected);
    } else if(branch===1){
      const allowed=`region-${index}`,result=Merchants.restrictionCheck({allowedRegions:[allowed],requiredStoryFlags:['open'],forbiddenStoryFlags:['closed']},{region:allowed,storyFlags:['open']});
      assert.deepEqual(result,{ok:true});
      assert.equal(Merchants.restrictionCheck({allowedRegions:[allowed]},{region:'other'}).ok,false);
    } else if(branch===2){
      const world=fixture(),normalized=Merchants.normalizeInstance(JSON.parse(JSON.stringify(world.instance)),[world.template]);
      assert.equal(normalized.schemaVersion,Merchants.MERCHANT_INSTANCE_SCHEMA);
      assert.equal(normalized.inventory[0].itemId,world.item.id);
      assert.equal(Object.hasOwn(normalized.inventory[0],'n'),false);
    } else {
      const world=fixture(),stock=world.instance.inventory[0];stock.quantity=index%8;
      const result=world.service.restock(world.instance,world.instance);
      assert.equal(result.ok,true);
      assert.equal(stock.quantity,50);
      assert.equal(result.added,50-(index%8));
    }
  });
}

// 501-600: idempotency, concurrent calls, late journal failure and stale protection.
for (let index=0; index<100; index++) {
  test(`developer durability ${index+1}/100 prevents double delivery and partial commits`, async () => {
    const mode=index%4;
    if(mode===0){
      const world=fixture(),input={instance:world.instance,character:world.actor,characterAccount:world.account,itemId:world.item.id,quantity:1,requestId:`replay-${index}`,userId:'gm'};
      assert.equal((await world.service.buy(input)).ok,true);const after=snapshot(world),replay=await world.service.buy(input);
      assert.equal(replay.ok,false);assert.equal(replay.reason,'duplicate-request');assert.equal(snapshot(world),after);
    } else if(mode===1){
      const world=fixture(),input={instance:world.instance,character:world.actor,characterAccount:world.account,itemId:world.item.id,quantity:1,requestId:`race-${index}`,userId:'gm'},results=await Promise.all([world.service.buy(input),world.service.buy(input)]);
      assert.equal(results.filter(row=>row.ok).length,1);assert.equal(results.filter(row=>row.reason==='duplicate-request').length,1);assert.equal(world.actor.inventory[0].qty,1);assert.equal(world.transactions.length,1);
    } else if(mode===2){
      const world=fixture({transactions:Object.freeze([])}),before=snapshot(world),result=await world.service.buy({instance:world.instance,character:world.actor,characterAccount:world.account,itemId:world.item.id,quantity:1,requestId:`journal-${index}`,userId:'gm'});
      assert.equal(result.ok,false);assert.equal(snapshot(world),before);assert.equal(world.operations.length,0);
    } else {
      const world=fixture(),stock=world.instance.inventory[0];stock.quantity=2;
      const results=await Promise.all([0,1].map(n=>world.service.buy({instance:world.instance,character:world.actor,characterAccount:world.account,itemId:world.item.id,quantity:1,requestId:`distinct-${index}-${n}`,userId:'gm'})));
      assert.equal(results.every(row=>row.ok),true);assert.equal(stock.quantity,0);assert.equal(world.actor.inventory[0].qty,2);assert.equal(world.transactions.length,2);
    }
  });
}
