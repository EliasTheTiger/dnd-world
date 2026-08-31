const assert=require('node:assert/strict');
const test=require('node:test');
const Chests=require('../scripts/chest-core.js');

const contexts=['dungeon','forest','desert','urban','cave'];
const catalog=[
  {id:'generic-common',name:'Generic common',rarity:'common',kind:'tool',tags:['general'],minLevel:1,maxLevel:20},
  ...contexts.flatMap((context,contextIndex)=>[
    {id:`${context}-common`,name:`${context} common`,rarity:'common',kind:'consumable',tags:[context],contexts:[context],minLevel:1,maxLevel:20},
    {id:`${context}-uncommon`,name:`${context} uncommon`,rarity:'uncommon',kind:'potion',tags:[context],contexts:[context],minLevel:1,maxLevel:20},
    {id:`${context}-rare`,name:`${context} rare`,rarity:'rare',kind:'weapon',tags:[context],contexts:[context],minLevel:5,maxLevel:20,stackable:false},
    {id:`${context}-very-rare`,name:`${context} very rare`,rarity:'very-rare',kind:'armor',tags:[context],contexts:[context],minLevel:11,maxLevel:20,stackable:false},
    {id:`${context}-legendary`,name:`${context} legendary`,rarity:'legendary',kind:'weapon',tags:[context],contexts:[context],minLevel:17,maxLevel:20,stackable:false},
  ]),
  {id:'invalid-container',name:'Container',rarity:'common',kind:'container'},
  {id:'invalid-creature',name:'Creature',rarity:'common',kind:'creature'},
  {id:'invalid-impossible',name:'Impossible',rarity:'common',kind:'tool',impossible:true},
  {id:'story-relic',name:'Story relic',rarity:'artifact',kind:'valuable',storyOnly:true,unique:true},
];
const catalogIds=new Set(catalog.map(row=>row.id));

function makeChest(index=0,overrides={}){
  return Chests.createChest(Object.assign({
    id:`developer-chest-${index}`,templateId:'wooden-cache',environment:contexts[index%contexts.length],
    recommendedLevel:1+(index%20),rewardLevel:index%6,itemCount:1+(index%6),rewardMode:'mixed',
  },overrides));
}
function place(chest){const row=Chests.clone(chest);row.placement={placed:true,sceneId:'developer-scene',zoneId:null,position:null};return Chests.normalizeChest(row);}
function unlock(chest){const row=Chests.clone(chest),container=Chests.containerOf(row);container.lock.type='none';container.lock.opened=true;return Chests.normalizeChest(row);}
function approved(chest,draft={items:[{itemId:'generic-common',qty:1}],currency:{gp:1},notes:''}){
  const changed=Chests.replaceLootDraft(chest,catalog,draft);assert.equal(changed.ok,true,changed.issues&&changed.issues.join(','));
  const result=Chests.approveLoot(changed.chest,catalog);assert.equal(result.ok,true,result.issues&&result.issues.join(','));return result.chest;
}
function snapshot(value){return JSON.stringify(value);}

// 1-100: every template and every required model field survives canonical normalization.
for(let index=0;index<100;index++){
  test(`chest developer model ${index+1}/100 normalizes every required field`,()=>{
    const template=Chests.TEMPLATES[index%Chests.TEMPLATES.length],max=1+(index*37)%500,current=(index*19)%(max+1),row=Chests.createChest({
      id:`model-${index}`,templateId:template.id,name:`Model ${index}`,environment:contexts[index%contexts.length],
      durability:{max,current},lockType:index%2?'complex':'none',lockDC:index%41,recommendedLevel:1+(index%20),rewardLevel:index%6,itemCount:index%51,
      rewardMode:['auto','empty','currency','items','mixed','fixed'][index%6],
      trap:{enabled:index%2===0,type:`trap-${index}`,detectionDC:index%41,disarmDC:(index+3)%41,saveDC:(index+7)%41,damageFormula:`${1+index%5}d6`,damageType:'acid'},
      creature:{instanceId:`creature-${index}`,definitionId:'foe-test'},
    });
    const physical=Chests.physicalOf(row);
    assert.ok(row.id&&row.name&&row.schemaVersion);
    assert.ok(Chests.STATES.includes(row.state));assert.ok(Chests.VARIANTS.includes(row.variant));
    assert.ok(physical.size&&physical.material&&physical.quality&&physical.environment);
    assert.deepEqual(physical.durability,{current,max});
    assert.ok(physical.lock&&Number.isInteger(physical.lock.dc));
    assert.ok(physical.trap&&Number.isInteger(physical.trap.detectionDC)&&Number.isInteger(physical.trap.disarmDC));
    assert.equal(row.placement.placed,false);assert.deepEqual(row.knowledge,{inspectedBy:[],checkedBy:[],revealed:false,decoyKnown:false});
    if(template.variant==='mimic'){
      assert.equal(row.kind,'creature');assert.equal(row.schemaVersion,Chests.CREATURE_ENCOUNTER_SCHEMA);assert.equal(row.container,undefined);assert.equal(row.creature.combatant,true);
    }else{
      assert.equal(row.kind,'container');assert.equal(row.schemaVersion,Chests.CHEST_SCHEMA);assert.ok(row.container.loot&&row.container.lootTable);
      assert.equal(row.container.recommendedLevel,1+(index%20));assert.equal(row.container.rewardLevel,index%6);assert.equal(row.container.itemCount,index%51);
    }
  });
}

