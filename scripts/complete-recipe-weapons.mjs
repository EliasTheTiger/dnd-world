import fs from 'node:fs';
import links from './recipe-item-links.js';
const root=new URL('../data/bg3/'+links.sourceVersion+'/',import.meta.url);
const read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const stats=new Map(fs.readdirSync(new URL('source/item-stats/',root)).flatMap(file=>read('source/item-stats/'+file).nodes).map(row=>[row.statsId,row]));
const ids=new Set(links.items.filter(row=>row.roles.some(role=>role!=='dye-target')).map(row=>row.id));
const changes=[];
for(const file of fs.readdirSync(new URL('items/',root))){
 const payload=read('items/'+file);let changed=false;
 for(const item of payload.items){
  if(!ids.has(item.id)||!item.mechanics?.profile?.weapon)continue;
  const source=stats.get(item.source.statsId),raw=source?.resolvedProperties?.DefaultBoosts||'',matches=[...raw.matchAll(/(?:^|;)\s*WeaponEnchantment\(\s*([+-]?\d+)\s*\)\s*(?=;|$)/g)];
  if(matches.length>1)throw new Error('Ambiguous base enchantment: '+item.id);
  if(!matches.length)continue;
  const bonus=Number(matches[0][1]);
  item.mechanics.profile.weapon.bonus=bonus;
  item.mechanics.provenance.baseWeaponEnchantment={statsId:source.statsId,sourceField:'Stats.DefaultBoosts',raw,bonus};
  changed=true;changes.push({id:item.id,name:item.n,bonus});
 }
 if(changed)fs.writeFileSync(new URL('items/'+file,root),JSON.stringify(payload)+'\n');
}
console.log(JSON.stringify({weapons:changes}));
