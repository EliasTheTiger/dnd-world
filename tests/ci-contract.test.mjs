import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const integrationRunner = fs.readFileSync(path.join(root, 'qa', 'run-final-integration.cjs'), 'utf8');
const require = createRequire(import.meta.url);
const {readBrowserSummary, readCampaignSummary} = require(path.join(root, 'qa', 'run-final-integration.cjs'));
const testFiles = fs.readdirSync(path.join(root, 'tests')).filter(name => /\.test\.(?:mjs|cjs)$/.test(name)).sort();
const campaignStages = [
  'campaign-start','starting-grants','merchant-visit','merchant-buy','merchant-sell','currency-exchange',
  'equipment-cycle','scene-entry','item-spell-ability-and-weapon','enemy-consequence','chest-found',
  'lock-and-trap-check','chest-or-mimic-resolution','loot-claimed','loot-resold','campaign-saved',
  'application-restarted-and-continued',
];
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const fingerprint = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');

function validCampaignReceipt(index) {
  const configuration = {
    actorProfile:`actor-${Math.floor(index / 100)}`,
    merchantTemplate:`merchant-${Math.floor(index / 10) % 10}`,
    chestScenario:`chest-${index % 10}`,
    foeId:`foe-${index % 30}`,
  };
  return {
    campaignId:`campaign-${String(index + 1).padStart(3, '0')}`, fingerprint:fingerprint(configuration), configuration,
    stages:campaignStages,
    productionCommits:{item:1,spell:1,ability:1,weapon:1,foeAction:1,equipmentCycles:1},
    additionalProductionCommits:{mimicWeapon:index % 10 >= 8 ? 1 : 0},
    trade:{buy:true,sell:true,lootResale:true,atomicityChecked:true},currencyExchange:true,
    chest:{lockChecked:true,trapChecked:true,resolution:index % 10 >= 8 ? 'mimic' : 'chest'},
    loot:{claimed:true,duplicateRejected:true},
    persistence:{failedWriteRollback:true,staleRevisionRejected:true,restarted:true,continued:true,
      effectsPreserved:true,inventoryCurrencyPreserved:true,worldPreserved:true},partySize:5,
  };
}

test('Pages deployment is gated by the complete discovered Node test suite', () => {
  assert.match(workflow, /\n  test:\n/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /run:\s*node --test tests\/\*\.test\.\*/);
  assert.match(workflow, /\n  build:\n    needs: \[test, integration\]\n/);
  assert.ok(testFiles.length >= 20, `expected the complete suite, found ${testFiles.length}`);
  assert.equal(new Set(testFiles).size, testFiles.length);
});

test('strict integration command runs the full suite locally and browser smoke in CI', () => {
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.*');
  assert.equal(packageJson.scripts['qa:integration'], 'node qa/run-final-integration.cjs');
  assert.match(integrationRunner, /process\.env\.CI === 'true' && process\.env\.DND_WORLD_SKIP_FULL_SUITE === '1'/);
  assert.match(integrationRunner, /runNode\(\['--test', 'tests\/\*\.test\.\*'\], suiteEnv\)/);
  assert.match(integrationRunner, /DND_WORLD_CAMPAIGN_EVIDENCE:campaignEvidencePath/);
  assert.match(integrationRunner, /readCampaignSummary\(artifactDir\)/);
  assert.match(integrationRunner, /runNode\(\['qa\/player-agent\.e2e\.cjs'\], browserEnv\)/);
  assert.match(integrationRunner, /stdio: 'inherit'/);
  assert.match(integrationRunner, /QA_RUN_ID: runId/);
  assert.match(integrationRunner, /QA_ARTIFACT_DIR: artifactDir/);
  assert.match(integrationRunner, /path\.join\(artifactDir, 'run\.json'\)/);
  assert.match(integrationRunner, /failed > 0 \|\| blocked > 0 \|\| consoleFailures\.length > 0 \|\| networkFailures\.length > 0/);
});