// 101-200: deterministic generation across seeds, contexts, levels, rarities and reward modes.
for(let index=0;index<100;index++){
  test(`chest developer generation ${index+1}/100 is deterministic and Item-ID safe`,()=>{
    const mode=['empty','currency','items','mixed','auto'][index%5],level=1+(index%20),reward=Math.min(5,index%6),chest=makeChest(index,{recommendedLevel:level,rewardLevel:reward,rewardMode:mode,itemCount:1+(index%5)}),seed=`developer-seed:${index}`;
    const first=Chests.generateLoot(chest,catalog,seed),second=Chests.generateLoot(chest,catalog,seed);
    assert.equal(first.ok,true,first.issues&&first.issues.join(','));assert.deepEqual(first.loot,second.loot);assert.equal(first.loot.seed,seed);
    assert.equal(first.loot.status,'draft');assert.equal(first.loot.validation.ok,true);
    if(first.loot.mode==='empty'){assert.deepEqual(first.loot.draft.items,[]);assert.equal(first.loot.draft.currency.totalCopper,0);}
    if(first.loot.mode==='currency'){assert.deepEqual(first.loot.draft.items,[]);assert.ok(first.loot.draft.currency.totalCopper>0);}
    for(const entry of first.loot.draft.items){
      assert.equal(catalogIds.has(entry.itemId),true);assert.ok(entry.qty>=1);
      assert.doesNotMatch(entry.itemId,/^invalid-/);assert.notEqual(entry.itemId,'story-relic');
    }
    assert.equal(Chests.validateLootDraft(first.chest,catalog,first.loot.draft).ok,true);
  });
}

// 201-300: GM draft editing, fixed story rewards and approval always fail closed.
for(let index=0;index<100;index++){
  test(`chest developer review ${index+1}/100 validates before approval`,()=>{
    const branch=index%5,chest=makeChest(index,{recommendedLevel:3,rewardLevel:1,rewardMode:'items',itemCount:1});
    if(branch===0){
      const changed=Chests.replaceLootDraft(chest,catalog,{items:[{itemId:'dungeon-common',qty:1+index%9}],currency:{gp:index},notes:`GM ${index}`});
      assert.equal(changed.ok,true);const done=Chests.approveLoot(changed.chest,catalog);assert.equal(done.ok,true);assert.equal(done.loot.status,'approved');assert.deepEqual(done.loot.approved,changed.loot.draft);
    }else if(branch===1){
      const changed=Chests.replaceLootDraft(chest,catalog,{items:[{itemId:`missing-${index}`,qty:1}],currency:{}}),before=snapshot(changed.chest);
      assert.equal(changed.ok,false);assert.match(changed.issues.join(','),/UNKNOWN_ITEM_ID/);const done=Chests.approveLoot(changed.chest,catalog);assert.equal(done.ok,false);assert.equal(done.code,'LOOT_VALIDATION_FAILED');assert.equal(snapshot(done.chest),before);
    }else if(branch===2){
      const changed=Chests.replaceLootDraft(chest,catalog,{items:[{itemId:'dungeon-legendary',qty:1}],currency:{}});
      assert.equal(changed.ok,false);assert.match(changed.issues.join(','),/INCOMPATIBLE_ITEM/);assert.equal(Chests.approveLoot(changed.chest,catalog).ok,false);
    }else if(branch===3){
      const story=makeChest(index,{templateId:'story',recommendedLevel:1,rewardLevel:0,rewardMode:'fixed'}),changed=Chests.replaceLootDraft(story,catalog,{items:[{itemId:'story-relic',qty:1}],currency:{},notes:'Fixed plot reward'}),done=Chests.approveLoot(changed.chest,catalog);
      assert.equal(changed.ok,true);assert.equal(done.ok,true);assert.equal(done.loot.approved.items[0].itemId,'story-relic');
    }else{
      const changed=Chests.replaceLootDraft(chest,catalog,{items:[{itemId:'generic-common',qty:5000}],currency:{cp:-1,sp:2,ep:3,gp:4,pp:5},notes:'  normalized  '});
      assert.equal(changed.ok,true);assert.equal(changed.loot.draft.items[0].qty,999);assert.equal(changed.loot.draft.currency.totalCopper,5570);assert.equal(changed.loot.draft.notes,'normalized');
      const done=Chests.approveLoot(changed.chest,catalog);assert.equal(done.ok,true);assert.deepEqual(done.loot.approved,changed.loot.draft);
    }
  });
}

