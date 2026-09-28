(function(root){
'use strict';
const data=root.DND_GM_REFERENCE_DATA||(typeof require==='function'?require('./gm-reference-data.js'):null);
const key='dndworld2:gm-reference-preferences';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const normalize=value=>String(value??'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function matches(entry,query){
 const words=normalize(query).split(/\s+/).filter(Boolean);
 const haystack=normalize([entry.title,entry.formula,entry.text?.join(' '),entry.example,entry.tags,entry.headers?.join(' '),entry.rows?.flat().join(' ')].join(' '));
 return words.every(word=>haystack.includes(word));
}
function tableEntries(context){
 const rows=[
  {id:'level-table',tab:'tables',title:'Опыт и бонус мастерства',headers:['Уровень','Суммарный опыт','Бонус мастерства'],rows:(context.xp||[]).slice(1).map((xp,i)=>[i+1,Number(xp).toLocaleString('ru'), '+'+context.prof[i+1]]),page:56,tags:'уровень опыт развитие XP'},
  {id:'skill-table',tab:'tables',title:'Навыки и характеристики',headers:['Навык','Обычная характеристика'],rows:(context.skills||[]).map(([name,ability])=>[name,context.abilities[ability]]),page:78,tags:'навык skill'},
  {id:'background-table',tab:'tables',title:'Предыстории проекта',headers:['Предыстория','Навыки','Прочие владения','Умение'],rows:(context.backgrounds||[]).map(row=>[row.n,row.sk,row.ex,row.f]),source:'project',tags:'предыстория background'}
 ];
 if(context.mpCosts)rows.push({id:'mp-cost-table',tab:'magic',title:'Стоимость кругов в MP',formula:'максимум MP = Σ(число ячеек круга × стоимость круга)',text:['Применяется только при выбранном режиме очков магии. Это настольное правило D&D World.'],headers:['Круг','Стоимость MP'],rows:context.mpCosts.slice(1).map((cost,i)=>[i+1,cost]),source:'project',tags:'мана MP таблица стоимость'});
 return rows;
}
function allEntries(context){return data.entries.concat(tableEntries(context),(context.notes||[]).map(note=>({id:'note:'+note.id,noteId:note.id,title:note.t,text:[note.x],tab:'notes',source:'note'})));}
function readPreferences(){
 try{const raw=JSON.parse(root.localStorage.getItem(key)||'{}');return {tab:data.sections.some(s=>s.id===raw.tab)?raw.tab:'formulas',favorites:Array.isArray(raw.favorites)?raw.favorites.filter(id=>typeof id==='string'):[]};}catch{return {tab:'formulas',favorites:[]};}
}
const prefs=readPreferences();
const state={tab:prefs.tab,favorites:new Set(prefs.favorites),query:'',onlyFavorites:false,calculator:'concentration'};
let host,context;
function savePreferences(){try{root.localStorage.setItem(key,JSON.stringify({tab:state.tab,favorites:[...state.favorites]}));}catch{/* Reading rules works even if browser storage is disabled. */}}
function tableHTML(row){return '<div class="gm-table-scroll" tabindex="0" role="region" aria-label="'+esc(row.title)+'"><table><caption>'+esc(row.title)+'</caption><thead><tr>'+row.headers.map(label=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+row.rows.map(cells=>'<tr>'+cells.map((cell,i)=>'<'+(i?'td':'th scope="row"')+'>'+esc(cell)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function sourceHTML(entry){
 if(entry.source==='project')return '<span class="gm-source">Правило / данные D&D World</span>';
 if(entry.source==='note')return '<span class="gm-source">Запись мастера</span>';
 return '<span class="gm-source">SRD 5.1 · стр. '+(entry.pages||[entry.page||90]).map(page=>'<a href="'+data.srd+'#page='+page+'" target="_blank" rel="noopener noreferrer">'+page+'</a>').join(', ')+'</span>';
}
function cardHTML(entry){
 const favorite=state.favorites.has(entry.id),section=data.sections.find(s=>s.id===entry.tab);
 return '<article class="gm-card'+(entry.rows?' gm-card-table':'')+'" data-entry="'+esc(entry.id)+'">'
 +'<div class="gm-card-top"><span class="gm-category">'+esc(section.name)+'</span><button type="button" class="gm-star" data-favorite="'+esc(entry.id)+'" aria-pressed="'+favorite+'" aria-label="'+(favorite?'Убрать из избранного: ':'В избранное: ')+esc(entry.title)+'">'+(favorite?'★':'☆')+'</button></div>'
 +'<h4>'+esc(entry.title)+'</h4>'+(entry.formula?'<div class="gm-formula">'+esc(entry.formula)+'</div>':'')
 +(entry.text||[]).map(text=>'<p>'+esc(text)+'</p>').join('')
 +(entry.headers?tableHTML(entry):'')
 +(entry.example?'<p class="gm-example"><b>Пример.</b> '+esc(entry.example)+'</p>':'')
 +'<footer>'+sourceHTML(entry)+(entry.noteId!=null?'<div class="gm-note-actions"><button class="btn ghost sm" data-edit-note="'+esc(entry.noteId)+'">Править</button><button class="btn ghost sm" data-delete-note="'+esc(entry.noteId)+'">Удалить</button></div>':'')+'</footer></article>';
}
function input(name,label,value,min,max){return '<label>'+label+'<input type="number" name="'+name+'" value="'+value+'" min="'+min+'"'+(max==null?'':' max="'+max+'"')+' step="1" required inputmode="numeric"></label>';}
function select(name,label,options){return '<label>'+label+'<select name="'+name+'">'+options.map(([value,title])=>'<option value="'+value+'">'+title+'</option>').join('')+'</select></label>';}
function calculatorHTML(){
 let fields='';
 if(state.calculator==='concentration')fields=input('damage','Полученный урон',23,0,100000);
 if(state.calculator==='attack')fields=input('die','Выбранный d20',12,1,20)+input('bonus','Суммарный бонус',5,-100,100)+input('ac','КД цели с укрытием',17,0,1000);
 if(state.calculator==='damage')fields=input('damage','Урон одного типа',19,0,100000)+select('save','Результат спасброска',[['full','Полный урон'],['half','Половина урона'],['none','Нет урона']])+select('defense','Защита от этого типа',[['normal','Обычный урон'],['resistance','Сопротивление'],['vulnerability','Уязвимость'],['both','Сопротивление и уязвимость'],['immune','Иммунитет']])+input('temp','Временные хиты',0,0,100000);
 return '<details class="gm-calculator"><summary>Проверить расчёт</summary><p>Введите результаты бросков и готовые бонусы. Расчёт не бросает кости и не меняет участников боя.</p><label class="gm-calc-kind">Что рассчитать<select data-calculator aria-label="Что рассчитать">'+[['concentration','СЛ концентрации'],['attack','Попадание атакой'],['damage','Урон и временные хиты']].map(([id,name])=>'<option value="'+id+'"'+(state.calculator===id?' selected':'')+'>'+name+'</option>').join('')+'</select></label><form class="gm-calc-form"><div class="gm-calc-fields">'+fields+'</div><button type="submit" class="btn rub">Рассчитать</button><output aria-live="polite"></output></form><p class="gm-calc-note">Для атаки заранее выберите d20 с учётом преимущества / помехи. Для урона сначала учтите прочие прибавки и уменьшения; отдельные типы считайте последовательно, расходуя оставшиеся временные хиты.</p></details>';
}
function number(values,name,min,max){const raw=values[name];if(raw==null||String(raw).trim()==='')throw new Error('Заполните все числовые поля.');const value=Number(raw);if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Проверьте числа: нужны целые значения в пределах полей.');return value;}
function calculate(kind,values){
 if(kind==='concentration'){const damage=number(values,'damage',0,100000);return damage===0?'Урон 0: спасбросок от этого урона не требуется.':'СЛ концентрации: '+Math.max(10,Math.floor(damage/2))+'. Спасбросок Телосложения.';}
 if(kind==='attack'){
  const die=number(values,'die',1,20),bonus=number(values,'bonus',-100,100),ac=number(values,'ac',0,1000),total=die+bonus;
  return die===1?'Натуральная 1: промах независимо от бонуса.':die===20?'Натуральная 20: критическое попадание. Удвойте кости урона атаки.':'Итог '+total+' против КД '+ac+': '+(total>=ac?'попадание.':'промах.')+' Особые границы критического попадания проверьте по способности.';
 }
 if(kind==='damage'){
  let damage=number(values,'damage',0,100000);const temp=number(values,'temp',0,100000),steps=[String(damage)];
  if(!['full','half','none'].includes(values.save)||!['normal','resistance','vulnerability','both','immune'].includes(values.defense))throw new Error('Выберите результат спасброска и защиту.');
  if(values.save==='half'){damage=Math.floor(damage/2);steps.push('после спасброска '+damage);}if(values.save==='none')damage=0;
  if(values.defense==='immune')damage=0;
  else{if(['resistance','both'].includes(values.defense)){damage=Math.floor(damage/2);steps.push('сопротивление '+damage);}if(['vulnerability','both'].includes(values.defense)){damage*=2;steps.push('уязвимость '+damage);}}
  return steps.join(' → ')+'. Полученный урон: '+damage+'. Потеря обычных хитов: '+Math.max(0,damage-temp)+'. Остаток временных хитов: '+Math.max(0,temp-damage)+'.'+(damage?' Если есть концентрация, СЛ '+Math.max(10,Math.floor(damage/2))+'.':'');
 }
 throw new Error('Неизвестный расчёт.');
}
function repaint(){
 const all=allEntries(context),searching=!!normalize(state.query),scope=all.filter(row=>!state.onlyFavorites||state.favorites.has(row.id));
 const filtered=scope.filter(row=>matches(row,state.query)),visible=filtered.filter(row=>searching||state.onlyFavorites||row.tab===state.tab);
 const section=data.sections.find(row=>row.id===state.tab);
 host.querySelectorAll('[role="tab"]').forEach(button=>{
  const selected=!searching&&!state.onlyFavorites&&button.dataset.section===state.tab;
  button.setAttribute('aria-selected',String(selected));button.tabIndex=button.dataset.section===state.tab?0:-1;
  button.querySelector('span').textContent=(searching?filtered:all).filter(row=>row.tab===button.dataset.section).length;
 });
 const panel=host.querySelector('.gm-panel');
 panel.setAttribute('role',searching||state.onlyFavorites?'region':'tabpanel');
 if(searching||state.onlyFavorites){panel.removeAttribute('aria-labelledby');panel.setAttribute('aria-label',state.onlyFavorites?'Избранные статьи':'Результаты поиска');}
 else{panel.setAttribute('aria-labelledby','gm-tab-'+state.tab);panel.removeAttribute('aria-label');}
 host.querySelector('[data-favorites-only]').setAttribute('aria-pressed',String(state.onlyFavorites));
 host.querySelector('.gm-result-count').textContent=(searching?'Поиск по всем разделам':state.onlyFavorites?'Избранное':section.name)+' · '+visible.length;
 let body='<div class="gm-panel-heading"><h3>'+(searching?'Результаты поиска':state.onlyFavorites?'Избранное':esc(section.name))+'</h3><p>'+(searching?'Найдены совпадения в заголовках, формулах, таблицах и записях мастера.':state.onlyFavorites?'Отмеченные статьи на этом устройстве.':esc(section.intro))+'</p></div>';
 if(state.tab==='magic'&&!searching&&!state.onlyFavorites)body+='<p class="gm-campaign-mode">Сейчас в кампании: <b>'+esc(context.magicLabel)+'</b></p>';
 if(state.tab==='formulas'&&!searching&&!state.onlyFavorites)body+=calculatorHTML();
 body+=visible.length?'<div class="gm-grid">'+visible.map(cardHTML).join('')+'</div>':'<div class="gm-empty"><h4>'+(searching?'Ничего не найдено':state.onlyFavorites?'Пока нет избранных статей':'Пока нет записей')+'</h4><p>'+(searching?'Попробуйте «концентрация», «укрытие», «СЛ» или часть нужного слова.':state.onlyFavorites?'Нажмите ☆ на нужной карточке — она появится здесь.':'Добавьте домашнее правило или памятку для своей игры.')+'</p>'+(searching||state.onlyFavorites?'<button class="btn ghost" data-reset-filters>Сбросить поиск и фильтр</button>':'<button class="btn rub" data-add-note>+ Запись мастера</button>')+'</div>';
 panel.innerHTML=body;
}
function selectSection(id){if(!data.sections.some(s=>s.id===id))return;state.tab=id;state.query='';state.onlyFavorites=false;host.querySelector('[data-search]').value='';savePreferences();repaint();}
function click(event){
 const button=event.target.closest('button');if(!button||!host.contains(button))return;
 if(button.dataset.section){selectSection(button.dataset.section);return;}
 if(button.hasAttribute('data-favorites-only')){state.onlyFavorites=!state.onlyFavorites;repaint();return;}
 if(button.hasAttribute('data-reset-filters')){state.query='';state.onlyFavorites=false;host.querySelector('[data-search]').value='';repaint();return;}
 if(button.dataset.favorite){const id=button.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);savePreferences();repaint();const target=[...host.querySelectorAll('[data-favorite]')].find(node=>node.dataset.favorite===id);(target||host.querySelector('[data-favorites-only]')).focus();return;}
 if(button.hasAttribute('data-add-note')){selectSection('notes');context.onAdd();return;}
 if(button.dataset.editNote!=null){context.onEdit(button.dataset.editNote);return;}
 if(button.dataset.deleteNote!=null){context.onDelete(button.dataset.deleteNote);}
}
function keydown(event){
 const tab=event.target.closest('[role="tab"]');if(!tab)return;
 const tabs=[...host.querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab);let next;
 if(event.key==='ArrowRight')next=(index+1)%tabs.length;
 if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
 if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;
 if(next!=null){event.preventDefault();tabs[next].focus();selectSection(tabs[next].dataset.section);}
}
function render(config){
 const draft=host===config.host&&config.editorHTML&&context?.editorKey===config.editorKey?host.querySelector('.editor'):null;
 context=config;host=config.host;if(!host)return;
 host.classList.add('gm-reference');
 host.innerHTML='<div class="db-head"><h2 class="rubric">Справочник мастера</h2><button class="btn sm rub" data-add-note>+ Запись мастера</button></div><p class="gm-edition"><b>D&D 5e · 2014</b><span>Базовые правила и отдельно отмеченные дополнения D&D World.</span></p><div class="gm-toolbar"><label class="gm-search-label" for="gm-search">Найти правило<input id="gm-search" data-search type="search" value="'+esc(state.query)+'" placeholder="Атака, концентрация, захват…" autocomplete="off"></label><button class="btn ghost" data-reset-filters>Сбросить</button><button class="btn ghost gm-favorites" data-favorites-only aria-pressed="'+state.onlyFavorites+'">★ Избранное</button></div><div class="gm-tabs" role="tablist" aria-label="Разделы справочника">'+data.sections.map(section=>'<button type="button" id="gm-tab-'+section.id+'" role="tab" aria-controls="gm-panel" aria-selected="false" tabindex="-1" data-section="'+section.id+'">'+section.name+' <span></span></button>').join('')+'</div>'+(config.editorHTML||'')+'<p class="gm-result-count" role="status" aria-live="polite"></p><section id="gm-panel" class="gm-panel" tabindex="0"></section><details class="gm-sources"><summary>Редакция и источники</summary><p>Памятки базируются на SRD 5.1 (правила 2014); формулировки сокращены и переведены. Текст конкретного заклинания, способности или предмета уточняет общее правило. Это справочник общих правил, а не полный каталог всех классовых исключений. Для них используйте карточки в «Гримуаре», «Способностях» и «Предметах».</p><p>В игровых дистанциях принято 5 футов = 1,5 м. Базовые значения также приведены в футах; бытовые переводы веса и пути приблизительны. Избранное и выбранная вкладка запоминаются на этом устройстве.</p><p>This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener noreferrer">https://dnd.wizards.com/resources/systems-reference-document</a>. The SRD 5.1 is licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 International License</a>.</p></details>';
 if(draft)host.querySelector('.editor')?.replaceWith(draft);
 host.onclick=click;host.onkeydown=keydown;
 host.oninput=event=>{if(event.target.hasAttribute('data-search')){state.query=event.target.value;repaint();}};
 host.onchange=event=>{if(event.target.hasAttribute('data-calculator')){state.calculator=event.target.value;const wrapper=host.querySelector('.gm-calculator');wrapper.outerHTML=calculatorHTML();host.querySelector('.gm-calculator').open=true;host.querySelector('[data-calculator]').focus();}};
 host.onsubmit=event=>{if(!event.target.matches('.gm-calc-form'))return;event.preventDefault();const values=Object.fromEntries(new FormData(event.target));try{event.target.querySelector('output').textContent=calculate(state.calculator,values);}catch(error){event.target.querySelector('output').textContent=error.message;}};
 repaint();
}
const api={matches,allEntries,calculate,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.DND_GM_REFERENCE=api;
})(typeof globalThis!=='undefined'?globalThis:this);
