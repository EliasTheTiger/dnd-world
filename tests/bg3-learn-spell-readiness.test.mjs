import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {isDeepStrictEqual, TextEncoder} from 'node:util';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * Active-v10 readiness certificate for BG3 ActionData 33 (LearnSpell).
 *
 * The catalog census deliberately keeps three independent facts separate:
 *
 *   - the exact learned spell program is typed or mixed;
 *   - the A33 source Conditions key is present or missing;
 *   - a present, nonempty A33 condition must itself be executable.
 *
 * Consequently, v10 has 146 typed spell references but only 144 executable
 * LearnSpell routes.  The two typed Cloud of Daggers rows remain fail-closed
 * because CanUseSpellScroll is unresolved at the A33 boundary.  Conversely,
 * the two Dispel Magic rows have no Conditions key at all and are valid; a
 * missing key must not be confused with an unresolved nonempty expression.
 *
 * Runtime probes use only the production catalog loader and private A33
 * plan/commit boundary.  A plan may spend a scroll and gold only after the
 * exact referenced learned-spell program passes the shared dry compiler.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = selectBg3Catalog(repo);
const {current, manifest, catalogRoot} = selected;

const EXPECTED = Object.freeze({
  version: 'bg3-24532579-v10',
  rows: 114,
  byProfile: Object.freeze({standard: 114}),
  byMode: Object.freeze({mixed: 41, typed: 73}),
  blocked: 42,
  ready: 72,
  allSha256: '75d3d6e20c632860a958a45939a6fc95ce38c595085e0a14088246edcc6ef016',
  mixedSha256: '63421f5c5d402c91c7fb448b95d1d87fa1bff74556bde80fc224725ee4743d1f',
  exceptionalConditionsSha256: 'cba3e34b6e98466da7640c9845a30bf5574104245a4b41f7db4df057f99254fa',
  a12A33MismatchSha256: '783d26b6c6edd347bcc2764307c63f820db627db149357429287854bdd8da61d',
});

const FIREBALL = Object.freeze({
  itemId: 'bg3:item:rt:79d2bb95-53fc-4e41-a004-5e1b83db8de7:stats:T0JKX1Njcm9sbF9GaXJlYmFsbA',
  a12SpellId: 'Projectile_Fireball_FromScroll',
  a33SpellId: 'Projectile_Fireball',
  standard: Object.freeze({
    a12UseId: 'bg3-use-fd95005b140df9217120',
    a33UseId: 'bg3-use-ec3000c3309c7197e233',
  }),
});

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
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/* The audit that minted the pinned digests used localeCompare ordering for
 * the opaque base64-derived ids.  Pinning the English collation makes that
 * ordering deterministic across the machines that run this certificate. */
function digestRows(rows, project) {
  const lines = rows.map(project).sort((a, b) => a.localeCompare(b, 'en'));
  return sha256(lines.join('\n'));
}

function effectiveMechanics(item, profile) {
  return profile === 'standard' ? item.mechanics : null;
}

function sourceActionType(use) {
  return +(use?.program?.sourceAction?.primary?.actionType ?? -1);
}

function a12SpellId(use) {
  return String(use?.program?.scroll?.spellId
    || use?.program?.sourceAction?.primary?.attributes?.SkillID
    || '');
}

