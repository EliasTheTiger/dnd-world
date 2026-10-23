(function(root){
'use strict';
// Rules facts for the 2014 game, with original project summaries. This is not
// the revised 2025 Artificer, and it never imports a 2024 spell by its title.
const revision='artificer-2014-drive-2026-10-23-2';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
const clone=value=>JSON.parse(JSON.stringify(value));
const spellLists={
0:['Acid Splash','Booming Blade','Create Bonfire','Dancing Lights','Fire Bolt','Frostbite','Green-Flame Blade','Guidance','Light','Lightning Lure','Mage Hand','Magic Stone','Mending','Message','Poison Spray','Prestidigitation','Ray of Frost','Resistance','Shocking Grasp','Spare the Dying','Sword Burst','Thorn Whip','Thunderclap'],
1:['Absorb Elements','Alarm','Catapult','Cure Wounds','Detect Magic','Disguise Self','Expeditious Retreat','Faerie Fire','False Life','Feather Fall','Grease','Identify','Jump','Longstrider','Purify Food and Drink','Sanctuary','Snare',"Tasha's Caustic Brew"],
2:['Aid','Air Bubble','Alter Self','Arcane Lock','Blur','Continual Flame','Darkvision','Enhance Ability','Enlarge/Reduce','Heat Metal','Invisibility','Kinetic Jaunt','Lesser Restoration','Levitate','Magic Mouth','Magic Weapon','Protection from Poison','Pyrotechnics','Rope Trick','See Invisibility','Skywrite','Spider Climb','Vortex Warp','Web'],
3:["Ashardalon's Stride",'Blink','Catnap','Create Food and Water','Dispel Magic','Elemental Weapon','Flame Arrows','Fly','Glyph of Warding','Haste','Intellect Fortress','Protection from Energy','Revivify','Tiny Servant','Water Breathing','Water Walk'],
4:['Arcane Eye','Elemental Bane','Fabricate','Freedom of Movement','Secret Chest','Faithful Hound','Private Sanctum','Resilient Sphere','Stone Shape','Stoneskin','Summon Construct'],
5:['Animate Objects','Arcane Hand','Create Spelljamming Helm','Creation','Greater Restoration','Skill Empowerment','Transmute Rock','Wall of Stone']};
const classSet=new Set(Object.values(spellLists).flat().map(normalize));
const aliases={"Bigby's Hand":'Arcane Hand',"Leomund's Secret Chest":'Secret Chest',"Mordenkainen's Faithful Hound":'Faithful Hound',"Mordenkainen's Private Sanctum":'Private Sanctum',"Otiluke's Resilient Sphere":'Resilient Sphere',"Melf's Acid Arrow":'Acid Arrow'};
const key=value=>normalize(aliases[value]||value);
// Names from the CRC-verified user archive; search aliases never replace IDs or edited titles.
const archiveNames=Object.freeze(Object.fromEntries(Object.entries({
  "Mage Hand": "Волшебная рука",
  "Magic Stone": "Волшебный камень",
  "Sword Burst": "Вспышка мечей",
  "Booming Blade": "Громовой клинок",
  "Acid Splash": "Кислотные брызги",
  "Green-Flame Blade": "Клинок зеленого пламени",
  "Ray of Frost": "Луч холода",
  "Guidance": "Наставление",
  "Frostbite": "Обморожение",
  "Fire Bolt": "Огненный снаряд",
  "Dancing Lights": "Пляшущие огоньки",
  "Mending": "Починка",
  "Lightning Lure": "Притягивающая молния",
  "Thunderclap": "Раскат грома",
  "Light": "Свет",
  "Message": "Сообщение",
  "Resistance": "Сопротивление",
  "Create Bonfire": "Сотворение костра",
  "Thorn Whip": "Терновый кнут",
  "Spare the Dying": "Уход за умирающим",
  "Prestidigitation": "Фокусы",
  "Shocking Grasp": "Электрошок",
  "Poison Spray": "Ядовитые брызги",
  "Tasha's Caustic Brew": "Едкое варево Таши",
  "Catapult": "Катапульта",
  "Healing Word": "Лечащее слово",
  "Cure Wounds": "Лечение ран",
  "False Life": "Ложная жизнь",
  "Ray of Sickness": "Луч болезни",
  "Disguise Self": "Маскировка",
  "Detect Magic": "Обнаружение магии",
  "Faerie Fire": "Огонь фей",
  "Identify": "Опознание",
  "Purify Food and Drink": "Очищение пищи и питья",
  "Feather Fall": "Плавное падение",
  "Absorb Elements": "Поглощение стихий",
  "Expeditious Retreat": "Поспешное отступление",
  "Jump": "Прыжок",
  "Alarm": "Сигнализация",
  "Snare": "Силок",
  "Grease": "Скользкий жир",
  "Longstrider": "Скороход",
  "Sanctuary": "Убежище",
  "Continual Flame": "Вечный огонь",
  "See Invisibility": "Видение невидимого",
  "Vortex Warp": "Вихревой скачок",
  "Air Bubble": "Воздушный пузырь",
  "Magic Mouth": "Волшебные уста",
  "Arcane Lock": "Волшебный замок",
  "Protection from Poison": "Защита от яда",
  "Kinetic Jaunt": "Кинетический скачок",
  "Melf's Acid Arrow": "Кислотная стрела",
  "Levitate": "Левитация",
  "Magic Weapon": "Магическое оружие",
  "Lesser Restoration": "Малое восстановление",
  "Skywrite": "Небесное письмо",
  "Invisibility": "Невидимость",
  "Web": "Паутина",
  "Spider Climb": "Паучье лазание",
  "Pyrotechnics": "Пиротехника",
  "Aid": "Подмога",
  "Flaming Sphere": "Пылающий шар",
  "Blur": "Размытый образ",
  "Heat Metal": "Раскаленный металл",
  "Alter Self": "Смена обличья",
  "Darkvision": "Темное зрение",
  "Rope Trick": "Трюк с веревкой",
  "Enlarge/Reduce": "Увеличение/уменьшение",
  "Enhance Ability": "Улучшение характеристики",
  "Gaseous Form": "Газообразная форма",
  "Protection from Energy": "Защита от энергии",
  "Catnap": "Кошачий сон",
  "Intellect Fortress": "Крепость интеллекта",
  "Tiny Servant": "Крошечный слуга",
  "Mass Healing Word": "Массовое лечащее слово",
  "Blink": "Мерцание",
  "Flame Arrows": "Огненные стрелы",
  "Revivify": "Оживление",
  "Glyph of Warding": "Охранная руна",
  "Water Breathing": "Подводное дыхание",
  "Fly": "Полет",
  "Ashardalon's Stride": "Поступь Ашардалона",
  "Dispel Magic": "Рассеивание магии",
  "Create Food and Water": "Создание пищи и воды",
  "Elemental Weapon": "Стихийное оружие",
  "Haste": "Ускорение",
  "Water Walk": "Хождение по воде",
  "Mordenkainen's Faithful Hound": "Верный пес",
  "Death Ward": "Защита от смерти",
  "Fabricate": "Изготовление",
  "Stone Shape": "Изменение формы камня",
  "Stoneskin": "Каменная кожа",
  "Mordenkainen's Private Sanctum": "Личное святилище",
  "Arcane Eye": "Магический глаз",
  "Leomund's Secret Chest": "Потайной сундук",
  "Summon Construct": "Призыв конструкта",
  "Freedom of Movement": "Свобода перемещения",
  "Elemental Bane": "Стихийная погибель",
  "Otiluke's Resilient Sphere": "Упругая сфера",
  "Blight": "Усыхание",
  "Raise Dead": "Воскрешение мертвого",
  "Greater Restoration": "Высшее восстановление",
  "Wall of Stone": "Каменная стена",
  "Bigby's Hand": "Магическая ладонь",
  "Cloudkill": "Облако смерти",
  "Animate Objects": "Оживление предметов",
  "Transmute Rock": "Преобразование камня",
  "Creation": "Сотворение",
  "Create Spelljamming Helm": "Спеллджаммерский штурвал",
  "Skill Empowerment": "Улучшение навыка",
  "Heal": "Исцеление"
}).map(([english,name])=>[key(english),name])));
const sourceUrls={class:'https://www.dndbeyond.com/posts/854-artificer-101-a-beginners-guide-to-making-magical',alchemist:'https://www.dndbeyond.com/posts/908-artificer-101-alchemist-from-tashas-cauldron-of',tasha:'https://www.dndbeyond.com/sources/dnd/tcoe/artificer',elementalEvil:'https://media.wizards.com/2015/downloads/dnd/EE_PlayersCompanion.pdf'};
const defs=[];
function add(english,n,l,s,c,t,r,cm,d,x,hi,special,rule={}){
 const id='sp_artificer_'+normalize(english).replace(/ /g,'_');
 defs.push({id,n,l,s,c,t,r,cm,d,x,hi:hi||'',ritual:false,conc:/Концентрация/.test(d),custom:false,tags:[],saveTags:[],rulesetRef:{id:'dnd5e-2014-local',version:'1'},
  grimoire:{key:key(english),english,status:'active',edition:'2014',translation:'reviewed-project',officialRussian:false,aliases:[english,n],artificerCatalogRevision:revision},
  rulesSource:{book:l===0&&['Booming Blade','Green-Flame Blade','Lightning Lure','Sword Burst'].includes(english)||/Tasha|Intellect Fortress|Summon Construct/.test(english)?'Tasha’s Cauldron of Everything (2020)':'D&D 5e (2014 rules)',url:'https://www.dndbeyond.com/spells/'+normalize(english).replace(/ /g,'-'),summary:'original-project'},
  artificerSpell:{special:special||'',...rule}});
}
const cantrip='На уровнях персонажа 5, 11 и 17 добавляется ещё одна указанная кость урона.';
add('Booming Blade','Громовой клинок',0,'Воплощение','Чрд, Клд, Влш, Изб','1 действие','На себя (5 футов)','С, М (рукопашное оружие стоимостью не менее 1 см)','1 раунд','Совершите одну рукопашную атаку выбранным оружием по существу в пределах 5 футов. При попадании обычный урон оружия и громовая метка: если цель добровольно переместится не менее чем на 5 футов до начала вашего следующего хода, она получает 1d8 звукового урона, и метка заканчивается.','С 5-го уровня: +1d8 при попадании и 2d8 за перемещение; с 11-го: +2d8 и 3d8; с 17-го: +3d8 и 4d8.','boomingBlade',{weaponAttack:true});
add('Create Bonfire','Сотворение костра',0,'Вызов','Дрд, Чрд, Клд, Влш, Изб','1 действие','60 футов','В, С','Концентрация, до 1 минуты','Создайте костёр в видимом кубе с ребром 5 футов на земле. Существо в кубе при создании, впервые вошедшее туда за ход или закончившее там ход, совершает спасбросок Ловкости; провал наносит 1d8 огнём. Неносимые горючие предметы загораются.',cantrip,'createBonfire',{die:8,damageType:'огонь',save:'dex',area:true});
add('Frostbite','Обморожение',0,'Воплощение','Дрд, Чрд, Клд, Влш, Изб','1 действие','60 футов','В, С','Мгновенная','Видимое существо совершает спасбросок Телосложения. При провале получает 1d6 холодом и помеху на свою следующую атаку оружием до конца своего следующего хода.',cantrip,'frostbite',{die:6,damageType:'холод',save:'con'});
add('Green-Flame Blade','Клинок зелёного пламени',0,'Воплощение','Чрд, Клд, Влш, Изб','1 действие','На себя (5 футов)','С, М (рукопашное оружие стоимостью не менее 1 см)','Мгновенная','Совершите одну рукопашную атаку выбранным оружием по существу в пределах 5 футов. При попадании обычный урон оружия; по желанию огонь перескакивает на другое видимое существо в 5 футах от первой цели, нанося огнём модификатор вашей заклинательной характеристики.','С 5-го уровня: +1d8 огнём первой цели и 1d8 + модификатор второй; с 11-го по 2d8, с 17-го по 3d8.','greenFlameBlade',{weaponAttack:true});
add('Lightning Lure','Лассо молний',0,'Воплощение','Чрд, Клд, Влш, Изб','1 действие','На себя (15 футов)','В','Мгновенная','Одно видимое существо в пределах 15 футов совершает спасбросок Силы. При провале вы подтягиваете его к себе на расстояние до 10 футов. Только если после этого оно находится в пределах 5 футов, оно получает 1d8 молнией.',cantrip,'lightningLure',{die:8,damageType:'молния',save:'str'});
add('Magic Stone','Волшебный камень',0,'Преобразование','Дрд, Клд, Изб','1 бонусное действие','Касание','В, С','1 минута','Зачаруйте до трёх камешков. Вы или союзник можете метнуть камешек на 60 футов либо выстрелить им из пращи: дальнобойная атака заклинанием, использующая ваш модификатор заклинательной характеристики. Попадание наносит 1d6 + этот модификатор дробящего урона. После атаки камешек теряет магию даже при промахе. Повторное наложение снимает прежнее зачарование.','','magicStone');
add('Sword Burst','Вспышка мечей',0,'Вызов','Чрд, Клд, Влш, Изб','1 действие','На себя (радиус 5 футов)','В','Мгновенная','Все остальные существа в пределах 5 футов совершают отдельные спасброски Ловкости. Провал наносит 1d6 урона силовым полем.',cantrip,'swordBurst',{die:6,damageType:'силовое поле',save:'dex',area:true});
add('Thorn Whip','Терновый кнут',0,'Преобразование','Дрд, Изб','1 действие','30 футов','В, С, М (стебель растения с шипами)','Мгновенная','Рукопашная атака заклинанием по существу в пределах 30 футов. Попадание наносит 1d6 колющего урона. Цель размера Большой или меньше можно подтянуть к себе на расстояние до 10 футов.',cantrip,'thornWhip',{die:6,damageType:'колющий',attack:'melee'});
add('Thunderclap','Раскат грома',0,'Воплощение','Брд, Дрд, Чрд, Клд, Влш, Изб','1 действие','На себя (радиус 5 футов)','С','Мгновенная','Все остальные существа в пределах 5 футов совершают отдельные спасброски Телосложения. Провал наносит 1d6 звукового урона. Грохот слышен на 100 футов.',cantrip,'thunderclap',{die:6,damageType:'звук',save:'con',area:true});
add('Absorb Elements','Поглощение стихий',1,'Ограждение','Дрд, Слд, Чрд, Влш, Изб','1 реакция, когда вы получаете урон кислотой, холодом, огнём, молнией или звуком','На себя','С','1 раунд','Получите сопротивление виду урона, вызвавшему реакцию, включая этот урон, до начала своего следующего хода. При первом попадании рукопашной атакой в свой следующий ход нанесите дополнительно 1d6 того же вида; затем накопленная энергия исчезает.','За каждый круг выше первого дополнительный урон возрастает на 1d6.','absorbElements');
add('Catapult','Катапульта',1,'Преобразование','Чрд, Влш, Изб','1 действие','60 футов','С','Мгновенная','Неносимый предмет весом 1–5 фунтов в пределах дистанции летит по прямой до 90 футов. Первое существо на пути совершает спасбросок Ловкости: при успехе предмет летит дальше, при провале останавливается. Столкновение наносит предмету и тому, во что он попал, 3d8 дробящего урона.','За каждый круг выше первого максимальный вес растёт на 5 фунтов, урон — на 1d8.','catapult',{die:8,count:3,damageType:'дробящий',save:'dex'});
add('Snare','Силок',1,'Ограждение','Дрд, Слд, Влш, Изб','1 минута','Касание','С, М (25 футов верёвки, расходуются)','8 часов','Израсходуйте 25 футов верёвки, создавая ловушку-круг радиусом 5 футов. Вошедшее туда существо размера Маленький, Средний или Большой совершает спасбросок Ловкости. Провал подвешивает его вверх ногами и опутывает. В конце каждого своего хода цель повторяет спасбросок; она или помощник в пределах касания может действием сделать проверку Интеллекта (Магия) против вашей СЛ для освобождения. После срабатывания заклинание заканчивается, когда никого больше не удерживает; общий срок не превышает 8 часов с момента создания ловушки.','','snare');
add("Tasha's Caustic Brew",'Едкий отвар Таши',1,'Воплощение','Чрд, Влш, Изб','1 действие','На себя (линия 30 × 5 футов)','В, С, М (кусочек тухлой пищи)','Концентрация, до 1 минуты','Все существа на линии длиной 30 и шириной 5 футов совершают спасбросок Ловкости. При провале цель покрывается кислотой и в начале каждого своего хода получает 2d4 кислотой. Сама цель или помощник может действием смыть кислоту; концентрация связывает все затронутые цели.','За каждый круг выше первого периодический урон растёт на 2d4.','causticBrew');
add('Ray of Sickness','Луч болезни',1,'Некромантия','Чрд, Влш','1 действие','60 футов','В, С','Мгновенная','Дальнобойная атака заклинанием: попадание наносит 2d8 ядом. После попадания цель дополнительно совершает спасбросок Телосложения; провал делает её отравленной до конца вашего следующего хода. Успешный спасбросок не отменяет урон.','За каждый круг выше первого урон растёт на 1d8.','rayOfSickness',{die:8,count:2,damageType:'яд',attack:'ranged',save:'con'});
// Higher circles are retained as discoverable, correctly classified cards. The
// explicit engine gate remains closed until a corresponding handler exists.
add('Vortex Warp','Вихревой скачок',2,'Вызов','Чрд, Влш, Изб','1 действие','90 футов','В, С','Мгновенная','Выберите другое видимое существо в пределах дистанции. Оно совершает спасбросок Телосложения и вправе добровольно провалить его. При провале переместите цель телепортацией в видимое незанятое место в пределах той же дистанции от вас. Место должно вмещать цель без протискивания; поверхность или жидкость под ней должна удерживать её. Успешный спасбросок отменяет перемещение.','За каждый круг ячейки выше второго дистанция возрастает на 30 футов.','',{rulesFacts:{save:'con',willingMayFail:true,excludeCaster:true,visibleTarget:true,visibleDestination:true,destinationUnoccupied:true,destinationSupportsTarget:true,noSqueezing:true,rangeFeet:90,upcastRangeFeet:30}});
Object.assign(defs.at(-1).rulesSource,{book:'Strixhaven: A Curriculum of Chaos (2021)',url:'https://www.dndbeyond.com/spells/1239805-vortex-warp'});
add('Air Bubble','Воздушный пузырь',2,'Вызов','Дрд, Слд, Чрд, Влш, Изб','1 действие','60 футов','С','24 часа','У одного согласного видимого существа в пределах дистанции появляется воздушная оболочка вокруг головы. Она обеспечивает свежий воздух для дыхания на 24 часа. Для многоголовой цели выберите одну голову: остальные тоже могут дышать, если используют общую дыхательную систему.','За каждый круг ячейки выше второго создайте ещё две такие оболочки.','',{rulesFacts:{willing:true,visibleTarget:true,headsPerBubble:1,sharedRespiratorySystem:true,durationHours:24,rangeFeet:60,baseBubbles:1,upcastBubbles:2}});
Object.assign(defs.at(-1).rulesSource,{book:'Astral Adventurer’s Guide (2022)',url:'https://www.dndbeyond.com/spells/1585025-air-bubble'});
add('Kinetic Jaunt','Кинетический скачок',2,'Преобразование','Брд, Чрд, Влш, Изб','1 бонусное действие','На себя','С','Концентрация, до 1 минуты','Пока вы концентрируетесь, скорость ходьбы увеличена на 10 футов, а перемещение не вызывает провоцированных атак. Можно проходить через пространство других существ без штрафа труднопроходимой местности. Если закончить ход внутри чужого пространства, вас возвращает в последнее занятое вами свободное место и вы получаете 1d8 урона силовым полем.','','',{rulesFacts:{walkingSpeedBonusFeet:10,noOpportunityAttacks:true,passThroughCreatures:true,creatureSpaceNotDifficult:true,endInCreatureSpace:{destination:'last-unoccupied-space',damage:'1d8',damageType:'силовое поле'}}});
Object.assign(defs.at(-1).rulesSource,{book:'Strixhaven: A Curriculum of Chaos (2021)',url:'https://www.dndbeyond.com/spells/1239803-kinetic-jaunt'});
add("Ashardalon's Stride",'Поступь Ашардалона',3,'Преобразование','Слд, Чрд, Влш, Изб','1 бонусное действие','На себя','В, С','Концентрация, до 1 минуты','На время концентрации ваша скорость увеличивается на 20 футов, а движение не вызывает провоцированных атак. Когда вы проходите в пределах 5 футов от существа либо неносимого предмета, огненный след наносит ему 1d6 урона огнём без атаки и спасброска. Это затрагивает и союзников. Каждая цель получает такой урон не чаще одного раза за ход.','За каждый круг ячейки выше третьего бонус скорости возрастает на 5 футов, а урон — на 1d6.','',{rulesFacts:{speedBonusFeet:20,noOpportunityAttacks:true,proximityFeet:5,damage:'1d6',damageType:'огонь',unattendedObjects:true,alliesAffected:true,oncePerTargetPerTurn:true,upcastSpeedFeet:5,upcastDamage:'1d6'}});
Object.assign(defs.at(-1).rulesSource,{book:'Fizban’s Treasury of Dragons (2021)',url:'https://www.dndbeyond.com/spells/1183862-ashardalons-stride'});
add('Create Spelljamming Helm','Спеллджаммерский штурвал',5,'Преобразование','Влш, Изб','1 действие','Касание','В, С, М (хрустальный жезл стоимостью не менее 5000 зм, расходуется)','Мгновенная','Держа хрустальный жезл стоимостью не менее 5000 зм, коснитесь незанятого кресла размера Большой или меньше. Жезл расходуется, а кресло становится магическим спеллджаммерским штурвалом. Дальнейшая работа и настройка созданного предмета подчиняются описанию Spelljamming Helm из Astral Adventurer’s Guide.','','',{rulesFacts:{target:'unoccupied-chair',maximumSize:'Large',mustHoldMaterial:true,material:{item:'crystal-rod',minimumGp:5000,consumed:true},createdItem:'Spelljamming Helm',duration:'instantaneous'}});
Object.assign(defs.at(-1).rulesSource,{book:'Astral Adventurer’s Guide (2022)',url:'https://www.dndbeyond.com/spells/1585026-create-spelljamming-helm'});
add('Pyrotechnics','Пиротехника',2,'Преобразование','Брд, Чрд, Влш, Изб','1 действие','60 футов','В, С','Мгновенная','Погасите немагический огонь в кубе с ребром 5 футов. Выберите вспышку или дым: вспышка заставляет видящих огонь существ в 10 футах спасаться Телосложением от слепоты до конца вашего следующего хода; дым создаёт непрозрачную сферу радиусом 20 футов на 1 минуту, рассеиваемую сильным ветром.','','');
add('Skywrite','Небесное письмо',2,'Преобразование','Брд, Дрд, Влш, Изб','1 действие','В пределах видимости','В, С','Концентрация, до 1 часа','Создайте в видимой части неба облачные слова: до десяти слов. Сильный ветер рассеивает надпись. Ритуальное наложение возможно.','','');defs.at(-1).ritual=true;
add('Catnap','Дрёма',3,'Очарование','Брд, Чрд, Влш, Изб','1 действие','30 футов','С, М (щепотка песка)','10 минут','До трёх согласных видимых существ засыпают. Урон или действие помощника будит цель. Непрерывные 10 минут сна дают преимущества короткого отдыха; повторно получить их от этого заклинания можно после длительного отдыха.','За каждый круг выше третьего можно выбрать ещё одну цель.','');
add('Elemental Weapon','Стихийное оружие',3,'Преобразование','Пал, Изб','1 действие','Касание','В, С','Концентрация, до 1 часа','Одно немагическое оружие становится магическим: +1 к попаданию и +1d4 выбранного урона — кислота, холод, огонь, молния или звук.','Ячейка 5–6 круга: +2 и 2d4; 7-го и выше: +3 и 3d4.','');
add('Flame Arrows','Огненные стрелы',3,'Преобразование','Дрд, Слд, Чрд, Влш, Изб','1 действие','Касание','В, С','Концентрация, до 1 часа','Зачаруйте колчан: до 12 извлечённых стрел или болтов наносят дополнительно 1d6 огнём при попадании. Выстрел или промах тратит зачарованный боеприпас.','За каждый круг выше третьего можно зачаровать ещё два боеприпаса.','');
add('Intellect Fortress','Крепость интеллекта',3,'Ограждение','Брд, Чрд, Клд, Влш, Изб','1 действие','30 футов','В','Концентрация, до 1 часа','Одно видимое согласное существо получает сопротивление психическому урону и преимущество на спасброски Интеллекта, Мудрости и Харизмы.','За каждый круг выше третьего можно выбрать ещё одну цель; цели при наложении должны быть в пределах 30 футов друг от друга.','');
add('Tiny Servant','Крошечный слуга',3,'Преобразование','Влш, Изб','1 минута','Касание','В, С','8 часов','Оживите один Крошечный немагический предмет, который никто не несёт. Слуга выполняет команды; команды в пределах 120 футов отдаются бонусным действием. Он превращается обратно по окончании срока или при 0 хитах.','За каждый круг выше третьего оживают ещё два предмета.','');
add('Elemental Bane','Проклятие стихий',4,'Преобразование','Дрд, Клд, Влш, Изб','1 действие','90 футов','В, С','Концентрация, до 1 минуты','Выберите кислоту, холод, огонь, молнию или звук. При провале спасброска Телосложения видимая цель теряет сопротивление выбранному виду урона; первый такой урон за каждый ход наносит ей дополнительно 2d6. Иммунитет не снимается.','За каждый круг выше четвёртого можно выбрать ещё одну цель в пределах 30 футов от остальных.','');
add('Summon Construct','Призыв конструкта',4,'Вызов','Влш, Изб','1 действие','90 футов','В, С, М (украшенная шкатулка стоимостью 400 зм)','Концентрация, до 1 часа','Призовите дух конструкта в видимом свободном месте. Выберите глину, металл или камень; используется профиль духа конструкта, зависящий от круга ячейки. Он действует сразу после вашего хода и исполняет устные команды.','Круг ячейки определяет КД, хиты, урон и число атак по профилю духа.','');
add('Skill Empowerment','Усиление навыка',5,'Преобразование','Брд, Чрд, Влш, Изб','1 действие','Касание','В, С','Концентрация, до 1 часа','Согласная цель получает компетентность в одном навыке, которым уже владеет: бонус мастерства удваивается. Уже удвоенный бонус повторно не удваивается.','','');
add('Transmute Rock','Преобразование камня',5,'Преобразование','Дрд, Влш, Изб','1 действие','120 футов','В, С, М (глина и вода)','До рассеивания','В кубе с ребром 40 футов преобразуйте немагический камень в грязь либо грязь в камень. Существо в затронутой массе спасается Ловкостью от удержания; падающий размягчённый потолок может причинить 4d8 дробящего урона, половину при успешном спасброске.','','');
const definitions=Object.freeze(defs.map(Object.freeze));
function identity(row){return key(row?.grimoire?.english||row?.open5e?.originalName||row?.grimoire?.key||row?.n);}
function eligible(row){return row&&row.rulesetRef?.id!=='dnd5e-2024-reference'&&(!row.catalogSource||row.catalogSource.documentKey==='srd-2014')&&!['alias','archive'].includes(row.grimoire?.status);}
function classNamesFor(english){return classSet.has(key(english))?['Изб']:[];}
function install(rows){
 if(!Array.isArray(rows))return rows;
 for(const def of definitions){
  const matches=rows.filter(row=>eligible(row)&&identity(row)===identity(def));
  let canonical=matches.find(row=>row.id===def.id)||matches[0];
  if(!canonical){canonical=clone(def);rows.push(canonical);}
  else if(canonical.id===def.id&&canonical.grimoire?.translation!=='custom'&&canonical.mechanics?.origin!=='editor'&&canonical.grimoire?.artificerCatalogRevision!==revision){const mechanics=canonical.mechanics;Object.assign(canonical,clone(def));if(mechanics)canonical.mechanics=mechanics;}
  for(const row of matches)if(row!==canonical)row.grimoire={...row.grimoire,status:'alias',canonicalId:canonical.id,key:identity(def),reason:'Объединено с единственной карточкой D&D 2014'};
 }
 for(const row of rows){if(!eligible(row))continue;const english=row.grimoire?.english||row.open5e?.originalName||row.grimoire?.key;
  const archiveName=archiveNames[key(english)];if(archiveName&&row.grimoire?.status==='active')row.grimoire.aliases=[...new Set([...(row.grimoire.aliases||[]),archiveName])].sort();
  if(!classSet.has(key(english)))continue;
  const tokens=root.DND_GRIMOIRE_RULES?root.DND_GRIMOIRE_RULES.classTokens(row.c):String(row.c||'').split(/[,;/]/).map(s=>s.trim()).filter(Boolean);
  if(!tokens.includes('Изб'))row.c=tokens.concat('Изб').join(', ');
  if(row.mechanics?.spell?.access)row.mechanics.spell.access.classes=root.DND_GRIMOIRE_RULES.classTokens(row.c);
  row.grimoire={...row.grimoire,artificerClassRevision:revision};
 }
 return rows;
}
function audit(rows){const active=rows.filter(eligible),missing=[],duplicates=[],levels={};for(const [level,names] of Object.entries(spellLists)){levels[level]=0;for(const name of names){const found=active.filter(row=>identity(row)===key(name)&&String(row.c).split(/[,;/]/).map(s=>s.trim()).includes('Изб'));if(!found.length)missing.push(name);else levels[level]++;if(found.length>1)duplicates.push(name);}}return {revision,missing,duplicates,levels};}
root.DND_ARTIFICER_CATALOG=Object.freeze({revision,spellLists,sourceUrls,definitions,classNamesFor,identity,install,audit});
})(globalThis);
