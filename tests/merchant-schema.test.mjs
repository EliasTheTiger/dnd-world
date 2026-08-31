import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const schema=JSON.parse(readFileSync(new URL('../schemas/merchant-domain-v1.schema.json',import.meta.url),'utf8'));

test('merchant schema forbids embedded item definitions in stock entries',()=>{
  const stock=schema.$defs.StockEntry;
  assert.equal(stock.additionalProperties,false);
  assert.deepEqual(Object.keys(stock.properties).sort(),['available','buyPriceOverrideMinor','itemId','quantity','salePriceOverrideMinor']);
  assert.ok(stock.required.includes('itemId'));
});

test('merchant schema keeps templates, instances and transactions independently versioned',()=>{
  assert.equal(schema.$defs.MerchantTemplate.properties.schemaVersion.const,'dnd-world-merchant-template/1');
  assert.equal(schema.$defs.MerchantInstance.properties.schemaVersion.const,'dnd-world-merchant-instance/1');
  assert.equal(schema.$defs.MerchantTransaction.properties.schemaVersion.const,'dnd-world-merchant-transaction/1');
  assert.equal(schema.$defs.MerchantState.properties.schemaVersion.const,'dnd-world-merchants/1');
});