function collectA33Rows() {
  const artifactCache = new Map();
  const artifact = relative => {
    if (!artifactCache.has(relative)) artifactCache.set(relative, readJson(catalogFile(relative)));
    return artifactCache.get(relative);
  };
  const rows = [];

  for (const descriptor of manifest.files.items || []) {
    const payload = readJson(repoFile(descriptor.path));
    assert.equal(payload.catalogVersion, current.catalogVersion, descriptor.path);
    assert.equal(payload.count, payload.items.length, descriptor.path);

    for (const item of payload.items) {
      for (const profile of ['standard']) {
        const mechanics = effectiveMechanics(item, profile);
        const actions = mechanics?.actions || [];
        const castActions = actions.filter(use => sourceActionType(use) === 12);

        for (const use of actions) {
          if (use.handler !== 'bg3LearnSpellProgram') continue;
          const contract = use.program?.learnSpell;
          const spell = contract?.spell;
          const rulePayload = spell?.artifact ? artifact(spell.artifact) : null;
          const rule = (rulePayload?.rules || []).find(candidate =>
            candidate.id === spell?.ruleId && candidate.bg3Id === contract?.spellId);
          const selectedProgram = rule?.programs?.[profile];
          const rootPayload = use.program?.rootArtifact ? artifact(use.program.rootArtifact) : null;
          const root = (rootPayload?.programs || []).find(candidate => candidate.id === use.program?.id);
          const attributes = root?.attributes || {};
          const conditionPresent = Object.prototype.hasOwnProperty.call(attributes, 'Conditions');
          const cast = castActions.length === 1 ? castActions[0] : null;

          rows.push({
            profile,
            itemId: item.id,
            useId: use.id,
            spellId: String(contract?.spellId || ''),
            level: +(spell?.level ?? -1),
            school: String(spell?.school || ''),
            artifact: String(spell?.artifact || ''),
            ruleId: String(spell?.ruleId || ''),
            programId: String(spell?.programId || ''),
            mode: String(selectedProgram?.mode || ''),
            conditionState: conditionPresent ? 'present' : 'missing',
            conditionValue: conditionPresent ? String(attributes.Conditions ?? '') : '',
            rootArtifact: String(use.program?.rootArtifact || ''),
            rootId: String(use.program?.id || ''),
            root,
            rule,
            selectedProgram,
            a12Count: castActions.length,
            a12UseId: String(cast?.id || ''),
            a12SpellId: a12SpellId(cast),
          });
        }
      }
    }
  }

  return rows.sort((a, b) => a.profile.localeCompare(b.profile, 'en')
    || a.itemId.localeCompare(b.itemId, 'en')
    || a.useId.localeCompare(b.useId, 'en'));
}

const rows = collectA33Rows();

function allDigestLine(row) {
  return [row.profile, row.itemId, row.useId, row.spellId, row.level, row.school,
    row.artifact, row.programId, row.mode, row.conditionState, row.conditionValue].join('|');
}

function exceptionalConditionLine(row) {
  return [row.profile, row.itemId, row.useId, row.spellId, row.rootArtifact,
    row.rootId, row.conditionState, row.conditionValue].join('|');
}

function mismatchLine(row) {
  return [row.profile, row.itemId, row.a12UseId, row.a12SpellId,
    row.useId, row.spellId].join('|');
}

function rowLabel(row) {
  return `${row.profile}/${row.itemId}/${row.useId}/${row.spellId}`;
}

function readyForLearning(row) {
  return row.mode === 'typed' && row.conditionValue === '';
}

