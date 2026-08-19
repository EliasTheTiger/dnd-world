import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * Causal certification for the complete standard-profile root-only slice and
 * the exact mirrored Honour receipts that carry profile-specific IDs/Story.
 *
 * Unlike the structural catalog audit, this suite hydrates the active pinned
 * release through the production loader and routes every A11/A8 action through
 * bg3ItemProgramOpen -> the private exact modal -> castConfirm.  No production function is
 * copied or weakened: the small VM API below only supplies a deterministic
 * character/world fixture and exposes otherwise lexical production functions.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = selectBg3Catalog(repo);
const {current, manifest} = selected;
const catalogRoot = path.join(repo, 'data', 'bg3', current.catalogVersion);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutDerivedFxCache(value) {
  const copy = plain(value);
  delete copy.fxCacheT;
  return copy;
}

function loadRows(group, key) {
  return (manifest.files[group] || []).flatMap(meta => {
    const payload = readJson(repoFile(meta.path));
    assert.equal(payload.catalogVersion, current.catalogVersion, meta.path);
    assert.equal(payload.count, payload[key].length, meta.path);
    return payload[key];
  });
}

const allItems = loadRows('items', 'items');
const allRoots = loadRows('rootTemplatePrograms', 'programs');
const rootById = new Map(allRoots.map(root => [root.id, root]));

function sourceActionSemantics(value) {
  const one = row => row ? {
    actionType: row.actionType,
    index: row.index,
    trigger: row.trigger,
    attributes: plain(row.attributes),
  } : null;
  return value && value.primary ? {
    primary: one(value.primary),
    aliases: (value.aliases || []).map(one),
  } : one(value);
}

function exactRootSemantics(use, root) {
  return {
    action: {
      cost: use.cost,
      target: use.target,
      consume: plain(use.consume),
      requirements: plain(use.requirements ?? null),
      special: plain(use.special ?? null),
      handler: use.handler,
      rollPolicy: use.rollPolicy,
      program: {
        rootArtifact: use.program.rootArtifact,
        mode: use.program.mode,
        commitPolicy: use.program.commitPolicy,
        special: plain(use.program.special ?? null),
        sourceAction: sourceActionSemantics(use.program.sourceAction),
      },
    },
    root: {
      schemaVersion: root.schemaVersion,
      sourceRootTemplateUuid: root.sourceRootTemplateUuid,
      inherited: root.inherited,
      trigger: root.trigger,
      actionType: root.actionType,
      attributes: plain(root.attributes),
      executionModel: root.executionModel,
      validation: plain(root.validation),
      commit: plain(root.commit),
      consequences: plain(root.consequences),
      mode: root.mode,
      summary: plain(root.summary),
      sourceAction: sourceActionSemantics(root.sourceAction),
    },
  };
}

function rootCasesFor(profile) {
  const rows = [];
  for (const item of allItems) {
    if (!item.source.profiles.includes(profile)) continue;
    const materialized = profile === 'honour' && item.source.honourOverlay && item.source.honourOverlay.item
      ? Object.assign({}, item, item.source.honourOverlay.item, {id: item.id, source: item.source}) : item;
    for (const use of materialized.mechanics.actions || []) {
      const root = rootById.get(use.program && use.program.id);
      const consequence = root && root.consequences && root.consequences[0];
      if (use.handler !== 'bg3RootProgram' || use.program.mode !== 'typed' || use.program.sourceProfile !== profile ||
          !root || root.sourceProfile !== profile || root.mode !== 'typed' ||
          root.consequences.length !== 1 ||
          !['readBook', 'toggleLight'].includes(consequence.op)) continue;
      rows.push({
        profile,
        rootTemplateUuid: item.source.rootTemplateUuid,
        pairKey: JSON.stringify([item.id, root.trigger, root.actionType, root.sourceAction.index]),
        itemId: item.id,
        actionId: use.id,
        rootId: root.id,
        rootArtifact: use.program.rootArtifact,
        opcode: consequence.op,
        bookId: consequence.bookId || null,
        scriptUuid: consequence.scriptUuid || null,
        recipeIds: [...new Set([consequence.recipeId, ...(consequence.recipeIds || [])].filter(Boolean))],
        semantics: exactRootSemantics(use, root),
      });
    }
  }
  return rows.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.actionId.localeCompare(b.actionId));
}

const cases = rootCasesFor('standard');
const honourCases = rootCasesFor('honour');
const storyIndex = readJson(catalogFile(manifest.entrypoints.storyItems));
const storyCasesFor = profile => storyIndex.links.flatMap(link => (link.causalEntrypoints || [])
  .filter(entrypoint => entrypoint.executable === true && entrypoint.profiles.includes(profile))
  .map(entrypoint => ({linkId: link.id, goal: link.goal, module: link.module, line: link.line, ...entrypoint})))
  .sort((a, b) => a.itemVariantId.localeCompare(b.itemVariantId) || a.id.localeCompare(b.id));
