(function (root, factory) {
  const economy = root && root.DndEconomy ? root.DndEconomy : (typeof require === 'function' ? require('./economy-core.js') : null);
  const api = factory(economy);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DndMerchants = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Economy) {
  'use strict';

  const MERCHANT_TEMPLATE_SCHEMA = 'dnd-world-merchant-template/1';
  const MERCHANT_INSTANCE_SCHEMA = 'dnd-world-merchant-instance/1';
  const MERCHANT_STATE_SCHEMA = 'dnd-world-merchants/1';
  const MERCHANT_TRANSACTION_SCHEMA = 'dnd-world-merchant-transaction/1';
  const DND5E_RULESET = Economy && Economy.DND5E_RULESET || 'dnd5e-2014';
  const RARITY_ORDER = Object.freeze({
    common:0,'обычный':0,uncommon:1,'необычный':1,rare:2,'редкий':2,
    'very rare':3,'очень редкий':3,legendary:4,'легендарный':4,artifact:5,'артефакт':5,
  });
  const FAILURE_MESSAGES = Object.freeze({
    'invalid-request':'Неверные данные сделки.',
    'unknown-template':'Шаблон торговца не найден.',
    'unknown-item':'Предмет не найден в действующей базе Item ID.',
    'item-unavailable':'Товар помечен как недоступный.',
    'out-of-stock':'У торговца нет такого товара в нужном количестве.',
    'seller-item-missing':'У персонажа нет этого предмета в нужном количестве.',
    'merchant-does-not-buy-category':'Торговец не закупает эту категорию товаров.',
    'merchant-item-blocked':'Торговец отказывается работать с этим Item ID.',
    'insufficient-funds':'У плательщика недостаточно денег.',
    'merchant-insufficient-funds':'У торговца недостаточно денег; нужно явное разрешение мастера.',
    'master-override-required':'Для покрытия нехватки нужны автор, причина и явное подтверждение мастера.',
    'price-unavailable':'Цена не определена; мастер должен задать её вручную.',
    'duplicate-request':'Эта транзакция уже была применена; повторная выдача заблокирована.',
    'stale-state':'Мир изменился после проверки; повторите сделку.',
    'inventory-guard':'Перемещение заблокировано правилами состояния предмета.',
    'commit-failed':'Сделка не применена; все изменения откачены.',
  });

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function positiveInteger(value, fallback) {
    const parsed = Number(value == null ? fallback : value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw coded('invalid-request', 'Количество должно быть положительным целым числом.');
    return parsed;
  }
  function nonNegativeInteger(value, fallback) {
    const parsed = Number(value == null ? fallback : value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw coded('invalid-request', 'Значение должно быть неотрицательным целым числом.');
    return parsed;
  }
  function basisPoints(value, fallback) {
    const parsed = BigInt(String(value == null ? fallback : value));
    if (parsed < 0n || parsed > 1000000n) throw coded('invalid-request', 'Коэффициент цены вне допустимого диапазона.');
    return parsed.toString();
  }
  function coded(reason, message, details) {
    const error = new Error(message || FAILURE_MESSAGES[reason] || reason);
    error.code = reason; if (details) error.details = details; return error;
  }
  function failResult(reason, extra) {
    return Object.assign({ok:false,reason,message:FAILURE_MESSAGES[reason] || FAILURE_MESSAGES['commit-failed']}, extra || {});
  }
  function stringArray(value) { return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))]; }
  function rarityRank(value) { const key = text(value).toLowerCase().replace(/ё/g, 'е'); return RARITY_ORDER[key] == null ? 0 : RARITY_ORDER[key]; }
  function itemCategories(item) {
    const result = new Set(['all']), type = text(item && item.type).toLowerCase(), tags = stringArray(item && item.tags).map(row => row.toLowerCase()),
      kind = text(item && item.kind || item && item.mechanics && item.mechanics.profile && item.mechanics.profile.kind).toLowerCase();
    if (type) result.add(type); if (kind) result.add(kind); for (const tag of tags) result.add(tag);
    const has = function () { return Array.from(arguments).some(key => result.has(key)); };
    if (has('weapon')) result.add('weapons');
    if (has('armor','mediumarmor','heavyarmor','lightarmor','shield')) result.add('armor');
    if (has('ammunition','ammo')) result.add('ammunition');
    if (has('food','camp','water','container','travelgear','tool','rope','light','lightsrc','writing')) result.add('general-goods');
    if (has('food','water','camp')) result.add('hospitality');
    if (has('herb','herbalism','healingit')) result.add('herbalism');
    if (has('alchemy','potion','poison','reagent')) result.add('alchemy');
    if (has('magical','magic','enchanted','wondrous','scroll','potion')) result.add('magic-items');
    if (has('gem','jewelry','valuable','ring')) result.add('jewelry');
    if (has('book','scroll','writing','lore','map')) result.add('books-scrolls');
    if (has('materialit','ore','refined','smithing','crafting')) result.add('craft-materials');
    return result;
  }
  function itemMatches(item, categories) {
    const wanted = stringArray(categories); if (!wanted.length || wanted.includes('all')) return true;
    const actual = itemCategories(item); return wanted.some(category => actual.has(category));
  }
  function restrictionCheck(restrictions, context) {
    const rules = restrictions || {}, ctx = context || {}, region = text(ctx.region), flags = new Set(stringArray(ctx.storyFlags));
    const allowed = stringArray(rules.allowedRegions), excluded = stringArray(rules.excludedRegions), required = stringArray(rules.requiredStoryFlags), forbidden = stringArray(rules.forbiddenStoryFlags);
    if (allowed.length && (!region || !allowed.includes(region))) return {ok:false,reason:'region-not-allowed'};
    if (region && excluded.includes(region)) return {ok:false,reason:'region-excluded'};
    const missing = required.filter(flag => !flags.has(flag)); if (missing.length) return {ok:false,reason:'story-flags-required',missing};
    const present = forbidden.filter(flag => flags.has(flag)); if (present.length) return {ok:false,reason:'story-flags-forbidden',present};
    return {ok:true};
  }

  function stockRule(categories, limit, quantity, options) {
    return Object.freeze(Object.assign({categories:stringArray(categories),limit,quantity,availability:'available'}, options || {}));
  }
  function template(input) {
    const row = input || {}, id = text(row.id), profession = text(row.profession), merchantType = text(row.merchantType);
    if (!id || !profession || !merchantType) throw coded('invalid-request', 'MerchantTemplate требует id, profession и merchantType.');
    return Object.freeze({
      schemaVersion:MERCHANT_TEMPLATE_SCHEMA,id,profession,merchantType,label:text(row.label || profession),description:text(row.description),
      buyCategories:Object.freeze(stringArray(row.buyCategories)),sellCategories:Object.freeze(stringArray(row.sellCategories)),
      initialStock:Object.freeze((row.initialStock || []).map(rule => stockRule(rule.categories,positiveInteger(rule.limit,1),positiveInteger(rule.quantity,1),{itemIds:Object.freeze(stringArray(rule.itemIds)),availability:text(rule.availability || 'available')}))),
      startingFunds:Object.freeze(Object.assign({},row.startingFunds || {})),
      pricingRules:Object.freeze({purchaseBasisPoints:basisPoints(row.pricingRules && row.pricingRules.purchaseBasisPoints,'10000'),saleBasisPoints:basisPoints(row.pricingRules && row.pricingRules.saleBasisPoints,'5000'),rounding:text(row.pricingRules && row.pricingRules.rounding || 'half-up')}),
      rarity:Object.freeze({maximum:nonNegativeInteger(row.rarity && row.rarity.maximum,0),allowed:Object.freeze(stringArray(row.rarity && row.rarity.allowed))}),
      restockRules:Object.freeze(Object.assign({mode:'restore-to-target',cadenceDays:7,requiresGM:true},clone(row.restockRules || {}))),
      restrictions:Object.freeze({allowedRegions:Object.freeze(stringArray(row.restrictions && row.restrictions.allowedRegions)),excludedRegions:Object.freeze(stringArray(row.restrictions && row.restrictions.excludedRegions)),requiredStoryFlags:Object.freeze(stringArray(row.restrictions && row.restrictions.requiredStoryFlags)),forbiddenStoryFlags:Object.freeze(stringArray(row.restrictions && row.restrictions.forbiddenStoryFlags))}),
    });
  }

  const DEFAULT_MERCHANT_TEMPLATES = Object.freeze([
    template({id:'innkeeper',profession:'Трактирщик',merchantType:'hospitality',description:'Еда, напитки и дорожные мелочи.',buyCategories:['food','hospitality','general-goods'],sellCategories:['food','hospitality','general-goods'],initialStock:[{categories:['hospitality','food'],limit:12,quantity:8}],startingFunds:{zm:'45',sm:'25'},pricingRules:{purchaseBasisPoints:'10000',saleBasisPoints:'4000'},rarity:{maximum:0},restockRules:{cadenceDays:1,mode:'restore-to-target',requiresGM:true},restrictions:{forbiddenStoryFlags:['settlement-under-siege']}}),
    template({id:'general-store',profession:'Торговец общими товарами',merchantType:'general',description:'Повседневное снаряжение и инструменты.',buyCategories:['general-goods','tool','craft-materials'],sellCategories:['general-goods','tool','craft-materials'],initialStock:[{categories:['general-goods'],limit:18,quantity:5},{categories:['tool'],limit:6,quantity:2}],startingFunds:{zm:'120',sm:'40'},pricingRules:{purchaseBasisPoints:'10000',saleBasisPoints:'5000'},rarity:{maximum:1},restockRules:{cadenceDays:7,mode:'restore-to-target',requiresGM:true},restrictions:{}}),
    template({id:'blacksmith',profession:'Кузнец',merchantType:'artisan',description:'Металл, инструменты и кузнечные материалы.',buyCategories:['craft-materials','smithing','tool','weapon','armor'],sellCategories:['craft-materials','smithing','tool'],initialStock:[{categories:['smithing','craft-materials'],limit:14,quantity:6},{categories:['tool'],limit:4,quantity:2}],startingFunds:{zm:'180'},pricingRules:{purchaseBasisPoints:'10500',saleBasisPoints:'5500'},rarity:{maximum:1},restockRules:{cadenceDays:10,mode:'restore-to-target',requiresGM:true},restrictions:{}}),
    template({id:'weaponsmith',profession:'Оружейник',merchantType:'specialist',description:'Оружие и боеприпасы.',buyCategories:['weapons','ammunition','craft-materials'],sellCategories:['weapons','ammunition'],initialStock:[{categories:['weapons'],limit:18,quantity:2},{categories:['ammunition'],limit:8,quantity:8}],startingFunds:{zm:'300'},pricingRules:{purchaseBasisPoints:'11000',saleBasisPoints:'6000'},rarity:{maximum:2},restockRules:{cadenceDays:14,mode:'restore-to-target',requiresGM:true},restrictions:{forbiddenStoryFlags:['weapon-trade-banned']}}),
    template({id:'armorer',profession:'Бронник',merchantType:'specialist',description:'Доспехи, щиты и защитное снаряжение.',buyCategories:['armor','craft-materials'],sellCategories:['armor'],initialStock:[{categories:['armor'],limit:18,quantity:2}],startingFunds:{zm:'400'},pricingRules:{purchaseBasisPoints:'11000',saleBasisPoints:'6000'},rarity:{maximum:2},restockRules:{cadenceDays:14,mode:'restore-to-target',requiresGM:true},restrictions:{}}),
    template({id:'herbalist',profession:'Травник',merchantType:'healer',description:'Травы, лечебные материалы и наборы.',buyCategories:['herbalism','herb','reagent'],sellCategories:['herbalism','herb','reagent'],initialStock:[{categories:['herbalism','herb'],limit:18,quantity:7}],startingFunds:{zm:'90',sm:'30'},pricingRules:{purchaseBasisPoints:'10000',saleBasisPoints:'6500'},rarity:{maximum:1},restockRules:{cadenceDays:3,mode:'restore-to-target',requiresGM:true},restrictions:{excludedRegions:['безжизненная пустошь']}}),
    template({id:'alchemist',profession:'Алхимик',merchantType:'specialist',description:'Зелья, яды и реагенты.',buyCategories:['alchemy','reagent','potion','poison'],sellCategories:['alchemy','potion','poison'],initialStock:[{categories:['potion','alchemy'],limit:16,quantity:3},{categories:['reagent'],limit:10,quantity:5}],startingFunds:{zm:'350'},pricingRules:{purchaseBasisPoints:'11500',saleBasisPoints:'6000'},rarity:{maximum:3},restockRules:{cadenceDays:10,mode:'restore-to-target',requiresGM:true},restrictions:{forbiddenStoryFlags:['alchemy-outlawed']}}),
    template({id:'magic-items',profession:'Торговец магическими предметами',merchantType:'arcane',description:'Редкие магические предметы и диковины.',buyCategories:['magic-items'],sellCategories:['magic-items'],initialStock:[{categories:['magic-items'],limit:14,quantity:1}],startingFunds:{pm:'120',zm:'500'},pricingRules:{purchaseBasisPoints:'13500',saleBasisPoints:'6500'},rarity:{maximum:4},restockRules:{cadenceDays:30,mode:'restore-to-target',requiresGM:true},restrictions:{forbiddenStoryFlags:['arcane-trade-banned']}}),
    template({id:'jeweler',profession:'Ювелир',merchantType:'luxury',description:'Камни, украшения и ценности.',buyCategories:['jewelry','gem','valuable'],sellCategories:['jewelry','gem','valuable'],initialStock:[{categories:['jewelry'],limit:16,quantity:2}],startingFunds:{pm:'40',zm:'600'},pricingRules:{purchaseBasisPoints:'12000',saleBasisPoints:'7500'},rarity:{maximum:3},restockRules:{cadenceDays:20,mode:'restore-to-target',requiresGM:true},restrictions:{}}),
    template({id:'scribe',profession:'Писец и продавец книг',merchantType:'scholar',description:'Книги, карты, письменные принадлежности и свитки.',buyCategories:['books-scrolls','book','scroll','writing','map'],sellCategories:['books-scrolls','book','scroll','writing','map'],initialStock:[{categories:['books-scrolls'],limit:20,quantity:3}],startingFunds:{zm:'260'},pricingRules:{purchaseBasisPoints:'11000',saleBasisPoints:'5500'},rarity:{maximum:3},restockRules:{cadenceDays:14,mode:'restore-to-target',requiresGM:true},restrictions:{forbiddenStoryFlags:['written-magic-banned']}}),
  ]);

  function normalizeStockEntry(value) {
    const row = value || {}, itemId = text(row.itemId); if (!itemId) throw coded('unknown-item');
    return {itemId,quantity:nonNegativeInteger(row.quantity,0),available:row.available !== false,buyPriceOverrideMinor:row.buyPriceOverrideMinor == null ? null : String(BigInt(row.buyPriceOverrideMinor)),salePriceOverrideMinor:row.salePriceOverrideMinor == null ? null : String(BigInt(row.salePriceOverrideMinor))};
  }
  function normalizeInstance(value, templates) {
    const row = value || {}, templateMap = new Map((templates || DEFAULT_MERCHANT_TEMPLATES).map(entry => [entry.id,entry])), source = templateMap.get(text(row.templateId));
    if (!source) throw coded('unknown-template');
    const id = text(row.id); if (!id) throw coded('invalid-request', 'MerchantInstance требует id.');
    const wallet = row.wallet && typeof row.wallet === 'object' ? clone(row.wallet) : Economy.createWallet('merchant:'+id,DND5E_RULESET,source.startingFunds);
    wallet.id='merchant:'+id;wallet.ruleset=DND5E_RULESET;wallet.version=nonNegativeInteger(wallet.version,0);wallet.balances=Object.assign({},wallet.balances||{});
    return {
      schemaVersion:MERCHANT_INSTANCE_SCHEMA,id,templateId:source.id,name:text(row.name || source.profession),region:text(row.region),storyFlags:stringArray(row.storyFlags),
      inventory:(Array.isArray(row.inventory)?row.inventory:[]).map(normalizeStockEntry),wallet,
      priceMultipliers:{purchaseBasisPoints:basisPoints(row.priceMultipliers && row.priceMultipliers.purchaseBasisPoints,source.pricingRules.purchaseBasisPoints),saleBasisPoints:basisPoints(row.priceMultipliers && row.priceMultipliers.saleBasisPoints,source.pricingRules.saleBasisPoints)},
      itemAvailability:Object.assign({},row.itemAvailability||{}),relationships:Object.assign({},row.relationships||{}),overdraftMinor:String(BigInt(row.overdraftMinor||0)),revision:nonNegativeInteger(row.revision,0),
      createdAt:text(row.createdAt || new Date().toISOString()),updatedAt:text(row.updatedAt || row.createdAt || new Date().toISOString()),lastRestockedAt:text(row.lastRestockedAt),
    };
  }
  function normalizeState(value, templates) {
    const row=value&&typeof value==='object'?value:{}, instances=[];
    for(const candidate of Array.isArray(row.instances)?row.instances:[]){try{instances.push(normalizeInstance(candidate,templates));}catch(_error){}}
    return {schemaVersion:MERCHANT_STATE_SCHEMA,instances,transactions:(Array.isArray(row.transactions)?row.transactions:[]).filter(entry=>entry&&entry.schemaVersion===MERCHANT_TRANSACTION_SCHEMA).map(clone)};
  }
  function priceApply(amountMinor, factors) {
    let numerator=BigInt(String(amountMinor)),denominator=1n;
    for(const factor of factors){numerator*=BigInt(String(factor));denominator*=10000n;}
    return ((numerator+denominator/2n)/denominator).toString();
  }
  function inventorySnapshot(owner){return {inventory:clone(owner.inventory||[]),equipment:clone(owner.equipment||{})};}
  function inventoryRestore(owner,snapshot){owner.inventory=clone(snapshot.inventory);if (owner.equipment&&typeof owner.equipment==='object')owner.equipment=clone(snapshot.equipment);}
  function stockEntry(instance,itemId){return (instance.inventory||[]).find(row=>row.itemId===itemId);}
  function characterQuantity(character,itemId){return (character.inventory||[]).filter(row=>row.itemId===itemId).reduce((sum,row)=>sum+Math.max(0,Number(row.qty)||0),0);}
  function addCharacterItem(character,itemId,quantity,idFactory){
    const inventory=character.inventory||(character.inventory=[]),existing=inventory.find(row=>row.itemId===itemId&&!row.inside&&row.valueCp==null&&row.valueGp==null);
    if(existing)existing.qty=Math.max(0,Number(existing.qty)||0)+quantity;
    else inventory.push({id:'inv_trade_'+text(idFactory()).replace(/[^a-z0-9_-]/gi,'_'),itemId,qty:quantity,notes:''});
  }
  function removeCharacterItem(character,itemId,quantity){
    let left=quantity;for(let index=(character.inventory||[]).length-1;index>=0&&left>0;index--){const row=character.inventory[index];if(row.itemId!==itemId)continue;const current=Math.max(0,Number(row.qty)||0),take=Math.min(left,current);row.qty=current-take;left-=take;if(row.qty<=0){character.inventory.splice(index,1);for(const slot of Object.keys(character.equipment||{}))if(character.equipment[slot]===row.id)delete character.equipment[slot];}}
    if(left)throw coded('stale-state');
  }
  function addMerchantStock(instance,itemId,quantity){const existing=stockEntry(instance,itemId);if(existing)existing.quantity+=quantity;else instance.inventory.push({itemId,quantity,available:true,buyPriceOverrideMinor:null,salePriceOverrideMinor:null});}

  class MerchantService {
    constructor(options) {
      const value=options||{};if(!Economy||!value.economy)throw coded('invalid-request','MerchantService требует CurrencyService.');
      this.economy=value.economy;this.templates=(value.templates||DEFAULT_MERCHANT_TEMPLATES).map(row=>row.schemaVersion===MERCHANT_TEMPLATE_SCHEMA?row:template(row));this.templateMap=new Map(this.templates.map(row=>[row.id,row]));
      this.itemResolver=typeof value.itemResolver==='function'?value.itemResolver:()=>null;this.listItems=typeof value.listItems==='function'?value.listItems:()=>[];
      this.priceResolver=typeof value.priceResolver==='function'?value.priceResolver:()=>({ok:false,reason:'price-unavailable'});this.inventoryGuard=typeof value.inventoryGuard==='function'?value.inventoryGuard:()=>({ok:true});
      this.clock=typeof value.clock==='function'?value.clock:()=>new Date().toISOString();let sequence=0;this.idFactory=typeof value.idFactory==='function'?value.idFactory:()=>Date.now().toString(36)+'-'+(++sequence).toString(36);
      this.journal=Array.isArray(value.journal)?value.journal:[];this._locks=new Map();
    }
    template(id){return this.templateMap.get(text(id))||null;}
    _candidates(source,rule,context){
      const ids=stringArray(rule.itemIds),all=Array.from(this.listItems()||[]).filter(item=>item&&text(item.id)&&this.itemResolver(item.id)===item),selected=ids.length?ids.map(id=>this.itemResolver(id)).filter(Boolean):all.filter(item=>itemMatches(item,rule.categories));
      return selected.filter(item=>rarityRank(item.rarity)<=source.rarity.maximum&&restrictionCheck(source.restrictions,context).ok).sort((a,b)=>text(a.n||a.name||a.id).localeCompare(text(b.n||b.name||b.id),'ru')||text(a.id).localeCompare(text(b.id)));
    }
    createInstance(templateId,options){
      const source=this.template(templateId);if(!source)throw coded('unknown-template');const value=options||{},access=restrictionCheck(source.restrictions,value);if(!access.ok)throw coded('invalid-request','Шаблон недоступен в этом регионе или при текущем сюжете.',access);
      const id=text(value.id||('merchant-'+this.idFactory())),now=this.clock(),instance=normalizeInstance({id,templateId:source.id,name:value.name||source.profession,region:value.region,storyFlags:value.storyFlags,wallet:Economy.createWallet('merchant:'+id,DND5E_RULESET,source.startingFunds),createdAt:now,updatedAt:now},this.templates);
      for(const rule of source.initialStock){for(const item of this._candidates(source,rule,value).slice(0,rule.limit))addMerchantStock(instance,item.id,rule.quantity);}
      return instance;
    }
    restock(instance,context){
      const source=this.template(instance&&instance.templateId);if(!source)return failResult('unknown-template');const access=restrictionCheck(source.restrictions,context||instance);if(!access.ok)return failResult('invalid-request',{details:access});
      let added=0;for(const rule of source.initialStock){for(const item of this._candidates(source,rule,context||instance).slice(0,rule.limit)){const existing=stockEntry(instance,item.id);if(!existing){addMerchantStock(instance,item.id,rule.quantity);added+=rule.quantity;}else if(source.restockRules.mode==='restore-to-target'&&existing.quantity<rule.quantity){added+=rule.quantity-existing.quantity;existing.quantity=rule.quantity;}}}
      instance.lastRestockedAt=this.clock();instance.updatedAt=instance.lastRestockedAt;instance.revision++;return {ok:true,added};
    }
    quote(instance,character,itemId,side,quantity){
      const source=this.template(instance&&instance.templateId),item=this.itemResolver(text(itemId)),qty=positiveInteger(quantity,1);if(!source)return failResult('unknown-template');if(!item)return failResult('unknown-item');
      const relationship=instance.relationships&&instance.relationships[character&&character.id]||{},reputation=text(relationship.reputation||relationship.tier),availability=instance.itemAvailability&&instance.itemAvailability[item.id]===false?'blocked':'available';
      if(availability==='blocked')return failResult('merchant-item-blocked');
      const stock=stockEntry(instance,item.id),override=stock&&(side==='purchase'?stock.buyPriceOverrideMinor:stock.salePriceOverrideMinor),base=override==null?this.priceResolver(item,side,{merchantType:source.merchantType,rarity:item.rarity,availability,region:instance.region,reputation}):{ok:true,amountMinor:String(override),manualOverride:true};
      if(!base||!base.ok||base.amountMinor==null)return failResult('price-unavailable',{details:base||null});
      const instanceFactor=side==='purchase'?instance.priceMultipliers.purchaseBasisPoints:instance.priceMultipliers.saleBasisPoints,relationshipFactor=basisPoints(side==='purchase'?relationship.purchaseBasisPoints:relationship.saleBasisPoints,'10000'),unitMinor=priceApply(base.amountMinor,[instanceFactor,relationshipFactor]);
      return {ok:true,side,itemId:item.id,quantity:qty,unitMinor,totalMinor:(BigInt(unitMinor)*BigInt(qty)).toString(),currencyId:'mm',baseAmountMinor:String(base.amountMinor),factors:{instanceBasisPoints:instanceFactor,relationshipBasisPoints:relationshipFactor},manualOverride:!!base.manualOverride};
    }
    async _withInstance(instance,work){
      const id=text(instance&&instance.id);if(!id)return failResult('invalid-request');const prior=this._locks.get(id)||Promise.resolve();let release;const gate=new Promise(resolve=>{release=resolve;}),tail=prior.then(()=>gate);this._locks.set(id,tail);await prior;try{return await work();}finally{release();if(this._locks.get(id)===tail)this._locks.delete(id);}
    }
    _duplicate(requestId){return this.journal.some(row=>row&&row.requestId===requestId);}
    _recordSeed(kind,input,quote,override){return {schemaVersion:MERCHANT_TRANSACTION_SCHEMA,id:'merchant-tx-'+this.idFactory(),requestId:input.requestId,kind,at:this.clock(),merchantId:input.instance.id,characterId:input.character.id,itemId:input.itemId,quantity:quote.quantity,unitMinor:quote.unitMinor,totalMinor:quote.totalMinor,status:'committed',userId:text(input.userId||'system'),reason:text(input.reason),masterOverride:override?clone(override):null,economyOperationId:null};}
    _guard(character,itemId,quantity,context){const rows=(character.inventory||[]).filter(row=>row.itemId===itemId);let left=quantity,removals=[];for(const row of rows){const take=Math.min(left,Math.max(0,Number(row.qty)||0));if(take)removals.push({entryId:row.id,itemId,qty:take});left-=take;if(!left)break;}if(left)return failResult('seller-item-missing');const checked=this.inventoryGuard(character,removals,{context});return checked&&checked.ok!==false?{ok:true,removals}:failResult('inventory-guard',{details:checked});}
    buy(input){
      const value=input||{};return this._withInstance(value.instance,async()=>{try{
        if(!value.instance||!value.character||!value.characterAccount||!text(value.requestId))return failResult('invalid-request');if(this._duplicate(value.requestId))return failResult('duplicate-request');
        const item=this.itemResolver(text(value.itemId));if(!item)return failResult('unknown-item');const stock=stockEntry(value.instance,item.id),qty=positiveInteger(value.quantity,1);
        if(!stock||stock.quantity<qty)return failResult('out-of-stock');if(stock.available===false||value.instance.itemAvailability&&value.instance.itemAvailability[item.id]===false)return failResult('item-unavailable');
        const quote=this.quote(value.instance,value.character,item.id,'purchase',qty);if(!quote.ok)return quote;const seed=this._recordSeed('purchase',Object.assign({},value,{itemId:item.id}),quote,null),beforeInventory=inventorySnapshot(value.character),beforeStock=clone(value.instance.inventory),journalLength=this.journal.length,revision=value.instance.revision;
        const consequence=()=>{try{const fresh=stockEntry(value.instance,item.id);if(!fresh||fresh.quantity<qty||fresh.available===false)throw coded('stale-state');fresh.quantity-=qty;addCharacterItem(value.character,item.id,qty,this.idFactory);value.instance.revision++;value.instance.updatedAt=this.clock();this.journal.push(seed);return()=>{inventoryRestore(value.character,beforeInventory);value.instance.inventory=clone(beforeStock);value.instance.revision=revision;this.journal.length=journalLength;};}catch(error){inventoryRestore(value.character,beforeInventory);value.instance.inventory=clone(beforeStock);value.instance.revision=revision;this.journal.length=journalLength;throw error;}};
        const result=await this.economy.purchase({buyer:value.characterAccount,merchant:value.instance.wallet,price:{amountMinor:quote.totalMinor},itemId:item.id,quantity:qty,userId:value.userId,reason:value.reason||'Покупка у торговца',idempotencyKey:value.requestId,metadata:{requestId:value.requestId,merchantId:value.instance.id},consequence});
        if(!result.ok)return result.reason==='insufficient-funds'?failResult('insufficient-funds',{details:result}):failResult(result.reason||'commit-failed',{details:result});if(result.replayed)return failResult('duplicate-request',{details:{economyOperationId:result.operation&&result.operation.id}});seed.economyOperationId=result.operation.id;return {ok:true,transaction:clone(seed),quote};
      }catch(error){return failResult(error.code||'commit-failed',{message:error.message});}});
    }
    sell(input){
      const value=input||{};return this._withInstance(value.instance,async()=>{try{
        if(!value.instance||!value.character||!value.characterAccount||!text(value.requestId))return failResult('invalid-request');if(this._duplicate(value.requestId))return failResult('duplicate-request');
        const item=this.itemResolver(text(value.itemId));if(!item)return failResult('unknown-item');const source=this.template(value.instance.templateId),qty=positiveInteger(value.quantity,1);if(!source)return failResult('unknown-template');
        if(!itemMatches(item,source.buyCategories))return failResult('merchant-does-not-buy-category');if(value.instance.itemAvailability&&value.instance.itemAvailability[item.id]===false)return failResult('merchant-item-blocked');if(characterQuantity(value.character,item.id)<qty)return failResult('seller-item-missing');
        const guarded=this._guard(value.character,item.id,qty,'merchant-sale');if(!guarded.ok)return guarded;const quote=this.quote(value.instance,value.character,item.id,'sale',qty);if(!quote.ok)return quote;
        const affordability=this.economy.canAfford(value.instance.wallet,{amountMinor:quote.totalMinor}),override=value.masterOverride,explicit=override&&override.confirmed===true&&text(override.authorizedBy)&&text(override.reason);
        if(!affordability.ok&&!explicit)return failResult('merchant-insufficient-funds',{requiredMinor:affordability.requiredMinor,availableMinor:affordability.availableMinor,shortfallMinor:affordability.shortfallMinor});
        const shortfall=!affordability.ok?BigInt(affordability.shortfallMinor):0n,merchantDebit=(BigInt(quote.totalMinor)-shortfall).toString(),seed=this._recordSeed('sale',Object.assign({},value,{itemId:item.id}),quote,shortfall?Object.assign({},override,{shortfallMinor:shortfall.toString()}):null),beforeInventory=inventorySnapshot(value.character),beforeStock=clone(value.instance.inventory),beforeOverdraft=value.instance.overdraftMinor,journalLength=this.journal.length,revision=value.instance.revision;
        const consequence=()=>{try{if(characterQuantity(value.character,item.id)<qty)throw coded('stale-state');const freshGuard=this._guard(value.character,item.id,qty,'merchant-sale-commit');if(!freshGuard.ok)throw coded('inventory-guard',freshGuard.message,freshGuard.details);removeCharacterItem(value.character,item.id,qty);addMerchantStock(value.instance,item.id,qty);if(shortfall)value.instance.overdraftMinor=(BigInt(value.instance.overdraftMinor||0)+shortfall).toString();value.instance.revision++;value.instance.updatedAt=this.clock();this.journal.push(seed);return()=>{inventoryRestore(value.character,beforeInventory);value.instance.inventory=clone(beforeStock);value.instance.overdraftMinor=beforeOverdraft;value.instance.revision=revision;this.journal.length=journalLength;};}catch(error){inventoryRestore(value.character,beforeInventory);value.instance.inventory=clone(beforeStock);value.instance.overdraftMinor=beforeOverdraft;value.instance.revision=revision;this.journal.length=journalLength;throw error;}};
        let result;if(!shortfall)result=await this.economy.sale({seller:value.characterAccount,merchant:value.instance.wallet,price:{amountMinor:quote.totalMinor},itemId:item.id,quantity:qty,userId:value.userId,reason:value.reason||'Продажа торговцу',idempotencyKey:value.requestId,metadata:{requestId:value.requestId,merchantId:value.instance.id},consequence});
        else if(typeof this.economy._mutate==='function')result=await this.economy._mutate('sale',[{account:value.instance.wallet,makePlan:()=>this.economy.planDebit(value.instance.wallet,{amountMinor:merchantDebit})},{account:value.characterAccount,makePlan:()=>this.economy.planCredit(value.characterAccount,{amountMinor:quote.totalMinor})}],BigInt(quote.totalMinor),{userId:value.userId,reason:value.reason||override.reason,idempotencyKey:value.requestId,metadata:{requestId:value.requestId,merchantId:value.instance.id,masterOverride:clone(seed.masterOverride)}},{itemId:item.id,quantity:String(qty),merchantDebitMinor:merchantDebit,shortfallMinor:shortfall.toString()},consequence);
        else return failResult('master-override-required');
        if(!result.ok)return result.reason==='insufficient-funds'?failResult('merchant-insufficient-funds',{details:result}):failResult(result.reason||'commit-failed',{details:result});if(result.replayed)return failResult('duplicate-request',{details:{economyOperationId:result.operation&&result.operation.id}});seed.economyOperationId=result.operation.id;return {ok:true,transaction:clone(seed),quote};
      }catch(error){return failResult(error.code||'commit-failed',{message:error.message});}});
    }
  }

  return Object.freeze({MERCHANT_TEMPLATE_SCHEMA,MERCHANT_INSTANCE_SCHEMA,MERCHANT_STATE_SCHEMA,MERCHANT_TRANSACTION_SCHEMA,FAILURE_MESSAGES,DEFAULT_MERCHANT_TEMPLATES,MerchantService,normalizeTemplate:template,normalizeInstance,normalizeState,itemCategories,itemMatches,restrictionCheck});
});