if (rows.length === 0) {
test('strict Standard catalogue contains no LearnSpell item routes', () => {
  assert.equal(current.catalogVersion, EXPECTED.version);
  assert.deepEqual(rows, []);
  assert.equal(manifest.counts.universe.standard, manifest.counts.items);
});
} else {
test('active v10 A33 census, conditions and A12/A33 identities are immutable', () => {
  assert.equal(current.catalogVersion, EXPECTED.version);
  assert.equal(rows.length, EXPECTED.rows);
  assert.equal(new Set(rows.map(row => `${row.profile}\0${row.itemId}\0${row.useId}`)).size,
    EXPECTED.rows, 'every profile/item/A33 action binding is unique');

  assert.deepEqual(Object.fromEntries(['standard'].map(profile =>
    [profile, rows.filter(row => row.profile === profile).length])), EXPECTED.byProfile);
  assert.deepEqual(Object.fromEntries(['mixed', 'typed'].map(mode =>
    [mode, rows.filter(row => row.mode === mode).length])), EXPECTED.byMode);

  for (const row of rows) {
    assert.equal(row.a12Count, 1, `${rowLabel(row)} must have one exact paired A12 action`);
    assert.ok(row.root, `${rowLabel(row)} exact A33 root is absent`);
    assert.ok(row.rule, `${rowLabel(row)} exact spell rule is absent`);
    assert.ok(row.selectedProgram, `${rowLabel(row)} exact profile spell program is absent`);
    assert.equal(row.root.id, row.rootId, `${rowLabel(row)} root identity`);
    assert.equal(row.rule.id, row.ruleId, `${rowLabel(row)} rule identity`);
    assert.equal(row.rule.bg3Id, row.spellId, `${rowLabel(row)} spell identity`);
    assert.equal(row.selectedProgram.id, row.programId, `${rowLabel(row)} program identity`);
    assert.equal(row.selectedProgram.sourceProfile, row.profile, `${rowLabel(row)} profile identity`);
  }

  assert.equal(digestRows(rows, allDigestLine), EXPECTED.allSha256);
  const mixed = rows.filter(row => row.mode === 'mixed');
  assert.equal(digestRows(mixed, allDigestLine), EXPECTED.mixedSha256);
  assert.ok(mixed.every(row => row.conditionState === 'present' && row.conditionValue === ''),
    'all 41 mixed rows have a distinct, empty A33 condition and fail because of the exact spell program');

  const conditionCounts = Object.fromEntries(['missing', 'present-empty', 'present-value'].map(kind => [kind,
    rows.filter(row => kind === 'missing' ? row.conditionState === 'missing'
      : kind === 'present-empty' ? row.conditionState === 'present' && row.conditionValue === ''
        : row.conditionState === 'present' && row.conditionValue !== '').length]));
  assert.deepEqual(conditionCounts, {missing: 1, 'present-empty': 112, 'present-value': 1});

  const exceptionalConditions = rows.filter(row =>
    row.conditionState === 'missing' || row.conditionValue !== '');
  assert.equal(exceptionalConditions.length, 2);
  assert.equal(digestRows(exceptionalConditions, exceptionalConditionLine),
    EXPECTED.exceptionalConditionsSha256);
  assert.deepEqual(exceptionalConditions.map(row => [row.profile, row.spellId,
    row.conditionState, row.conditionValue]), [
    ['standard', 'Target_CloudOfDaggers', 'present', 'CanUseSpellScroll("Target_CloudOfDaggers")'],
    ['standard', 'Target_DispelMagic', 'missing', ''],
  ]);

  const mismatches = rows.filter(row => row.a12SpellId !== row.spellId);
  assert.equal(mismatches.length, 2);
  assert.equal(digestRows(mismatches, mismatchLine), EXPECTED.a12A33MismatchSha256);
  assert.deepEqual(new Set(mismatches.map(row => `${row.a12SpellId}\0${row.spellId}`)), new Set([
    'Projectile_Fireball_FromScroll\0Projectile_Fireball',
    'Target_Summon_Quasit\0Target_PactOfTheChain_Quasit_Scroll',
  ]));

  for (const profile of ['standard']) {
    const fireball = rows.find(row => row.profile === profile && row.itemId === FIREBALL.itemId);
    assert.ok(fireball, `${profile} exact Fireball A33 binding`);
    assert.equal(fireball.a12UseId, FIREBALL[profile].a12UseId);
    assert.equal(fireball.a12SpellId, FIREBALL.a12SpellId);
    assert.equal(fireball.useId, FIREBALL[profile].a33UseId);
    assert.equal(fireball.spellId, FIREBALL.a33SpellId);
    assert.equal(fireball.mode, 'mixed');
  }

  const blocked = rows.filter(row => !readyForLearning(row));
  const executable = rows.filter(readyForLearning);
  assert.equal(blocked.length, EXPECTED.blocked);
  assert.equal(blocked.filter(row => row.mode === 'mixed').length, 41);
  assert.equal(blocked.filter(row => row.mode === 'typed').length, 1);
  assert.deepEqual(new Set(blocked.filter(row => row.mode === 'typed').map(row => row.spellId)),
    new Set(['Target_CloudOfDaggers']));
  assert.equal(executable.length, EXPECTED.ready);
  assert.equal(executable.filter(row => row.spellId === 'Target_DispelMagic').length, 1,
    'missing Conditions is accepted independently from a nonempty unresolved condition');
});

async function localCatalogFetch(url) {
  const clean = decodeURIComponent(String(url).split(/[?#]/, 1)[0]).replace(/\\/g, '/');
  const marker = clean.indexOf('data/bg3/');
  if (marker < 0) return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
  const file = path.resolve(repo, ...clean.slice(marker).split('/'));
  const relative = path.relative(repo, file);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
  }
  const raw = fs.readFileSync(file, 'utf8');
  return {ok: true, status: 200, json: async () => JSON.parse(raw), text: async () => raw};
}

function productionEngineSource() {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]);
  const source = scripts.findLast(candidate => /\(async\s+function\s+init\s*\(\s*\)\s*\{/.test(candidate));
  assert.ok(source, 'production inline engine script with init marker is missing');
  const initMarkers = [...source.matchAll(/\(async\s+function\s+init\s*\(\s*\)\s*\{/g)];
  assert.ok(initMarkers.length, 'production engine init boundary is missing');
  return source.slice(0, initMarkers.at(-1).index);
}

function loadEngine(random) {
  let source = productionEngineSource();
  source += String.raw`
    globalThis.__bg3LearnReadiness = {
      setState(s) {
        chars=s.chars||[];journal=s.journal||[];itemsDB=s.items||[];spellsDB=s.spells||[];
        bg3Catalog.items=new Map(itemsDB.filter(item=>bg3CatalogIsId(item&&item.id)).map(item=>[item.id,item]));
        abilitiesDB=s.abilities||[];racesDB=s.races||[];classesDB=s.classes||[];rulesDB=s.rules||[];foesDB=s.foes||[];
        activeCharId=s.activeCharId||null;fxRound=s.fxRound||1;
        harvestedSources=s.harvestedSources&&typeof s.harvestedSources==='object'?s.harvestedSources:{};
        bg3SceneState=bg3SceneNormalizeState(s.bg3SceneState);bg3StoryState=bg3StoryNormalizeState(s.bg3StoryState);
        bg3TadpoleState=bg3TadpoleNormalizeState(s.bg3TadpoleState);bg3TreasureState=bg3TreasureNormalizeState(s.bg3TreasureState);
        combat=normalizeCombatState(s.combat);lastCastEvent=null;castCtx=null;rollSpec=null;rollQueue=[];rollCompleting=false;bg3RollPromptScope=null;
        bg3RuleProgramClear();bg3LifecycleReset();bg3GithbornMindcrusherTrustCharacters(chars);bg3InterruptReset();
        bg3InventoryStatusTransitionReset();bg3SceneCatalogReset();fxInvalidate();
      },
      seedClasses(){return seedClassesDB();},
      wizardProfile(){return itemClone(bg3WizardProfileBinding(''));},
      useRefs(refs){return bg3CatalogUseRefs(itemClone(refs));},
      ensureIndex(){return bg3CatalogEnsureIndex();},
      async hydrate(ids){return (await bg3CatalogHydrate(itemClone(ids))).map(item=>item.id);},
      plan(caster,entryId,useId){return bg3LearnSpellPlanFor(caster,entryId,useId);},
      commit(plan){return bg3LearnSpellCommit(plan);},
      audit(){const fn=globalThis.bg3LearnSpellCommitAudit;return typeof fn==='function'?fn():null;}
    };
  `;

  const elements = new Map();
  const stored = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value: '', textContent: '', innerHTML: '', className: '',
        style: {}, dataset: {},
        classList: {toggle() {}, add() {}, remove() {}},
        closest() { return null; },
        focus() {},
      });
    }
    return elements.get(id);
  };
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {random}),
    Date,
    JSON,
    crypto: crypto.webcrypto,
    TextEncoder,
    Blob,
    URL,
    structuredClone,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => true,
    prompt: () => '1',
    alert() {},
    fetch: localCatalogFetch,
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, focus() {}, style: {}, dataset: {}}),
    },
    localStorage: {
      getItem: key => stored.has(key) ? stored.get(key) : null,
      setItem: (key, value) => { stored.set(key, String(value)); },
      removeItem: key => { stored.delete(key); },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, {filename: 'index.html#bg3-learn-spell-readiness'});
  return context.__bg3LearnReadiness;
}

