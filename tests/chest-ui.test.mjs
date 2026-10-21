import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import chests from '../scripts/chest-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
import {localCampaignFixture} from './helpers/local-campaign-fixture.mjs';

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
  assert.match(html,/Действия игроков<\/h3>/);
  assert.match(css,/\.chest-workspace/);
});

test('opened, claimed and revealed chests survive local migration, durable save and restart',async()=>{
  const engine=loadRuntimeIntegrationEngine(),fixture=localCampaignFixture();
  const opened=chests.createChest({id:'kept-chest',templateId:'trapped-vault',state:'opened',revision:7,
    placement:{sceneId:'kept-scene',zoneId:'kept-zone',placed:true},
    trap:{disarmed:true,detected:true},lock:{type:'complex',dc:16,opened:true},
    loot:{status:'claimed',claimedByActorId:'char_septih',approved:{items:[{itemId:'kept-item',qty:2}],currency:{gp:17}}}});
  const mimic=chests.createChest({id:'kept-mimic',templateId:'mimic',creature:{instanceId:'kept-foe',revealed:true}});
  fixture.snapshot.chestState=chests.normalizeState({revision:9,instances:[opened,mimic],events:[{id:'kept-event',action:'claim',actorId:'char_septih'}]});
  await engine.storeSet('dndworld2:world-snapshot',JSON.stringify(fixture.snapshot));
  await engine.loadAll();
  const actual=()=>JSON.parse(JSON.stringify(engine.economyApi.state().chestState));
  assert.deepEqual(actual(),fixture.snapshot.chestState);
  assert.equal(await engine.saveWorldNow(),true);
  assert.deepEqual(JSON.parse(await engine.storeGet('dndworld2:chest-state')),fixture.snapshot.chestState);
  await engine.loadAll();
  assert.deepEqual(actual(),fixture.snapshot.chestState);
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
