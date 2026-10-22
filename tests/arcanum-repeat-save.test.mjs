import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const success=result=>result===true||result?.success===true||result?.ok===true;
async function world(targetExtra={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const caster=Object.assign(e.buildBlank(),{id:'stun-caster',name:'Колдун',cls:'Колдун',subcls:'Исчадие',level:15,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:18}});
  const target=Object.assign(e.buildBlank(),{id:'stun-target',name:'Оглушённая цель',hp:120,hpMax:120,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saves:{},cond:[]},targetExtra);
  e.setState({...e.catalogs,chars:[caster,target],activeCharId:caster.id});a.withoutPresentation();l.quiet();e.combatLifecycleApi.quiet();e.guardRandom();
  a.characterAdopt(caster);a.applyClassSlots(caster);a.upgradeSpellcastingState(caster);
  const sp=e.state().spells.find(s=>e.grimoireApi.grimoireActive(s)&&s.grimoire?.english==='Power Word Stun');assert.ok(sp);
  assert.equal(success(await l.select(caster.id,sp.id,'arcanum',{circle:8})),true);
  const spec=e.rollSpecOf(sp,{kind:'spell',caster,slotLvl:8,target:e.targetInfoOf('ally:'+target.id)}),outcome=e.resolveOutcome(spec,{});
  const rolls=a.castFormulaRollsBuild(spec,{},outcome).rolls;
  assert.equal(success(await e.arcanumApi.cast(sp.id,caster.id,'ally:'+target.id,'',undefined,'8:arcanum',rolls)),true,e.elementText('saveStatus'));
  const foe=e.state().foes[0],nextKey='foe:'+foe.id;
  assert.equal(e.combatStart([{kind:'ally',id:target.id,nat:20},{kind:'foe',id:foe.id,nat:1}],'Повторные спасброски'),true,e.elementText('saveStatus'));
  assert.equal(await e.saveWorldNow(),true);
  const key='ally:'+target.id,api=e.arcanumRuntime;
  assert.ok(api,'runtime exposes repeat-save adapters');
  const entry=target.activeFx.find(f=>f.id===sp.id&&f.arcanumRepeat);
  return {e,a,l,caster,target,sp,key,nextKey,api,entry};
}
function values(spec,natural=1){return Object.fromEntries(spec.rows.map(r=>[r.key,r.max===20?natural:r.min]));}
function opened(w,entry=w.entry){return w.api.saveSpec(w.key,entry.repeatSave,entry.label);}
function commit(w,spec=opened(w),input=values(spec),entry=w.entry,stamp=w.api.stamp()){return w.api.repeatCommit(w.key,entry.uid,stamp,spec,input);}
async function submit(w,natural=1){const spec=w.e.combatLifecycleApi.roll();assert.ok(spec);spec.rows.forEach((r,index)=>w.e.setElementValue('rollV'+index,r.max===20?natural:r.min));return await w.a.rollDone();}