function makeWizard(id, inventory) {
  return {
    id,
    name: id,
    player: '',
    race: 'Человек',
    subrace: '',
    cls: 'Волшебник',
    subcls: '',
    bg: '',
    align: 'Истинно нейтральный',
    level: 12,
    xp: 0,
    ab: {str: 10, dex: 14, con: 12, int: 18, wis: 12, cha: 10},
    saves: {str: false, dex: false, con: false, int: true, wis: true, cha: false},
    skills: {},
    hp: 40,
    hpMax: 40,
    hpTemp: 0,
    ac: 12,
    speed: '9 м',
    init: 2,
    hitDice: '12d6',
    inspiration: false,
    exhaustion: 0,
    cond: [],
    diseases: [],
    deaths: {s: 0, f: 0},
    resist: [],
    vuln: [],
    immune: [],
    coins: {mm: 0, sm: 0, em: 0, zm: 1000000, pm: 0},
    inventory,
    equipment: {},
    toolProficiencies: [],
    knownRecipes: [],
    bg3TreasureHistory: [],
    craftingFacilities: [],
    spellbook: [],
    bg3LearnedSpells: [],
    bg3DestroyedObjects: [],
    bg3Surfaces: [],
    bg3InventoryStatusTransitionHistory: [],
    slots: {},
    abilities: [],
    activeFx: [],
    activeEffectsSchemaVersion: 3,
    fxOff: [],
    feats: [],
    bg3Tags: [],
    bg3TagsComplete: true,
    spellPrepVersion: 3,
    spellLearning: {replacements: 0, anyClassChoices: 0},
    spentRest: 0,
    arcUsed: false,
    acOverride: null,
    initB: 0,
    hdUsed: 0,
    spellAb: 'int',
    persona: {tr: '', id: '', bd: '', fl: '', ap: ''},
    bg3ClassDescription: null,
  };
}

