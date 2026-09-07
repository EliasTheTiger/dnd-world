import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import Economy from '../scripts/economy-core.js';
import Chests from '../scripts/chest-core.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(name){let start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);if(html.slice(start-6,start)==='async ')start-=6;const next=html.indexOf('\nfunction ',start+10);return html.slice(start,next);}
test('merchant base quote applies the displayed percentage to catalogue value, not an already discounted sale',()=>{
 const model=Economy.createItemPriceModel({itemId:'sword',ruleset:'dnd5e-2014',rawPrice:'10 зм',source:{type:'test',reference:'catalogue'},saleRule:{kind:'half',basisPoints:'5000'}}),context={DndEconomy:Economy,itemEconomyOf:()=>model,economyState:{priceSettings:{},tradeContext:{}}};vm.createContext(context);vm.runInContext(fn('merchantBaseQuote'),context);assert.equal(context.merchantBaseQuote({},'sale',{}).amountMinor,'1000');assert.equal(model.saleRule.basisPoints,'5000');
});
test('treasure claim preserves instance-specific item values and advances wallet version exactly once',()=>{
 const context={chestContainer:r=>r.container,itemOf:id=>({id}),uid:()=> 'new',economyRecordOperation(...a){context.operations.push(a);},economyUserId:()=> 'gm',operations:[]};vm.createContext(context);vm.runInContext(fn('chestClaimLoot'),context);
 const row={id:'cache',name:'Тайник',container:{loot:{status:'approved',claimedByActorId:null,approved:{items:[{itemId:'gem',qty:1}],currency:{gp:3,totalCopper:300}}}}},actor={id:'hero',economyVersion:4,inventory:[{id:'special',itemId:'gem',qty:1,valueCp:9999}],coins:{zm:2}};
 context.chestClaimLoot(row,actor);assert.equal(actor.inventory[0].qty,1);assert.equal(actor.inventory[1].qty,1);assert.equal(Number(actor.coins.zm),5);assert.equal(actor.economyVersion,5);assert.equal(context.operations.length,1);const before=JSON.stringify([row,actor,context.operations]);context.chestClaimLoot(row,actor);assert.equal(JSON.stringify([row,actor,context.operations]),before);
});
test('chest action preflight requires every actual trap die and initiative before any commit',()=>{
 const context={chestPhysical:r=>r.container,combat:{active:false}};vm.createContext(context);vm.runInContext(fn('chestDiceBounds')+'\n'+fn('chestValidateResolution'),context);const row=Chests.createChest({id:'trap',templateId:'trapped-vault'});
 assert.equal(context.chestValidateResolution(row,'open',{}),false);assert.equal(context.chestValidateResolution(row,'open',{saveNatural:20,trapDamage:0}),false);assert.equal(context.chestValidateResolution(row,'open',{saveNatural:20,trapDamage:8}),true);assert.equal(context.chestValidateResolution(row,'check',{total:99}),false);assert.equal(context.chestValidateResolution(row,'check',{natural:15,total:18}),true);context.combat.active=true;row.creature={};assert.equal(context.chestValidateResolution(row,'open',{saveNatural:20,trapDamage:8}),false);
});
test('trap poison uses the same damage type as a character poison resistance',()=>{
 const context={dmgTypeCanon:s=>s};vm.createContext(context);vm.runInContext(fn('chestDamageType'),context);assert.equal(context.chestDamageType('poison'),'яд');assert.equal(context.chestDamageType('acid'),'кислота');
});

test('opening a chest keeps the next claim disabled until the action and durable save finish',async()=>{
 let release,reject;const calls=[],buttons=[{disabled:false,setAttribute(k,v){this[k]=v;}}];
 const context={chestUiActionBusy:false,document:{querySelectorAll:()=>buttons},gameActionExecute(id){calls.push(id);return new Promise((resolve,fail)=>{release=resolve;reject=fail;});},renderChests(){context.renders++;buttons[0].disabled=context.chestUiActionBusy;},renders:0};
 vm.createContext(context);vm.runInContext(fn('chestExecuteAction'),context);
 const opening=context.chestExecuteAction('open','token');assert.equal(context.chestUiActionBusy,true);assert.equal(buttons[0].disabled,true);
 assert.equal(await context.chestExecuteAction('claim','new-token'),false);assert.deepEqual(calls,['open']);assert.equal(context.renders,0);
 release({success:true});await opening;assert.equal(context.chestUiActionBusy,false);assert.equal(buttons[0].disabled,false);assert.equal(context.renders,1);
 const claiming=context.chestExecuteAction('claim','new-token');assert.deepEqual(calls,['open','claim']);reject(new Error('save failed'));await assert.rejects(claiming,/save failed/);assert.equal(context.chestUiActionBusy,false);assert.equal(buttons[0].disabled,false);assert.equal(context.renders,2);
});
test('reentrant rendering flushes pending edits once without nesting DOM replacement',()=>{
 const context={document:{activeElement:{blur(){context.nested=context.tradeRenderBegin('merchant',box);}}}};const box={contains:()=>true};vm.createContext(context);vm.runInContext('const tradeRenderLocks=new Set();\n'+fn('tradeRenderBegin'),context);assert.equal(context.tradeRenderBegin('merchant',box),true);assert.equal(context.nested,false);
});
