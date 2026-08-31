(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DndEconomy = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const ECONOMY_SCHEMA = 'dnd-world-economy/1';
  const CURRENCY_SCHEMA = 'dnd-world-currency/1';
  const WALLET_SCHEMA = 'dnd-world-wallet/1';
  const ITEM_PRICE_SCHEMA = 'dnd-world-item-price/1';
  const OPERATION_SCHEMA = 'dnd-world-currency-operation/1';
  const PRICE_AUDIT_SCHEMA = 'dnd-world-price-audit/1';
  const DND5E_RULESET = 'dnd5e-2014';
  const PRICE_DIMENSIONS = Object.freeze([
    'merchantType', 'itemCondition', 'rarity', 'availability', 'region', 'reputation', 'gmSettings',
  ]);

  const DND5E_CURRENCIES = Object.freeze([
    Object.freeze({schemaVersion:CURRENCY_SCHEMA,id:'mm',ruleset:DND5E_RULESET,name:'Медная монета',abbreviation:'мм',baseUnit:'mm',exchangeRate:Object.freeze({numerator:'1',denominator:'1'}),precision:0}),
    Object.freeze({schemaVersion:CURRENCY_SCHEMA,id:'sm',ruleset:DND5E_RULESET,name:'Серебряная монета',abbreviation:'см',baseUnit:'mm',exchangeRate:Object.freeze({numerator:'10',denominator:'1'}),precision:1}),
    Object.freeze({schemaVersion:CURRENCY_SCHEMA,id:'em',ruleset:DND5E_RULESET,name:'Электрумовая монета',abbreviation:'эм',baseUnit:'mm',exchangeRate:Object.freeze({numerator:'50',denominator:'1'}),precision:2}),
    Object.freeze({schemaVersion:CURRENCY_SCHEMA,id:'zm',ruleset:DND5E_RULESET,name:'Золотая монета',abbreviation:'зм',baseUnit:'mm',exchangeRate:Object.freeze({numerator:'100',denominator:'1'}),precision:2}),
    Object.freeze({schemaVersion:CURRENCY_SCHEMA,id:'pm',ruleset:DND5E_RULESET,name:'Платиновая монета',abbreviation:'пм',baseUnit:'mm',exchangeRate:Object.freeze({numerator:'1000',denominator:'1'}),precision:3}),
  ]);

  const DND_CURRENCY_ALIASES = Object.freeze({
    mm:'mm','мм':'mm',cp:'mm',copper:'mm','медь':'mm','медных':'mm','медная':'mm',
    sm:'sm','см':'sm',sp:'sm',silver:'sm','серебро':'sm','серебряных':'sm','серебряная':'sm',
    em:'em','эм':'em',ep:'em',electrum:'em','электрум':'em','электрумовых':'em','электрумовая':'em',
    zm:'zm','зм':'zm',gp:'zm',gold:'zm','золото':'zm','золотых':'zm','золотая':'zm',
    pm:'pm','пм':'pm',pp:'pm',platinum:'pm','платина':'pm','платиновых':'pm','платиновая':'pm',
  });

  function fail(message, code) {
    const error = new Error(message);
    if (code) error.code = code;
    throw error;
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function integerString(value, label, options) {
    const settings = Object.assign({allowNegative:false,positive:false}, options || {});
    if (typeof value === 'bigint') value = value.toString();
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail((label || 'Значение') + ' должно быть безопасным целым числом.', 'INVALID_INTEGER');
      value = String(value);
    }
    const text = String(value == null ? '' : value).trim();
    if (!/^-?\d+$/.test(text)) fail((label || 'Значение') + ' должно быть целым числом.', 'INVALID_INTEGER');
    const parsed = BigInt(text);
    if (!settings.allowNegative && parsed < 0n) fail((label || 'Значение') + ' не может быть отрицательным.', 'NEGATIVE_AMOUNT');
    if (settings.positive && parsed <= 0n) fail((label || 'Значение') + ' должно быть положительным.', 'NON_POSITIVE_AMOUNT');
    return parsed;
  }

  function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) { const next = a % b; a = b; b = next; }
    return a || 1n;
  }

  function fraction(numerator, denominator) {
    let n = typeof numerator === 'bigint' ? numerator : integerString(numerator, 'Числитель', {allowNegative:true});
    let d = typeof denominator === 'bigint' ? denominator : integerString(denominator, 'Знаменатель', {positive:true});
    if (d === 0n) fail('Знаменатель не может быть равен нулю.', 'ZERO_DENOMINATOR');
    if (d < 0n) { n = -n; d = -d; }
    const divisor = gcd(n, d);
    return {n:n / divisor, d:d / divisor};
  }

  function decimalFraction(value, label) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
      fail((label || 'Сумма') + ' должна быть строкой или целым числом.', 'INVALID_DECIMAL');
    if (typeof value === 'number' && !Number.isSafeInteger(value))
      fail((label || 'Сумма') + ' нельзя передавать как дробный floating point; используйте десятичную строку.', 'FLOATING_POINT_FORBIDDEN');
    const text = String(value).trim().replace(',', '.');
    if (text.length > 128 || !/^-?\d+(?:\.\d+)?$/.test(text))
      fail((label || 'Сумма') + ' должна быть обычной десятичной записью без экспоненты.', 'INVALID_DECIMAL');
    const negative = text[0] === '-', unsigned = negative ? text.slice(1) : text;
    const parts = unsigned.split('.'), digits = (parts[0] || '0') + (parts[1] || '');
    const scale = 10n ** BigInt((parts[1] || '').length);
    return fraction((negative ? -1n : 1n) * BigInt(digits), scale);
  }

  function roundFraction(value, mode) {
    const f = fraction(value.n, value.d), selected = mode || 'reject';
    if (f.n % f.d === 0n) return f.n / f.d;
    const negative = f.n < 0n, absolute = negative ? -f.n : f.n, whole = absolute / f.d, remainder = absolute % f.d;
    if (selected === 'reject') fail('Результат нельзя представить с допустимой точностью без округления.', 'ROUNDING_REQUIRED');
    let rounded;
    if (selected === 'down') rounded = whole;
    else if (selected === 'up') rounded = whole + 1n;
    else if (selected === 'half-up') rounded = whole + (remainder * 2n >= f.d ? 1n : 0n);
    else fail('Неизвестное правило округления: ' + selected, 'INVALID_ROUNDING');
    return negative ? -rounded : rounded;
  }

  function decimalFromAtomic(atomic, precision) {
    const value = typeof atomic === 'bigint' ? atomic : integerString(atomic, 'Минимальные единицы', {allowNegative:true});
    const digits = Number(precision) || 0, negative = value < 0n, absolute = negative ? -value : value;
    if (!digits) return (negative ? '-' : '') + absolute.toString();
    const scale = 10n ** BigInt(digits), whole = absolute / scale, rest = (absolute % scale).toString().padStart(digits, '0').replace(/0+$/, '');
    return (negative ? '-' : '') + whole.toString() + (rest ? '.' + rest : '');
  }

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }

  function idempotencyKeyOf(meta) {
    const value = meta && typeof meta === 'object' ? meta : {}, metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
    const raw = value.idempotencyKey == null ? (value.requestId == null ? (metadata.idempotencyKey == null ? metadata.requestId : metadata.idempotencyKey) : value.requestId) : value.idempotencyKey;
    const key = String(raw == null ? '' : raw).trim();
    if (key.length > 160) fail('Ключ идемпотентности не может быть длиннее 160 символов.', 'INVALID_IDEMPOTENCY_KEY');
    return key;
  }

  function semanticDetails(details) {
    const value = cloneJson(details || {});
    if (value && typeof value === 'object' && !Array.isArray(value)) delete value.changes;
    return value;
  }

  function operationFingerprint(type, accounts, amountMinor, details) {
    return canonicalJson({type:String(type),accounts:(accounts || []).map(account => String(account && account.id || account)).sort(),amountMinor:String(amountMinor),details:semanticDetails(details)});
  }

  function normalizeCurrency(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Currency должна быть объектом.', 'INVALID_CURRENCY');
    const precision = Number(input.precision);
    if (!Number.isInteger(precision) || precision < 0 || precision > 18) fail('Допустимая точность Currency должна быть целым числом от 0 до 18.', 'INVALID_CURRENCY_PRECISION');
    for (const key of ['id','ruleset','name','abbreviation','baseUnit']) {
      if (typeof input[key] !== 'string' || !input[key].trim()) fail('Currency.' + key + ' обязателен.', 'INVALID_CURRENCY');
    }
    const rawRate = input.exchangeRate && typeof input.exchangeRate === 'object' ? input.exchangeRate : {numerator:input.exchangeRate,denominator:'1'};
    const rate = fraction(rawRate.numerator, rawRate.denominator == null ? '1' : rawRate.denominator);
    if (rate.n <= 0n) fail('Коэффициент обмена Currency должен быть положительным.', 'INVALID_EXCHANGE_RATE');
    return Object.freeze({
      schemaVersion:CURRENCY_SCHEMA,id:input.id.trim(),ruleset:input.ruleset.trim(),name:input.name.trim(),abbreviation:input.abbreviation.trim(),
      baseUnit:input.baseUnit.trim(),exchangeRate:Object.freeze({numerator:rate.n.toString(),denominator:rate.d.toString()}),precision,
    });
  }

  function currencyMap(currencies) {
    const map = new Map();
    for (const candidate of currencies || []) {
      const row = normalizeCurrency(candidate);
      if (map.has(row.id)) fail('Повторяющийся идентификатор Currency: ' + row.id, 'DUPLICATE_CURRENCY');
      map.set(row.id, row);
    }
    if (!map.size) fail('Нужна хотя бы одна Currency.', 'EMPTY_CURRENCY_SET');
    for (const row of map.values()) if (!map.has(row.baseUnit)) fail('Не найдена базовая единица ' + row.baseUnit + ' для ' + row.id + '.', 'MISSING_BASE_CURRENCY');
    return map;
  }

  function atomicFor(currency, amount, rounding) {
    const parsed = decimalFraction(amount, 'Сумма'), scale = 10n ** BigInt(currency.precision);
    return roundFraction({n:parsed.n * scale,d:parsed.d}, rounding || 'reject');
  }

  function rateFor(currency) {
    return fraction(currency.exchangeRate.numerator, currency.exchangeRate.denominator);
  }

  function atomicBaseFraction(currency, atomic) {
    const rate = rateFor(currency), scale = 10n ** BigInt(currency.precision);
    return fraction(atomic * rate.n, scale * rate.d);
  }

  function denominationBaseValue(currency) {
    const value = rateFor(currency);
    if (value.n <= 0n || value.n % value.d !== 0n)
      fail('Минимальная единица ' + currency.id + ' не выражается целым числом базовых единиц.', 'NON_INTEGRAL_DENOMINATION');
    return value.n / value.d;
  }

  function normalizeMeta(meta, requireManualReason) {
    const value = meta && typeof meta === 'object' ? meta : {};
    const userId = String(value.userId || 'system').trim(), reason = String(value.reason || '').trim();
    if (!userId) fail('Для операции нужен пользователь.', 'USER_REQUIRED');
    if (requireManualReason && !reason) fail('Для ручного изменения нужна причина.', 'REASON_REQUIRED');
    return {userId,reason,metadata:cloneJson(value.metadata || {})};
  }

  function createWallet(id, ruleset, balances) {
    const wallet = {schemaVersion:WALLET_SCHEMA,id:String(id || '').trim(),ruleset:String(ruleset || '').trim(),version:0,balances:{}};
    if (!wallet.id || !wallet.ruleset) fail('Кошельку нужны id и ruleset.', 'INVALID_WALLET');
    for (const [key, value] of Object.entries(balances || {})) wallet.balances[key] = integerString(value, 'Баланс ' + key).toString();
    return wallet;
  }

  function normalizeItemPriceSource(source) {
    if (!source || typeof source !== 'object' || !String(source.type || '').trim() || !String(source.reference || '').trim())
      fail('Для цены требуется происхождение данных: type и reference.', 'PRICE_SOURCE_REQUIRED');
    return {type:String(source.type).trim(),reference:String(source.reference).trim(),details:cloneJson(source.details || null)};
  }

  function parseDndMoney(raw, currencies) {
    const text = String(raw == null ? '' : raw).trim().toLowerCase().replace(/ё/g, 'е');
    const match = /^([+-]?\d+(?:[.,]\d+)?)\s*([a-zа-я]+)$/.exec(text);
    if (!match) return {ok:false,reason:'unknown-format',raw:String(raw == null ? '' : raw)};
    const alias = DND_CURRENCY_ALIASES[match[2]], byId = currencyMap(currencies || DND5E_CURRENCIES);
    if (!alias || !byId.has(alias)) return {ok:false,reason:'unknown-currency',raw:String(raw)};
    try {
      const currency = byId.get(alias), atomic = atomicFor(currency, match[1], 'reject'), base = atomicBaseFraction(currency, atomic);
      if (atomic < 0n || base.n % base.d !== 0n) return {ok:false,reason:'invalid-amount',raw:String(raw)};
      return {ok:true,currencyId:currency.id,amount:decimalFromAtomic(atomic,currency.precision),atomicAmount:atomic.toString(),amountMinor:(base.n / base.d).toString(),raw:String(raw)};
    } catch (error) {
      return {ok:false,reason:error.code || 'invalid-amount',raw:String(raw)};
    }
  }

  function createItemPriceModel(input, currencies) {
    const value = input && typeof input === 'object' ? input : {}, source = normalizeItemPriceSource(value.source);
    const model = {
      schemaVersion:ITEM_PRICE_SCHEMA,itemId:String(value.itemId || '').trim(),ruleset:String(value.ruleset || DND5E_RULESET),
      status:'manualReviewRequired',basePrice:null,currency:null,
      purchasePrice:{kind:'contextual',baseAmountMinor:null},
      saleRule:cloneJson(value.saleRule || {kind:'gm-confirmed',basisPoints:'10000',requiresConfirmation:true,source:{type:'runtime-policy',reference:'valuableSell-confirmed-price'}}),
      manualOverrideAllowed:true,manualOverrides:{},source,rawPrice:value.rawPrice == null ? null : String(value.rawPrice),audit:[],
    };
    if (!model.itemId) fail('Для цены нужен itemId.', 'ITEM_ID_REQUIRED');
    if (value.notForSale === true) { model.status = 'notForSale'; return model; }
    let parsed;
    if (value.amount != null && value.currencyId) parsed = parseDndMoney(String(value.amount) + ' ' + String(value.currencyId), currencies);
    else parsed = parseDndMoney(value.rawPrice, currencies);
    if (!parsed.ok) { model.reviewReason = parsed.reason; return model; }
    model.status = 'priced';
    model.currency = parsed.currencyId;
    model.basePrice = {amount:parsed.amount,currencyId:parsed.currencyId,amountMinor:parsed.amountMinor};
    model.purchasePrice.baseAmountMinor = parsed.amountMinor;
    return model;
  }

  function applyManualPriceOverride(model, change, currencies) {
    if (!model || model.schemaVersion !== ITEM_PRICE_SCHEMA) fail('Нужна актуальная модель цены предмета.', 'INVALID_ITEM_PRICE_MODEL');
    const value = change && typeof change === 'object' ? change : {}, side = String(value.side || 'base');
    if (!['base','purchase','sale'].includes(side)) fail('Ручная цена может менять base, purchase или sale.', 'INVALID_PRICE_SIDE');
    const userId = String(value.userId || '').trim(), reason = String(value.reason || '').trim(), at = String(value.at || new Date().toISOString());
    if (!userId) fail('Ручное изменение цены должно содержать пользователя.', 'USER_REQUIRED');
    if (!reason) fail('Ручное изменение цены должно содержать причину.', 'REASON_REQUIRED');
    const parsed = parseDndMoney(String(value.amount) + ' ' + String(value.currencyId || 'mm'), currencies);
    if (!parsed.ok || BigInt(parsed.amountMinor) < 0n) fail('Новая цена должна быть точной неотрицательной денежной суммой.', 'INVALID_PRICE');
    const next = cloneJson(model), oldValue = side === 'base' ? cloneJson(next.basePrice) : cloneJson(next.manualOverrides[side] || null),
      newValue = {amount:parsed.amount,currencyId:parsed.currencyId,amountMinor:parsed.amountMinor};
    if (side === 'base') {
      next.basePrice = newValue; next.currency = parsed.currencyId; next.purchasePrice.baseAmountMinor = parsed.amountMinor; next.status = 'priced';
      next.source = {type:'gm-manual',reference:'manual-price-change',details:{userId,reason,at}};
    } else next.manualOverrides[side] = Object.assign({}, newValue, {userId,reason,at});
    const audit = {schemaVersion:PRICE_AUDIT_SCHEMA,id:String(value.id || ('price:' + next.itemId + ':' + at + ':' + side)),itemId:next.itemId,field:'price.' + side,oldValue,newValue,userId,reason,at};
    next.audit = Array.isArray(next.audit) ? next.audit.concat([audit]) : [audit];
    return {model:next,audit};
  }

  function priceSetting(settings, dimension, key, side) {
    if (!key) return {basisPoints:'10000',source:{type:'neutral',reference:dimension + ':unspecified'}};
    const group = settings && settings[dimension], raw = group && group[key];
    if (raw == null) return {basisPoints:'10000',source:{type:'neutral',reference:dimension + ':' + key + ':unconfigured'}};
    const row = typeof raw === 'object' ? raw : {basisPoints:raw};
    const basisPoints = row[side + 'BasisPoints'] == null ? row.basisPoints : row[side + 'BasisPoints'];
    const source = row.source;
    if (!source || !String(source.type || '').trim() || !String(source.reference || '').trim())
      fail('Модификатор ' + dimension + ':' + key + ' не содержит происхождение.', 'PRICE_MODIFIER_SOURCE_REQUIRED');
    return {basisPoints:integerString(basisPoints == null ? '10000' : basisPoints,'Модификатор ' + dimension).toString(),source:cloneJson(source)};
  }

  function quotePrice(model, side, context, settings) {
    const selected = side || 'purchase';
    if (!model || model.schemaVersion !== ITEM_PRICE_SCHEMA) return {ok:false,manualReviewRequired:true,reason:'invalid-item-price-model'};
    if (model.status !== 'priced' || !model.basePrice) return {ok:false,manualReviewRequired:model.status === 'manualReviewRequired',reason:model.status};
    if (!['purchase','sale'].includes(selected)) fail('Цена рассчитывается только для purchase или sale.', 'INVALID_PRICE_SIDE');
    const override = model.manualOverrides && model.manualOverrides[selected];
    if (override) return {ok:true,side:selected,amountMinor:String(override.amountMinor),currencyId:model.basePrice.currencyId,manualOverride:true,breakdown:[],source:cloneJson(override)};
    let numerator = integerString(model.basePrice.amountMinor, 'Базовая стоимость'), denominator = 1n;
    const breakdown = [], ctx = context && typeof context === 'object' ? context : {};
    if (selected === 'sale') {
      if (!model.saleRule || model.saleRule.kind === 'manualReview') return {ok:false,manualReviewRequired:true,reason:'sale-rule-manual-review'};
      const basisPoints = integerString(model.saleRule.basisPoints == null ? '10000' : model.saleRule.basisPoints, 'Правило продажи');
      numerator *= basisPoints; denominator *= 10000n;
      breakdown.push({dimension:'saleRule',key:model.saleRule.kind,basisPoints:basisPoints.toString(),source:cloneJson(model.saleRule.source || {type:'model',reference:'item.saleRule'})});
    }
    const keys = {
      merchantType:ctx.merchantType,itemCondition:ctx.itemCondition,rarity:ctx.rarity,
      availability:ctx.availability,region:ctx.region,reputation:ctx.reputation,gmSettings:ctx.gmSettings || 'default',
    };
    for (const dimension of PRICE_DIMENSIONS) {
      const modifier = priceSetting(settings || {}, dimension, keys[dimension], selected), basisPoints = integerString(modifier.basisPoints, 'Модификатор ' + dimension);
      numerator *= basisPoints; denominator *= 10000n;
      breakdown.push({dimension,key:keys[dimension] || null,basisPoints:basisPoints.toString(),source:modifier.source});
    }
    const amountMinor = roundFraction({n:numerator,d:denominator}, String(ctx.rounding || 'half-up'));
    return {ok:true,side:selected,amountMinor:amountMinor.toString(),currencyId:model.basePrice.currencyId,manualOverride:false,breakdown,source:cloneJson(model.source)};
  }

  class CurrencyService {
    constructor(options) {
      const value = options && typeof options === 'object' ? options : {};
      this.currencies = currencyMap(value.currencies || DND5E_CURRENCIES);
      this.journal = Array.isArray(value.journal) ? value.journal : [];
      this.clock = typeof value.clock === 'function' ? value.clock : () => new Date().toISOString();
      let sequence = 0;
      this.idFactory = typeof value.idFactory === 'function' ? value.idFactory : () => 'currency-op-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
      this._locks = new Map();
      this._idempotency = new Map();
      for (const operation of this.journal) {
        if (!operation || typeof operation !== 'object') continue;
        const key = String(operation.idempotencyKey || operation.metadata && (operation.metadata.idempotencyKey || operation.metadata.requestId) || '').trim();
        if (!key) continue;
        const fingerprint = String(operation.idempotencyFingerprint || operationFingerprint(operation.type,operation.accounts,operation.amountMinor,operation.details));
        if (!this._idempotency.has(key)) this._idempotency.set(key,{fingerprint,operation});
      }
    }

    currency(id) {
      const row = this.currencies.get(String(id || ''));
      if (!row) fail('Неизвестная валюта: ' + id, 'UNKNOWN_CURRENCY');
      return row;
    }

    convert(money, toCurrencyId, rounding) {
      const input = money && typeof money === 'object' ? money : {}, from = this.currency(input.currencyId), to = this.currency(toCurrencyId);
      if (from.ruleset !== to.ruleset || from.baseUnit !== to.baseUnit) fail('Нельзя конвертировать валюты разных ruleset или базовых единиц.', 'INCOMPATIBLE_CURRENCY');
      const sourceAtomic = atomicFor(from, input.amount, 'reject'), base = atomicBaseFraction(from, sourceAtomic), toRate = rateFor(to), toScale = 10n ** BigInt(to.precision),
        target = fraction(base.n * toRate.d * toScale, base.d * toRate.n), targetAtomic = roundFraction(target, rounding || 'reject');
      return {currencyId:to.id,amount:decimalFromAtomic(targetAtomic,to.precision),atomicAmount:targetAtomic.toString(),rounding:rounding || 'reject'};
    }

    format(money, options) {
      const input = money && typeof money === 'object' ? money : {}, currency = this.currency(input.currencyId), atomic = own(input,'atomicAmount')
        ? integerString(input.atomicAmount,'Минимальные единицы',{allowNegative:true}) : atomicFor(currency,input.amount,'reject');
      const value = decimalFromAtomic(atomic,currency.precision), settings = options || {};
      return settings.long ? value + ' ' + currency.name : value + ' ' + currency.abbreviation;
    }

    _account(account) {
      if (!account || typeof account !== 'object' || !String(account.id || '').trim() || !account.balances || typeof account.balances !== 'object')
        fail('Нужен денежный счёт с id и balances.', 'INVALID_ACCOUNT');
      if (!Number.isSafeInteger(account.version) || account.version < 0) account.version = 0;
      if (!account.ruleset) account.ruleset = DND5E_RULESET;
      return account;
    }

    _denominations(account) {
      const checked = this._account(account), rows = [];
      for (const currency of this.currencies.values()) if (currency.ruleset === checked.ruleset) rows.push({currency,value:denominationBaseValue(currency)});
      rows.sort((a,b) => a.value === b.value ? a.currency.id.localeCompare(b.currency.id) : (a.value > b.value ? -1 : 1));
      if (!rows.length) fail('Для ruleset счёта не настроены валюты.', 'ACCOUNT_RULESET_UNSUPPORTED');
      return rows;
    }

    _snapshot(account) {
      const checked = this._account(account), balances = {};
      for (const row of this._denominations(checked)) balances[row.currency.id] = integerString(checked.balances[row.currency.id] == null ? '0' : checked.balances[row.currency.id], 'Баланс ' + row.currency.id).toString();
      return {version:checked.version,balances};
    }

    totalMinor(account) {
      const snapshot = this._snapshot(account), rows = this._denominations(account);
      return rows.reduce((sum,row) => sum + BigInt(snapshot.balances[row.currency.id]) * row.value, 0n).toString();
    }

    _moneyMinor(money) {
      const input = money && typeof money === 'object' ? money : {};
      if (own(input,'amountMinor')) return integerString(input.amountMinor,'Сумма в базовых единицах');
      const currency = this.currency(input.currencyId), atomic = atomicFor(currency,input.amount,'reject'), base = atomicBaseFraction(currency,atomic);
      if (base.n % base.d !== 0n) fail('Сумма не выражается целым числом базовых единиц.', 'NON_INTEGRAL_BASE_AMOUNT');
      return base.n / base.d;
    }

    canAfford(account, money) {
      const required = this._moneyMinor(money), available = BigInt(this.totalMinor(account));
      if (required < 0n) fail('Проверяемая сумма не может быть отрицательной.', 'NEGATIVE_AMOUNT');
      return {ok:available >= required,requiredMinor:required.toString(),availableMinor:available.toString(),shortfallMinor:(available >= required ? 0n : required - available).toString()};
    }

    _changeFor(account, total) {
      let left = integerString(total,'Итог кошелька'), after = {};
      for (const row of this._denominations(account)) {
        const count = left / row.value; after[row.currency.id] = count.toString(); left -= count * row.value;
      }
      if (left) fail('Набором валют нельзя представить остаток ' + left.toString() + ' базовых единиц.', 'CHANGE_UNAVAILABLE');
      return after;
    }

    planDebit(account, money) {
      const checked = this._account(account), before = this._snapshot(checked), target = this._moneyMinor(money), available = BigInt(this.totalMinor(checked));
      if (target < 0n) fail('Списание не может быть отрицательным.', 'NEGATIVE_AMOUNT');
      if (available < target) return {ok:false,reason:'insufficient-funds',accountId:checked.id,expectedVersion:before.version,before:before.balances,requiredMinor:target.toString(),availableMinor:available.toString(),shortfallMinor:(target - available).toString()};
      return {ok:true,kind:'debit',accountId:checked.id,expectedVersion:before.version,before:before.balances,after:this._changeFor(checked,available - target),amountMinor:target.toString()};
    }

    planCredit(account, money) {
      const checked = this._account(account), before = this._snapshot(checked), amount = this._moneyMinor(money);
      if (amount < 0n) fail('Зачисление не может быть отрицательным.', 'NEGATIVE_AMOUNT');
      const after = Object.assign({}, before.balances), addition = this._changeFor(checked,amount);
      for (const key of Object.keys(after)) after[key] = (BigInt(after[key]) + BigInt(addition[key] || '0')).toString();
      return {ok:true,kind:'credit',accountId:checked.id,expectedVersion:before.version,before:before.balances,after,amountMinor:amount.toString()};
    }

    _planCurrent(account, plan) {
      const snapshot = this._snapshot(account);
      return plan && plan.accountId === account.id && plan.expectedVersion === snapshot.version && JSON.stringify(plan.before) === JSON.stringify(snapshot.balances);
    }

    _applyPlan(account, plan) {
      if (!this._planCurrent(account, plan)) fail('Кошелёк изменился после проверки; нужен новый план.', 'STALE_ACCOUNT');
      account.balances = Object.assign({}, plan.after);
      account.version++;
    }

    _idempotencyProbe(type, accounts, amountMinor, meta, details, fingerprintOverride) {
      const key = idempotencyKeyOf(meta);
      if (!key) return {key:'',fingerprint:'',existing:null};
      const fingerprint = String(fingerprintOverride || operationFingerprint(type,accounts,amountMinor,details)), prior = this._idempotency.get(key);
      if (!prior) return {key,fingerprint,existing:null};
      if (prior.fingerprint !== fingerprint) return {key,fingerprint,conflict:prior.operation};
      return {key,fingerprint,existing:prior.operation};
    }

    _idempotencyResult(probe, amountMinor) {
      if (!probe || !probe.key) return null;
      if (probe.conflict) return {ok:false,reason:'idempotency-conflict',idempotencyKey:probe.key,operationId:String(probe.conflict.id || '')};
      if (probe.existing) return {ok:true,replayed:true,idempotencyKey:probe.key,operation:cloneJson(probe.existing),amountMinor:String(probe.existing.amountMinor == null ? amountMinor : probe.existing.amountMinor)};
      return null;
    }

    _operation(type, accounts, amountMinor, meta, details, idempotency) {
      const info = normalizeMeta(meta, false), probe = idempotency || this._idempotencyProbe(type,accounts,amountMinor,meta,details);
      if (probe.key) info.metadata.idempotencyKey = probe.key;
      const operation = {
        schemaVersion:OPERATION_SCHEMA,id:String(this.idFactory()),type,at:String(this.clock()),userId:info.userId,reason:info.reason,
        amountMinor:String(amountMinor),accounts:accounts.map(account => account.id),details:cloneJson(details || {}),metadata:info.metadata,
        idempotencyKey:probe.key || null,idempotencyFingerprint:probe.key ? probe.fingerprint : null,
      };
      this.journal.push(operation);
      if (probe.key) this._idempotency.set(probe.key,{fingerprint:probe.fingerprint,operation});
      return operation;
    }

    async _withAccounts(accounts, work) {
      const unique = [...new Map(accounts.filter(Boolean).map(account => [this._account(account).id, account])).values()].sort((a,b) => a.id.localeCompare(b.id));
      const releases = [];
      for (const account of unique) {
        const prior = this._locks.get(account.id) || Promise.resolve();
        let release;
        const gate = new Promise(resolve => { release = resolve; }), tail = prior.then(() => gate);
        this._locks.set(account.id, tail);
        await prior;
        releases.push({id:account.id,tail,release});
      }
      try { return await work(); }
      finally {
        for (let i = releases.length - 1; i >= 0; i--) {
          const row = releases[i]; row.release();
          if (this._locks.get(row.id) === row.tail) this._locks.delete(row.id);
        }
      }
    }

    async _mutate(type, accountPlans, amountMinor, meta, details, consequence) {
      const accounts = accountPlans.map(row => row.account);
      return this._withAccounts(accounts, async () => {
        const idempotency = this._idempotencyProbe(type,accounts,amountMinor,meta,details), repeated = this._idempotencyResult(idempotency,amountMinor);
        if (repeated) return repeated;
        const freshPlans = accountPlans.map(row => ({account:row.account,plan:row.makePlan()}));
        const failed = freshPlans.find(row => !row.plan.ok);
        if (failed) return Object.assign({ok:false},failed.plan);
        const snapshots = freshPlans.map(row => ({account:row.account,version:row.account.version,balances:cloneJson(row.account.balances)})), journalLength = this.journal.length;
        let undo = null;
        try {
          for (const row of freshPlans) this._applyPlan(row.account,row.plan);
          if (typeof consequence === 'function') {
            const result = consequence();
            if (result && typeof result.then === 'function') fail('Последствие денежного коммита должно быть синхронным.', 'ASYNC_COMMIT_FORBIDDEN');
            if (typeof result === 'function') undo = result;
          }
          const operation = this._operation(type,accounts,amountMinor,meta,Object.assign({},details,{changes:freshPlans.map(row => ({accountId:row.account.id,before:row.plan.before,after:row.plan.after}))}),idempotency);
          return {ok:true,operation,amountMinor:String(amountMinor)};
        } catch (error) {
          if (undo) try { undo(); } catch (_) {}
          for (const row of snapshots) { row.account.balances = row.balances; row.account.version = row.version; }
          this.journal.length = journalLength;
          return {ok:false,reason:error.code || 'commit-failed',message:String(error && error.message || error)};
        }
      });
    }

    debit(account, money, meta) {
      const amount = this._moneyMinor(money);
      return this._mutate('debit',[{account,makePlan:() => this.planDebit(account,{amountMinor:amount.toString()})}],amount,meta,{},null);
    }

    credit(account, money, meta) {
      const amount = this._moneyMinor(money);
      return this._mutate('credit',[{account,makePlan:() => this.planCredit(account,{amountMinor:amount.toString()})}],amount,meta,{},null);
    }

    purchase(input) {
      const value = input || {}, buyer = this._account(value.buyer), merchant = value.merchant ? this._account(value.merchant) : null, amount = this._moneyMinor(value.price);
      const rows = [{account:buyer,makePlan:() => this.planDebit(buyer,{amountMinor:amount.toString()})}];
      if (merchant) rows.push({account:merchant,makePlan:() => this.planCredit(merchant,{amountMinor:amount.toString()})});
      return this._mutate('purchase',rows,amount,value,{itemId:String(value.itemId || ''),quantity:String(value.quantity == null ? 1 : value.quantity)},value.consequence);
    }

    sale(input) {
      const value = input || {}, seller = this._account(value.seller), merchant = value.merchant ? this._account(value.merchant) : null, amount = this._moneyMinor(value.price), rows = [];
      if (merchant) rows.push({account:merchant,makePlan:() => this.planDebit(merchant,{amountMinor:amount.toString()})});
      rows.push({account:seller,makePlan:() => this.planCredit(seller,{amountMinor:amount.toString()})});
      return this._mutate('sale',rows,amount,value,{itemId:String(value.itemId || ''),quantity:String(value.quantity == null ? 1 : value.quantity)},value.consequence);
    }

    makeChange(account, meta) {
      return this._mutate('change',[{account,makePlan:() => {const before=this._snapshot(account),total=BigInt(this.totalMinor(account));return {ok:true,kind:'change',accountId:account.id,expectedVersion:before.version,before:before.balances,after:this._changeFor(account,total),amountMinor:'0'};}}],0n,meta,{},null);
    }

    exchange(account, fromMoney, toCurrencyId, rounding, meta) {
      const from = this.currency(fromMoney.currencyId), to = this.currency(toCurrencyId), sourceAtomic = integerString(fromMoney.amount,'Количество разменяемых монет',{positive:true}), converted = this.convert(fromMoney,to.id,rounding || 'reject'), targetAtomic = integerString(converted.amount,'Количество получаемых монет'),
        lossMinor=sourceAtomic*denominationBaseValue(from)-targetAtomic*denominationBaseValue(to),semantic={from:{currencyId:from.id,coinCount:sourceAtomic.toString()},to:{currencyId:to.id,coinCount:targetAtomic.toString()},rounding:rounding||'reject'};
      return this._withAccounts([account], async () => {
        const idempotency=this._idempotencyProbe('exchange',[account],lossMinor,meta,semantic),repeated=this._idempotencyResult(idempotency,lossMinor);
        if(repeated)return repeated;
        const freshSource = integerString(account.balances[from.id] == null ? '0' : account.balances[from.id],'Баланс ' + from.id);
        if (freshSource < sourceAtomic) return {ok:false,reason:'insufficient-denomination',currencyId:from.id,requiredAtomic:sourceAtomic.toString(),availableAtomic:freshSource.toString()};
        const original={version:account.version,balances:cloneJson(account.balances)},before = this._snapshot(account), journalLength = this.journal.length, after = Object.assign({},before.balances);
        try {
          after[from.id]=(BigInt(after[from.id] || '0')-sourceAtomic).toString();after[to.id]=(BigInt(after[to.id] || '0')+targetAtomic).toString();
          const plan={ok:true,accountId:account.id,expectedVersion:before.version,before:before.balances,after};
          this._applyPlan(account,plan);
          const operation=this._operation('exchange',[account],lossMinor,meta,Object.assign({},semantic,{before:before.balances,after,changes:[{accountId:account.id,before:before.balances,after}]}),idempotency);
          return {ok:true,operation,converted};
        } catch (error) {
          account.balances=original.balances;account.version=original.version;this.journal.length=journalLength;
          return {ok:false,reason:error.code || 'commit-failed',message:String(error && error.message || error)};
        }
      });
    }

    manualAdjust(account, input) {
      const value = input || {}, currency = this.currency(value.currencyId), nextAtomic = integerString(value.newAmount,'Количество монет'), meta = normalizeMeta(value,true);
      return this._withAccounts([account], async () => {
        const semantic={currencyId:currency.id,newValue:nextAtomic.toString()},fingerprint=operationFingerprint('manual-adjustment',[account],'target',semantic),idempotency=this._idempotencyProbe('manual-adjustment',[account],'target',value,semantic,fingerprint),repeated=this._idempotencyResult(idempotency,'0');
        if(repeated)return repeated;
        const original={version:account.version,balances:cloneJson(account.balances)},before = this._snapshot(account), journalLength = this.journal.length, oldAtomic = BigInt(before.balances[currency.id] || '0'), after = Object.assign({},before.balances);
        try {
          after[currency.id]=nextAtomic.toString();
          this._applyPlan(account,{ok:true,accountId:account.id,expectedVersion:before.version,before:before.balances,after});
          const operation=this._operation('manual-adjustment',[account],(nextAtomic-oldAtomic)*denominationBaseValue(currency),value,{currencyId:currency.id,oldValue:oldAtomic.toString(),newValue:nextAtomic.toString(),before:before.balances,after,changes:[{accountId:account.id,before:before.balances,after}]},idempotency);
          return {ok:true,operation};
        } catch (error) {
          account.balances=original.balances;account.version=original.version;this.journal.length=journalLength;
          return {ok:false,reason:error.code || 'commit-failed',message:String(error && error.message || error)};
        }
      });
    }

    getJournal(filter) {
      const value = filter && typeof filter === 'object' ? filter : {};
      return this.journal.filter(row => row && typeof row === 'object' && (!value.accountId || Array.isArray(row.accounts) && row.accounts.includes(value.accountId)) && (!value.type || row.type === value.type)).map(cloneJson);
    }

    _balancesMinor(balances) {
      let total=0n;
      for(const [currencyId,raw] of Object.entries(balances||{}))total+=integerString(raw,'Баланс '+currencyId)*denominationBaseValue(this.currency(currencyId));
      return total;
    }

    accountStatement(accountId, options) {
      const id=String(accountId||'').trim(),settings=options&&typeof options==='object'?options:{},rows=this.getJournal({accountId:id}),limit=Number.isSafeInteger(settings.limit)&&settings.limit>=0?settings.limit:rows.length;
      let credit=0n,debit=0n,unresolved=0;
      for(const operation of rows){const change=operation.details&&Array.isArray(operation.details.changes)?operation.details.changes.find(row=>row&&row.accountId===id):null;if(!change){unresolved++;continue;}const delta=this._balancesMinor(change.after)-this._balancesMinor(change.before);if(delta>=0n)credit+=delta;else debit-=delta;}
      return {accountId:id,operationCount:rows.length,creditMinor:credit.toString(),debitMinor:debit.toString(),netMinor:(credit-debit).toString(),unresolvedOperations:unresolved,operations:rows.slice(Math.max(0,rows.length-limit))};
    }

    verifyJournal() {
      const errors=[],warnings=[],ids=new Set(),keys=new Map();
      for(let index=0;index<this.journal.length;index++){
        const row=this.journal[index],at='operation['+index+']';
        if(!row||typeof row!=='object'){errors.push({at,code:'invalid-operation'});continue;}
        if(row.schemaVersion!==OPERATION_SCHEMA)errors.push({at,code:'invalid-schema'});
        const id=String(row.id||'').trim();if(!id)errors.push({at,code:'missing-id'});else if(ids.has(id))errors.push({at,code:'duplicate-id',id});else ids.add(id);
        if(!String(row.type||'').trim())errors.push({at,code:'missing-type'});
        try{integerString(row.amountMinor,'Сумма операции',{allowNegative:true});}catch(error){errors.push({at,code:error.code||'invalid-amount'});}
        const accountIds=Array.isArray(row.accounts)?row.accounts:[];if(!accountIds.length)errors.push({at,code:'missing-accounts'});
        if(!String(row.userId||'').trim())errors.push({at,code:'missing-user'});
        if(!String(row.at||'').trim()||Number.isNaN(Date.parse(row.at)))errors.push({at,code:'invalid-time'});
        const key=String(row.idempotencyKey||row.metadata&&(row.metadata.idempotencyKey||row.metadata.requestId)||'').trim();
        if(key){if(keys.has(key)&&keys.get(key)!==id)errors.push({at,code:'duplicate-idempotency-key',idempotencyKey:key,operationIds:[keys.get(key),id]});else keys.set(key,id);}
        const changes=row.details&&Array.isArray(row.details.changes)?row.details.changes:null;
        if(!changes){warnings.push({at,code:'changes-unavailable'});continue;}
        for(const change of changes){if(!change||!String(change.accountId||'').trim()||!accountIds.includes(change.accountId)){errors.push({at,code:'invalid-change-account'});continue;}try{this._balancesMinor(change.before);this._balancesMinor(change.after);}catch(error){errors.push({at,code:error.code||'invalid-change-balance',accountId:change.accountId});}}
      }
      return {ok:errors.length===0,total:this.journal.length,errors,warnings,idempotencyKeys:keys.size};
    }
  }

  return Object.freeze({
    ECONOMY_SCHEMA,CURRENCY_SCHEMA,WALLET_SCHEMA,ITEM_PRICE_SCHEMA,OPERATION_SCHEMA,PRICE_AUDIT_SCHEMA,DND5E_RULESET,
    PRICE_DIMENSIONS,DND5E_CURRENCIES,CurrencyService,normalizeCurrency,createWallet,parseDndMoney,createItemPriceModel,
    applyManualPriceOverride,quotePrice,decimalFromAtomic,
  });
});
