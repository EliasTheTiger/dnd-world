import {loadRuntimeIntegrationEngine} from './runtime-catalog-loader.mjs';

// A saved session lacks legacy seed flags, but has already completed the
// separately tested alchemist update. These journeys isolate preservation.
export function localCampaignFixture() {
  const engine=loadRuntimeIntegrationEngine();
  const first=Object.assign(engine.buildBlank(),{id:'char_septih',name:'Септих — текущая игра',hp:7,hpMax:29,hpTemp:3,
    notes:'Моя летопись: не менять заметку.',inventory:[{id:'kept-entry',itemId:'kept-item',qty:3,notes:'Личная пометка'}],
    equipment:{},coins:{mm:1,sm:2,em:3,zm:17,pm:0},hdUsed:1});
  const second=Object.assign(engine.buildBlank(),{id:'only-custom',name:'Эйра Локальная',hp:4,hpMax:18,
    notes:'Произвольный состав группы',inventory:[],equipment:{}});
  const combat=Object.assign(engine.blankCombat(),{active:true,id:'ongoing-battle',name:'Незавершённый бой',round:4,
    order:[{kind:'ally',id:first.id,init:18},{kind:'ally',id:second.id,init:9}],turnIndex:1,
    turn:{actorKey:'ally:'+second.id,actionUsed:true,actionsUsed:1,bonusUsed:true,movementUsed:3},
    log:[{id:'kept-combat-log',text:'Ход продолжается',round:4}],history:[{id:'kept-history',name:'Прежний бой',log:[]}]});
  const journal=[{id:'kept-journal',date:'2026-10-22',title:'Моя летопись',text:'Запись до обновления'}];
  engine.setState({chars:[first,second],partyUpdates:{alchemist20261023:true},items:[{id:'kept-item',n:'Памятный камень',custom:true,type:'equipment',weight:'0.2',desc:'Не заменять'}],combat,journal,fxRound:13});
  return {snapshot:engine.localSnapshot(),journal};
}
