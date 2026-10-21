import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function unload(engine) {
  const event = {prevented:false, preventDefault(){this.prevented=true;}};
  engine.saveSafety.beforeUnload(event);
  return event;
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