const storyCases = storyCasesFor('standard');
const honourStoryCases = storyCasesFor('honour');
const blockedSceneStory = new Map(Object.entries({
  'bg3:story-entrypoint:cd09063977c79d06303a9d68': {
    placementId: 'bg3:placement:343df2c7-4735-4aaa-a7e4-e07ee448d564',
    programSetId: 'bg3:placement-action-set:343df2c7-4735-4aaa-a7e4-e07ee448d564:8675ab76d908573ec222abe3',
    programId: 'bg3:placement-action:343df2c7-4735-4aaa-a7e4-e07ee448d564:c920c40d8c1813d974e3',
    bookId: 'TWN_Tollhouse_SafeCombination',
  },
  'bg3:story-entrypoint:d524e536d6a73240c3a230c2': {
    placementId: 'bg3:placement:1e90ae65-f0aa-4b85-b85e-c67a1a9fac40',
    programSetId: 'bg3:placement-action-set:1e90ae65-f0aa-4b85-b85e-c67a1a9fac40:fd7a0b62f7e20817f1e3b5d3',
    programId: 'bg3:placement-action:1e90ae65-f0aa-4b85-b85e-c67a1a9fac40:6c78a30eecb909f89d78',
    bookId: 'SCL_SharranInquisiton_InquisitionLedger',
  },
  'bg3:story-entrypoint:eb133d2a19038817bcff6b27': {
    placementId: 'bg3:placement:2eb9e0b0-87aa-4171-a78c-c033da18ad45',
    programSetId: 'bg3:placement-action-set:2eb9e0b0-87aa-4171-a78c-c033da18ad45:7e3d4659af768b11b87c1381',
    programId: 'bg3:placement-action:2eb9e0b0-87aa-4171-a78c-c033da18ad45:4216c432d3c456e1d985',
    bookId: 'SCL_BannedSeluneItemsNote',
  },
  'bg3:story-entrypoint:9d8c56a03b281fae317fe2f6': {
    placementId: 'bg3:placement:c2827852-5cc1-46ec-8ab0-254e52150966',
    programSetId: 'bg3:placement-action-set:c2827852-5cc1-46ec-8ab0-254e52150966:d76f1b3f78173522c6db3236',
    programId: 'bg3:placement-action:c2827852-5cc1-46ec-8ab0-254e52150966:a8c64656f7009c62e52a',
    bookId: 'HAV_SharranInquisiton_SeluniteResistanceNote',
  },
}));

