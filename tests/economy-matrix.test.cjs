const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CurrencyService,
  DND5E_CURRENCIES,
  DND5E_RULESET,
  createItemPriceModel,
  createWallet,
  quotePrice,
} = require('../scripts/economy-core.js');

const IDS = ['mm','sm','em','zm','pm'];
const RATES = {mm:1n,sm:10n,em:50n,zm:100n,pm:1000n};
const ABBR = {mm:'мм',sm:'см',em:'эм',zm:'зм',pm:'пм'};

function service() {
  let sequence = 0;
  return new CurrencyService({
    currencies:DND5E_CURRENCIES,
    clock:() => '2026-08-30T15:00:00.000Z',
    idFactory:() => `matrix-${++sequence}`,
  });
}
function wallet(id, balances) {
  return createWallet(id,DND5E_RULESET,balances);
}

// 125: every D&D denomination pair at five representative whole-coin amounts.
for (const from of IDS) {
  for (const to of IDS) {
    for (let amount = 1; amount <= 5; amount++) {
      test(`matrix convert ${amount} ${from} -> ${to} preserves canonical copper`, () => {
        const economy=service(),converted=economy.convert({amount:String(amount),currencyId:from},to),
          canonical=economy.convert({amount:converted.amount,currencyId:to},'mm');
        assert.equal(canonical.amount,(BigInt(amount)*RATES[from]).toString());
        assert.equal(converted.currencyId,to);
      });
    }
  }
}

// 100: formatting all denominations across a useful visible range.
for (const currencyId of IDS) {
  for (let amount = 1; amount <= 20; amount++) {
    test(`matrix format ${amount} ${currencyId}`, () => {
      assert.equal(service().format({amount:String(amount),currencyId}),`${amount} ${ABBR[currencyId]}`);
    });
  }
}

// 100: exact sufficient/insufficient boundaries in canonical minor units.
for (let index = 0; index < 100; index++) {
  test(`matrix affordability boundary ${index}`, () => {
    const economy=service(),available=BigInt(index*7),required=available+BigInt(index%3===0?0:1),
      account=wallet(`afford-${index}`,{mm:available.toString()}),result=economy.canAfford(account,{amountMinor:required.toString()});
    assert.equal(result.ok,index%3===0);
    assert.equal(result.availableMinor,available.toString());
    assert.equal(result.shortfallMinor,(index%3===0?0n:1n).toString());
  });
}

// 100: source-backed merchant modifiers, calculated with integer basis points.
for (let index = 1; index <= 100; index++) {
  test(`matrix contextual quote merchant-${index}`, () => {
    const basisPoints=5000+index*50,model=createItemPriceModel({
      itemId:`quote-${index}`,rawPrice:'100 зм',source:{type:'matrix-catalog',reference:`quote-${index}:cost`},
    }),settings={merchantType:{[`merchant-${index}`]:{
      basisPoints:String(basisPoints),source:{type:'matrix-setting',reference:`merchant-${index}`},
    }}},quote=quotePrice(model,'purchase',{merchantType:`merchant-${index}`},settings);
    assert.equal(quote.ok,true);
    assert.equal(quote.amountMinor,String(basisPoints));
    assert.equal(quote.breakdown.find(row=>row.dimension==='merchantType').source.reference,`merchant-${index}`);
  });
}

// 50 debits + 50 credits: every case is an isolated journaled transaction.
for (let index = 1; index <= 50; index++) {
  test(`matrix debit transaction ${index}`, async () => {
    const economy=service(),account=wallet(`debit-${index}`,{mm:String(1000+index)}),result=await economy.debit(account,{amountMinor:String(index)},{userId:'matrix-gm',reason:'developer debit matrix'});
    assert.equal(result.ok,true);
    assert.equal(economy.totalMinor(account),'1000');
    assert.equal(economy.getJournal({accountId:account.id}).length,1);
  });
}
for (let index = 1; index <= 50; index++) {
  test(`matrix credit transaction ${index}`, async () => {
    const economy=service(),account=wallet(`credit-${index}`,{}),result=await economy.credit(account,{amountMinor:String(index*13)},{userId:'matrix-gm',reason:'developer credit matrix'});
    assert.equal(result.ok,true);
    assert.equal(economy.totalMinor(account),String(index*13));
    assert.equal(economy.getJournal({accountId:account.id})[0].amountMinor,String(index*13));
  });
}

// 25: an unknown legacy label must always remain explicit manual review.
for (let index = 1; index <= 25; index++) {
  test(`matrix unresolved price ${index} requires manual review`, () => {
    const model=createItemPriceModel({itemId:`unknown-${index}`,rawPrice:`не определено ${index}`,source:{type:'matrix-legacy',reference:`unknown-${index}:cost`}});
    assert.equal(model.status,'manualReviewRequired');
    assert.equal(model.basePrice,null);
    assert.equal(quotePrice(model,'purchase',{},{}).manualReviewRequired,true);
  });
}