// 301-400: ActionEvaluation returns ALLOWED or one exact reason without mutation.
for(let index=0;index<100;index++){
  test(`chest developer evaluation ${index+1}/100 is explicit and non-mutating`,()=>{
    const branch=index%10;let chest=makeChest(index,{lockType:'simple',lockDC:12}),action='open',context={actorId:'hero',actorAlive:true},expected='';
    if(branch===0){expected='CHEST_NOT_PLACED';}
    else{chest=place(chest);if(branch===1){context.actorId='';expected='CHEST_ACTOR_REQUIRED';}
      else if(branch===2){context.actorAlive=false;expected='ACTOR_DOWN';}
      else if(branch===3){expected='CHEST_LOCKED';}
      else if(branch===4){chest=unlock(chest);action='pick';expected='CHEST_HAS_NO_LOCK';}
      else if(branch===5){chest=makeChest(index,{templateId:'trapped-vault'});chest=place(chest);action='disarm';expected='TRAP_NOT_DETECTED';}
      else if(branch===6){chest=unlock(chest);action='open';expected='LOOT_NOT_APPROVED';}
      else if(branch===7){chest=makeChest(index,{templateId:'story'});chest=place(chest);chest=unlock(chest);action='open';expected='STORY_LOOT_NOT_APPROVED';}
      else if(branch===8){chest=makeChest(index,{templateId:'decoy',lockType:'none'});chest=place(chest);action='open';expected='ALLOWED';}
      else{action='unknown-action';expected='UNKNOWN_CHEST_ACTION';}
    }
    const before=snapshot(chest),result=Chests.evaluateAction(chest,action,context);
    assert.equal(result.reasonCode,expected);assert.equal(result.allowed,expected==='ALLOWED');assert.ok(result.explanation);assert.equal(snapshot(chest),before);
  });
}

// 401-500: checks, locks, traps, opening and durability use exact state transitions.
for(let index=0;index<100;index++){
  test(`chest developer transition ${index+1}/100 commits one exact consequence`,()=>{
    const branch=index%5;
    if(branch===0){
      let chest=place(makeChest(index,{lockType:'complex',lockDC:15})),failed=Chests.applyAction(chest,'pick',{actorId:'rogue',total:14});
      assert.equal(failed.success,false);assert.equal(failed.chest.state,'closed');assert.equal(failed.chest.container.lock.opened,false);
      const passed=Chests.applyAction(failed.chest,'pick',{actorId:'rogue',total:15});assert.equal(passed.success,true);assert.equal(passed.code,'LOCK_PICKED');assert.equal(passed.chest.state,'forced');assert.equal(passed.chest.revision,failed.chest.revision+1);
    }else if(branch===1){
      let chest=place(makeChest(index,{templateId:'trapped-vault'})),failed=Chests.applyAction(chest,'check',{actorId:'rogue',total:chest.container.trap.detectionDC-1});
      assert.equal(failed.success,false);assert.equal(failed.chest.container.trap.detected,false);assert.equal(failed.chest.container.trap.triggered,false);
      const passed=Chests.applyAction(failed.chest,'check',{actorId:'rogue',total:chest.container.trap.detectionDC});assert.equal(passed.success,true);assert.equal(passed.chest.container.trap.detected,true);
    }else if(branch===2){
      let chest=place(makeChest(index,{templateId:'trapped-vault'}));chest.container.trap.detected=true;chest=Chests.normalizeChest(chest);
      const failed=Chests.applyAction(chest,'disarm',{actorId:'rogue',total:chest.container.trap.disarmDC-1});assert.equal(failed.success,false);assert.equal(failed.chest.container.trap.disarmed,false);assert.equal(failed.chest.container.trap.triggered,false);
      const passed=Chests.applyAction(failed.chest,'disarm',{actorId:'rogue',total:chest.container.trap.disarmDC});assert.equal(passed.success,true);assert.equal(passed.chest.container.trap.disarmed,true);
    }else if(branch===3){
      let chest=place(makeChest(index)),start=chest.container.durability.current,partial=Chests.applyAction(chest,'destroy',{actorId:'fighter',damage:Math.max(0,start-1)});
      assert.equal(partial.code,'CHEST_DAMAGED');assert.equal(partial.chest.container.durability.current,1);const done=Chests.applyAction(partial.chest,'destroy',{actorId:'fighter',damage:1});assert.equal(done.code,'CHEST_DESTROYED');assert.equal(done.chest.state,'destroyed');assert.equal(done.chest.container.durability.current,0);
    }else{
      let chest=place(unlock(approved(makeChest(index,{templateId:'trapped-vault',lockType:'none'})))),opened=Chests.applyAction(chest,'open',{actorId:'hero'});
      assert.equal(opened.success,true);assert.equal(opened.code,'CHEST_OPENED_TRAP_TRIGGERED');assert.equal(opened.chest.container.trap.triggered,true);assert.equal(opened.event.trapTriggered,true);assert.equal(opened.chest.state,'opened');
    }
  });
}