async function bootProfile(profileRows, profile) {
  const random = {calls: 0, armed: false};
  const engine = loadEngine(() => {
    if (random.armed) {
      random.calls++;
      throw new Error(`unexpected Math.random during ${profile} LearnSpell certification`);
    }
    return 0.5;
  });
  const inventory = profileRows.map((row, index) => ({
    id: `learn-readiness-${profile}-${index}`,
    itemId: row.itemId,
    qty: 1,
    notes: '',
  }));
  const actor = makeWizard(`learn-readiness-wizard-${profile}`, inventory);
  actor.bg3ClassDescription = plain(engine.wizardProfile());
  actor.bg3ClassDescription.classLevel = 12;
  engine.setState({chars: [actor], classes: engine.seedClasses(), activeCharId: actor.id});
  assert.equal(engine.useRefs([{
    id: 'bg3',
    version: current.catalogVersion,
    profile,
    manifestSha256: current.manifestSha256,
  }]), true, `${profile} catalog pin`);
  await engine.ensureIndex();
  const itemIds = [...new Set(profileRows.map(row => row.itemId))];
  const hydrated = await engine.hydrate(itemIds);
  assert.deepEqual(new Set(hydrated), new Set(itemIds), `${profile} exact item hydration`);
  random.calls = 0;
  random.armed = true;
  return {engine, actor, inventory, random};
}

function mutationSnapshot(actor) {
  return plain({
    inventory: actor.inventory,
    coins: actor.coins,
    spellbook: actor.spellbook,
    bg3LearnedSpells: actor.bg3LearnedSpells,
  });
}

function blockedSnapshot(engine, actor) {
  return plain({...mutationSnapshot(actor), audit: engine.audit()});
}

function failure(failures, condition, message) {
  if (!condition) failures.push(message);
}

