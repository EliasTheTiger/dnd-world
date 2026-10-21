const assert=require('node:assert/strict');
const test=require('node:test');
const actions=require('../scripts/action-kernel.js');

function pipeline(world,options={}){return {resolve:async()=>({id:'hit'}),context:async()=>({revision:world.revision}),validate:async()=>({allowed:true}),snapshot:async()=>({...world}),prepare:async()=>({cost:1}),commit:async(prepared,token)=>{token.commit('slot:1',()=>{world.slots-=prepared.cost;});world.hp-=2;return {damage:2};},consequences:async value=>({success:true,value}),persist:async()=>options.persist===false?{ok:false,code:'WRITE_FAILED'}:{ok:true,receipt:{revision:++world.revision}},rollback:async snapshot=>Object.assign(world,snapshot),reject:(error,meta)=>({success:false,reasonCode:error.code,phase:meta.phase}),present:value=>value};}

test('kernel performs validation, one resource commit, consequences and durable receipt in order',async()=>{const world={slots:2,hp:10,revision:0},result=await new actions.ActionKernel().execute({actionId:'hit'},pipeline(world));assert.equal(result.success,true);assert.equal(world.slots,1);assert.equal(world.hp,8);assert.equal(result.persistenceReceipt.revision,1);});
test('failed persistence rolls back resources and consequences',async()=>{const world={slots:2,hp:10,revision:0},result=await new actions.ActionKernel().execute({actionId:'hit'},pipeline(world,{persist:false}));assert.equal(result.reasonCode,'WRITE_FAILED');assert.deepEqual(world,{slots:2,hp:10,revision:0});});
test('a resource cannot be committed twice by one action',async()=>{const world={slots:2,hp:10,revision:0},p=pipeline(world);p.commit=async(_prepared,token)=>{token.commit('slot:1',()=>world.slots--);token.commit('slot:1',()=>world.slots--);};const result=await new actions.ActionKernel().execute({actionId:'hit'},p);assert.equal(result.reasonCode,'RESOURCE_DOUBLE_COMMIT');assert.equal(world.slots,2);});
test('overlapping actions are rejected before mutation',async()=>{const world={slots:2,hp:10,revision:0},kernel=new actions.ActionKernel(),p=pipeline(world),release=[];p.prepare=()=>new Promise(resolve=>release.push(resolve));const first=kernel.execute({actionId:'first'},p);while(!release.length)await Promise.resolve();const second=await kernel.execute({actionId:'second'},p);assert.equal(second.reasonCode,'ACTION_IN_FLIGHT');release[0]({cost:1});await first;});

test('busy notifications cover success and rollback and cannot fail the action',async()=>{
  for(const persisted of [true,false]){
    const world={slots:2,hp:10,revision:0},notifications=[];
    const kernel=new actions.ActionKernel({onBusyChange(busy){notifications.push(busy);throw new Error('UI unavailable');}});
    const result=await kernel.execute({actionId:'hit'},pipeline(world,{persist:persisted}));
    assert.deepEqual(notifications,[true,false]);assert.equal(kernel.inFlight.size,0);
    assert.equal(result.success,persisted);assert.equal(world.slots,persisted?1:2);
  }
});

test('a spell stays committed when feedback fails after its durable save', async () => {
  const world = {slots:2, hp:10, revision:0}, kernel = new actions.ActionKernel(), p = pipeline(world);
  let savedWorld, rollbacks = 0, rejections = 0;
  p.persist = async () => {
    world.revision++;
    savedWorld = {...world};
    return {ok:true, receipt:{revision:world.revision}};
  };
  p.present = async () => { throw new Error('Status panel is unavailable.'); };
  p.rollback = async snapshot => { rollbacks++; Object.assign(world, snapshot); };
  p.reject = () => { rejections++; return {success:false}; };

  const result = await kernel.execute({actionId:'hit'}, p);

  assert.deepEqual(world, savedWorld, 'live HP and spell slots must still match the saved campaign');
  assert.deepEqual(world, {slots:1, hp:8, revision:1});
  assert.equal(rollbacks, 0);
  assert.equal(rejections, 0, 'a completed action must not be reported as safe to retry');
  assert.equal(result.success, true);
  assert.equal(result.persistenceReceipt.revision, 1);
  assert.equal(result.feedbackError.code, 'ACTION_FEEDBACK_FAILED');
  assert.match(result.feedbackError.message, /Status panel/);
  assert.equal(kernel.inFlight.size, 0, 'feedback failure must release the action lock');
});
