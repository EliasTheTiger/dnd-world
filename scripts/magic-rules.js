(function(root){
'use strict';
// Project MP rules: direct payment, no creation or storage of active spell slots.
const costs=Object.freeze([0,2,3,5,6,7,9,10,11,13]);
const clone=value=>JSON.parse(JSON.stringify(value));
function settings(value){
  if(value==null)return {version:1,mode:'slots',preparation:'class',revision:0};
  if(value.version!==1||!['slots','mp'].includes(value.mode)||!['class','free','known'].includes(value.preparation)||!Number.isSafeInteger(value.revision)||value.revision<0)throw new Error('Неизвестный формат настроек магии кампании.');
  // Migrate the earlier experimental no-preparation setting to the explicit MP variant.
  return {...clone(value),preparation:value.preparation==='known'?'free':value.preparation};
}
function slots(value){
  const result={};for(const [key,row] of Object.entries(value||{})){
    const level=Number(key);if(!Number.isInteger(level)||level<1||level>9||!row||!Number.isSafeInteger(row.max)||!Number.isSafeInteger(row.cur)||row.max<0||row.max>99||row.cur<0||row.cur>row.max)throw new Error('Повреждён ресурс заклинаний '+key+' круга.');
    if(row.max)result[level]={max:row.max,cur:row.cur};
  }return result;
}
function value(rows,field='cur'){return Object.entries(rows||{}).reduce((sum,[lv,row])=>sum+(row[field]||0)*costs[lv],0);}
function full(row){const result={};row.forEach((max,index)=>{if(max)result[index+1]={max,cur:max};});return result;}
function shape(archive,row){const result=full(row);for(const [lv,slot] of Object.entries(result)){const old=archive&&archive[lv];if(old)slot.cur=Math.max(0,slot.max-(old.max-old.cur));}return result;}
function pool(c){const state=c.magicResource;return {max:state?.max||0,cur:Math.max(0,(state?.max||0)-(state?.spent||0)),spent:state?.spent||0,revision:state?.revision||0};}
function validateState(state){
  if(!state||state.version!==1||!['slots','mp'].includes(state.mode)||!Number.isSafeInteger(state.max)||state.max<0||!Number.isSafeInteger(state.spent)||state.spent<0||!Number.isSafeInteger(state.revision)||state.revision<0)throw new Error('Повреждён сохранённый запас магии.');
  if(!Number.isSafeInteger(state.baselineSpent)||state.baselineSpent<0||typeof state.classKey!=='string'||!state.archive||Array.isArray(state.archive))throw new Error('Повреждена история расхода магии.');
  if(value(slots(state.archive),'max')!==state.max)throw new Error('Запас магии не совпадает с таблицей ресурсов.');return state;
}
function sync(c,row,key){
  let state=c.magicResource;
  if(!state){const original=Object.keys(c.slots||{}).length?slots(c.slots):full(row);state=c.magicResource={version:1,mode:'mp',max:value(original,'max'),spent:value(original,'max')-value(original),archive:original,baselineSpent:0,classKey:key,revision:0};}
  validateState(state);
  if(state.classKey!==key){state.archive=shape(state.archive,row);state.max=value(full(row),'max');state.classKey=key;state.revision++;}
  c.slots={};state.mode='mp';return pool(c);
}
// Deterministic bounded knapsack. Translation never creates a newly available
// classic slot when the MP balance only decreased. Rounding stays in MP debt.
function fit(archive,budget){
  const result=slots(archive),current=value(result),adding=budget>=current;
  const allowance=Math.max(0,adding?budget-current:budget),choices=[];
  for(const [lv,row] of Object.entries(result))for(let i=0;i<(adding?row.max-row.cur:row.cur);i++)choices.push(Number(lv));
  const reachable=new Map([[0,[]]]);
  for(const lv of choices)for(const [sum,list] of [...reachable.entries()].sort((a,b)=>b[0]-a[0])){const next=sum+costs[lv];if(next<=allowance&&!reachable.has(next))reachable.set(next,list.concat(lv));}
  const selected=reachable.get(Math.max(...reachable.keys()));
  if(!adding)Object.values(result).forEach(row=>row.cur=0);
  selected.forEach(lv=>result[lv].cur++);return result;
}
function switchCharacter(c,to,row,key){
  if(to==='mp'){
    const actual=slots(c.slots),prior=c.magicResource;
    if(prior){validateState(prior);if(prior.mode==='slots'){
      const spent=value(actual,'max')-value(actual);prior.spent=Math.max(0,prior.spent+spent-prior.baselineSpent);prior.max=value(actual,'max');prior.archive=actual;prior.classKey=key;prior.revision++;
    }}
    return sync(c,row,key);
  }
  const state=validateState(c.magicResource);if(state.mode==='slots')return;
  sync(c,row,key);const projected=fit(state.archive,pool(c).cur);c.slots=projected;
  state.archive=clone(projected);state.baselineSpent=value(projected,'max')-value(projected);state.mode='slots';state.revision++;
}
function plan(c,level,maxCircle){
  const p=pool(c);if(!Number.isInteger(level)||level<1||level>9||level>maxCircle)return {ok:false,reason:'Этот круг магии недоступен герою.'};
  if(!c.magicResource||c.magicResource.mode!=='mp')return {ok:false,reason:'Пул MP не инициализирован.'};
  const cost=costs[level];if(p.cur<cost)return {ok:false,reason:'Недостаточно MP: нужно '+cost+', доступно '+p.cur+'.'};
  return {ok:true,mode:'mp',lv:level,cost,expectedRevision:p.revision,expectedSpent:p.spent,info:' · '+cost+' MP · '+level+' круг'};
}
function commit(c,plan){
  validateState(c.magicResource);
  const p=pool(c);if(c.magicResource.mode!=='mp'||!plan?.ok||plan.mode!=='mp'||!Number.isInteger(plan.lv)||plan.lv<1||plan.lv>9||plan.cost!==costs[plan.lv]||p.revision!==plan.expectedRevision||p.spent!==plan.expectedSpent||p.cur<plan.cost)throw new Error('Запас MP изменился до оплаты. Откройте действие заново.');
  c.magicResource.spent+=plan.cost;c.magicResource.revision++;return plan.cost;
}
function recover(c,amount){
  const state=validateState(c.magicResource);if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Восстановление MP должно быть целым неотрицательным числом.');
  const restored=Math.min(state.spent,amount);state.spent-=restored;state.revision++;return restored;
}
function rest(c){const state=validateState(c.magicResource);state.spent=0;Object.values(state.archive).forEach(row=>row.cur=row.max);state.baselineSpent=0;state.revision++;}
root.DND_MAGIC_RULES=Object.freeze({costs,settings,slots,value,full,shape,pool,validateState,sync,switchCharacter,fit,plan,commit,recover,rest});
})(typeof window!=='undefined'?window:globalThis);
