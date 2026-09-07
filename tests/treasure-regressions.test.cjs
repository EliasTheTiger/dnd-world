const assert=require('node:assert/strict');
const test=require('node:test');
const Chests=require('../scripts/chest-core.js');
const Merchants=require('../scripts/merchant-core.js');
const Economy=require('../scripts/economy-core.js');
const catalog=[{id:'rope',name:'Верёвка',kind:'rope',rarity:'common',stackable:true},{id:'relic',name:'Реликвия',kind:'valuable',rarity:'common',unique:true}];
function chest(){return Chests.createChest({id:'cache',templateId:'wooden-cache',lockType:'none',placement:{placed:true,sceneId:'crypt'}});}
function approved(){return Chests.approveLoot(Chests.replaceLootDraft(chest(),catalog,{items:[{itemId:'rope',qty:2}],currency:{gp:5}}).chest,catalog).chest;}
test('claimed treasure cannot be regenerated, edited or reapproved, including after reload',()=>{
 const c=approved();c.container.loot.status='claimed';c.container.loot.claimedByActorId='rogue';const saved=JSON.stringify(c),loaded=Chests.normalizeChest(JSON.parse(saved));
 for(const result of [Chests.generateLoot(loaded,catalog,'another'),Chests.replaceLootDraft(loaded,catalog,{items:[],currency:{gp:999}}),Chests.approveLoot(loaded,catalog)]){assert.equal(result.ok,false);assert.equal(result.code,'LOOT_ALREADY_CLAIMED');}
 assert.equal(JSON.stringify(loaded),saved);
});
test('destroying a chest leaves approved treasure accessible to a chosen recipient',()=>{
 const c=approved(),destroyed=Chests.applyAction(c,'destroy',{actorId:'fighter',damage:100});assert.equal(destroyed.chest.state,'destroyed');assert.equal(Chests.evaluateAction(destroyed.chest,'claim',{actorId:'rogue'}).allowed,true);assert.equal(Chests.applyAction(destroyed.chest,'claim',{actorId:'rogue'}).event.actorId,'rogue');
});
test('fixed story rewards cannot be overwritten by the generator',()=>{
 const c=Chests.createChest({id:'plot',templateId:'story'}),draft=Chests.replaceLootDraft(c,catalog,{items:[{itemId:'relic',qty:1}],currency:{}}).chest,before=JSON.stringify(draft);
 assert.equal(Chests.generateLoot(draft,catalog,'new').code,'FIXED_LOOT_IS_MANUAL');assert.equal(JSON.stringify(draft),before);
});
test('a coins-only reward does not depend on unused item table entries',()=>{
 const c=chest();c.container.rewardMode='currency';c.container.lootTable=[{itemId:'removed',weight:1}];const result=Chests.generateLoot(c,catalog,'coins');assert.equal(result.ok,true);assert.ok(result.loot.draft.currency.totalCopper>0);assert.deepEqual(result.loot.draft.items,[]);
});
test('disabling a trapped preset survives normalization and reopening the campaign',()=>{
 const c=Chests.createChest({id:'trap',templateId:'trapped-vault'});assert.equal(c.container.trap.enabled,true);c.container.trap.enabled=false;assert.equal(Chests.normalizeState({instances:[c]}).instances[0].container.trap.enabled,false);
});
test('missing check or damage results and missing actors do not change the chest',()=>{
 const c=chest(),before=JSON.stringify(c);for(const [action,resolution] of [['check',{actorId:'rogue'}],['destroy',{actorId:'rogue'}],['inspect',{}]]){const out=Chests.applyAction(c,action,resolution);assert.equal(out.ok,false);assert.equal(JSON.stringify(out.chest),before);}assert.equal(JSON.stringify(c),before);
});
test('a hero without thieves tools receives an explanation before attempting a lock',()=>{
 const c=chest();c.container.lock={type:'simple',dc:12,opened:false};assert.equal(Chests.evaluateAction(c,'pick',{actorId:'hero',actorHasTools:false}).reasonCode,'THIEVES_TOOLS_REQUIRED');assert.equal(Chests.evaluateAction(c,'pick',{actorId:'hero',actorHasTools:true}).allowed,true);
});
test('unique loot cannot duplicate across stacks or silently fall short of the configured count',()=>{
 assert.equal(Chests.validateLootDraft(chest(),catalog,{items:[{itemId:'relic',qty:1},{itemId:'relic',qty:1}]}).ok,false);
 const c=chest();c.container.rewardMode='items';c.container.itemCount=2;c.container.lootTable=[{itemId:'relic',weight:1,minLevel:1,maxLevel:20,contexts:[]}];assert.equal(Chests.generateLoot(c,catalog,'unique').code,'NOT_ENOUGH_DISTINCT_LOOT');
});
test('an explicit master choice can award rare treasure early but never invent an item or duplicate a unique one',()=>{
 const items=[...catalog,{id:'legendary',rarity:'legendary',kind:'weapon',minLevel:17}],c=chest(),draft={items:[{itemId:'legendary',qty:1}],currency:{}};assert.equal(Chests.replaceLootDraft(c,items,draft).ok,false);c.container.loot.allowIncompatible=true;const reviewed=Chests.replaceLootDraft(c,items,draft);assert.equal(reviewed.ok,true);assert.equal(Chests.approveLoot(reviewed.chest,items).ok,true);assert.equal(Chests.normalizeChest(reviewed.chest).container.loot.allowIncompatible,true);assert.equal(Chests.replaceLootDraft(c,items,{items:[{itemId:'missing',qty:1}]}).ok,false);assert.equal(Chests.replaceLootDraft(c,items,{items:[{itemId:'relic',qty:2}]}).ok,false);
 c.container.rewardMode='items';c.container.lootTable=[{itemId:'legendary',weight:1}];assert.equal(Chests.generateLoot(c,items,'still-safe').ok,false);
});
test('opening a previously triggered trap does not trigger it again',()=>{
 const c=approved();c.container.trap.enabled=true;c.container.trap.triggered=true;assert.equal(Chests.applyAction(c,'open',{actorId:'rogue'}).event.trapTriggered,false);
});
test('traps on decoy and creature containers still trigger when opened',()=>{
 for(const templateId of ['decoy','creature-release']){const c=Chests.createChest({id:templateId,templateId,lockType:'none',placement:{placed:true},trap:{enabled:true},creature:{definitionId:'wolf',instanceId:'wolf-instance'}}),outcome=Chests.applyAction(c,'open',{actorId:'hero'});assert.equal(outcome.ok,true);assert.equal(outcome.event.trapTriggered,true);assert.equal(outcome.chest.container.trap.triggered,true);}
});
test('a mimic cannot be destroyed as an object while its real combatant remains unharmed',()=>{
 const c=Chests.createChest({id:'mimic',templateId:'mimic',placement:{placed:true}});assert.equal(Chests.evaluateAction(c,'destroy',{actorId:'hero'}).reasonCode,'CREATURE_USES_COMBAT');assert.equal(Chests.applyAction(c,'destroy',{actorId:'hero',damage:999}).ok,false);assert.equal(Chests.applyAction(c,'open',{actorId:'hero'}).event.requiresCombatEngine,true);
});
function shop(){let seq=0;const item={id:'rope',n:'Верёвка',type:'equipment',tags:['general-goods'],rarity:'common'},economy=new Economy.CurrencyService({currencies:Economy.DND5E_CURRENCIES,journal:[]}),service=new Merchants.MerchantService({economy,itemResolver:id=>id==='rope'?item:null,listItems:()=>[item],priceResolver:()=>({ok:true,amountMinor:'100'}),journal:[],idFactory:()=>String(++seq)}),instance=service.createInstance('general-store',{id:'shop'}),character={id:'hero',inventory:[{id:'first',itemId:'rope',qty:1},{id:'protected',itemId:'rope',qty:1}],equipment:{}},account=Economy.createWallet('hero','dnd5e-2014',{zm:'10'});return {service,economy,instance,character,account};}
test('selling removes exactly the inventory entry validated by the guard',async()=>{
 const f=shop(),seen=[];f.service.inventoryGuard=(_c,removals)=>{seen.push(removals.map(r=>r.entryId));return {ok:!removals.some(r=>r.entryId==='protected')};};
 const result=await f.service.sell({instance:f.instance,character:f.character,characterAccount:f.account,itemId:'rope',quantity:1,requestId:'sell-safe'});assert.equal(result.ok,true);assert.deepEqual(f.character.inventory,[{id:'protected',itemId:'rope',qty:1}]);assert.deepEqual(seen,[['first'],['first']]);
});
test('selling a selected second stack leaves the first stack intact',async()=>{
 const f=shop(),result=await f.service.sell({instance:f.instance,character:f.character,characterAccount:f.account,itemId:'rope',entryId:'protected',quantity:1,requestId:'selected'});assert.equal(result.ok,true);assert.equal(f.character.inventory[0].id,'first');
});
test('selling a container cannot orphan its contents',async()=>{
 const f=shop();f.character.inventory.push({id:'inside',itemId:'rope',qty:2,inside:'first'});const before=JSON.stringify([f.instance,f.character,f.account]);const result=await f.service.sell({instance:f.instance,character:f.character,characterAccount:f.account,itemId:'rope',entryId:'first',quantity:1,requestId:'bag'});assert.equal(result.ok,false);assert.equal(JSON.stringify([f.instance,f.character,f.account]),before);
});
test('manual merchant prices are final per-unit prices, including zero',()=>{
 const f=shop(),entry=f.instance.inventory[0];f.instance.priceMultipliers.purchaseBasisPoints='20000';entry.buyPriceOverrideMinor='123';assert.equal(f.service.quote(f.instance,f.character,'rope','purchase',2).totalMinor,'246');entry.buyPriceOverrideMinor='0';assert.equal(f.service.quote(f.instance,f.character,'rope','purchase',1).totalMinor,'0');
});
test('story restrictions continue to block trades after merchant creation',async()=>{
 const f=shop();f.instance.templateId='innkeeper';f.instance.storyFlags=['settlement-under-siege'];const before=JSON.stringify([f.instance,f.character,f.account]);assert.equal(f.service.quote(f.instance,f.character,'rope','purchase',1).reason,'merchant-restricted');assert.equal((await f.service.buy({instance:f.instance,character:f.character,characterAccount:f.account,itemId:'rope',quantity:1,requestId:'restricted'})).ok,false);assert.equal(JSON.stringify([f.instance,f.character,f.account]),before);
});
test('restocking overlapping template categories restores the same target as creation',()=>{
 const f=shop(),source=f.service.template('general-store'),custom=Merchants.normalizeTemplate({...source,id:'overlap',initialStock:[{categories:['general-goods'],limit:1,quantity:5},{categories:['general-goods'],limit:1,quantity:2}]}),service=new Merchants.MerchantService({economy:f.economy,templates:[custom],listItems:f.service.listItems,itemResolver:f.service.itemResolver}),instance=service.createInstance('overlap',{id:'overlap-shop'});assert.equal(instance.inventory[0].quantity,7);instance.inventory[0].quantity=0;assert.equal(service.restock(instance).added,7);assert.equal(instance.inventory[0].quantity,7);assert.equal(service.restock(instance).added,0);
});
test('a pending purchase rejected after a master edit preserves that edit',async()=>{
 const f=shop(),purchase=f.economy.purchase.bind(f.economy);f.economy.purchase=input=>{f.instance.inventory[0].quantity=99;f.instance.revision++;return purchase(input);};const walletBefore=f.economy.totalMinor(f.account),result=await f.service.buy({instance:f.instance,character:f.character,characterAccount:f.account,itemId:'rope',quantity:1,requestId:'changed-shop'});assert.equal(result.ok,false);assert.equal(f.instance.inventory[0].quantity,99);assert.equal(f.economy.totalMinor(f.account),walletBefore);
});
