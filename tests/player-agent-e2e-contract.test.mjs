import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const runnerPath = path.join(root, 'qa', 'player-agent.e2e.cjs');
const runner = fs.readFileSync(runnerPath, 'utf8');

test('player-agent is a Playwright black-box journey with all requested phases', () => {
  assert.match(runner, /require\(['"]playwright['"]\)/);
  for (let phase = 1; phase <= 15; phase += 1) {
    assert.match(runner, new RegExp(`id: 'P${String(phase).padStart(2, '0')}'`));
    assert.match(runner, new RegExp(`phase: 'P${String(phase).padStart(2, '0')}'`));
  }
  for (const requiredEvidence of [
    'runId', 'stepNumber', 'url', 'action', 'expected', 'actual', 'screenshot',
    'domFragment', 'evidenceFile', 'uiMessages', 'consoleErrors', 'failedNetworkRequests',
    'minimalReproduction'
  ]) assert.match(runner, new RegExp(requiredEvidence));
});

test('player-agent never reaches through the UI into application state', () => {
  const forbidden = [
    /localStorage/, /indexedDB/, /worldSnapshotPayload/, /campaignEnvelope/i,
    /page\.evaluate\s*\(/, /window\.(?:charsDB|foesDB|combat|store)/,
    /getCh\s*\(/, /useItemApply\s*\(/
  ];
  for (const token of forbidden) assert.doesNotMatch(runner, token);
  assert.match(runner, /locator\(/);
  assert.match(runner, /getByRole\(/);
});

test('player-agent captures every failed step and keeps blocked checks distinct', () => {
  assert.match(runner, /captureFailure\(full, status, actual, indexes\)/);
  assert.match(runner, /error instanceof QaBlocked \? 'BLOCKED' : 'FAIL'/);
  assert.match(runner, /page\.on\('console'/);
  assert.match(runner, /page\.on\('requestfailed'/);
  assert.match(runner, /page\.screenshot\(/);
  assert.match(runner, /\.dom\.html/);
  assert.match(runner, /run\.json/);
});

test('player-agent supports the bundled full Chromium and cleans up launch failures', () => {
  assert.match(runner, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
  assert.match(runner, /launchOptions\.executablePath/);
  assert.match(runner, /main\(\)\.catch\(async error/);
  assert.match(runner, /server && server\.listening/);
  assert.match(runner, /process\.env\.QA_SITE_ROOT \|\| REPO_ROOT/);
  assert.match(runner, /replace\(\/\^\\\/dnd-world/);
});

test('critical UI checks require a committed DOM currency form and reject an out-of-turn potion', () => {
  const p11=runner.slice(runner.indexOf("phase: 'P11'"),runner.indexOf("phase: 'P12'"));
  assert.match(p11, /#economyExchangeBack/);
  assert.match(p11, /#economyExchangeFrom/);
  assert.match(p11, /#economyExchangeTo/);
  assert.match(p11, /#economyExchangeAmount/);
  assert.match(p11, /#economyExchangeReason/);
  assert.match(p11, /#economyExchangeErr/);
  assert.match(p11, /выберите разные валюты/i);
  assert.match(p11, /walletAfterInvalid/);
  assert.match(p11, /walletAfterCancel/);
  assert.match(p11, /operationsAfterInvalid !== operationsBefore/);
  assert.match(p11, /operationsAfterCancel !== operationsBefore/);
  assert.match(p11, /#economyExchangeConfirm/);
  assert.match(p11, /page\.mouse\.dblclick/);
  assert.match(p11, /operationsAfter !== operationsBefore \+ 1/);
  assert.match(p11, /stepDialogs\.length !== 0/);
  assert.doesNotMatch(p11,/dialogAnswers\.push/);
  assert.match(p11,/walletCopperValue\(walletAfter\) !== walletCopperValue\(walletBefore\)/);
  assert.match(p11,/JSON\.stringify\(walletAfter\) !== JSON\.stringify\(expectedWallet\)/);
  assert.match(runner, /Зелье Торгара дошло до ввода костей, хотя сейчас ход Року/);
  assert.match(runner, /advanceCombatTo\('Торгар Железная Вера'\)/);
  assert.match(runner, /Огненный \(\?:снаряд\|сгусток\)/);
  assert.match(runner, /beforeCast === afterCast/);
});

test('deep player phases require visible consequences instead of merely opening controls', () => {
  for (const requiredHelper of [
    'visibleSheetHitPoints', 'visibleSheetArmorClass', 'visibleInventoryLedger',
    'visibleEquipmentItems', 'visibleCombatHitPoints', 'visibleCombatResource'
  ]) assert.match(runner, new RegExp(`function ${requiredHelper}\\b`));

  assert.match(runner, /unequippedAc >= equippedAc/);
  assert.match(runner, /restoredAc !== equippedAc/);
  assert.match(runner, /legalHpAfter\.current !== expectedHp/);
  assert.match(runner, /legalQtyAfter !== legalQtyBefore - 1/);
  assert.match(runner, /\\bused\\b.*actionAfter\.className/);
  assert.match(runner, /fillVisibleRolls\(\[18, 4\]\)/);
  assert.match(runner, /targetAfter\.current !== targetBefore\.current - 6/);
  assert.match(runner, /fillVisibleRolls\(\[18, 6\]\)/);
  assert.match(runner, /goblinAfter\.current !== goblinBefore\.current - 6/);
  assert.match(runner, /septihAbilityCommitted/);
  assert.match(runner, /После завершения фонового сохранения причина отказа зелья была затёрта/);
  assert.match(runner, /#castStep3:visible/);
  assert.match(runner, /#castMultiWrap:visible/);
  assert.match(runner, /Святой Щит Жизни/);
  assert.match(runner, /Трутница/);
  assert.match(runner, /Прямое действие трутницы не объяснило actor-key отказ/);
});

test('loot, mimic and long-campaign checks are repeatable through visible UI', () => {
  assert.match(runner, /lootLedgerAfterRepeat/);
  assert.match(runner, /JSON\.stringify\(lootLedgerAfterRepeat\) !== JSON\.stringify\(lootLedgerAfterFirst\)/);
  assert.match(runner, /mimicInitiative\.count\(\) !== 1/);
  assert.match(runner, /58\\s\*\\\/\\s\*58\\s\+\u0445\u0438\u0442\u043e\u0432/);
  assert.match(runner, /durableVisibleCampaignMarkers/);
  assert.match(runner, /Reload checkpoint #1/);
  assert.match(runner, /Reload checkpoint #2/);
  assert.match(runner, /recordMarker/);
  assert.match(runner, /Разместить на сцене/);
  assert.match(runner, /Мара Медная/);
  assert.ok((runner.match(/page\.reload\s*\(/g) || []).length >= 2, 'runner must perform at least two reload checkpoints');
});
