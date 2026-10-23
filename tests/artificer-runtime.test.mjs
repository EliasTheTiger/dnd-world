import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
function world(){
 const e=loadRuntimeIntegrationEngine(),a=e.artificerApi,c=Object.assign(e.buildBlank(),{id:'alchemist-test',name:'Лира',cls:'Изобретатель',subcls:'Алхимик',level:3,hp:24,hpMax:24,ab:{str:8,dex:14,con:14,int:16,wis:13,cha:10},toolProficiencies:['Воровские инструменты','Инструменты алхимика','Инструменты стеклодува']});
 const items=e.catalogs.items,armor=items.find(it=>a.profile(it).kind==='armor'&&!a.profile(it).flags?.magical),bow=items.find(it=>a.profile(it).weapon?.ammo&&!a.profile(it).weapon.magic&&!a.profile(it).flags?.magical),dagger=items.find(it=>a.profile(it).weapon?.thrown&&!a.profile(it).weapon.magic&&!a.profile(it).flags?.magical);
 assert.ok(armor&&bow&&dagger);
 const tool={id:'test-artificer-tools',n:'Воровские инструменты',type:'equipment',tags:[],weight:'1 кг',cost:'25 зм',custom:true},glass={id:'test-artificer-glass',n:'Инструменты стеклодува',type:'equipment',tags:[],weight:'2 кг',cost:'30 зм',custom:true},stone={id:'test-artificer-stone',n:'Камешек',type:'equipment',tags:[],custom:true};
 c.inventory=[{id:'armor',itemId:armor.id,qty:1},{id:'bow',itemId:bow.id,qty:1,att:true},{id:'dagger',itemId:dagger.id,qty:2},{id:'tools',itemId:tool.id,qty:1},{id:'stone',itemId:stone.id,qty:1}];c.equipment={CHEST:'armor',MAIN_HAND:'tools'};
 c.artificer={elixirs:{rest:3,available:1},infusions:{version:1,revision:0,known:['enhanced-defense','enhanced-weapon','repeating-shot','returning-weapon'],active:[{infusionId:'enhanced-defense',itemId:'armor'},{infusionId:'repeating-shot',itemId:'bow'}],restReady:false}};
 e.setState({...e.catalogs,items:items.concat(tool,glass,stone),chars:[c],activeCharId:c.id});a.quiet();e.guardRandom();return {e,a,c,armor,bow,dagger,tool,glass};
}
test('per-instance infusion affects exactly one armor and weapon without modifying the catalog',()=>{
 const {e,a,c,bow}=world(),before=plain(bow);
 assert.equal(a.fx(c).find(s=>s.id.includes('armor')).fx[0].value,1);
 assert.deepEqual(plain(a.weaponBonus(c,'bow',{atk:0,dmg:0})),{atk:1,dmg:1});assert.equal(a.weaponMagical(c,'bow'),true);
 const p=a.weaponProfile(c,'bow',a.profile(bow));assert.equal(p.weapon.ammo,false);assert.equal(p.weapon.loading,false);assert.equal(p.weapon.two,a.profile(bow).weapon.two);assert.deepEqual(plain(bow),before);
 c.inventory.push({id:'ordinary-bow',itemId:bow.id,qty:1});assert.equal(a.weaponBonus(c,'ordinary-bow',{atk:0,dmg:0}).atk,0);
 c.inventory.find(x=>x.id==='bow').att=false;assert.equal(a.weaponBonus(c,'bow',{atk:0,dmg:0}).atk,0);assert.equal(a.weaponProfile(c,'bow',a.profile(bow)).weapon.ammo,true);
 c.inventory.find(x=>x.id==='bow').att=true;c.activeFx=[{antimagic:true,fx:[]}];assert.equal(a.weaponMagical(c,'bow'),false);assert.equal(a.fx(c).length,0);
});
test('repeating shot enters the actual weapon resource preflight with no ammunition',()=>{
 const {a,c}=world();const p=a.weaponResource(c,'bow','ranged',{});assert.equal(p.ok,true,p.reason);assert.equal(p.ammo,null);assert.equal(p.ammoItem,null);assert.equal(p.pr.weapon.loading,false);
 c.inventory.find(x=>x.id==='bow').att=false;assert.equal(a.weaponResource(c,'bow','ranged',{}).ok,false);
});
test('own infused focus or proficient held tools works, a bag item or another creator does not',()=>{
 const {e,a,c,bow}=world();assert.equal(a.focusCheck(c).ok,true);assert.equal(a.focus(c).e.id,'tools');assert.equal(a.materialCover(c).e.id,'tools');
 c.equipment={CHEST:'armor'};assert.equal(a.focus(c),null);assert.equal(a.focusCheck(c).ok,false);
 c.equipment.TWO_HAND='bow';assert.equal(a.focus(c).e.id,'bow');
 const ally=Object.assign(e.buildBlank(),{id:'ally',cls:'Изобретатель',level:3,inventory:[c.inventory.find(x=>x.id==='bow')],equipment:{TWO_HAND:'bow'}});c.inventory=c.inventory.filter(x=>x.id!=='bow');e.state().chars.push(ally);
 assert.equal(a.focus(ally),null);assert.equal(a.weaponMagical(ally,'bow'),false,'attunement does not transfer with the item');assert.equal(a.weaponBonus(ally,'bow',{atk:0,dmg:0}).atk,0);assert.equal(a.focus(c),null);
 a.attunementChanged(ally,ally.inventory[0]);assert.equal(a.weaponMagical(ally,'bow'),true);assert.equal(a.weaponBonus(ally,'bow',{atk:0,dmg:0}).atk,1);
 ally.inventory.push({id:'duplicate',itemId:bow.id,qty:1});assert.equal(a.weaponMagical(ally,'duplicate'),false);
});
test('infusions apply only once after a long rest and split a mundane stack safely',async()=>{
 const {e,a,c}=world();assert.equal((await a.infuse(c.id,[{infusionId:'returning-weapon',itemId:'dagger'}])).success,false);a.rest(c);
 const before=plain(c.artificer.elixirs),r=await a.infuse(c.id,[{infusionId:'returning-weapon',itemId:'dagger'},{infusionId:'enhanced-defense',itemId:'armor'}]);assert.equal(r.success,true,r.message);
 assert.equal(c.inventory.find(x=>x.id==='dagger').qty,1);assert.equal(c.inventory.filter(x=>x.itemId===c.inventory.find(x=>x.id==='dagger').itemId).reduce((n,x)=>n+x.qty,0),2);assert.equal(a.returning(c,'dagger'),true);assert.equal(a.weaponResource(c,'dagger','throw',{}).thrown,false);assert.deepEqual(plain(c.artificer.elixirs),before);
 assert.equal((await a.infuse(c.id,[])).success,false,'rest entitlement cannot be replayed');
});
test('invalid infusion and storage failure leave every hero and resource intact',async()=>{
 const {e,a,c}=world();a.rest(c);let before=plain(e.state().chars);
 assert.equal((await a.infuse(c.id,[{infusionId:'repeating-shot',itemId:'armor'}])).success,false);assert.deepEqual(plain(e.state().chars),before);
 const restore=e.learningApi.persistence(async()=>false);assert.equal((await a.infuse(c.id,[{infusionId:'returning-weapon',itemId:'dagger'}])).success,false);restore();assert.deepEqual(plain(e.state().chars),before);
});
test('changing slots after rest closes the infusion window, creating a free flask does not',async()=>{
 const {a,c}=world();c.slots={1:{cur:3,max:3}};a.rest(c);c.inventory.push({id:'free-rest-flask',itemId:'empty',qty:1});assert.equal((await a.infuse(c.id,[])).success,true);
 a.rest(c);c.slots[1].cur=2;assert.equal((await a.infuse(c.id,[])).success,false);
});

