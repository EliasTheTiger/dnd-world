import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
function world(options={}){
 const e=loadRuntimeIntegrationEngine(undefined,options),c=e.buildBlank();c.id='old-hero';c.name='Прежний герой';
 e.setState({chars:[c],activeCharId:c.id,fxRound:12,journal:[{id:'old-note',text:'Прежняя запись'}]});
 return {e,c};
}
function payload(e){const data=plain(e.dndWorldExportPayload());data.chars[0].id='new-hero';data.chars[0].name='Новый герой';data.journal=[{id:'new-note',text:'Новая запись'}];return data;}
function snapshot(e){const data=plain(e.dndWorldExportPayload());delete data.exported;return data;}

test('malformed import arrays and duplicate IDs reject before replacing campaign data',async()=>{
 const {e,c}=world(),before=snapshot(e);
 for(const corrupt of [{items:{}},{chars:[null]},{chars:[{id:'same'},{id:'same'}]},{journal:'not-an-array'}]){
  await assert.rejects(()=>e.dndWorldImportPayload({...payload(e),...corrupt}));
  assert.deepEqual(snapshot(e),before);assert.equal(e.state().chars[0],c);
 }
 assert.equal(e.saveSafety.pending(),false);
});

test('late definition upgrade error restores original identities and all campaign domains',async()=>{
 const {e,c}=world(),before=snapshot(e),data=payload(e);
 data.classes=[{id:'broken-class',n:'Воин',subs:{not:'an array'}}];
 await assert.rejects(()=>e.dndWorldImportPayload(data));
 assert.deepEqual(snapshot(e),before);assert.equal(e.state().chars[0],c);
 assert.equal(e.state().activeCharId,c.id);assert.equal(e.saveSafety.pending(),false);
});

test('seeded class definitions round-trip with unique IDs while duplicate class IDs are rejected',async()=>{
 const {e,c}=world();e.setState({chars:[c],classes:e.catalogs.classes,activeCharId:c.id});
 const data=plain(e.dndWorldExportPayload()),ids=data.classes.map(row=>row.id);
 assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length>1);
 const imported=loadRuntimeIntegrationEngine();assert.equal((await imported.dndWorldImportPayload(data)).ok,true);
 assert.deepEqual(imported.state().classes.map(row=>row.id),ids);
 const before=snapshot(imported),invalid=plain(data);invalid.classes[1].id=invalid.classes[0].id;
 await assert.rejects(()=>imported.dndWorldImportPayload(invalid),/повторный идентификатор.*classes/);
 assert.deepEqual(snapshot(imported),before);
});

test('failed durable import leaves the previous campaign and saved envelope unchanged',async()=>{
 const {e,c}=world();assert.equal(await e.saveWorldNow(),true);
 const before=snapshot(e),revision=e.persistenceState().revision;
 const previous=e.saveSafety.setStorageWriter(async()=>false);
 await assert.rejects(()=>e.dndWorldImportPayload(payload(e)),/не удалось сохранить/);
 assert.deepEqual(snapshot(e),before);assert.equal(e.state().chars[0],c);
 assert.equal(e.persistenceState().revision,revision);assert.equal(e.saveSafety.pending(),false);
 e.saveSafety.setStorageWriter(previous);
 assert.equal((await e.dndWorldImportPayload(payload(e))).ok,true,'a failed import releases its lock');
});

test('successful import waits for durable persistence, rejects overlap, and preserves manual effect round',async()=>{
 const {e}=world(),data=payload(e),input=plain(data);let entered,release,settled=false,saved;
 const writing=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const previous=e.saveSafety.setStorageWriter(async(key,value)=>{
  if(key==='dndworld2:campaign-envelope'){saved=JSON.parse(value);entered();await gate;}
  return previous(key,value);
 });
 const imported=e.dndWorldImportPayload(data).finally(()=>{settled=true;});await writing;
 assert.equal(settled,false);assert.equal((await e.dndWorldImportPayload(data)).ok,false);
 release();assert.equal((await imported).ok,true);
 assert.deepEqual(data,input,'normalization never mutates the caller backup');
 assert.equal(saved.state.chars[0].id,'new-hero');assert.equal(saved.state.fxRound,12);
 assert.equal(e.state().fxRound,12);assert.equal(e.state().activeCharId,null);
 assert.equal(e.persistenceState().receipt.status,'committed');assert.equal(e.saveSafety.pending(),false);
});

test('journal mirror failure after committed import retains the imported world and explicit retry warning',async()=>{
 const {e}=world();let saved;
 const previous=e.saveSafety.setStorageWriter(async(key,value)=>{
  if(key==='dndworld2:campaign-envelope')saved=JSON.parse(value).state;
  return key==='dndworld2:journal'?false:previous(key,value);
 });
 const result=await e.dndWorldImportPayload(payload(e));
 assert.equal(result.ok,true);assert.match(result.catalogWarning,/Журнал пока не сохранен/);
 assert.equal(e.state().chars[0].id,saved.chars[0].id);assert.equal(e.state().journal[0].id,'new-note');
 assert.equal(e.saveSafety.state().journal,true);e.saveSafety.setStorageWriter(previous);
 assert.equal(await e.runScheduledSave(),true);
});

