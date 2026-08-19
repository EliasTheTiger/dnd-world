import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');

function exactBookPayload() {
  const books = Array.from({length: 1045}, (_, index) => {
    const occurrenceCount = index === 0 ? 156 : 1;
    const bookId = `Book_${String(index).padStart(4, '0')}`;
    const malicious = index === 0 ? '<img src=x onerror="globalThis.pwned=true"><br>Точный текст' : `Русский ${index}`;
    return {
      bookId,
      contentHandle: {id: `h${index.toString(16).padStart(32, '0')}`, version: 1},
      stub: false,
      speaker: null,
      extraData: null,
      locales: {
        ru: {text: malicious, requestedVersion: 1, availableVersion: 1, status: 'exact', displayOnly: true},
        en: {text: `English ${index}`, requestedVersion: 1, availableVersion: 1, status: 'exact', displayOnly: true},
      },
      occurrenceCount,
      occurrences: Array.from({length: occurrenceCount}, (_unused, occurrence) => ({
        rootProgramId: `bg3:test:book:${index}:${occurrence}`,
      })),
      provenance: {package: 'Gustav.pak', packagedPath: 'Public/GustavDev/Localization/generated_books.lsf'},
    };
  });
  return {
    schemaVersion: 'bg3-book-content/1',
    catalogVersion: 'bg3-24532579-v1',
    sourceBuildId: '24532579',
    contracts: {
      identity: 'exact-BookId-to-TranslatedStringKey',
      overrideOrder: 'patch-then-module-priority',
      localizedTextExecutable: false,
      display: 'localized-content-only',
      dicePolicy: 'no-rolls',
      transaction: 'validate-single-commit-then-display-consequence',
      missingContent: 'fail-closed-before-commit',
      inventory: 'source-declarations-and-profile-expanded-occurrences',
    },
    counts: {
      sourceActionDeclarations: 1071,
      sourceNonemptyBookIdDeclarations: 1070,
      sourceEmptyBookIdDeclarations: 1,
      actionOccurrences: 1201,
      nonemptyBookIdOccurrences: 1200,
      emptyBookIdOccurrences: 1,
      uniqueBookIds: 1045,
      resolvedBookIds: 1045,
      unresolvedBookIds: 0,
      russianNonempty: 1045,
      englishNonempty: 1045,
      registriesScanned: 36,
      registryKeys: 2559,
      registryDuplicateKeys: 0,
      registryInvalidRows: 1,
    },
    books,
    unresolvedBookIds: [],
    unresolvedActions: [{rootProgramId: 'bg3:test:empty-book', reason: 'empty-book-id', executable: false}],
  };
}