test('rest infusion permission survives persisted property order without accepting a changed resource',async()=>{
 const {a,c}=world();c.slots={1:{max:3,cur:3}};c.magicResource={version:1,mode:'mp',max:6,cur:6};a.rest(c);
 c.slots={1:{cur:3,max:3}};c.magicResource={cur:6,max:6,mode:'mp',version:1};assert.equal((await a.infuse(c.id,[])).success,true);
 a.rest(c);c.magicResource.cur=4;assert.equal((await a.infuse(c.id,[])).success,false);
});

test('ordinary campaigns and unmatched items never traverse inventories for artificer effects',()=>{
 const {a,c}=world();delete c.artificer;Object.defineProperty(c,'inventory',{get(){throw Error('unnecessary inventory traversal');}});
 assert.deepEqual(plain(a.fx(c)),[]);assert.equal(a.infusion(c,{id:'ordinary',qty:1}),null);
 c.artificer={infusions:{active:[{itemId:'different'}]}};assert.equal(a.infusion(c,{id:'ordinary',qty:1}),null);
});
test('tinkering checks tools and physical object, persists the effect, and never touches elixirs',async()=>{
 const {e,a,c}=world(),elixirs=plain(c.artificer.elixirs);const r=await a.tinker(c.id,{itemId:'stone',kind:'light',tiny:true});assert.equal(r.success,true,r.message);assert.equal(c.artificer.tinkering.active.length,1);assert.equal(a.fx(c).some(s=>s.fx.some(f=>f.stat==='light.bright')),true);assert.deepEqual(plain(c.artificer.elixirs),elixirs);
 const before=plain(c);assert.equal((await a.tinker(c.id,{itemId:'stone',kind:'light',tiny:true})).success,false);assert.deepEqual(plain(c),before);
 assert.equal((await a.dismiss(c.id,'stone')).success,true);assert.equal(c.artificer.tinkering.active.length,0);
 c.equipment={};assert.equal((await a.tinker(c.id,{itemId:'stone',kind:'light',tiny:true})).success,false);
});
test('Right Tool advances exactly one hour and replaces only its previous created set',async()=>{
 const {e,a,c}=world(),start=e.state().fxRound,input={tool:'Инструменты стеклодува',uninterruptedMinutes:60,spaceWithinReach:true};
 let r=await a.rightTool(c.id,input);assert.equal(r.success,true,r.message);assert.equal(e.state().fxRound,start+600);const first=c.artificer.tools.entryId;assert.ok(c.inventory.some(x=>x.id===first));assert.ok(c.inventory.some(x=>x.id==='tools'));
 const ally=Object.assign(e.buildBlank(),{id:'holder',inventory:[c.inventory.find(x=>x.id===first)],equipment:{MAIN_HAND:first}});c.inventory=c.inventory.filter(x=>x.id!==first);e.state().chars.push(ally);
 r=await a.rightTool(c.id,input);assert.equal(r.success,true,r.message);assert.equal(e.state().fxRound,start+1200);assert.equal(ally.inventory.length,0);assert.equal(ally.equipment.MAIN_HAND,undefined);assert.ok(c.inventory.some(x=>x.id==='tools'));assert.notEqual(c.artificer.tools.entryId,first);
});
test('Right Tool failure and focus take rollback before changing time, items or hands',async()=>{
 const {e,a,c}=world();c.equipment={};let before=plain(e.state().chars);const restore=e.learningApi.persistence(async()=>false);
 assert.equal((await a.focusTake(c.id,'tools')).success,false);assert.deepEqual(plain(e.state().chars),before);restore();
 assert.equal((await a.focusTake(c.id,'tools')).success,true);const start=e.state().fxRound;before=plain(e.state().chars);const restore2=e.learningApi.persistence(async()=>false);
 assert.equal((await a.rightTool(c.id,{tool:'Инструменты стеклодува',uninterruptedMinutes:60,spaceWithinReach:true})).success,false);restore2();assert.equal(e.state().fxRound,start);assert.deepEqual(plain(e.state().chars),before);
});
test('flight and swimming choose their actual speeds; changing modes never refunds movement',async()=>{
 const {e,a,c}=world();c.speed='9 м';c.activeFx=[{k:'use',id:'elixir',fx:[{stat:'speed.fly',mode:'set',value:'3 м'},{stat:'speed.swim',mode:'set',value:'равна скорости ходьбы'}]}];
 assert.deepEqual(plain(a.movementModes(c,9)),{walk:9,fly:3,swim:9});assert.match(a.movementControls(c),/Полёт · 3 м/);
 assert.equal((await a.movementSet('ally:'+c.id,'fly')).success,true);assert.equal(a.movementSpeed('ally:'+c.id,9),3);
 assert.equal((await a.movementSet('ally:'+c.id,'swim')).success,true);assert.equal(a.movementSpeed('ally:'+c.id,9),9);
 c.cond=['Парализованный'];assert.equal(a.movementSpeed('ally:'+c.id,0),0);c.cond=[];
 c.activeFx=[];e.setState(e.state());assert.equal((await a.movementSet('ally:'+c.id,'fly')).success,false);assert.equal(a.movementSpeed('ally:'+c.id,9),9);
});
test('expired infusion after the creator death delay stops working without changing a physical item',()=>{
 const {e,a,c}=world();a.creatorDied(c);assert.equal(a.weaponMagical(c,'bow'),true);const state=e.state();e.setState({...state,fxRound:state.fxRound+3*14400});assert.equal(a.weaponMagical(c,'bow'),false);assert.equal(c.inventory.find(x=>x.id==='bow').qty,1);
});
test('cantrip replacement grants no retroactive credits and cannot farm level-down/up cycles',async()=>{
 const {e,a,c}=world();a.cantripLevel(c,0);assert.equal(a.cantripTraining(c).credits,0);assert.equal(a.cantripTraining(c).highestLevel,3);
 c.level=4;a.cantripLevel(c,3);assert.equal(a.cantripTraining(c).credits,1);c.level=3;a.cantripLevel(c,4);c.level=4;a.cantripLevel(c,3);assert.equal(a.cantripTraining(c).credits,1);
 const first={id:'art-cantrip-a',n:'Огонёк A',en:'Artificer test A',l:0,c:'Изб',custom:true},second={id:'art-cantrip-b',n:'Огонёк B',en:'Artificer test B',l:0,c:'Изб',custom:true},foreign={id:'art-cantrip-foreign',n:'Чужой',l:0,c:'Клд',custom:true};
 e.state().spells.push(first,second,foreign);c.spellbook=[{spellId:first.id,access:'known',prep:true}];
 assert.equal((await a.cantripReplace(c.id,first.id,foreign.id)).success,false);assert.equal(a.cantripTraining(c).credits,1);
 const before=plain(c),restore=e.learningApi.persistence(async()=>false);assert.equal((await a.cantripReplace(c.id,first.id,second.id)).success,false);restore();assert.deepEqual(plain(e.state().chars[0]),before);
 const r=await a.cantripReplace(c.id,first.id,second.id);assert.equal(r.success,true,r.message);const current=e.state().chars[0];assert.equal(current.spellbook.length,1);assert.equal(current.spellbook[0].spellId,second.id);assert.equal(a.cantripTraining(current).credits,0);assert.equal((await a.cantripReplace(c.id,second.id,first.id)).success,false);
});
test('shared repeating-shot item requires its recipient to finish attunement and rolls back failures',async()=>{
 const {e,a,c}=world(),entry=c.inventory.find(x=>x.id==='bow'),ally=Object.assign(e.buildBlank(),{id:'recipient',name:'Воин',cls:'Воин',level:3,hp:20,hpMax:20,inventory:[entry],equipment:{TWO_HAND:entry.id}});c.inventory=c.inventory.filter(x=>x!==entry);e.state().chars.push(ally);
 assert.equal(a.entryAttuned(ally,entry),false);assert.equal(a.attuned(ally).length,0);assert.equal(a.weaponMagical(ally,entry.id),false);
 const before=plain(e.state().chars),round=e.state().fxRound,restore=e.learningApi.persistence(async()=>false);assert.equal((await a.attune(ally.id,entry.id,true)).success,false);restore();assert.deepEqual(plain(e.state().chars),before);assert.equal(e.state().fxRound,round);
 const result=await a.attune(ally.id,entry.id,true);assert.equal(result.success,true,result.message);const current=e.state().chars.find(x=>x.id===ally.id),received=current.inventory[0];assert.equal(a.entryAttuned(current,received),true);assert.equal(a.weaponMagical(current,received.id),true);assert.equal(e.state().fxRound,round+600);assert.equal(a.attuned(current).length,1);
});
