import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function unload(engine) {
  const event = {prevented:false, preventDefault(){this.prevented=true;}};
  engine.saveSafety.beforeUnload(event);
  return event;
}

function deferred() {
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

function holdMirror(engine,key='dndworld2:items') {
  const entered=deferred(),release=deferred();
  const previous=engine.saveSafety.setStorageWriter(async(name,value)=>{
    if(name===key){entered.resolve();await release.promise;}
    return previous(name,value);
  });
  return {entered:entered.promise,release:release.resolve};
}

test('immediate navigation warns about pending character edits and starts their save', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.setState({chars:[{id:'edited-hero',name:'Эйра',subrace:'Высший эльф'}]});
  engine.saveSafety.scheduleWorld();
  const event = unload(engine);
  assert.equal(event.prevented,true);
  assert.equal(event.returnValue,'');
  assert.equal(engine.saveSafety.state().operations,1,'unload starts the queued edit without a timer wait');
  assert.equal(await engine.runScheduledSave(),true);
  assert.equal(engine.persistenceState().receipt.status,'committed');
  assert.equal(engine.saveSafety.pending(),false);
  assert.equal(unload(engine).prevented,false,'a saved campaign does not prompt on navigation');
});

test('navigation remains protected while save flags are cleared but durable writes are in flight', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.setState({chars:[{id:'edited-hero',name:'Эйра'}]});
  let release, entered;
  const writing = new Promise(resolve=>{entered=resolve;});
  const gate = new Promise(resolve=>{release=resolve;});
  const previous = engine.saveSafety.setStorageWriter(async (...args)=>{entered();await gate;return previous(...args);});
  const first = engine.saveWorldNow();
  await writing;
  assert.equal(engine.saveSafety.state().world,false,'the running save has consumed its dirty flag');
  assert.equal(engine.saveSafety.state().operations,1);
  assert.equal(unload(engine).prevented,true);
  const second = engine.saveWorldNow();
  assert.equal(engine.saveSafety.state().operations,2,'queued writes also keep the navigation guard active');
  release();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.equal(engine.saveSafety.pending(),false);
  assert.equal(unload(engine).prevented,false);
});

test('a failed journal write stays dirty and can be retried without losing navigation protection', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.setState({journal:[{id:'session-note',text:'Новая запись'}]});
  const previous = engine.saveSafety.setStorageWriter(async()=>false);
  engine.saveSafety.scheduleJournal();
  assert.equal(await engine.runScheduledSave(),false);
  assert.equal(engine.saveSafety.state().journal,true);
  assert.equal(engine.saveSafety.state().operations,0);
  assert.equal(unload(engine).prevented,true);
  engine.saveSafety.setStorageWriter(previous);
  assert.equal(await engine.runScheduledSave(),true);
  assert.equal(engine.saveSafety.pending(),false);
});

test('an unexpected save error retains both dirty flags and releases the active operation', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.setState({chars:[{id:'invalid-hero',hp:NaN}],journal:[{id:'session-note'}]});
  engine.saveSafety.scheduleJournal();
  assert.equal(await engine.saveWorldNow(),false,'invalid snapshot serialization must be reported as a failed save');
  assert.deepEqual({...engine.saveSafety.state()},{world:true,journal:true,operations:0});
  engine.state().chars[0].hp=10;
  assert.equal(await engine.runScheduledSave(),true);
  assert.equal(engine.saveSafety.pending(),false);
});

test('a failed journal mirror does not reject an already committed campaign action', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.charactersApi.withoutPresentation();
  engine.setState({chars:[],journal:[{id:'session-note'}]});
  let savedWorld;
  const previous = engine.saveSafety.setStorageWriter(async (key,value)=>{
    if(key==='dndworld2:campaign-envelope')savedWorld=JSON.parse(value).state;
    return key==='dndworld2:journal'?false:previous(key,value);
  });
  engine.saveSafety.scheduleJournal();
  const result=await engine.charactersApi.magicSwitch('mp');
  assert.equal(result.success,true,'the saved world must not be rolled back because the separate journal failed');
  assert.equal(savedWorld.campaignMagic.mode,'mp');
  assert.equal(engine.state().campaignMagic.mode,savedWorld.campaignMagic.mode);
  assert.equal(engine.persistenceState().receipt.status,'committed');
  assert.deepEqual({...engine.saveSafety.state()},{world:false,journal:true,operations:0});
  engine.saveSafety.setStorageWriter(previous);
  assert.equal(await engine.runScheduledSave(),true);
  assert.equal(engine.saveSafety.pending(),false);
});

test('an ancillary exception after a durable save cannot roll back a campaign action', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.charactersApi.withoutPresentation();
  engine.setState({chars:[],journal:[{id:'session-note'}]});
  let savedWorld;
  const previous=engine.saveSafety.setStorageWriter(async(key,value)=>{
    if(key==='dndworld2:campaign-envelope')savedWorld=JSON.parse(value).state;
    if(key==='dndworld2:chars')throw new Error('legacy mirror unavailable');
    return previous(key,value);
  });
  engine.saveSafety.scheduleJournal();
  const result=await engine.charactersApi.magicSwitch('mp');
  assert.equal(result.success,true);
  assert.equal(savedWorld.campaignMagic.mode,'mp');
  assert.equal(engine.state().campaignMagic.mode,savedWorld.campaignMagic.mode);
  assert.deepEqual({...engine.saveSafety.state()},{world:false,journal:true,operations:0});
  engine.saveSafety.setStorageWriter(previous);
  assert.equal(await engine.runScheduledSave(),true);
  assert.equal(engine.saveSafety.pending(),false);
});

