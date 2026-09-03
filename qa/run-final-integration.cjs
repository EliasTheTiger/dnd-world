'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT = path.join(__dirname, 'evidence');
const SKIP_FULL_SUITE = process.env.CI === 'true' && process.env.DND_WORLD_SKIP_FULL_SUITE === '1';
const BROWSER_SCHEMA_VERSION = 'dnd-world-player-agent-run/1';
const CAMPAIGN_SCHEMA_VERSION = 'dnd-world-final-integration-matrix/1';
const CAMPAIGN_COUNT = 500;
const EXPECTED_BROWSER_PHASES = Object.freeze(Array.from({ length: 15 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`));
const REQUIRED_CAMPAIGN_STAGES = Object.freeze([
  'campaign-start', 'starting-grants', 'merchant-visit', 'merchant-buy',
  'merchant-sell', 'currency-exchange', 'equipment-cycle', 'scene-entry',
  'item-spell-ability-and-weapon', 'enemy-consequence', 'chest-found',
  'lock-and-trap-check', 'chest-or-mimic-resolution', 'loot-claimed',
  'loot-resold', 'campaign-saved', 'application-restarted-and-continued',
]);
const PRODUCTION_COMMIT_KEYS = Object.freeze(['item','spell','ability','weapon','foeAction','equipmentCycles']);
const BLACK_BOX_GUARANTEES = Object.freeze([
  'visible UI only', 'DOM evidence only', 'no application storage access',
  'no internal function calls', 'all dice values supplied by scenario',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value) {
  if (!nonEmptyString(value)) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch (_error) { return false; }
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function configurationFingerprint(configuration) {
  return crypto.createHash('sha256').update(canonical(configuration)).digest('hex');
}

function artifactFileIssue(artifactDir, relativePath, label) {
  if (!nonEmptyString(relativePath)) return `${label} path is missing`;
  const resolved = path.resolve(REPO_ROOT, relativePath);
  const root = path.resolve(artifactDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return `${label} is outside the allocated artifact directory`;
  try {
    if (!fs.statSync(resolved).isFile() || fs.statSync(resolved).size === 0) return `${label} is empty`;
  } catch (_error) {
    return `${label} does not exist`;
  }
  return null;
}

function fail(message, details) {
  process.stderr.write(`\nFINAL INTEGRATION FAILED: ${message}\n`);
  if (details) process.stderr.write(`${details}\n`);
  process.exitCode = 1;
}

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
  });
  if (result.error) {
    fail(`could not start ${process.execPath} ${args.join(' ')}`, result.error.stack || String(result.error));
    return false;
  }
  if (result.status !== 0) {
    fail(`${process.execPath} ${args.join(' ')} exited with code ${String(result.status)}`);
    return false;
  }
  return true;
}

function currentReleaseCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.stack || String(result.error) : String(result.stderr || '').trim();
    throw new Error(`cannot resolve the current release commit: ${detail || `git exited with ${String(result.status)}`}`);
  }
  const commit = String(result.stdout || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`git returned an invalid release commit: ${commit || 'empty'}`);
  return commit;
}

function preparePagesCandidate() {
  if (process.env.DND_WORLD_QA_URL) return null;
  const defaultRoot = path.join(REPO_ROOT, '_site');
  const siteRoot = path.resolve(process.env.QA_SITE_ROOT || defaultRoot);
  const commit = currentReleaseCommit();
  if (siteRoot === defaultRoot) {
    process.stdout.write(`\n=== Exact Pages candidate: ${commit} ===\n`);
    if (!runNode(['scripts/build-pages-site.mjs'], {...process.env,DND_WORLD_RELEASE:commit})) {
      throw new Error('the exact Pages candidate could not be built');
    }
  }
  let release;
  try {
    release = JSON.parse(fs.readFileSync(path.join(siteRoot, 'release.json'), 'utf8'));
  } catch (error) {
    throw new Error(`cannot read Pages release metadata from ${siteRoot}: ${error.message}`);
  }
  if (!isRecord(release) || release.commit !== commit) {
    throw new Error(`Pages release mismatch: expected ${commit}, got ${String(release && release.commit || 'missing')}`);
  }
  return siteRoot;
}

function uniqueBrowserRun() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = crypto.randomBytes(6).toString('hex');
    const runId = `final-integration-${stamp}-${process.pid}-${suffix}`;
    const artifactDir = path.join(EVIDENCE_ROOT, runId);
    if (!fs.existsSync(artifactDir)) return { runId, artifactDir };
  }
  throw new Error('could not allocate a unique browser artifact directory');
}

function readBrowserSummary(runId, artifactDir) {
  const summaryPath = path.join(artifactDir, 'run.json');
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read browser summary ${summaryPath}: ${error.message}`);
  }
  const artifactIssues = [];
  if (!isRecord(summary)) artifactIssues.push('summary must be an object');
  if (summary && summary.schemaVersion !== BROWSER_SCHEMA_VERSION) artifactIssues.push(`schemaVersion must be ${BROWSER_SCHEMA_VERSION}`);
  if (summary && summary.runId !== runId) artifactIssues.push('runId does not match the allocated run');
  if (summary && !nonEmptyString(summary.role)) artifactIssues.push('player role is missing');
  if (summary && !isHttpUrl(summary.targetUrl)) artifactIssues.push('targetUrl must be an HTTP(S) URL');
  if (summary && summary.startedWithCleanBrowserContext !== true) artifactIssues.push('browser context must be explicitly clean');
  if (summary && (!Array.isArray(summary.blackBoxGuarantees) ||
      BLACK_BOX_GUARANTEES.some(value => !summary.blackBoxGuarantees.includes(value)))) {
    artifactIssues.push('blackBoxGuarantees are incomplete');
  }
  if (!summary || !isRecord(summary.counts)) artifactIssues.push('counts object is missing');

  const exactCount = status => summary && summary.counts && summary.counts[status];
  const passed = exactCount('PASS');
  const failed = exactCount('FAIL');
  const blocked = exactCount('BLOCKED');
  for (const [status, value] of [['PASS', passed], ['FAIL', failed], ['BLOCKED', blocked]]) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) artifactIssues.push(`${status} must be a non-negative integer number`);
  }

  if (!summary || !Array.isArray(summary.phases)) artifactIssues.push('phases array is missing');
  else {
    const phaseIds = summary.phases.map(phase => phase && phase.id);
    if (JSON.stringify(phaseIds) !== JSON.stringify(EXPECTED_BROWSER_PHASES)) artifactIssues.push('phases must contain ordered P01–P15 exactly once');
    if (summary.phases.some(phase => !isRecord(phase) || !nonEmptyString(phase.title))) artifactIssues.push('every phase must have a non-empty title');
  }
  if (!summary || !Array.isArray(summary.results)) artifactIssues.push('results array is missing');
  else {
    const resultPhases = summary.results.map(result => result && result.phase);
    const resultNumbers = summary.results.map(result => result && result.number);
    const statuses = summary.results.map(result => result && result.status);
    if (summary.results.length !== EXPECTED_BROWSER_PHASES.length ||
        JSON.stringify(resultPhases) !== JSON.stringify(EXPECTED_BROWSER_PHASES)) {
      artifactIssues.push('results must complete ordered P01–P15 exactly once');
    }
    if (JSON.stringify(resultNumbers) !== JSON.stringify(EXPECTED_BROWSER_PHASES.map((_, index) => index + 1))) {
      artifactIssues.push('result step numbers must be ordered 1–15 exactly once');
    }
    if (statuses.some(status => !['PASS', 'FAIL', 'BLOCKED'].includes(status))) artifactIssues.push('result contains an unknown status');
    const resultIds = summary.results.map(result => result && result.id);
    if (resultIds.some(id => !nonEmptyString(id)) || new Set(resultIds).size !== EXPECTED_BROWSER_PHASES.length) {
      artifactIssues.push('every result must have a unique non-empty defect/scenario id');
    }
    for (const result of summary.results) {
      if (!isRecord(result)) continue;
      if (!nonEmptyString(result.action)) artifactIssues.push(`${result.phase || 'result'}: action is missing`);
      if (!nonEmptyString(result.expected)) artifactIssues.push(`${result.phase || 'result'}: expected result is missing`);
      if (!nonEmptyString(result.actual)) artifactIssues.push(`${result.phase || 'result'}: actual result is missing`);
      if (!isHttpUrl(result.url)) artifactIssues.push(`${result.phase || 'result'}: URL is missing or invalid`);
      if (!nonEmptyString(result.startedAt) || Number.isNaN(Date.parse(result.startedAt))) artifactIssues.push(`${result.phase || 'result'}: startedAt is invalid`);
      if (!Array.isArray(result.reproduction) || result.reproduction.length === 0 || result.reproduction.some(step => !nonEmptyString(step))) {
        artifactIssues.push(`${result.phase || 'result'}: minimal reproduction is missing`);
      }
      if (result.status === 'FAIL' || result.status === 'BLOCKED') {
        if (result.runId !== runId) artifactIssues.push(`${result.phase}: failure runId mismatch`);
        if (result.defectId !== result.id || result.stepNumber !== result.number) artifactIssues.push(`${result.phase}: failure identity mismatch`);
        if (!nonEmptyString(result.domFragment)) artifactIssues.push(`${result.phase}: DOM fragment is missing`);
        for (const key of ['uiMessages','consoleErrors','failedNetworkRequests','dialogs']) {
          if (!Array.isArray(result[key])) artifactIssues.push(`${result.phase}: ${key} evidence is missing`);
        }
        if (!Array.isArray(result.minimalReproduction) || result.minimalReproduction.length === 0 ||
            result.minimalReproduction.some(step => !nonEmptyString(step))) artifactIssues.push(`${result.phase}: captured reproduction is missing`);
        const screenshotIssue = artifactFileIssue(artifactDir, result.screenshot, `${result.phase} screenshot`);
        const domIssue = artifactFileIssue(artifactDir, result.domFile, `${result.phase} DOM file`);
        const evidenceIssue = artifactFileIssue(artifactDir, result.evidenceFile, `${result.phase} failure JSON`);
        if (screenshotIssue) artifactIssues.push(screenshotIssue);
        if (domIssue) artifactIssues.push(domIssue);
        if (evidenceIssue) artifactIssues.push(evidenceIssue);
      }
    }
    if ([passed, failed, blocked].every(value => typeof value === 'number' && Number.isInteger(value))) {
      const census = statuses.reduce((counts, status) => {
        if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
        return counts;
      }, { PASS: 0, FAIL: 0, BLOCKED: 0 });
      if (census.PASS !== passed || census.FAIL !== failed || census.BLOCKED !== blocked) artifactIssues.push('counts do not match the result status census');
    }
  }

  if (!summary || !Array.isArray(summary.consoleEvents) || !Array.isArray(summary.networkEvents) || !Array.isArray(summary.dialogEvents)) {
    artifactIssues.push('consoleEvents, networkEvents and dialogEvents arrays are required');
  }
  if (artifactIssues.length) throw new Error(`strict browser acceptance failed:\n${artifactIssues.join('\n')}`);

  const consoleFailures = summary.consoleEvents.filter(event =>
    ['error', 'assert', 'pageerror'].includes(String(event && event.type).toLowerCase()));
  const networkFailures = summary.networkEvents.filter(event => event && (
    event.kind === 'requestfailed' ||
    (event.kind === 'http' && Number(event.status) >= 400)
  ));

  if (passed !== EXPECTED_BROWSER_PHASES.length || failed > 0 || blocked > 0 || consoleFailures.length > 0 || networkFailures.length > 0) {
    const diagnostics = {
      runId,
      summaryPath,
      counts: summary.counts,
      consoleFailures,
      networkFailures,
    };
    throw new Error(`strict browser acceptance failed:\n${JSON.stringify(diagnostics, null, 2)}`);
  }
  return { summary, summaryPath };
}

