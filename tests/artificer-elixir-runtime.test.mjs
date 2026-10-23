import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=v=>JSON.parse(JSON.stringify(v));
function world(){
 const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs});e.economyApi.quiet();
 e.partyStarterApi.ensureCatalogs();const built=e.partyStarterApi.prepare();assert.equal(built.ok,true,built.reason);
 const c=built.character,other=Object.assign(e.buildBlank(),{id:'friend',name:'Друг',hp:5,hpMax:30});
 e.setState({...e.state(),chars:[c,other],activeCharId:c.id});e.guardRandom();return {e,c,other,a:e.artificerElixirApi};
}
async function create(w,kind,source='slot'){
 const result=await w.a.create(w.c.id,source==='slot'?{source,kind,slotLevel:1}:{source,rolls:[kind]});assert.equal(result.success,true,result.message);
 return w.c.inventory.find(e=>e.artificerElixir);
}

test('rest elixir requires human d6, consumes one flask and one entitlement, survives a durable snapshot',async()=>{
 const w=world(),before=JSON.stringify(w.e.localSnapshot().chars);
 assert.equal(w.a.createPlan(w.c,{source:'rest',rolls:[]}).ok,false);assert.equal(JSON.stringify(w.e.localSnapshot().chars),before);
 const entry=await create(w,4,'rest');assert.equal(entry.artificerElixir.kind,'boldness');assert.equal(w.a.state(w.c).available,0);assert.equal(w.c.slots[1].cur,3);
 assert.equal(w.c.inventory.find(e=>e.itemId==='it_starter_empty_flask').qty,1);
 assert.equal(w.a.createPlan(w.c,{source:'rest',rolls:[1]}).ok,false);
 const saved=await w.e.learningApi.saved();assert.equal(saved.ok,true);assert.ok(saved.envelope.state.chars[0].inventory.some(e=>e.artificerElixir?.kind==='boldness'));
});

test('paid creation consumes exactly one slot and one action; repeat attempt cannot spend the same action',async()=>{
 const w=world();w.e.setState({...w.e.state(),combat:{...w.e.blankCombat(),active:true,id:'fight',order:[{kind:'ally',id:w.c.id,initiative:20}],turnIndex:0,turn:{actorKey:'ally:'+w.c.id,actionsUsed:0,actionMax:1}}});
 await create(w,'resilience');assert.equal(w.c.slots[1].cur,2);assert.equal(w.e.state().combat.turn.actionsUsed,1);
 const before=plain(w.e.localSnapshot().chars),result=await w.a.create(w.c.id,{source:'slot',kind:'healing',slotLevel:1});assert.equal(result.success,false);assert.deepEqual(plain(w.e.localSnapshot().chars),before);
});

test('healing takes entered d4s plus creator Intelligence, returns the bottle and cannot be consumed twice',async()=>{
 const w=world(),entry=await create(w,'healing');w.c.hp=4;
 assert.equal(w.a.usePlan(w.c.id,entry.id,'ally:'+w.c.id,{}).ok,false);
 const used=await w.a.use(w.c.id,entry.id,'ally:'+w.c.id,{healingDice:[3,4]});assert.equal(used.success,true,used.message);assert.equal(w.c.hp,14);assert.equal(w.c.inventory.find(e=>e.itemId==='it_starter_empty_flask').qty,2);
 const again=await w.a.use(w.c.id,entry.id,'ally:'+w.c.id,{healingDice:[3,4]});assert.equal(again.success,false);assert.equal(w.c.hp,14);
});

test('a conscious ally drinks their own transferred elixir; administering requires unconsciousness and touch',async()=>{
 const w=world(),entry=await create(w,'healing');
 assert.equal(w.a.usePlan(w.c.id,entry.id,'ally:'+w.other.id,{healingDice:[1,1],withinTouch:true}).ok,false);
 w.other.hp=0;assert.equal(w.a.usePlan(w.c.id,entry.id,'ally:'+w.other.id,{healingDice:[1,1]}).ok,false);
 const used=await w.a.use(w.c.id,entry.id,'ally:'+w.other.id,{healingDice:[2,3],withinTouch:true});assert.equal(used.success,true,used.message);assert.equal(w.other.hp,8);assert.equal(w.other.deaths.f,0);
 const second=await create(w,'resilience');w.c.inventory=w.c.inventory.filter(e=>e!==second);w.other.inventory.push(second);
 const drunk=await w.a.use(w.other.id,second.id,'ally:'+w.other.id);assert.equal(drunk.success,true,drunk.message);assert.equal(w.e.acTotal(w.other),11);
});

