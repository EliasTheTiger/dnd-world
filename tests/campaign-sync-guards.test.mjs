import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function world(options={}) {
 const e=loadRuntimeIntegrationEngine(undefined,options),c=e.buildBlank();c.id='hero';c.name='Локальный герой';
 e.setState({chars:[c],activeCharId:c.id});return {e,c};
}

function channel(e) {
 let count=0;
 return {key:'fixture',name:'Тест',remoteRevision:0,dirtyParentRevision:null,lastAt:0,
  applyData(data){count++;e.state().chars[0].name=data.name;},applications:()=>count};
}

test('a clean incoming message still applies and persists normally',async()=>{
 const {e}=world(),ch=channel(e),msg={schemaVersion:'dnd-world-cloud-channel/1',revision:1,at:1,payload:{name:'Удаленный герой'}};
 assert.equal(e.syncApi.applyRemote(ch,msg),true);await e.runScheduledSave();
 assert.equal(ch.applications(),1);assert.equal(e.state().chars[0].name,'Удаленный герой');
 assert.equal(ch.remoteRevision,1);assert.equal(ch.pending,null);assert.equal(ch.pendingConflict,false);
});

test('dirty local changes and a deferred conflict cannot be silently replaced after local save',async()=>{
 const {e}=world(),ch=channel(e),msg={revision:1,at:1,payload:{name:'Удаленная замена'}};
 e.state().chars[0].name='Новая локальная правка';e.saveSafety.scheduleWorld();
 assert.equal(e.syncApi.applyRemote(ch,msg),false);
 assert.equal(e.state().chars[0].name,'Новая локальная правка');assert.equal(ch.applications(),0);
 await e.runScheduledSave();assert.equal(e.saveSafety.pending(),false);
 assert.equal(e.syncApi.applyRemote(ch,msg),false,'a delayed retry remains a conflict');
 assert.equal(ch.pending,msg);assert.equal(ch.applications(),0);
 assert.equal(e.syncApi.applyRemote(ch,msg,{replaceLocal:true}),true,'the existing explicit choice can resolve it');
 await e.runScheduledSave();assert.equal(e.state().chars[0].name,'Удаленная замена');
});

test('an incoming message cannot replace locally saved changes still awaiting cloud upload',()=>{
 const {e}=world(),ch=channel(e);ch.dirtyParentRevision=0;
 assert.equal(e.syncApi.applyRemote(ch,{revision:1,payload:{name:'Удаленная замена'}}),false);
 assert.equal(ch.applications(),0);assert.equal(e.state().chars[0].name,'Локальный герой');
});

test('a successful older upload does not mark newer local edits as synchronized',async()=>{
 let enter,release,sent;
 const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const {e,c}=world({fetch:async(_url,options={})=>{
  if(options.method==='PUT'){sent=JSON.parse(options.body);enter();await gate;return {ok:true,status:200};}
  return {ok:true,status:200,json:async()=>null,headers:{get:()=> 'etag-0'}};
 }});
 e.syncApi.config({url:'https://fixture.invalid',room:'test',on:true});
 await e.saveWorldNow();const ch=e.syncApi.channels().find(row=>row.key==='c');
 const upload=e.syncApi.pushNow(ch);await entered;
 c.name='Правка после отправки';await e.saveWorldNow();release();
 assert.equal(await upload,true);assert.equal(sent.payload.chars[0].name,'Локальный герой');
 assert.equal(c.name,'Правка после отправки');
 assert.equal(ch.dirtyParentRevision,1,'new changes remain pending on the just-committed remote revision');
});

test('outbound sync rechecks an import that started while its remote revision was being read',async()=>{
 let readEnter,readRelease,importEnter,importRelease,putCount=0;
 const readEntered=new Promise(resolve=>{readEnter=resolve;}),readGate=new Promise(resolve=>{readRelease=resolve;});
 const importEntered=new Promise(resolve=>{importEnter=resolve;}),importGate=new Promise(resolve=>{importRelease=resolve;});
 const {e}=world({fetch:async(url,options={})=>{
  if(options.method==='PUT'){putCount++;return {ok:true,status:200};}
  if(String(url).startsWith('https://fixture.invalid')){readEnter();await readGate;return {ok:true,json:async()=>null,headers:{get:()=> 'etag-0'}};}
  if(String(url).endsWith('/current.json')){importEnter();await importGate;}
  return {ok:false,status:503,json:async()=>({})};
 }});
 e.syncApi.config({url:'https://fixture.invalid',room:'test',on:true});await e.saveWorldNow();
 const ch=e.syncApi.channels().find(row=>row.key==='c'),upload=e.syncApi.pushNow(ch);await readEntered;
 const data=JSON.parse(JSON.stringify(e.dndWorldExportPayload()));data.chars[0].name='Импорт';
 data.catalogRefs=[{id:'bg3',version:'bg3-24532579-v10',profile:'standard',manifestSha256:'a'.repeat(64)}];
 const imported=e.dndWorldImportPayload(data);await importEntered;readRelease();
 assert.equal(await upload,false);assert.equal(putCount,0);
 importRelease();assert.equal((await imported).ok,true);assert.equal(e.state().chars[0].name,'Импорт');
});
