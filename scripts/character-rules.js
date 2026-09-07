(function (root) {
'use strict';
// D&D 5e 2014. Pure rules shared by the sheet, creator and engine.
const keys = ['str','dex','con','int','wis','cha'];
const clone = value => JSON.parse(JSON.stringify(value));
const mod = value => Math.floor((value - 10) / 2);
const unique = values => [...new Set(values)];
const subclassLevels = {Варвар:3,Бард:3,Воин:3,Волшебник:2,Друид:2,Жрец:1,Колдун:1,Монах:3,Паладин:3,Плут:3,Следопыт:3,Чародей:1};
const aliases = {'Воин|Мастер боевых искусств':'Боевой мастер'};
const races = {
  Человек:{ab:{str:1,dex:1,con:1,int:1,wis:1,cha:1},speed:9,languages:['Общий'],languageChoices:1},
  Эльф:{ab:{dex:2},speed:9,languages:['Общий','Эльфийский'],skills:['Внимательность'],darkvision:18},
  Дварф:{ab:{con:2},speed:7.5,languages:['Общий','Дварфийский'],darkvision:18,resist:['яд'],weapons:['боевой топор','ручной топор','легкий молот','боевой молот'],toolChoices:[['Инструменты кузнеца','Инструменты пивовара','Инструменты каменщика']]},
  Полурослик:{ab:{dex:2},speed:7.5,size:'Маленький',languages:['Общий','Полуросличий']},
  Гном:{ab:{int:2},speed:7.5,size:'Маленький',languages:['Общий','Гномий'],darkvision:18},
  Полуэльф:{ab:{cha:2},abilityChoices:2,exclude:['cha'],speed:9,languages:['Общий','Эльфийский'],languageChoices:1,skillChoices:2,darkvision:18},
  Полуорк:{ab:{str:2,con:1},speed:9,languages:['Общий','Орочий'],skills:['Запугивание'],darkvision:18},
  Тифлинг:{ab:{cha:2,int:1},speed:9,languages:['Общий','Инфернальный'],resist:['огонь'],darkvision:18},
  Драконорожденный:{ab:{str:2,cha:1},speed:9,languages:['Общий','Драконий']}
};
const branches = {
  'Человек|Вариант человека':{replaceAb:true,ab:{},abilityChoices:2,skillChoices:1,featChoices:1},
  'Эльф|Высший эльф':{ab:{int:1},languageChoices:1,weapons:['длинный меч','короткий меч','короткий лук','длинный лук']},
  'Эльф|Лесной эльф':{ab:{wis:1},speed:10.5,weapons:['длинный меч','короткий меч','короткий лук','длинный лук']},
  'Эльф|Темный эльф (дроу)':{ab:{cha:1},darkvision:36,weapons:['рапира','короткий меч','ручной арбалет']},
  'Дварф|Горный дварф':{ab:{str:2},armor:{light:true,medium:true}},
  'Дварф|Холмовой дварф':{ab:{wis:1},hpPerLevel:1},
  'Полурослик|Легконогий':{ab:{cha:1}},
  'Полурослик|Коренастый':{ab:{con:1},resist:['яд']},
  'Гном|Лесной гном':{ab:{dex:1}},
  'Гном|Скальный гном':{ab:{con:1},tools:['Инструменты жестянщика']}
};
const ancestry = [
  ['Черный','кислота'],['Синий','электричество'],['Латунный','огонь'],['Бронзовый','электричество'],['Медный','кислота'],
  ['Золотой','огонь'],['Зеленый','яд'],['Красный','огонь'],['Серебряный','холод'],['Белый','холод']
];
const instruments=['Волынка','Барабан','Дульцимер','Флейта','Лютня','Лира','Рожок','Свирель','Виола','Шалмей'];
const games=['Игральные кости','Драконьи шахматы','Карты','Ставка трех драконов'];
const artisan=['Инструменты алхимика','Инструменты пивовара','Инструменты каллиграфа','Инструменты плотника','Инструменты картографа','Инструменты сапожника','Инструменты повара','Инструменты стеклодува','Инструменты ювелира','Инструменты кожевника','Инструменты каменщика','Инструменты художника','Инструменты гончара','Инструменты кузнеца','Инструменты жестянщика','Инструменты ткача','Инструменты резчика по дереву'];
const languages=['Общий','Дварфийский','Эльфийский','Великаний','Гномий','Гоблинский','Полуросличий','Орочий','Бездны','Небесный','Драконий','Глубинная речь','Инфернальный','Первичный','Сильван','Подземный'];
const extraBackgrounds = [
  {n:'Шарлатан',sk:'Обман, Ловкость рук',ex:'Набор для маскировки, набор для подделки документов',f:'Вторая личность: документы и знакомые для вымышленного образа.',tools:['Набор для маскировки','Набор для подделки документов']},
  {n:'Гладиатор',base:'Артист',f:'Артист арены: находите место для зрелищных выступлений.'},
  {n:'Рыцарь',base:'Благородный',f:'Слуги: трое помощников сопровождают вас; они не участвуют в сражениях.'},
  {n:'Пират',base:'Моряк',f:'Дурная репутация: окружающие опасаются открыто жаловаться на ваши проступки.'},
  {n:'Шпион',base:'Преступник',f:'Тайный связной: сеть контактов для передачи и получения сведений.'},
  {n:'Гильдейский торговец',base:'Гильдейский ремесленник',ex:'Навигационные инструменты или дополнительный язык; 1 язык',toolChoices:[['Навигационные инструменты','Дополнительный язык']],languageChoices:1},
  {n:'Городской стражник',sk:'Атлетика, Проницательность',ex:'2 языка',f:'Знание города: находите посты стражи и местные очаги преступности.',languageChoices:2},
  {n:'Следователь',base:'Городской стражник',sk:'Анализ, Проницательность',f:'Знание города: опыт расследований и работы с городской стражей.'},
  {n:'Придворный',sk:'Проницательность, Убеждение',ex:'2 языка',f:'Придворный служащий: понимаете устройство двора и находите нужного чиновника.',languageChoices:2},
  {n:'Далекий путешественник',sk:'Проницательность, Внимательность',ex:'Музыкальный инструмент или игровой набор, 1 язык',f:'Всеобщее внимание: ваше далекое происхождение открывает двери любопытствующих.',toolChoices:[[...instruments,...games]],languageChoices:1},
  {n:'Наемник-ветеран',sk:'Атлетика, Убеждение',ex:'Один игровой набор, наземный транспорт',f:'Жизнь наемника: находите знакомые отряды и предложения работы.',tools:['Наземный транспорт'],toolChoices:[games]},
  {n:'Ученик монастыря',sk:'История; один из: Магия, Природа, Религия',ex:'2 языка',f:'Доступ к библиотеке: пользуетесь знаниями и помощью своего монастыря.',skills:['История'],skillChoices:1,skillOptions:['Магия','Природа','Религия'],languageChoices:2}
];
const backgroundTraining = {
  Аколит:{languageChoices:2},Артист:{tools:['Набор для маскировки'],toolChoices:[instruments]},Беспризорник:{tools:['Набор для маскировки','Воровские инструменты']},
  Благородный:{toolChoices:[games],languageChoices:1},'Гильдейский ремесленник':{toolChoices:[artisan],languageChoices:1},
  Моряк:{tools:['Навигационные инструменты','Водный транспорт']},Мудрец:{languageChoices:2},'Народный герой':{toolChoices:[artisan],tools:['Наземный транспорт']},
  Отшельник:{tools:['Набор травника'],languageChoices:1},Преступник:{tools:['Воровские инструменты'],toolChoices:[games]},
  Солдат:{tools:['Наземный транспорт'],toolChoices:[games]},Чужеземец:{toolChoices:[instruments],languageChoices:1}
};
// Original, deliberately non-biographical descriptions: no named people, places or events.
const backgroundNarratives = {
  Аколит:['Опыт духовных традиций помогает понимать обряды, символы и жизнь общины. Такая подготовка может стать опорой для служения, исследования верований или самостоятельного поиска смысла; она не определяет божество, убеждения или класс героя.',['Применить знание традиций для помощи другим','Разобраться в духовном противоречии'],['Инструменты каллиграфа','Набор травника']],
  Артист:['Навыки выразительности и работы с аудиторией помогают передавать идеи и чувствовать настроение окружающих. Форма выступлений, отношение к славе и причины освоения этого искусства остаются личным выбором героя.',['Выразить важную идею через искусство','Найти общий язык с непривычной аудиторией'],['Лютня','Флейта','Виола']],
  Беспризорник:['Практическая самостоятельность и понимание неформальной жизни поселений помогают замечать скрытые возможности и обходиться ограниченными средствами. Эта предыстория задаёт способ ориентироваться в мире, не устанавливая семейные обстоятельства или конкретные переживания.',['Помочь тому, кого обычно не замечают','Найти выход при нехватке средств'],['Инструменты картографа','Набор для подделки документов']],
  Благородный:['Знакомство с этикетом, общественными обязательствами и устройством влиятельных кругов помогает вести переговоры и понимать статусные отношения. Происхождение титула, достаток, связи и отношение к привилегиям определяются отдельно.',['Ответственно распорядиться общественным влиянием','Разрешить конфликт обязательств'],['Драконьи шахматы','Инструменты каллиграфа']],
  'Гильдейский ремесленник':['Профессиональная подготовка сочетает практическое мастерство с пониманием качества, договорённостей и взаимопомощи специалистов. Ремесло, организация и личное отношение к её правилам могут быть любыми.',['Создать полезную вещь или улучшить работу','Защитить профессиональную добросовестность'],artisan],
  Моряк:['Понимание судового быта, навигации и совместной работы помогает действовать в изменчивой обстановке. Тип судна, характер плаваний и отношение к морю не заданы и могут быть раскрыты в личной биографии.',['Преодолеть трудность благодаря слаженной работе','Найти безопасный путь в сложных условиях'],['Инструменты плотника','Инструменты картографа']],
  Мудрец:['Привычка исследовать, сопоставлять сведения и искать надёжные источники превращает неизвестное в предмет последовательного изучения. Область знаний и способ обучения не ограничены определённой школой, местом или наставником.',['Проверить сомнительное знание','Сделать полезное открытие доступным другим'],['Инструменты каллиграфа','Инструменты алхимика']],
  'Народный герой':['Практические умения и понимание повседневных нужд помогают находить общий язык с обычными людьми. Основа этой предыстории — возможность действовать ради сообщества; конкретные заслуги, известность и мотивы остаются за игроком.',['Защитить повседневные интересы людей','Вдохновить других на совместное дело'],['Инструменты плотника','Инструменты каменщика']],
  Отшельник:['Сосредоточенность, наблюдательность и привычка к самостоятельным размышлениям помогают замечать закономерности, которые теряются в суете. Степень уединения, его причины и сделанные выводы не предопределены.',['Проверить важный вывод на практике','Поделиться пониманием, сохранив самостоятельность'],['Инструменты алхимика','Инструменты каллиграфа']],
  Преступник:['Знание скрытых договорённостей, обходных путей и неофициальных связей помогает понимать деятельность за пределами установленных правил. Предыстория не задаёт конкретного преступления, нравственных убеждений или нынешнего отношения героя к закону.',['Разобраться в скрытой системе интересов','Сделать осознанный выбор между выгодой и обязательством'],['Набор для маскировки','Набор для подделки документов']],
  Солдат:['Военная подготовка даёт понимание дисциплины, распределения задач и действий под давлением. Она может проявляться в организации, защите и оценке угроз, не определяя армию, звание, участие в войнах или убеждения героя.',['Поддержать товарищей в трудной ситуации','Применить дисциплину без потери самостоятельности'],['Инструменты кузнеца','Игральные кости']],
  Чужеземец:['Практическое понимание дикой местности помогает ориентироваться, замечать природные признаки и заботиться о необходимых ресурсах. Образ жизни и отношение к поселениям остаются открытыми для личной истории.',['Прочитать природные признаки и помочь группе','Найти равновесие между нуждой и бережным отношением к среде'],['Набор травника','Инструменты резчика по дереву']],
  Шарлатан:['Умение управлять впечатлением и замечать ожидания окружающих помогает распознавать уловки и создавать убедительные образы. Маски, цели и границы допустимого определяет игрок; конкретные обманы не приписываются герою.',['Разоблачить вводящее в заблуждение впечатление','Осознанно распорядиться доверием'],['Карты','Инструменты каллиграфа']],
  Гладиатор:['Подготовка к зрелищному состязанию соединяет выразительность, выдержку и понимание реакции публики. Вид выступлений, их добровольность и отношение к соперничеству раскрываются отдельно.',['Проявить мастерство в честном состязании','Сохранить достоинство под давлением ожиданий'],['Виола','Барабан']],
  Рыцарь:['Рыцарская традиция связывает общественное положение с ответственностью, правилами поведения и заботой о доверенных людях. Содержание кодекса, наличие титула и отношение к долгу не закреплены заранее.',['Выполнить обязательство ценой трудного выбора','Ответственно защитить доверенных людей'],['Драконьи шахматы','Инструменты кузнеца']],
  Пират:['Знакомство с рискованной морской жизнью и неформальными правилами команды помогает оценивать свободу, репутацию и последствия решений. Конкретные набеги, преступления и нынешний образ жизни не устанавливаются этой предысторией.',['Разрешить противоречие между свободой и интересами команды','Ответить за последствия рискованного решения'],['Инструменты плотника','Карты']],
  Шпион:['Внимание к деталям, сдержанность и работа с закрытой информацией помогают различать заявления и действительные намерения. Организация, преданность и цели разведки определяются личной историей.',['Проверить важное скрытое сведение','Сделать ответственный выбор при обращении с тайной'],['Набор для маскировки','Набор для подделки документов']],
  'Гильдейский торговец':['Понимание обмена, качества товаров и деловых отношений помогает согласовывать интересы и оценивать обещания. Масштаб торговли, организация и накопленное состояние остаются свободными деталями биографии.',['Заключить взаимовыгодную договорённость','Разобраться в споре о качестве или обязательствах'],['Инструменты картографа','Инструменты ювелира']],
  'Городской стражник':['Знание порядка, городских служб и повседневных угроз помогает ориентироваться в жизни поселений и действовать при происшествиях. Место службы, звание и отношение к власти не предписаны.',['Предотвратить опасность для окружающих','Совместить порядок с вниманием к обстоятельствам'],['Инструменты кузнеца','Инструменты картографа']],
  Следователь:['Привычка проверять версии, замечать несоответствия и сопоставлять свидетельства помогает восстанавливать картину событий. Предыстория задаёт подход к поиску истины, оставляя конкретные дела и методы личным выбором.',['Проверить версию, способную оказаться ошибочной','Найти существенную связь между разрозненными сведениями'],['Набор для подделки документов','Инструменты каллиграфа']],
  Придворный:['Понимание процедур, негласных норм и распределения влияния помогает находить нужный способ обращения и согласовывать интересы. Двор, должность и личные связи не определяются заранее.',['Провести полезное решение через сложную систему отношений','Сохранить доверие при столкновении интересов'],['Инструменты каллиграфа','Драконьи шахматы']],
  'Далекий путешественник':['Открытость к непривычным обычаям и умение сопоставлять культурные подходы помогают учиться у различий и объяснять собственную точку зрения. Родина, маршрут и причины путешествий остаются неназванными.',['Понять незнакомый обычай без поспешного суждения','Помочь людям преодолеть культурное недопонимание'],['Инструменты картографа','Флейта']],
  'Наемник-ветеран':['Профессиональная оценка риска, условий найма и возможностей команды помогает принимать взвешенные решения в опасных делах. Предыстория не устанавливает работодателя, боевые заслуги или отношение героя к применению силы.',['Выполнить справедливое профессиональное обязательство','Найти решение, сохраняющее людей и ресурсы'],['Инструменты кузнеца','Драконьи шахматы']],
  'Ученик монастыря':['Методичное обучение, обращение с письменными источниками и привычка обсуждать знания помогают превращать любопытство в понимание. Учреждение, предмет изучения и степень религиозности не заданы.',['Найти надёжный источник для важного вопроса','Применить изученное вне привычной среды'],['Инструменты каллиграфа','Инструменты картографа']]
};
function backgroundProfile(bg){const row=backgroundNarratives[bg?.n];return bg&&row?{version:1,name:bg.n,description:row[0],feature:bg.f,source:bg.source,goals:row[1].slice(),suggestedTools:row[2].filter(t=>allTools.includes(t))}:null;}
const allTools=unique([...artisan,...instruments,...games,'Воровские инструменты','Навигационные инструменты','Набор для маскировки','Набор для подделки документов','Набор травника','Инструменты отравителя','Наземный транспорт','Водный транспорт']);
function backgroundState(c){return c.backgroundDevelopment||{version:1,revision:0,projects:[],events:[]};}
function backgroundEarned(c){const projects=backgroundState(c).projects||[];return {tools:unique(projects.filter(p=>p.status==='complete'&&p.kind==='tool').map(p=>p.value)),languages:unique(projects.filter(p=>p.status==='complete'&&p.kind==='language').map(p=>p.value))};}
function backgroundPlan(c,request,context){
  const fail=reason=>({ok:false,reason}),s=backgroundState(c),r=request||{},profile=context.profile;
  if(!profile)return fail('Сначала выберите предысторию из каталога.');
  if(typeof r.requestId!=='string'||!r.requestId.trim()||r.requestId.length>160)return fail('Нет идентификатора действия.');
  const fingerprint=JSON.stringify([r.type,r.expectedRevision,r.kind,r.value,r.mentor,r.projectId,r.days,r.startDay,r.goal,r.session,r.note,r.awardInspiration,r.masterConfirmed]);
  const previous=s.events.find(e=>e.requestId===r.requestId);
  if(previous)return previous.fingerprint===fingerprint?{ok:true,replayed:true,event:clone(previous)}:fail('Идентификатор уже использован для другого действия.');
  if(r.masterConfirmed!==true)return fail('Мастер должен подтвердить выполненные условия.');
  if(r.expectedRevision!==s.revision)return fail('Записи развития изменились. Обновите лист.');
  if(context.inCombat)return fail('Развитие предыстории оформляется вне активного боя.');
  const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
  const next=clone(s),event={requestId:r.requestId,fingerprint,type:r.type,background:profile.name,at:context.at,actorId:c.id,revision:s.revision+1};
  let costCp=0,inspiration=false;
  if(r.type==='milestone'){
    if(!Number.isInteger(r.goal)||!profile.goals[r.goal])return fail('Выберите направление предыстории.');
    if(!text(r.session,120)||!text(r.note,2000))return fail('Укажите сессию или событие и совершённый поступок.');
    if(s.events.some(e=>e.type==='milestone'&&e.background===profile.name&&e.goal===r.goal&&e.session===r.session.trim()))return fail('Этот этап уже записан для указанной сессии или события.');
    if(r.awardInspiration===true&&c.inspiration)return fail('Вдохновение уже есть: оно не накапливается. Можно записать поступок без награды.');
    inspiration=r.awardInspiration===true;Object.assign(event,{goal:r.goal,goalText:profile.goals[r.goal],session:r.session.trim(),note:r.note.trim(),inspiration});
  }else if(r.type==='start-training'){
    if(!context.actorAllowed)return fail(context.actorReason||'Герой сейчас не может обучаться.');
    if(next.projects.some(p=>p.status==='active'))return fail('Сначала завершите или прекратите текущее обучение.');
    const allowed=r.kind==='tool'?allTools:r.kind==='language'?languages:[];
    if(!allowed.includes(r.value))return fail('Выберите существующий инструмент или язык.');
    if((r.kind==='tool'?context.tools:context.languages).includes(r.value))return fail('Это владение уже получено.');
    if(!text(r.mentor,200))return fail('Укажите подтверждённого наставника.');
    const project={id:r.requestId,background:profile.name,kind:r.kind,value:r.value,mentor:r.mentor.trim(),days:0,requiredDays:250,costPerDayCp:100,status:'active'};
    next.projects.push(project);Object.assign(event,{projectId:project.id,value:project.value,mentor:project.mentor});
  }else if(r.type==='train'){
    if(!context.actorAllowed)return fail(context.actorReason||'Герой сейчас не может обучаться.');
    const project=next.projects.find(p=>p.id===r.projectId&&p.status==='active');
    if(!project)return fail('Активное обучение не найдено.');
    if(!Number.isSafeInteger(r.days)||r.days<1||r.days>project.requiredDays-project.days)return fail('Число дней должно быть целым и не превышать остаток обучения.');
    if(!Number.isSafeInteger(r.startDay)||r.startDay<1||!Number.isSafeInteger(r.startDay+r.days))return fail('Укажите целый начальный день простоя.');
    const endDay=r.startDay+r.days-1;
    if(s.events.some(e=>e.type==='train'&&r.startDay<=e.endDay&&endDay>=e.startDay))return fail('Дни этого периода уже учтены в обучении героя.');
    costCp=r.days*project.costPerDayCp;project.days+=r.days;if(project.days===project.requiredDays)project.status='complete';
    Object.assign(event,{projectId:project.id,value:project.value,kind:project.kind,days:r.days,startDay:r.startDay,endDay,costCp,completed:project.status==='complete'});
  }else if(r.type==='abandon-training'){
    const project=next.projects.find(p=>p.id===r.projectId&&p.status==='active');if(!project)return fail('Активное обучение не найдено.');
    project.status='abandoned';Object.assign(event,{projectId:project.id,value:project.value,days:project.days});
  }else return fail('Неизвестное действие развития.');
  next.revision++;next.events.push(event);return {ok:true,next,event,costCp,inspiration};
}
function expandBackgrounds(base) {
  const all=base.map(b=>({...b,...clone(backgroundTraining[b.n]||{}),source:'PHB 2014'}));
  extraBackgrounds.forEach((b,i)=>all.push({...clone(all.find(x=>x.n===b.base)||{}),...clone(b),source:i<6?'PHB 2014':'SCAG 2015'}));
  return all.map(b=>({...b,skills:b.skills||b.sk.split(',').map(s=>s.trim())}));
}
function subclassName(cls,name){return aliases[cls+'|'+name]||name||'';}
function subclassLevel(cls){return subclassLevels[cls.n]||Number((String(cls.subT||'').match(/(\d+)\s*уров/)||[])[1])||3;}
function subclassOptions(cls){return unique((Array.isArray(cls?.subs)?cls.subs:[]).filter(Array.isArray).map(s=>subclassName(cls.n,s[0])).filter(n=>typeof n==='string'&&n.trim()));}
function branchOptions(race){return unique((Array.isArray(race&&race.subs)?race.subs:[]).map(s=>s&&s.n).filter(n=>typeof n==='string'&&n.trim()));}
function branchRequired(race){return ['Эльф','Дварф','Полурослик','Гном'].includes(race&&race.n);}
function origin(c,race) {
  const base=clone(races[c.race]||{ab:race&&race.mechanics&&race.mechanics.abilityAdjustments&&race.mechanics.abilityAdjustments.fixed||{},languages:[]});
  const declared=(Array.isArray(race?.mechanics?.subraces)?race.mechanics.subraces:[]).find(s=>s.name===c.subrace),adjust=declared?.abilityAdjustments;
  const sub=clone(branches[c.race+'|'+c.subrace]||(adjust?{ab:adjust.fixed||{},abilityChoices:adjust.choices?.[0]?.count||0,exclude:adjust.choices?.[0]?.exclude,abilityChoiceAmount:adjust.choices?.[0]?.amount||1}:{})),choices=c.buildChoices||{};
  const p={...base,...sub,ab:{...(sub.replaceAb?{}:base.ab),...sub.ab},armor:{...base.armor,...sub.armor}};
  for(const key of ['skills','tools','weapons','languages','resist','toolChoices'])p[key]=[...(base[key]||[]),...(sub[key]||[])];
  p.languageChoices=(base.languageChoices||0)+(sub.languageChoices||0);
  p.abilityChoices=sub.abilityChoices||base.abilityChoices||0;
  p.exclude=sub.exclude||base.exclude||[];
  unique(choices.abilities||[]).slice(0,p.abilityChoices).forEach(k=>{if(keys.includes(k)&&!p.exclude.includes(k))p.ab[k]=(p.ab[k]||0)+(p.abilityChoiceAmount||1);});
  if(c.race==='Драконорожденный'){const a=ancestry.find(a=>a[0]===c.ancestry);if(a)p.resist.push(a[1]);}
  return p;
}
function classTraining(cls,c){
  const p=clone(cls.mechanics&&cls.mechanics.proficiencies||{armor:{},weapons:{names:[]},skills:{choose:0,from:[]},savingThrows:cls.saves||[]});
  p.armor=p.armor||{};p.weapons=p.weapons||{names:[]};p.skills=p.skills||{choose:0,from:[]};p.skills.choose=Number.isInteger(p.skills.choose)?p.skills.choose:0;p.skills.from=Array.isArray(p.skills.from)?p.skills.from:[];
  p.tools=c.cls==='Плут'?['Воровские инструменты']:[];
  const weaponNames={Волшебник:['кинжал','дротик','праща','боевой посох','легкий арбалет'],Чародей:['кинжал','дротик','праща','боевой посох','легкий арбалет'],Бард:['ручной арбалет','длинный меч','короткий меч','рапира'],Плут:['ручной арбалет','длинный меч','короткий меч','рапира'],Монах:['короткий меч'],Друид:['дубинка','кинжал','дротик','копье','булава','боевой посох','серп','праща','скимитар']};
  if(weaponNames[c.cls])p.weapons.names=weaponNames[c.cls];
  p.toolChoices=c.cls==='Бард'?[instruments,instruments,instruments]:c.cls==='Монах'?[[...artisan,...instruments]]:[];
  const sub=subclassName(c.cls,c.subcls),active=c.level>=subclassLevel(cls);
  if(active&&c.cls==='Жрец'){
    if(['Домен Жизни','Домен Бури','Домен Войны','Домен Природы'].includes(sub))p.armor.heavy=true;
    if(['Домен Бури','Домен Войны'].includes(sub))p.weapons.martial=true;
  }
  if(active&&c.cls==='Бард'&&sub==='Коллегия Доблести')Object.assign(p,{armor:{...p.armor,medium:true,shield:true},weapons:{...p.weapons,martial:true}});
  return p;
}
function training(c,race,cls,bg,skillNames){
  const p=origin(c,race),cp=classTraining(cls,c),ch=c.buildChoices||{};
  const granted=[...(p.skills||[]),...(bg&&bg.skills||[])],fixed=unique(granted);
  const groups=[{key:'classSkills',label:'Навыки класса',count:cp.skills.choose,options:cp.skills.any?skillNames:cp.skills.from},
    {key:'raceSkills',label:'Навыки народа',count:p.skillChoices||0,options:skillNames},
    {key:'backgroundSkills',label:'Навыки предыстории',count:bg&&bg.skillChoices||0,options:bg&&bg.skillOptions||skillNames},
    {key:'duplicateSkills',label:'Замена совпавших владений',count:granted.length-fixed.length,options:skillNames}];
  const toolChoices=[...(p.toolChoices||[]),...(cp.toolChoices||[]),...(bg&&bg.toolChoices||[])];
  const pickedTools=(ch.tools||[]).slice(0,toolChoices.length).filter((v,i)=>toolChoices[i].includes(v)),extraLanguage=pickedTools.filter(x=>x==='Дополнительный язык').length;
  const languageChoices=p.languageChoices+(bg&&bg.languageChoices||0)+extraLanguage;
  return {fixed,groups,skills:unique([...fixed,...groups.flatMap(g=>(ch[g.key]||[]).slice(0,g.count).filter(v=>g.options.includes(v)))]),
    tools:unique([...(p.tools||[]),...cp.tools,...(bg&&bg.tools||[]),...pickedTools.filter(t=>t!=='Дополнительный язык')]),toolChoices,
    languages:unique([...(p.languages||[]),...(c.cls==='Друид'?['Друидический']:[]),...(ch.languages||[]).slice(0,languageChoices).filter(v=>languages.includes(v))]),
    languageChoices,armor:{...cp.armor,...p.armor},weapons:{...cp.weapons,names:unique([...(cp.weapons.names||[]),...p.weapons])},savingThrows:cp.savingThrows||cls.saves||[]};
}
function hpBonus(c,race){return (origin(c,race).hpPerLevel||0)+(c.cls==='Чародей'&&c.subcls==='Драконья кровь'?1:0)+(c.race==='Человек'&&c.subrace==='Вариант человека'&&c.buildChoices?.feat==='Крепкий'?2:0);}
function creationErrors(c,race,cls,bg,skillNames){
  const errors=[]; if(!c.name.trim())errors.push('Введите имя героя.');
  if(!race)errors.push('Выберите народ.');if(!cls)errors.push('Выберите класс.');if(!bg)errors.push('Выберите предысторию.');
  if(!Number.isInteger(c.level)||c.level<1||c.level>20)errors.push('Уровень должен быть целым числом от 1 до 20.');
  if(!race||!cls||!bg)return errors;
  if(c.subrace&&!branchOptions(race).includes(c.subrace)||branchRequired(race)&&!c.subrace)errors.push('Выберите подходящую ветвь народа.');
  if(c.race==='Драконорожденный'&&!ancestry.some(a=>a[0]===c.ancestry))errors.push('Выберите драконьего предка.');
  if(c.level>=subclassLevel(cls)&&(!c.subcls||!subclassOptions(cls).includes(c.subcls)))errors.push('Выберите традицию / архетип своего класса.');
  if(c.subcls&&c.level<subclassLevel(cls))errors.push('Подкласс пока недоступен на этом уровне.');
  const base=c.baseAbilities||{},mode=c.abilityMethod||'array',scores=keys.map(k=>base[k]);
  if(scores.some(v=>!Number.isInteger(v)||v<(mode==='manual'?3:8)||v>(mode==='manual'?18:15)))errors.push('Проверьте значения характеристик до расовых прибавок.');
  if(mode==='array'&&scores.slice().sort((a,b)=>a-b).join(',')!=='8,10,12,13,14,15')errors.push('Распределите стандартный набор 15, 14, 13, 12, 10, 8 без повторов.');
  if(mode==='points'&&pointCost(base)>27)errors.push('Превышен бюджет 27 очков.');
  const p=origin(c,race),ch=c.buildChoices||{},t=training(c,race,cls,bg,skillNames);
  const ac=ch.abilities||[];
  if(ac.length!==p.abilityChoices||unique(ac).length!==ac.length||ac.some(k=>!keys.includes(k)||p.exclude.includes(k)))errors.push('Выберите разные характеристики для прибавок народа.');
  const seen=new Set(t.fixed);
  t.groups.forEach(g=>{const values=ch[g.key]||[];if(values.length!==g.count||values.some(v=>!g.options.includes(v)||seen.has(v))||unique(values).length!==values.length)errors.push(g.label+': выберите '+g.count+' разных новых навыка.');values.forEach(v=>seen.add(v));});
  const ts=ch.tools||[];
  if(ts.length!==t.toolChoices.length||ts.some((v,i)=>!t.toolChoices[i]?.includes(v))||unique(ts).length!==ts.length)errors.push('Завершите выбор владений инструментами без повторов.');
  const ls=ch.languages||[];
  if(ls.length!==t.languageChoices||unique(ls).length!==ls.length||ls.some(v=>!languages.includes(v)||(p.languages||[]).includes(v)))errors.push('Выберите новые языки без повторов.');
  if(p.featChoices&&!ch.feat)errors.push('Выберите черту для варианта человека.');
  if(p.featChoices&&ch.feat&&!['Крепкий','Борец'].includes(ch.feat))errors.push('Выберите черту из каталога D&D 2014.');
  if(p.featChoices&&ch.feat==='Борец'&&(base.str+(p.ab.str||0))<13)errors.push('Для черты «Борец» нужна Сила 13.');
  if(c.hpMethod==='manual'&&(c.hpRolls||[]).length!==c.level-1)errors.push('Введите по одному результату кости хитов за каждый уровень после первого.');
  if(c.hpMethod==='manual'&&(c.hpRolls||[]).some(v=>!Number.isInteger(v)||v<1||v>cls.hd))errors.push('Каждый результат кости хитов должен быть от 1 до '+cls.hd+'.');
  return unique(errors);
}
function pointCost(ab){const costs={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};return keys.reduce((sum,k)=>sum+(costs[ab[k]]??100),0);}
const thirdSlots=[[],[],[],[2],[3],[3],[3],[4,2],[4,2],[4,2],[4,3],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1]];
const thirdKnown=[0,0,3,4,4,4,5,6,6,7,8,8,9,10,10,11,11,11,12,13];
function thirdCaster(c){return c.level>=3&&((c.cls==='Воин'&&c.subcls==='Мистический рыцарь')||(c.cls==='Плут'&&c.subcls==='Мистический ловкач'));}
const api={keys,mod,unique,subclassName,subclassLevel,subclassOptions,branchOptions,branchRequired,origin,training,classTraining,hpBonus,creationErrors,pointCost,expandBackgrounds,backgroundProfile,backgroundState,backgroundEarned,backgroundPlan,allTools,languages,ancestry,thirdCaster,thirdSlots,thirdKnown};
root.DndCharacterRules=Object.freeze(api);
if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