function readCampaignSummary(artifactDir) {
  const summaryPath = path.join(artifactDir, 'campaign-matrix.json');
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read campaign summary ${summaryPath}: ${error.message}`);
  }
  const issues = [];
  if (!isRecord(summary)) issues.push('summary must be an object');
  if (summary && summary.schemaVersion !== CAMPAIGN_SCHEMA_VERSION) issues.push(`schemaVersion must be ${CAMPAIGN_SCHEMA_VERSION}`);
  for (const key of ['campaigns', 'completed', 'distinctCampaignIds', 'distinctConfigurations']) {
    if (!summary || typeof summary[key] !== 'number' || !Number.isInteger(summary[key])) issues.push(`${key} must be an integer number`);
    else if (summary[key] !== CAMPAIGN_COUNT) issues.push(`${key} must equal ${CAMPAIGN_COUNT}`);
  }
  const coverage = summary && summary.catalogAdmissionCoverage;
  const expectedCoverage = {items:10475,localItems:193,bg3Items:10282,spells:958,abilities:693,foes:30};
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) issues.push('catalogAdmissionCoverage object is missing');
  else for (const [key, expected] of Object.entries(expectedCoverage)) {
    if (coverage[key] !== expected) issues.push(`catalogAdmissionCoverage.${key} must equal ${expected}`);
  }
  if (coverage && coverage.executionClaim !== false) issues.push('catalogAdmissionCoverage.executionClaim must be false');
  const executed = summary && summary.productionExecutedIds;
  const exactStringList = (value, expected) => Array.isArray(value)
    && JSON.stringify([...value].sort()) === JSON.stringify([...expected].sort());
  if (!isRecord(executed)) issues.push('productionExecutedIds object is missing');
  else {
    if (!exactStringList(executed.items,['it_зелье_лечения_2d4_2'])) issues.push('productionExecutedIds.items must name only the actually committed potion');
    if (!exactStringList(executed.spells,['sp_щит_веры'])) issues.push('productionExecutedIds.spells must name only the actually committed spell');
    if (!exactStringList(executed.abilities,['ab_lg_surge'])) issues.push('productionExecutedIds.abilities must name only the actually committed ability');
    if (!exactStringList(executed.weapons,['it_дубинка'])) issues.push('productionExecutedIds.weapons must name only the actually committed weapon');
    if (!exactStringList(executed.mimicDefinitions,['system:chest-mimic'])) issues.push('productionExecutedIds.mimicDefinitions must identify the production-combat mimic fixture');
    if (!Array.isArray(executed.foeDefinitions) || executed.foeDefinitions.length !== 30
      || executed.foeDefinitions.some(value => !nonEmptyString(value)) || new Set(executed.foeDefinitions).size !== 30) {
      issues.push('productionExecutedIds.foeDefinitions must contain 30 unique executed foe IDs');
    }
    if (!Array.isArray(executed.foeActions) || executed.foeActions.length !== 30
      || executed.foeActions.some(row => !isRecord(row) || !nonEmptyString(row.foeId) || !nonEmptyString(row.actionId))
      || new Set(executed.foeActions.map(row => row && row.foeId)).size !== 30) {
      issues.push('productionExecutedIds.foeActions must contain one identified action for each of 30 foes');
    }
  }
  const formulaValidation = summary && summary.structuredFormulaValidation;
  if (!isRecord(formulaValidation)) issues.push('structuredFormulaValidation object is missing');
  else {
    if (formulaValidation.auditFunction !== 'gameDataAudit' || formulaValidation.scope !== 'installed-local-runtime') issues.push('structuredFormulaValidation must identify the production local-runtime audit');
    if (formulaValidation.executionClaim !== false) issues.push('structuredFormulaValidation.executionClaim must be false');
    if (formulaValidation.variantsBuiltAndValidated !== 6408 || formulaValidation.errors !== 0) issues.push('structuredFormulaValidation must prove 6408 valid formula variants with zero errors');
    const expectedDefinitions={spells:958,abilities:693,items:193,foes:30,total:1874};
    if (!isRecord(formulaValidation.definitions)
      || Object.entries(expectedDefinitions).some(([key,value]) => formulaValidation.definitions[key] !== value)) {
      issues.push('structuredFormulaValidation.definitions does not match the installed local catalog');
    }
  }
  const commits = summary && summary.productionCommits;
  if (!isRecord(commits)) issues.push('productionCommits object is missing');
  else for (const key of PRODUCTION_COMMIT_KEYS) if (commits[key] !== CAMPAIGN_COUNT) issues.push(`productionCommits.${key} must equal ${CAMPAIGN_COUNT}`);
  const additionalCommits = summary && summary.additionalProductionCommits;
  if (!isRecord(additionalCommits)) issues.push('additionalProductionCommits object is missing');
  else if (additionalCommits.mimicWeapon !== 100) issues.push('additionalProductionCommits.mimicWeapon must equal 100');
  const stageCounts = summary && summary.stageCounts;
  if (!isRecord(stageCounts)) issues.push('stageCounts object is missing');
  else {
    if (JSON.stringify(Object.keys(stageCounts).sort()) !== JSON.stringify([...REQUIRED_CAMPAIGN_STAGES].sort())) issues.push('stageCounts must contain exactly the 17 required stages');
    for (const stage of REQUIRED_CAMPAIGN_STAGES) if (stageCounts[stage] !== CAMPAIGN_COUNT) issues.push(`stageCounts.${stage} must equal ${CAMPAIGN_COUNT}`);
  }
  const audit = summary && summary.engineAudit;
  if (!isRecord(audit)) issues.push('engineAudit object is missing');
  else {
    if (audit.worldErrors !== 0) issues.push('engineAudit.worldErrors must equal 0');
    if (audit.itemFailed !== 0) issues.push('engineAudit.itemFailed must equal 0');
    if (audit.itemPassed !== 1067) issues.push('engineAudit.itemPassed must equal 1067');
    if (audit.worldVariants !== 6408) issues.push('engineAudit.worldVariants must equal 6408');
    const expectedWorldCounts = {spells:958,abilities:693,items:193,foes:30,total:1874};
    if (!isRecord(audit.worldCounts)) issues.push('engineAudit.worldCounts object is missing');
    else for (const [key, expected] of Object.entries(expectedWorldCounts)) if (audit.worldCounts[key] !== expected) issues.push(`engineAudit.worldCounts.${key} must equal ${expected}`);
    for (const [key, expected] of Object.entries({rareBattlePassed:250,rareBattleFailed:0,spellPreparationPassed:320,spellPreparationFailed:0})) {
      if (audit[key] !== expected) issues.push(`engineAudit.${key} must equal ${expected}`);
    }
  }
  if (summary && summary.lootClaims !== CAMPAIGN_COUNT) issues.push(`lootClaims must equal ${CAMPAIGN_COUNT}`);
  if (summary && summary.duplicateLootRejections !== CAMPAIGN_COUNT) issues.push(`duplicateLootRejections must equal ${CAMPAIGN_COUNT}`);

  const receipts = summary && summary.campaignReceipts;
  if (!Array.isArray(receipts) || receipts.length !== CAMPAIGN_COUNT) issues.push(`campaignReceipts must contain exactly ${CAMPAIGN_COUNT} records`);
  else {
    const campaignIds = new Set(), fingerprints = new Set(), configurations = new Set();
    const actors = new Set(), merchants = new Set(), chests = new Set(), foes = new Set(), resolutions = new Set();
    const expectedConfigurationKeys = ['actorProfile','chestScenario','foeId','merchantTemplate'];
    for (let index = 0; index < receipts.length; index += 1) {
      const receipt = receipts[index], label = `campaignReceipts[${index}]`;
      if (!isRecord(receipt)) { issues.push(`${label} must be an object`); continue; }
      if (!nonEmptyString(receipt.campaignId)) issues.push(`${label}.campaignId is missing`);
      else campaignIds.add(receipt.campaignId);
      if (!isRecord(receipt.configuration) || JSON.stringify(Object.keys(receipt.configuration).sort()) !== JSON.stringify(expectedConfigurationKeys)) {
        issues.push(`${label}.configuration must contain exactly actorProfile, merchantTemplate, chestScenario and foeId`);
      } else {
        const config = receipt.configuration;
        if (Object.values(config).some(value => !nonEmptyString(value))) issues.push(`${label}.configuration contains an empty value`);
        const serialized = canonical(config);
        configurations.add(serialized); actors.add(config.actorProfile); merchants.add(config.merchantTemplate); chests.add(config.chestScenario); foes.add(config.foeId);
        const expectedFingerprint = configurationFingerprint(config);
        if (receipt.fingerprint !== expectedFingerprint) issues.push(`${label}.fingerprint is not derived from its semantic configuration`);
      }
      if (!nonEmptyString(receipt.fingerprint) || !/^[a-f0-9]{64}$/.test(receipt.fingerprint)) issues.push(`${label}.fingerprint must be a SHA-256 hex string`);
      else fingerprints.add(receipt.fingerprint);
      if (JSON.stringify(receipt.stages) !== JSON.stringify(REQUIRED_CAMPAIGN_STAGES)) issues.push(`${label}.stages must contain the ordered 17-stage journey`);
      if (!isRecord(receipt.productionCommits)) issues.push(`${label}.productionCommits is missing`);
      else for (const key of PRODUCTION_COMMIT_KEYS) if (receipt.productionCommits[key] !== 1) issues.push(`${label}.productionCommits.${key} must equal 1`);
      if (!isRecord(receipt.trade) || ['buy','sell','lootResale','atomicityChecked'].some(key => receipt.trade[key] !== true)) issues.push(`${label}.trade proof is incomplete`);
      if (receipt.currencyExchange !== true) issues.push(`${label}.currencyExchange must be true`);
      if (!isRecord(receipt.chest) || receipt.chest.lockChecked !== true || receipt.chest.trapChecked !== true || !['chest','mimic'].includes(receipt.chest.resolution)) issues.push(`${label}.chest proof is incomplete`);
      else resolutions.add(receipt.chest.resolution);
      const expectedMimicWeaponCommits = receipt.chest && receipt.chest.resolution === 'mimic' ? 1 : 0;
      if (!isRecord(receipt.additionalProductionCommits)) issues.push(`${label}.additionalProductionCommits is missing`);
      else if (receipt.additionalProductionCommits.mimicWeapon !== expectedMimicWeaponCommits) {
        issues.push(`${label}.additionalProductionCommits.mimicWeapon must equal ${expectedMimicWeaponCommits} for ${receipt.chest && receipt.chest.resolution === 'mimic' ? 'mimic' : 'non-mimic'} resolution`);
      }
      if (!isRecord(receipt.loot) || receipt.loot.claimed !== true || receipt.loot.duplicateRejected !== true) issues.push(`${label}.loot proof is incomplete`);
      const persistenceKeys = ['failedWriteRollback','staleRevisionRejected','restarted','continued','effectsPreserved','inventoryCurrencyPreserved','worldPreserved'];
      if (!isRecord(receipt.persistence) || persistenceKeys.some(key => receipt.persistence[key] !== true)) issues.push(`${label}.persistence proof is incomplete`);
      if (receipt.partySize !== 5) issues.push(`${label}.partySize must equal 5`);
    }
    if (campaignIds.size !== CAMPAIGN_COUNT) issues.push('campaign receipts do not contain 500 unique campaign IDs');
    if (fingerprints.size !== CAMPAIGN_COUNT || configurations.size !== CAMPAIGN_COUNT) issues.push('campaign receipts do not contain 500 unique semantic configurations');
    if (actors.size !== 5 || merchants.size !== 10 || chests.size !== 10 || foes.size !== 30) issues.push('campaign configuration census must cover 5 actors, 10 merchants, 10 chest scenarios and 30 foes');
    if (!resolutions.has('chest') || !resolutions.has('mimic')) issues.push('campaign receipts must include both chest and mimic resolutions');
    if (isRecord(executed) && Array.isArray(executed.foeDefinitions)
      && JSON.stringify([...executed.foeDefinitions].sort()) !== JSON.stringify([...foes].sort())) {
      issues.push('productionExecutedIds.foeDefinitions must match foe IDs in campaign receipts');
    }
    if (isRecord(executed) && Array.isArray(executed.foeActions)) {
      const actionFoes=executed.foeActions.map(row => row && row.foeId).filter(nonEmptyString);
      if (JSON.stringify([...new Set(actionFoes)].sort()) !== JSON.stringify([...foes].sort())) {
        issues.push('productionExecutedIds.foeActions must cover the same 30 foe IDs as campaign receipts');
      }
    }
  }
  if (issues.length) throw new Error(`strict campaign acceptance failed:\n${issues.join('\n')}`);
  return {summary,summaryPath};
}

function main() {
  const { runId, artifactDir } = uniqueBrowserRun();
  const campaignEvidencePath = path.join(artifactDir, 'campaign-matrix.json');
  const suiteEnv = {...process.env,DND_WORLD_CAMPAIGN_EVIDENCE:campaignEvidencePath};
  if (!SKIP_FULL_SUITE) {
    process.stdout.write('\n=== Full Node test suite ===\n');
    if (!runNode(['--test', 'tests/*.test.*'], suiteEnv)) return;
  } else {
    process.stdout.write('\n=== Full Node test suite skipped by CI (already executed in the test job) ===\n');
    process.stdout.write('\n=== 500-campaign evidence replay ===\n');
    if (!runNode(['--test', 'tests/campaign-integration-500.test.mjs'], suiteEnv)) return;
  }

  try {
    readCampaignSummary(artifactDir);
  } catch (error) {
    fail(error.message);
    return;
  }
  let siteRoot;
  try {
    siteRoot = preparePagesCandidate();
  } catch (error) {
    fail(error.message);
    return;
  }
  const browserEnv = {
    ...process.env,
    QA_RUN_ID: runId,
    QA_ARTIFACT_DIR: artifactDir,
    ...(siteRoot ? {QA_SITE_ROOT:siteRoot} : {}),
  };
  process.stdout.write(`\n=== Strict browser smoke: ${runId} ===\n`);
  const browserProcessOk = runNode(['qa/player-agent.e2e.cjs'], browserEnv);

  try {
    const { summary, summaryPath } = readBrowserSummary(runId, artifactDir);
    process.stdout.write(`${JSON.stringify({
      status: 'PASS',
      runId,
      summaryPath,
      counts: summary.counts,
      consoleErrors: 0,
      networkFailures: 0,
    }, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
  }
  if (!browserProcessOk) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { readBrowserSummary, readCampaignSummary, preparePagesCandidate };
