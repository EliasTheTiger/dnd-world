const assert=require('node:assert/strict');
const test=require('node:test');
const chests=require('../scripts/chest-core.js');

const catalog=[
  {id:'it_rope',name:'Rope',rarity:'common',kind:'rope',tags:['dungeon'],contexts:['dungeon'],minLevel:1},
  {id:'it_potion',name:'Potion',rarity:'uncommon',kind:'potion',tags:['consumable'],minLevel:1},
  {id:'it_rare_blade',name:'Rare blade',rarity:'rare',kind:'weapon',minLevel:5},
  {id:'it_legend',name:'Legend',rarity:'legendary',kind:'weapon',minLevel:17},
  {id:'it_container',name:'Bag',rarity:'common',kind:'container'},
  {id:'it_story',name:'Quest seal',rarity:'rare',kind:'valuable',storyOnly:true},
];

function chest(overrides){
  return chests.createChest(Object.assign({id:'chest-test',templateId:'wooden-cache',environment:'dungeon',recommendedLevel:3,rewardLevel:1,itemCount:4,rewardMode:'mixed'},overrides||{}));
}

test('seeded loot is reproducible and contains only compatible existing Item IDs',()=>{
  const first=chests.generateLoot(chest(),catalog,'campaign:room-7');
  const second=chests.generateLoot(chest(),catalog,'campaign:room-7');
  assert.equal(first.ok,true,first.issues&&first.issues.join(','));
  assert.deepEqual(first.loot,second.loot);
  assert.ok(first.loot.draft.items.length>0);
  assert.ok(first.loot.draft.currency.totalCopper>0);
  for(const entry of first.loot.draft.items){
    assert.ok(catalog.some(item=>item.id===entry.itemId));
    assert.notEqual(entry.itemId,'it_container');
    assert.notEqual(entry.itemId,'it_rare_blade');
    assert.notEqual(entry.itemId,'it_legend');
    assert.notEqual(entry.itemId,'it_story');
  }
});

test('loot modes support empty, currency and mixed rewards',()=>{
  const empty=chests.generateLoot(chest({rewardMode:'empty',itemCount:0}),catalog,'same');
  const money=chests.generateLoot(chest({rewardMode:'currency',itemCount:0}),catalog,'same');
  const mixed=chests.generateLoot(chest({rewardMode:'mixed',itemCount:2}),catalog,'same');
  assert.deepEqual(empty.loot.draft.items,[]);assert.equal(empty.loot.draft.currency.totalCopper,0);
  assert.deepEqual(money.loot.draft.items,[]);assert.ok(money.loot.draft.currency.totalCopper>0);
  assert.ok(mixed.loot.draft.items.length>0);assert.ok(mixed.loot.draft.currency.totalCopper>0);
});

test('damaged or impossible loot tables fail closed instead of silently inventing or omitting items',()=>{
  const missing=chests.generateLoot(chest({lootTable:[{itemId:'removed-item',weight:1}],rewardMode:'items',itemCount:1}),catalog,'broken');
  assert.equal(missing.ok,false);assert.equal(missing.code,'UNKNOWN_LOOT_TABLE_ITEM');
  const tooRare=chests.generateLoot(chest({lootTable:[{itemId:'it_legend',weight:1}],rewardMode:'items',itemCount:1,recommendedLevel:1,rewardLevel:5}),catalog,'impossible');
  assert.equal(tooRare.ok,false);assert.equal(tooRare.code,'NO_COMPATIBLE_LOOT');
});

test('GM can edit a draft, but unknown or incompatible IDs cannot be approved',()=>{
  const generated=chests.generateLoot(chest({itemCount:1,rewardMode:'items'}),catalog,'review');
  const invalid=chests.replaceLootDraft(generated.chest,catalog,{items:[{itemId:'missing-id',qty:1}],currency:{gp:2}});
  assert.equal(invalid.ok,false);assert.match(invalid.issues.join(','),/UNKNOWN_ITEM_ID/);
  const blocked=chests.approveLoot(invalid.chest,catalog);assert.equal(blocked.ok,false);
  const edited=chests.replaceLootDraft(invalid.chest,catalog,{items:[{itemId:'it_potion',qty:2}],currency:{gp:7},notes:'GM choice'});
  const approved=chests.approveLoot(edited.chest,catalog);
  assert.equal(approved.ok,true);assert.equal(approved.loot.status,'approved');
  assert.deepEqual(approved.loot.approved.items,[{itemId:'it_potion',qty:2}]);
  assert.equal(approved.loot.approved.currency.totalCopper,700);
});

