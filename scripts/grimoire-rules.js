(function(root){
'use strict';
const revision='grimoire-2014-2';
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
const clone=value=>JSON.parse(JSON.stringify(value));
const classes={Брд:'Бард',Жрц:'Жрец',Дрд:'Друид',Пал:'Паладин',Слд:'Следопыт',Чрд:'Чародей',Клд:'Колдун',Влш:'Волшебник',Изб:'Изобретатель'};
const classAliases={bard:'Брд',cleric:'Жрц',druid:'Дрд',paladin:'Пал',ranger:'Слд',sorcerer:'Чрд',warlock:'Клд',wizard:'Влш',artificer:'Изб','чернокнижник':'Клд'};
for(const [abbr,name] of Object.entries(classes)){classAliases[normalize(abbr)]=abbr;classAliases[normalize(name)]=abbr;}
const classTokens=value=>[...new Set(String(value||'').split(/[,;/]/).map(part=>classAliases[normalize(part)]||part.trim()).filter(Boolean))];
// Editorial names translated from the CC-BY-4.0 SRD. These are not represented as an official Russian edition.
const names=Object.fromEntries(`Acid Arrow|Кислотная стрела
Acid Splash|Кислотные брызги
Aid|Подмога
Alarm|Сигнализация
Alter Self|Смена обличья
Animal Friendship|Дружба с животными
Animal Messenger|Животное-посланник
Animal Shapes|Превращение в животных
Animate Dead|Восставший труп
Animate Objects|Оживление предметов
Antilife Shell|Преграда жизни
Antimagic Field|Антимагическое поле
Antipathy/Sympathy|Антипатия/симпатия
Arcane Eye|Магический глаз
Arcane Hand|Магическая ладонь
Arcane Lock|Волшебный замок
Arcane Sword|Магический меч
Arcanist's Magic Aura|Магическая аура
Astral Projection|Проекция в астрал
Augury|Гадание
Awaken|Пробуждение разума
Bane|Порча
Banishment|Изгнание
Barkskin|Дубовая кора
Beacon of Hope|Маяк надежды
Bestow Curse|Возложение проклятия
Black Tentacles|Чёрные щупальца
Blade Barrier|Стена клинков
Bless|Благословение
Blight|Усыхание
Blindness/Deafness|Слепота/глухота
Blink|Мерцание
Blur|Размытый образ
Branding Smite|Клеймящая кара
Burning Hands|Пылающие руки
Call Lightning|Призыв молнии
Calm Emotions|Умиротворение
Chain Lightning|Цепная молния
Charm Person|Очарование личности
Chill Touch|Леденящее прикосновение
Circle of Death|Круг смерти
Clairvoyance|Ясновидение
Clone|Клон
Cloudkill|Облако смерти
Color Spray|Сверкающие брызги
Command|Приказ
Commune|Общение
Commune with Nature|Общение с природой
Comprehend Languages|Понимание языков
Compulsion|Принуждение
Cone of Cold|Конус холода
Confusion|Смятение
Conjure Animals|Призыв животных
Conjure Celestial|Призыв небожителя
Conjure Elemental|Призыв элементаля
Conjure Fey|Призыв феи
Conjure Minor Elementals|Призыв малых элементалей
Conjure Woodland Beings|Призыв лесных обитателей
Contact Other Plane|Связь с иным планом
Contagion|Заражение
Contingency|Предосторожность
Continual Flame|Вечный огонь
Control Water|Власть над водами
Control Weather|Власть над погодой
Counterspell|Контрзаклинание
Create Food and Water|Создание пищи и воды
Create or Destroy Water|Создание или уничтожение воды
Create Undead|Создание нежити
Creation|Сотворение
Cure Wounds|Лечение ран
Dancing Lights|Пляшущие огоньки
Darkness|Тьма
Darkvision|Тёмное зрение
Daylight|Дневной свет
Death Ward|Защита от смерти
Delayed Blast Fireball|Огненный шар замедленного действия
Demiplane|Полуплан
Detect Evil and Good|Обнаружение зла и добра
Detect Magic|Обнаружение магии
Detect Poison and Disease|Обнаружение ядов и болезней
Detect Thoughts|Обнаружение мыслей
Dimension Door|Дверь измерений
Disguise Self|Маскировка
Disintegrate|Распад
Dispel Evil and Good|Рассеивание зла и добра
Dispel Magic|Рассеивание магии
Divination|Предсказание
Divine Favor|Божественное благоволение
Divine Word|Божественное слово
Dominate Beast|Подчинение зверя
Dominate Monster|Подчинение чудовища
Dominate Person|Подчинение личности
Dream|Вещий сон
Druidcraft|Искусство друидов
Earthquake|Землетрясение
Eldritch Blast|Мистический заряд
Enhance Ability|Улучшение характеристики
Enlarge/Reduce|Увеличение/уменьшение
Entangle|Опутывание
Enthrall|Завораживание
Etherealness|Переход в эфир
Expeditious Retreat|Поспешное отступление
Eyebite|Дурной глаз
Fabricate|Изготовление
Faerie Fire|Огонь фей
Faithful Hound|Верный пёс
False Life|Ложная жизнь
Fear|Страх
Feather Fall|Плавное падение
Feeblemind|Слабоумие
Find Familiar|Поиск фамильяра
Find Steed|Поиск скакуна
Find the Path|Поиск пути
Find Traps|Поиск ловушек
Finger of Death|Перст смерти
Fire Bolt|Огненный снаряд
Fire Shield|Огненный щит
Fire Storm|Огненная буря
Fireball|Огненный шар
Flame Blade|Огненный клинок
Flame Strike|Небесный огонь
Flaming Sphere|Пылающий шар
Flesh to Stone|Окаменение
Floating Disk|Парящий диск
Fly|Полёт
Fog Cloud|Туманное облако
Forbiddance|Запрет
Forcecage|Силовая клетка
Foresight|Предвидение
Freedom of Movement|Свобода перемещения
Freezing Sphere|Ледяная сфера
Gaseous Form|Газообразная форма
Gate|Врата
Geas|Обет
Gentle Repose|Нетленные останки
Giant Insect|Гигантское насекомое
Glibness|Бойкость
Globe of Invulnerability|Сфера неуязвимости
Glyph of Warding|Охранная руна
Goodberry|Чудо-ягоды
Grease|Скользкий жир
Greater Invisibility|Высшая невидимость
Greater Restoration|Высшее восстановление
Guardian of Faith|Страж веры
Guards and Wards|Стражи и обереги
Guidance|Наставление
Guiding Bolt|Направляющий снаряд
Gust of Wind|Порыв ветра
Hallow|Святилище
Hallucinatory Terrain|Мираж
Harm|Поражение
Haste|Ускорение
Heal|Исцеление
Healing Word|Лечащее слово
Heat Metal|Раскалённый металл
Hellish Rebuke|Адское возмездие
Heroes' Feast|Пир героев
Heroism|Героизм
Hideous Laughter|Жуткий смех
Hold Monster|Удержание чудовища
Hold Person|Удержание личности
Holy Aura|Святая аура
Hunter's Mark|Метка охотника
Hypnotic Pattern|Гипнотический узор
Ice Storm|Ледяная буря
Identify|Опознание
Illusory Script|Иллюзорное письмо
Imprisonment|Заточение
Incendiary Cloud|Пылающая туча
Inflict Wounds|Причинение ран
Insect Plague|Нашествие насекомых
Instant Summons|Мгновенный призыв
Invisibility|Невидимость
Irresistible Dance|Неудержимая пляска
Jump|Прыжок
Knock|Открывание
Legend Lore|Знание легенд
Lesser Restoration|Малое восстановление
Levitate|Левитация
Light|Свет
Lightning Bolt|Молния
Locate Animals or Plants|Поиск животных или растений
Locate Creature|Поиск существа
Locate Object|Поиск предмета
Longstrider|Скороход
Mage Armor|Доспехи мага
Mage Hand|Волшебная рука
Magic Circle|Магический круг
Magic Jar|Волшебный сосуд
Magic Missile|Волшебная стрела
Magic Mouth|Волшебные уста
Magic Weapon|Магическое оружие
Magnificent Mansion|Великолепный особняк
Major Image|Большой образ
Mass Cure Wounds|Массовое лечение ран
Mass Heal|Массовое исцеление
Mass Healing Word|Массовое лечащее слово
Mass Suggestion|Массовое внушение
Maze|Лабиринт
Meld into Stone|Слияние с камнем
Mending|Починка
Message|Сообщение
Meteor Swarm|Метеоритный дождь
Mind Blank|Сокрытие разума
Minor Illusion|Малая иллюзия
Mirage Arcane|Магический мираж
Mirror Image|Зеркальное отражение
Mislead|Двойник
Misty Step|Туманный шаг
Modify Memory|Изменение памяти
Moonbeam|Лунный луч
Move Earth|Движение земли
Nondetection|Необнаружимость
Pass without Trace|Бесследное передвижение
Passwall|Проход сквозь стену
Phantasmal Killer|Призрачный убийца
Phantom Steed|Призрачный скакун
Planar Ally|Планарный союзник
Planar Binding|Планарные узы
Plane Shift|Переход между планами
Plant Growth|Рост растений
Poison Spray|Ядовитые брызги
Polymorph|Превращение
Power Word Kill|Слово силы: смерть
Power Word Stun|Слово силы: оглушение
Prayer of Healing|Молитва лечения
Prestidigitation|Фокусы
Prismatic Spray|Призматические брызги
Prismatic Wall|Радужная стена
Private Sanctum|Личное святилище
Produce Flame|Сотворение пламени
Programmed Illusion|Программируемая иллюзия
Project Image|Проекция образа
Protection from Energy|Защита от энергии
Protection from Evil and Good|Защита от зла и добра
Protection from Poison|Защита от яда
Purify Food and Drink|Очищение пищи и питья
Raise Dead|Воскрешение мёртвого
Ray of Enfeeblement|Луч слабости
Ray of Frost|Луч холода
Regenerate|Регенерация
Reincarnate|Перевоплощение
Remove Curse|Снятие проклятия
Resilient Sphere|Упругая сфера
Resistance|Сопротивление
Resurrection|Воскрешение
Reverse Gravity|Обращение гравитации
Revivify|Оживление
Rope Trick|Трюк с верёвкой
Sacred Flame|Священное пламя
Sanctuary|Убежище
Scorching Ray|Палящий луч
Scrying|Наблюдение
Secret Chest|Потайной сундук
See Invisibility|Видение невидимого
Seeming|Множественная маскировка
Sending|Послание
Sequester|Сокрытие
Shapechange|Смена формы
Shatter|Дребезги
Shield|Щит
Shield of Faith|Щит веры
Shillelagh|Дубинка
Shocking Grasp|Электрошок
Silence|Тишина
Silent Image|Безмолвный образ
Simulacrum|Симулякр
Sleep|Сон
Sleet Storm|Метель
Slow|Замедление
Spare the Dying|Уход за умирающим
Speak with Animals|Разговор с животными
Speak with Dead|Разговор с мёртвыми
Speak with Plants|Разговор с растениями
Spider Climb|Паучье лазание
Spike Growth|Шипы
Spirit Guardians|Духи-хранители
Spiritual Weapon|Духовное оружие
Stinking Cloud|Зловонное облако
Stone Shape|Изменение формы камня
Stoneskin|Каменная кожа
Storm of Vengeance|Шторм возмездия
Suggestion|Внушение
Sunbeam|Солнечный луч
Sunburst|Солнечная вспышка
Symbol|Символ
Telekinesis|Телекинез
Telepathic Bond|Телепатическая связь
Teleport|Телепортация
Teleportation Circle|Круг телепортации
Thaumaturgy|Чудотворство
Thunderwave|Громовая волна
Time Stop|Остановка времени
Tiny Hut|Маленькая хижина
Tongues|Языки
Transport via Plants|Путешествие через растения
Tree Stride|Древесный путь
True Polymorph|Истинное превращение
True Resurrection|Истинное воскрешение
True Seeing|Истинное зрение
True Strike|Верный удар
Unseen Servant|Невидимый слуга
Vampiric Touch|Прикосновение вампира
Vicious Mockery|Злая насмешка
Wall of Fire|Огненная стена
Wall of Force|Силовая стена
Wall of Ice|Ледяная стена
Wall of Stone|Каменная стена
Wall of Thorns|Стена шипов
Warding Bond|Охраняющая связь
Water Breathing|Подводное дыхание
Water Walk|Хождение по воде
Web|Паутина
Weird|Кошмар
Wind Walk|Хождение по ветру
Wind Wall|Стена ветра
Wish|Желание
Word of Recall|Слово возвращения
Zone of Truth|Зона истины`.split('\n').map(line=>line.split('|')));
const localAliases={sp_убийственный_смех_таши:'Hideous Laughter',sp_убежище_морденкайнена:'Private Sanctum',sp_оживление_мертвых:'Animate Dead',sp_непреодолимая_пляска_отто:'Irresistible Dance',sp_ray_frost:'Ray of Frost',sp_mage_hand:'Mage Hand',sp_fire_bolt:'Fire Bolt',sp_chill_touch:'Chill Touch',sp_burning_hands:'Burning Hands',sp_magic_sleep:'Sleep',sp_guidance_t:'Guidance',sp_guiding_bolt:'Guiding Bolt',sp_prayer_healing:'Prayer of Healing',sp_кислотный_всплеск:'Acid Splash',sp_древесная_кожа:'Barkskin',sp_размытие:'Blur',sp_божественная_милость:'Divine Favor',sp_вечное_пламя:'Continual Flame',sp_огненный_удар:'Flame Strike',sp_защита_от_смерти:'Death Ward'};
const extra2014={sp_chromatic_orb:'Chromatic Orb',sp_ведьмин_снаряд:'Witch Bolt'};
const excludedLocal=new Set(['sp_wizard_intuition','sp_evoc_allies','sp_planar_barrier']);
localAliases.sp_порча='Bane';
const schools={abjuration:'Ограждение',conjuration:'Вызов',divination:'Прорицание',enchantment:'Очарование',evocation:'Воплощение',illusion:'Иллюзия',necromancy:'Некромантия',transmutation:'Преобразование'};
function headerRu(value){return String(value).replace(/^Self/,'На себя').replace(/^Touch$/,'Касание').replace(/^Sight$/,'В пределах видимости').replace(/^Special$/,'Особая').replace(/^Unlimited$/,'Неограниченная').replace(/^Instantaneous$/,'Мгновенная').replace(/Concentration,? /,'Концентрация, ').replace(/[Uu]p to /,'до ').replace(/one /,'1 ').replace(/Until dispelled or triggered/,'До рассеивания или срабатывания').replace(/Until dispelled/,'До рассеивания').replace(/bonus action/,'бонусное действие').replace(/action/,'действие').replace(/\bor\b/,'или').replace(/\b1 round\b/,'1 раунд').replace(/\b1 minute\b/,'1 минута').replace(/minutes\b/,'минут').replace(/\b1 hour\b/,'1 час').replace(/\b2 hours\b/,'2 часа').replace(/hours\b/,'часов').replace(/\b1 day\b/,'1 день').replace(/days\b/,'дней').replace(/(\d+)-foot-radius hemisphere/,'полусфера радиусом $1 футов').replace(/(\d+)-foot-radius sphere/,'сфера радиусом $1 футов').replace(/(\d+)-foot cone/,'конус $1 футов').replace(/(\d+)-foot line/,'линия $1 футов').replace(/(\d+)-foot cube/,'куб с ребром $1 футов').replace(/(\d+)-foot radius/,'радиус $1 футов').replace(/(\d+)-mile radius/,'радиус $1 миль').replace(/\b1 mile\b/,'1 миля').replace(/miles\b/,'миль').replace(/feet\b/,'футов');}
const reactions={Counterspell:'1 реакция, когда вы видите, как существо в пределах 60 футов накладывает заклинание','Feather Fall':'1 реакция, когда вы или существо в пределах 60 футов падает','Hellish Rebuke':'1 реакция в ответ на урон от видимого существа в пределах 60 футов',Shield:'1 реакция, когда по вам попадает атака или вы становитесь целью «Волшебной стрелы»'};
// Project translations of open SRD prose, not quotations from the closed Russian PHB.
const reviewedText={
'Burning Hands':['Вы держите руки перед собой, соприкасаясь большими пальцами и растопырив остальные. Из пальцев вырывается пламя. Каждое существо в конусе длиной 15 футов совершает спасбросок Ловкости. При провале оно получает 3d6 урона огнём, при успехе — половину. Огонь поджигает воспламеняющиеся предметы в области, которые никто не носит и не несёт.','Урон увеличивается на 1d6 за каждый круг выше первого.'],
'Magic Missile':['Вы создаёте три светящиеся стрелы магической силы. Каждая автоматически попадает в выбранное видимое существо в пределах дистанции и наносит 1d4 + 1 урона силовым полем. Стрелы поражают цели одновременно. Их можно направить в одно существо или распределить между несколькими. Бросок атаки и спасбросок не требуются.','За каждый круг выше первого создаётся одна дополнительная стрела.'],
'Sleep':['Бросьте 5d8: результат определяет общий запас хитов существ, которых можно усыпить. Заклинание действует на существ в пределах 20 футов от выбранной точки в пределах дистанции, начиная с существа с наименьшим текущим числом хитов. Уже бессознательные существа пропускаются. Если текущие хиты существа не превышают оставшийся запас, оно становится бессознательным, а его хиты вычитаются из запаса. Продолжайте, пока запаса хватает. Сон заканчивается при завершении заклинания, получении урона или когда другое существо действием растормошит или разбудит спящего. Нежить и существа с иммунитетом к очарованию не затрагиваются.','Запас увеличивается на 2d8 за каждый круг выше первого.'],
'Revivify':['Прикоснитесь к существу, умершему не более минуты назад. Оно возвращается к жизни с 1 хитом. Заклинание не возвращает умерших от старости и не восстанавливает отсутствующие части тела. Алмазы стоимостью 300 зм расходуются при наложении.',''],
'Guidance':['Прикоснитесь к согласному существу. До окончания заклинания оно может один раз бросить d4 и прибавить результат к проверке характеристики по своему выбору. Решение можно принять до или после проверки. После использования этого бонуса заклинание заканчивается.',''],
'Shield':['Невидимый магический барьер защищает вас. До начала вашего следующего хода вы получаете +5 к КД, в том числе против атаки, вызвавшей реакцию. В течение этого времени вы не получаете урона от «Волшебной стрелы».',''],
'Identify':['Во время наложения вы касаетесь одного предмета. Если он магический, вы узнаёте его свойства, способы применения, необходимость настройки и оставшееся число зарядов. Вы также узнаёте, какие заклинания сейчас воздействуют на предмет. Если предмет создан заклинанием, вы узнаёте каким. Вместо предмета можно касаться существа: тогда вы узнаёте, какие заклинания сейчас на него действуют. Жемчужина стоимостью не менее 100 зм и совиное перо не расходуются.',''],
'Bane':['До трёх видимых существ по вашему выбору в пределах дистанции совершают спасбросок Харизмы. До окончания заклинания каждое провалившее спасбросок существо вычитает d4 из своих бросков атаки и спасбросков. Кость штрафа бросается каждый раз заново.','За каждый круг выше первого можно выбрать ещё одно существо.']
};
function sourceFacts(row,english){
  const facts=root.DND_SRD51_SPELL_FACTS?.spells[english];if(!facts)return;
  row.l=facts.level;row.s=schools[facts.school];row.c=classTokens(facts.classes.join(', ')).join(', ');row.r=headerRu(facts.range);row.d=headerRu(facts.duration).replace('до 1 минута','до 1 минуты').replace('до 1 час','до 1 часа').replace('до 1 день','до 1 дня').replace('до 1 раунд','до 1 раунда').replace('до 2 часа','до 2 часов');row.t=reactions[english]||headerRu(facts.castingTime);row.conc=facts.concentration;row.ritual=facts.ritual;
  const ruMaterial=String(row.cm||'').match(/\((.*)\)/s)?.[1]||'';
  row.cm=facts.components.split('(')[0].trim().replace(/V/g,'В').replace(/S/g,'С').replace(/M/g,'М')+(ruMaterial?' ('+ruMaterial+')':'');
  row.grimoire={...row.grimoire,sourcePage:facts.page,upcastVerified:!facts.upcast,upcastPresent:facts.upcast};
  if(english==='Heroism')row.hi='За каждый круг выше первого можно выбрать ещё одно существо.';
  if(reviewedText[english]){[row.x,row.hi]=reviewedText[english];row.grimoire.translation='reviewed-project';}
}
function active(row){return !!row&&(!row.grimoire||row.grimoire.status==='active')&&!row.grimoire?.hidden&&row.rulesetRef?.id!=='dnd5e-2024-reference'&&(!row.catalogSource||row.catalogSource.documentKey==='srd-2014');}
function identity(row){return row?.grimoire?.key||normalize(row?.open5e?.originalName||extra2014[row?.id]||localAliases[row?.id]||row?.n);}
function reconcile(rows){
  if(!Array.isArray(rows))return rows;
  const srd=rows.filter(row=>row?.catalogSource?.documentKey==='srd-2014');
  if(!srd.length)return rows; // Small isolated/custom worlds are not replaced by the bundled catalog.
  const byName=new Map(),groups=new Map();
  const addName=(name,key)=>{const n=normalize(name);if(!byName.has(n))byName.set(n,key);else if(byName.get(n)!==key)byName.set(n,null);};
  for(const row of srd){const key=normalize(row.open5e.originalName);groups.set(key,{source:row,rows:[]});addName(row.n,key);addName(names[row.open5e.originalName],key);}
  for(const row of rows){
    if(!row||!row.id)continue;
    const key=row.open5e?.originalName?normalize(row.open5e.originalName):row.grimoire?.key||normalize(localAliases[row.id])||byName.get(normalize(row.n));
    if(!excludedLocal.has(row.id)&&groups.has(key))groups.get(key).rows.push(row);
    else if(row.catalogSource||excludedLocal.has(row.id))row.grimoire={...row.grimoire,revision,key:key||identity(row),status:'archive',reason:row.catalogSource?.documentKey==='srd-2024'?'Другая редакция: D&D 2024':'Вариант вне стандартного каталога D&D 2014'};
    else {row.grimoire={...row.grimoire,revision,key:normalize(extra2014[row.id]||row.n),status:'active',edition:'2014',translation:row.grimoire?.translation||'project',officialRussian:false,custom:!extra2014[row.id]};
      if(row.id==='sp_ведьмин_снаряд'&&row.grimoire.translation!=='custom'){if(!row.grimoire.legacyDefinition)row.grimoire.legacyDefinition=clone(row);row.c='Влш, Чрд, Клд';row.x='Дальнобойная атака заклинанием по существу в пределах 30 футов: при попадании 1d12 урона молнией и связь с целью на время концентрации, до 1 минуты. В последующие ходы можно действием автоматически наносить той же цели 1d12 урона молнией. Любое другое действие прекращает заклинание. Оно также заканчивается, если цель выходит за пределы дистанции или получает полное укрытие от вас. Бонус к обычным атакам это заклинание не даёт.';row.hi='За каждый круг выше первого только начальный урон увеличивается на 1d12.';row.grimoire.requiresManual=true;}
    }
  }
  for(const [key,group] of groups){
    const source=group.source,english=source.open5e.originalName;
    const canonical=group.rows.find(row=>row.grimoire?.status==='active'&&row.grimoire?.key===key)||group.rows.find(row=>!row.catalogSource)||source;
    const aliases=[...new Set([names[english]||source.n,english,...group.rows.flatMap(row=>[row.id,row.n,...(row.grimoire?.aliases||[])])])].sort();
    const staleTranslation=canonical.catalogSource?.language==='en'&&canonical.grimoire?.translation!=='custom';
    if(canonical.grimoire?.translation!=='custom'&&(canonical.grimoire?.revision!==revision||staleTranslation)){
      const original=clone(canonical),previous=canonical.grimoire||{};
      // Preserve the old definition in the export; spellbook migration never refunds resources.
      if(!canonical.catalogSource||staleTranslation){
        for(const field of ['l','s','c','t','r','cm','d','ritual','conc','x','hi','open5e','catalogSource','rulesetRef'])canonical[field]=clone(source[field]??null);
        canonical.grimoire={...previous,legacyDefinition:previous.legacyDefinition||original};
        if(staleTranslation)delete canonical.grimoire.engineRevision;
      }
      canonical.n=names[english]||source.n;
      canonical.c=classTokens(source.c).join(', ');
      sourceFacts(canonical,english);
    }
    canonical.grimoire={...canonical.grimoire,revision,key,status:'active',edition:'2014',english,aliases,sourceId:source.id,translation:canonical.grimoire?.translation||'project-names-machine-prose',officialRussian:false};
    for(const row of group.rows)if(row!==canonical)row.grimoire={...row.grimoire,revision,key,status:'alias',canonicalId:canonical.id,reason:'Объединено с единственной карточкой D&D 2014'};
  }
  for(const [id,english] of Object.entries(extra2014)){const canonical=rows.find(row=>row.id===id);if(!canonical)continue;for(const row of rows)if(row!==canonical&&row.open5e?.originalName===english)row.grimoire={...row.grimoire,revision,key:normalize(english),status:'alias',canonicalId:id,reason:'Объединено с карточкой PHB 2014'};}
  return rows;
}
function resolveId(rows,id){const seen=new Set();let current=id;while(!seen.has(current)){seen.add(current);const row=rows.find(row=>row?.id===current);if(!row?.grimoire?.canonicalId)return current;current=row.grimoire.canonicalId;}return id;}
function migrateCharacter(c,rows){
  if(!c||!Array.isArray(c.spellbook))return false;
  const before=JSON.stringify([c.spellbook,c.spellPrepDraft,c.spellReplacementDraft]),book=new Map(),duplicates=[];
  for(const entry of c.spellbook){const id=resolveId(rows,entry.spellId),copy={...entry,spellId:id};
    if(!book.has(id)){book.set(id,copy);continue;}
    const kept=book.get(id);duplicates.push(clone(entry));
    // A duplicate never grants an additional charge or resets an expended feature.
    for(const key of ['prep','granted','alwaysPrepared','anyClassKnown','ritualOnly'])if(copy[key])kept[key]=true;
    for(const key of ['countsAgainstKnown','countsAgainstPreparation'])if(copy[key]===false)kept[key]=false;
    if(copy.used)kept.used=true;
    if(Number.isFinite(copy.cur))kept.cur=Number.isFinite(kept.cur)?Math.min(kept.cur,copy.cur):copy.cur;
  }
  c.spellbook=[...book.values()];
  if(duplicates.length)c.grimoireMigration={revision,duplicates:[...(c.grimoireMigration?.duplicates||[]),...duplicates]};
  if(Array.isArray(c.spellPrepDraft?.choices))c.spellPrepDraft.choices=[...new Set(c.spellPrepDraft.choices.map(id=>resolveId(rows,id)))];
  if(c.spellReplacementDraft?.removeId)c.spellReplacementDraft.removeId=resolveId(rows,c.spellReplacementDraft.removeId);
  return before!==JSON.stringify([c.spellbook,c.spellPrepDraft,c.spellReplacementDraft]);
}
function matches(row,query){return normalize([row.n,row.x,row.grimoire?.english,row.open5e?.originalName,...(row.grimoire?.aliases||[])].join(' ')).includes(normalize(query));}
function audit(rows){const shown=rows.filter(active),seen=new Set(),errors=[];for(const row of shown){const key=identity(row);if(seen.has(key))errors.push('duplicate:'+key);seen.add(key);if(row.catalogSource&&row.catalogSource.documentKey!=='srd-2014')errors.push('edition:'+row.id);if(!Number.isInteger(+row.l)||+row.l<0||+row.l>9)errors.push('circle:'+row.id);}
return {revision,records:rows.length,active:shown.length,aliases:rows.filter(row=>row.grimoire?.status==='alias').length,archive:rows.filter(row=>row.grimoire?.status==='archive').length,officialRussian:shown.filter(row=>row.grimoire?.officialRussian).length,errors};}
root.DND_GRIMOIRE_RULES=Object.freeze({revision,names,classes,classTokens,normalize,identity,active,reconcile,resolveId,migrateCharacter,matches,audit});
})(globalThis);