async function localCatalogFetch(url) {
  const clean = decodeURIComponent(String(url).split(/[?#]/, 1)[0]).replace(/\\/g, '/');
  const marker = clean.indexOf('data/bg3/');
  if (marker < 0) return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
  const relative = clean.slice(marker).split('/');
  const file = path.resolve(repo, ...relative);
  const prefix = repo.endsWith(path.sep) ? repo : repo + path.sep;
  if (!file.startsWith(prefix) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
  }
  const raw = fs.readFileSync(file, 'utf8');
  return {ok: true, status: 200, json: async () => JSON.parse(raw), text: async () => raw};
}

function loadEngine(storage = new Map()) {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.lastIndexOf('</script>'));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  source += String.raw`
    let __causalResourceCommits = 0;
    let __causalInstallAssignments = 0;
    const __causalPrivateStoryUses=['bg3-use-2cd93bb9a4f0c808680d','bg3-use-e6d0bc25d6c6846e5958','bg3-use-46350f74bd2f2b363587','bg3-use-e4f7888703126a3f7204'];
    const __causalNeedsPrivateStory=useId=>__causalPrivateStoryUses.indexOf(String(useId||''))>=0;
    const __causalNativeCommitItemUseResource = commitItemUseResource;
    commitItemUseResource = function(plan) {
      __causalResourceCommits++;
      return __causalNativeCommitItemUseResource(plan);
    };

    function __causalActor(id, itemId, entryId, withEntry) {
      return {
        id:id,name:id,player:'',race:'Человек',subrace:'',cls:'Воин',subcls:'',bg:'',align:'Истинно нейтральный',level:1,xp:0,
        ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saves:{str:false,dex:false,con:false,int:false,wis:false,cha:false},skills:{},
        hp:10,hpMax:10,hpTemp:0,ac:10,speed:'9 м',init:0,hitDice:'1d10',inspiration:false,exhaustion:0,
        cond:[],diseases:[],deaths:{s:0,f:0},resist:[],vuln:[],immune:[],coins:{mm:0,sm:0,em:0,zm:0,pm:0},
        inventory:withEntry?[{id:entryId,itemId:itemId,qty:1,notes:''}]:[],equipment:{},toolProficiencies:[],knownRecipes:[],
        bg3TreasureHistory:[],craftingFacilities:[],spellbook:[],bg3LearnedSpells:[],bg3DestroyedObjects:[],
        bg3InventoryStatusTransitionHistory:[],slots:{},abilities:[],activeFx:[],activeEffectsSchemaVersion:GAME_MECHANICS_SCHEMA_VERSION,fxOff:[],feats:[],bg3Tags:[],bg3TagsComplete:true,
        spellPrepVersion:SPELL_PREPARATION_STATE_VERSION,spellLearning:{replacements:0,anyClassChoices:0},spentRest:0,arcUsed:false,
        acOverride:null,initB:0,hdUsed:0,spellAb:'',persona:{tr:'',id:'',bd:'',fl:'',ap:''}
      };
    }

    function __causalResetWorld(itemId, actionId, withEntry) {
      const item=bg3Catalog.items.get(itemId),use=item&&itemUseOf(item,actionId);
      if(!item||!use)throw new Error('hydrated item/action missing: '+itemId+' / '+actionId);
      const actorId='causal-actor',entryId='causal-entry',actor=__causalActor(actorId,itemId,entryId,withEntry!==false);
      chars=[actor];journal=[];itemsDB=[];spellsDB=[];abilitiesDB=[];racesDB=[];classesDB=[];rulesDB=[];foesDB=[];activeCharId=actorId;
      fxRound=1;combat=blankCombat();lastCastEvent=null;castCtx=null;rollSpec=null;rollQueue=[];rollCompleting=false;bg3RollPromptScope=null;
      bg3SceneState=bg3SceneNormalizeState(null);bg3StoryState=bg3StoryNormalizeState(null);bg3TadpoleState=bg3TadpoleNormalizeState(null);
      bg3TreasureState=bg3TreasureNormalizeState(null,{version:bg3Catalog.current.catalogVersion,profile:bg3Catalog.preferredProfile});
      bg3StoryCommitBusy=false;bg3StoryCausalRuntime.prepared.clear();bg3StoryCausalRuntime.preparing.clear();
      bg3LifecycleReset();bg3InterruptReset();bg3InventoryStatusTransitionReset();bg3GithbornMindcrusherTrustCharacters(chars);fxInvalidate();
      __causalResourceCommits=0;__causalInstallAssignments=0;
      return {item:item,use:use,actor:actor,entry:withEntry===false?null:actor.inventory[0],actorId:actorId,entryId:entryId};
    }

    function __causalCurrent() {
      const actor=chars[0],entry=actor&&actor.inventory&&actor.inventory[0],item=entry&&itemOf(entry.itemId),use=item&&itemUseOf(item,globalThis.__causalActionId);
      return {actor:actor,entry:entry,item:item,use:use};
    }

    function __causalSnapshot() {
      const actor=chars[0];
      return itemClone({
        actor:actor&&{id:actor.id,name:actor.name,inventory:actor.inventory,equipment:actor.equipment,knownRecipes:actor.knownRecipes,
          activeFx:actor.activeFx,cond:actor.cond,hp:actor.hp,hpTemp:actor.hpTemp},
        chars:chars,foes:foesDB,combat:combat,journal:journal,harvestedSources:harvestedSources,
        scene:bg3SceneState,story:bg3StoryState,tadpole:bg3TadpoleState,treasure:bg3TreasureState,lastCastEvent:lastCastEvent,
        fxRound:fxRound,fxCacheT:fxCacheT,castCommitted:castCtx&&castCtx.combatCommitted===true,rollPrompt:bg3RollPromptCheckpoint(),
        interruptTokens:[...bg3InterruptRuntime.tokens].sort(),interruptSourceTokens:[...bg3InterruptRuntime.sourceTokens].sort(),
        interruptTokenOrder:bg3InterruptRuntime.tokenOrder.slice(),interruptSourceTokenOrder:bg3InterruptRuntime.sourceTokenOrder.slice(),
        lifecycleHitTokens:[...bg3LifecycleRuntime.hitTokens].sort(),lifecycleStatusTokens:[...bg3LifecycleRuntime.statusTokens].sort(),
        lifecycleHitTokenOrder:bg3LifecycleRuntime.hitTokenOrder.slice(),lifecycleStatusTokenOrder:bg3LifecycleRuntime.statusTokenOrder.slice(),
        inventoryTransitionTokens:[...bg3InventoryStatusTransitionRuntime.tokens].sort(),inventoryTransitionTokenOrder:bg3InventoryStatusTransitionRuntime.tokenOrder.slice()
      });
    }

    function __causalRootResourceCommits() {
      const audit=bg3ItemRootAudit(),current=__causalCurrent();
      return audit&&current.item&&current.use&&audit.itemId===current.item.id&&audit.useId===current.use.id&&Number.isInteger(+audit.resourceTransactions)
        ?+audit.resourceTransactions:__causalResourceCommits;
    }

    function __causalInjectInstallFailureOnce() {
      const actor=chars[0];let storedName=actor.name;
      const prototype=Object.create(Object.getPrototypeOf(actor));
      Object.defineProperty(prototype,'name',{configurable:true,get:function(){return storedName;},set:function(value){
        __causalInstallAssignments++;
        if(__causalInstallAssignments===1)throw new Error('injected causal character install failure');
        storedName=value;Object.defineProperty(this,'name',{value:value,writable:true,enumerable:true,configurable:true});
      }});
      Object.setPrototypeOf(actor,prototype);return true;
    }

    globalThis.__bg3RootCausal = {
      async boot(ref) {
        if(!bg3CatalogUseRefs([itemClone(ref)]))throw new Error(bg3Catalog.refError||'catalog ref rejected');
        const index=await bg3CatalogEnsureIndex();
        return {version:bg3Catalog.current.catalogVersion,profile:bg3Catalog.preferredProfile,manifestSha256:bg3Catalog.current.manifestSha256,
          count:index.count,epoch:bg3Catalog.epoch};
      },
      async hydrate(ids) {const rows=await bg3CatalogHydrate(itemClone(ids));return rows.map(row=>row.id);},
      reset(itemId,actionId,withEntry) {globalThis.__causalActionId=actionId;return __causalResetWorld(itemId,actionId,withEntry);},
      async openAndCancel() {
        const current=__causalCurrent(),confirmBefore=globalThis.__causalRootConfirmHits;globalThis.__causalRootConfirmBudget=__causalNeedsPrivateStory(current.use.id)?1:0;
        const routed=await bg3ItemProgramOpen(current.entry.id,current.actor.id,current.use.id),opened=!!castCtx;
        closeCastModal();return {routed:routed,opened:opened,confirmHits:globalThis.__causalRootConfirmHits-confirmBefore,resourceCommits:__causalRootResourceCommits()};
      },
      async openAndConfirm() {
        const current=__causalCurrent(),before=__causalSnapshot(),confirmBefore=globalThis.__causalRootConfirmHits;globalThis.__causalRootConfirmBudget=__causalNeedsPrivateStory(current.use.id)?1:0;
        const routed=await bg3ItemProgramOpen(current.entry.id,current.actor.id,current.use.id),opened=!!castCtx;
        if(opened)document.getElementById('castTarget').value=current.use.target==='object'?'object':'ally:'+current.actor.id;
        castConfirm();
        return {ok:!!(routed&&opened&&!castCtx),routed:routed,opened:opened,closed:!castCtx,confirmHits:globalThis.__causalRootConfirmHits-confirmBefore,before:before,state:__causalSnapshot(),resourceCommits:__causalRootResourceCommits()};
      },
      async missingEntry() {
        const current=__causalCurrent(),before=__causalSnapshot(),ok=await bg3ItemProgramOpen('missing-entry',current.actor.id,current.use.id);
        return {ok:ok,before:before,after:__causalSnapshot(),resourceCommits:__causalRootResourceCommits()};
      },
      async missingBook() {
        const current=__causalCurrent(),plan=bg3RuleProgramPlanOf(current.use),bookId=bg3BookProgramIds(plan)[0],book=bookId&&bg3BookRuntime.byId.get(bookId),before=__causalSnapshot(),confirmBefore=globalThis.__causalRootConfirmHits;
        if(!book)throw new Error('exact test book missing before cache-heal case: '+bookId);bg3BookRuntime.byId.delete(bookId);globalThis.__causalRootConfirmBudget=__causalNeedsPrivateStory(current.use.id)?1:0;
        const ok=await bg3ItemProgramOpen(current.entry.id,current.actor.id,current.use.id);if(castCtx)closeCastModal();
        return {ok:ok,before:before,after:__causalSnapshot(),confirmHits:globalThis.__causalRootConfirmHits-confirmBefore,resourceCommits:__causalRootResourceCommits()};
      },
      async commit() {
        const current=__causalCurrent();globalThis.__causalRootConfirmBudget=__causalNeedsPrivateStory(current.use.id)?1:0;const opened=await bg3ItemProgramOpen(current.entry.id,current.actor.id,current.use.id),ok=opened?castConfirm():false;if(castCtx)closeCastModal();
        return {ok:ok,state:__causalSnapshot(),resourceCommits:__causalRootResourceCommits()};
      },
      snapshot:__causalSnapshot,
      async loadSaved() {const savedRandom=Math.random;Math.random=()=>0;try{await loadAll();}finally{Math.random=savedRandom;}return {
        version:bg3Catalog.preferredVersion,profile:bg3Catalog.preferredProfile,manifestSha256:bg3Catalog.preferredManifestSha256,
        snapshotRevision:worldSnapshotRevision,snapshot:__causalSnapshot()};},
      resourceCommits:__causalRootResourceCommits,
      injectRootLateFailureOnce:bg3ItemRootTestInjectLateFailureOnce,
      confirmOpenRoot:function(){const ok=castConfirm();return {ok:ok===true,state:__causalSnapshot(),resourceCommits:__causalRootResourceCommits()};},
      injectInstallFailureOnce:__causalInjectInstallFailureOnce,
      installAssignments:function(){return __causalInstallAssignments;},
      async scenePlan(placementId,useId,transactionId) {
        /* A record shard can contain rows whose compact records live in a
           different bounded index shard.  Preload the exact compact index so
           the production full-vs-compact validator can certify every sibling
           in the selected record shard, not just the requested placement. */
        await bg3SceneLoadAllIndex();
        const actor=chars[0],base={actorId:actor.id,transactionId:transactionId},pending=await bg3ScenePlanFor(placementId,useId,base);
        if(pending.ok||!pending.needsInput||pending.needsInput.kind!=='story-causal-gm-confirmation')return {ok:false,pending:pending,reason:pending.reason||'scene Story confirmation was not requested'};
        const storyPlan=await bg3StoryCausalPlanFor(pending.storyContext,{gmConfirmed:true,transactionId:transactionId+':story'});
        if(!storyPlan.ok)return {ok:false,pending:pending,storyPlan:storyPlan,reason:storyPlan.reason};
        const plan=await bg3ScenePlanFor(placementId,useId,Object.assign({},base,{storyCausalPlan:storyPlan}));
        return {ok:plan.ok,pending:pending,storyPlan:storyPlan,plan:plan,reason:plan.reason||''};
      },
      async blockedScenePlan(placementId,useId,directProgramId,transactionId) {
        await bg3SceneLoadAllIndex();
        const loaded=await bg3SceneLoadPlacement(placementId),programSet=loaded&&loaded.placementProgramSet,
          direct=bg3Array(programSet&&programSet.programs).find(program=>program&&program.id===directProgramId),
          before=__causalSnapshot(),base={actorId:chars[0].id,transactionId:transactionId};
        if(!direct)throw new Error('exact direct placement program is missing: '+directProgramId);
        const inherited=await bg3ScenePlanFor(placementId,useId,base),afterInherited=__causalSnapshot(),
          explicit=await bg3ScenePlanFor(placementId,directProgramId,base),afterExplicit=__causalSnapshot(),
          manual=bg3SceneObject(bg3Array(direct.bytecode)[0]),source=bg3SceneObject(direct.sourceAction);
        return {programSetId:String(programSet.id||''),direct:{id:String(direct.id||''),mode:String(direct.mode||''),
          failClosed:direct.failClosed===true,actionType:+source.actionType,bookId:String(bg3SceneObject(source.attributes).BookId||''),
          reason:String(manual.reason||'')},inherited:inherited,explicit:explicit,before:before,afterInherited:afterInherited,
          afterExplicit:afterExplicit,resourceCommits:__causalResourceCommits};
      },
      tamperScenePlan(plan) {const bad=bg3SceneClone(plan);bad.operation=Object.assign({},bad.operation,{__causalTamper:true});return bad;},
      sceneCommit:function(plan){return bg3SceneCommit(plan);}
    };
  `;

  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '',
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; }, focus() {}, click() {},
    });
    return elements.get(id);
  };
  const context = {
    __causalRootConfirmBudget: 0,
    __causalRootConfirmHits: 0,
    console,
    Math: Object.assign(Object.create(Math), {
      random() { throw new Error('Math.random fallback is forbidden in causal item certification'); },
    }),
    Date,
    JSON,
    crypto: crypto.webcrypto,
    TextEncoder,
    Blob,
    URL,
    structuredClone,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm() { context.__causalRootConfirmHits++;if(context.__causalRootConfirmBudget>0){context.__causalRootConfirmBudget--;return true;}throw new Error('unbudgeted confirm fallback is forbidden in causal item certification'); },
    prompt() { throw new Error('prompt fallback is forbidden in causal item certification'); },
    alert() {},
    fetch: localCatalogFetch,
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, focus() {}, style: {}, classList: {add() {}, remove() {}, toggle() {}}}),
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.__bg3RootCausal;
  api.storedWorldSnapshot = () => storage.get('dndworld2:world-snapshot') || null;
  return api;
}