function loadEngine() {
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)\{[\s\S]*$/, '');
  source += `
    globalThis.__bg3BookTest = {
      validate(payload) { return bg3BookPayloadCheck(payload); },
      configure(payload) {
        bg3Catalog.epoch += 1;
        bg3Catalog.current = {catalogVersion:'bg3-24532579-v1'};
        bg3Catalog.manifest = {source:{steamBuildId:'24532579'},counts:{books:payload.counts},entrypoints:{bookContent:'book-content.json'}};
        bg3BookRuntime.epoch = bg3Catalog.epoch;
        bg3BookRuntime.payload = null;bg3BookRuntime.byId = new Map();bg3BookRuntime.promise = null;bg3BookRuntime.error = '';
        const checked = bg3BookPayloadCheck(payload);
        if(checked.ok){bg3BookRuntime.payload=payload;bg3BookRuntime.byId=checked.byId;}
        document.getElementById('showTitle').textContent='';document.getElementById('showBody').textContent='';document.getElementById('showBody').innerHTML='';
        return checked;
      },
      ready(bookId) { return bg3BookProgramReady({ok:true,ops:[{op:'readBook',bookId}]}); },
      preflight(bookId) { return bg3RuleProgramPreflight({ok:true,ops:[{op:'readBook',bookId}],guards:[],conditions:[],damage:[]},{id:'reader',equipment:{}},'none',null,{id:'item'},{id:'use'}); },
      commit(bookId, entry) {
        const plan={ok:true,ops:[{op:'readBook',bookId,role:'consequences',where:'root.consequences[0]'}]};
        const checked=bg3BookProgramReady(plan);if(!checked.ok)return checked;
        const info=bg3RuleProgramApplyConsequences(plan,{id:'reader',name:'Reader',activeFx:[]},entry,{id:'item',n:'Book'},{id:'use'},'none',null,null);
        return {ok:true,info,body:document.getElementById('showBody').textContent,bodyHtml:document.getElementById('showBody').innerHTML};
      },
      async lazy(payload, bookIds) {
        bg3Catalog.epoch += 1;
        bg3Catalog.current={catalogVersion:'bg3-24532579-v1'};
        bg3Catalog.manifest={source:{steamBuildId:'24532579'},counts:{books:payload.counts},entrypoints:{bookContent:'book-content.json'}};
        bg3BookRuntime.epoch=-1;bg3BookRuntime.payload=null;bg3BookRuntime.byId=new Map();bg3BookRuntime.promise=null;bg3BookRuntime.error='';
        const calls=[];bg3CatalogEnsureIndex=async()=>true;bg3CatalogAssertEpoch=epoch=>{if(epoch!==bg3Catalog.epoch)throw new Error('stale');};bg3CatalogLoadArtifact=async rel=>{calls.push(rel);return payload;};
        const results=[];for(const id of bookIds)results.push(await bg3BookPreflight(id));return {calls,results};
      },
    };
  `;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '',
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; },
    });
    return elements.get(id);
  };
  const storage = new Map();
  const context = {
    console, Math, Date, JSON, Blob, URL,
    setTimeout: () => 0, clearTimeout() {}, confirm: () => false, prompt: () => null, alert() {},
    fetch: async () => ({ok: false, status: 599, json: async () => ({})}), EventSource: class {},
    document: {
      activeElement: null, getElementById: element, querySelectorAll: () => [], querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  context.window = context;context.globalThis = context;
  vm.createContext(context);vm.runInContext(source, context);return context.__bg3BookTest;
}

const engine = loadEngine();

test('exact book artifact rejects partial or mismatched A11 inventories', () => {
  const payload = exactBookPayload();
  assert.equal(engine.configure(payload).ok, true);
  const partial = structuredClone(payload);partial.counts.resolvedBookIds = 1044;
  const checked = engine.validate(partial);
  assert.equal(checked.ok, false);
  assert.match(checked.reason, /resolvedBookIds/);
});

test('book content is lazy-loaded once through the exact manifest entrypoint', async () => {
  const payload = exactBookPayload();
  const result = await engine.lazy(payload, ['Book_0000', 'Book_0001']);
  assert.deepEqual(Array.from(result.calls), ['book-content.json']);
  assert.equal(result.results.every(row => row.ok), true);
});

test('missing BookId fails before mutation while a resolved read mutates then displays RU/EN as text', () => {
  const payload = exactBookPayload();assert.equal(engine.configure(payload).ok, true);
  const missingEntry = {id: 'entry-missing'};
  const blocked = engine.ready('Book_missing');
  assert.equal(blocked.ok, false);assert.equal(missingEntry.read, undefined);assert.equal(missingEntry.bg3Read, undefined);
  const preflight = engine.preflight('Book_missing');assert.equal(preflight.ok, false);assert.match(preflight.reason, /BookId/);

  const entry = {id: 'entry-ok'};const done = engine.commit('Book_0000', entry);
  assert.equal(done.ok, true);assert.equal(entry.read, true);assert.equal(entry.bg3Read.bookId, 'Book_0000');
  assert.equal(entry.bg3Read.contentHandle, payload.books[0].contentHandle.id);
  assert.match(done.body, /^Русский\n\n/);assert.match(done.body, /English\n\nEnglish 0/);
  assert.match(done.body, /<img src=x onerror=/, 'localized markup must remain literal text');
  assert.match(done.body, /\nТочный текст/, '<br> is a display-only line break');
  assert.equal(done.bodyHtml, '');
});

test('item and scene read paths validate before commit and display only after committed state', () => {
  const itemStart = html.indexOf('function useItemApply('), itemEnd = html.indexOf('\nfunction ', itemStart + 20);
  const itemSource = html.slice(itemStart, itemEnd);
  assert.ok(itemSource.indexOf('programCheck=bg3RuleProgramPreflight') < itemSource.indexOf('commitItemUseResource'));
  const preflightStart = html.indexOf('function bg3RuleProgramPreflight('), preflightEnd = html.indexOf('\nfunction ', preflightStart + 20);
  assert.match(html.slice(preflightStart, preflightEnd), /bg3BookProgramReady\(plan,caster\)/);

  const consequenceStart = html.indexOf('function bg3RuleProgramApplyConsequences('), consequenceEnd = html.indexOf('\nfunction ', consequenceStart + 20);
  const consequence = html.slice(consequenceStart, consequenceEnd);
  assert.ok(consequence.indexOf('bg3BookExact(op.bookId)') < consequence.indexOf('e.read=true'));
  assert.ok(consequence.indexOf('recipeAsset&&recipeAsset.byId.get(recipeId)') < consequence.indexOf('e.read=true'), 'linked recipes are revalidated before the atomic read consequence');
  assert.ok(consequence.indexOf('caster.knownRecipes') < consequence.indexOf('e.read=true'), 'formula unlock and read marker share one consequence transaction');
  assert.ok(consequence.indexOf('e.read=true') < consequence.indexOf('bg3BookDisplayCommitted(op.bookId)'));

  const scenePlanStart = html.indexOf('async function bg3ScenePlanFor('), scenePlanEnd = html.indexOf('\nasync function bg3SceneCommit(', scenePlanStart);
  const scenePlan = html.slice(scenePlanStart, scenePlanEnd);
  assert.ok(scenePlan.indexOf('await bg3BookPreflight') < scenePlan.indexOf('bg3SceneApplyDraft'));
  const sceneCommitStart = scenePlanEnd, sceneCommitEnd = html.indexOf('\nfunction bg3SceneActionTypeOf(', sceneCommitStart);
  const sceneCommit = html.slice(sceneCommitStart, sceneCommitEnd);
  assert.ok(sceneCommit.indexOf('bg3SceneState=fresh.nextState') < sceneCommit.indexOf('bg3BookDisplayCommitted'));
});