for(const [kind,duration,stat,value] of [['swiftness',600,'speed',3],['resilience',100,'ac',1],['boldness',10,'attack','1d4'],['flight',100,'speed.fly','3 м'],['transformation',100,'speed.swim','равна скорости ходьбы']]){
 test(kind+': real effects have exact duration, no concentration and do not stack with themselves',async()=>{
  const w=world(),entry=await create(w,kind),input=kind==='transformation'?{transformationChoice:'aquatic'}:{};
  const result=await w.a.use(w.c.id,entry.id,'ally:'+w.c.id,input);assert.equal(result.success,true,result.message);
  const marker=w.c.activeFx.find(e=>e.artificerElixirEffect===kind);assert.equal(marker.expiresAtRound,w.e.state().fxRound+duration);assert.equal(!!marker.concentration,false);
  const effects=w.e.abilitiesApi.charFxAll(w.c);assert.ok(effects.some(f=>f.stat===stat&&f.value===value&&String(f.label).startsWith('Эликсир:')));
  if(kind==='boldness'){const attack=w.e.charactersApi.rollFxEntries(w.c,'attack.str'),save=w.e.charactersApi.rollFxEntries(w.c,'save.con');assert.ok(attack.some(f=>f.mode==='die'&&f.value==='1d4'));assert.ok(save.some(f=>f.mode==='die'&&f.value==='1d4'));}
  const second=await create(w,kind);assert.equal((await w.a.use(w.c.id,second.id,'ally:'+w.c.id,input)).success,true);
  const matching=w.e.abilitiesApi.charFxAll(w.c).filter(f=>f.stat===stat&&f.value===value&&String(f.label).startsWith('Эликсир:'));assert.equal(matching.length,1);
  w.a.round(duration);assert.equal(w.e.abilitiesApi.charFxAll(w.c).some(f=>f.stat===stat&&f.value===value&&String(f.label).startsWith('Эликсир:')),false);
 });
}

test('creator next rest expires a transferred flask even after a class change without refilling slots of other heroes',async()=>{
 const w=world(),entry=await create(w,'resilience');w.c.inventory=w.c.inventory.filter(e=>e!==entry);w.other.inventory.push(entry);w.c.cls='Воин';w.c.subcls='Чемпион';
 const otherHp=w.other.hp;w.a.rest(w.c);assert.equal(w.other.inventory.some(e=>e.artificerElixir),false);assert.equal(w.other.inventory.find(e=>e.itemId==='it_starter_empty_flask').qty,1);assert.equal(w.other.hp,otherHp);assert.equal(w.a.state(w.c).available,0);
});

test('failed persistence rolls back paid creation and drinking including dice healing and inventory',async()=>{
 const w=world(),entry=await create(w,'healing');w.c.hp=3;const before=plain(w.e.state().chars);w.e.learningApi.persistence(async()=>false);
 const drink=await w.a.use(w.c.id,entry.id,'ally:'+w.c.id,{healingDice:[4,4]});assert.equal(drink.success,false);assert.deepEqual(plain(w.e.state().chars),before);
 const made=await w.a.create(w.c.id,{source:'slot',kind:'flight',slotLevel:1});assert.equal(made.success,false);assert.deepEqual(plain(w.e.state().chars),before);
});

test('natural weapons replace fixed unarmed damage with entered d6 and retain magical damage',async()=>{
 const w=world(),entry=await create(w,'transformation');assert.equal((await w.a.use(w.c.id,entry.id,'ally:'+w.c.id,{transformationChoice:'natural-weapons',naturalWeaponDamage:'slashing'})).success,true);
 const spec={rows:[{key:'atk',type:'atk',mod:1},{key:'dmg',type:'dmg',fixed:true,mod:0}],meta:{}};w.a.unarmed(w.c,spec);
 assert.equal(spec.rows[0].mod,2);assert.equal(spec.rows[1].sides,6);assert.equal(spec.rows[1].fixed,undefined);assert.equal(spec.meta.damageTags.magical,true);
});