test('active v8 executes every standard typed readBook/toggleLight root action causally', async t => {
  assert.equal(cases.length, 1_467);
  assert.deepEqual(plain(Object.fromEntries(Map.groupBy(cases, row => row.opcode).entries()
    .map(([opcode, rows]) => [opcode, rows.length]))), {readBook: 1_218, toggleLight: 249});
  assert.equal(new Set(cases.map(row => row.itemId)).size, 1_466);
  assert.ok(cases.every(row => row.rootId.includes(':root-action:standard:OnUsePeaceActions:')));
  assert.equal(honourCases.length, 1_467);
  assert.deepEqual(plain(Object.fromEntries(Map.groupBy(honourCases, row => row.opcode).entries()
    .map(([opcode, rows]) => [opcode, rows.length]))), {readBook: 1_218, toggleLight: 249});
  assert.ok(honourCases.every(row => row.rootId.includes(':root-action:honour:OnUsePeaceActions:')));
  assert.equal(new Set(cases.map(row => row.pairKey)).size, 1_467);
  assert.equal(new Set(honourCases.map(row => row.pairKey)).size, 1_467);
  const standardUseIds = new Set(cases.map(row => row.actionId)), honourUseIds = new Set(honourCases.map(row => row.actionId));
  assert.equal(standardUseIds.size, 1_467);
  assert.equal(honourUseIds.size, 1_467);
  assert.equal([...standardUseIds].filter(useId => honourUseIds.has(useId)).length, 0, 'profile-specific root use IDs are disjoint');
  const semanticRows = rows => rows.map(row => JSON.stringify([row.pairKey, row.semantics])).sort();
  assert.deepEqual(semanticRows(honourCases), semanticRows(cases), 'Standard and Honour root slices have zero normalized semantic differences');

  assert.equal(storyCases.length, 10);
  assert.equal(honourStoryCases.length, 10);
  assert.equal(new Set(storyCases.map(row => row.itemVariantId)).size, 10);
  assert.deepEqual(plain(Object.fromEntries(Map.groupBy(storyCases, row => row.eventKind).entries()
    .map(([kind, rows]) => [kind, rows.length]))), {'book-closed': 8, 'template-use-finished': 2});
  const caseByAction = new Map(cases.map(row => [row.itemId + '\0' + row.actionId, row]));
  for (const story of storyCases) {
    const row = caseByAction.get(story.itemVariantId + '\0' + story.itemUseId);
    assert.ok(row, story.id);
    assert.equal(row.opcode, 'readBook', story.id);
  }

  const engine = loadEngine();
  const boot = plain(await engine.boot({
    id: 'bg3', version: current.catalogVersion, profile: 'standard', manifestSha256: current.manifestSha256,
  }));
  assert.deepEqual(boot, {
    version: current.catalogVersion,
    profile: 'standard',
    manifestSha256: current.manifestSha256,
    count: manifest.counts.items,
    epoch: boot.epoch,
  });
  assert.ok(Number.isInteger(boot.epoch) && boot.epoch > 0);
  const hydrated = await engine.hydrate([...new Set(cases.map(row => row.itemId))]);
  assert.equal(hydrated.length, 1_466);

  await t.test('1,467 open/cancel, missing, commit and replay/idempotency paths', async () => {
    const totals = {prepared: 0, cancelled: 0, missing: 0, committed: 0, replayBlocked: 0, toggledOff: 0, recipes: 0};
    const privateStoryUses = new Set(['bg3-use-e6d0bc25d6c6846e5958','bg3-use-2cd93bb9a4f0c808680d']);
    for (const [index, row] of cases.entries()) {
      engine.reset(row.itemId, row.actionId, true);
      const expectedConfirmHits = privateStoryUses.has(row.actionId) ? 1 : 0;

      const beforeCancel = plain(engine.snapshot());
      const cancelled = plain(await engine.openAndCancel());
      assert.equal(cancelled.routed, true, `${row.itemId}/${row.actionId}: route open`);
      assert.equal(cancelled.opened, true, `${row.itemId}/${row.actionId}: modal open`);
      assert.equal(cancelled.confirmHits, expectedConfirmHits, `${row.itemId}/${row.actionId}: exact private Story prompt count on cancel`);
      assert.equal(cancelled.resourceCommits, 0, `${row.itemId}/${row.actionId}: cancel commit count`);
      const afterCancel = plain(engine.snapshot());
      assert.deepEqual(withoutDerivedFxCache(afterCancel), withoutDerivedFxCache(beforeCancel), `${row.itemId}/${row.actionId}: cancel mutation`);
      assert.ok(afterCancel.fxCacheT >= beforeCancel.fxCacheT, `${row.itemId}/${row.actionId}: derived FX cache epoch remains monotonic`);
      totals.prepared++;
      totals.cancelled++;

      const missingEntry = plain(await engine.missingEntry());
      assert.equal(missingEntry.ok, false, `${row.itemId}/${row.actionId}: missing entry`);
      assert.equal(missingEntry.resourceCommits, 0, `${row.itemId}/${row.actionId}: missing entry commit count`);
      assert.deepEqual(missingEntry.after, missingEntry.before, `${row.itemId}/${row.actionId}: missing entry mutation`);
      if (row.opcode === 'readBook') {
        const missingBook = plain(await engine.missingBook());
        assert.equal(missingBook.ok, true, `${row.itemId}/${row.actionId}: exact book cache self-heal`);
        assert.equal(missingBook.confirmHits, expectedConfirmHits, `${row.itemId}/${row.actionId}: exact private Story prompt count on cache self-heal`);
        assert.equal(missingBook.resourceCommits, 0, `${row.itemId}/${row.actionId}: cache self-heal commit count`);
        assert.deepEqual(missingBook.after, missingBook.before, `${row.itemId}/${row.actionId}: cache self-heal gameplay mutation`);
      }
      totals.missing++;

      const committed = plain(await engine.openAndConfirm());
      assert.equal(committed.ok, true, `${row.itemId}/${row.actionId}: initial commit`);
      assert.equal(committed.routed, true, `${row.itemId}/${row.actionId}: production route`);
      assert.equal(committed.opened, true, `${row.itemId}/${row.actionId}: production modal opened`);
      assert.equal(committed.closed, true, `${row.itemId}/${row.actionId}: production modal closed after success`);
      assert.equal(committed.confirmHits, expectedConfirmHits, `${row.itemId}/${row.actionId}: exact private Story prompt count on commit`);
      assert.equal(committed.resourceCommits, 1, `${row.itemId}/${row.actionId}: one resource boundary`);
      assert.equal(committed.state.actor.inventory[0].qty, 1, `${row.itemId}/${row.actionId}: consume none`);
      totals.committed++;

      if (row.opcode === 'readBook') {
        const entry = committed.state.actor.inventory[0];
        assert.equal(entry.read, true, `${row.itemId}/${row.actionId}: read marker`);
        assert.equal(entry.bg3Read.bookId, row.bookId, `${row.itemId}/${row.actionId}: exact BookId`);
        assert.deepEqual(entry.bg3Read.recipeIds.slice().sort(), row.recipeIds.map(id => `bg3:recipe:${id}`).sort(),
          `${row.itemId}/${row.actionId}: exact recipe ids`);
        assert.equal(new Set(committed.state.actor.knownRecipes).size, committed.state.actor.knownRecipes.length,
          `${row.itemId}/${row.actionId}: recipe idempotency`);
        totals.recipes += row.recipeIds.length;
        const beforeReplay = plain(engine.snapshot());
        const replay = plain(await engine.commit());
        assert.equal(replay.ok, false, `${row.itemId}/${row.actionId}: stale/replayed read plan`);
        assert.equal(replay.resourceCommits, 0, `${row.itemId}/${row.actionId}: a fresh rejected replay mints no resource boundary`);
        assert.deepEqual(withoutDerivedFxCache(plain(engine.snapshot())), withoutDerivedFxCache(beforeReplay), `${row.itemId}/${row.actionId}: replay mutation`);
        totals.replayBlocked++;
      } else {
        const lights = committed.state.actor.activeFx.filter(effect => effect.k === 'bg3-light');
        assert.equal(lights.length, 1, `${row.itemId}/${row.actionId}: one light marker`);
        assert.equal(lights[0].bg3ScriptUuid, row.scriptUuid, `${row.itemId}/${row.actionId}: exact script uuid`);
        const toggled = plain(await engine.openAndConfirm());
        assert.equal(toggled.ok, true, `${row.itemId}/${row.actionId}: second explicit toggle`);
        assert.equal(toggled.resourceCommits, 1, `${row.itemId}/${row.actionId}: one surviving resource boundary for the explicit toggle`);
        assert.equal(toggled.state.actor.activeFx.filter(effect => effect.k === 'bg3-light').length, 0,
          `${row.itemId}/${row.actionId}: no duplicate/stale light marker`);
        totals.toggledOff++;
      }
    }
    assert.deepEqual(totals, {
      prepared: 1_467,
      cancelled: 1_467,
      missing: 1_467,
      committed: 1_467,
      replayBlocked: 1_218,
      toggledOff: 249,
      recipes: 20,
    });
  });

  await t.test('all 10 exact Story-bound books execute causally or prove their exact placement override fail-closed', async () => {
    const totals = {inventory: 0, sceneExecutable: 0, sceneFailClosed: 0, tamperRejected: 0, rolledBack: 0, retried: 0, replayRejected: 0};
    for (const [index, storyRow] of storyCases.entries()) {
      const action = caseByAction.get(storyRow.itemVariantId + '\0' + storyRow.itemUseId);
      assert.ok(action, storyRow.id);

      if (storyRow.eventKind === 'template-use-finished') {
        engine.reset(action.itemId, action.actionId, true);
        const baseline = plain(engine.snapshot());

        const late = engine.injectRootLateFailureOnce();
        const failed = plain(await engine.openAndConfirm());
        assert.equal(failed.ok, false, `${storyRow.id}: injected failure`);
        assert.equal(failed.confirmHits, 1, `${storyRow.id}: one exact private GM confirmation`);
        assert.equal(late.hits(), 1, `${storyRow.id}: one private late-failure hit`);
        assert.equal(failed.resourceCommits, 0, `${storyRow.id}: failed attempt leaves no surviving resource boundary`);
        const rollbackBaseline = plain(baseline);
        rollbackBaseline.castCommitted = false;
        assert.deepEqual(plain(engine.snapshot()), rollbackBaseline, `${storyRow.id}: full rollback with the exact private context retained for retry`);
        totals.rolledBack++;

        const retried = plain(engine.confirmOpenRoot());
        assert.equal(retried.ok, true, `${storyRow.id}: same-plan retry`);
        assert.equal(retried.resourceCommits, 1, `${storyRow.id}: retry leaves one surviving resource boundary`);
        const after = plain(engine.snapshot());
        assert.equal(after.actor.inventory[0].read, true, storyRow.id);
        const committedStory = Object.values(after.story.committed).find(entry => entry.storyEntrypointId === storyRow.id);
        assert.ok(committedStory, storyRow.id);
        assert.deepEqual(committedStory.evidence, {
          goal: storyRow.goal,
          module: storyRow.module,
          line: storyRow.line,
          subjectKind: 'root-template',
          subjectUuid: storyRow.subjectUuid,
          instanceUuid: '',
          rootTemplateUuid: storyRow.subjectUuid,
          rootArtifact: action.rootArtifact,
          actionType: 11,
          actionIndex: 0,
        }, `${storyRow.id}: exact detached Story evidence`);
        totals.retried++;

        const replay = plain(await engine.commit());
        assert.equal(replay.ok, false, `${storyRow.id}: committed replay`);
        assert.equal(replay.resourceCommits, 0, `${storyRow.id}: a fresh rejected Story replay mints no resource boundary`);
        assert.deepEqual(withoutDerivedFxCache(plain(engine.snapshot())), withoutDerivedFxCache(after), `${storyRow.id}: replay mutation`);
        totals.replayRejected++;
        totals.inventory++;
      } else {
        engine.reset(action.itemId, action.actionId, false);
        const placementId = `bg3:placement:${storyRow.subjectUuid}`;
        const expectedBlocked = blockedSceneStory.get(storyRow.id);
        if (expectedBlocked) {
          assert.equal(placementId, expectedBlocked.placementId, storyRow.id);
          const blocked = plain(await engine.blockedScenePlan(
            placementId, action.actionId, expectedBlocked.programId, `story-scene-blocked-${index}`));
          assert.equal(blocked.programSetId, expectedBlocked.programSetId, storyRow.id);
          assert.deepEqual(blocked.direct, {
            id: expectedBlocked.programId,
            mode: 'manual',
            failClosed: true,
            actionType: 11,
            bookId: expectedBlocked.bookId,
            reason: 'placement-action-not-compiled',
          }, storyRow.id);
          assert.equal(blocked.inherited.ok, false, `${storyRow.id}: inherited item root must be blocked`);
          assert.equal(blocked.inherited.manual, true, `${storyRow.id}: inherited override is manual`);
          assert.equal(blocked.inherited.reason,
            'item root action is overridden by the exact direct placement OnUsePeaceActions group', storyRow.id);
          assert.equal(blocked.explicit.ok, false, `${storyRow.id}: direct program must fail closed`);
          assert.equal(blocked.explicit.manual, true, `${storyRow.id}: direct program is manual`);
          assert.equal(blocked.explicit.reason,
            'ActionDataType 11 remains fail-closed: placement-action-not-compiled', storyRow.id);
          assert.deepEqual(blocked.afterInherited, blocked.before, `${storyRow.id}: inherited override mutated state`);
          assert.deepEqual(blocked.afterExplicit, blocked.before, `${storyRow.id}: explicit manual program mutated state`);
          assert.equal(blocked.resourceCommits, 0, `${storyRow.id}: fail-closed crossed resource boundary`);
          totals.sceneFailClosed++;
          continue;
        }
        const planned = await engine.scenePlan(placementId, action.actionId, `story-scene-${index}`);
        assert.equal(planned.ok, true, `${storyRow.id}: ${planned.reason || plain(planned.pending).reason || ''}`);
        assert.ok(planned.storyPlan.entries.some(entry => entry.storyEntrypointId === storyRow.id), storyRow.id);
        assert.equal(planned.plan.storyPlan.noop, false, storyRow.id);
        const baseline = plain(engine.snapshot());

        const tampered = engine.tamperScenePlan(planned.plan);
        const rejected = plain(await engine.sceneCommit(tampered));
        assert.equal(rejected.ok, false, `${storyRow.id}: tampered scene plan`);
        assert.equal(rejected.stale, true, `${storyRow.id}: tamper is stale`);
        assert.deepEqual(plain(engine.snapshot()), baseline, `${storyRow.id}: scene tamper mutation`);
        totals.tamperRejected++;

        engine.injectInstallFailureOnce();
        const failed = plain(await engine.sceneCommit(planned.plan));
        assert.equal(failed.ok, false, `${storyRow.id}: injected scene failure`);
        assert.equal(failed.rolledBack, true, `${storyRow.id}: scene rollback flag`);
        assert.equal(engine.installAssignments(), 1, `${storyRow.id}: one hostile setter hit`);
        assert.deepEqual(plain(engine.snapshot()), baseline, `${storyRow.id}: scene/read/Story rollback`);
        totals.rolledBack++;

        const retried = plain(await engine.sceneCommit(planned.plan));
        assert.equal(retried.ok, true, `${storyRow.id}: same scene plan retry`);
        const after = plain(engine.snapshot());
        assert.ok(Object.values(after.story.committed).some(entry => entry.storyEntrypointId === storyRow.id), storyRow.id);
        const scopes = Object.values(after.scene.scopes);
        assert.equal(scopes.length, 1, storyRow.id);
        assert.equal(scopes[0].placements[placementId].state.readBy['causal-actor'], action.bookId, storyRow.id);
        totals.retried++;

        const replay = plain(await engine.sceneCommit(planned.plan));
        assert.equal(replay.ok, false, `${storyRow.id}: committed scene replay`);
        assert.equal(replay.replay, true, `${storyRow.id}: scene replay flag`);
        assert.deepEqual(plain(engine.snapshot()), after, `${storyRow.id}: scene replay mutation`);
        totals.replayRejected++;
        totals.sceneExecutable++;
      }
    }
    assert.deepEqual(totals, {
      inventory: 2,
      sceneExecutable: 4,
      sceneFailClosed: 4,
      tamperRejected: 4,
      rolledBack: 6,
      retried: 6,
      replayRejected: 6,
    });
  });
});

