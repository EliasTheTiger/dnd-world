import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/<script data-release-bootstrap>([\s\S]*?)<\/script>/u)[1];
const old='1'.repeat(40),fresh='2'.repeat(40),tick=()=>new Promise(resolve=>setImmediate(resolve));
function browser(){
 const events=new Map(),docEvents=new Map(),elements=new Map(),requests=[],navigations=[];let latest=old,offline=false,dirty=false,locked=false,dialog=false,clock=1000,validHTML=true,htmlGate=null;
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return elements.get(id);};
 const context={URL,Date:{now:()=>clock},location:{hostname:'eliasthetiger.github.io',origin:'https://eliasthetiger.github.io',replace:url=>navigations.push(url)},
 document:{readyState:'complete',visibilityState:'visible',getElementById:element,querySelectorAll:()=>dialog?[{hidden:false}]:[],addEventListener:(name,fn)=>docEvents.set(name,fn)},
 getComputedStyle:()=>({display:'block'}),addEventListener:(name,fn)=>events.set(name,fn),setInterval:fn=>{events.set('interval',fn);},
 hasUnsavedCampaignChanges:()=>dirty,gameActionInteractionLocked:()=>locked,
 fetch:async(url,options)=>{requests.push({url:String(url),cache:options.cache});if(offline)throw Error('offline');if(new URL(url).pathname.endsWith('/release.json'))return{ok:true,json:async()=>({commit:latest})};return{ok:true,text:async()=>{if(htmlGate)await htmlGate;return validHTML?`<meta name="dnd-world-release" content="${latest}">`:'old document';}};}};
 context.globalThis=context;vm.runInNewContext(source.replaceAll('__DND_WORLD_RELEASE__',old),context);
 return{context,requests,navigations,element,events,docEvents,set(next){if('latest'in next)latest=next.latest;if('offline'in next)offline=next.offline;if('dirty'in next)dirty=next.dirty;if('locked'in next)locked=next.locked;if('dialog'in next)dialog=next.dialog;if('clock'in next)clock=next.clock;if('validHTML'in next)validHTML=next.validHTML;if('htmlGate'in next)htmlGate=next.htmlGate;}};
}
test('a tab left open discovers a new release on return, without discarding an active game',async()=>{
 const b=browser();await tick();b.docEvents.get('pointerdown')();b.set({latest:fresh,clock:61000});await b.events.get('focus')();await tick();
 assert.equal(b.navigations.length,0);assert.match(b.element('releaseUpdateText').textContent,/новая версия/);assert.equal(b.element('releaseUpdateApply').hidden,false);
 await b.context.DndWorldReleaseUpdates.apply();assert.deepEqual(b.navigations,[`https://eliasthetiger.github.io/dnd-world/releases/${fresh}/index.html`]);
 assert.ok(b.requests.every(r=>r.cache==='no-store'));assert.ok(new URL(b.requests[0].url).searchParams.get('check'));
});
test('offline or stale manifest does not permanently freeze the release check',async()=>{
 const b=browser();await tick();b.docEvents.get('input')();b.set({offline:true});await b.context.DndWorldReleaseUpdates.check(true);assert.equal(b.navigations.length,0);assert.match(b.element('releaseUpdateText').textContent,/Не удалось/);
 b.set({offline:false,latest:fresh,clock:600000});await b.events.get('online')();await tick();assert.equal(b.element('releaseUpdateApply').hidden,false);
 const manifests=b.requests.filter(r=>new URL(r.url).pathname.endsWith('release.json'));assert.notEqual(manifests.at(-1).url,manifests[0].url);
});
test('update waits for unsaved changes, a pending transaction or a physical-dice dialog',async()=>{
 for(const flag of ['dirty','locked','dialog']){
  const b=browser();await tick();b.docEvents.get('keydown')();b.set({latest:fresh,[flag]:true});await b.context.DndWorldReleaseUpdates.check();await b.context.DndWorldReleaseUpdates.apply();assert.equal(b.navigations.length,0,flag);
  b.set({[flag]:false});await b.context.DndWorldReleaseUpdates.apply();assert.equal(b.navigations.length,1,flag);
 }
});
test('an unavailable or mismatched release document cannot replace the working game',async()=>{
 const b=browser();await tick();b.docEvents.get('input')();b.set({latest:fresh,validHTML:false});await b.context.DndWorldReleaseUpdates.check();await b.context.DndWorldReleaseUpdates.apply();assert.equal(b.navigations.length,0);assert.match(b.element('releaseUpdateText').textContent,/пока не загрузилось/);
 b.set({validHTML:true});await b.context.DndWorldReleaseUpdates.apply();assert.equal(b.navigations.length,1);
});
test('periodic foreground checks and BFCache pageshow revalidate, same release never loops',async()=>{
 const b=browser();await tick();b.set({clock:61000});b.events.get('interval')();await tick();b.events.get('pageshow')();await tick();b.docEvents.get('visibilitychange')();await tick();
 assert.equal(b.requests.length,4);assert.equal(b.navigations.length,0);await b.context.DndWorldReleaseUpdates.check(true);assert.match(b.element('releaseUpdateText').textContent,/последняя версия/);
});

test('typing while the automatic update downloads cancels its navigation',async()=>{
 const b=browser();await tick();let release;const gate=new Promise(resolve=>{release=resolve;});b.set({latest:fresh,htmlGate:gate});const update=b.context.DndWorldReleaseUpdates.check();await tick();b.docEvents.get('input')();release();await update;assert.equal(b.navigations.length,0);assert.match(b.element('releaseUpdateText').textContent,/завершите ввод/);
 await b.context.DndWorldReleaseUpdates.apply();assert.equal(b.navigations.length,1);
});