test('Saved is published only after all compatibility writes finish, alongside the navigation guard', async () => {
  const engine=loadRuntimeIntegrationEngine();
  engine.setState({chars:[{id:'edited-hero',name:'Эйра'}]});
  const hold=holdMirror(engine);
  engine.saveSafety.scheduleWorld();
  assert.equal(engine.saveSafety.status().busy,'true','debounced edits are already pending');
  const saving=engine.runScheduledSave();
  await hold.entered;
  assert.equal(engine.persistenceState().receipt.status,'committed','the authoritative envelope has already completed');
  assert.equal(engine.saveSafety.pending(),true);
  assert.equal(unload(engine).prevented,true);
  assert.doesNotMatch(engine.saveSafety.status().text,/Сохранено/,'successful early keys must not announce full completion');
  assert.equal(engine.saveSafety.status().busy,'true');
  hold.release();
  assert.equal(await saving,true);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сохранено ✓',busy:'false'});
  assert.equal(unload(engine).prevented,false);
});

test('a queued empty operation completes the preceding successful save status', async () => {
  const engine=loadRuntimeIntegrationEngine(),hold=holdMirror(engine);
  engine.saveSafety.scheduleWorld();
  const first=engine.runScheduledSave();
  await hold.entered;
  const second=engine.runScheduledSave();
  assert.equal(engine.saveSafety.state().operations,2);
  hold.release();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сохранено ✓',busy:'false'});
});

for(const throws of [false,true])test(`a queued empty operation cannot hide an ancillary ${throws?'exception':'write rejection'}`, async () => {
  const engine=loadRuntimeIntegrationEngine(),entered=deferred(),release=deferred();
  const previous=engine.saveSafety.setStorageWriter(async(key,value)=>{
    if(key==='dndworld2:items'){
      entered.resolve();await release.promise;
      if(throws)throw new Error('mirror unavailable');
      return false;
    }
    return previous(key,value);
  });
  engine.saveSafety.scheduleWorld();
  const first=engine.runScheduledSave();
  await entered.promise;
  const second=engine.runScheduledSave();
  release.resolve();
  assert.deepEqual(await Promise.all([first,second]),[true,true],'a durable world is not rolled back for a failed mirror');
  assert.equal(engine.saveSafety.pending(),false);
  assert.equal(engine.saveSafety.status().busy,'false');
  assert.match(engine.saveSafety.status().text,throws?/не удалось завершить дополнительные записи/:/Хранилище недоступно/);
  assert.doesNotMatch(engine.saveSafety.status().text,/Сохранено ✓/);
  engine.saveSafety.setStorageWriter(previous);
  engine.saveSafety.scheduleWorld();
  assert.equal(await engine.runScheduledSave(),true);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сохранено ✓',busy:'false'},'an actual successful retry can clear the storage error');
});

test('failed journal retries retain their error and busy state until the journal is durable', async () => {
  const engine=loadRuntimeIntegrationEngine();
  engine.setState({journal:[{id:'new-note',text:'Новая запись'}]});
  const previous=engine.saveSafety.setStorageWriter(async(key,value)=>key==='dndworld2:journal'?false:previous(key,value));
  engine.saveSafety.scheduleJournal();
  assert.equal(await engine.runScheduledSave(),false);
  assert.equal(await engine.runScheduledSave(),false);
  assert.equal(engine.saveSafety.status().busy,'true');
  assert.match(engine.saveSafety.status().text,/Хранилище недоступно/);
  engine.saveSafety.setStorageWriter(previous);
  assert.equal(await engine.runScheduledSave(),true);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сохранено ✓',busy:'false'});
});

test('an edit made during an older write stays pending until its own queued save completes', async () => {
  const engine=loadRuntimeIntegrationEngine(),entered=[deferred(),deferred()],release=[deferred(),deferred()];
  const hero={id:'edited-hero',name:'Первое имя'};
  engine.setState({chars:[hero]});
  let writes=0;
  const previous=engine.saveSafety.setStorageWriter(async(key,value)=>{
    if(key==='dndworld2:items'){const at=writes++;entered[at].resolve();await release[at].promise;}
    return previous(key,value);
  });
  engine.saveSafety.scheduleWorld();
  const first=engine.runScheduledSave();
  await entered[0].promise;
  hero.name='Следующее имя';
  engine.saveSafety.scheduleWorld();
  const second=engine.runScheduledSave();
  release[0].resolve();
  await entered[1].promise;
  assert.equal(await first,true);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сохраняем изменения…',busy:'true'});
  assert.equal(unload(engine).prevented,true);
  release[1].resolve();
  assert.equal(await second,true);
  assert.equal(JSON.parse(await engine.storeGet('dndworld2:campaign-envelope')).state.chars[0].name,hero.name);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сохранено ✓',busy:'false'});
});

test('a newer gameplay refusal survives successful persistence while readiness becomes idle', async () => {
  const engine=loadRuntimeIntegrationEngine(),hold=holdMirror(engine);
  engine.saveSafety.scheduleWorld();
  const saving=engine.runScheduledSave();
  await hold.entered;
  engine.saveSafety.message('Сейчас ход другого участника.',true);
  const empty=engine.runScheduledSave();
  hold.release();
  assert.deepEqual(await Promise.all([saving,empty]),[true,true]);
  assert.deepEqual({...engine.saveSafety.status()},{text:'Сейчас ход другого участника.',busy:'false'});
  assert.equal(unload(engine).prevented,false);
});
