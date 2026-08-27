import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadStandardOnlyAudit() {
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)\{[\s\S]*$/, '');
  source += `
    globalThis.__bg3StandardOnlyAudit = {
      normalizeSavedRefs(refs) {
        bg3CatalogReset(true);
        const saved = JSON.parse(JSON.stringify(refs));
        const normalized = bg3CatalogStandardRefs(saved);
        const accepted = bg3CatalogUseRefs(normalized);
        return {
          accepted,
          preferredVersion: bg3Catalog.preferredVersion,
          preferredProfile: bg3Catalog.preferredProfile,
          preferredManifestSha256: bg3Catalog.preferredManifestSha256,
          refs: bg3CatalogRefs(),
          normalized,
          saved,
        };
      },
      useRefs(refs) {
        bg3CatalogReset(true);
        const accepted = bg3CatalogUseRefs(JSON.parse(JSON.stringify(refs)));
        return {
          accepted,
          preferredProfile: bg3Catalog.preferredProfile,
          refs: bg3CatalogRefs(),
          refError: bg3Catalog.refError,
        };
      },
      toolbar() {
        chars = [];
        itemWorkspace.heroId = '';
        return itemWorkspaceHeroToolbarHTML();
      },
      normalizeTadpole(raw) {
        return bg3TadpoleStandardState(JSON.parse(JSON.stringify(raw)));
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
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => false,
    prompt: () => null,
    alert() {},
    fetch: async () => ({ok: false, status: 599, json: async () => ({})}),
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
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
  vm.runInContext(source, context, {filename: 'index.html#bg3-standard-only'});
  return context.__bg3StandardOnlyAudit;
}

test('Items UI exposes no Honour selector or option', () => {
  const audit = loadStandardOnlyAudit();
  const toolbar = audit.toolbar();

  assert.doesNotMatch(toolbar, /itemWorkspaceProfile/);
  assert.doesNotMatch(toolbar, /bg3CatalogSelectProfile/);
  assert.doesNotMatch(toolbar, /value=["']honour["']/i);
  assert.doesNotMatch(toolbar, /Режим чести/i);
});

test('legacy saved Honour catalogue reference is safely normalized to Standard', () => {
  const audit = loadStandardOnlyAudit();
  const version = 'bg3-24532579-v10';
  const manifestSha256 = 'a'.repeat(64);
  const legacyRef = {id: 'bg3', version, profile: 'honour', manifestSha256};
  const result = plain(audit.normalizeSavedRefs([legacyRef]));

  assert.equal(result.accepted, true);
  assert.equal(result.preferredProfile, 'standard');
  assert.equal(result.preferredVersion, version);
  assert.equal(result.preferredManifestSha256, manifestSha256);
  assert.deepEqual(result.normalized, [{id: 'bg3', version, profile: 'standard', manifestSha256}]);
  assert.deepEqual(result.refs, [{id: 'bg3', version, profile: 'standard', manifestSha256}]);
  assert.deepEqual(result.saved, [legacyRef], 'normalization must not mutate the deserialized save object');
});

test('the public catalogue API rejects a direct Honour activation', () => {
  const audit = loadStandardOnlyAudit();
  const result = plain(audit.useRefs([{id: 'bg3', version: 'bg3-24532579-v10',
    profile: 'honour', manifestSha256: 'c'.repeat(64)}]));
  assert.equal(result.accepted, false);
  assert.equal(result.preferredProfile, '');
  assert.deepEqual(result.refs, []);
  assert.match(result.refError, /Некорректная ссылка/);
});

test('unknown catalogue profiles remain invalid instead of being silently rewritten', () => {
  const audit = loadStandardOnlyAudit();
  const result = plain(audit.normalizeSavedRefs([{id: 'bg3', version: 'bg3-24532579-v10',
    profile: 'forged-profile', manifestSha256: 'b'.repeat(64)}]));
  assert.equal(result.accepted, false);
  assert.equal(result.preferredProfile, '');
});

test('saved-world load and import route catalogue refs through the Standard migration', () => {
  const loadStart = html.indexOf('async function loadAll(){');
  const loadEnd = html.indexOf('\nfunction ', loadStart + 1);
  const importStart = html.indexOf('async function dndWorldImportPayload(data){');
  const importEnd = html.indexOf('\nfunction doImport(', importStart + 1);

  assert.ok(loadStart >= 0 && loadEnd > loadStart, 'loadAll source must be discoverable');
  assert.ok(importStart >= 0 && importEnd > importStart, 'import source must be discoverable');
  assert.match(html.slice(loadStart, loadEnd), /bg3CatalogStandardRefs\(/,
    'loading a persisted world must migrate legacy profile refs before selecting a catalogue');
  assert.match(html.slice(importStart, importEnd), /bg3CatalogStandardRefs\(/,
    'importing a persisted world must migrate legacy profile refs before selecting a catalogue');
});

test('cloud campaign ingress, egress and structured release are Standard-only', () => {
  const channelStart = html.indexOf("const chCamp=makeChan('кампания'");
  const channelEnd = html.indexOf('const syncChans=', channelStart);
  const releaseStart = html.indexOf('function structuredReleaseCampaignPayload(remote){');
  const releaseEnd = html.indexOf('\nfunction ', releaseStart + 1);
  const channel = html.slice(channelStart, channelEnd), release = html.slice(releaseStart, releaseEnd);
  assert.match(channel, /catalogRefs:bg3CatalogStandardRefs\(bg3CatalogRefs\(\)\)/);
  assert.match(channel, /bg3CatalogUseRefs\(bg3CatalogStandardRefs\(incomingRefs\)\)/);
  assert.match(release, /const catalogRefs=bg3CatalogStandardRefs\(/);
  assert.match(release, /bg3TadpoleStandardState\(/);
});

test('a pending legacy Honour tadpole dialog is cancelled without consuming its jar', () => {
  const audit = loadStandardOnlyAudit(), raw = {
    schemaVersion: 'dnd-world-bg3-tadpole-state/1', revision: 7,
    facts: {daisyUnlocked: true, hadConsumeDialog: true, tadpoleTreeEnabled: false},
    globalFlags: {}, actors: {}, committed: {},
    pendingDialog: {
      actorId: 'hero', entryId: 'jar-entry', itemId: 'bg3:item:jar',
      rootTemplateUuid: '1ec327be-3b7f-4502-9586-860e057e09ae', statsId: 'OBJ_TadpolePowerJar',
      itemUseId: 'honour-use', rootProgramId: 'honour-root', rootArtifact: 'root-template-programs/aa.json',
      catalogVersion: 'bg3-24532579-v10', profile: 'honour', dialogTransactionId: 'dialog-1', openedRevision: 7,
    },
  };
  const next = plain(audit.normalizeTadpole(raw));
  assert.equal(next.pendingDialog, null);
  assert.equal(next.facts.hadConsumeDialog, false);
  assert.equal(next.facts.daisyUnlocked, true);
  assert.equal(next.revision, 8);
});
