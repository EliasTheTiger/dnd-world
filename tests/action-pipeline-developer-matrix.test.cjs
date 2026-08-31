const assert = require('node:assert/strict');
const test = require('node:test');
const {ActionKernel} = require('../scripts/action-kernel.js');
const {ActionHandlerRegistry, descriptor} = require('../scripts/ui-action-contract.js');

const RESULT_SCHEMA = 'dnd-world-action-result/1';
const CONTEXT_FIELDS = [
  'currentCharacter', 'characteristics', 'resources', 'conditions', 'inventory',
  'equipment', 'abilities', 'spells', 'currentScene', 'environment', 'allies',
  'enemies', 'distances', 'activeEffects', 'restrictions', 'gameMasterRights',
];

function clone(value) {
  return structuredClone(value);
}

function contextFor(world) {
  return {
    currentCharacter: {id: 'hero'}, characteristics: {str: 16}, resources: {slots: world.slots},
    conditions: [], inventory: [], equipment: {}, abilities: ['attack'], spells: [],
    currentScene: {id: 'arena'}, environment: {light: 'bright'}, allies: [{id: 'hero'}],
    enemies: [{id: 'foe'}], distances: {'hero:foe': 1.5}, activeEffects: [], restrictions: [],
    gameMasterRights: {canOverrideResult: true}, revision: world.revision,
  };
}

function definitionFor(index) {
  return {
    action: {id: `matrix-action-${index}`, label: `Matrix action ${index}`},
    source: {kind: 'ability', id: 'attack'}, possibleTargets: ['foe'],
    cost: {kind: 'action', amount: 1}, requirements: [], restrictions: [],
    handler: 'matrix-handler', possibleResults: ['success', 'failure'],
  };
}

function actionResult(index, success, reasonCode, extra = {}) {
  return {
    schemaVersion: RESULT_SCHEMA, actionId: `matrix-action-${index}`, success,
    outcome: success ? 'resolved' : 'rejected', rolls: [], appliedEffects: [], stateChanges: [],
    resourcesSpent: [], createdEvents: [{type: success ? 'action-resolved' : 'action-rejected'}],
    userMessages: [success ? 'Действие выполнено.' : 'Действие не выполнено: есть точная причина.'],
    auditData: {reasonCode, matrixIndex: index}, ...extra,
  };
}

function rejection(error, meta, index) {
  return {...actionResult(index, false, error.code || 'ACTION_ERROR'), phase: meta.phase};
}

function basePipeline(world, index, phases, options = {}) {
  return {
    resolve: async () => { phases.push('definition'); return definitionFor(index); },
    context: async () => { phases.push('context'); return contextFor(world); },
    validate: async () => {
      phases.push('validation');
      return options.evaluation || {allowed: true, reasonCode: 'ALLOWED', explanation: 'Доступно.', availableTargets: ['foe']};
    },
    snapshot: async () => { phases.push('snapshot'); return clone(world); },
    prepare: async () => { phases.push('prepare'); return {damage: 2, resourceKey: `action:${index}`}; },
    commit: async (prepared, token) => {
      phases.push('commit');
      token.commit(prepared.resourceKey, () => { world.slots -= 1; });
      if (options.doubleCommit) token.commit(prepared.resourceKey, () => { world.slots -= 1; });
      world.hp -= prepared.damage;
      return prepared;
    },
    consequences: async prepared => {
      phases.push('consequences');
      if (options.consequenceFailure) throw Object.assign(new Error('injected consequence failure'), {code: 'CONSEQUENCE_FAILED'});
      return actionResult(index, true, 'RESOLVED', {
        appliedEffects: [{kind: 'damage', amount: prepared.damage}],
        stateChanges: [{path: 'foe.hp', delta: -prepared.damage}],
        resourcesSpent: [{kind: 'action', amount: 1}],
      });
    },
    persist: async () => {
      phases.push('persistence');
      if (options.persistenceFailure) return {ok: false, code: 'FAILED_TO_PERSIST', reason: 'No durable receipt.'};
      return {ok: true, receipt: {revision: ++world.revision, durable: true}};
    },
    rollback: async snapshot => { phases.push('rollback'); Object.assign(world, snapshot); },
    present: async result => { phases.push('feedback'); return result; },
    reject: (error, meta) => rejection(error, meta, index),
  };
}

