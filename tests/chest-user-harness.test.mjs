import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('./chest-user-harness.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1]||'';

test('browser chest harness defines 600 independent user scenarios',()=>{
  assert.match(script,/const EXPECTED_TOTAL=600/);
  const counts=[...script.matchAll(/(?:creation|parameters|trap|lootTable|generation|manualLoot|evaluation|placement|actions):(\d+)/g)].map(match=>Number(match[1]));
  assert.equal(counts.reduce((sum,value)=>sum+value,0),600);
  assert.match(script,/state\.total===EXPECTED_TOTAL&&state\.failed===0/);
});

test('browser chest harness drives visible D&D World controls without direct mutation APIs',()=>{
  assert.doesNotThrow(()=>new vm.Script(script,{filename:'chest-user-harness.html'}));
  assert.match(html,/\.\.\/index\.html\?chest-user-matrix=/);
  for(const marker of ['[data-tab="chests"]','.chest-toolbar select','.chest-name','.chest-table-row','.chest-loot-row','.chest-player-action','#rollBack','#rollRows input'])assert.ok(html.includes(marker),marker);
  assert.doesNotMatch(script,/app\.(?:chestCreate|chestSetField|chestGenerate|chestApprove|chestPlace|chestStartPlayerAction|chestApplyPlayerResolution)\s*\(/);
  assert.match(script,/\.click\(\)/);assert.match(script,/dispatchEvent\(new app\.Event\('change'/);assert.match(script,/worldSnapshotPayload\(\)/);
});
