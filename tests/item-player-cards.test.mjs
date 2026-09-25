import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {auditItemPlayerCards} from '../scripts/audit-item-player-cards.mjs';
const root=new URL('../',import.meta.url);
let result;
test('every game item has a complete illustrated player card and read-only full rules without technical copy',async()=>{
 result=await auditItemPlayerCards();assert.equal(result.count,2115);assert.equal(result.visibleCount,2115);assert.deepEqual(result.issues,[]);
 const byName=name=>result.records.find(r=>r.name===name);
 for(const name of ['Иглы для духовой трубки (50)','Зелье высшего лечения']){
  const card=byName(name).player;assert.ok((card.description+card.gameplayDescription).length>60,name+' keeps the actual game rule when an old sentence also contained engineering commentary');
 }
 const text=name=>JSON.stringify(byName(name).player);
 assert.match(text('Зелье лечения'),/2d4 \+ 2/);assert.match(text('Зелье лечения'),/бонусное действие/);
 assert.match(text('Кольцо восстановления'),/1d4/);assert.match(text('Кольцо восстановления'),/начале каждого своего хода/);
 assert.match(text('Амулет арфистов'),/Мудрость|мудрость/);assert.match(text('Амулет арфистов'),/Щит/);
 assert.match(text('Яд дроу'),/СЛ 13/);assert.match(text('Яд дроу'),/Провал на 5/);
 assert.match(text('Амулет недостойных'),/Сопротивление к рубящему урону/);assert.match(text('Амулет недостойных'),/Уязвимость к дробящему урону/);
 assert.match(text('Шлем независимости'),/Владение спасбросками Мудрости/);
 assert.match(text('Башмаки Деннона'),/благословение на 1 раунд/);assert.match(text('Башмаки Деннона'),/порчу/);
 assert.equal(byName('Маркохешкир').player.hero[0].value,'1d6 + 2');
 assert.match(text('Маркохешкир'),/Цепь молний/,'additional tooltip text keeps granted spells and conditional effects');
 assert.equal(byName('Адский самовзводный арбалет').player.hero[0].value,'1d10 + 2');
 assert.doesNotMatch(text('Маркохешкир'),/не может перемещаться, а также предпринимать/,'condition explanations follow the tabletop engine');
 assert.ok(result.records.every(r=>r.checks.readOnly));
});
test('player copy is deterministic and authoring/audit files are excluded from the published allow-list',()=>{
 execFileSync(process.execPath,['scripts/build-item-player-copy.mjs','--check'],{cwd:root,stdio:'pipe'});
 const build=fs.readFileSync(new URL('scripts/build-pages-site.mjs',root),'utf8');
 assert.ok(build.includes("'item-player-copy.js'"));
 assert.doesNotMatch(build,/cp\([^\n]*docs/);
 const html=fs.readFileSync(new URL('index.html',root),'utf8');const card=html.slice(html.indexOf('function itemCardHTML('),html.indexOf('function spellCardHTML('));
 assert.doesNotMatch(card,/itemArsenalContractHTML|bg3LifecycleItemHTML|bg3InterruptItemHTML|bg3ItemRuleRowsHTML/);
});