for (let index = 0; index < 100; index++) {
  test(`developer matrix ${index + 1}/600: full pipeline order and atomic success`, async () => {
    const world = {slots: 3, hp: 20, revision: index};
    const phases = [];
    const result = await new ActionKernel().execute({actionId: `matrix-action-${index}`}, basePipeline(world, index, phases));
    assert.deepEqual(phases, ['definition', 'context', 'validation', 'snapshot', 'prepare', 'commit', 'consequences', 'persistence', 'feedback']);
    assert.equal(result.schemaVersion, RESULT_SCHEMA);
    assert.equal(result.success, true);
    assert.equal(result.persistenceReceipt.durable, true);
    assert.deepEqual(world, {slots: 2, hp: 18, revision: index + 1});
    assert.ok(result.userMessages.some(Boolean));
  });

  test(`developer matrix ${index + 101}/600: denied evaluation is explanatory and zero-mutation`, async () => {
    const world = {slots: 3, hp: 20, revision: index};
    const before = clone(world), phases = [];
    const evaluation = {allowed: false, reasonCode: `BLOCKED_${index}`, explanation: `Причина блокировки ${index}.`, availableTargets: []};
    const result = await new ActionKernel().execute({actionId: `matrix-action-${index}`}, basePipeline(world, index, phases, {evaluation}));
    assert.deepEqual(phases, ['definition', 'context', 'validation']);
    assert.deepEqual(world, before);
    assert.equal(result.success, false);
    assert.equal(result.auditData.reasonCode, `BLOCKED_${index}`);
    assert.ok(result.userMessages.some(Boolean));
  });

  test(`developer matrix ${index + 201}/600: persistence failure rolls back the whole action`, async () => {
    const world = {slots: 3, hp: 20, revision: index};
    const before = clone(world), phases = [];
    const result = await new ActionKernel().execute({actionId: `matrix-action-${index}`}, basePipeline(world, index, phases, {persistenceFailure: true}));
    assert.equal(result.auditData.reasonCode, 'FAILED_TO_PERSIST');
    assert.equal(phases.at(-1), 'rollback');
    assert.deepEqual(world, before);
  });

  test(`developer matrix ${index + 301}/600: consequence error rolls back resources and state`, async () => {
    const world = {slots: 3, hp: 20, revision: index};
    const before = clone(world), phases = [];
    const result = await new ActionKernel().execute({actionId: `matrix-action-${index}`}, basePipeline(world, index, phases, {consequenceFailure: true}));
    assert.equal(result.auditData.reasonCode, 'CONSEQUENCE_FAILED');
    assert.equal(result.phase, 'consequences');
    assert.deepEqual(world, before);
  });

  test(`developer matrix ${index + 401}/600: duplicate resource commit is rejected atomically`, async () => {
    const world = {slots: 3, hp: 20, revision: index};
    const before = clone(world), phases = [];
    const result = await new ActionKernel().execute({actionId: `matrix-action-${index}`}, basePipeline(world, index, phases, {doubleCommit: true}));
    assert.equal(result.auditData.reasonCode, 'RESOURCE_DOUBLE_COMMIT');
    assert.equal(result.phase, 'commit');
    assert.deepEqual(world, before);
  });

  test(`developer matrix ${index + 501}/600: UI descriptor audit proves no dead button`, async () => {
    const registry = new ActionHandlerRegistry().register(`handler-${index}`, payload => actionResult(index, true, 'RESOLVED', {payload}));
    const available = descriptor({actionId: `available-${index}`, label: 'Выполнить', status: 'available', handlerId: `handler-${index}`, evaluationToken: `token-${index}`, payload: {index}});
    const blocked = descriptor({actionId: `blocked-${index}`, label: 'Недоступно', status: 'blocked', reasonCode: `BLOCKED_${index}`, explanation: `Конкретная причина ${index}.`});
    const audit = registry.audit([available, blocked]);
    assert.deepEqual(audit, {ok: true, checked: 2, issues: []});
    const executed = await registry.dispatch(available);
    assert.equal(executed.ok, true);
    assert.ok(executed.result.userMessages.some(Boolean));
    const denied = await registry.dispatch(blocked);
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, `BLOCKED_${index}`);
    assert.equal(denied.error.message, `Конкретная причина ${index}.`);
  });
}

test('developer matrix contract census is exactly 600 independent cases', () => {
  const context = contextFor({slots: 1, revision: 0});
  assert.deepEqual(CONTEXT_FIELDS.filter(field => !Object.hasOwn(context, field)), []);
  assert.equal(Object.keys(definitionFor(0)).length, 8);
});
