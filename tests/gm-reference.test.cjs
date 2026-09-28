const test=require('node:test');
const assert=require('node:assert/strict');
const reference=require('../scripts/gm-reference.js');
const data=require('../scripts/gm-reference-data.js');

test('reference search finds formulas, table cells and master notes across sections',()=>{
 const context={xp:[0,0,300],prof:[0,2,2],skills:[['Внимательность','wis']],abilities:{wis:'Мудрость'},backgrounds:[],notes:[{id:'own',t:'Правило стола',x:'Ещё одна попытка перепрыгнуть ров'}]};
 const entries=reference.allEntries(context);
 assert.ok(entries.some(e=>e.tab==='tables'&&reference.matches(e,'мудрость')));
 assert.ok(entries.some(e=>e.tab==='notes'&&reference.matches(e,'еще попытка')));
 assert.ok(entries.some(e=>e.id==='concentration-save'&&reference.matches(e,'концентрац телослож')));
 assert.equal(entries.filter(e=>reference.matches(e,'абракадабра')).length,0);
 assert.deepEqual(context.notes,[{id:'own',t:'Правило стола',x:'Ещё одна попытка перепрыгнуть ров'}]);
});

test('damage preview rounds at each stage and uses received damage before temporary HP for concentration',()=>{
 const input={damage:19,save:'half',defense:'resistance',temp:3};
 assert.match(reference.calculate('damage',input),/Полученный урон: 4\. Потеря обычных хитов: 1\. Остаток временных хитов: 0/);
 assert.match(reference.calculate('damage',{damage:23,save:'full',defense:'normal',temp:30}),/Потеря обычных хитов: 0\. Остаток временных хитов: 7\. Если есть концентрация, СЛ 11/);
 assert.match(reference.calculate('damage',{damage:19,save:'full',defense:'both',temp:0}),/Полученный урон: 18/);
 assert.match(reference.calculate('damage',{...input,defense:'immune'}),/Полученный урон: 0/);
 assert.match(reference.calculate('damage',{...input,save:'none'}),/Полученный урон: 0/);
 assert.deepEqual(input,{damage:19,save:'half',defense:'resistance',temp:3});
});

test('attack preview handles AC ties and natural dice independently of modifiers',()=>{
 assert.match(reference.calculate('attack',{die:12,bonus:5,ac:17}),/: попадание/);
 assert.match(reference.calculate('attack',{die:11,bonus:5,ac:17}),/: промах/);
 assert.match(reference.calculate('attack',{die:1,bonus:100,ac:2}),/Натуральная 1: промах/);
 assert.match(reference.calculate('attack',{die:20,bonus:-100,ac:100}),/критическое попадание/);
 assert.match(reference.calculate('concentration',{damage:23}),/СЛ концентрации: 11/);
 assert.match(reference.calculate('concentration',{damage:0}),/не требуется/);
});

test('invalid manual inputs cannot turn into plausible combat results',()=>{
 for(const damage of ['',null,undefined,-1,1.5,Infinity,'1d6','<script>'])assert.throws(()=>reference.calculate('concentration',{damage}));
 assert.throws(()=>reference.calculate('attack',{die:21,bonus:0,ac:10}));
 assert.throws(()=>reference.calculate('damage',{damage:10,temp:0,save:'success',defense:'normal'}));
});

test('reference has distinct article identities and preserves one 2014 condition per name',()=>{
 assert.equal(new Set(data.entries.map(e=>e.id)).size,data.entries.length);
 assert.equal(data.entries.filter(e=>e.tab==='conditions').length,15);
 for(const entry of data.entries){assert.ok(data.sections.some(s=>s.id===entry.tab),entry.id);assert.ok(entry.source==='project'||(entry.page>=1&&entry.page<=403),entry.id);}
});
