import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const technicalCopy=/Источник правил|CC-BY|https?:\/\/|Оригинал SRD|SRD 5\.1|Русский текст|перевод проекта|сверен|Движок:|автоисполнение|обработчик|структурированные последствия|Последствия по структуре|Справочное заклинание:|Правило требует исправления|проверьте (?:описание )?правил/i;
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const world=()=>{const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs,chars:[]});return {e,g:e.grimoireApi,a:e.charactersApi,rows:e.state().spells};};

test('every catalog card omits technical metadata and keeps its gameplay fields unchanged',()=>{
  const {g,rows}=world();
  assert.equal(rows.filter(g.grimoireActive).length,321);
  for(const sp of rows){
    const before=JSON.stringify(sp);
    const html=g.spellCardHTML(sp),visible=text(html);
    // Metadata never enters the renderer, including archived and previous-edition records.
    assert.doesNotMatch(html,/Источник правил|CC-BY|Оригинал SRD|Русский текст|Движок:|автоисполнение|структурированные последствия/iu,sp.id);
    if(g.grimoireActive(sp)){
      assert.doesNotMatch(visible,technicalCopy,sp.id);
      const english=sp.grimoire?.english||sp.open5e?.originalName;
      if(english)assert.ok(!visible.includes(english),sp.id+': English title');
    }
    for(const value of [sp.n,sp.t,sp.r,sp.cm,sp.d,sp.c,sp.hi].filter(Boolean)){
      const escaped=String(value).replace(/ё/g,'е').replace(/Ё/g,'Е').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      assert.ok(html.includes(escaped),sp.id+': gameplay field preserved');
    }
    if(!sp.hi)assert.doesNotMatch(html,/На больших уровнях:|Более высокий круг:/u,sp.id);
    assert.equal(JSON.stringify(sp),before,sp.id+': rendering must not mutate rules');
  }
});

test('every active spell stays free of technical commentary in comparison and character spellbooks',()=>{
  const {e,g,a,rows}=world();
  const c=Object.assign(e.buildBlank(),{id:'spell-card-reader',name:'Читатель',cls:'Волшебник',level:20});
  e.state().chars.push(c);a.characterAdopt(c);a.applyClassSlots(c);
  let manual=0,automatic=0;
  for(const sp of rows.filter(g.grimoireActive)){
    g.grimoireSpellStatus(c,sp).engineReady?automatic++:manual++;
    const before=JSON.stringify(sp.mechanics);
    g.desk.compare=[sp.id];
    assert.doesNotMatch(text(g.grimoireComparisonHTML(null)),technicalCopy,sp.id+': reference comparison');
    assert.doesNotMatch(text(g.grimoireComparisonHTML(c)),technicalCopy,sp.id+': hero comparison');
    c.spellbook=[{spellId:sp.id,access:'feat',granted:true,prep:true}];
    const sheet=a.stSpells(c),cards=sheet.match(/<div class="entry-card">[\s\S]*?(?=<div class="entry-card">|$)/g)||[];
    assert.ok(cards.length,sp.id+': character card');
    cards.forEach(card=>assert.doesNotMatch(text(card),technicalCopy,sp.id+': character spellbook'));
    assert.equal(JSON.stringify(sp.mechanics),before,sp.id+': mechanics preserved');
  }
  assert.ok(manual>0&&automatic>0,'cover both execution modes');
});