test('natural weapon actual roll formula retains existing damage bonuses exactly once and requests a physical d6',async()=>{
 const w=world(),entry=await create(w,'transformation');assert.equal((await w.a.use(w.c.id,entry.id,'ally:'+w.c.id,{transformationChoice:'natural-weapons',naturalWeaponDamage:'slashing'})).success,true);
 w.c.activeFx.push({uid:'unarmed-training',fx:[{stat:'unarmed.dmg',mode:'add',value:2}]});w.other.damageRules=[{mode:'resist',types:['рубящий'],when:'nonmagical'}];w.e.setState(w.e.state());
 const weapon={n:'Безоружный удар',unarmed:true,atk:1,m:-1,dmg:'',dt:'дробящий',mode:'melee',within5:true,flat:true};
 const spec=w.e.rollSpecOf({id:'unarmed-test',n:'Безоружный удар',desc:''},{kind:'ability',caster:w.c,target:w.e.targetInfoOf('ally:'+w.other.id),weapon,forceAttack:true});
 const damage=spec.rows.find(r=>r.type==='dmg'&&!r.sourceUid);assert.ok(damage);assert.equal(damage.sides,6);assert.equal(damage.mod,2);assert.equal(damage.fixed,undefined);assert.equal(damage.required,true);assert.equal(spec.meta.damageTags.magical,true);
 const attack=spec.rows.find(r=>r.type==='atk'),outcome=w.e.resolveOutcome(spec,{[attack.key]:15,[damage.key]:4});assert.equal(outcome.hit,true);assert.equal(outcome.dmgTotal,6,'magical weapon bypasses nonmagical physical resistance');assert.equal(outcome.dmgType,'рубящий');
 w.e.charactersApi.finalizeRollSpec(spec,spec.contract.source);assert.equal(damage.mod,2,'finalization does not duplicate or remove the extra damage');
 w.other.resist=['рубящий'];w.e.setState(w.e.state());const defended=w.e.rollSpecOf({id:'unarmed-test',n:'Безоружный удар',desc:''},{kind:'ability',caster:w.c,target:w.e.targetInfoOf('ally:'+w.other.id),weapon,forceAttack:true});
 assert.equal(w.e.resolveOutcome(defended,{[attack.key]:15,[damage.key]:4}).dmgTotal,3,'ordinary physical resistance still applies to the actual damage type');
});

test('free elixir after rest survives persistence property reordering but not a changed slot',()=>{
 const w=world();assert.equal(w.a.createPlan(w.c,{source:'rest',rolls:[1]}).ok,true);
 w.c.slots=Object.fromEntries(Object.entries(w.c.slots).map(([level,slot])=>[level,{cur:slot.cur,max:slot.max}]));
 assert.equal(w.a.createPlan(w.c,{source:'rest',rolls:[1]}).ok,true);w.c.slots[1].cur--;assert.equal(w.a.createPlan(w.c,{source:'rest',rolls:[1]}).ok,false);
});

test('an alchemist-themed item cannot replace supplies; dead recipients preserve the unspent elixir',async()=>{
 const w=world(),entry=await create(w,'resilience');w.other.hp=0;w.other.deaths={s:0,f:3};const before=plain(w.e.state().chars);
 const result=await w.a.use(w.c.id,entry.id,'ally:'+w.other.id,{withinTouch:true});assert.equal(result.success,false);assert.deepEqual(plain(w.e.state().chars),before);
 w.c.inventory=w.c.inventory.filter(e=>!String(w.e.itemsApi.execution(e.itemId)?.n||'').toLowerCase().includes('алхимик'));
 w.e.state().items.push({id:'alchemist-coat',n:'Плащ алхимика',type:'equipment',custom:true});w.c.inventory.push({id:'coat',itemId:'alchemist-coat',qty:1});
 assert.equal(w.a.createPlan(w.c,{source:'slot',kind:'resilience',slotLevel:1}).ok,false);
});

test('empty flasks consumed and held elixirs expired by rest leave no dangling equipment',async()=>{
 const w=world(),flask=w.c.inventory.find(e=>e.itemId==='it_starter_empty_flask');flask.qty=1;w.c.equipment.OFF_HAND=flask.id;
 const entry=await create(w,'flight');assert.notEqual(w.c.equipment.OFF_HAND,flask.id);w.c.equipment.OFF_HAND=entry.id;
 w.a.rest(w.c);assert.notEqual(w.c.equipment.OFF_HAND,entry.id);assert.ok(w.c.inventory.some(e=>e.itemId==='it_starter_empty_flask'));
});

test('MP mode pays the same first-circle resource without recreating classic slots',async()=>{
 const w=world();w.e.setState({...w.e.state(),campaignMagic:{version:1,mode:'mp',preparation:'class',revision:1}});w.e.charactersApi.magicEnsure(w.c);
 assert.equal(w.e.charactersApi.magicPool(w.c).cur,6);assert.deepEqual(plain(w.c.slots),{});
 await create(w,'healing');assert.equal(w.e.charactersApi.magicPool(w.c).cur,4);assert.deepEqual(plain(w.c.slots),{});
});