test('mimic is a creature encounter and cannot carry container loot',()=>{
  const mimic=chest({id:'mimic-1',templateId:'mimic',creature:{instanceId:'foe:mimic-1'}});
  assert.equal(mimic.schemaVersion,chests.CREATURE_ENCOUNTER_SCHEMA);
  assert.equal(mimic.kind,'creature');assert.equal(mimic.container,undefined);
  assert.equal(mimic.creature.combatant,true);
  const generated=chests.generateLoot(mimic,catalog,'forbidden');
  assert.equal(generated.ok,false);assert.equal(generated.code,'CREATURE_IS_NOT_CONTAINER');
});

test('all player interactions fail closed with a concrete reason or resolve through the action contract',()=>{
  let row=chest({lockType:'simple',lockDC:12});
  for(const action of chests.ACTIONS){
    const evaluation=chests.evaluateAction(row,action,{actorId:'hero',actorAlive:true});
    assert.equal(typeof evaluation.allowed,'boolean');
    assert.ok(evaluation.reasonCode);assert.ok(evaluation.explanation);
  }
  assert.equal(chests.evaluateAction(row,'open',{actorId:'hero'}).reasonCode,'CHEST_NOT_PLACED');
  row.placement={placed:true,sceneId:'crypt',zoneId:null,position:null};
  assert.equal(chests.evaluateAction(row,'open',{actorId:'hero'}).reasonCode,'CHEST_LOCKED');
  const failed=chests.applyAction(row,'pick',{actorId:'hero',total:11});
  assert.equal(failed.success,false);assert.equal(failed.chest.state,'closed');assert.equal(failed.chest.container.lock.opened,false);
  const passed=chests.applyAction(failed.chest,'pick',{actorId:'hero',total:12});
  assert.equal(passed.success,true);assert.equal(passed.chest.state,'forced');assert.equal(passed.chest.container.lock.opened,true);
});

test('failed trap checks and disarm attempts do not imply a lasting consequence',()=>{
  let trapped=chest({id:'trap-1',templateId:'trapped-vault'});trapped.placement={placed:true,sceneId:'crypt',zoneId:null,position:null};
  const failedCheck=chests.applyAction(trapped,'check',{actorId:'rogue',total:1});
  assert.equal(failedCheck.success,false);assert.equal(failedCheck.chest.container.trap.detected,false);assert.equal(failedCheck.chest.container.trap.triggered,false);
  const found=chests.applyAction(failedCheck.chest,'check',{actorId:'rogue',total:30});
  const failedDisarm=chests.applyAction(found.chest,'disarm',{actorId:'rogue',total:1});
  assert.equal(failedDisarm.success,false);assert.equal(failedDisarm.chest.container.trap.disarmed,false);assert.equal(failedDisarm.chest.container.trap.triggered,false);
});

test('creature containers and mimics produce combat-engine events, not text flags',()=>{
  let mimic=chest({id:'mimic-open',templateId:'mimic',creature:{instanceId:'mimic-instance'}});mimic.placement={placed:true,sceneId:'crypt',zoneId:null,position:null};
  const reveal=chests.applyAction(mimic,'open',{actorId:'hero'});
  assert.equal(reveal.success,true);assert.equal(reveal.event.requiresCombatEngine,true);assert.equal(reveal.event.creatureInstanceId,'mimic-instance');
  let cage=chest({id:'cage',templateId:'creature-release',lockType:'none',creature:{instanceId:'released-wolf',definitionId:'foe_wolf'}});cage.placement={placed:true,sceneId:'crypt',zoneId:null,position:null};
  const released=chests.applyAction(cage,'open',{actorId:'hero'});
  assert.equal(released.event.requiresCombatEngine,true);assert.equal(released.event.creatureInstanceId,'released-wolf');
});