test('all 114 real v10 Standard A33 routes fail prepay or commit exactly once from learned-spell readiness', async () => {
  const failures = [];

  for (const profile of ['standard']) {
    const profileRows = rows.filter(row => row.profile === profile);
    const world = await bootProfile(profileRows, profile);
    const {engine, actor, inventory, random} = world;

    /* Probe every fail-closed row first.  Keeping the negative slice together
     * makes accidental payment immediately attributable to readiness rather
     * than to state left by an earlier successful transaction. */
    for (const row of profileRows.filter(candidate => !readyForLearning(candidate))) {
      const index = profileRows.indexOf(row);
      const entryId = inventory[index].id;
      const label = rowLabel(row);
      const before = blockedSnapshot(engine, actor);
      let plan;
      try {
        plan = await engine.plan(actor, entryId, row.useId);
      } catch (error) {
        failures.push(`${label} plan threw: ${String(error?.stack || error)}`);
        continue;
      }
      failure(failures, plan?.ok === false, `${label} must fail before payment; got ${JSON.stringify(plain(plan))}`);
      failure(failures, typeof plan?.reason === 'string' && plan.reason.length > 0,
        `${label} blocked plan must explain the readiness failure`);
      failure(failures, isDeepStrictEqual(blockedSnapshot(engine, actor), before),
        `${label} blocked plan mutated item, coins, spellbook, learned spells, or private audit`);
    }

    for (const row of profileRows.filter(readyForLearning)) {
      const index = profileRows.indexOf(row);
      const entryId = inventory[index].id;
      const label = rowLabel(row);
      const beforePlan = mutationSnapshot(actor);
      let plan;
      try {
        plan = await engine.plan(actor, entryId, row.useId);
      } catch (error) {
        failures.push(`${label} plan threw: ${String(error?.stack || error)}`);
        continue;
      }
      failure(failures, plan?.ok === true, `${label} exact dry compile failed: ${String(plan?.reason || '')}`);
      failure(failures, isDeepStrictEqual(mutationSnapshot(actor), beforePlan),
        `${label} planning spent a resource before commit`);
      if (!plan?.ok) continue;

      let committed;
      try {
        committed = await engine.commit(plan);
      } catch (error) {
        failures.push(`${label} commit threw: ${String(error?.stack || error)}`);
        continue;
      }
      failure(failures, committed?.ok === true, `${label} commit failed: ${String(committed?.reason || '')}`);
      if (!committed?.ok) continue;

      const costGp = +(committed.costGp ?? plan.costGp);
      failure(failures, Number.isFinite(costGp) && costGp >= 0, `${label} invalid exact learning cost`);
      failure(failures, !actor.inventory.some(entry => entry.id === entryId), `${label} did not consume its qty1 A33 item`);
      failure(failures, actor.coins.zm === beforePlan.coins.zm - costGp, `${label} gold payment is not exact`);
      failure(failures, actor.bg3LearnedSpells.length === 1
        && actor.bg3LearnedSpells[0].spellId === row.spellId,
      `${label} did not add exactly the referenced learned spell`);
      const usedAudit = plain(engine.audit());
      failure(failures, usedAudit?.phase === 'used' && usedAudit.itemId === row.itemId
        && usedAudit.useId === row.useId && usedAudit.resourceTransactions === 1,
      `${label} did not report one atomic resource transaction`);

      const committedState = mutationSnapshot(actor);
      let replay;
      try {
        replay = await engine.commit(plan);
      } catch (error) {
        failures.push(`${label} replay threw: ${String(error?.stack || error)}`);
        continue;
      }
      failure(failures, replay?.ok === false && replay.replay === true,
        `${label} one-use plan was not terminal on replay`);
      failure(failures, isDeepStrictEqual(mutationSnapshot(actor), committedState),
        `${label} replay changed an authoritative resource`);
      const replayAudit = plain(engine.audit());
      failure(failures, replayAudit?.phase === 'replay-rejected'
        && replayAudit.resourceTransactions === 0,
      `${label} replay audit did not remain a zero-transaction rejection`);

      /* Some catalog variants intentionally teach the same spell.  Each row
       * certifies its own exact source item, so clear only the learned outcome
       * before moving to the next independent binding. */
      actor.bg3LearnedSpells = [];
    }

    failure(failures, random.calls === 0, `${profile} LearnSpell readiness called Math.random`);
  }

  assert.equal(failures.length, 0, failures.slice(0, 40).join('\n'));
});
}
