import test from 'node:test';
import assert from 'node:assert/strict';
import Guard from '../scripts/action-ui-guard.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

test('capture guard blocks mutations but allows keyboard navigation and copying until an action settles',()=>{
  const listeners=new Map();let busy=false,blocked=0;
  const guard=Guard.create({document:{addEventListener(type,handler,options){assert.equal(options.capture,true);assert.equal(options.passive,false);listeners.set(type,handler);}},isBusy:()=>busy,onBlocked:()=>blocked++});guard.start();guard.start();
  const send=(type,details={})=>{let cancelled=false,stopped=false;listeners.get(type)({type,...details,preventDefault(){cancelled=true;},stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,cancelled);return cancelled;};
  assert.equal(send('input'),false);busy=true;
  for(const type of ['pointerdown','click','input','change','beforeinput','submit','paste','cut','drop'])assert.equal(send(type),true,type);
  for(const key of ['Enter','Escape','ArrowUp','x'])assert.equal(send('keydown',{key}),true,key);
  assert.equal(send('keydown',{key:'Tab'}),false);assert.equal(send('keydown',{key:'c',ctrlKey:true}),false);
  busy=false;assert.equal(send('input'),false);assert.equal(send('click'),false);assert.equal(blocked,13);
});

test('a delayed rejected merchant save cannot erase a concurrently accepted manual HP edit',async()=>{
  const e=loadRuntimeIntegrationEngine(),actor=e.buildBlank();Object.assign(actor,{id:'hero',hp:20,hpMax:20,inventory:[],equipment:{},coins:{zm:'10'}});
  const item={id:'test-rope',n:'Верёвка',type:'equipment',tags:['rope'],rarity:'обычный',cost:'1 зм',custom:true};e.itemsApi.upgrade(item);
  e.setState({chars:[actor],items:[item],activeCharId:actor.id});e.economyApi.quiet();e.economyApi.createMerchant('general-store',actor.id);
  e.setElementValue('merchantBuyQty_'+e.economyApi.domKey(item.id),1);
  let enter,release;const entered=new Promise(resolve=>{enter=resolve;});
  e.economyApi.saveWith(()=>{enter();return new Promise(resolve=>{release=resolve;});});
  const buy=e.economyApi.buy(item.id);await entered;
  assert.equal(e.charactersApi.setHp(7),false,'the edit is explicitly refused before mutating the hero');assert.equal(actor.hp,20);
  release(false);await buy;assert.equal(actor.hp,20);assert.equal(actor.inventory.length,0);
  e.charactersApi.setHp(7);assert.equal(actor.hp,7,'editing resumes immediately after rollback');
});

test('incoming and outbound sync cannot observe or replace a kernel transaction before persistence starts',async()=>{
  let requests=0;const e=loadRuntimeIntegrationEngine(undefined,{fetch:async()=>{requests++;throw new Error('network forbidden while action is pending');}}),actor=e.buildBlank();actor.id='hero';actor.name='Исходное имя';
  e.setState({chars:[actor],activeCharId:actor.id});e.economyApi.quiet();e.economyApi.saveWith(async()=>true);
  e.syncApi.config({url:'https://fixture.invalid',room:'test',on:true});
  let enter,release;const entered=new Promise(resolve=>{enter=resolve;});
  const action=e.economyApi.transaction('pending-action',async()=>{actor.name='Локальная операция';enter();await new Promise(resolve=>{release=resolve;});return {ok:true};});await entered;
  assert.equal(e.saveSafety.pending(),false,'the action has not reached scheduleSave yet');
  let applications=0;const channel={key:'fixture',name:'Тест',remoteRevision:0,dirtyParentRevision:null,applyData(){applications++;}};
  const message={revision:1,payload:{name:'Входящая запись'}};
  assert.equal(e.syncApi.applyRemote(channel,message,{replaceLocal:true}),false);assert.equal(applications,0);
  assert.equal(await e.syncApi.pushNow(e.syncApi.channels()[0]),false);assert.equal(requests,0);
  release();await action;assert.equal(actor.name,'Локальная операция');assert.equal(channel.pending,message);assert.equal(channel.pendingConflict,true);
  assert.equal(e.syncApi.applyRemote(channel,message),false,'a held message remains a conflict after the transaction');
});