// 501-600: special variants, money, state persistence and reproducibility stay structured.
for(let index=0;index<100;index++){
  test(`chest developer special ${index+1}/100 preserves structured contracts`,()=>{
    const branch=index%10;
    if(branch===0){
      const chest=place(makeChest(index,{templateId:'mimic',creature:{instanceId:`mimic-${index}`}})),result=Chests.applyAction(chest,'open',{actorId:'hero'});assert.equal(result.code,'CREATURE_REVEALED');assert.equal(result.event.requiresCombatEngine,true);assert.equal(result.event.creatureInstanceId,`mimic-${index}`);assert.equal(result.chest.container,undefined);
    }else if(branch===1){
      const chest=place(makeChest(index,{templateId:'creature-release',lockType:'none',creature:{instanceId:`release-${index}`,definitionId:'foe-wolf'}})),result=Chests.applyAction(chest,'open',{actorId:'hero'});assert.equal(result.code,'CREATURE_RELEASED');assert.equal(result.event.requiresCombatEngine,true);assert.equal(result.event.creatureInstanceId,`release-${index}`);
    }else if(branch===2){
      const chest=place(makeChest(index,{templateId:'decoy',lockType:'none'})),result=Chests.applyAction(chest,'open',{actorId:'hero'});assert.equal(result.code,'DECOY_OPENED');assert.equal(result.chest.state,'opened');assert.equal(Chests.lootOf(result.chest).approved,null);
    }else if(branch===3){
      const money=Chests.moneyFromCopper(index*10007),roundtrip=Chests.normalizeMoney(money);assert.equal(roundtrip.totalCopper,index*10007);assert.equal(money.totalCopper,roundtrip.totalCopper);
    }else if(branch===4){
      const a=Chests.seededRandom(`stable-${index}`),b=Chests.seededRandom(`stable-${index}`),first=Array.from({length:8},()=>a()),second=Array.from({length:8},()=>b());assert.deepEqual(first,second);assert.ok(first.every(value=>value>=0&&value<1));assert.ok(new Set(first).size>1);
    }else if(branch===5){
      const valid=makeChest(index),state=Chests.normalizeState({revision:index,instances:[valid,{name:'missing id'}],events:[{id:`event-${index}`} ]});assert.equal(state.instances.length,1);assert.equal(state.instances[0].id,valid.id);assert.equal(state.events[0].id,`event-${index}`);assert.equal(state.revision,index);
    }else if(branch===6){
      let chest=place(makeChest(index)),one=Chests.applyAction(chest,'inspect',{actorId:'hero'}),two=Chests.applyAction(one.chest,'inspect',{actorId:'hero'});assert.deepEqual(two.chest.knowledge.inspectedBy,['hero']);assert.equal(two.chest.revision,one.chest.revision+1);
    }else if(branch===7){
      const mimic=makeChest(index,{templateId:'mimic'}),before=snapshot(mimic),result=Chests.generateLoot(mimic,catalog,'forbidden');assert.equal(result.ok,false);assert.equal(result.code,'CREATURE_IS_NOT_CONTAINER');assert.equal(snapshot(mimic),before);
    }else if(branch===8){
      const chest=makeChest(index,{lootTable:[{itemId:`missing-${index}`,weight:1}],rewardMode:'items',itemCount:1}),before=snapshot(chest),result=Chests.generateLoot(chest,catalog,'bad-table');assert.equal(result.ok,false);assert.equal(result.code,'UNKNOWN_LOOT_TABLE_ITEM');assert.equal(snapshot(chest),before);
    }else{
      const chest=place(makeChest(index)),before=snapshot(chest),result=Chests.applyAction(chest,'not-real',{actorId:'hero'});assert.equal(result.ok,false);assert.equal(result.code,'UNKNOWN_CHEST_ACTION');assert.equal(snapshot(result.chest),before);
    }
  });
}
