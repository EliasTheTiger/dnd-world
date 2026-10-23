import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function world(english){
 const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs});e.economyApi.quiet();e.partyStarterApi.ensureCatalogs();
 const made=e.partyStarterApi.prepare();assert.equal(made.ok,true,made.reason);const c=made.character;
 const t=Object.assign(e.buildBlank(),{id:'wounded-hero',name:'Раненый герой',hp:1,hpMax:24});
 const f={id:'wounded-foe',n:'Раненая цель',hp:1,hpMax:24,ac:10,creatureType:'humanoid',abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},activeFx:[],activeEffectsSchemaVersion:1,cond:[],tags:[]};
 const sp=e.catalogs.spells.find(s=>s.grimoire?.english===english&&s.grimoire?.status==='active'&&s.grimoire?.edition==='2014');assert.ok(sp);
 if(!c.spellbook.some(row=>row.spellId===sp.id))c.spellbook.push({spellId:sp.id,prep:true,access:'classList',alwaysPrepared:true,granted:true,countsAgainstPreparation:false});
 e.setState({...e.state(),chars:[c,t],foes:[f],activeCharId:c.id});e.guardRandom();return {e,c,t,f,sp};
}
function cast(w,target='ally:wounded-hero',scene={lineOfSight:true,distanceM:1}){
 const {e,c,sp}=w;let rolls=null;
 if(sp.l){const spec=e.rollSpecOf(sp,{kind:'spell',caster:c,target,slotLvl:1}),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.sides||4]));rolls=e.resolveOutcome(spec,values);}
 return e.castSpellApply(sp.id,c.id,target,null,null,sp.l?'1':'0',rolls,[],{},{scene});
}
test('Cure Wounds and Healing Word reject undead and constructs before consuming any slot or changing either side',()=>{
 for(const english of ['Cure Wounds','Healing Word'])for(const type of ['undead','конструкт']){
  const w=world(english);w.f.creatureType=type;const before=JSON.stringify([w.c,w.f,w.e.state().combat]);
  assert.equal(cast(w,'foe:'+w.f.id),false);assert.equal(JSON.stringify([w.c,w.f,w.e.state().combat]),before);assert.match(w.e.elementText('castErr'),/нежить и конструкт/);
 }
});
test('Healing Word collects sight, rejects absent or false sight and a blind caster, then heals from the entered d4 once',()=>{
 const w=world('Healing Word');w.e.artificerSpellApi.setCast({casterId:w.c.id,kind:'spell',id:w.sp.id});
 let prompts=0;w.e.artificerSpellApi.dialogs(()=>{prompts++;return null;});assert.equal(w.e.sanctuaryApi.castCollect(w.sp,['ally:'+w.t.id],{}).cancelled,true);assert.equal(prompts,1);
 w.e.artificerSpellApi.dialogs(()=> 'да');assert.equal(w.e.sanctuaryApi.castCollect(w.sp,['ally:'+w.t.id],{}).input.byTarget['ally:'+w.t.id].lineOfSight,true);
 for(const scene of [{},{lineOfSight:false}]){assert.equal(cast(w,'ally:'+w.t.id,scene),false);assert.equal(w.c.slots[1].cur,3);assert.equal(w.t.hp,1);}
 w.c.cond=['Ослепленный'];assert.equal(cast(w),false);assert.equal(w.c.slots[1].cur,3);
 w.c.cond=[];assert.equal(cast(w),true,w.e.elementText('castErr'));assert.equal(w.t.hp,8);assert.equal(w.c.slots[1].cur,2);
});
test('Healing Word cannot see an invisible target without actual revealing or a suitable sense',()=>{
 const w=world('Healing Word');w.t.cond=['Невидимый'];assert.equal(cast(w),false);assert.equal(w.c.slots[1].cur,3);
 w.t.activeFx=[{uid:'revealed',k:'spell',id:w.e.state().spells.find(s=>s.grimoire?.english==='Faerie Fire').id,label:'Огонь фей',fx:[{stat:'visibility.revealed',mode:'set',value:1}]}];w.e.setState({...w.e.state()});assert.equal(cast(w),true,w.e.elementText('castErr'));assert.equal(w.t.hp,8);
});
test('Spare the Dying stabilizes without healing, prevents another death save and new damage restarts dying',()=>{
 const w=world('Spare the Dying');w.t.hp=0;w.t.cond=['Бессознательный'];w.t.deaths={s:1,f:2};assert.equal(cast(w),true,w.e.elementText('castErr'));
 assert.equal(w.t.hp,0);assert.deepEqual(JSON.parse(JSON.stringify(w.t.deaths)),{s:3,f:0});assert.ok(w.e.effectiveConditions(w.t).includes('Бессознательный'));assert.equal(w.c.slots[1].cur,3);
 w.e.setState({...w.e.state(),activeCharId:w.t.id});assert.equal(w.e.charactersApi.deathSaveRoll(),false);
 w.e.combatLifecycleApi.applyDamageTo('ally:'+w.t.id,1,'огонь','Новый урон');assert.equal(w.t.deaths.s,0);assert.equal(w.t.deaths.f,1);
});
test('Spare the Dying also stabilizes a living foe but cannot revive the dead or affect undead, constructs or a target above zero HP',()=>{
 for(const patch of [{hp:1},{hp:0,deaths:{s:0,f:3}},{hp:0,creatureType:'undead'},{hp:0,creatureType:'construct'}]){
  const w=world('Spare the Dying');Object.assign(w.f,patch);const before=JSON.stringify(w.f);assert.equal(cast(w,'foe:'+w.f.id),false);assert.equal(JSON.stringify(w.f),before);
 }
 const w=world('Spare the Dying');w.f.hp=0;assert.equal(cast(w,'foe:'+w.f.id),true,w.e.elementText('castErr'));assert.deepEqual(JSON.parse(JSON.stringify(w.f.deaths)),{s:3,f:0});assert.equal(w.f.hp,0);
});
test('Poison Spray requires an actually visible creature but still resolves an undead target’s poison immunity normally',()=>{
 const w=world('Poison Spray'),key='foe:'+w.f.id;w.f.hp=24;w.f.creatureType='undead';w.f.immune=['яд'];
 const spec=w.e.rollSpecOf(w.sp,{kind:'spell',caster:w.c,target:w.e.targetInfoOf(key)}),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.type==='save'?1:4])),rolls=w.e.resolveOutcome(spec,values);
 const apply=scene=>w.e.castSpellApply(w.sp.id,w.c.id,key,null,null,'0',rolls,[],{},{scene});
 assert.equal(apply({lineOfSight:false}),false);assert.equal(w.f.hp,24);
 w.c.cond=['Ослепленный'];assert.equal(apply({lineOfSight:true,distanceM:1}),false);assert.equal(w.f.hp,24);
 w.c.cond=[];assert.equal(apply({lineOfSight:true,distanceM:1}),true,w.e.elementText('castErr'));assert.equal(w.f.hp,24,'valid but immune target takes no poison damage');
});
