(function(){
  const TYPES=[
    {id:'attack',label:'атака'},
    {id:'save',label:'спасбросок'},
    {id:'healing',label:'лечение'},
    {id:'buff',label:'усиление'},
    {id:'debuff',label:'ослабление'},
    {id:'control',label:'контроль'},
    {id:'summon',label:'призыв'},
    {id:'area',label:'область действия'},
    {id:'concentration',label:'концентрация'},
    {id:'environment',label:'окружение'}
  ];
  const CASES_PER_TYPE=50;
  const TOTAL=TYPES.length*CASES_PER_TYPE;

  function qaEnsure(value,message){if(!value)throw new Error(message);return value;}
  function qaClone(value){return JSON.parse(JSON.stringify(value));}
  function qaHero(id,overrides){
    const row=buildBlank();
    Object.assign(row,{id,name:id,cls:'Жрец',level:9,ab:{str:10,dex:14,con:14,int:12,wis:18,cha:10},
      saves:{},skills:{},hp:30,hpMax:30,hpTemp:0,inventory:[],equipment:{},spellbook:[],slots:{1:{max:1,cur:1},2:{max:1,cur:1},3:{max:1,cur:1}},
      spellResources:{focus:1},abilities:[],activeFx:[],fxOff:[],cond:[],deaths:{s:0,f:0},resist:[],vuln:[],immune:[],condImmune:[],
      exhaustion:0,spentRest:0,hdUsed:0,spellAb:'wis'},overrides||{});
    return row;
  }
  function qaFoe(id,overrides){
    return Object.assign({id,n:id,kind:'monster',hp:30,hpMax:30,hpTemp:0,ac:10,
      abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saveP:{},saveBonuses:{},skills:{},profB:2,passive:10,
      movement:{walk:9},activeFx:[],cond:[],resist:[],vuln:[],immune:[],condImmune:[],effectImmunities:[],combatActions:[],tags:[]},overrides||{});
  }
  function qaSpell(type,index){
    const id='qa-spell-'+type.id+'-'+index;
    let data={id,n:'QA '+type.label+' '+(index+1),l:1,s:'Воплощение',c:'Жрц',t:'1 действие',r:'18 м',cm:'В, С',d:'Мгновенная',
      ritual:false,conc:false,tags:[],fx:[],x:'',hi:''};
    if(type.id==='attack')Object.assign(data,{l:0,x:'Дальнобойная атака заклинанием. При попадании цель получает 1d10 урона огнем.'});
    if(type.id==='save')Object.assign(data,{x:'Цель совершает спасбросок Ловкости. При провале она получает 2d6 урона холодом, при успехе половину.'});
    if(type.id==='healing')Object.assign(data,{r:'Касание',x:'Цель восстанавливает 1d8 хитов.'});
    if(type.id==='buff')Object.assign(data,{d:'1 минута',fx:[{stat:'ac',mode:'add',value:2}],x:'Согласный союзник получает +2 к КД.'});
    if(type.id==='debuff')Object.assign(data,{s:'Некромантия',d:'1 минута',fx:[{stat:'condition',mode:'set',value:'Отравленный'}],x:'Цель становится Отравленной.'});
    if(type.id==='control')Object.assign(data,{l:2,s:'Очарование',d:'Концентрация, 1 минута',conc:true,fx:[{stat:'condition',mode:'set',value:'Парализованный'}],x:'Цель совершает спасбросок Мудрости. При провале она становится Парализованной.'});
    if(type.id==='summon')Object.assign(data,{l:2,s:'Вызов',r:'На себя',d:'2 раунда',x:'Вы призываете союзного духа.'});
    if(type.id==='area')Object.assign(data,{l:3,tags:['aoe'],r:'30 м',x:'Все существа в сфере совершают спасбросок Ловкости. При провале получают 2d6 урона огнем, при успехе половину.',area:{shape:'sphere',sizeM:6}});
    if(type.id==='concentration')Object.assign(data,{d:'Концентрация, 1 минута',conc:true,fx:[{stat:'save.all',mode:'add',value:1}],x:'Две цели получают +1 ко всем спасброскам.'});
    if(type.id==='environment')Object.assign(data,{s:'Преобразование',d:'1 раунд',x:'Влажная земля покрывается льдом.'});
    const mechanics=compileSpellMechanics(data),rule=mechanics.spell;
    mechanics.origin='explicit';mechanics.schemaVersion=GAME_MECHANICS_SCHEMA_VERSION;
    if(['attack','save','debuff','control','area','environment'].includes(type.id)){rule.targeting.type='enemy';mechanics.target.kind='enemy';}
    if(['healing','buff'].includes(type.id)){rule.targeting.type='ally';mechanics.target.kind='ally';}
    if(type.id==='summon'){
      rule.targeting.type='self';mechanics.target.kind='self';
      rule.summons=[{side:'ally',count:1,template:{n:'QA дух '+(index+1),hp:8,hpMax:8,ac:12}}];
    }
    if(type.id==='area'){
      rule.targeting.count={base:1,perSlot:0,fromSlot:3,allCreatures:true};
      rule.targeting.area={shape:'sphere',sizeM:6,origin:'point'};
      mechanics.target={kind:'enemy',base:1,allCreatures:true,area:true};
    }
    if(type.id==='concentration'){
      rule.targeting.type='ally';rule.targeting.count={base:2,perSlot:0,fromSlot:1,allCreatures:false};
      mechanics.target={kind:'ally',base:2,perSlot:0,fromSlot:1};
    }
    if(['attack','save','healing','control','area'].includes(type.id))rule.input.requireCompleteRolls=true;
    if(type.id==='environment'){
      rule.range.requiresMeasurement=true;rule.range.requiresLineOfSight=true;rule.input.requireSceneFacts=true;
      rule.environment.requiredTags=['wet'];rule.environment.effects=[{kind:'surface',operation:'create',surfaceType:'ice',radiusM:3}];
      rule.resources.other=[{key:'focus',label:'фокус',amount:1}];
    }
    data.mechanics=mechanics;
    return data;
  }
  function qaWorld(type,index){
    const spell=qaSpell(type,index),caster=qaHero('QA Заклинатель'),ally=qaHero('QA Союзник',{hp:5,hpMax:30,slots:{},spellResources:{}}),ally2=qaHero('QA Союзник 2',{slots:{},spellResources:{}}),
      foe=qaFoe('qa-foe-primary'),foe2=qaFoe('qa-foe-secondary');
    if(type.id==='attack'&&index%4===0)foe.resist=['огонь'];
    if(type.id==='debuff'&&index%2===0)foe.condImmune=['Отравленный'];
    caster.spellbook=[{spellId:spell.id,prep:true,alwaysPrepared:true,countsAgainstPreparation:false,countsAgainstKnown:false,granted:true,access:'feature'}];
    return {spell,caster,ally,ally2,foe,foe2};
  }
  function qaTarget(type,world){
    if(type.id==='summon')return 'ally:'+world.caster.id;
    if(['healing','buff','concentration'].includes(type.id))return 'ally:'+world.ally.id;
    return 'foe:'+world.foe.id;
  }
  function qaSecondary(type,world){
    if(type.id==='area')return 'foe:'+world.foe2.id;
    if(type.id==='concentration')return 'ally:'+world.ally2.id;
    return '';
  }
  function qaSnapshot(world){
    const level=+world.spell.l||0;
    return JSON.stringify({slot:level?world.caster.slots[level]&&world.caster.slots[level].cur:null,focus:world.caster.spellResources.focus,
      casterFx:world.caster.activeFx,targetHp:world.foe.hp,secondHp:world.foe2.hp,allyHp:world.ally.hp,allyFx:world.ally.activeFx,
      ally2Fx:world.ally2.activeFx,foeFx:world.foe.activeFx,foes:foesDB.length,scene:bg3SceneState.spellEffects,last:lastCastEvent});
  }
  function qaSelect(id,value){
    const el=qaEnsure(document.getElementById(id),'нет элемента '+id);el.value=value;
    el.dispatchEvent(new Event('change',{bubbles:true}));return el;
  }
  function qaOpen(type,world){
    castSpellFx(world.spell.id,world.caster.id);
    const back=qaEnsure(document.getElementById('castBack'),'нет окна наложения');
    qaEnsure(back.style.display==='flex','окно наложения не открылось');
    qaEnsure(document.getElementById('castTitle').textContent.includes(world.spell.n),'заголовок не показывает выбранное заклинание');
    const target=qaTarget(type,world);qaSelect('castTarget',target);
    const second=qaSecondary(type,world);
    if(second){
      const check=[...document.querySelectorAll('.cast-multi')].find(row=>row.value===second);
      qaEnsure(check,'UI не предложил дополнительную цель');if(!check.checked)check.click();
    }
    castCtx.executionInput={environmentTags:type.id==='environment'?['wet']:[],byTarget:{},choices:{}};
    [target,second].filter(Boolean).forEach(key=>{castCtx.executionInput.byTarget[key]={distanceM:type.id==='healing'?1:12,lineOfSight:true,clearPath:true,totalCover:false};});
    return target;
  }
  function qaFillCurrentFormula(type,index){
    const distance=document.getElementById('castDistance');
    if(distance&&distance.value===''){distance.value='far';distance.dispatchEvent(new Event('change',{bubbles:true}));}
    const spec=castCtx&&castCtx.spec;
    if(!spec){const error=document.getElementById('castErr'),status=document.getElementById('saveStatus');throw new Error('UI не сохранил формулу броска'
      +(error&&error.textContent?' · '+error.textContent:'')+(status&&status.textContent?' · статус: '+status.textContent:''));}
    for(const row of spec.rows){
      if(row.autoFail)continue;
      const el=document.getElementById('cf_'+row.key);if(!el)continue;
      let value=1;
      if(row.fixed)value=0;
      else if(row.natural){
        value=row.type==='atk'?15:(row.type==='save'&&type.id==='control'&&index%4===0?20:1);
      }else if((+row.cnt||0)>0&&(+row.sides||0)>0)value=row.type==='dmg'?Math.max(+row.cnt,2):+row.cnt;
      else if(Number.isFinite(+row.min))value=+row.min;
      el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));
      if(row.natural&&row.adv){const second=document.getElementById('cf_'+row.key+'_2');if(second){second.value=String(value);second.dispatchEvent(new Event('input',{bubbles:true}));}}
    }
  }
  function qaFinishFormula(type,index){
    for(let guard=0;guard<6;guard++){
      const back=document.getElementById('castBack');if(!back||back.style.display==='none')return;
      const step=document.getElementById('castStep3');if(!step||step.style.display==='none')return;
      qaFillCurrentFormula(type,index);
      qaEnsure(step.querySelector('button.btn.rub'),'нет кнопки применения итога').click();
    }
    const error=document.getElementById('castErr');
    const status=document.getElementById('saveStatus');
    throw new Error('формула не завершилась за допустимое число целей'+(error&&error.textContent?' · '+error.textContent:'')+(status&&status.textContent?' · статус: '+status.textContent:''));
  }
  function qaVerifySuccess(type,index,world,before){
    const level=+world.spell.l||0;
    qaEnsure(document.getElementById('castBack').style.display==='none','успешное действие не закрыло окно');
    qaEnsure(lastCastEvent&&lastCastEvent.spellId===world.spell.id,'нет итогового события выбранного заклинания');
    qaEnsure(Array.isArray(lastCastEvent.explanation)&&lastCastEvent.explanation.join(' ').length>20,'нет понятного объяснения результата');
    if(level)qaEnsure(world.caster.slots[level].cur===0,'ячейка не списана ровно один раз');
    if(type.id==='attack')qaEnsure(world.foe.hp<30,'атака не изменила хиты цели');
    if(type.id==='save')qaEnsure(world.foe.hp<30,'провал спасброска не применил урон');
    if(type.id==='healing')qaEnsure(world.ally.hp>5,'лечение не восстановило хиты');
    if(type.id==='buff')qaEnsure(fxSum(world.ally,'ac')===2,'усиление не появилось на цели');
    if(type.id==='debuff')qaEnsure(effectiveConditions(world.foe).includes('Отравленный')===(index%2===1),'иммунитет состояния учтён неверно');
    if(type.id==='control')qaEnsure(effectiveConditions(world.foe).includes('Парализованный')!==(index%4===0),'ветка спасброска контроля неверна');
    if(type.id==='summon')qaEnsure(foesDB.some(row=>row.summonedByCastId===lastCastEvent.castId),'призыв не связан с castId');
    if(type.id==='area')qaEnsure(world.foe.hp<30&&world.foe2.hp<30,'область не рассчитала обе выбранные цели');
    if(type.id==='concentration'){
      qaEnsure(world.ally.activeFx.length===1&&world.ally2.activeFx.length===1,'концентрация не охватила обе цели');
      qaEnsure(world.ally.activeFx[0].castId===world.ally2.activeFx[0].castId,'цели концентрации получили разные castId');
    }
    if(type.id==='environment')qaEnsure(world.caster.spellResources.focus===0&&bg3SceneState.spellEffects.length===1,'окружение или дополнительный ресурс не закоммичены');
    qaEnsure(qaSnapshot(world)!==before,'успешный сценарий не изменил ожидаемое состояние');
  }
  function qaRunCase(type,index){
    const world=qaWorld(type,index);
    chars=[world.caster,world.ally,world.ally2];foesDB=[world.foe,world.foe2];spellsDB=[world.spell];itemsDB=[];abilitiesDB=[];journal=[];
    activeCharId=world.caster.id;combat=blankCombat();castCtx=null;lastCastEvent=null;fxRound=1;bg3SceneState=bg3SceneNormalizeState({});fxInvalidate();
    const target=qaOpen(type,world),mode=index<40?'success':(index<45?'cancel':'invalid');
    if(mode==='cancel'){
      const before=qaSnapshot(world),cancel=document.querySelector('#castStep1 button.btn.ghost');qaEnsure(cancel,'нет кнопки отмены').click();
      qaEnsure(document.getElementById('castBack').style.display==='none','отмена не закрыла окно');qaEnsure(qaSnapshot(world)===before,'отмена изменила мир или ресурсы');return;
    }
    if(mode==='invalid'){
      world.caster.cond.push('Недееспособный');const before=qaSnapshot(world);document.getElementById('castConfirmBtn').click();
      const error=document.getElementById('castErr');qaEnsure(error.style.display==='block'&&error.textContent.length>3,'ошибка не объяснена пользователю');
      qaEnsure(qaSnapshot(world)===before,'ошибка до коммита изменила мир или ресурсы');closeCastModal();return;
    }
    const before=qaSnapshot(world);document.getElementById('castConfirmBtn').click();qaFinishFormula(type,index);qaVerifySuccess(type,index,world,before,target);
  }
  function qaPanel(){
    let panel=document.getElementById('spellUserAuditPanel');if(panel)return panel;
    panel=document.createElement('aside');panel.id='spellUserAuditPanel';panel.setAttribute('role','region');panel.setAttribute('aria-label','Пользовательский аудит заклинаний');
    panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:95;width:min(560px,calc(100vw - 24px));max-height:72vh;overflow:auto;padding:12px;background:#f6f2e7;border:2px solid #71522f;box-shadow:0 5px 24px #0006;color:#2c2118;font:14px Georgia,serif';
    panel.innerHTML='<div style="display:flex;gap:8px;align-items:center"><b style="font-size:17px">QA заклинаний · режим пользователя</b><span style="flex:1"></span><button id="spellUserAuditCloseBtn" class="btn ghost sm">×</button></div>'
      +'<p>500 сценариев через существующее окно наложения: 10 типов × 50 вариантов; 400 успешных действий, 50 отмен и 50 отказов до коммита.</p>'
      +'<button id="spellUserAuditBtn" class="btn rub">Запустить 500 пользовательских сценариев</button>'
      +'<div id="spellUserAuditOut" data-total="500" data-passed="0" data-failed="0" style="margin-top:8px;white-space:pre-wrap">Готов к запуску.</div>';
    document.body.appendChild(panel);document.getElementById('spellUserAuditCloseBtn').onclick=()=>panel.remove();return panel;
  }
  async function runSpellBrowserAcceptanceAudit(){
    const button=document.getElementById('spellUserAuditBtn'),out=document.getElementById('spellUserAuditOut');
    if(button.disabled)return window.__lastSpellBrowserAcceptanceAudit;button.disabled=true;
    const saved={chars,journal,itemsDB,spellsDB,abilitiesDB,racesDB,classesDB,rulesDB,foesDB,activeCharId,fxRound,combat,castCtx,lastCastEvent,bg3SceneState,
      scheduleSave,scheduleJournalSave,renderChars,renderFoes,renderJournal,renderSpellsDB,renderItemsDB,renderAbilitiesDB,renderCombat};
    const report={total:TOTAL,passed:0,failed:0,categories:{},failures:[],mode:'browser-user',dice:'entered-by-user-fixture',resourceCommits:0,cancellations:0,precommitRejections:0};
    scheduleSave=()=>{};scheduleJournalSave=()=>{};renderChars=()=>{};renderFoes=()=>{};renderJournal=()=>{};renderSpellsDB=()=>{};renderItemsDB=()=>{};renderAbilitiesDB=()=>{};renderCombat=()=>{};
    try{
      for(const type of TYPES){
        report.categories[type.id]={label:type.label,total:CASES_PER_TYPE,passed:0,failed:0};
        for(let index=0;index<CASES_PER_TYPE;index++){
          try{qaRunCase(type,index);report.passed++;report.categories[type.id].passed++;if(index<40)report.resourceCommits++;else if(index<45)report.cancellations++;else report.precommitRejections++;}
          catch(error){report.failed++;report.categories[type.id].failed++;report.failures.push({type:type.id,index:index+1,message:String(error&&error.message||error)});try{closeCastModal();}catch(_error){}}
          if((report.passed+report.failed)%10===0){out.textContent='Выполнено '+(report.passed+report.failed)+' / '+TOTAL+' · зелёных '+report.passed+' · ошибок '+report.failed;await new Promise(resolve=>setTimeout(resolve,0));}
        }
      }
    }finally{
      chars=saved.chars;journal=saved.journal;itemsDB=saved.itemsDB;spellsDB=saved.spellsDB;abilitiesDB=saved.abilitiesDB;racesDB=saved.racesDB;classesDB=saved.classesDB;
      rulesDB=saved.rulesDB;foesDB=saved.foesDB;activeCharId=saved.activeCharId;fxRound=saved.fxRound;combat=saved.combat;castCtx=saved.castCtx;lastCastEvent=saved.lastCastEvent;bg3SceneState=saved.bg3SceneState;
      scheduleSave=saved.scheduleSave;scheduleJournalSave=saved.scheduleJournalSave;renderChars=saved.renderChars;renderFoes=saved.renderFoes;renderJournal=saved.renderJournal;renderSpellsDB=saved.renderSpellsDB;renderItemsDB=saved.renderItemsDB;
      renderAbilitiesDB=saved.renderAbilitiesDB;renderCombat=saved.renderCombat;fxInvalidate();saved.renderChars();saved.renderFoes();
    }
    out.dataset.total=String(report.total);out.dataset.passed=String(report.passed);out.dataset.failed=String(report.failed);
    out.style.color=report.failed?'#9f2f25':'#315f39';out.textContent=report.failed
      ?'✕ '+report.passed+' / '+report.total+' зелёных; ошибок '+report.failed+'\n'+Object.entries(report.categories).map(([key,value])=>key+': '+value.passed+'/'+value.total).join(' · ')+'\n'+report.failures.slice(0,12).map(row=>row.type+' #'+row.index+': '+row.message).join('\n')
      :'✓ 500 / 500 пользовательских сценариев зелёные\n400 коммитов · 50 отмен · 50 отказов до коммита\n10 типов заклинаний × 50 вариантов · кампания не изменена';
    button.disabled=false;window.__lastSpellBrowserAcceptanceAudit=report;return report;
  }
  window.runSpellBrowserAcceptanceAudit=runSpellBrowserAcceptanceAudit;
  qaPanel();document.getElementById('spellUserAuditBtn').onclick=runSpellBrowserAcceptanceAudit;
})();
