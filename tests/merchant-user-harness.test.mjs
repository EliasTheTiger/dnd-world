import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('./merchant-user-harness.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1]||'';

test('browser merchant harness defines 760 independent user actions',()=>{
  assert.match(script,/const EXPECTED_TOTAL=760/);
  const counts=[...script.matchAll(/(?:creation|name|pricing|relationship|stock|availability|purchase|sale|rejection):(\d+)/g)].map(match=>Number(match[1]));
  assert.equal(counts.reduce((sum,value)=>sum+value,0),760);
  assert.match(script,/state\.total===EXPECTED_TOTAL&&state\.failed===0/);
});

test('browser merchant harness is syntactically valid and drives the real UI',()=>{
  assert.doesNotThrow(()=>new vm.Script(script,{filename:'merchant-user-harness.html'}));
  assert.match(html,/\.\.\/index\.html\?merchant-user-matrix=/);
  for(const selector of ['#merchantCreateButton','#merchantName','#merchantPurchaseMultiplier','#merchantRelationshipButton','button[id^="merchantBuy_"]','#merchantSellButton'])assert.ok(html.includes(selector),selector);
  assert.doesNotMatch(script,/\.merchantCreate\(|\.merchantBuy\(|\.merchantSell\(/);
});