test('an unsaved current campaign must persist before an import can replace it',async()=>{
 const {e,c}=world(),before=snapshot(e);e.saveSafety.scheduleWorld();
 e.saveSafety.setStorageWriter(async()=>false);
 const result=await e.dndWorldImportPayload(payload(e));
 assert.equal(result.ok,false);assert.match(result.reason,/Текущую летопись/);
 assert.deepEqual(snapshot(e),before);assert.equal(e.state().chars[0],c);assert.equal(e.saveSafety.pending(),true);
});

test('pending old journal must be durable even when the old world commit succeeds',async()=>{
 const {e,c}=world(),before=snapshot(e);e.saveSafety.scheduleWorld();e.saveSafety.scheduleJournal();
 const previous=e.saveSafety.setStorageWriter(async(key,value)=>{
  if(key==='dndworld2:journal'&&JSON.parse(value).some(row=>row.id==='old-note'))return false;
  return previous(key,value);
 });
 const result=await e.dndWorldImportPayload(payload(e));
 assert.equal(result.ok,false);assert.match(result.reason,/Текущую летопись/);
 assert.deepEqual(snapshot(e),before);assert.equal(e.state().chars[0],c);
 assert.equal(e.saveSafety.state().journal,true,'the unsaved old journal is still available for retry');
 assert.equal(e.saveSafety.state().world,false,'the old world commit remains valid');
});

test('invalid catalog pin rejects import without replacing an existing bound campaign',async()=>{
 const {e}=world(),old=plain(e.dndWorldExportPayload());
 old.catalogRefs=[{id:'bg3',version:'bg3-24532579-v10',profile:'standard',manifestSha256:'a'.repeat(64)}];
 assert.equal((await e.dndWorldImportPayload(old)).ok,true);
 const before=snapshot(e),revision=e.persistenceState().revision,data=payload(e);
 data.catalogRefs[0].manifestSha256='broken-pin';
 await assert.rejects(()=>e.dndWorldImportPayload(data),/каталог/);
 assert.deepEqual(snapshot(e),before);
 assert.equal(e.persistenceState().revision,revision);
});

function gatedCatalogImport(onPrepare=()=>{},onFetch=()=>{}){
 let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const {e}=world({fetch:async(url,options)=>{
  onFetch(url,options);
  if(String(url).endsWith('/current.json')){onPrepare(e);enter();await gate;}
  return {ok:false,status:503,json:async()=>({})};
 }}),data=payload(e);
 data.catalogRefs=[{id:'bg3',version:'bg3-24532579-v10',profile:'standard',manifestSha256:'a'.repeat(64)}];
 return {e,data,entered,release};
}

test('save queued before import staging cannot write a half-prepared campaign',async()=>{
 let staged=false,partialWrites=0,enterOld,releaseOld;
 const oldEntered=new Promise(resolve=>{enterOld=resolve;}),oldGate=new Promise(resolve=>{releaseOld=resolve;});
 const {e,data,entered,release}=gatedCatalogImport(e=>{staged=true;e.saveSafety.scheduleWorld();});
 let envelopeCount=0;
 const previous=e.saveSafety.setStorageWriter(async(key,value)=>{
  if(key==='dndworld2:campaign-envelope'){
   if(staged)partialWrites++;
   if(++envelopeCount===1){enterOld();await oldGate;}
  }
  return previous(key,value);
 });
 e.saveSafety.scheduleWorld();const imported=e.dndWorldImportPayload(data);
 await oldEntered;const queued=e.runScheduledSave();releaseOld();await entered;
 const queuedResult=await queued;staged=false;release();const result=await imported;
 assert.equal(queuedResult,false,'the execution guard rechecks staging after waiting in the save queue');
 assert.equal(partialWrites,0);
 assert.equal(result.ok,true);assert.equal(e.state().chars[0].id,'new-hero');
 assert.equal(e.saveSafety.pending(),false);
});

test('remote message during import remains a conflict after staging, never replacing the imported world',async()=>{
 const {e,data,entered,release}=gatedCatalogImport();let applications=0;
 const ch={key:'fixture',name:'Тест',remoteRevision:0,dirtyParentRevision:null,lastAt:0,
  applyData(d){applications++;e.state().chars[0].name=d.name;}};
 const message={revision:1,at:1,payload:{name:'Удаленная замена'}};
 const imported=e.dndWorldImportPayload(data);await entered;
 e.syncApi.applyRemote(ch,message);const during=applications;release();assert.equal((await imported).ok,true);
 e.syncApi.applyRemote(ch,message);
 assert.equal(during,0);assert.equal(applications,0);
 assert.equal(e.state().chars[0].name,'Новый герой');assert.equal(ch.pending,message);
});

test('outbound sync does not read or upload an import while its catalog is being prepared',async()=>{
 const requests=[],{e,data,entered,release}=gatedCatalogImport(()=>{},url=>requests.push(String(url)));
 const imported=e.dndWorldImportPayload(data);await entered;
 e.syncApi.config({url:'https://fixture.invalid',room:'test',on:true});
 const ch=e.syncApi.channels().find(row=>row.key==='c');
 assert.equal(await e.syncApi.pushNow(ch),false);
 assert.equal(requests.some(url=>url.startsWith('https://fixture.invalid')),false);
 release();assert.equal((await imported).ok,true);
});