test('Honour mirrors all 1,467 semantics and executes exact Story/read, toggle, rollback, replay and durability receipts', async () => {
    const byUse = new Map(honourCases.map(row => [row.actionId, row]));
    const relocation = byUse.get('bg3-use-e4f7888703126a3f7204');
    const eviction = byUse.get('bg3-use-46350f74bd2f2b363587');
    const toggle = byUse.get('bg3-use-a161788fa073dc3cf87a');
    assert.ok(relocation && eviction && toggle);
    assert.equal(relocation.bookId, 'LOW_AuntieEthelsRevenge_RelocationNote');
    assert.equal(eviction.bookId, 'LOW_AuntieEthelsRevenge_HagSurvivorsEviction');
    assert.equal(toggle.scriptUuid, 'd289389c-882d-4695-a8d5-dda2a1351711');
    const relocationStory = honourStoryCases.find(row => row.itemUseId === relocation.actionId);
    const evictionStory = honourStoryCases.find(row => row.itemUseId === eviction.actionId);
    assert.equal(relocationStory.id, 'bg3:story-entrypoint:7800726656bbd1b6fd89b7ae');
    assert.equal(evictionStory.id, 'bg3:story-entrypoint:b9b0ebe765cc7e93454e6200');

    const honourStorage = new Map(), honour = loadEngine(honourStorage);
    const boot = plain(await honour.boot({
      id: 'bg3', version: current.catalogVersion, profile: 'honour', manifestSha256: current.manifestSha256,
    }));
    assert.equal(boot.profile, 'honour');
    assert.equal(boot.version, current.catalogVersion);
    assert.equal(boot.manifestSha256, current.manifestSha256);
    assert.equal((await honour.hydrate([relocation.itemId, eviction.itemId, toggle.itemId])).length, 3);

    honour.reset(relocation.itemId, relocation.actionId, true);
    const storedBeforeRollback = honour.storedWorldSnapshot();
    const baseline = plain(honour.snapshot()), late = honour.injectRootLateFailureOnce();
    const failed = plain(await honour.openAndConfirm());
    assert.equal(failed.ok, false);
    assert.equal(failed.confirmHits, 1);
    assert.equal(failed.resourceCommits, 0);
    assert.equal(late.hits(), 1);
    assert.equal(honour.storedWorldSnapshot(), storedBeforeRollback, 'rolled-back Honour Story/read writes no durable snapshot');
    const rollbackBaseline = plain(baseline); rollbackBaseline.castCommitted = false;
    assert.deepEqual(plain(honour.snapshot()), rollbackBaseline, 'Honour Story/read failure restores the exact live context for retry');
    const retried = plain(honour.confirmOpenRoot());
    assert.equal(retried.ok, true);
    assert.equal(retried.resourceCommits, 1);
    const committed = plain(honour.snapshot()), committedStory = Object.values(committed.story.committed)
      .find(row => row.storyEntrypointId === relocationStory.id);
    assert.equal(committed.actor.inventory[0].read, true);
    assert.equal(committed.actor.inventory[0].bg3Read.bookId, relocation.bookId);
    assert.equal(committed.story.quests.LOW_BreakHagHex.stage, 'ReadOldGarlowPointerNote');
    assert.ok(committedStory);
    assert.deepEqual(committedStory.evidence, {
      goal: relocationStory.goal,
      module: relocationStory.module,
      line: relocationStory.line,
      subjectKind: 'root-template',
      subjectUuid: relocationStory.subjectUuid,
      instanceUuid: '',
      rootTemplateUuid: relocationStory.subjectUuid,
      rootArtifact: relocation.rootArtifact,
      actionType: 11,
      actionIndex: 0,
    });
    const durableRaw = honour.storedWorldSnapshot(), durable = JSON.parse(durableRaw);
    assert.deepEqual(durable.catalogRefs, [{
      id: 'bg3', version: current.catalogVersion, profile: 'honour', manifestSha256: current.manifestSha256,
    }]);
    assert.ok(Number.isSafeInteger(durable.snapshotRevision) && durable.snapshotRevision > 0);
    assert.equal(durable.chars[0].inventory[0].bg3Read.bookId, relocation.bookId);
    assert.ok(Object.values(durable.bg3StoryState.committed).some(row => row.storyEntrypointId === relocationStory.id));
    const replay = plain(await honour.commit());
    assert.equal(replay.ok, false);
    assert.equal(replay.resourceCommits, 0);
    assert.deepEqual(withoutDerivedFxCache(plain(honour.snapshot())), withoutDerivedFxCache(committed));
    assert.equal(honour.storedWorldSnapshot(), durableRaw, 'rejected Honour replay cannot advance or replace the durable snapshot');

    const reloaded = loadEngine(honourStorage), loaded = plain(await reloaded.loadSaved());
    assert.equal(loaded.version, current.catalogVersion);
    assert.equal(loaded.profile, 'honour');
    assert.equal(loaded.manifestSha256, current.manifestSha256);
    assert.equal(loaded.snapshotRevision, durable.snapshotRevision);
    assert.equal(loaded.snapshot.actor.inventory[0].bg3Read.bookId, relocation.bookId);
    assert.equal(loaded.snapshot.story.quests.LOW_BreakHagHex.stage, 'ReadOldGarlowPointerNote');
    assert.ok(Object.values(loaded.snapshot.story.committed).some(row => row.storyEntrypointId === relocationStory.id));
    const reboot = plain(await reloaded.boot({
      id: 'bg3', version: current.catalogVersion, profile: 'honour', manifestSha256: current.manifestSha256,
    }));
    assert.equal(reboot.profile, 'honour');
    assert.equal(reboot.version, current.catalogVersion);
    assert.equal(reboot.manifestSha256, current.manifestSha256);

    honour.reset(toggle.itemId, toggle.actionId, true);
    const toggledOn = plain(await honour.openAndConfirm());
    assert.equal(toggledOn.ok, true);
    assert.equal(toggledOn.resourceCommits, 1);
    const light = toggledOn.state.actor.activeFx.find(effect => effect.k === 'bg3-light');
    assert.equal(light.bg3ScriptUuid, toggle.scriptUuid);
    assert.equal(light.uid, 'bg3-root-light:12:causal-actor:12:causal-entry');
    const toggledOff = plain(await honour.openAndConfirm());
    assert.equal(toggledOff.ok, true);
    assert.equal(toggledOff.state.actor.activeFx.some(effect => effect.k === 'bg3-light'), false);
    const afterOff = plain(honour.snapshot()), staleConfirm = plain(honour.confirmOpenRoot());
    assert.equal(staleConfirm.ok, false);
    assert.deepEqual(plain(honour.snapshot()), afterOff, 'closed toggle context cannot replay after the explicit off transition');

    honour.reset(eviction.itemId, eviction.actionId, true);
    const beforeCancel = plain(honour.snapshot()), cancelled = plain(await honour.openAndCancel());
    assert.equal(cancelled.routed, true);
    assert.equal(cancelled.opened, true);
    assert.equal(cancelled.confirmHits, 1);
    assert.equal(cancelled.resourceCommits, 0);
    assert.deepEqual(withoutDerivedFxCache(plain(honour.snapshot())), withoutDerivedFxCache(beforeCancel));
});