test('Power Word Stun waits until target end turn and requests real CON; cancelling preserves the turn',async()=>{
  const w=await world();assert.ok(w.entry);assert.equal(w.entry.repeatSave.key,'con');assert.equal(w.entry.repeatSave.when,'end');
  assert.equal(w.e.combatLifecycleApi.roll(),null);const before=plain([w.target,w.e.state().combat]);
  assert.equal(w.e.combatNextTurn(),true);assert.match(w.e.combatLifecycleApi.roll().title,/Повторный спасбросок/);
  assert.equal(w.e.combatNextTurn(),false,'cannot bypass the open request');
  w.a.rollCancel();assert.deepEqual(plain([w.target,w.e.state().combat]),before);assert.equal(w.api.pending(w.key).length,1);
});
test('failed repeat keeps stun, advances after input, and asks again on next target turn',async()=>{
  const w=await world();assert.equal(w.e.combatNextTurn(),true);await submit(w,1);
  assert.ok(w.e.effectiveConditions(w.target).includes('Ошеломленный'));assert.equal(w.e.state().combat.turn.actorKey,w.nextKey);
  assert.equal(w.e.combatNextTurn(),true);assert.equal(w.e.state().combat.turn.actorKey,w.key);assert.equal(w.api.pending(w.key).length,1);
  assert.equal(w.e.combatNextTurn(),true);await submit(w,20);assert.ok(!w.e.effectiveConditions(w.target).includes('Ошеломленный'));
});
test('natural 20 is not automatic success and missing or out-of-range rolls do not mutate a repeat',async()=>{
  const w=await world();w.entry.repeatSave.dc=25;const spec=opened(w),before=plain([w.target,w.e.state().combat]);
  for(const input of [{},values(spec,0),values(spec,21),values(spec,1.5)]){
    assert.equal(success(await commit(w,spec,input)),false);assert.deepEqual(plain([w.target,w.e.state().combat]),before);
  }
  assert.equal(success(await commit(w,spec,values(spec,20))),true);assert.ok(w.e.effectiveConditions(w.target).includes('Ошеломленный'));assert.equal(w.e.state().combat.turn.repeatSaveReceipts[w.entry.uid].success,false);
});
test('successful repeat removes only its own spell source, preserving unrelated stun and conditions',async()=>{
  const w=await world();w.e.tabletopApi.applyFx(w.target.id,{uid:'other-stun',k:'ability',id:'other',label:'Другое оглушение',fx:[{stat:'condition',mode:'set',value:'Ошеломленный'}]});
  w.target.cond.push('Сбитый с ног');const result=await commit(w,opened(w),values(opened(w),20));assert.equal(success(result),true,result.message);
  assert.ok(!w.target.activeFx.some(f=>f.uid===w.entry.uid));assert.ok(w.target.activeFx.some(f=>f.id==='other'));
  assert.ok(w.e.effectiveConditions(w.target).includes('Ошеломленный'));assert.ok(w.e.effectiveConditions(w.target).includes('Сбитый с ног'));
  assert.equal(w.caster.mysticArcanum.choices[8].spent,true,'repeat saves neither spend nor refund the arcanum');
});
test('condition immunity prevents stun and therefore prevents a meaningless repeat request',async()=>{
  const w=await world({condImmune:['Ошеломленный']});assert.equal(w.entry,undefined);
  assert.ok(!w.e.effectiveConditions(w.target).includes('Ошеломленный'));assert.equal(w.api.pending(w.key).length,0);
  assert.equal(w.e.combatNextTurn(),true);assert.equal(w.e.combatLifecycleApi.roll(),null);
});
test('repeat DC is fixed when cast and existing saved stun effects gain an end-turn save',async()=>{
  const w=await world(),dc=w.entry.repeatSave.dc;w.caster.ab.cha=8;
  assert.equal(opened(w).save.hit.save.dc,dc,'later caster changes do not rewrite the original save DC');
  delete w.entry.arcanumRepeat;delete w.entry.repeatSave;w.entry.saveDC=dc;w.entry.expiresAtRound=2;
  assert.equal(w.api.pending(w.key).length,1);assert.equal(w.entry.repeatSave.dc,dc);assert.equal(w.entry.repeatSave.key,'con');assert.equal(w.entry.expiresAtRound,undefined);
  assert.equal(w.entry.durationKind,'manual','stun lasts until the successful save rather than an old guessed round count');
});
test('failed receipt survives cancelling a later effect and reload without granting a second save',async()=>{
  const w=await world(),other={...plain(w.entry),uid:'second-stun',castId:'another-cast',label:'Второе оглушение'};w.target.activeFx.push(other);
  assert.equal(w.e.combatNextTurn(),true);await submit(w,1);assert.equal(w.e.state().combat.turn.actorKey,w.key);assert.match(w.e.combatLifecycleApi.roll().note,/Второе оглушение/);
  const receipt=plain(w.e.state().combat.turn.repeatSaveReceipts[w.entry.uid]);assert.equal(receipt.success,false);
  w.a.rollCancel();assert.equal(w.api.pending(w.key).length,1);assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  const pending=w.api.pending(w.key);assert.equal(pending.length,1);assert.equal(pending[0].uid,other.uid);assert.deepEqual(plain(w.e.state().combat.turn.repeatSaveReceipts[w.entry.uid]),receipt);
  assert.equal(w.e.combatNextTurn(),true);assert.match(w.e.combatLifecycleApi.roll().note,/Второе оглушение/);w.a.rollCancel();
});
test('repeat requests both advantage dice and Bless die, and consumes one-use bonus only on commit',async()=>{
  const w=await world();w.e.tabletopApi.applyFx(w.target.id,{id:'con-advantage',k:'test',label:'Преимущество',fx:[{stat:'save.con',mode:'adv',value:1}]});
  w.e.tabletopApi.applyFx(w.target.id,{id:'bless-once',k:'test',label:'Благословение',fx:[{stat:'save',mode:'die',value:'1d4',consume:'roll'}]});
  const spec=opened(w);assert.equal(spec.save.adv,1);assert.equal(spec.rows.filter(r=>r.max===20).length,2);assert.equal(spec.rows.filter(r=>r.max===4).length,1);
  const input=values(spec);input[spec.save.rowKey]=1;input[spec.save.rowKey+'_2']=15;input[spec.save.dice[0].key]=4;
  assert.equal(spec.total(input),19);assert.equal(success(await commit(w,spec,{...input,[spec.save.rowKey+'_2']:undefined})),false);
  assert.ok(w.target.activeFx.some(f=>f.id==='bless-once'));assert.equal(success(await commit(w,spec,input)),true);
  assert.ok(!w.target.activeFx.some(f=>f.uid===w.entry.uid));assert.ok(!w.target.activeFx.some(f=>f.id==='bless-once'));assert.ok(w.target.activeFx.some(f=>f.id==='con-advantage'));
});
test('failed persistence restores effect, receipt and bonus die; same physical results can be retried',async()=>{
  const w=await world();w.e.tabletopApi.applyFx(w.target.id,{id:'bonus-once',k:'test',label:'Бонус',fx:[{stat:'save',mode:'die',value:'1d4',consume:'roll'}]});
  const spec=opened(w),input=values(spec,20),before=plain([w.target,w.e.state().combat]),restore=w.l.persistence(async()=>false);
  const rejected=await commit(w,spec,input);assert.equal(success(rejected),false);assert.deepEqual(plain([w.target,w.e.state().combat]),before);
  restore();assert.equal(success(await commit(w,spec,input)),true);assert.ok(!w.target.activeFx.some(f=>f.uid===w.entry.uid));
});
test('foe repeat also consumes its own one-use saving die and preserves unrelated effects',async()=>{
  const w=await world(),foe=w.e.state().foes.find(f=>'foe:'+f.id===w.nextKey),entry={...plain(w.entry),uid:'foe-stun',castId:'foe-stun-cast'};
  w.e.tabletopApi.applyFxFoe(foe,entry);w.e.tabletopApi.applyFxFoe(foe,{uid:'foe-save-bonus',id:'foe-save-bonus',k:'test',label:'Бонус противника',fx:[{stat:'save.con',mode:'die',value:'1d4',consume:'roll'}]});
  w.e.tabletopApi.applyFxFoe(foe,{uid:'foe-armor',id:'foe-armor',k:'test',label:'Защита противника',fx:[{stat:'ac',mode:'add',value:1}]});
  assert.equal(success(await commit(w,opened(w),values(opened(w),20))),true);assert.equal(w.e.combatNextTurn(),true);
  const spec=w.api.saveSpec(w.nextKey,entry.repeatSave,entry.label);assert.equal(spec.save.dice.length,1);
  const result=await w.api.repeatCommit(w.nextKey,entry.uid,w.api.stamp(),spec,values(spec,20));assert.equal(success(result),true,result.message);
  assert.ok(!foe.activeFx.some(f=>f.uid===entry.uid));assert.ok(!foe.activeFx.some(f=>f.uid==='foe-save-bonus'));assert.ok(foe.activeFx.some(f=>f.uid==='foe-armor'));
});
test('stale modifiers, duplicate answers and a different turn cannot apply a repeat twice',async()=>{
  const w=await world(),spec=opened(w),stamp=w.api.stamp();w.e.tabletopApi.applyFx(w.target.id,{id:'changed-save',k:'test',label:'Новый бонус',fx:[{stat:'save.con',mode:'add',value:2}]});
  assert.equal(success(await commit(w,spec,values(spec,20),w.entry,stamp)),false);assert.equal(w.api.pending(w.key).length,1);
  const fresh=opened(w);assert.equal(success(await commit(w,fresh,values(fresh,1))),true);const before=plain([w.target,w.e.state().combat]);
  assert.equal(success(await commit(w,fresh,values(fresh,20))),false);assert.deepEqual(plain([w.target,w.e.state().combat]),before);
  assert.equal(w.e.combatNextTurn(),true);assert.equal(success(await commit(w,fresh,values(fresh,20),w.entry,stamp)),false);
});

test('ending combat cannot grant a second saving throw at the same game time',async()=>{
  const w=await world(),spec=opened(w);
  assert.equal(success(await commit(w,spec,values(spec,1))),true);
  assert.equal(w.e.combatEnd(true),true);
  assert.equal(w.api.pending(w.key).length,0);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  assert.equal(w.api.pending(w.key).length,0,'the game-time receipt survives reload');
  assert.equal(w.e.combatLifecycleApi.advanceFxRound(1),true);
  assert.equal(w.api.pending(w.key).length,1,'another six seconds permits the next save');
});
