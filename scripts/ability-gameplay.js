(function(root){
'use strict';
// Campaign ability definitions. Player prose is deliberately independent of
// importer, translation and execution diagnostics.
const revision='ability-gameplay-2026-09-24.1';
const profiles=new Map(),clone=v=>JSON.parse(JSON.stringify(v));
const fx=(stat,mode,value,more)=>({stat,mode,value,...more});
const add=(stat,value)=>fx(['str','dex','con','int','wis','cha'].includes(stat)?'ab.'+stat:stat==='save'?'save.all':stat,'add',value),adv=stat=>fx(stat==='initiative'?'init':stat,'adv',1);
const resist=(...types)=>fx('damage.rule','grant',{mode:'resist',types,when:''});
const immune=(...types)=>fx('damage.rule','grant',{mode:'immune',types,when:''});
const condition=name=>fx('condition','text',name);
const skills=['Акробатика','Расследование','Атлетика','Внимательность','Выживание','Выступление','Запугивание','История','Ловкость рук','Магия','Медицина','Обман','Природа','Проницательность','Религия','Скрытность','Убеждение','Уход за животными'];
const elements=['огонь','холод','кислота','электричество','яд'];
const languages=['Общий','Дварфский','Эльфийский','Великаний','Гномий','Гоблинский','Полуросликов','Орочий','Драконий','Небесный','Инфернальный','Сильван','Первичный','Глубинная речь'];
const abilities={str:'Сила',dex:'Ловкость',con:'Телосложение',int:'Интеллект',wis:'Мудрость',cha:'Харизма'};
function define(keys,p){for(const key of keys.split('|')){if(profiles.has(key))throw new Error('Duplicate ability profile: '+key);profiles.set(key,{...p,key});}}
function passive(keys,text,effects=[],rules={}){define(keys,{role:'passive',text,effects,rules});}
function active(keys,text,{effects=[],rolls=[],save=null,attack=null,contest=null,cost='action',target='self',rounds=1,uses=null,rest='',...more}={}){
 define(keys,{role:'active',text,effects,rolls,save,attack,contest,cost,target,rounds,uses,rest,...more});
}
function choice(keys,text,field,options,effects=[],more={}){define(keys,{role:'passive',text,effects,choices:[{field,options}],...more});}
function resource(keys,text,pool,uses,rest='короткий отдых'){define(keys,{role:'resource',text,pool,uses,rest,effects:[]});}
const skillGrant=(names,rank=1)=>names.map(name=>fx('proficiency.skill','grant',{name,rank}));
const langGrant=names=>names.map(name=>fx('proficiency.language','grant',name));
const sr=(key,dc='spell',half=false)=>({key,dc:typeof dc==='number'?{source:'fixed',value:dc}:{source:dc==='spell'?'spell':'ability',key:dc},half});
const die=(type,cnt,sides,mod=0,damageType='')=>({type,cnt,sides,mod:typeof mod==='number'?{source:'fixed',value:mod}:{source:mod==='level'?'level':'ability',key:mod},damageType});

passive('darkvision','Вы видите в темноте на 18 м. В этой области тусклый свет не мешает зрению; в темноте вы различаете оттенки серого.',[fx('vision.dark','min',18)]);
passive('keen senses','Вы владеете Внимательностью.',skillGrant(['Внимательность']));
passive('menacing','Вы владеете Запугиванием.',skillGrant(['Запугивание']));
passive('fey ancestry','Вы совершаете с преимуществом спасброски от очарования. Магический сон на вас не действует.',[adv('save.charm')],{magicalSleepImmune:true});
passive('trance','Вам достаточно 4 часов спокойной медитации вместо сна. По окончании продолжительного отдыха вы восстанавливаете обычные запасы сил.',[],{restHours:4});
passive('dwarven resilience','Вы сопротивляетесь урону ядом и совершаете с преимуществом спасброски от яда.',[resist('яд'),adv('save.poison')]);
passive('brave','Вы совершаете с преимуществом спасброски от испуга.',[adv('save.fear')]);
passive('hellish resistance','Вы обладаете сопротивлением урону огнём.',[resist('огонь')]);
passive('gnome cunning|gnomish cunning','Вы совершаете с преимуществом спасброски Интеллекта, Мудрости и Харизмы от магии. Немагические воздействия этого преимущества не дают.',['int','wis','cha'].map(key=>fx('save.'+key,'adv',1,{context:{anyTags:['magical','magic','spell']}})));
passive('dwarven toughness','Максимум ваших хитов увеличивается на ваш уровень.',[add('hpmax','level')]);
passive('disciple of life','Когда ваше заклинание 1-го круга или выше восстанавливает хиты, цель получает дополнительно 2 + круг потраченной ячейки хитов.',[],{healingSpellBonus:{base:2,perSlot:1}});
passive('extra attack|two extra attacks|three extra attacks|multiattack','При действии «Атака» вы можете атаковать дважды. У воина с 11-го уровня — трижды, с 20-го — четырежды. Несколько таких способностей не складываются.',[],{attacksPerAction:2,scaleAttacks:true});
passive('danger sense','Вы совершаете с преимуществом спасброски Ловкости, пока не ослеплены, не оглушены и не недееспособны.',[fx('save.dex','adv',1,{excludeConditions:['Ослеплённый','Ослепленный','Ошеломлённый','Ошеломленный','Недееспособный']})]);
passive('fast movement','Пока на вас нет тяжёлого доспеха, ваша скорость увеличена на 3 м.',[add('speed',3)],{armorGate:'no-heavy'});
passive('feral instinct','Вы совершаете проверки инициативы с преимуществом.',[adv('initiative')]);
passive('indomitable might','Вы совершаете с преимуществом проверки Силы и Атлетики.',[adv('check.str'),adv('skill.Атлетика')]);
passive('primal champion','Ваша Сила и Телосложение увеличиваются на 4, но не выше 24.',[add('str',4),add('con',4)],{abilityCaps:{str:24,con:24}});
passive('body and mind','Ваши Ловкость и Мудрость увеличиваются на 4, но не выше 25.',[add('dex',4),add('wis',4)],{abilityCaps:{dex:25,wis:25}});
passive('improved critical','Ваши атаки оружием наносят критический урон при 19–20 на d20.',[],{critical:19});
passive('superior critical','Ваши атаки оружием наносят критический урон при 18–20 на d20.',[],{critical:18});
passive('remarkable athlete','Вы совершаете с преимуществом проверки Атлетики и инициативы.',[adv('skill.Атлетика'),adv('initiative')]);
passive('jack of all trades','К проверкам навыков, которыми вы не владеете, прибавляется половина бонуса мастерства с округлением вниз.',[],{jackOfAllTrades:true});
passive('diamond soul|disciplined survivor','Вы владеете всеми спасбросками.',[],{saveProficiency:['str','dex','con','int','wis','cha']});
passive('slippery mind','Вы владеете спасбросками Мудрости и Харизмы.',[],{saveProficiency:['wis','cha']});
passive('reliable talent','При проверке навыка, которым вы владеете, результат d20 ниже 10 считается равным 10.',[],{reliableTalent:true});
passive('elusive','Пока вы дееспособны, атаки по вам не получают преимущества.',[],{denyAttackAdvantage:true});
passive('purity of body|divine health','Вы невосприимчивы к урону ядом, отравлению и болезням.',[immune('яд'),fx('condition.immune','grant','Отравленный')]);
passive('mindless rage','Пока на вас действует ярость, вы невосприимчивы к очарованию и испугу.',[fx('condition.immune','grant','Очарованный'),fx('condition.immune','grant','Испуганный')],{requiresActive:'rage'});
passive('aura of courage','Вы невосприимчивы к испугу.',[fx('condition.immune','grant','Испуганный')]);
passive('aura of devotion','Вы невосприимчивы к очарованию.',[fx('condition.immune','grant','Очарованный')]);
passive('aura of protection','Вы прибавляете к своим спасброскам модификатор Харизмы, минимум +1.',[add('save','cha-min1')]);
passive('land\'s stride','Вы получаете преимущество на спасброски от опутывания и +1,5 м к скорости.',[adv('save.restrain'),add('speed',1.5)]);
passive('nature\'s ward','Вы сопротивляетесь урону ядом и совершаете с преимуществом спасброски от очарования и испуга.',[resist('яд'),adv('save.charm'),adv('save.fear')]);
passive('blindsense|feral senses','Вы обнаруживаете невидимых существ на расстоянии 9 м, если не оглохли. Вы не получаете помеху к атаке из-за их невидимости.',[fx('vision.blind','min',9)]);
passive('draconic resilience','Пока вы без доспеха, ваш КД равен 13 + модификатор Ловкости. Максимум хитов дополнительно увеличивается на ваш уровень.',[add('hpmax','level')],{unarmoredBase:13});
passive('unarmored defense','Без доспеха ваш КД равен 10 + модификатор Ловкости + модификатор Телосложения у варвара или Мудрости у остальных героев. Монаху также нельзя использовать щит.',[],{unarmoredDefense:true});
passive('unarmored movement','Без доспеха и щита ваша скорость возрастает на 3 м; с 10-го уровня — на 6 м, с 18-го — на 9 м.',[add('speed','monk-speed')],{armorGate:'unarmored'});
passive('acrobatic movement','Без доспеха и щита ваша скорость лазания равна скорости ходьбы.',[fx('speed.climb','set','равна скорости ходьбы')],{armorGate:'unarmored'});
passive('second-story work','Ваша скорость лазания равна скорости ходьбы; вы совершаете с преимуществом Атлетику при прыжках.',[fx('speed.climb','set','равна скорости ходьбы'),fx('skill.Атлетика','adv',1,{context:{anyTags:['jump']}})]);
passive('roving','Ваша скорость увеличивается на 3 м; скорости плавания и лазания равны скорости ходьбы.',[add('speed',3),fx('speed.climb','set','равна скорости ходьбы'),fx('speed.swim','set','равна скорости ходьбы')]);
passive('powerful build','Вы можете нести вдвое больше обычного. Вы совершаете с преимуществом Атлетику.',[fx('carry','mul',2),adv('skill.Атлетика')]);
passive('archery','Вы получаете +2 к броскам атаки дальнобойным оружием.',[],{rangedAttackBonus:2});
passive('defense','Пока на вас надет доспех, ваш КД увеличивается на 1.',[add('ac',1)],{armorGate:'armored'});
passive('great weapon fighting','Урон ваших двуручных атак оружием увеличивается на 2.',[],{twoHandDamage:2});
passive('two-weapon fighting','При атаке второй рукой вы прибавляете модификатор характеристики к урону.',[],{twoWeaponFighting:true});
passive('alert','Ваш бонус инициативы увеличивается на бонус мастерства.',[add('init','prof')]);
passive('scholar','Вы владеете Магией и Историей.',skillGrant(['Магия','История']));
passive('druidic','Вы читаете и говорите на языке друидов.',langGrant(['Друидический']));
passive('thieves\' cant','Вы владеете воровским жаргоном и совершаете с преимуществом проверки Обмана.',[...langGrant(['Воровской жаргон']),adv('skill.Обман')]);
passive('tongue of the sun and moon','Вы понимаете речь на всех языках и можете быть поняты любым существом, владеющим хотя бы одним языком.',langGrant(['Все устные языки']));
choice('damage resistance|fiendish resilience','Выберите один тип урона. Вы сопротивляетесь этому типу урона. Сменить выбор можно после продолжительного отдыха.','element',['огонь','холод','кислота','электричество','яд','некротический','лучистый','психический','звуковой','силовой'],[fx('damage.rule','grant',{mode:'resist',types:['$element'],when:''})],{choiceRest:true});
choice('draconic ancestry|dragon ancestor|draconic ancestry table','Выберите стихию предка: огонь, холод, кислоту, электричество или яд. Вы сопротивляетесь урону выбранного типа; эта же стихия используется вашим дыханием.','element',elements,[fx('damage.rule','grant',{mode:'resist',types:['$element'],when:''})]);
choice('expertise','Выберите навык. Ваш бонус мастерства для него удваивается. Другое владение этим навыком повторного бонуса не даёт.','skill',skills,[fx('proficiency.skill','grant',{name:'$skill',rank:2})]);
choice('skilled|skillful|skill versatility|bonus proficiencies|bonus proficiency','Выберите навык, которым будете владеть. Повторное владение одним навыком не складывается.','skill',skills,[fx('proficiency.skill','grant',{name:'$skill',rank:1})]);
choice('languages|extra language','Выберите дополнительный язык. Вы умеете говорить, читать и писать на нём.','language',languages,[fx('proficiency.language','grant','$language')]);
choice('ability score improvement|ability score increase|improvement','Выберите характеристику. Она увеличивается на 2, но не выше 20.','attribute',Object.keys(abilities),[fx('$attribute','add',2)],{choiceLabels:abilities,rules:{selectedAbilityCap:20}});

resource('ki|ki points|monk\'s focus','Ваш запас ци равен уровню персонажа. Приёмы расходуют указанное число очков; короткий или продолжительный отдых восстанавливает весь запас.','ki','level');
resource('sorcery points|font of magic','Ваш запас очков чар равен уровню персонажа. Он расходуется на метамагию и восстанавливается после продолжительного отдыха.','sorcery','level','длинный отдых');
passive('rages','Вы можете впасть в ярость ещё один раз между продолжительными отдыхами.',[],{rageExtraUses:1});
active('rage','Бонусным действием впадите в ярость на 1 минуту: сопротивление дробящему, колющему и рубящему урону, преимущество на проверки Силы и +2 к урону оружием. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'bonus',rounds:10,uses:'prof',rest:'длинный отдых',effects:[resist('дробящий','колющий','рубящий'),adv('check.str'),adv('skill.Атлетика'),add('weapon.dmg',2)]});
active('reckless attack','До начала следующего раунда ваши атаки оружием совершаются с преимуществом, а атаки по вам получают преимущество. Применяется в свой ход без затрат действия.',{cost:'turnfree',rounds:1,oncePerTurn:true,effects:[adv('weapon.attack'),adv('incoming.attack')]});
active('frenzy','Бонусным действием совершите атаку оружием. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'bonus',target:'enemy',weapon:true,rounds:0,uses:'prof',rest:'длинный отдых'});
active('retaliation','Реакцией совершите одну атаку оружием по выбранному противнику.',{cost:'reaction',target:'enemy',weapon:true,rounds:0});
active('intimidating presence|draconic presence|abjure foes','Действием устрашите противника. При провале спасброска Мудрости против Сл ваших заклинаний цель испугана 1 раунд. Использований — по бонусу мастерства за продолжительный отдых.',{target:'enemy',save:sr('wis'),effects:[condition('Испуганный')],rounds:1,uses:'prof',rest:'длинный отдых'});
active('dragon wings|draconic flight','Бонусным действием расправьте крылья. На 1 минуту вы получаете скорость полёта, равную скорости ходьбы. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[fx('speed.fly','set','равна скорости ходьбы')]});
active('breath weapon','Действием выдохните огонь в выбранного противника. Спасбросок Ловкости: Сл 8 + бонус мастерства + модификатор Телосложения. Урон 2d6 огнём, при успехе — половина. С 6-го уровня — 3d6, с 11-го — 4d6, с 16-го — 5d6. Стихия наследия заменяет огонь. Один раз за короткий или продолжительный отдых.',{target:'enemy',save:sr('dex','con',true),rolls:[{...die('dmg',2,6,0,'огонь'),levelTiers:[{level:6,cnt:3},{level:11,cnt:4},{level:16,cnt:5}]}],rounds:0,uses:1,rest:'короткий отдых',ancestryDamage:true});
active('lay on hands|channel divinity: preserve life|preserve life','Действием восстановите выбранному союзнику хиты в количестве 5 × ваш уровень, не превышая максимум. Один раз за продолжительный отдых.',{target:'ally',rounds:0,uses:1,rest:'длинный отдых',rolls:[die('heal',0,0,0)],fixedHeal:'five-level'});
active('divine intervention|greater divine intervention','Действием призовите целительную помощь: выбранный союзник восстанавливает 5d8 + ваш уровень хитов. Один раз за продолжительный отдых.',{target:'ally',rounds:0,uses:1,rest:'длинный отдых',rolls:[die('heal',5,8,'level')]});
active('wholeness of body','Действием восстановите 3 × ваш уровень хитов. Один раз за продолжительный отдых.',{rounds:0,uses:1,rest:'длинный отдых',rolls:[die('heal',0,0,0)],fixedHeal:'three-level'});
active('blessed healer','Бонусным действием восстановите себе 1d6 + модификатор Мудрости хитов. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'bonus',rounds:0,uses:'prof',rest:'длинный отдых',rolls:[die('heal',1,6,'wis')]});
active('song of rest','После короткого отдыха вы можете действием восстановить выбранному союзнику 1d6 дополнительных хитов. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:0,uses:1,rest:'короткий отдых',rolls:[die('heal',1,6)]});
active('survivor','Бонусным действием восстановите 5 + модификатор Телосложения хитов. Доступно, пока ваши текущие хиты выше 0 и не превышают половины максимума; один раз за ход.',{cost:'bonus',rounds:0,oncePerTurn:true,rolls:[die('heal',0,0,'con')],fixedHeal:'survivor',healthGate:'half'});
active('divine smite|paladin\'s smite','Действием совершите атаку оружием. Попадание наносит дополнительно 2d8 лучистого урона. Использований — по бонусу мастерства за продолжительный отдых.',{weapon:true,target:'enemy',rounds:0,uses:'prof',rest:'длинный отдых',rolls:[die('dmg',2,8,0,'лучистый')]});
active('divine strike|blessed strikes|radiant strikes|improved divine smite','Действием совершите атаку оружием с дополнительным 1d8 лучистого урона при попадании. Не более одного раза за ход.',{weapon:true,target:'enemy',rounds:0,oncePerTurn:true,rolls:[die('dmg',1,8,0,'лучистый')]});
active('improved blessed strikes','Действием совершите атаку оружием с дополнительным 2d8 лучистого урона при попадании. Не более одного раза за ход.',{weapon:true,target:'enemy',rounds:0,oncePerTurn:true,rolls:[die('dmg',2,8,0,'лучистый')]});
active('sneak attack','Действием совершите атаку оружием с дополнительным уроном 1d6 за каждые два уровня персонажа, округляя вверх. Не более одного раза за ход.',{weapon:true,target:'enemy',rounds:0,oncePerTurn:true,rolls:[die('dmg',1,6,0,'колющий')],scaleDice:'sneak'});
active('stunning strike','Действием совершите атаку оружием и потратьте 1 очко ци. При попадании цель совершает спасбросок Телосложения против Сл 8 + бонус мастерства + модификатор Мудрости. Провал оглушает её на 1 раунд.',{weapon:true,target:'enemy',spendPool:'ki',save:sr('con','wis'),rounds:1,effects:[condition('Ошеломлённый')]});
active('open hand technique','Действием совершите атаку оружием и потратьте 1 очко ци. При попадании цель совершает спасбросок Силы против Сл 8 + бонус мастерства + модификатор Мудрости. При провале она сбита с ног.',{weapon:true,target:'enemy',spendPool:'ki',save:sr('str','wis'),rounds:1,effects:[condition('Сбитый с ног')]});
active('quivering palm','Действием нанесите противнику 10d10 некротического урона; успешный спасбросок Телосложения против Сл ваших заклинаний уменьшает урон вдвое. Требуется 3 очка ци и одно использование за продолжительный отдых.',{target:'enemy',spendPool:'ki',poolCost:3,save:sr('con','spell',true),rounds:0,uses:1,rest:'длинный отдых',rolls:[die('dmg',10,10,0,'некротический')]});
active('hurl through hell','Действием обрушьте на противника видения Преисподней: 10d10 психического урона. Успешный спасбросок Харизмы против Сл ваших заклинаний уменьшает урон вдвое. Один раз за продолжительный отдых.',{target:'enemy',save:sr('cha','spell',true),rounds:0,uses:1,rest:'длинный отдых',rolls:[die('dmg',10,10,0,'психический')]});
active('channel divinity|destroy undead|sear undead','Действием ударьте противника священным светом: 2d8 лучистого урона. Спасбросок Мудрости против Сл ваших заклинаний уменьшает урон вдвое. Один раз за короткий или продолжительный отдых.',{target:'enemy',save:sr('wis','spell',true),rounds:0,uses:1,rest:'короткий отдых',rolls:[die('dmg',2,8,0,'лучистый')]});
active('countercharm','Действием защитите выбранного союзника на 1 минуту. Он получает преимущество на спасброски от очарования и испуга.',{target:'ally',rounds:10,effects:[adv('save.charm'),adv('save.fear')]});
active('bardic inspiration','Бонусным действием вдохновите союзника на 10 минут. Он добавит 1d6 к следующей атаке, проверке или спасброску. Использований — модификатор Харизмы, минимум одно; восстановление после короткого отдыха.',{target:'ally',cost:'bonus',rounds:100,uses:'cha-min1',rest:'короткий отдых',effects:['attack','check','save.all'].map(s=>fx(s,'die','1d6',{consume:'roll'}))});
active('cutting words','Реакцией сбейте противника с толку: он вычитает 1d6 из следующей атаки или проверки в течение 1 раунда. Использований — по бонусу мастерства за короткий отдых.',{target:'enemy',cost:'reaction',rounds:1,uses:'prof',rest:'короткий отдых',effects:['attack','check'].map(s=>fx(s,'die','-1d6',{consume:'roll'}))});
active('peerless skill|dark one\'s own luck','Свободным действием добавьте 1d10 к своей следующей проверке навыка или спасброску в течение 1 минуты. Один раз за короткий или продолжительный отдых.',{cost:'free',rounds:10,uses:1,rest:'короткий отдых',effects:['check','save.all'].map(s=>fx(s,'die','1d10',{consume:'roll'}))});
active('cunning action|fleet step|instinctive pounce|tactical shift','Бонусным действием удвойте скорость ходьбы на 1 раунд.',{cost:'bonus',rounds:1,effects:[fx('speed','mul',2)]});
active('vanish|hide in plain sight|nature\'s veil','Бонусным действием станьте невидимым на 1 раунд. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'bonus',rounds:1,uses:'prof',rest:'длинный отдых',effects:[condition('Невидимый')]});
active('empty body','Действием потратьте 4 очка ци: на 1 минуту вы становитесь невидимым и сопротивляетесь любому урону, кроме силового.',{rounds:10,spendPool:'ki',poolCost:4,effects:[condition('Невидимый'),resist('дробящий','колющий','рубящий','огонь','холод','кислота','электричество','яд','некротический','лучистый','психический','звуковой')]});
active('superior defense','Бонусным действием потратьте 3 очка ци: на 1 минуту вы получаете +2 КД и сопротивление дробящему, колющему и рубящему урону.',{cost:'bonus',rounds:10,spendPool:'ki',poolCost:3,effects:[add('ac',2),resist('дробящий','колющий','рубящий')]});
active('uncanny dodge|deflect missiles|deflect attacks|deflect energy','Реакцией приготовьтесь отразить удар. До начала следующего раунда вы сопротивляетесь дробящему, колющему и рубящему урону.',{cost:'reaction',rounds:1,effects:[resist('дробящий','колющий','рубящий')]});
active('slow fall','Реакцией смягчите падение: до начала следующего раунда вы невосприимчивы к дробящему урону. Один раз за короткий или продолжительный отдых.',{cost:'reaction',rounds:1,uses:1,rest:'короткий отдых',effects:[immune('дробящий')]});
active('evasion|superior hunter\'s defense','Реакцией уклонитесь от опасности. На 1 раунд вы получаете преимущество на спасброски Ловкости и сопротивление огню, холоду, кислоте и электричеству.',{cost:'reaction',rounds:1,effects:[adv('save.dex'),resist('огонь','холод','кислота','электричество')]});
active('stillness of mind|self-restoration','Действием прекратите на себе испуг и очарование.',{rounds:0,cleanse:['Испуганный','Очарованный']});
active('cleansing touch|restoring touch','Действием снимите с выбранного союзника испуг, очарование, отравление, ослепление и оглушение. Использований — по бонусу мастерства за продолжительный отдых.',{target:'ally',rounds:0,uses:'prof',rest:'длинный отдых',cleanse:['Испуганный','Очарованный','Отравленный','Ослеплённый','Ослепленный','Ошеломлённый','Ошеломленный']});
active('steady aim|precise hunter','Бонусным действием приготовьтесь к выстрелу: до следующего раунда ваши атаки получают преимущество, а скорость становится равной 0.',{cost:'bonus',rounds:1,effects:[adv('attack'),fx('speed','set',0)]});
active('holy nimbus','Действием окружите себя священным сиянием: на 1 минуту вы получаете +2 КД и +2 к спасброскам. Один раз за продолжительный отдых.',{rounds:10,uses:1,rest:'длинный отдых',effects:[add('ac',2),add('save',2)]});
active('sacred weapon','Бонусным действием освятите оружие: в течение 1 минуты ваши атаки оружием получают +2 к попаданию и урону. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[add('weapon.atk',2),add('weapon.dmg',2)]});
active('smite of protection','Бонусным действием защитите союзника на 1 минуту: +2 КД. Один раз за короткий или продолжительный отдых.',{target:'ally',cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[add('ac',2)]});
active('tireless|dark one\'s blessing|adrenaline rush','Бонусным действием получите 1d8 + ваш уровень временных хитов. Они не складываются: остаётся больший запас. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'bonus',rounds:0,uses:'prof',rest:'длинный отдых',rolls:[die('temp',1,8,'level')]});
active('large form','Бонусным действием увеличьте свою мощь на 1 минуту: преимущество на Атлетику, +3 м к скорости и +2 к урону оружием. Один раз за продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'длинный отдых',effects:[adv('skill.Атлетика'),add('speed',3),add('weapon.dmg',2)]});
active('brutal strike|improved brutal strike|improved brutal strike (enhanced)','Действием совершите атаку оружием, наносящую при попадании дополнительно 1d10 дробящего урона. Не более одного раза за ход.',{target:'enemy',weapon:true,rounds:0,oncePerTurn:true,rolls:[die('dmg',1,10,0,'дробящий')]});
active('cunning strike|devious strikes|improved cunning strike','Действием совершите атаку оружием. При попадании цель совершает спасбросок Телосложения против Сл 8 + бонус мастерства + модификатор Ловкости. При провале она отравлена на 1 раунд. Не более одного раза за ход.',{target:'enemy',weapon:true,rounds:1,oncePerTurn:true,save:sr('con','dex'),effects:[condition('Отравленный')]});
active('land\'s aid','Действием восстановите выбранному союзнику 2d6 + модификатор Мудрости хитов. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:0,uses:1,rest:'короткий отдых',rolls:[die('heal',2,6,'wis')]});
active('innate sorcery|sorcery incarnate|arcane apotheosis','Бонусным действием пробудите магию: на 1 минуту получите +1 к Сл заклинаний и преимущество на атаки заклинаниями. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[add('spell.dc',1),adv('spell.attack')]});
active('metamagic','Бонусным действием потратьте 1 очко чар: на 1 минуту Сл ваших заклинаний увеличивается на 1.',{cost:'bonus',spendPool:'sorcery',rounds:10,effects:[add('spell.dc',1)]});
active('sculpt spells','Реакцией защитите выбранного союзника от стихий на 1 раунд: сопротивление огню, холоду, кислоте, электричеству и звуковому урону. Использований — по бонусу мастерства за продолжительный отдых.',{target:'ally',cost:'reaction',rounds:1,uses:'prof',rest:'длинный отдых',effects:[resist('огонь','холод','кислота','электричество','звуковой')]});
active('overchannel','Бонусным действием сосредоточьте магию: на 1 раунд ваши заклинания получают +3 к Сл и +3 к атакам. Один раз за продолжительный отдых.',{cost:'bonus',rounds:1,uses:1,rest:'длинный отдых',effects:[add('spell.dc',3),add('spell.atk',3)]});
active('stroke of luck|boon of fate','Свободным действием получите преимущество на следующую атаку, проверку или спасбросок в течение 1 минуты. Один раз за короткий или продолжительный отдых.',{cost:'free',rounds:10,uses:1,rest:'короткий отдых',effects:['attack','check','save.all'].map(s=>fx(s,'adv',1,{consume:'roll'}))});
active('heroic warrior|heroic boon|resourceful|versatile','Бонусным действием получите преимущество на следующую проверку навыка в течение 1 минуты. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[fx('check','adv',1,{consume:'roll'})]});
active('indomitable','Реакцией получите преимущество на следующий спасбросок в течение 1 раунда. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'reaction',rounds:1,uses:'prof',rest:'длинный отдых',effects:[fx('save.all','adv',1,{consume:'roll'})]});
active('nature\'s sanctuary|tranquility|purity of spirit','Бонусным действием защитите себя: в течение 1 минуты атаки по вам совершаются с помехой. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[fx('incoming.attack','dis',1)]});

passive('stonecunning','Вы владеете Историей с удвоенным бонусом мастерства.',skillGrant(['История'],2));
passive('halfling nimbleness','Вы получаете преимущество на Акробатику и +1,5 м к скорости.',[adv('skill.Акробатика'),add('speed',1.5)]);
passive('naturally stealthy|supreme sneak','Вы совершаете с преимуществом проверки Скрытности.',[adv('skill.Скрытность')]);
passive('artificer\'s lore|engineer\'s insight','Вы владеете Магией и Расследованием.',skillGrant(['Магия','Расследование']));
passive('eyes of the maker','Вы видите в темноте на 18 м и совершаете с преимуществом проверки Расследования.',[fx('vision.dark','min',18),adv('skill.Расследование')]);
passive('primal knowledge|natural explorer|deft explorer','Вы владеете Выживанием и Природой.',skillGrant(['Выживание','Природа']));
passive('hunter\'s lore|favored enemy','Вы получаете преимущество на проверки Выживания и Внимательности.',[adv('skill.Выживание'),adv('skill.Внимательность')]);
passive('timeless body','Ваше тело не слабеет от времени. Максимум хитов увеличивается на 5.',[add('hpmax',5)]);
passive('ki-empowered strikes|empowered strikes','Ваши безоружные атаки получают +1 к попаданию и наносят дополнительно 2 урона.',[add('unarmed.atk',1),add('unarmed.dmg',2)]);
passive('martial arts','Ваши безоружные атаки наносят дополнительно урон, равный бонусу мастерства.',[add('unarmed.dmg','prof')]);
passive('rage damage|persistent rage','Пока вы в ярости, урон ваших атак оружием увеличивается ещё на 1.',[add('weapon.dmg',1)],{requiresActive:'rage'});
passive('foe slayer|hunter\'s prey|superior hunter\'s prey','Ваши атаки оружием наносят дополнительно 2 урона.',[add('weapon.dmg',2)]);
passive('elemental affinity|empowered evocation|potent cantrip','Ваши атаки заклинаниями и Сл заклинаний увеличиваются на 1.',[add('spell.atk',1),add('spell.dc',1)]);
passive('evocation savant','Вы владеете Магией с удвоенным бонусом мастерства.',skillGrant(['Магия'],2));
passive('fast hands','Вы владеете Ловкостью рук с удвоенным бонусом мастерства.',skillGrant(['Ловкость рук'],2));
passive('thief\'s reflexes','Вы получаете +3 к инициативе и +1,5 м к скорости.',[add('init',3),add('speed',1.5)]);
passive('defensive tactics','Вы получаете +1 к КД и спасброскам Ловкости.',[add('ac',1),add('save.dex',1)]);
passive('studdied attacks|weapon mastery|tactical master','Вы получаете +1 к попаданию атаками оружием.',[add('weapon.atk',1)]);
passive('heightened focus','Вы получаете +1 к КД и безоружным атакам.',[add('ac',1),add('unarmed.atk',1)]);
passive('aura expansion','Ваши спасброски получают дополнительный бонус +1.',[add('save',1)]);
passive('epic boon','Максимум хитов увеличивается на 10; вы получаете +1 ко всем спасброскам.',[add('hpmax',10),add('save',1)]);
passive('boon of combat prowess','Ваши атаки оружием получают +2 к попаданию.',[add('weapon.atk',2)]);
passive('boon of irresistible offense','Ваш урон оружием увеличивается на 3.',[add('weapon.dmg',3)]);
passive('boon of truesight','Вы обнаруживаете невидимых существ в пределах 18 м и совершаете с преимуществом Внимательность.',[fx('vision.blind','min',18),adv('skill.Внимательность')]);
passive('savage attacks|savage attacker|brutal critical','При критическом попадании оружием бросьте ещё одну кость урона этого оружия. Дополнительная кость прибавляется к удвоенным костям критического попадания.',[],{criticalExtraDie:1});
passive('dwarven combat training','Вы владеете боевыми топорами, ручными топорами, лёгкими и боевыми молотами.',[],{weaponNames:['боевой топор','ручной топор','легкий молот','боевой молот']});
passive('elf weapon training','Вы владеете длинными и короткими мечами, длинными и короткими луками.',[],{weaponNames:['длинный меч','короткий меч','длинный лук','короткий лук']});
choice('tool proficiency','Выберите инструмент, которым будете владеть. Бонус мастерства добавляется к проверкам работы с ним.','tool',['Воровские инструменты','Инструменты кузнеца','Инструменты алхимика','Инструменты плотника','Инструменты каменщика','Инструменты жестянщика'],[fx('proficiency.tool','grant','$tool')]);
choice('fighting style|additional fighting style','Выберите стиль: Защита даёт +1 КД; Стрельба — +2 к дальнобойным атакам; Дуэлянт — +2 к урону оружием; Бой без оружия — +2 к безоружному урону.','style',['Защита','Стрельба','Дуэлянт','Бой без оружия'],[],{styleChoice:true});
choice('divine order|primal order','Выберите путь: Хранитель даёт +1 КД; Мудрец даёт владение Магией с удвоенным бонусом мастерства.','order',['Хранитель','Мудрец'],[],{orderChoice:true});
active('infernal legacy','Реакцией обрушьте адское пламя на противника: 2d10 огнём. Спасбросок Ловкости против Сл 8 + бонус мастерства + модификатор Харизмы уменьшает урон вдвое. Один раз за продолжительный отдых.',{cost:'reaction',target:'enemy',rounds:0,uses:1,rest:'длинный отдых',save:sr('dex','cha',true),rolls:[die('dmg',2,10,0,'огонь')]});
active('lucky:racial','Свободным действием получите преимущество на следующую атаку, проверку или спасбросок в течение 1 минуты. Один раз за короткий или продолжительный отдых.',{cost:'free',rounds:10,uses:1,rest:'короткий отдых',effects:['attack','check','save.all'].map(s=>fx(s,'adv',1,{consume:'roll'}))});
define('relentless endurance|relentless rage',{role:'triggered',text:'Если урон уменьшил ваши хиты до 0 и не убил мгновенно, вы можете остаться с 1 хитом. Один раз за продолжительный отдых.',effects:[],uses:1,rest:'длинный отдых',rules:{zeroHpReaction:{kind:'stayAtOne',requiresNotInstantDeath:true}}});
active('second wind','Бонусным действием восстановите 1d10 + ваш уровень хитов. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:0,uses:1,rest:'короткий отдых',rolls:[die('heal',1,10,'level')]});
active('action surge','В свой ход получите одно дополнительное действие без затрат действия. Дополнительного бонусного действия не даёт. Один раз за короткий или продолжительный отдых; с 17-го уровня — два, но не более одного за ход.',{cost:'turnfree',rounds:0,uses:'surge-uses',rest:'короткий отдых',oncePerTurn:true,grantAction:1});
active('grappler','Действием попытайтесь схватить противника: ваша Атлетика против Атлетики цели. При победе цель опутана на 1 раунд; при ничьей или проигрыше состояния нет. Требуется Сила 13.',{target:'enemy',rounds:1,contest:{skill:'Атлетика'},effects:[condition('Опутанный')],requiresStrength:13});
active('elemental fury|improved elemental fury','Действием совершите атаку оружием с дополнительным 1d8 урона холодом при попадании. Не более одного раза за ход.',{target:'enemy',weapon:true,rounds:0,oncePerTurn:true,rolls:[die('dmg',1,8,0,'холод')]});
active('tactical mind','Свободным действием получите +1d6 к следующей проверке навыка в течение 1 минуты. Использований — по бонусу мастерства за короткий отдых.',{cost:'free',rounds:10,uses:'prof',rest:'короткий отдых',effects:[fx('check','die','1d6',{consume:'roll'})]});
active('otherworldly presence','Бонусным действием получите преимущество на Запугивание и Убеждение на 10 минут. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:100,uses:1,rest:'короткий отдых',effects:[adv('skill.Запугивание'),adv('skill.Убеждение')]});
active('boon of the night spirit','Бонусным действием станьте невидимым на 1 минуту. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:10,uses:1,rest:'короткий отдых',effects:[condition('Невидимый')]});
active('boon of dimensional travel','Бонусным действием сделайте стремительный шаг: на 1 раунд ваша скорость увеличивается на 9 м, а атаки по вам совершаются с помехой. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:1,uses:1,rest:'короткий отдых',effects:[add('speed',9),fx('incoming.attack','dis',1)]});
active('divine sense|primeval awareness','Действием обострите восприятие: на 1 минуту вы получаете +5 к Внимательности и Проницательности. Использований — по бонусу мастерства за продолжительный отдых.',{rounds:10,uses:'prof',rest:'длинный отдых',effects:[add('skill.Внимательность',5),add('skill.Проницательность',5)]});
active('always prepared','Реакцией приготовьтесь к опасности: получите +2 КД до начала следующего раунда. Использований — по бонусу мастерства за короткий отдых.',{cost:'reaction',rounds:1,uses:'prof',rest:'короткий отдых',effects:[add('ac',2)]});
active('efficient action|rapid augment','Бонусным действием ускорьтесь: на 1 раунд получите +3 м к скорости и +2 КД. Один раз за короткий или продолжительный отдых.',{cost:'bonus',rounds:1,uses:1,rest:'короткий отдых',effects:[add('speed',3),add('ac',2)]});
active('augment|augmentation effects|ranged augment','Действием укрепите снаряжение выбранного союзника. На 10 минут он получает +1 к КД и +1 к атакам оружием. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:100,uses:1,rest:'короткий отдых',effects:[add('ac',1),add('weapon.atk',1)]});
active('augment: absorbing','Действием наделите союзника защитой на 10 минут: сопротивление огню, холоду и электричеству. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:100,uses:1,rest:'короткий отдых',effects:[resist('огонь','холод','электричество')]});
active('full metal','Действием укрепите доспехи союзника: +2 КД на 10 минут. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:100,uses:1,rest:'короткий отдых',effects:[add('ac',2)]});
active('heavy hitter','Действием усилите оружие союзника: +2 к урону оружием на 10 минут. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:100,uses:1,rest:'короткий отдых',effects:[add('weapon.dmg',2)]});
active('juggernaut','Действием укрепите союзника: преимущество на спасброски Силы и +3 м к скорости на 10 минут. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:100,uses:1,rest:'короткий отдых',effects:[adv('save.str'),add('speed',3)]});
active('mystic metal','Действием усилите оружие союзника: +1 к попаданию и +1 к урону на 10 минут. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:100,uses:1,rest:'короткий отдых',effects:[add('weapon.atk',1),add('weapon.dmg',1)]});
active('shard of creation|greater creation|perfect creation','Действием создайте защитный покров для союзника: 2d8 + ваш уровень временных хитов. Они не складываются с другими временными хитами. Один раз за короткий или продолжительный отдых.',{target:'ally',rounds:0,uses:1,rest:'короткий отдых',rolls:[die('temp',2,8,'level')]});
active('wild shape','Бонусным действием примите боевой звериный облик на 10 минут: Сила 18, скорость 12 м, преимущество на Атлетику и +2 к безоружному урону. Обычные хиты сохраняются. Два раза за короткий или продолжительный отдых.',{cost:'bonus',rounds:100,uses:2,rest:'короткий отдых',effects:[fx('ab.str','min',18),fx('speed','min',12),adv('skill.Атлетика'),add('unarmed.dmg',2)]});
active('wild companion|dragon companion','Действием призовите духа-помощника на 1 минуту. Его помощь даёт вам преимущество на атаки и Внимательность. Один раз за короткий или продолжительный отдых.',{rounds:10,uses:1,rest:'короткий отдых',effects:[adv('attack'),adv('skill.Внимательность')]});
active('faithful steed','Действием призовите призрачного скакуна на 10 минут: скорость ходьбы 18 м. Один раз за продолжительный отдых.',{rounds:100,uses:1,rest:'длинный отдых',effects:[fx('speed','set',18)]});
active('uncanny metabolism','Бонусным действием восстановите 2d8 + ваш уровень хитов. Один раз за продолжительный отдых.',{cost:'bonus',rounds:0,uses:1,rest:'длинный отдых',rolls:[die('heal',2,8,'level')]});
active('giant ancestry','Бонусным действием призовите силу великанов: +2 к урону оружием и преимущество на Атлетику в течение 1 минуты. Использований — по бонусу мастерства за продолжительный отдых.',{cost:'bonus',rounds:10,uses:'prof',rest:'длинный отдых',effects:[add('weapon.dmg',2),adv('skill.Атлетика')]});
passive('elven lineage','Вы видите в темноте на 18 м и владеете Внимательностью.',[fx('vision.dark','min',18),...skillGrant(['Внимательность'])]);
passive('gnomish lineage','Вы видите в темноте на 18 м и владеете Магией.',[fx('vision.dark','min',18),...skillGrant(['Магия'])]);
passive('use magic device','Вы владеете Магией с удвоенным бонусом мастерства; ваши атаки заклинаниями получают +1.',[...skillGrant(['Магия'],2),add('spell.atk',1)]);
passive('archdruid|beast spells','Вы получаете +1 к Сл заклинаний и преимущество на спасброски для сохранения концентрации.',[add('spell.dc',1)],{concentrationAdvantage:true});
passive('supreme healing','Любое лечение, которое вы получаете, использует максимальные значения костей.',[fx('healing.maximize.incoming','set',1)]);
for(const [keys,pool,amount] of [
 ['font of inspiration|superior inspiration','bardic',1],['perfect self|perfect focus','ki',4],['sorcerous restoration','sorcery',4],['wild resurgence','wild-shape',1]
])active(keys,'Действием восстановите '+amount+' использований связанного запаса сил, не превышая максимум. Один раз за продолжительный отдых.',{rounds:0,uses:1,rest:'длинный отдых',restore:{pool,amount}});
for(const keys of ['natural recovery|arcane recovery','eldritch master|magic cunning','boon of spell recall|signature spells|spell mastery'])active(keys,'Действием восстановите одну потраченную ячейку 1-го круга или 2 очка магии. Один раз за продолжительный отдых.',{rounds:0,uses:1,rest:'длинный отдых',restore:{magic:true,level:1,amount:1}});
const subclassKeys='primal path|barbarian subclass|bard college|bard subclass|divine domain|cleric subclasses|druid circle|druid subclass|martial archetype|fighter subclass|monastic tradition|monk subclass|sacred oath|paladin subclass|ranger archetype|ranger subclass|roguish archetype|rogue subclass|sorcerous origin|sorcerer subclass|otherworldly patron|warlock subclass|arcane tradition|wizard subclass';
choice('mechanist subclass','Выберите область своей специализации: Магия или Расследование. Вы владеете выбранным навыком с удвоенным бонусом мастерства.','skill',['Магия','Расследование'],[fx('proficiency.skill','grant',{name:'$skill',rank:2})]);
define(subclassKeys,{role:'passive',text:'Выберите специализацию своего класса в развитии персонажа. Она определяет дополнительные владения, заклинания и способности по мере получения уровней.',binding:'subclass',effects:[]});
define('spellcasting|pact magic|spells known|slot level|cantrips known|bard spell list|cleric spell list|druid spell list|paladin spell list|ranger spell list|sorcerer spell list|warlock spell list|wizard spell list',{role:'passive',text:'Выбирайте доступные вашему классу и уровню заклинания в книге героя. Там же указаны круги, запас магии и подготовленные заклинания. Фокусы не расходуют ячейки.',binding:'spellbook',effects:[]});
define('circle spells|circle of the land spells|life domain spells|oath spells|oath of devotion spells|expanded spell list|fiend spells|draconic spells',{role:'passive',text:'Заклинания вашей специализации доступны в книге героя. При повышении уровня открываются новые круги; постоянно подготовленные заклинания не занимают обычные места подготовки.',binding:'spellbook',effects:[]});
for(const keys of ['cantrip|bonus cantrip|magic initiate','magical secrets|additional magical secrets|magical discoveries|memorize spell','eldritch invocations|invocations known|pact boon|mystic arcanum','ritual adept|words of creation|contact patron'])define(keys,{role:'passive',text:'Выберите дополнительный фокус в книге героя. Он всегда доступен, не занимает места среди обычных известных фокусов и не расходует запас магии.',binding:'cantrip',effects:[]});
define('age',{role:'passive',text:'Укажите возраст героя. Он хранится в биографии и сам по себе не изменяет характеристики.',binding:'age',effects:[]});
define('alignment|tenets of devotion',{role:'passive',text:'Выберите убеждения героя. Они описывают его поступки и хранятся в биографии.',binding:'alignment',effects:[]});
choice('size','Выберите размер героя. Он учитывается при захватах и ограничениях по размеру цели.','size',['Маленький','Средний','Большой'],[],{binding:'size'});
passive('speed','Ваша базовая скорость ходьбы составляет не менее 9 м.',[fx('speed','min',9)]);
passive('tinker','Вы владеете инструментами жестянщика и получаете преимущество на Расследование.',[fx('proficiency.tool','grant','Инструменты жестянщика'),adv('skill.Расследование')]);
passive('relentless hunter','Вы совершаете с преимуществом спасброски для сохранения концентрации.',[],{concentrationAdvantage:true});
passive('id:ab_sx_pickpocket','Вы владеете Ловкостью рук с удвоенным бонусом мастерства и совершаете проверки этого навыка с преимуществом.',[...skillGrant(['Ловкость рук'],2),adv('skill.Ловкость рук')]);
active('id:ab_sx_agility','Бонусным действием удвойте скорость и получите преимущество на Скрытность на 1 раунд.',{cost:'bonus',rounds:1,effects:[fx('speed','mul',2),adv('skill.Скрытность')]});
passive('id:ab_sx_charisma','Вы совершаете с преимуществом проверки Харизмы: Обман, Запугивание, Выступление и Убеждение.',[adv('check.cha'),...['Обман','Запугивание','Выступление','Убеждение'].map(s=>adv('skill.'+s))]);
passive('id:ab_sx_sleight','Вы владеете Ловкостью рук и воровскими инструментами.',[...skillGrant(['Ловкость рук']),fx('proficiency.tool','grant','Воровские инструменты')]);
passive('id:ab_sx_seasoned','Вы получаете +5 к инициативе.',[add('init',5)]);
passive('id:ab_sx_deadeye','Вы получаете +2 к попаданию атаками дальнобойным оружием.',[],{rangedAttackBonus:2});
passive('id:ab_sx_prothief','При проверках Ловкости, Акробатики, Ловкости рук и Скрытности результат d20 ниже 12 считается равным 12. Вы владеете воровским жаргоном.',langGrant(['Воровской жаргон']),{naturalFloor:{attribute:'dex',value:12}});
passive('id:ab_sx_movement','Ваша скорость лазания равна скорости ходьбы. Вы совершаете с преимуществом Атлетику при прыжках.',[fx('speed.climb','set','равна скорости ходьбы'),fx('skill.Атлетика','adv',1,{context:{anyTags:['jump']}})]);
active('id:ab_sx_shapechange','Действием примите выбранный гуманоидный облик на 1 час. В этом облике вы совершаете с преимуществом проверки Обмана; характеристики и снаряжение не меняются. Эффект можно закончить досрочно.',{rounds:600,choices:[{field:'guise',options:['Путешественник','Горожанин','Дворянин']}],effects:[adv('skill.Обман'),fx('appearance','text','$guise')]});
active('id:ab_sx_traps','Действием бросьте капкан под ноги противнику. При провале спасброска Ловкости Сл 13 он получает 1d6 колющего урона и сбит с ног на 1 раунд. При успехе капкан не причиняет вреда. Три раза за короткий или продолжительный отдых.',{target:'enemy',save:sr('dex',13),rounds:1,uses:3,rest:'короткий отдых',rolls:[die('dmg',1,6,0,'колющий')],effects:[condition('Сбитый с ног')]});
define('id:ab_wiz_armor',{role:'passive',text:'Эта подготовка не даёт владения доспехами и щитами. Ношение защиты без соответствующего владения мешает атакам, проверкам и сотворению заклинаний.',effects:[],proficiencies:{armor:{light:false,medium:false,heavy:false,shield:false}}});
define('id:ab_wiz_weapons',{role:'passive',text:'Вы владеете кинжалами, дротиками, пращами, боевыми посохами и лёгкими арбалетами.',effects:[],proficiencies:{weapons:{names:['кинжал','дротик','праща','боевой посох','легкий арбалет']}}});
choice('id:ab_life_weapons','Вы владеете простым оружием и боевыми молотами. Выберите Мудрость или Телосложение: выбранная характеристика увеличивается на 1, но не выше 20.','attribute',['wis','con'],[fx('$attribute','add',1)],{choiceLabels:abilities,rules:{selectedAbilityCap:20},proficiencies:{weapons:{simple:true,names:['боевой молот']}}});
choice('id:ab_человек_дополнительный_язык_на_выбор|id:ab_полуэльф_дополнительный_язык','Выберите дополнительный язык: вы умеете говорить, читать и писать на нём.','language',languages,[fx('proficiency.language','grant','$language')]);
choice('id:ab_полуэльф_владение_двумя_навыками_на_выбор','Выберите два разных навыка, которыми будете владеть.','skill',skills,[fx('proficiency.skill','grant',{name:'$skill',rank:1}),fx('proficiency.skill','grant',{name:'$skill2',rank:1})],{choices:[{field:'skill',options:skills},{field:'skill2',options:skills,defaultIndex:1}]});
choice('id:ab_чейнджлинг_инстинкты_чейнджлинга','Выберите два разных навыка из Обмана, Проницательности, Запугивания и Убеждения. Вы владеете обоими навыками.','skill',[],[fx('proficiency.skill','grant',{name:'$skill',rank:1}),fx('proficiency.skill','grant',{name:'$skill2',rank:1})],{choices:[{field:'skill',options:['Обман','Проницательность','Запугивание','Убеждение']},{field:'skill2',options:['Обман','Проницательность','Запугивание','Убеждение'],defaultIndex:1}]});
choice('id:ab_чейнджлинг_языки','Вы владеете Общим и двумя дополнительными языками на выбор. Выберите два разных языка.','language',[],[...langGrant(['Общий']),fx('proficiency.language','grant','$language'),fx('proficiency.language','grant','$language2')],{choices:[{field:'language',options:languages.slice(1)},{field:'language2',options:languages.slice(1),defaultIndex:1}]});
choice('id:ab_человек_универсальность_и_быстрая_обучаемость','Выберите навык, которым будете владеть.','skill',skills,[fx('proficiency.skill','grant',{name:'$skill',rank:1})]);
choice('id:ab_драконорожденный_сопротивление_урону_стихии_предка','Выберите стихию предка. Вы сопротивляетесь урону выбранного типа.','element',elements,[fx('damage.rule','grant',{mode:'resist',types:['$element'],when:''})]);
passive('id:ab_дварф_владение_боевыми_топорами_ручными_топорами_молотами','Вы владеете боевыми топорами, ручными топорами, лёгкими и боевыми молотами.',[],{weaponNames:['боевой топор','ручной топор','легкий молот','боевой молот']});
for(const [id,text,effects] of [
 ['ab_garasel_linguist','Вы владеете гоблинским, орочьим и дварфским языками.',langGrant(['Гоблинский','Орочий','Дварфский'])],
 ['ab_lg_dwarvish','Вы свободно владеете дварфским и получаете +2 к проверкам Истории.',[...langGrant(['Дварфский']),add('skill.История',2)]],
 ['ab_lg_dwarfdiplomacy','Вы совершаете с преимуществом проверки Убеждения при разговоре с дварфами.',[fx('skill.Убеждение','adv',1,{context:{anyTags:['dwarf']}})]],
 ['ab_lg_privilege','Ваше положение помогает в переговорах: вы получаете +2 к Убеждению.',[add('skill.Убеждение',2)]],
 ['ab_oghma_refuge','Поддержка веры укрепляет вас: вы владеете Религией и получаете +1 к спасброскам Мудрости.',[...skillGrant(['Религия']),add('save.wis',1)]],
 ['ab_shelter_faithful','Вы владеете Религией и получаете +2 к проверкам Медицины.',[...skillGrant(['Религия']),add('skill.Медицина',2)]],
 ['ab_neverwinter_caster','Вы получаете +1 к атакам заклинаниями и Сл заклинаний.',[add('spell.atk',1),add('spell.dc',1)]]
])passive('id:'+id,text,effects);
for(const id of ['ab_alignment_cg','ab_alignment_lg','ab_sx_align','ab_lg_align'])define('id:'+id,{role:'passive',text:'Убеждения героя описывают его поступки и хранятся в биографии.',binding:'alignment',effects:[]});

// Resource providers may themselves be usable actions.
profiles.get('bardic inspiration').pool='bardic';profiles.get('wild shape').pool='wild-shape';
for(const [id,key] of [['ab_dwarf_resilience','dwarven resilience'],['ab_dwarf_toughness','dwarven toughness']])profiles.set('id:'+id,profiles.get(key));
for(const p of profiles.values()){
 p.effects=(p.effects||[]).map(f=>f.stat==='condition.immune'?{...f,stat:'condition.immunity'}:f);
 if(p.rules?.weaponNames)p.proficiencies={weapons:{names:p.rules.weaponNames}};
}

function identity(ab){return root.DND_ABILITY_RULES?.identity(ab)||ab.open5e?.originalName||'';}
function keyOf(ab){let key=String(identity(ab)).toLowerCase().replace(/[’‘]/g,"'").trim();key=({'unarmoed movement':'unarmored movement','life domain spells (table)':'life domain spells','luck':'lucky','fiendish legacy':'infernal legacy'})[key]||key;return key==='lucky'?key+':'+ab.type:key;}
function profile(ab){if(!ab||ab.abilityReview?.custom)return null;return profiles.get('id:'+ab.id)||(!ab.custom?profiles.get(keyOf(ab)):null)||null;}
function value(v,c,choices){
 const level=Math.max(1,+c?.level||1),prof=2+Math.floor((level-1)/4),mod=key=>Math.floor(((+c?.ab?.[key]||10)-10)/2);
 if(v==='level')return level;if(v==='prof')return prof;if(v==='cha-min1')return Math.max(1,mod('cha'));if(v==='monk-speed')return level>=18?9:level>=10?6:3;if(v==='surge-uses')return level>=17?2:1;
 if(typeof v==='string'&&v[0]==='$')return choices[v.slice(1)];
 if(Array.isArray(v))return v.map(x=>value(x,c,choices));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,value(x,c,choices)]));
 return v;
}
function selections(ab,entry,c){const p=profile(ab),out={};for(const choice of p?.choices||[])out[choice.field]=choice.options.includes(entry?.choices?.[choice.field])?entry.choices[choice.field]:choice.options[choice.defaultIndex||0];
 if(c?.characterBuild&&c.race==='Драконорожденный'&&['draconic ancestry','draconic ancestry table','id:ab_драконорожденный_сопротивление_урону_стихии_предка'].includes(p?.key)){const ancestry=root.DndCharacterRules?.ancestry?.find(row=>row[0]===c.ancestry);if(ancestry)out.element=ancestry[1];}
 return out;}
function effects(ab,c,entry){const p=profile(ab);if(!p)return null;const selected=selections(ab,entry,c),effects=value(p.effects||[],c,selected);
 if(p.styleChoice)effects.push(...({'Защита':[add('ac',1)],'Стрельба':[fx('ability.ranged-attack','add',2)],'Дуэлянт':[add('weapon.dmg',2)],'Бой без оружия':[add('unarmed.dmg',2)]}[selected.style]||[]));
 if(p.orderChoice)effects.push(...(selected.order==='Мудрец'?skillGrant(['Магия'],2):[add('ac',1)]));
 return effects.map(f=>{
 if(Object.keys(abilities).includes(f.stat))f.stat='ab.'+f.stat;
 const key=f.stat.slice(3),cap=p.rules?.abilityCaps?.[key]||(selected.attribute===key?p.rules?.selectedAbilityCap:0);
 if(f.stat.startsWith('ab.')&&cap&&f.mode==='add')f.value=Math.max(0,Math.min(f.value,cap-(+c?.ab?.[key]||10)));
 return f;
});}
root.DND_ABILITY_GAMEPLAY={revision,profiles,profile,keyOf,selections,effects,value,skills,languages,abilities};
if(typeof module==='object'&&module.exports)module.exports=root.DND_ABILITY_GAMEPLAY;
})(globalThis);
