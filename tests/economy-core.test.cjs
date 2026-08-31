const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CurrencyService,
  DND5E_CURRENCIES,
  DND5E_RULESET,
  applyManualPriceOverride,
  createItemPriceModel,
  createWallet,
  quotePrice,
} = require('../scripts/economy-core.js');

function service(options = {}) {
  let id = 0;
  return new CurrencyService(Object.assign({
    currencies: DND5E_CURRENCIES,
    clock: () => '2026-08-30T10:00:00.000Z',
    idFactory: () => `op-${++id}`,
  }, options));
}

function wallet(id, balances) {
  return createWallet(id, DND5E_RULESET, balances);
}

test('Currency model converts D&D denominations without floating point', () => {
  const economy = service();
  assert.deepEqual(economy.convert({amount:'2',currencyId:'pm'}, 'zm'), {
    currencyId:'zm', amount:'20', atomicAmount:'2000', rounding:'reject',
  });
  assert.deepEqual(economy.convert({amount:'1',currencyId:'em'}, 'mm'), {
    currencyId:'mm', amount:'50', atomicAmount:'50', rounding:'reject',
  });
  assert.equal(economy.format({amount:'12',currencyId:'sm'}), '12 см');
  assert.throws(() => economy.convert({amount:0.1,currencyId:'zm'}, 'mm'), /floating point/i);
});

test('conversion obeys explicit rounding policy at target precision', () => {
  const currencies = [
    {id:'base',ruleset:'rounding',name:'Base',abbreviation:'b',baseUnit:'base',exchangeRate:{numerator:'1',denominator:'1'},precision:0},
    {id:'three',ruleset:'rounding',name:'Three',abbreviation:'t',baseUnit:'base',exchangeRate:{numerator:'3',denominator:'1'},precision:0},
    {id:'two',ruleset:'rounding',name:'Two',abbreviation:'d',baseUnit:'base',exchangeRate:{numerator:'2',denominator:'1'},precision:0},
  ];
  const economy = service({currencies});
  assert.equal(economy.convert({amount:'1',currencyId:'three'}, 'two', 'half-up').amount, '2');
  assert.equal(economy.convert({amount:'1',currencyId:'three'}, 'two', 'down').amount, '1');
  assert.throws(() => economy.convert({amount:'1',currencyId:'three'}, 'two'), /округления/);
});

test('purchase debits buyer and credits merchant in one journaled commit', async () => {
  const journal = [], economy = service({journal});
  const buyer = wallet('hero', {zm:'12',sm:'3'}), merchant = wallet('merchant', {zm:'1'});
  const consequenceState = {items:0};
  const result = await economy.purchase({
    buyer, merchant, price:{amount:'10.25',currencyId:'zm'}, itemId:'it-rope', quantity:1,
    userId:'gm-1', reason:'Покупка у лавочника',
    consequence() { consequenceState.items++; return () => { consequenceState.items--; }; },
  });
  assert.equal(result.ok, true);
  assert.equal(economy.totalMinor(buyer), '205');
  assert.equal(economy.totalMinor(merchant), '1125');
  assert.equal(consequenceState.items, 1);
  assert.equal(journal.length, 1);
  assert.equal(journal[0].type, 'purchase');
  assert.equal(journal[0].amountMinor, '1025');
  assert.deepEqual(journal[0].accounts, ['hero','merchant']);
});

test('sale credits seller using exact canonical minor units', async () => {
  const economy = service(), seller = wallet('seller', {}), merchant = wallet('merchant', {pm:'2'});
  const result = await economy.sale({
    seller, merchant, price:{amount:'12.37',currencyId:'zm'}, itemId:'gem',
    userId:'gm-2', reason:'Подтвержденная продажа',
  });
  assert.equal(result.ok, true);
  assert.equal(economy.totalMinor(seller), '1237');
  assert.deepEqual(seller.balances, {pm:'1',zm:'2',em:'0',sm:'3',mm:'7'});
  assert.equal(economy.totalMinor(merchant), '763');
});