test('strict campaign evidence requires 500 completed production-engine journeys', t => {
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-world-campaign-contract-'));
  t.after(() => fs.rmSync(artifactDir, {recursive: true, force: true}));
  const valid = {
    schemaVersion:'dnd-world-final-integration-matrix/1',campaigns:500,completed:500,
    distinctCampaignIds:500,distinctConfigurations:500,
    catalogAdmissionCoverage:{items:10475,localItems:193,bg3Items:10282,spells:958,abilities:693,foes:30,executionClaim:false},
    productionExecutedIds:{
      items:['it_зелье_лечения_2d4_2'],spells:['sp_щит_веры'],abilities:['ab_lg_surge'],weapons:['it_дубинка'],
      foeDefinitions:Array.from({length:30},(_,index)=>`foe-${index}`),
      foeActions:Array.from({length:30},(_,index)=>({foeId:`foe-${index}`,actionId:`action-${index}`})),
      mimicDefinitions:['system:chest-mimic'],
    },
    structuredFormulaValidation:{auditFunction:'gameDataAudit',scope:'installed-local-runtime',executionClaim:false,
      variantsBuiltAndValidated:6408,definitions:{spells:958,abilities:693,items:193,foes:30,total:1874},errors:0},
    productionCommits:{item:500,spell:500,ability:500,weapon:500,foeAction:500,equipmentCycles:500},
    additionalProductionCommits:{mimicWeapon:100},
    stageCounts:Object.fromEntries(campaignStages.map(stage => [stage,500])),
    engineAudit:{worldErrors:0,itemFailed:0,itemPassed:1067,worldVariants:6408,
      worldCounts:{spells:958,abilities:693,items:193,foes:30,total:1874},
      rareBattlePassed:250,rareBattleFailed:0,spellPreparationPassed:320,spellPreparationFailed:0},
    lootClaims:500,duplicateLootRejections:500,
    campaignReceipts:Array.from({length:500},(_,index)=>validCampaignReceipt(index)),
  };
  const write = value => fs.writeFileSync(path.join(artifactDir, 'campaign-matrix.json'), JSON.stringify(value), 'utf8');
  write(valid);
  assert.equal(readCampaignSummary(artifactDir).summary.completed, 500);
  for (const [label, mutate] of [
    ['499 campaigns', value => { value.completed = 499; }],
    ['decorative duplicate configurations', value => { value.distinctConfigurations = 1; }],
    ['missing spell commits', value => { value.productionCommits.spell = 499; }],
    ['missing aggregate mimic weapon commit', value => { value.additionalProductionCommits.mimicWeapon = 99; }],
    ['missing mimic receipt weapon commit', value => { value.campaignReceipts[8].additionalProductionCommits.mimicWeapon = 0; }],
    ['counterfeit chest receipt weapon commit', value => { value.campaignReceipts[0].additionalProductionCommits.mimicWeapon = 1; }],
    ['item audit failure', value => { value.engineAudit.itemFailed = 1; }],
    ['catalog admission drift', value => { value.catalogAdmissionCoverage.items = 10474; }],
    ['catalog admission mislabeled as execution', value => { value.catalogAdmissionCoverage.executionClaim = true; }],
    ['counterfeit executed spell census', value => { value.productionExecutedIds.spells.push('sp_not_executed'); }],
    ['formula validation mislabeled as execution', value => { value.structuredFormulaValidation.executionClaim = true; }],
    ['duplicate loot accepted', value => { value.duplicateLootRejections = 499; }],
    ['coerced count', value => { value.campaigns = '500'; }],
    ['truncated receipts', value => { value.campaignReceipts.pop(); }],
    ['counterfeit fingerprint', value => { value.campaignReceipts[0].fingerprint = '0'.repeat(64); }],
    ['missing persistence proof', value => { value.campaignReceipts[0].persistence.effectsPreserved = false; }],
    ['rare battle regression', value => { value.engineAudit.rareBattleFailed = 1; }],
  ]) {
    const value=structuredClone(valid);mutate(value);write(value);
    assert.throws(()=>readCampaignSummary(artifactDir),/strict campaign acceptance failed/,label);
  }
});

