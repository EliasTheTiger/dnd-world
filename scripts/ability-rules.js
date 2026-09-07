(function(root){
'use strict';
const revision='abilities-ru-2026-09-07.1';
const normalize=v=>String(v||'').toLowerCase().replace(/[’‘]/g,"'").replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const glossary=root.DND_HOBBYWORLD_ABILITY_TERMS;
const terms=new Map();
for(const term of glossary?.terms||[]){const key=normalize(term.english);if(!terms.has(key))terms.set(key,[]);terms.get(key).push(term);}
// These editorial names are not claimed to be an official translation of 2024 or Black Flag.
const editorial=Object.fromEntries(`
Augment|Улучшение
Augmentation Effects|Эффекты улучшения
Engineer's Insight|Проницательность инженера
Greater Creation|Великое творение
Mechanist Subclass|Подкласс механика
Ranged Augment|Дистанционное улучшение
Rapid Augment|Быстрое улучшение
Augment: Absorbing|Улучшение: поглощение
Full Metal|Металлическая защита
Heavy Hitter|Сокрушительные удары
Juggernaut|Джаггернаут
Mystic Metal|Мистический металл
Rages|Использования ярости
Bonus Cantrip|Дополнительный фокус
Circle Spells|Заклинания круга
Additional Magical Secrets|Дополнительные магические секреты
Bonus Proficiencies|Дополнительные владения
Bonus Proficiency|Дополнительное владение
Druidic|Язык друидов
Channel Divinity: Preserve Life|Проведение энергии: сохранение жизни
Life Domain Spells (table)|Заклинания домена Жизни (таблица)
Ki Points|Очки ци
Oath Spells|Заклинания клятвы
Improved Divine Smite|Улучшенная божественная кара
Ranger Archetype|Архетип следопыта
Roguish Archetype|Архетип плута
Invocations Known|Известные инвокации
Slot Level|Круг ячеек
Ability Score Increase|Повышение характеристик
Draconic Ancestry table|Таблица драконьего наследия
Artificer's Lore|Знания изобретателя
Barbarian Subclass|Подкласс варвара
Improved Brutal Strike (Enhanced)|Улучшенный жестокий удар: усиление
Instinctive Pounce|Инстинктивный рывок
Primal Knowledge|Первобытные знания
Weapon Mastery|Оружейные приёмы
Bard Subclass|Подкласс барда
Words of Creation|Слова творения
Cleric Subclasses|Подклассы жреца
Greater Divine Intervention|Великое божественное вмешательство
Life Domain Spells|Заклинания домена Жизни
Sear Undead|Опаление нежити
Magical Discoveries|Магические открытия
Circle of the Land Spells|Заклинания круга Земли
Druid Subclass|Подкласс друида
Elemental Fury|Ярость стихий
Cantrips Known|Известные фокусы
Fighter Subclass|Подкласс воина
Studdied Attacks|Изученные атаки
Tactical Master|Мастер тактики
Tactical Shift|Тактическое перемещение
Acrobatic Movement|Акробатическое перемещение
Deflect Attacks|Отражение атак
Deflect Energy|Отражение энергии
Heightened Focus|Усиленное сосредоточение
Monk's Focus|Сосредоточение монаха
Perfect Focus|Совершенное сосредоточение
Unarmoed Movement|Перемещение без брони
Uncanny Metabolism|Невероятный метаболизм
Fleet Step|Быстрый шаг
Abjure Foes|Изгнание врагов
Aura Expansion|Расширение ауры
Smite of Protection|Защитная кара
Oath of Devotion Spells|Заклинания клятвы Верности
Paladin Subclass|Подкласс паладина
Paladin's Smite|Кара паладина
Restoring Touch|Восстанавливающее касание
Hunter's Lore|Знания охотника
Precise Hunter|Меткий охотник
Ranger Subclass|Подкласс следопыта
Roving|Странствия
Improved Cunning Strike|Улучшенный коварный удар
Rogue Subclass|Подкласс плута
Steady Aim|Тщательное прицеливание
Sorcerer Spell List|Список заклинаний чародея
Sorcerer Subclass|Подкласс чародея
Contact Patron|Связь с покровителем
Fiend Spells|Заклинания Исчадия
Warlock Subclass|Подкласс колдуна
Memorize Spell|Запоминание заклинания
Scholar|Учёный
Wizard Subclass|Подкласс волшебника
Draconic Flight|Драконий полёт
Giant Ancestry|Наследие великанов
Large Form|Большой облик
Powerful Build|Мощное телосложение
Adrenaline Rush|Прилив адреналина
`.trim().split('\n').map(line=>{const [en,ru]=line.split('|');return [normalize(en),ru];}));
const owners={Barbarian:'Варвар',Bard:'Бард',Cleric:'Жрец',Druid:'Друид',Fighter:'Воин',Monk:'Монах',Paladin:'Паладин',Ranger:'Следопыт',Rogue:'Плут',Sorcerer:'Чародей',Warlock:'Колдун',Wizard:'Волшебник',
  Dwarf:'Дварф','Hill Dwarf':'Холмовой дварф','Rock Gnome':'Скальный гном',Gnome:'Гном',Halfling:'Полурослик',Lightfoot:'Легконогий полурослик','High Elf':'Высший эльф',
  'College of Lore':'Коллегия Знаний','Draconic Bloodline':'Драконья кровь','Oath of Devotion':'Клятва Верности','The Fiend':'Исчадие','School of Evocation':'Школа эвокации',
  'Path of the Berserker':'Путь берсерка','Way of the Open Hand':'Путь открытой руки'};
const localEnglish={ab_эльф_транс:'Trance',ab_дварф_дварфийская_устойчивость:'Dwarven Resilience',ab_дварф_знание_камня:'Stonecunning',ab_fey_ancestry:'Fey Ancestry',ab_darkvision:'Darkvision',ab_trance:'Trance',ab_life_disciple:'Disciple of Life',ab_lg_surge:'Action Surge',ab_lg_secondwind:'Second Wind',ab_lg_parry:'Parry',ab_lg_precise:'Precision Attack',ab_lg_goading:'Goading Attack',ab_lg_disarm:'Disarming Attack',ab_dwarf_resilience:'Dwarven Resilience',ab_dwarf_toughness:'Dwarven Toughness',
  ab_полурослик_везучий:'Lucky',ab_полурослик_храбрый:'Brave',ab_полурослик_проворство:'Halfling Nimbleness',ab_эльф_обостренные_чувства:'Keen Senses',ab_эльф_наследие_фей:'Fey Ancestry',ab_полуэльф_наследие_фей:'Fey Ancestry',ab_гном_гномья_хитрость:'Gnome Cunning',ab_полуорк_угрожающий_вид:'Menacing',ab_полуорк_непоколебимая_стойкость:'Relentless Endurance',ab_полуорк_дикие_атаки:'Savage Attacks',ab_тифлинг_адское_сопротивление:'Hellish Resistance',ab_тифлинг_дьявольское_наследие:'Infernal Legacy',ab_драконорожденный_драконье_наследие:'Draconic Ancestry',ab_драконорожденный_оружие_дыхания:'Breath Weapon'};
function termFor(english,type){
 // The publisher's English cell A464 spells Tranquility as "Tranquillty".
 const key=normalize(english),rows=terms.get(key==='tranquility'?'tranquillty':key)||[],kind={feat:'черта',racial:'особенность расы',class:'Класс. особенность'}[type];
 return rows.find(t=>t.kind===kind)||(new Set(rows.map(t=>t.russian)).size===1?rows[0]:null);
}
function edition(ab){const key=ab?.catalogSource?.documentKey;return key==='srd-2024'?'2024':key==='bfrd'?'third-party':key==='srd-2014'?'2014':ab?.custom?'custom':'2014';}
function identity(ab){return ab?.open5e?.originalName||localEnglish[ab?.id]||(/_темное_зрение_18_м$/.test(ab?.id||'')?'Darkvision':'');}
const proseTerms={спасбросок:'испытание',спасброска:'испытания',спасброску:'испытанию',спасброском:'испытанием',спасброске:'испытании',спасброски:'испытания',спасбросков:'испытаний',спасброскам:'испытаниям',спасбросками:'испытаниями',спасбросках:'испытаниях',
 заговор:'фокус',заговора:'фокуса',заговору:'фокусу',заговором:'фокусом',заговоре:'фокусе',заговоры:'фокусы',заговоров:'фокусов',заговорам:'фокусам',заговорами:'фокусами',заговорах:'фокусах'};
function descriptionText(text){return String(text||'')
 .replace(/[А-Яа-яЁё]+/g,word=>{const replacement=proseTerms[word.toLowerCase()];return replacement?(word[0]===word[0].toUpperCase()?replacement[0].toUpperCase()+replacement.slice(1):replacement):word;})
 .replace(/продолжительного отдыха|длинного отдыха/gi,'долгого отдыха').replace(/продолжительный отдых|длинный отдых/gi,'долгий отдых')
 .replace(/продолжительном отдыхе|длинном отдыхе/gi,'долгом отдыхе')
 .replace(/показатель способности/gi,'значение характеристики').replace(/показателя способности/gi,'значения характеристики').replace(/показатели способностей/gi,'значения характеристик')
 .replace(/оценку способности/gi,'значение характеристики').replace(/оценки способностей/gi,'значения характеристик')
 .replace(/очки волшебства/gi,'очки чар').replace(/очков волшебства/gi,'очков чар').replace(/очко волшебства/gi,'очко чар')
 .replace(/слоты для заклинаний/gi,'ячейки заклинаний').replace(/слотов/gi,'ячеек').replace(/слоты/gi,'ячейки').replace(/слот(?![а-я])/gi,'ячейку')
 .replace(/радиационного/gi,'лучистого').replace(/Шрифт вдохновения/g,'Источник вдохновения').replace(/Шрифт Магии/g,'Источник магии')
 .replace(/Канал Божественност[ьи]/gi,'Проведение энергии').replace(/Гибкий кастинг/g,'Гибкое сотворение заклинаний');}
// Parser vocabulary is separate from displayed prose. Keep the existing
// outcome gates when a master writes the publisher's saving-throw terminology.
function parserText(text){return String(text||'').replace(/(^|[^а-яё])испытани(?:е|я|ю|ем|и|ям|ями|ях|й)(?=[^а-яё]|$)/gi,'$1спасбросок');}
const descriptions2014={
 Grappler:'Требование: Сила 13 или выше.\n• Вы совершаете с преимуществом броски атаки по существу, которое удерживаете в захвате.\n• Действием можно попытаться обездвижить уже захваченное вами существо: совершите ещё одну проверку захвата — Сила (Атлетика) против Силы (Атлетики) или Ловкости (Акробатики) цели, по её выбору. При вашей победе оба участника становятся обездвиженными до окончания захвата (в списке состояний сайта — «Опутанный»). При ничьей или проигрыше новое состояние не возникает. Это состязание, а не спасбросок. Если Сила опустится ниже 13, преимущества черты недоступны до восстановления требования.',
 'Second Wind':'В свой ход бонусным действием восстановите 1d10 + уровень воина хитов, не превышая максимум. Кость бросает игрок. После применения требуется короткий или продолжительный отдых, чтобы воспользоваться способностью снова.',
 'Action Surge':'Со 2-го уровня воина в свой ход вы можете получить одно дополнительное действие. Дополнительного бонусного действия это не даёт. Повторное применение доступно после короткого или продолжительного отдыха. С 17-го уровня воина доступны два использования между отдыхами, но не более одного за ход.',
 'Disciple of Life':'С 1-го уровня, восстанавливая существу хиты заклинанием 1-го круга или выше, вы увеличиваете лечение на 2 + круг заклинания. При усилении используется круг потраченной ячейки. Бонус не относится к фокусам, зельям, временным хитам и лечению без заклинания.',
 'Darkvision':'В пределах 60 футов (18 м) вы видите при тусклом свете как при ярком, а в темноте — как при тусклом. В темноте различимы только оттенки серого, а не цвета.',
 'Fey Ancestry':'Вы совершаете с преимуществом спасброски от очарования. Магия не может погрузить вас в сон. Это не иммунитет ко всем заклинаниям школы очарования.',
 'Trance':'Эльфу не требуется сон: достаточно 4 часов медитации в полусознательном состоянии в день. Такой транс даёт те же преимущества, что человеку дают 8 часов сна.',
 'Dwarven Resilience':'Вы совершаете с преимуществом спасброски от яда и обладаете сопротивлением урону ядом. Это два отдельных преимущества: сопротивление уменьшает урон, а преимущество относится к спасброску.',
 'Dwarven Toughness':'Ваш максимум хитов увеличивается на 1 и увеличивается ещё на 1 при получении каждого следующего уровня. Итого прибавка равна уровню персонажа.',
 'Gnome Cunning':'Вы совершаете с преимуществом спасброски Интеллекта, Мудрости и Харизмы от магии. Преимущество не распространяется на немагические воздействия или проверки характеристик.',
 'Lucky':'Если на d20 при броске атаки, проверке характеристики или спасброске выпала 1, вы можете перебросить эту кость. Новый результат обязателен. Кости бросает игрок. Это расовая особенность полурослика, а не черта «Счастливчик».',
 'Brave':'Вы совершаете с преимуществом спасброски от испуга.',
 'Halfling Nimbleness':'Вы можете перемещаться через пространство существа, чей размер больше вашего. Эта особенность не разрешает заканчивать перемещение в занятом пространстве.',
 'Keen Senses':'Вы владеете навыком Внимательность.',
 'Menacing':'Вы владеете навыком Запугивание.',
 'Relentless Endurance':'Если ваши хиты опустились до 0, но вы не погибли мгновенно, вы можете вместо этого остаться с 1 хитом. После использования способность восстанавливается по окончании продолжительного отдыха.',
 'Savage Attacks':'При критическом попадании рукопашной атакой оружием бросьте ещё одну кость урона этого оружия и прибавьте результат к дополнительному урону критического попадания. Это одна кость оружия, а не весь набор костей атаки.',
 'Hellish Resistance':'Вы обладаете сопротивлением урону огнём.',
 'Breath Weapon':'Действием вы выдыхаете разрушительную энергию. Драконье наследие определяет тип урона, форму области и характеристику спасброска. Каждое существо в области совершает свой спасбросок против Сл 8 + модификатор Телосложения + бонус мастерства. При провале оно получает 2d6 урона, при успехе — половину. Урон увеличивается до 3d6 на 6-м уровне, 4d6 на 11-м и 5d6 на 16-м. Кости урона бросаются один раз для всей области. Дыхание восстанавливается после короткого или продолжительного отдыха. Для линии область составляет 5 × 30 футов, для конуса — 15 футов; конкретная форма определяется наследием.'
};
let pinnedCatalog=null,pinnedIndex=new Map();
function reconcile(rows){
 if(pinnedCatalog!==root.DND5E_OPEN_CATALOG){pinnedCatalog=root.DND5E_OPEN_CATALOG;pinnedIndex=new Map((pinnedCatalog?.abilities||[]).map(ab=>[ab.id,ab]));}
 for(const ab of rows||[]){
  if(ab.abilityReview?.custom||ab.abilityReview?.revision===revision)continue;
  const pinned=pinnedIndex.get(ab.id);
  // An older editor did not write editorial metadata. Recognize its changed fields
  // against the pinned import before a migration can replace the user's version.
  if(!ab.abilityReview&&pinned&&(['n','x','source'].some(key=>ab[key]!==pinned[key])||ab.mechanics&&ab.mechanics.mode!=='manual')){
   ab.abilityReview={revision,custom:true,english:identity(ab),edition:edition(ab),nameStatus:'custom',descriptionStatus:'custom',aliases:[ab.n]};continue;
  }
  const en=identity(ab),term=termFor(en,ab.type),sourceEdition=edition(ab),oldName=ab.n;
  const review=ab.abilityReview={...ab.abilityReview,revision,english:en,edition:sourceEdition,descriptionStatus:'unverified',nameStatus:'project',aliases:[...new Set([...(ab.abilityReview?.aliases||[]),oldName])],originalDescription:ab.abilityReview?.originalDescription??ab.x};
  if(en){
   let name=term?.russian||editorial[normalize(en)]||oldName;
   name=name.charAt(0).toUpperCase()+name.slice(1);
   if(!ab.open5e&&/\s\([^()]+\)$/.test(oldName))name+=oldName.match(/\s\([^()]+\)$/)[0];
   ab.n=name;
   if(term){review.nameStatus=sourceEdition==='2014'?'hobbyworld-glossary':'glossary-terminology';review.nameSource={url:glossary.source,sha256:glossary.sha256,sheet:term.sheet||glossary.sheet,cell:term.cell};}
  }
  if(ab.open5e){
   const owner=owners[ab.open5e.ownerName]||ab.open5e.ownerNameRu;
   if(owner){ab.open5e.ownerNameRu=owner;ab.source=owner+' · '+ab.catalogSource.documentName;}
   if(sourceEdition==='2014'&&descriptions2014[en]){ab.x=descriptions2014[en];review.descriptionStatus='srd-2014-reviewed';}
   ab.x=descriptionText(ab.x);
  }
 }
 return rows;
}
const searchCache=new WeakMap();
function matches(ab,query){
 const q=normalize(query);if(!q)return true;
 // Reference equality catches edited alias arrays; primitive fields catch in-place editor writes.
 const aliases=ab.abilityReview?.aliases,fields=[ab.n,ab.x,ab.source,identity(ab),aliases];let cached=searchCache.get(ab);
 if(!cached||fields.some((v,i)=>v!==cached.fields[i])){cached={fields,text:normalize([ab.n,ab.x,ab.source,identity(ab),...(aliases||[])].join(' '))};searchCache.set(ab,cached);}
 return cached.text.includes(q);
}
// One ability can have several source-specific rule profiles. Never combine
// their mechanics: Unarmored Defense, for example, differs by class.
function baseName(ab){
 const name=String(ab?.n||'').trim(),suffix=' ('+ab?.source+')';
 return ab?.type==='racial'&&name.endsWith(suffix)?name.slice(0,-suffix.length):name;
}
function identityKey(ab){
 let en=normalize(identity(ab));
 en=({'unarmoed movement':'unarmored movement','life domain spells (table)':'life domain spells','luck':'lucky','fiendish legacy':'infernal legacy'})[en]||en;
 // Lucky the feat and Lucky the halfling trait are different rules.
 return en?en+(en==='lucky'?':'+ab.type:''):'';
}
function groups(rows){
 const byKey=new Map(),byName=new Map(),unknown=[];
 const add=(key,ab)=>{if(!byKey.has(key))byKey.set(key,{key,name:baseName(ab),variants:[]});byKey.get(key).variants.push(ab);};
 for(const ab of rows||[]){
  const key=identityKey(ab);if(!key){unknown.push(ab);continue;}
  add('en:'+key,ab);const name=normalize(baseName(ab));
  if(!byName.has(name))byName.set(name,new Set());byName.get(name).add('en:'+key);
 }
 for(const ab of unknown){
  const name=normalize(baseName(ab)),candidates=byName.get(name);
  // A name alone must not join distinct English identities (Skilled/Skillful).
  add(candidates?.size===1?[...candidates][0]:'ru:'+name,ab);
 }
 const result=[...byKey.values()],names=new Map();
 for(const group of result){
  const preferred=choose(group.variants);group.name=({'en:augment':'Улучшение предметов','en:improvement':'Улучшение характеристик'})[group.key]||baseName(preferred);
  const name=normalize(group.name);if(!names.has(name))names.set(name,[]);names.get(name).push(group);
 }
 for(const collisions of names.values())if(collisions.length>1)for(const group of collisions){
  const ab=choose(group.variants),kind={feat:'черта',racial:'особенность народа',class:'классовая способность'}[ab.type]||ab.type;
  group.name+=' — '+kind;
 }
 return result;
}
function choose(variants,c){
 const score=ab=>(edition(ab)==='2014'?100:edition(ab)==='custom'?50:0)
  +(c&&(ab.open5e?.ownerNameRu===c.cls||ab.source===c.cls||ab.open5e?.ownerNameRu===c.race||ab.source===c.race)?40:0)
  +(ab.catalogSource?.documentKey==='srd-2014'?10:0);
 return variants.reduce((best,ab)=>!best||score(ab)>score(best)?ab:best,null);
}
function catalogIndex(rows){
 const list=groups(rows),byId=new Map();for(const group of list)for(const ab of group.variants)byId.set(ab.id,group);
 return {groups:list,byId};
}
function owned(c,ab,index){
 const key=index?.byId.get(ab?.id)?.key;
 return (c?.abilities||[]).some(e=>e.abilityId===ab?.id||key&&index.byId.get(e.abilityId)?.key===key);
}
function uniqueEntries(entries,index){
 const seen=new Set();return (entries||[]).filter(e=>{const key=index.byId.get(e.abilityId)?.key||'id:'+e.abilityId;if(seen.has(key))return false;seen.add(key);return true;});
}
function mergeEntries(entries,index,maxUses){
 const result=[],seen=new Map();let changed=false;
 for(const entry of entries||[]){
  const group=index.byId.get(entry.abilityId),key=group?.key||'id:'+entry.abilityId,first=seen.get(key);
  if(!first){seen.set(key,entry);result.push(entry);continue;}
  changed=true;
  // Keep the assigned rule profile and its ID. A duplicate must never refill it.
  const max=maxUses?.(first.abilityId),counts=[first.cur,entry.cur,max].filter(n=>typeof n==='number'&&Number.isFinite(n));
  if(counts.length)first.cur=Math.max(0,Math.min(...counts));
  const notes=[first.notes,entry.notes].filter(Boolean);first.notes=[...new Set(notes)].join('\n');
  // Preserve extra assignment data, without replacing the selected profile.
  for(const [field,value] of Object.entries(entry))if(!(field in first)&&!['characterGranted','originGranted','buildSource'].includes(field))first[field]=value;
  if(!entry.characterGranted)delete first.characterGranted;
  if(!entry.originGranted)delete first.originGranted;
 }
 return {entries:changed?result:entries,changed};
}
function duplicateName(rows,name,exceptId){
 const q=normalize(name),candidates=(rows||[]).filter(ab=>ab.id!==exceptId);
 return candidates.find(ab=>[ab.n,baseName(ab),identity(ab),...(ab.abilityReview?.aliases||[])].some(n=>normalize(n)===q))||groups(candidates).find(group=>normalize(group.name)===q)?.variants[0];
}
function canAssign(c,ab,index){
 if(!c||!ab)return {ok:false,reason:'Способность не найдена.'};
 if(edition(ab)==='2024')return {ok:false,reason:'Эта карточка относится к D&D 2024. В кампании D&D 2014 она доступна для справки.'};
 if(ab.type==='feat'&&identity(ab)==='Grappler'&&!(Number(c.ab?.str)>=13))return {ok:false,reason:'Для черты «Рукопашный борец» нужна Сила 13 или выше.'};
 const duplicate=owned(c,ab,index);
 return duplicate?{ok:false,reason:'Эта способность уже есть у героя.'}:{ok:true};
}
const api={revision,normalize,identity,edition,reconcile,matches,canAssign,termFor,parserText,baseName,groups,choose,catalogIndex,owned,uniqueEntries,mergeEntries,duplicateName};
root.DND_ABILITY_RULES=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
