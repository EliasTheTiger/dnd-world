import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const exchangeStart=html.indexOf('const ECONOMY_EXCHANGE_CURRENCIES');
const exchangeEnd=html.indexOf('function economyManualSettingAudit',exchangeStart);
const exchangeFlow=html.slice(exchangeStart,exchangeEnd);

test('inventory exposes journal integrity verification to the GM',()=>{
  assert.match(html,/function economyVerifyJournal\(\)/);
  assert.match(html,/onclick="economyVerifyJournal\(\)"[^>]*>Проверить журнал<\/button>/);
  assert.match(html,/service\.verifyJournal\(\)/);
  assert.match(html,/журнал цел/);
});

test('inventory journal shows an account statement and duplicate-request protection',()=>{
  assert.match(html,/service\.accountStatement\(accountId\)/);
  assert.match(html,/чистое изменение/);
  assert.match(html,/защита повтора/);
  assert.match(html,/idempotencyKey/);
  assert.match(html,/character-wallet-adjust:/);
  assert.match(html,/character-wallet-change:/);
  assert.match(html,/character-wallet-exchange:/);
  assert.match(html,/merchant-wallet-adjust:/);
});

test('currency exchange is an accessible DOM form and never depends on blocking prompt',()=>{
  assert.ok(exchangeStart>=0&&exchangeEnd>exchangeStart,'currency exchange production flow must be present');
  assert.match(html,/id="economyExchangeBack"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html,/id="economyExchangeForm"[^>]*onsubmit="event\.preventDefault\(\);economyExchangeCommit\(\)"/);
  for(const id of ['economyExchangeFrom','economyExchangeTo','economyExchangeAmount','economyExchangeReason']){
    assert.match(html,new RegExp(`<label[^>]+for="${id}"`));
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/id="economyExchangeAmount"[^>]*type="number"[^>]*min="1"[^>]*step="1"/);
  assert.match(html,/id="economyExchangePreview"[^>]*aria-live="polite"/);
  assert.match(html,/id="economyExchangeErr"[^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(html,/id="economyExchangeConfirm"[^>]*type="submit"/);
  assert.match(html,/id="economyExchangeCancel"[^>]*>Отмена<\/button>/);
  assert.doesNotMatch(exchangeFlow,/\b(?:window\.)?prompt\s*\(/);
});

test('currency exchange validates, previews and single-flights one atomic service commit',()=>{
  assert.equal((exchangeFlow.match(/\.exchange\s*\(/g)||[]).length,1,'UI submit must call CurrencyService.exchange exactly once');
  assert.match(exchangeFlow,/if\(economyExchangeBusy\)return false/);
  assert.match(exchangeFlow,/economyExchangeSetBusy\(true\)/);
  assert.match(exchangeFlow,/for\(const control of \[el\.from,el\.to,el\.amount,el\.reason,el\.confirm,el\.cancel\]\)if\(control\)control\.disabled=economyExchangeBusy/);
  assert.match(exchangeFlow,/Количество отдаваемых монет должно быть положительным целым числом/);
  assert.match(exchangeFlow,/Выберите разные валюты/);
  assert.match(exchangeFlow,/Недостаточно .*нужно .*доступно/);
  assert.match(exchangeFlow,/Выбранная сумма даёт дробную монету/);
  assert.match(exchangeFlow,/Укажите причину обмена для денежного журнала/);
  assert.match(exchangeFlow,/Курс: 1 /);
  assert.match(exchangeFlow,/Текущий кошелёк /);
  const rejection=exchangeFlow.indexOf('if(!result||!result.ok)');
  const save=exchangeFlow.indexOf('scheduleSave()');
  assert.ok(rejection>=0&&save>rejection,'render/save may run only after a successful service result');
  assert.match(exchangeFlow,/economyExchangeClose\(\);scheduleSave\(\);renderChars\(\)/);
});
