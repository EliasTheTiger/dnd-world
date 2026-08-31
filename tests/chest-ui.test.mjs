import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('chest workspace exposes templates, review, placement and every requested player action',()=>{
  assert.match(html,/data-tab="chests"/);
  assert.match(html,/scripts\/chest-core\.js/);
  assert.match(html,/function chestCreate\(/);
  assert.match(html,/function chestGenerate\(/);
  assert.match(html,/function chestApprove\(/);
  assert.match(html,/function chestLootTableHTML\(/);
  assert.match(html,/Таблица добычи/);
  assert.match(html,/function chestPlace\(/);
  assert.match(html,/const CHEST_ACTION_META=\{inspect:.*check:.*open:.*pick:.*disarm:.*destroy:/s);
  assert.match(html,/Действия игроков · ActionEvaluation/);
  assert.match(css,/\.chest-workspace/);
});

test('chest state survives snapshots, export/import and cloud campaign sync',()=>{
  assert.match(html,/worldSnapshotPayload\(\)[\s\S]{0,600}chestState/);
  assert.match(html,/persist\('dndworld2:chest-state',chestState\)/);
  assert.match(html,/savedWorld\?savedWorld\.chestState:await readJSON\('dndworld2:chest-state'\)/);
  assert.match(html,/chars, journal, combat, harvestedSources, economyState, merchantState, worldState, chestState, items:/);
  assert.match(html,/CHEST_CORE\.normalizeState\(data\.chestState\)/);
  assert.match(html,/CHEST_CORE\.normalizeState\(d\.chestState\)/);
});

test('chest buttons bind to the authoritative action executor and mimic is a real foe',()=>{
  const actionButton=html.slice(html.indexOf('function chestActionButton('),html.indexOf('function chestStartPlayerAction('));
  assert.match(actionButton,/gameActionEvaluate\(/);
  assert.match(actionButton,/gameActionExecute\(/);
  assert.doesNotMatch(actionButton,/onclick="chestStartPlayerAction/);
  assert.match(html,/function chestMimicFoe\(/);
  assert.match(html,/combatActions:\[\{id:'pseudopod'/);
  assert.match(html,/function chestAddCreatureToCombat\(/);
  assert.match(html,/requiresCombatEngine/);
});

test('player dice are requested before chest consequences and cancellation is non-mutating',()=>{
  const start=html.slice(html.indexOf('function chestStartPlayerAction('),html.indexOf('function chestAddCreatureToCombat('));
  assert.match(start,/askRolls\(/);
  assert.match(start,/Кости бросают живые игроки/);
  assert.match(start,/onCancel:\(\)=>setStatus\('Действие с сундуком отменено; мир и ресурсы не изменены\.'/);
  const apply=html.slice(html.indexOf('function chestApplyPlayerResolution('),html.indexOf('function chestLootHTML('));
  assert.match(apply,/gameActionTransactionSnapshot\(\)/);
  assert.match(apply,/combatSpend\(/);
  assert.match(apply,/CHEST_CORE\.applyAction\(/);
  assert.match(apply,/gameActionTransactionRestore\(snapshot\)/);
});