test('strict browser summary validation fails closed for every acceptance signal', t => {
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-world-integration-contract-'));
  t.after(() => fs.rmSync(artifactDir, {recursive: true, force: true}));
  const runId = 'contract-run';
  const phaseIds = Array.from({length: 15}, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
  const valid = {
    schemaVersion: 'dnd-world-player-agent-run/1',
    runId,
    role:'Опытный игрок D&D',targetUrl:'http://127.0.0.1:4177/dnd-world/',startedWithCleanBrowserContext:true,
    blackBoxGuarantees:['visible UI only','DOM evidence only','no application storage access','no internal function calls','all dice values supplied by scenario'],
    counts: {PASS: 15, FAIL: 0, BLOCKED: 0},
    phases: phaseIds.map((id, index) => ({id, title: `Phase ${index + 1}`})),
    results: phaseIds.map((phase, index) => ({phase,number:index+1,id:`scenario-${index+1}`,status:'PASS',
      startedAt:`2026-09-02T10:${String(index).padStart(2,'0')}:00.000Z`,url:'http://127.0.0.1:4177/dnd-world/',
      action:`Action ${index+1}`,expected:`Expected ${index+1}`,actual:`Actual ${index+1}`,reproduction:[`Step ${index+1}`]})),
    consoleEvents: [],
    networkEvents: [],
    dialogEvents: [],
  };
  const write = value => fs.writeFileSync(path.join(artifactDir, 'run.json'), JSON.stringify(value), 'utf8');

  write(valid);
  assert.equal(readBrowserSummary(runId, artifactDir).summary.counts.PASS, 15);
  for (const [label, mutate] of [
    ['FAIL', value => { value.results[0].status = 'FAIL'; value.counts.PASS = 14; value.counts.FAIL = 1; }],
    ['BLOCKED', value => { value.results[0].status = 'BLOCKED'; value.counts.PASS = 14; value.counts.BLOCKED = 1; }],
    ['console error', value => { value.consoleEvents.push({type: 'error', text: 'boom'}); }],
    ['pageerror', value => { value.consoleEvents.push({type: 'pageerror', text: 'boom'}); }],
    ['requestfailed', value => { value.networkEvents.push({kind: 'requestfailed', url: '/lost'}); }],
    ['HTTP error', value => { value.networkEvents.push({kind: 'http', status: 404, url: '/missing'}); }],
  ]) {
    const value = structuredClone(valid);
    mutate(value);
    write(value);
    assert.throws(() => readBrowserSummary(runId, artifactDir), /strict browser acceptance failed/, label);
  }

  const missingFailureEvidence = structuredClone(valid);
  missingFailureEvidence.results[0].status = 'FAIL';
  missingFailureEvidence.counts = {PASS:14,FAIL:1,BLOCKED:0};
  write(missingFailureEvidence);
  assert.throws(() => readBrowserSummary(runId, artifactDir), /screenshot path is missing|DOM file path is missing|failure JSON path is missing/,
    'a failed browser step cannot omit its forensic files');

  write({...valid, consoleEvents: undefined});
  assert.throws(() => readBrowserSummary(runId, artifactDir), /strict browser acceptance failed/);

  for (const [label, mutate] of [
    ['truncated results', value => { value.results.pop(); value.counts.PASS = 14; }],
    ['duplicate phase', value => { value.results[14].phase = 'P14'; }],
    ['count census mismatch', value => { value.counts.PASS = 14; }],
    ['boolean PASS count', value => { value.counts.PASS = true; }],
    ['null FAIL count', value => { value.counts.FAIL = null; }],
    ['string BLOCKED count', value => { value.counts.BLOCKED = '0'; }],
    ['wrong schema', value => { value.schemaVersion = 'unknown/1'; }],
    ['missing action evidence', value => { delete value.results[0].action; }],
    ['missing reproduction', value => { value.results[0].reproduction = []; }],
    ['not a clean browser', value => { value.startedWithCleanBrowserContext = false; }],
  ]) {
    const value = structuredClone(valid);
    mutate(value);
    write(value);
    assert.throws(() => readBrowserSummary(runId, artifactDir), /strict browser acceptance failed/, label);
  }
});

test('integration CI job installs Chromium, avoids the duplicate full suite and gates Pages build', () => {
  assert.match(workflow, /\n  integration:\n    needs: test\n[\s\S]*?run: npm install/);
  assert.match(workflow, /\n  integration:\n[\s\S]*?npx playwright install --with-deps chromium/);
  assert.match(workflow, /\n  integration:\n[\s\S]*?node scripts\/build-pages-site\.mjs/);
  assert.match(workflow, /release\.commit!==process\.env\.GITHUB_SHA/);
  assert.match(workflow, /QA_SITE_ROOT: _site/);
  assert.match(workflow, /\n  integration:\n[\s\S]*?DND_WORLD_SKIP_FULL_SUITE: '1'[\s\S]*?run: npm run qa:integration/);
  assert.match(workflow, /if: always\(\)[\s\S]*?actions\/upload-artifact@v4[\s\S]*?path: qa\/evidence\//);
  assert.doesNotMatch(workflow.match(/\n  integration:\n([\s\S]*?)\n  build:/)?.[1] || '', /node --test tests\/\*\.test\.\*/);
});

test('local integration rebuilds and verifies the exact Pages candidate after the full suite', () => {
  const main = integrationRunner.slice(integrationRunner.indexOf('function main()'));
  const suite = main.indexOf("runNode(['--test', 'tests/*.test.*']");
  const pages = main.indexOf('preparePagesCandidate()');
  const browser = main.indexOf("runNode(['qa/player-agent.e2e.cjs']");
  assert.ok(suite >= 0 && pages > suite && browser > pages,
    'the same command must normalize test side effects before browser acceptance');
  assert.match(integrationRunner, /runNode\(\['scripts\/build-pages-site\.mjs'\]/);
  assert.match(integrationRunner, /git', \['rev-parse', 'HEAD'\]/);
  assert.match(integrationRunner, /release\.commit !== commit/);
  assert.match(integrationRunner, /QA_SITE_ROOT:siteRoot/);
});

test('deploy still depends on the gated build artifact', () => {
  assert.match(workflow, /\n  deploy:[\s\S]*?needs: build/);
});