test('insufficient funds cause no wallet, consequence, or journal mutation', async () => {
  const journal = [], economy = service({journal}), buyer = wallet('poor-hero', {sm:'5'});
  const before = JSON.stringify(buyer), state = {items:0};
  const result = await economy.purchase({
    buyer, price:{amount:'1',currencyId:'zm'}, itemId:'torch', userId:'gm', reason:'test',
    consequence() { state.items++; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient-funds');
  assert.equal(JSON.stringify(buyer), before);
  assert.equal(state.items, 0);
  assert.equal(journal.length, 0);
});

test('a failed journal commit rolls back both money and the registered item consequence', async () => {
  const journal = [], economy = service({journal,idFactory:() => { throw new Error('journal unavailable'); }}), buyer = wallet('rollback-buyer', {zm:'5'});
  const state = {items:0}, before = JSON.stringify(buyer);
  const result = await economy.purchase({
    buyer, price:{amount:'2',currencyId:'zm'}, itemId:'rollback-item', userId:'gm', reason:'rollback regression',
    consequence() { state.items++; return () => { state.items--; }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'commit-failed');
  assert.equal(JSON.stringify(buyer), before);
  assert.equal(state.items, 0);
  assert.equal(journal.length, 0);
});

test('concurrent purchases serialize on the account and cannot overspend', async () => {
  const journal = [], economy = service({journal}), buyer = wallet('contended', {zm:'10'});
  let delivered = 0;
  const buy = itemId => economy.purchase({
    buyer, price:{amount:'8',currencyId:'zm'}, itemId, userId:'gm', reason:'concurrency regression',
    consequence() { delivered++; return () => { delivered--; }; },
  });
  const results = await Promise.all([buy('item-a'), buy('item-b')]);
  assert.equal(results.filter(row => row.ok).length, 1);
  assert.equal(results.filter(row => !row.ok && row.reason === 'insufficient-funds').length, 1);
  assert.equal(economy.totalMinor(buyer), '200');
  assert.equal(delivered, 1);
  assert.equal(journal.length, 1);
});

test('change and manual balance adjustment preserve value and audit old/new/user/reason/time', async () => {
  const journal = [], economy = service({journal}), actor = wallet('change-owner', {pm:'1'});
  const changed = await economy.makeChange(actor, {userId:'gm',reason:'Размен перед рынком'});
  assert.equal(changed.ok, true);
  assert.equal(economy.totalMinor(actor), '1000');
  const adjusted = await economy.manualAdjust(actor, {currencyId:'zm',newAmount:'7',userId:'gm-42',reason:'Исправление листа'});
  assert.equal(adjusted.ok, true);
  assert.equal(adjusted.operation.details.oldValue, '0');
  assert.equal(adjusted.operation.details.newValue, '7');
  assert.equal(adjusted.operation.userId, 'gm-42');
  assert.equal(adjusted.operation.reason, 'Исправление листа');
  assert.equal(adjusted.operation.at, '2026-08-30T10:00:00.000Z');
});

test('item pricing requires provenance, applies all configured dimensions, and audits manual overrides', () => {
  assert.throws(() => createItemPriceModel({itemId:'unknown',rawPrice:'10 зм'}), /происхождение/);
  const model = createItemPriceModel({
    itemId:'sword', rawPrice:'100 зм',
    source:{type:'project-catalog',reference:'items:sword:cost'},
    saleRule:{kind:'ratio',basisPoints:'5000',requiresConfirmation:false,source:{type:'campaign-rule',reference:'sale-half'}},
  });
  const source = name => ({type:'campaign-setting',reference:name});
  const settings = {
    merchantType:{specialist:{basisPoints:'12000',source:source('merchant:specialist')}},
    itemCondition:{damaged:{basisPoints:'5000',source:source('condition:damaged')}},
    rarity:{rare:{basisPoints:'10000',source:source('rarity:rare')}},
    availability:{scarce:{basisPoints:'10000',source:source('availability:scarce')}},
    region:{north:{basisPoints:'10000',source:source('region:north')}},
    reputation:{trusted:{basisPoints:'10000',source:source('reputation:trusted')}},
    gmSettings:{default:{basisPoints:'10000',source:source('gm:default')}},
  };
  const quote = quotePrice(model, 'purchase', {
    merchantType:'specialist',itemCondition:'damaged',rarity:'rare',availability:'scarce',region:'north',reputation:'trusted',gmSettings:'default',
  }, settings);
  assert.equal(quote.ok, true);
  assert.equal(quote.amountMinor, '6000');
  assert.deepEqual(quote.breakdown.map(row => row.dimension), [
    'merchantType','itemCondition','rarity','availability','region','reputation','gmSettings',
  ]);

  const changed = applyManualPriceOverride(model, {
    side:'purchase',amount:'77.25',currencyId:'zm',userId:'gm-price',reason:'Сезонный дефицит',at:'2026-08-30T12:00:00.000Z',id:'audit-1',
  });
  assert.equal(changed.audit.oldValue, null);
  assert.equal(changed.audit.newValue.amountMinor, '7725');
  assert.equal(changed.audit.userId, 'gm-price');
  assert.equal(changed.audit.reason, 'Сезонный дефицит');
  assert.equal(changed.audit.at, '2026-08-30T12:00:00.000Z');
  assert.equal(quotePrice(changed.model, 'purchase', {}, {}).amountMinor, '7725');
});

test('unresolved item price is explicit manualReviewRequired, never inferred', () => {
  const model = createItemPriceModel({
    itemId:'mystery',rawPrice:'по решению мастера',source:{type:'legacy-record',reference:'mystery:cost'},
  });
  assert.equal(model.status, 'manualReviewRequired');
  assert.equal(model.basePrice, null);
  assert.equal(quotePrice(model, 'purchase', {}, {}).manualReviewRequired, true);
});

test('idempotency key makes retries and concurrent duplicate requests commit money once', async () => {
  const journal = [], economy = service({journal}), buyer = wallet('retry-buyer', {zm:'10'}), delivered = {count:0};
  const request = () => economy.purchase({
    buyer,price:{amount:'4',currencyId:'zm'},itemId:'retry-item',userId:'player',reason:'Повтор запроса',idempotencyKey:'purchase:req-42',
    consequence(){delivered.count++;return()=>{delivered.count--;};},
  });
  const results = await Promise.all([request(),request()]);
  assert.equal(results.filter(row=>row.ok).length,2);
  assert.equal(results.filter(row=>row.replayed).length,1);
  assert.equal(economy.totalMinor(buyer),'600');
  assert.equal(delivered.count,1);
  assert.equal(journal.length,1);
  assert.equal(journal[0].idempotencyKey,'purchase:req-42');
  assert.equal(journal[0].metadata.idempotencyKey,'purchase:req-42');
});

test('idempotency survives service reconstruction and rejects a changed payload', async () => {
  const journal=[],actor=wallet('persistent-retry',{mm:'50'}),first=service({journal});
  const committed=await first.debit(actor,{amountMinor:'10'},{userId:'player',reason:'Списание',metadata:{requestId:'network-7'}});
  assert.equal(committed.ok,true);
  const restored=service({journal}),replayed=await restored.debit(actor,{amountMinor:'10'},{userId:'player',reason:'Списание',metadata:{requestId:'network-7'}});
  assert.equal(replayed.ok,true);assert.equal(replayed.replayed,true);assert.equal(restored.totalMinor(actor),'40');assert.equal(journal.length,1);
  const conflict=await restored.debit(actor,{amountMinor:'11'},{userId:'player',reason:'Подменённое списание',metadata:{requestId:'network-7'}});
  assert.equal(conflict.ok,false);assert.equal(conflict.reason,'idempotency-conflict');assert.equal(restored.totalMinor(actor),'40');assert.equal(journal.length,1);
});

test('exchange and manual adjustment are idempotent', async () => {
  const journal=[],economy=service({journal}),actor=wallet('idempotent-wallet',{sm:'5',zm:'1'});
  const exchange=()=>economy.exchange(actor,{currencyId:'sm',amount:'2'},'mm','reject',{userId:'gm',reason:'Размен',idempotencyKey:'exchange-1'});
  assert.equal((await exchange()).ok,true);const repeatedExchange=await exchange();assert.equal(repeatedExchange.replayed,true);assert.equal(actor.balances.sm,'3');assert.equal(actor.balances.mm,'20');
  const adjustment=()=>economy.manualAdjust(actor,{currencyId:'zm',newAmount:'7',userId:'gm',reason:'Исправление',idempotencyKey:'adjust-1'});
  assert.equal((await adjustment()).ok,true);const repeatedAdjustment=await adjustment();assert.equal(repeatedAdjustment.replayed,true);assert.equal(actor.balances.zm,'7');
  assert.equal(journal.length,2);
  const statement=economy.accountStatement('idempotent-wallet');assert.equal(statement.netMinor,'600');assert.equal(statement.unresolvedOperations,0);assert.deepEqual(economy.verifyJournal().warnings,[]);
});

test('change computes the wallet total inside the account lock and cannot restore concurrently spent money', async () => {
  const economy=service(),actor=wallet('change-race',{pm:'1'});
  const debit=economy.debit(actor,{amountMinor:'125'},{userId:'player',reason:'Покупка перед разменом'}),change=economy.makeChange(actor,{userId:'player',reason:'Разложить остаток'}),results=await Promise.all([debit,change]);
  assert.equal(results.every(row=>row.ok),true);
  assert.equal(economy.totalMinor(actor),'875');
  assert.deepEqual(actor.balances,{pm:'0',zm:'8',em:'1',sm:'2',mm:'5'});
  assert.equal(results[1].operation.amountMinor,'0');
});

test('account statement explains credits, debits, and net movement', async () => {
  const economy=service(),buyer=wallet('statement-buyer',{mm:'100'}),merchant=wallet('statement-merchant',{mm:'0'});
  await economy.purchase({buyer,merchant,price:{amountMinor:'35'},itemId:'ledger-item',userId:'gm',reason:'Выписка'});
  await economy.credit(buyer,{amountMinor:'10'},{userId:'gm',reason:'Награда'});
  assert.deepEqual(economy.accountStatement('statement-buyer'),{
    accountId:'statement-buyer',operationCount:2,creditMinor:'10',debitMinor:'35',netMinor:'-25',unresolvedOperations:0,operations:economy.getJournal({accountId:'statement-buyer'}),
  });
  const merchantStatement=economy.accountStatement('statement-merchant');assert.equal(merchantStatement.creditMinor,'35');assert.equal(merchantStatement.debitMinor,'0');assert.equal(merchantStatement.netMinor,'35');
});

test('journal verification detects duplicate ids, duplicate request keys, and damaged changes', async () => {
  const journal=[],economy=service({journal}),actor=wallet('audit-wallet',{mm:'20'});
  await economy.debit(actor,{amountMinor:'5'},{userId:'gm',reason:'Аудит',idempotencyKey:'audit-request'});
  assert.deepEqual(economy.verifyJournal(),{ok:true,total:1,errors:[],warnings:[],idempotencyKeys:1});
  const duplicate=JSON.parse(JSON.stringify(journal[0])),conflictingKey=JSON.parse(JSON.stringify(journal[0]));conflictingKey.id='op-conflicting-key';conflictingKey.details.changes[0].after.mm='сломано';journal.push(duplicate,conflictingKey);
  const report=economy.verifyJournal();assert.equal(report.ok,false);assert.ok(report.errors.some(row=>row.code==='duplicate-id'));assert.ok(report.errors.some(row=>row.code==='duplicate-idempotency-key'));assert.ok(report.errors.some(row=>row.code==='INVALID_INTEGER'));
});
