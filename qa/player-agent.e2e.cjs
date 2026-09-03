'use strict';

/*
 * Independent player journey. This runner is deliberately black-box:
 * it uses only Playwright browser/page/locator APIs and visible application UI.
 * Do not add storage, database, application-function or source-code access here.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const SITE_ROOT = path.resolve(process.env.QA_SITE_ROOT || REPO_ROOT);
const RUN_ID = process.env.QA_RUN_ID ||
  `player-agent-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
const ARTIFACT_DIR = path.resolve(process.env.QA_ARTIFACT_DIR || path.join(__dirname, 'evidence', RUN_ID));
const HEADLESS = !process.argv.includes('--headed') && process.env.QA_HEADLESS !== '0';
const HERO_NAME = `Элария QA ${RUN_ID.replace(/[^a-z0-9]/gi, '').slice(-6) || '001'}`;

const PLAYER_ROLE = 'Ты опытный игрок в D&D. Ты впервые открыл D&D World. Тебе неизвестна история разработки проекта. Начни новую кампанию и используй сайт так, как использовал бы его реальный игрок.';

const PHASES = Object.freeze([
  { id: 'P01', title: 'Новый герой и четыре готовых персонажа' },
  { id: 'P02', title: 'Сюжетная кампания и начало боя' },
  { id: 'P03', title: 'Подробное изучение интерфейса' },
  { id: 'P04', title: 'Инвентарь и разные предметные ситуации' },
  { id: 'P05', title: 'Оружие и броня: надеть, снять, применить' },
  { id: 'P06', title: 'Расходуемые предметы' },
  { id: 'P07', title: 'Бои с разными монстрами' },
  { id: 'P08', title: 'Заклинания, способности и черты' },
  { id: 'P09', title: 'Сцена и NPC' },
  { id: 'P10', title: 'Покупка и продажа' },
  { id: 'P11', title: 'Обмен валюты' },
  { id: 'P12', title: 'Сундуки' },
  { id: 'P13', title: 'Ловушка и мимик' },
  { id: 'P14', title: 'Пограничные и ошибочные сценарии' },
  { id: 'P15', title: 'Долгая кампания и сохранение состояний' }
]);

class QaFailure extends Error {
  constructor(actual) { super(actual); this.name = 'QaFailure'; }
}
class QaBlocked extends Error {
  constructor(actual) { super(actual); this.name = 'QaBlocked'; }
}

const results = [];
const consoleEvents = [];
const networkEvents = [];
const dialogEvents = [];
const dialogAnswers = [];
const dialogDecisions = [];
let page;
let browser;
let server;
let baseUrl;
let stepNumber = 0;
let walletCheckpoint = null;
const visibleStateMarkers = {};

function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

function mimeType(file) {
  return ({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.woff2': 'font/woff2'
  })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

async function startStaticServer() {
  server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      let relative = decodeURIComponent(requestUrl.pathname).replace(/^\/dnd-world\/?/, '');
      if (!relative || relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(SITE_ROOT, relative);
      const withinRoot = file === SITE_ROOT || file.startsWith(SITE_ROOT + path.sep);
      if (!withinRoot) { response.writeHead(403); response.end('Forbidden'); return; }
      const stat = await fsp.stat(file);
      if (!stat.isFile()) throw new Error('Not a file');
      response.writeHead(200, { 'content-type': mimeType(file), 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    } catch (_error) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}/dnd-world/`;
}

async function bodyText() {
  return (await page.locator('body').innerText()).replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

async function visibleWallet() {
  const wallet = {};
  for (const [key, label] of [['pm', /ПМ/], ['zm', /ЗМ/], ['em', /ЭМ/], ['sm', /СМ/], ['mm', /ММ/]]) {
    const input = page.locator('main .coin').filter({ visible: true, hasText: label }).locator('input[type="number"]').first();
    if (!await input.count()) throw new QaFailure(`В кошельке нет видимого поля «${key}».`);
    wallet[key] = Number(await input.inputValue());
  }
  return wallet;
}

async function visibleEconomyOperationCount() {
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const match = text.match(/Операций:\s*(\d+)/i);
  if (!match) throw new QaFailure('В инвентаре не показано количество денежных операций героя.');
  return Number(match[1]);
}

function walletCopperValue(wallet) {
  return Number(wallet.pm || 0) * 1000 + Number(wallet.zm || 0) * 100
    + Number(wallet.em || 0) * 50 + Number(wallet.sm || 0) * 10 + Number(wallet.mm || 0);
}

async function visibleSheetHitPoints() {
  const box = page.locator('main .cbox').filter({ visible: true, hasText: '♥ Хиты' }).first();
  if (!await box.count()) throw new QaFailure('В листе героя нет видимого счетчика хитов.');
  const inputs = box.locator('input[type="number"]');
  if (await inputs.count() < 2) throw new QaFailure('Счетчик хитов не показывает текущее и максимальное значения.');
  return { current: Number(await inputs.nth(0).inputValue()), max: Number(await inputs.nth(1).inputValue()) };
}

async function visibleSheetArmorClass() {
  const box = page.locator('main .cbox').filter({ visible: true, hasText: 'Класс доспеха' }).first();
  if (!await box.count()) throw new QaFailure('В листе героя нет видимого значения КД.');
  const value = Number((await box.locator('.cv').first().innerText()).trim());
  if (!Number.isFinite(value)) throw new QaFailure('Видимое значение КД не является числом.');
  return value;
}

async function visibleInventoryLedger() {
  const ledger = {};
  const cards = page.locator('main .entry-card').filter({ visible: true });
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    const heading = card.getByRole('heading').first();
    if (!await heading.count()) continue;
    const name = (await heading.innerText()).trim();
    const quantity = card.locator('.qty-box b').first();
    const count = await quantity.count() ? Number((await quantity.innerText()).trim()) : 1;
    ledger[name] = (ledger[name] || 0) + count;
  }
  return Object.fromEntries(Object.entries(ledger).sort(([left], [right]) => left.localeCompare(right, 'ru')));
}

async function visibleItemQuantityOrZero(name) {
  const heading = page.getByRole('heading', { name, exact: true }).filter({ visible: true });
  if (!await heading.count()) return 0;
  const card = heading.first().locator('xpath=..');
  const quantity = card.locator('.qty-box b').first();
  return await quantity.count() ? Number((await quantity.innerText()).trim()) : 1;
}

async function visibleItemEquipLabel(name) {
  const card = await itemCard(name);
  const button = card.getByRole('button', { name: /Надеть|Надето/i }).first();
  if (!await button.count()) throw new QaFailure(`У предмета «${name}» нет видимой подписи экипировки.`);
  return (await button.innerText()).trim();
}

async function visibleEquipmentItems() {
  await clickButton('Экипировка');
  return (await page.locator('main .mannequin .sitem').filter({ visible: true }).allTextContents()).map(value => value.trim()).filter(Boolean);
}

async function visibleCombatHitPoints(name) {
  await clickButton('⚔ Бой');
  const cards = page.locator('main .combatant').filter({ visible: true });
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    const actor = (await card.locator('.head b').first().innerText()).trim();
    if (actor !== name) continue;
    const meta = (await card.locator('.meta').first().innerText()).trim();
    const match = meta.match(/(\d+)\s*\/\s*(\d+)\s+хитов/i);
    if (!match) throw new QaFailure(`У участника «${name}» нет читаемой подписи хитов.`);
    return { current: Number(match[1]), max: Number(match[2]) };
  }
  throw new QaFailure(`Участник «${name}» не виден в боевом интерфейсе.`);
}

async function visibleCombatResource(pattern) {
  await clickButton('⚔ Бой');
  const resource = page.locator('main .combat-resources .combat-resource').filter({ visible: true, hasText: pattern }).first();
  if (!await resource.count()) throw new QaFailure(`В боевом интерфейсе нет ресурса ${String(pattern)}.`);
  return { text: (await resource.innerText()).trim(), className: await resource.getAttribute('class') || '' };
}

async function durableVisibleCampaignMarkers() {
  await clickButton('Персонажи');
  const back = page.getByRole('button', { name: '← К списку героев', exact: true }).filter({ visible: true });
  if (await back.count()) await back.first().click();
  const heroListText = await page.locator('main').innerText();

  await openCharacter('Року');
  await clickButton('Инвентарь');
  const roku = {
    wallet: await visibleWallet(),
    inventory: await visibleInventoryLedger(),
    swordLabel: await visibleItemEquipLabel('Короткий меч')
  };

  await openCharacter('Торгар Железная Вера');
  await clickButton('Инвентарь');
  const torgar = {
    hp: await visibleSheetHitPoints(),
    ac: await visibleSheetArmorClass(),
    potionQty: await visibleItemQuantityOrZero('Зелье великого лечения'),
    armorLabel: await visibleItemEquipLabel('Кольчуга Железного Щита')
  };

  await clickButton('Торговцы');
  const merchants = (await page.locator('main').innerText()).replace(/\s+/g, ' ').trim();
  await clickButton('Сундуки');
  const chestRows = (await page.locator('main .chest-list-row').filter({ visible: true }).allTextContents()).map(value => value.replace(/\s+/g, ' ').trim());

  await clickButton('⚔ Бой');
  const combatTitle = (await page.locator('main .combat-title').first().innerText()).trim();
  const mimicCards = page.locator('main .combatant').filter({ visible: true, hasText: /Сундук-мимик/i });
  return {
    heroPresent: heroListText.includes(HERO_NAME),
    roku,
    torgar,
    merchantPresent: merchants.includes('Мара Медная'),
    chestRows,
    combatTitle,
    ochreHp: await visibleCombatHitPoints('Охристое желе'),
    goblinHp: await visibleCombatHitPoints('Гоблин-разведчик'),
    mimicHp: await visibleCombatHitPoints(visibleStateMarkers.mimicCombatLabel || 'Сундук-мимик — мимик'),
    mimicCount: await mimicCards.count()
  };
}

function assertSameVisibleMarkers(expected, actual, checkpoint) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new QaFailure(`${checkpoint}: видимые маркеры кампании изменились после reload.\nДо: ${JSON.stringify(expected)}\nПосле: ${JSON.stringify(actual)}`);
  }
}

async function mainDomFragment() {
  const main = page.locator('main');
  const parts = [];
  for (const selector of ['#rollBack', '#castBack', '#showBack']) {
    const overlay = page.locator(selector).filter({ visible: true });
    if (await overlay.count()) parts.push(await overlay.first().evaluate(node => node.outerHTML));
  }
  if (await main.count()) {
    const visibleChildren = main.first().locator(':scope > *').filter({ visible: true });
    const count = Math.min(await visibleChildren.count(), 12);
    for (let index = 0; index < count; index += 1) {
      parts.push(await visibleChildren.nth(index).evaluate(node => node.outerHTML));
    }
  } else {
    parts.push(await page.locator('body').evaluate(node => node.outerHTML));
  }
  return parts.join('\n').slice(0, 24000);
}

async function uiMessages() {
  const selectors = ['#saveStatus', '[role="alert"]', '[aria-live]', '.toast', '.status', '.error', '.err'];
  const messages = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = Math.min(await locator.count(), 20);
    for (let index = 0; index < count; index += 1) {
      const row = locator.nth(index);
      if (await row.isVisible().catch(() => false)) {
        const text = (await row.innerText().catch(() => '')).trim();
        if (text && !messages.includes(text)) messages.push(text);
      }
    }
  }
  return messages;
}

async function dismissVisibleModal() {
  const showBack = page.locator('#showBack').filter({ visible: true });
  if (await showBack.count()) {
    const closeShowBack = showBack.getByRole('button', { name: /Закрыть/i }).last();
    if (await closeShowBack.count() && !await closeShowBack.isDisabled()) await closeShowBack.click().catch(() => {});
    await page.waitForTimeout(100);
  }
  const modal = page.locator('[role="dialog"], .modal, .cast-modal').filter({ visible: true }).last();
  if (!await modal.count()) return;
  const close = modal.getByRole('button', { name: /Отмена|Закрыть|Назад/i }).last();
  if (await close.count() && !await close.isDisabled()) await close.click().catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(100);
}

async function captureFailure(definition, status, actual, indexes) {
  const stem = `${String(definition.number).padStart(3, '0')}-${safeName(definition.id)}`;
  const screenshot = path.join(ARTIFACT_DIR, `${stem}.png`);
  const domFile = path.join(ARTIFACT_DIR, `${stem}.dom.html`);
  const evidenceFile = path.join(ARTIFACT_DIR, `${stem}.json`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  const domFragment = await mainDomFragment().catch(error => `DOM capture failed: ${error.message}`);
  await fsp.writeFile(domFile, domFragment, 'utf8');
  const evidence = {
    runId: RUN_ID,
    phase: definition.phase,
    stepNumber: definition.number,
    defectId: definition.id,
    status,
    url: page.url(),
    action: definition.action,
    expected: definition.expected,
    actual,
    screenshot: path.relative(REPO_ROOT, screenshot).replace(/\\/g, '/'),
    domFile: path.relative(REPO_ROOT, domFile).replace(/\\/g, '/'),
    evidenceFile: path.relative(REPO_ROOT, evidenceFile).replace(/\\/g, '/'),
    domFragment,
    uiMessages: await uiMessages().catch(() => []),
    consoleErrors: consoleEvents.slice(indexes.console).filter(event => event.type === 'error' || event.type === 'warning'),
    failedNetworkRequests: networkEvents.slice(indexes.network),
    dialogs: dialogEvents.slice(indexes.dialog),
    minimalReproduction: definition.reproduction
  };
  await fsp.writeFile(evidenceFile, JSON.stringify(evidence, null, 2), 'utf8');
  return evidence;
}

async function step(definition, action) {
  stepNumber += 1;
  const full = { ...definition, number: stepNumber };
  const indexes = { console: consoleEvents.length, network: networkEvents.length, dialog: dialogEvents.length };
  const startedAt = new Date().toISOString();
  try {
    const actual = await action();
    results.push({ ...full, status: 'PASS', startedAt, actual: actual || 'Ожидаемое состояние наблюдается.', url: page.url() });
  } catch (error) {
    const status = error instanceof QaBlocked ? 'BLOCKED' : 'FAIL';
    const actual = error && error.message ? error.message : String(error);
    const evidence = await captureFailure(full, status, actual, indexes);
    results.push({ ...full, status, startedAt, ...evidence });
    await dismissVisibleModal().catch(() => {});
  }
}

async function clickButton(name, options = {}) {
  const button = page.getByRole('button', { name, exact: options.exact !== false }).filter({ visible: true });
  if (await button.count() === 0) throw new QaFailure(`Кнопка «${name}» отсутствует.`);
  const target = button.first();
  if (await target.isDisabled()) throw new QaFailure(`Кнопка «${name}» недоступна: ${await target.getAttribute('title') || 'причина не показана'}.`);
  const tabId = await target.getAttribute('data-tab');
  if (tabId && /(?:^|\s)active(?:\s|$)/.test(await target.getAttribute('class') || '')) {
    const panel = page.locator(`#tab-${tabId}`);
    if (await panel.count() && await panel.isVisible()) {
      await page.waitForFunction(id => {
        const node = document.getElementById(`tab-${id}`);
        return Boolean(node && !node.classList.contains('hidden') && node.innerText.trim());
      }, tabId, { timeout: options.timeout || 10000 });
      await page.waitForTimeout(options.waitMs || 250);
      return;
    }
  }
  await target.click();
  await page.waitForTimeout(options.waitMs || 250);
}

async function selectOptionAnywhere(label) {
  const selects = page.locator('main select').filter({ visible: true });
  for (let index = 0; index < await selects.count(); index += 1) {
    const select = selects.nth(index);
    const labels = await select.locator('option').allTextContents();
    if (labels.some(value => value.trim() === label)) {
      await select.selectOption({ label });
      await page.waitForTimeout(150);
      return;
    }
  }
  throw new QaFailure(`В видимых списках нет варианта «${label}».`);
}

async function openCharacter(name) {
  await clickButton('Персонажи');
  const back = page.getByRole('button', { name: '← К списку героев', exact: true }).filter({ visible: true });
  if (await back.count()) {
    await back.first().click();
    await page.waitForTimeout(150);
  }
  const exact = page.getByText(name, { exact: true }).filter({ visible: true });
  if (await exact.count() === 0) throw new QaFailure(`Персонаж «${name}» не найден.`);
  await exact.first().click();
  await page.waitForTimeout(200);
  if (!await page.getByRole('button', { name: '← К списку героев', exact: true }).count()) {
    throw new QaFailure(`Карточка персонажа «${name}» не открылась.`);
  }
}

async function itemCard(name) {
  const heading = page.getByRole('heading', { name, exact: true }).filter({ visible: true });
  if (!await heading.count()) throw new QaFailure(`Предмет «${name}» не найден в инвентаре.`);
  return heading.first().locator('xpath=..');
}

async function clickCardButton(card, pattern) {
  const button = card.getByRole('button', { name: pattern }).first();
  if (!await button.count()) throw new QaFailure(`У предмета нет действия ${String(pattern)}.`);
  if (await button.isDisabled()) throw new QaFailure(`Действие ${String(pattern)} отключено без доступного пути продолжения.`);
  await button.click();
  await page.waitForTimeout(250);
}

async function fillVisibleRolls(values) {
  const modal = page.locator('#rollBack:visible .cast-modal, #castBack:visible .cast-modal, [role="dialog"]:visible').last();
  if (!await modal.count()) throw new QaFailure('Форма ручного ввода костей не появилась.');
  const inputs = modal.locator('input[type="number"]:visible');
  const count = await inputs.count();
  if (!count) throw new QaFailure('Форма ручного ввода костей не появилась.');
  for (let index = 0; index < count; index += 1) {
    await inputs.nth(index).fill(String(values[index] == null ? values[values.length - 1] : values[index]));
  }
}

async function selectVisibleCastTarget(name) {
  const select = page.locator('#castTarget').filter({ visible: true });
  if (!await select.count()) throw new QaFailure('В форме действия нет видимого структурированного выбора цели.');
  const options = select.locator('option');
  for (let index = 0; index < await options.count(); index += 1) {
    const option = options.nth(index);
    const label = (await option.innerText()).trim();
    if (label === name || label.startsWith(`${name} —`)) {
      await select.selectOption(await option.getAttribute('value'));
      await page.waitForTimeout(100);
      return;
    }
  }
  throw new QaFailure(`В выборе цели отсутствует «${name}».`);
}

async function assertNoSaveFailure(context) {
  await page.waitForTimeout(500);
  const text = await bodyText();
  const match = text.match(/Летопись не сохранена[^\n]*/i);
  if (match) throw new QaFailure(`${context}: ${match[0]}`);
}

async function combatCurrentActor() {
  await clickButton('⚔ Бой');
  const actor = page.locator('main .combat-stage-head .who');
  if (!await actor.count() || !await actor.first().isVisible().catch(() => false)) {
    throw new QaBlocked('Не удалось определить текущего участника боя по видимому интерфейсу.');
  }
  return (await actor.first().innerText()).trim();
}

async function advanceCombatTo(actorName, limit = 20) {
  for (let index = 0; index < limit; index += 1) {
    const current = await combatCurrentActor();
    if (current === actorName) return;
    const endTurn = page.getByRole('button', { name: /Завершить ход/i }).first();
    if (!await endTurn.count() || await endTurn.isDisabled()) {
      throw new QaBlocked(`Нельзя передать ход от «${current}» к «${actorName}» через видимый интерфейс.`);
    }
    await endTurn.click();
    await page.waitForTimeout(250);
  }
  throw new QaBlocked(`За ${limit} переходов хода участник «${actorName}» не получил ход.`);
}

async function advanceCombatToFresh(actorName) {
  const current = await combatCurrentActor();
  if (current === actorName) {
    const endTurn = page.getByRole('button', { name: /Завершить ход/i }).filter({ visible: true }).first();
    if (!await endTurn.count() || await endTurn.isDisabled()) {
      throw new QaBlocked(`Нельзя начать новый ход «${actorName}» через видимый интерфейс.`);
    }
    await endTurn.click();
    await page.waitForTimeout(250);
  }
  await advanceCombatTo(actorName);
}

async function startStoryCombatFromSetup() {
  await clickButton('⚔ Бой');
  const title = page.getByRole('textbox', { name: 'Название схватки' }).filter({ visible: true });
  if (!await title.count()) throw new QaFailure('Нет формы новой сюжетной схватки.');
  await title.fill('Медный Брод: проклятая шахта');
  for (const foeName of ['Гоблин-разведчик', 'Скелет-страж', 'Охристое желе']) {
    const row = page.locator('.combat-setup-row').filter({ visible: true, hasText: foeName }).first();
    const checkbox = row.locator('input[type="checkbox"]');
    if (!await checkbox.count()) throw new QaFailure(`У противника «${foeName}» нет выбора участия.`);
    if (!await checkbox.isChecked()) await checkbox.check();
  }
  const heroNames = ['Року', 'Торгар Железная Вера', 'Септих', 'Легерем', HERO_NAME];
  const initiatives = [18, 17, 13, 12, 10];
  for (let index = 0; index < heroNames.length; index += 1) {
    const row = page.locator('.combat-setup-row').filter({ visible: true, hasText: heroNames[index] }).first();
    const field = row.locator('input[type="number"]');
    if (!await field.count()) throw new QaFailure(`Нет ручного поля инициативы для «${heroNames[index]}».`);
    await field.fill(String(initiatives[index]));
  }
  for (const [foeName, initiative] of [['Гоблин-разведчик', 14], ['Скелет-страж', 9], ['Охристое желе', 6]]) {
    const row = page.locator('.combat-setup-row').filter({ visible: true, hasText: foeName }).first();
    await row.locator('input[type="number"]').fill(String(initiative));
  }
  await clickButton('⚔ Начать бой', { waitMs: 600 });
  const text = await bodyText();
  if (!text.includes('Медный Брод: проклятая шахта') || !/Раунд\s+1/i.test(text)) throw new QaFailure('После подтверждения не появился активный бой первого раунда.');
  await assertNoSaveFailure('Начало боя');
  return 'Активный бой создан из введенных игроком инициатив.';
}

async function runJourney() {
  await step({
    phase: 'P01', id: 'create-and-use-five-heroes',
    action: 'Открыть чистую кампанию, проверить четырех готовых героев, создать полуэльфа-паладина и снова открыть список.',
    expected: 'В списке одновременно видны Року, Торгар, Септих, Легерем и новый герой; изменение получает подтверждение сохранения.',
    reproduction: ['Открыть D&D World в чистом профиле.', 'Открыть «Персонажи».', 'По очереди открыть четырех готовых героев.', 'Создать нового полуэльфа-паладина.', 'Вернуться к списку.']
  }, async () => {
    await page.goto(`${baseUrl}?qa-run=${encodeURIComponent(RUN_ID)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('heading', { name: 'D&D World', exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    const existing = ['Року', 'Торгар Железная Вера', 'Септих', 'Легерем'];
    for (const name of existing) {
      await openCharacter(name);
      await clickButton('← К списку героев');
    }
    await clickButton('✠ Новый герой');
    await selectOptionAnywhere('Полуэльф');
    await selectOptionAnywhere('Паладин');
    const archetype = page.getByPlaceholder('Универсалист…').filter({ visible: true });
    if (await archetype.count()) await archetype.fill('Клятва Преданности');
    const nameInput = page.locator('#tab-chars .sheet-head input').filter({ visible: true }).first();
    await nameInput.fill(HERO_NAME);
    await nameInput.press('Tab');
    await page.waitForTimeout(250);
    if (await nameInput.inputValue() !== HERO_NAME) throw new QaFailure('Имя нового героя не удержалось в форме создания.');
    await clickButton('← К списку героев');
    const visible = await bodyText();
    for (const name of [...existing, HERO_NAME]) if (!visible.includes(name)) throw new QaFailure(`После создания в списке отсутствует «${name}».`);
    await assertNoSaveFailure('Создание героя');
    return `Создан ${HERO_NAME}; четыре исходных героя открыты через UI.`;
  });

  await step({
    phase: 'P02', id: 'start-story-combat',
    action: 'Назвать сюжетную сцену «Медный Брод: проклятая шахта», включить пятерых героев, гоблина, скелета и охристое желе, вручную ввести инициативу и начать бой.',
    expected: 'Бой начинается с рассчитанным порядком; сайт не бросает кости сам и сохраняет сцену.',
    reproduction: ['Открыть «Бой».', 'Выбрать участников.', 'Ввести фактические d20.', 'Нажать «Начать бой».']
  }, async () => {
    return startStoryCombatFromSetup();
  });

  await step({
    phase: 'P03', id: 'inspect-all-primary-sections',
    action: 'Открыть по очереди все основные разделы сайта и проверить, что каждый показывает содержимое и не застревает в загрузке.',
    expected: 'Каждый раздел отвечает, имеет осмысленное содержимое и позволяет вернуться.',
    reproduction: ['В верхней навигации последовательно открыть каждый раздел.', 'Зафиксировать пустой экран, вечную загрузку или непонятный отказ.']
  }, async () => {
    const sections = ['Персонажи', '⚔ Бой', 'Расы', 'Классы', 'Заклинания', 'Предметы', 'Сундуки', 'Торговцы', 'Способности', 'Противники', 'Справочник'];
    const observations = [];
    for (const section of sections) {
      await clickButton(section);
      const main = (await page.locator('main').innerText()).trim();
      if (main.length < 40) throw new QaFailure(`Раздел «${section}» открыл почти пустой экран.`);
      if (/загрузк[аи]…?$/i.test(main.slice(-80))) throw new QaFailure(`Раздел «${section}» остался в состоянии загрузки.`);
      observations.push(`${section}:${main.length}`);
    }
    return observations.join(', ');
  });

  await step({
    phase: 'P04', id: 'inventory-object-interactions',
    action: 'Открыть инвентарь Року, осмотреть оружие и воспользоваться действиями контейнера и книги.',
    expected: 'Каждое действие дает видимый результат либо ясное объяснение отказа; количество предметов не меняется без коммита.',
    reproduction: ['Персонажи → Року → Инвентарь.', 'Нажать «Открыть» у сумки и «Прочитать» у книги.', 'Закрыть появившиеся окна.']
  }, async () => {
    await openCharacter('Року');
    await clickButton('Инвентарь');
    const bag = await itemCard('Сумка с реагентами');
    const bagBefore = await mainDomFragment();
    await clickCardButton(bag, /Открыть/);
    const bagOverlay = page.locator('#showBack:visible, #castBack:visible, #rollBack:visible, [role="dialog"]:visible');
    if (!await bagOverlay.count() && await mainDomFragment() === bagBefore) {
      throw new QaFailure('«Открыть» у сумки не изменило DOM, не открыло окно и не объяснило отказ.');
    }
    await dismissVisibleModal();
    const book = await itemCard('Книга по истории');
    const bookBefore = await mainDomFragment();
    await clickCardButton(book, /Прочитать/);
    const bookOverlay = page.locator('#showBack:visible, #castBack:visible, #rollBack:visible, [role="dialog"]:visible');
    if (!await bookOverlay.count() && await mainDomFragment() === bookBefore) {
      throw new QaFailure('«Прочитать» у книги не изменило DOM, не открыло окно и не объяснило отказ.');
    }
    await dismissVisibleModal();
    return 'Действия сумки и книги дали отдельные видимые DOM-результаты; карточка короткого меча доступна для следующих фаз.';
  });

  await step({
    phase: 'P05', id: 'equip-unequip-weapon-and-armor',
    action: 'Завершить бой для привала, надеть и снять короткий меч Року, снять и вернуть броню Торгара, затем заново начать бой с ручными инициативами.',
    expected: 'Слот, подпись кнопки и КД синхронно меняются при каждом допустимом переключении.',
    reproduction: ['Року → Инвентарь → Короткий меч → Надеть/снять.', 'Торгар → Инвентарь → броня → снять/надеть.', 'Сравнить КД до и после.']
  }, async () => {
    await clickButton('⚔ Бой');
    dialogDecisions.push(true);
    try {
      await clickButton('Завершить бой', { waitMs: 400 });
    } finally {
      dialogDecisions.length = 0;
    }
    if (!await page.getByRole('textbox', { name: 'Название схватки' }).filter({ visible: true }).count()) throw new QaFailure('После подтверждения бой не завершился для допустимой смены доспехов в привале.');
    await openCharacter('Року');
    await clickButton('Инвентарь');
    if (!/Надето/i.test(await visibleItemEquipLabel('Короткий меч'))) {
      await clickCardButton(await itemCard('Короткий меч'), /Надеть/);
    }
    if (!/Надето/i.test(await visibleItemEquipLabel('Короткий меч'))) throw new QaFailure('После надевания подпись короткого меча не изменилась на «Надето».');
    let equipment = await visibleEquipmentItems();
    if (!equipment.includes('Короткий меч')) throw new QaFailure('Короткий меч помечен как надетый, но не виден в слотах экипировки.');
    await clickButton('Инвентарь');
    await clickCardButton(await itemCard('Короткий меч'), /Надето/);
    if (!/^Надеть$/i.test(await visibleItemEquipLabel('Короткий меч'))) throw new QaFailure('После снятия подпись короткого меча не вернулась к «Надеть».');
    equipment = await visibleEquipmentItems();
    if (equipment.includes('Короткий меч')) throw new QaFailure('Снятый короткий меч остался в видимом слоте экипировки.');
    await clickButton('Инвентарь');
    await clickCardButton(await itemCard('Короткий меч'), /Надеть/);

    await openCharacter('Торгар Железная Вера');
    await clickButton('Инвентарь');
    const armorName = 'Кольчуга Железного Щита';
    if (!/Надето/i.test(await visibleItemEquipLabel(armorName))) await clickCardButton(await itemCard(armorName), /Надеть/);
    const equippedAc = await visibleSheetArmorClass();
    await clickCardButton(await itemCard(armorName), /Надето/);
    const unequippedAc = await visibleSheetArmorClass();
    if (unequippedAc >= equippedAc) throw new QaFailure(`Снятие кольчуги не уменьшило видимый КД: ${equippedAc} → ${unequippedAc}.`);
    equipment = await visibleEquipmentItems();
    if (equipment.includes(armorName)) throw new QaFailure('Снятая кольчуга осталась в видимом слоте доспеха.');
    await clickButton('Инвентарь');
    await clickCardButton(await itemCard(armorName), /Надеть/);
    const restoredAc = await visibleSheetArmorClass();
    if (restoredAc !== equippedAc) throw new QaFailure(`После повторного надевания КД не восстановился: ${equippedAc} → ${restoredAc}.`);
    if (!/Надето/i.test(await visibleItemEquipLabel(armorName))) throw new QaFailure('Кольчуга вернула КД, но ее видимая подпись не показывает «Надето».');
    visibleStateMarkers.torgarArmorClass = restoredAc;
    await startStoryCombatFromSetup();
    return `Меч видимо перемещался в слот и обратно; снятие кольчуги изменило КД ${equippedAc} → ${unequippedAc}, повторное надевание вернуло ${restoredAc}.`;
  });

  await step({
    phase: 'P06', id: 'consume-item-with-manual-dice',
    action: 'На ходу Року сначала проверить запрет зелья Торгара, затем передать ход Торгару и применить зелье с вручную введенной суммой 4d4.',
    expected: 'Вне хода ввод костей и коммит недоступны с ясной причиной; в свой ход зелье расходуется ровно один раз и лечение применяется один раз.',
    reproduction: ['На ходу Року открыть лист Торгара.', 'Попытаться применить его зелье и проверить отказ до ввода костей.', 'Передать ход Торгару.', 'Повторить действие, ввести сумму реальных 4d4 и подтвердить.']
  }, async () => {
    await advanceCombatToFresh('Року');
    await openCharacter('Торгар Железная Вера');
    const damage = page.getByRole('button', { name: '−5', exact: true }).filter({ visible: true });
    if (!await damage.count()) throw new QaFailure('В листе Торгара нет видимой кнопки контрольного урона.');
    const hpBeforeDamage = await visibleSheetHitPoints();
    for (let index = 0; index < 4; index += 1) await damage.click();
    const hpAfterDamage = await visibleSheetHitPoints();
    if (hpAfterDamage.current !== hpBeforeDamage.current - 20) throw new QaFailure(`Четыре видимых применения −5 изменили хиты ${hpBeforeDamage.current} → ${hpAfterDamage.current}, а не на 20.`);
    await clickButton('Инвентарь');
    let potion = await itemCard('Зелье великого лечения');
    const outOfTurnQtyBefore = await visibleItemQuantityOrZero('Зелье великого лечения');
    let action = potion.getByRole('button', { name: /Выпить|Применить|Использовать|Лечение/i }).first();
    if (!await action.count()) throw new QaFailure('У зелья нет видимого действия применения.');
    const refusalByDisabledControl = await action.isDisabled();
    if (refusalByDisabledControl) {
      const reason = await action.getAttribute('title') || '';
      if (!/ход другого участника/i.test(reason)) throw new QaFailure(`Зелье вне хода отключено без ясной причины: ${reason || 'причина не показана'}.`);
    } else {
      await action.click();
      const refusal = page.getByText(/Сейчас ход другого участника/i).filter({ visible: true });
      const refusalShown = await refusal.waitFor({ timeout: 800 }).then(() => true, () => false);
      const rollInput = page.locator('#rollBack:visible input[type="number"], #castBack:visible input[type="number"], [role="dialog"]:visible input[type="number"]');
      if (await rollInput.count()) throw new QaFailure('Зелье Торгара дошло до ввода костей, хотя сейчас ход Року.');
      if (!refusalShown && !/Сейчас ход другого участника/i.test(await bodyText())) {
        throw new QaFailure('Попытка применить зелье вне хода не показала запрет и его причину.');
      }
    }
    const outOfTurnQtyAfter = await visibleItemQuantityOrZero('Зелье великого лечения');
    const outOfTurnHpAfter = await visibleSheetHitPoints();
    if (outOfTurnQtyAfter !== outOfTurnQtyBefore || outOfTurnHpAfter.current !== hpAfterDamage.current) {
      throw new QaFailure(`Отказ вне хода изменил мир: зелье ${outOfTurnQtyBefore} → ${outOfTurnQtyAfter}, хиты ${hpAfterDamage.current} → ${outOfTurnHpAfter.current}.`);
    }
    await page.waitForTimeout(900);
    if (!refusalByDisabledControl && !/Сейчас ход другого участника/i.test(await bodyText())) {
      throw new QaFailure('После завершения фонового сохранения причина отказа зелья была затёрта другим статусом.');
    }

    await advanceCombatTo('Торгар Железная Вера');
    const actionBefore = await visibleCombatResource(/(?:^|\s)Действие(?:\s|$)/i);
    if (!/\bready\b/.test(actionBefore.className)) throw new QaFailure(`В начале свежего хода Торгара действие не готово: ${actionBefore.text}.`);
    await openCharacter('Торгар Железная Вера');
    await clickButton('Инвентарь');
    const legalHpBefore = await visibleSheetHitPoints();
    const legalQtyBefore = await visibleItemQuantityOrZero('Зелье великого лечения');
    potion = await itemCard('Зелье великого лечения');
    action = potion.getByRole('button', { name: /Выпить|Применить|Использовать|Лечение/i }).first();
    if (!await action.count() || await action.isDisabled()) throw new QaFailure('В свой ход Торгар не может применить доступное зелье.');
    await action.click();
    await page.waitForTimeout(250);
    const next = page.getByRole('button', { name: /Перейти к броскам/i }).filter({ visible: true });
    if (!await next.count()) throw new QaFailure('Применение зелья не предлагает перейти к ручному броску лечения.');
    await next.click();
    await page.waitForTimeout(250);
    await fillVisibleRolls([12]);
    const apply = page.getByRole('button', { name: /Рассчитать и применить|Применить|Подтвердить|Готово/i }).filter({ visible: true }).last();
    if (!await apply.count()) throw new QaFailure('Форма лечения не предлагает единый коммит.');
    await apply.click();
    await page.waitForTimeout(400);
    const actionAfter = await visibleCombatResource(/(?:^|\s)Действие(?:\s|$)/i);
    if (!/\bused\b/.test(actionAfter.className)) throw new QaFailure(`Зелье применено, но видимый ресурс действия не израсходован: ${actionAfter.text}.`);
    await openCharacter('Торгар Железная Вера');
    await clickButton('Инвентарь');
    const legalHpAfter = await visibleSheetHitPoints();
    const legalQtyAfter = await visibleItemQuantityOrZero('Зелье великого лечения');
    const expectedHp = Math.min(legalHpBefore.max, legalHpBefore.current + 16);
    if (legalHpAfter.current !== expectedHp) throw new QaFailure(`Ручная сумма 4d4 = 12 и бонус +4 должны были изменить хиты ${legalHpBefore.current} → ${expectedHp}, фактически ${legalHpAfter.current}.`);
    if (legalQtyAfter !== legalQtyBefore - 1) throw new QaFailure(`Один коммит зелья изменил количество ${legalQtyBefore} → ${legalQtyAfter}, а не ровно на один.`);
    visibleStateMarkers.torgarHp = legalHpAfter;
    visibleStateMarkers.torgarPotionQty = legalQtyAfter;
    await advanceCombatToFresh('Року');
    return `Отказ вне хода сохранил ${legalQtyBefore} зелье и ${legalHpBefore.current} HP; законный коммит изменил HP до ${legalHpAfter.current}, удалил ровно одно зелье и израсходовал действие.`;
  });

  await step({
    phase: 'P07', id: 'combat-actions-against-varied-monsters',
    action: 'Вернуться в активный бой, проверить три цели, вручную ввести d20 и кость урона короткого меча по охристому желе и применить последствие.',
    expected: 'Все три противника доступны отдельными целями; ручные d20=18 и d6=4 уменьшают видимые хиты только выбранной цели.',
    reproduction: ['Открыть «Бой».', 'На ходу Року открыть «Оружие» и выбрать короткий меч.', 'Перебрать гоблина, скелета и охристое желе.', 'Выбрать желе, ввести d20=18 и d6=4, подтвердить и сверить его HP.']
  }, async () => {
    await advanceCombatToFresh('Року');
    const targetBefore = await visibleCombatHitPoints('Охристое желе');
    const goblinBeforeAttack = await visibleCombatHitPoints('Гоблин-разведчик');
    const skeletonBeforeAttack = await visibleCombatHitPoints('Скелет-страж');
    await clickButton('Оружие');
    const attack = page.getByRole('button', { name: /Короткий меч/i }).filter({ visible: true }).first();
    if (!await attack.count()) throw new QaFailure('В группе «Оружие» нет действия короткого меча Року.');
    if (await attack.isDisabled()) throw new QaFailure(`Короткий меч недоступен в ход Року: ${await attack.getAttribute('title') || 'причина не показана'}.`);
    await attack.click();
    await page.waitForTimeout(200);
    for (const target of ['Скелет-страж', 'Гоблин-разведчик', 'Охристое желе']) await selectVisibleCastTarget(target);
    const next = page.getByRole('button', { name: /Перейти к броскам/i }).filter({ visible: true });
    if (!await next.count()) throw new QaFailure('После выбора атаки нет перехода к ручному броску.');
    const before = await mainDomFragment();
    await next.click();
    await page.waitForTimeout(500);
    const after = await mainDomFragment();
    if (before === after) throw new QaFailure('Кнопка перехода к броскам не изменила интерфейс и не объяснила отказ.');
    await fillVisibleRolls([18, 4]);
    const apply = page.getByRole('button', { name: /Рассчитать и применить|Применить|Подтвердить|Готово/i }).filter({ visible: true }).last();
    if (!await apply.count()) throw new QaFailure('У ручных d20 и урона нет единого коммита.');
    await apply.click();
    await page.waitForTimeout(450);
    const attackFailure = page.locator('#showBack').filter({ visible: true });
    if (await attackFailure.count()) {
      const reason = (await attackFailure.locator('#showBody').innerText().catch(() => '')).trim();
      throw new QaFailure(`Ручная атака дошла до коммита, но сайт отклонил последствия${reason ? `: ${reason}` : ' без объяснения'}.`);
    }
    const targetAfter = await visibleCombatHitPoints('Охристое желе');
    const goblinAfterAttack = await visibleCombatHitPoints('Гоблин-разведчик');
    const skeletonAfterAttack = await visibleCombatHitPoints('Скелет-страж');
    if (targetAfter.current !== targetBefore.current - 6) throw new QaFailure(`Попадание d20=18 и ручной урон d6=4 должно было снять желе ровно 6 HP: ${targetBefore.current} → ${targetAfter.current}.`);
    if (JSON.stringify(goblinAfterAttack) !== JSON.stringify(goblinBeforeAttack) || JSON.stringify(skeletonAfterAttack) !== JSON.stringify(skeletonBeforeAttack)) {
      throw new QaFailure(`Одиночная атака изменила невыбранную цель: гоблин ${JSON.stringify(goblinBeforeAttack)} → ${JSON.stringify(goblinAfterAttack)}, скелет ${JSON.stringify(skeletonBeforeAttack)} → ${JSON.stringify(skeletonAfterAttack)}.`);
    }
    visibleStateMarkers.ochreHp = targetAfter;
    visibleStateMarkers.skeletonHp = skeletonAfterAttack;
    return `Атака с ручными d20=18 и d6=4 сняла желе ровно 6 HP (${targetBefore.current} → ${targetAfter.current}); HP гоблина и скелета не изменились.`;
  });

  await step({
    phase: 'P08', id: 'spells-abilities-features',
    action: 'На ходу Року ввести ручные d20 и d10 огненного заговора по гоблину, применить последствие, затем на ходу Септиха применить активную черту «Перевертыш».',
    expected: 'Ручные d20=18 и d10=6 уменьшают видимые HP гоблина; доступная активная черта имеет видимый коммит и расход действия.',
    reproduction: ['Бой → Заклинания.', 'Выбрать огненный заговор и гоблина.', 'Ввести d20=18, d10=6 и применить.', 'Передать ход Септиху.', 'Открыть «Способности», применить «Перевертыш» и сверить журнал/ресурс.']
  }, async () => {
    await advanceCombatToFresh('Року');
    const goblinBefore = await visibleCombatHitPoints('Гоблин-разведчик');
    const spellGroup = page.locator('main').getByRole('button', { name: 'Заклинания', exact: true }).filter({ visible: true }).first();
    if (!await spellGroup.count()) throw new QaFailure('В боевом интерфейсе Року нет группы «Заклинания».');
    await spellGroup.click();
    const fireBolt = page.locator('main').getByRole('button', { name: /Огненный (?:снаряд|сгусток)/i }).filter({ visible: true }).first();
    if (!await fireBolt.count() || await fireBolt.isDisabled()) throw new QaFailure('Базовый огненный заговор недоступен в ход Року без ясного маршрута продолжения.');
    await fireBolt.click();
    await page.waitForTimeout(200);
    await selectVisibleCastTarget('Гоблин-разведчик');
    const cast = page.getByRole('button', { name: /Наложить/i }).filter({ visible: true }).last();
    if (!await cast.count()) throw new QaFailure('После выбора заклинания и цели нет кнопки «Наложить».');
    const beforeCast = await mainDomFragment();
    await cast.click();
    await page.waitForTimeout(500);
    const afterCast = await mainDomFragment();
    if (beforeCast === afterCast) throw new QaFailure('Кнопка «Наложить» не изменила интерфейс и не объяснила отказ.');
    const castDistance = page.locator('#castDistance').filter({ visible: true });
    if (await castDistance.count()) await castDistance.selectOption('far');
    await fillVisibleRolls([18, 6]);
    let apply = page.getByRole('button', { name: /Рассчитать и применить|Применить|Подтвердить|Готово/i }).filter({ visible: true }).last();
    if (!await apply.count()) throw new QaFailure('У ручных костей заклинания нет единого коммита.');
    await apply.click();
    await page.waitForTimeout(450);
    const spellFailure = page.locator('#showBack').filter({ visible: true });
    if (await spellFailure.count()) {
      const reason = (await spellFailure.locator('#showBody').innerText().catch(() => '')).trim();
      throw new QaFailure(`Огненный заговор дошёл до коммита, но сайт отклонил последствия${reason ? `: ${reason}` : ' без объяснения'}.`);
    }
    const spellError = page.locator('#castErr').filter({ visible: true });
    if (await spellError.count()) throw new QaFailure(`Форма заклинания отклонила ручные значения: ${(await spellError.innerText()).trim()}`);
    const goblinAfter = await visibleCombatHitPoints('Гоблин-разведчик');
    const ochreAfterSpell = await visibleCombatHitPoints('Охристое желе');
    const skeletonAfterSpell = await visibleCombatHitPoints('Скелет-страж');
    if (goblinAfter.current !== goblinBefore.current - 6) throw new QaFailure(`Ручные d20=18 и d10=6 должны были снять гоблину ровно 6 HP: ${goblinBefore.current} → ${goblinAfter.current}.`);
    if (JSON.stringify(ochreAfterSpell) !== JSON.stringify(visibleStateMarkers.ochreHp) || JSON.stringify(skeletonAfterSpell) !== JSON.stringify(visibleStateMarkers.skeletonHp)) {
      throw new QaFailure(`Одиночный Fire Bolt изменил невыбранную цель: желе ${JSON.stringify(visibleStateMarkers.ochreHp)} → ${JSON.stringify(ochreAfterSpell)}, скелет ${JSON.stringify(visibleStateMarkers.skeletonHp)} → ${JSON.stringify(skeletonAfterSpell)}.`);
    }
    visibleStateMarkers.goblinHp = goblinAfter;

    await advanceCombatToFresh('Септих');
    const abilityGroup = page.locator('main .combat-groups').getByRole('button', { name: 'Способности', exact: true }).filter({ visible: true }).first();
    if (!await abilityGroup.count()) throw new QaFailure('В боевой панели Септиха нет группы «Способности».');
    await abilityGroup.click();
    const shapechange = page.getByRole('button', { name: /Перевертыш/i }).filter({ visible: true }).first();
    if (!await shapechange.count()) throw new QaFailure('В боевой группе «Способности» нет доступной активной черты Септиха «Перевертыш».');
    if (await shapechange.isDisabled()) throw new QaFailure(`Черта «Перевертыш» недоступна в свежий ход: ${await shapechange.getAttribute('title') || 'причина не показана'}.`);
    await shapechange.click();
    await page.waitForTimeout(200);
    if (await page.locator('#castStep3:visible').count()) throw new QaFailure('Новая черта открылась одновременно со старым третьим шагом заклинания.');
    const staleFormula = (await page.locator('#castFormula').innerText().catch(() => '')).trim();
    if (staleFormula) throw new QaFailure(`Новая черта сохранила формулу предыдущего заклинания: ${staleFormula}`);
    if (await page.locator('#castMultiWrap:visible').count()) throw new QaFailure('Новая черта сохранила блок дополнительных целей предыдущего действия.');
    const confirmAbility = page.locator('#castStep1:visible').getByRole('button', { name: /Перейти к броскам|Применить|Подтвердить/i }).first();
    if (!await confirmAbility.count()) throw new QaFailure('Активную черту нельзя подтвердить единым пользовательским действием.');
    await confirmAbility.click();
    await page.waitForTimeout(350);
    const abilityFormula = page.locator('#castStep3:visible');
    if (await abilityFormula.count()) {
      const abilityRollInputs = abilityFormula.locator('input[type="number"]:visible');
      if (await abilityRollInputs.count()) {
      await fillVisibleRolls([12]);
      }
      apply = abilityFormula.getByRole('button', { name: /Рассчитать и применить|Применить итог|Применить|Подтвердить|Готово/i }).first();
      if (!await apply.count()) throw new QaFailure('Форма черты не дала кнопку единого коммита.');
      await apply.click();
      await page.waitForTimeout(350);
    }
    const abilityAction = await visibleCombatResource(/(?:^|\s)Действие(?:\s|$)/i);
    const combatLog = await page.locator('#combatLogBox').innerText();
    if (!/\bused\b/.test(abilityAction.className) || !/Перевертыш/i.test(combatLog)) {
      throw new QaFailure(`Активная черта не дала проверяемый коммит: ресурс «${abilityAction.text}», запись в журнале ${/Перевертыш/i.test(combatLog) ? 'есть' : 'отсутствует'}.`);
    }
    visibleStateMarkers.septihAbilityCommitted = true;
    return `Огненный заговор с d20=18 и d10=6 изменил HP гоблина ${goblinBefore.current} → ${goblinAfter.current}; «Перевертыш» записан в журнал и израсходовал действие.`;
  });

  await step({
    phase: 'P09', id: 'scene-and-npc',
    action: 'Разместить объект на игровой сцене, осмотреть его и создать именованного NPC-торговца с привязкой к Медному Броду.',
    expected: 'Сценовый объект и NPC создаются только через видимые формы, появляются в UI и остаются доступны для следующих взаимодействий.',
    reproduction: ['На свежем ходу открыть «Сундуки».', 'Создать деревянный тайник, разместить на сцене и осмотреть.', 'Открыть «Торговцы».', 'Создать NPC Мару Медную с регионом и сюжетными признаками.']
  }, async () => {
    await advanceCombatToFresh('Року');
    await clickButton('Сундуки');
    await selectOptionAnywhere('Деревянный тайник');
    await clickButton('✠ Создать сундук');
    await clickButton('Разместить на сцене');
    const sceneRow = page.locator('main .chest-list-row').filter({ visible: true }).last();
    if (!await sceneRow.count()) throw new QaFailure('После размещения в сцене не появилась видимая строка объекта.');
    const inspectSceneObject = page.getByRole('button', { name: /Осмотреть/i }).filter({ visible: true }).first();
    if (!await inspectSceneObject.count() || await inspectSceneObject.isDisabled()) {
      throw new QaFailure(`Размещенный сценовый объект нельзя осмотреть: ${await inspectSceneObject.getAttribute('title').catch(() => '') || 'причина не показана'}.`);
    }
    await inspectSceneObject.click();
    await page.waitForTimeout(300);

    await clickButton('Торговцы');
    await selectOptionAnywhere('Торговец общими товарами · general');
    const create = page.getByRole('button', { name: /Создать и заполнить ассортимент|Новый торговец|Создать торговца|Создать NPC/i }).filter({ visible: true }).first();
    if (!await create.count()) throw new QaFailure('Нет видимого способа создать NPC-торговца.');
    const merchantName = page.getByPlaceholder('по профессии').filter({ visible: true });
    const merchantRegion = page.getByPlaceholder('любой').filter({ visible: true });
    const merchantFlags = page.getByPlaceholder('через запятую').filter({ visible: true });
    if (!await merchantName.count()) throw new QaFailure('Форма NPC не дает указать имя.');
    await merchantName.fill('Мара Медная');
    if (await merchantRegion.count()) await merchantRegion.fill('Медный Брод');
    if (await merchantFlags.count()) await merchantFlags.fill('шахта, проклятие');
    await create.click();
    await page.getByRole('heading', { name: 'Мара Медная', exact: true }).filter({ visible: true }).waitFor({ state: 'visible' });
    const renderedRegion = page.locator('#merchantRegion').filter({ visible: true });
    await renderedRegion.waitFor({ state: 'visible' });
    const npcText = await page.locator('main').innerText();
    if (!npcText.includes('Мара Медная') || await renderedRegion.inputValue() !== 'Медный Брод') {
      throw new QaFailure('Созданный NPC или его сценовый регион не появились в интерфейсе.');
    }
    return 'Деревянный тайник размещен и осмотрен на сцене; NPC Мара Медная создана в регионе Медный Брод и видна в UI.';
  });

  await step({
    phase: 'P10', id: 'merchant-buy-sell-atomicity',
    action: 'У NPC Медного Брода попытаться купить товар без денег, затем продать книгу и купить благовония.',
    expected: 'Недостаток денег дает ясный отказ без изменения остатков; продажа и покупка синхронно меняют деньги, инвентарь и ассортимент.',
    reproduction: ['Открыть созданную Мару Медную.', 'Купить товар с нулевым балансом.', 'Сверить кошелек, инвентарь и остаток.', 'Продать книгу.', 'Купить благовония и сверить обе стороны.']
  }, async () => {
    await openCharacter('Року');
    await clickButton('Инвентарь');
    const walletBeforeRefusal = await visibleWallet();
    const inventoryBeforeRefusal = await visibleInventoryLedger();
    await clickButton('Торговцы');
    if (!(await page.locator('main').innerText()).includes('Мара Медная')) throw new QaFailure('Созданный на предыдущем шаге NPC Мара Медная потерян до торговли.');
    const merchantStock = async name => {
      const rows = page.locator('main .merchant-row').filter({ visible: true, hasText: name });
      let total = 0;
      for (let index = 0; index < await rows.count(); index += 1) {
        const field = rows.nth(index).locator('input[title="Остаток"]').first();
        if (await field.count()) total += Number(await field.inputValue());
      }
      return total;
    };
    const bookStockBefore = await merchantStock('Книга по истории');
    let buy = page.getByRole('button', { name: /Купить/i }).filter({ visible: true }).first();
    if (!await buy.count()) throw new QaFailure('У торговца нет видимого действия покупки.');
    let firstStock = buy.locator('xpath=ancestor::*[contains(@class,"merchant-row")]').locator('input[title="Остаток"]').first();
    const stockBeforeRefusal = await firstStock.inputValue();
    await buy.click();
    await page.waitForTimeout(250);
    const after = await bodyText();
    if (!/недостаточно|не хватает|0\s*(?:зм|монет)/i.test(after)) throw new QaFailure('Покупка без денег не дала понятного объяснения отказа.');
    if (await firstStock.inputValue() !== stockBeforeRefusal) throw new QaFailure('После отклоненной покупки изменился остаток товара торговца.');

    await openCharacter('Року');
    await clickButton('Инвентарь');
    const walletAfterRefusal = await visibleWallet();
    const inventoryAfterRefusal = await visibleInventoryLedger();
    if (JSON.stringify(walletAfterRefusal) !== JSON.stringify(walletBeforeRefusal) || JSON.stringify(inventoryAfterRefusal) !== JSON.stringify(inventoryBeforeRefusal)) {
      throw new QaFailure(`Отклоненная покупка изменила кошелек или инвентарь: ${JSON.stringify(walletBeforeRefusal)}/${JSON.stringify(inventoryBeforeRefusal)} → ${JSON.stringify(walletAfterRefusal)}/${JSON.stringify(inventoryAfterRefusal)}.`);
    }
    await clickButton('Торговцы');

    const sellItem = page.locator('#merchantSellItem').filter({ visible: true });
    if (!await sellItem.count()) throw new QaFailure('У торговца нет выбора предмета для продажи.');
    await sellItem.selectOption({ label: 'Книга по истории ×1' });
    await page.locator('#merchantSellButton').filter({ visible: true }).click();
    await page.waitForTimeout(350);
    const refreshedSell = page.locator('#merchantSellItem').filter({ visible: true });
    const remainingOptions = await refreshedSell.locator('option').allTextContents();
    if (remainingOptions.some(label => label.trim() === 'Книга по истории ×1')) throw new QaFailure('После подтвержденной продажи книга осталась в инвентаре героя.');
    const bookStockAfter = await merchantStock('Книга по истории');
    if (bookStockAfter !== bookStockBefore + 1) throw new QaFailure(`Продажа не увеличила остаток книги у торговца ровно на один: ${bookStockBefore} → ${bookStockAfter}.`);

    await openCharacter('Року');
    await clickButton('Инвентарь');
    const walletAfterSale = await visibleWallet();
    const inventoryAfterSale = await visibleInventoryLedger();
    if (walletCopperValue(walletAfterSale) <= walletCopperValue(walletAfterRefusal)) throw new QaFailure(`Продажа книги не увеличила видимую стоимость кошелька: ${JSON.stringify(walletAfterRefusal)} → ${JSON.stringify(walletAfterSale)}.`);
    if (inventoryAfterSale['Книга по истории']) throw new QaFailure('Проданная книга все еще видна в инвентаре Року.');
    await clickButton('Торговцы');

    const incenseRow = page.locator('.merchant-row[data-merchant-item="it_incense_t"]').filter({ visible: true });
    if (!await incenseRow.count()) throw new QaFailure('После продажи нет доступного дешевого товара для контрольной покупки.');
    const incenseStock = incenseRow.locator('input[title="Остаток"]').first();
    const incenseBefore = Number(await incenseStock.inputValue());
    const incenseBuy = incenseRow.getByRole('button', { name: 'Купить', exact: true });
    if (!await incenseBuy.count() || await incenseBuy.isDisabled()) throw new QaFailure('Контрольная покупка благовоний недоступна без ясной причины.');
    await incenseBuy.click();
    await page.waitForTimeout(350);
    const incenseAfter = Number(await page.locator('.merchant-row[data-merchant-item="it_incense_t"] input[title="Остаток"]').filter({ visible: true }).inputValue());
    if (incenseAfter !== incenseBefore - 1) throw new QaFailure(`Покупка не уменьшила остаток благовоний ровно на один: ${incenseBefore} → ${incenseAfter}.`);

    await openCharacter('Року');
    await clickButton('Инвентарь');
    const walletAfterBuy = await visibleWallet();
    const inventoryAfterBuy = await visibleInventoryLedger();
    if ((inventoryAfterBuy['Благовония'] || 0) !== (inventoryAfterSale['Благовония'] || 0) + 1) throw new QaFailure('Купленные благовония не увеличились в инвентаре Року ровно на один.');
    if (inventoryAfterBuy['Книга по истории']) throw new QaFailure('Проданная книга снова появилась в инвентаре Року.');
    if (walletCopperValue(walletAfterBuy) >= walletCopperValue(walletAfterSale)) throw new QaFailure(`Покупка благовоний не уменьшила видимую стоимость кошелька: ${JSON.stringify(walletAfterSale)} → ${JSON.stringify(walletAfterBuy)}.`);
    await assertNoSaveFailure('Продажа и покупка');
    return `Отклоненная покупка сохранила кошелек, инвентарь и остаток; книга увеличила stock NPC ${bookStockBefore} → ${bookStockAfter}, благовония уменьшили stock ${incenseBefore} → ${incenseAfter}, а кошелек/инвентарь героя изменились согласованно.`;
  });

  await step({
    phase: 'P11', id: 'currency-exchange',
    action: 'Проверить отклонение неверного обмена, отмену без изменений и размен одной золотой монеты двойным нажатием через видимый интерфейс.',
    expected: 'Неверный ввод объяснен без мутации; отмена ничего не меняет; двойное подтверждение дает ровно один атомарный обмен и одну запись журнала без browser dialog.',
    reproduction: ['Продать книгу и купить благовония.', 'Року → Инвентарь.', 'Открыть «Обмен валюты» и выбрать одинаковые номиналы.', 'Убедиться в видимой причине отказа и неизменности кошелька/журнала.', 'Отменить, снова открыть форму и дважды подтвердить 1 зм → см.', 'Сверить точные изменения всех номиналов и ровно одну новую операцию.']
  }, async () => {
    await openCharacter('Року');
    await clickButton('Инвентарь');
    const walletBefore = await visibleWallet();
    const goldBefore = Number(walletBefore.zm);
    const silverBefore = Number(walletBefore.sm);
    if (goldBefore < 1) throw new QaFailure('После подтвержденной продажи и покупки у Року нет 1 зм для проверки размена.');
    const operationsBefore = await visibleEconomyOperationCount();
    const dialogStart = dialogEvents.length;
    await clickButton('⇄ Обмен валюты', { waitMs: 200 });
    const exchangeBack = page.locator('#economyExchangeBack');
    if (!await exchangeBack.isVisible()) throw new QaFailure('Кнопка обмена не открыла доступную DOM-форму.');
    const from = page.locator('#economyExchangeFrom');
    const to = page.locator('#economyExchangeTo');
    const amount = page.locator('#economyExchangeAmount');
    const reason = page.locator('#economyExchangeReason');
    if (!await from.count() || !await to.count() || !await amount.count() || !await reason.count()) throw new QaFailure('В форме обмена нет направления, количества или причины операции.');

    await from.selectOption('zm');
    await to.selectOption('zm');
    await amount.fill('1');
    await reason.fill('Black-box QA: запрещенный обмен одинаковых номиналов');
    await page.locator('#economyExchangeConfirm').click();
    const invalidError = page.locator('#economyExchangeErr');
    if (!await exchangeBack.isVisible() || !await invalidError.isVisible()) throw new QaFailure('Запрещенный обмен одинаковых номиналов не оставил форму открытой с видимой причиной отказа.');
    const invalidMessage = (await invalidError.innerText()).trim();
    if (!/выберите разные валюты/i.test(invalidMessage)) throw new QaFailure(`Причина отказа одинаковых номиналов непонятна: ${invalidMessage || 'сообщение пусто'}.`);
    const walletAfterInvalid = await visibleWallet();
    const operationsAfterInvalid = await visibleEconomyOperationCount();
    if (JSON.stringify(walletAfterInvalid) !== JSON.stringify(walletBefore) || operationsAfterInvalid !== operationsBefore) {
      throw new QaFailure(`Отклоненный обмен изменил кошелек или журнал: ${JSON.stringify(walletBefore)}/${operationsBefore} → ${JSON.stringify(walletAfterInvalid)}/${operationsAfterInvalid}.`);
    }

    await page.locator('#economyExchangeCancel').click();
    if (await exchangeBack.isVisible()) throw new QaFailure('Кнопка «Отмена» не закрыла форму обмена.');
    const walletAfterCancel = await visibleWallet();
    const operationsAfterCancel = await visibleEconomyOperationCount();
    if (JSON.stringify(walletAfterCancel) !== JSON.stringify(walletBefore) || operationsAfterCancel !== operationsBefore) {
      throw new QaFailure(`Отмена обмена изменила кошелек или журнал: ${JSON.stringify(walletBefore)}/${operationsBefore} → ${JSON.stringify(walletAfterCancel)}/${operationsAfterCancel}.`);
    }

    await clickButton('⇄ Обмен валюты', { waitMs: 200 });
    if (!await exchangeBack.isVisible()) throw new QaFailure('После отмены форма обмена не открылась повторно.');
    await from.selectOption('zm');
    await to.selectOption('sm');
    await amount.fill('1');
    await reason.fill('Black-box QA: размен у торговца');
    const balances = (await page.locator('#economyExchangeBalances').innerText()).trim();
    const preview = (await page.locator('#economyExchangePreview').innerText()).trim();
    if (!/Текущий кошелёк Року/i.test(balances) || !/Курс:\s*1\s+зм\s*=\s*10\s+см/i.test(preview) || !/получите\s+10\s+см/i.test(preview)) {
      throw new QaFailure(`Форма не объяснила баланс, курс и результат обмена: ${balances} | ${preview}`);
    }
    const confirmBox = await page.locator('#economyExchangeConfirm').boundingBox();
    if (!confirmBox) throw new QaFailure('Кнопка подтверждения обмена не имеет видимой области для двойного нажатия.');
    await page.mouse.dblclick(confirmBox.x + confirmBox.width / 2, confirmBox.y + confirmBox.height / 2, { delay: 20 });
    await page.waitForTimeout(350);
    if (await exchangeBack.isVisible()) {
      const refusal = (await page.locator('#economyExchangeErr').innerText().catch(() => '')).trim();
      throw new QaFailure(`Подтверждённый обмен не закрыл форму${refusal ? `: ${refusal}` : ' и не объяснил отказ'}.`);
    }
    const stepDialogs = dialogEvents.slice(dialogStart);
    if (stepDialogs.length !== 0) throw new QaFailure(`DOM-форма обмена неожиданно открыла ${stepDialogs.length} blocking browser dialog.`);
    const walletAfter = await visibleWallet(), expectedWallet = {...walletBefore, zm:goldBefore-1, sm:silverBefore+10};
    const operationsAfter = await visibleEconomyOperationCount();
    if (JSON.stringify(walletAfter) !== JSON.stringify(expectedWallet) || walletCopperValue(walletAfter) !== walletCopperValue(walletBefore)) {
      throw new QaFailure(`Размен 1 зм → 10 см изменил кошелек ${JSON.stringify(walletBefore)} на ${JSON.stringify(walletAfter)} вместо ${JSON.stringify(expectedWallet)}.`);
    }
    if (operationsAfter !== operationsBefore + 1) throw new QaFailure(`Двойное подтверждение создало не одну денежную операцию: ${operationsBefore} → ${operationsAfter}.`);
    walletCheckpoint = walletAfter;
    await assertNoSaveFailure('Обмен валюты');
    return `Неверный ввод и отмена сохранили кошелек/журнал; двойное подтверждение создало одну операцию без blocking dialog и разменяло ровно 1 зм: ${goldBefore}/${silverBefore} → ${walletAfter.zm}/${walletAfter.sm} зм/см.`;
  });

  await step({
    phase: 'P12', id: 'create-place-open-chest',
    action: 'Создать, утвердить и открыть деревянный тайник, сверить видимый инвентарь/деньги до и после, затем на свежем ходу повторить открытие.',
    expected: 'Первый коммит выдает видимую добычу и помечает ее выданной; повторное открытие запрещено по состоянию и не дублирует ни предметы, ни монеты.',
    reproduction: ['Открыть «Сундуки» и создать деревянный тайник.', 'Сгенерировать и утвердить добычу, разместить.', 'Снять UI-снимок кошелька и инвентаря Року.', 'Осмотреть и открыть, сверить выдачу.', 'На новом ходу повторить и сверить неизменность инвентаря/денег.']
  }, async () => {
    await advanceCombatToFresh('Року');
    await clickButton('Сундуки');
    await selectOptionAnywhere('Деревянный тайник');
    await clickButton('✠ Создать сундук');
    const lockType = page.getByRole('combobox', { name: 'Тип замка' }).filter({ visible: true });
    if (!await lockType.count()) throw new QaFailure('У сундука нет видимого структурированного типа замка.');
    await lockType.selectOption('none');
    await clickButton('Сгенерировать');
    const approve = page.getByRole('button', { name: 'Утвердить', exact: true }).filter({ visible: true });
    if (await approve.count() && !await approve.isDisabled()) await approve.click();
    await clickButton('Разместить на сцене');
    const inspect = page.getByRole('button', { name: /Осмотреть/i }).filter({ visible: true }).first();
    if (!await inspect.count() || await inspect.isDisabled()) throw new QaFailure('Размещенный сундук нельзя осмотреть, либо причина блокировки неясна.');
    await inspect.click();
    await page.waitForTimeout(300);
    await advanceCombatToFresh('Року');
    await openCharacter('Року');
    await clickButton('Инвентарь');
    const lootLedgerBefore = await visibleInventoryLedger();
    const lootWalletBefore = await visibleWallet();
    await clickButton('Сундуки');
    const open = page.getByRole('button', { name: /Открыть/i }).filter({ visible: true }).last();
    if (!await open.count()) throw new QaFailure('У размещенного сундука нет действия открытия.');
    if (await open.isDisabled()) throw new QaFailure(`Открытие сундука недоступно: ${await open.getAttribute('title') || 'причина не показана'}.`);
    const beforeOpen = await mainDomFragment();
    await open.click();
    await page.waitForTimeout(350);
    const afterOpen = await mainDomFragment();
    if (beforeOpen === afterOpen) throw new QaFailure('Кнопка открытия сундука не изменила интерфейс и не объяснила отказ.');
    const chestAfterFirstOpen = await bodyText();
    if (!/состояние:\s*открыт|выдано игроку/i.test(chestAfterFirstOpen)) throw new QaFailure('После коммита сундук не показал состояние «открыт»/«выдано игроку».');
    await openCharacter('Року');
    await clickButton('Инвентарь');
    const lootLedgerAfterFirst = await visibleInventoryLedger();
    const lootWalletAfterFirst = await visibleWallet();
    if (JSON.stringify(lootLedgerAfterFirst) === JSON.stringify(lootLedgerBefore) && JSON.stringify(lootWalletAfterFirst) === JSON.stringify(lootWalletBefore)) {
      throw new QaFailure('Утвержденный сундук открыт, но ни видимый инвентарь, ни кошелек героя не изменились.');
    }

    await advanceCombatToFresh('Року');
    await clickButton('Сундуки');
    const repeatOpen = page.getByRole('button', { name: /Открыть/i }).filter({ visible: true }).last();
    if (!await repeatOpen.count()) throw new QaFailure('После первого открытия исчез контрол состояния сундука.');
    if (await repeatOpen.isDisabled()) {
      const explanation = `${await repeatOpen.getAttribute('title') || ''} ${await repeatOpen.innerText()}`;
      if (!/открыт|уже|состоян/i.test(explanation)) throw new QaFailure(`Повторное открытие отключено без понятной причины: ${explanation.trim() || 'пусто'}.`);
    } else {
      await repeatOpen.click();
      await page.waitForTimeout(300);
      if (!/уже открыт|нельзя открыть/i.test(await bodyText())) throw new QaFailure('Повторное открытие было активно и не объяснило отказ по состоянию.');
    }
    await openCharacter('Року');
    await clickButton('Инвентарь');
    const lootLedgerAfterRepeat = await visibleInventoryLedger();
    const lootWalletAfterRepeat = await visibleWallet();
    if (JSON.stringify(lootLedgerAfterRepeat) !== JSON.stringify(lootLedgerAfterFirst) || JSON.stringify(lootWalletAfterRepeat) !== JSON.stringify(lootWalletAfterFirst)) {
      throw new QaFailure(`Повторная попытка открытия дублировала или потеряла добычу: ${JSON.stringify(lootLedgerAfterFirst)}/${JSON.stringify(lootWalletAfterFirst)} → ${JSON.stringify(lootLedgerAfterRepeat)}/${JSON.stringify(lootWalletAfterRepeat)}.`);
    }
    visibleStateMarkers.rokuInventoryAfterChest = lootLedgerAfterRepeat;
    visibleStateMarkers.rokuWalletAfterChest = lootWalletAfterRepeat;
    return 'Первое открытие видимо выдало добычу; на свежем ходу повтор запрещен по состоянию, и весь UI-ledger остался неизменным.';
  });

  await step({
    phase: 'P13', id: 'trap-and-mimic',
    action: 'Создать сундук с ловушкой и сундук-мимик, проверить обнаружение/обезвреживание и открыть мимик с ручной инициативой.',
    expected: 'Ловушка не срабатывает без проверки; мимик становится боевым участником после ручного d20, без дублирования добычи.',
    reproduction: ['Создать и разместить сундук с ловушкой.', 'Проверить и обезвредить.', 'Создать и разместить мимик.', 'Открыть, ввести d20 инициативы, подтвердить.']
  }, async () => {
    await advanceCombatToFresh('Року');
    await clickButton('Сундуки');
    await selectOptionAnywhere('Сундук с ловушкой');
    await clickButton('✠ Создать сундук');
    await clickButton('Разместить на сцене');
    let check = page.getByRole('button', { name: /Проверить/i }).filter({ visible: true }).last();
    if (!await check.count() || await check.isDisabled()) throw new QaFailure('Ловушку нельзя проверить, либо отказ не объяснен.');
    await check.click();
    await page.waitForTimeout(250);
    await fillVisibleRolls([20]);
    let apply = page.getByRole('button', { name: /Рассчитать и применить|Применить|Подтвердить|Готово/i }).filter({ visible: true }).last();
    if (!await apply.count()) throw new QaFailure('Проверку ловушки нельзя подтвердить единым коммитом.');
    await apply.click();
    await page.waitForTimeout(350);

    await advanceCombatToFresh('Року');
    await clickButton('Сундуки');
    const disarm = page.getByRole('button', { name: /Обезвредить/i }).filter({ visible: true }).last();
    if (!await disarm.count() || await disarm.isDisabled()) throw new QaFailure(`Обнаруженную ловушку нельзя обезвредить: ${await disarm.getAttribute('title') || 'причина не показана'}.`);
    await disarm.click();
    await page.waitForTimeout(250);
    await fillVisibleRolls([20]);
    apply = page.getByRole('button', { name: /Рассчитать и применить|Применить|Подтвердить|Готово/i }).filter({ visible: true }).last();
    if (!await apply.count()) throw new QaFailure('Обезвреживание ловушки нельзя подтвердить единым коммитом.');
    await apply.click();
    await page.waitForTimeout(350);
    if (!/обезвреж/i.test(await bodyText())) throw new QaFailure('После успешного ручного броска состояние ловушки не объяснено как обезвреженное.');

    await advanceCombatToFresh('Року');
    await clickButton('Сундуки');
    await selectOptionAnywhere('Сундук-мимик');
    await clickButton('✠ Создать сундук');
    await clickButton('Разместить на сцене');
    const open = page.getByRole('button', { name: /Открыть/i }).filter({ visible: true }).last();
    if (!await open.count() || await open.isDisabled()) throw new QaFailure('Размещенный мимик нельзя открыть, либо отказ не объяснен.');
    await open.click();
    await page.waitForTimeout(250);
    await fillVisibleRolls([11]);
    apply = page.getByRole('button', { name: /Рассчитать и применить|Применить|Подтвердить|Готово/i }).filter({ visible: true }).last();
    if (!await apply.count()) throw new QaFailure('Инициативу мимика нельзя подтвердить.');
    await apply.click();
    await page.waitForTimeout(450);
    await clickButton('⚔ Бой');
    const mimicInitiative = page.locator('main .combat-init-card').filter({ visible: true, hasText: /Сундук-мимик/i });
    const mimicParticipant = page.locator('main .combatant').filter({ visible: true, hasText: /Сундук-мимик/i });
    if (await mimicInitiative.count() !== 1 || await mimicParticipant.count() !== 1) {
      throw new QaFailure(`После ручной инициативы мимик не появился ровно один раз: initiative=${await mimicInitiative.count()}, participant=${await mimicParticipant.count()}.`);
    }
    const mimicMeta = (await mimicParticipant.first().locator('.meta').innerText()).trim();
    const mimicHead = (await mimicParticipant.first().locator('.head').innerText()).trim();
    if (!/58\s*\/\s*58\s+хитов/i.test(mimicMeta) || !/КД\s+12/i.test(mimicHead)) {
      throw new QaFailure(`Мимик появился без видимого полного stat block: ${mimicHead}; ${mimicMeta}.`);
    }
    visibleStateMarkers.mimicCombatLabel = (await mimicParticipant.first().locator('.head b').innerText()).trim();
    visibleStateMarkers.mimicHp = { current: 58, max: 58 };
    return 'Ловушка обнаружена и обезврежена двумя ручными проверками; мимик вошел в иницативу ровно один раз и виден как боевой участник с КД 12 и 58/58 HP.';
  });

  await step({
    phase: 'P14', id: 'negative-boundary-cases',
    action: 'На ходу Року попытаться развести костер трутницей Торгара и снять его щит через отдельную вкладку «Экипировка».',
    expected: 'Оба действия чужого персонажа запрещены по actor-key до последствий и коммита; костер, слот, КД, очередь и весь budget не меняются.',
    reproduction: ['Довести активный бой до хода Року.', 'Торгар → Инвентарь → Трутница → «Высечь огонь».', 'Торгар → Экипировка → слот «Вторая рука» → «Снять».', 'Сверить причины, КД, слот, очередь и ресурсы.']
  }, async () => {
    await advanceCombatTo('Року');
    const turnBefore = await combatCurrentActor();
    const resourcesBefore = await page.locator('main .combat-resources .combat-resource').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => ({ text: node.textContent.trim(), className: node.className })));
    await openCharacter('Торгар Железная Вера');
    await clickButton('Инвентарь');
    let tinderbox = await itemCard('Трутница');
    let fire = tinderbox.getByRole('button', { name: /Высечь огонь|Развести костер|Зажечь/i }).first();
    if (!await fire.count()) throw new QaFailure('У трутницы нет видимого прямого действия огня.');
    const fireLabelBefore = (await fire.innerText()).trim();
    await fire.click();
    await page.waitForTimeout(300);
    if (!/Сейчас ход другого участника/i.test(await bodyText())) throw new QaFailure('Прямое действие трутницы не объяснило actor-key отказ как чужой ход.');
    tinderbox = await itemCard('Трутница');
    fire = tinderbox.getByRole('button', { name: /Высечь огонь|Развести костер|Зажечь|Потушить костер/i }).first();
    if (!await fire.count() || (await fire.innerText()).trim() !== fireLabelBefore) throw new QaFailure('Отказ прямого item-action всё же создал или изменил костер Торгара.');
    const acBefore = await visibleSheetArmorClass();
    const equipmentBefore = await visibleEquipmentItems();
    if (!equipmentBefore.includes('Святой Щит Жизни')) throw new QaBlocked('Щит Торгара недоступен во вкладке экипировки для actor-key проверки.');
    const shieldSlot = page.locator('main .slot-cell').filter({ visible: true, hasText: 'Святой Щит Жизни' }).first();
    if (!await shieldSlot.count()) throw new QaFailure('Надетый щит не связан с видимым слотом экипировки.');
    await shieldSlot.click();
    const remove = page.getByRole('button', { name: 'Снять', exact: true }).filter({ visible: true }).first();
    if (!await remove.count()) throw new QaFailure('У занятого слота щита нет действия «Снять».');
    await remove.click();
    await page.waitForTimeout(300);
    if (!/Сейчас ход другого участника/i.test(await bodyText())) throw new QaFailure('Вкладка экипировки не объяснила actor-key отказ как чужой ход.');
    const acAfter = await visibleSheetArmorClass();
    const equipmentAfter = await visibleEquipmentItems();
    const turnAfter = await combatCurrentActor();
    const resourcesAfter = await page.locator('main .combat-resources .combat-resource').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => ({ text: node.textContent.trim(), className: node.className })));
    if (acAfter !== acBefore || JSON.stringify(equipmentAfter) !== JSON.stringify(equipmentBefore) || turnAfter !== turnBefore || JSON.stringify(resourcesAfter) !== JSON.stringify(resourcesBefore)) {
      throw new QaFailure(`Отказ смены щита изменил состояние: КД ${acBefore} → ${acAfter}, слот ${JSON.stringify(equipmentBefore)} → ${JSON.stringify(equipmentAfter)}, ход ${turnBefore} → ${turnAfter}, budget ${JSON.stringify(resourcesBefore)} → ${JSON.stringify(resourcesAfter)}.`);
    }
    return `Трутница и вкладка экипировки отклонили действия чужого героя по actor-key; костер не появился, КД ${acBefore}, слот, ход ${turnBefore} и весь budget остались неизменны.`;
  });

  await step({
    phase: 'P15', id: 'reload-persistence-checkpoint',
    action: 'Снять полный UI-снимок героя, HP, КД, расходника, денег, инвентаря, торговца, сундуков и боя; выполнить reload checkpoint #1, вписать новый видимый маркер в лист героя, затем выполнить reload checkpoint #2.',
    expected: 'Обе независимые перезагрузки точно восстанавливают все видимые маркеры; между ними новое UI-изменение также сохраняется.',
    reproduction: ['После всех игровых фаз снять видимые маркеры из листов, кошелька, торговли, сундуков и боя.', 'Дождаться UI-подтверждения сохранения и сделать reload #1.', 'Сверить весь UI-снимок.', 'В «Записи» нового героя вписать уникальный маркер и дождаться сохранения.', 'Сделать reload #2, снова сверить весь UI-снимок и маркер «Игрок».']
  }, async () => {
    const checkpointBaseline = await durableVisibleCampaignMarkers();
    if (!checkpointBaseline.heroPresent) throw new QaFailure('Новый герой потерян еще до первой перезагрузки.');
    if (!checkpointBaseline.merchantPresent || checkpointBaseline.mimicCount !== 1 || checkpointBaseline.chestRows.length < 4) {
      throw new QaFailure('Базовый UI-снимок не содержит торговца, четырех сценовых сундуков или одного мимика.');
    }
    walletCheckpoint = checkpointBaseline.roku.wallet;
    await assertNoSaveFailure('Перед reload checkpoint #1');

    // Checkpoint #1: a full reload after combat, commerce, loot and consumable commits.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('heading', { name: 'D&D World', exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1600);
    const checkpointOne = await durableVisibleCampaignMarkers();
    assertSameVisibleMarkers(checkpointBaseline, checkpointOne, 'Reload checkpoint #1');
    await assertNoSaveFailure('Reload checkpoint #1');

    const recordMarker = `player-checkpoint-${RUN_ID}`;
    await openCharacter(HERO_NAME);
    await clickButton('Записи');
    const playerField = page.locator('main label').filter({ visible: true, hasText: 'Игрок' }).locator('xpath=..').locator('input[type="text"]').first();
    if (!await playerField.count()) throw new QaFailure('В «Записях» нового героя нет видимого поля «Игрок» для межсессионного маркера.');
    await playerField.fill(recordMarker);
    await playerField.blur();
    await page.waitForTimeout(1200);
    if (await playerField.inputValue() !== recordMarker) throw new QaFailure('Новый маркер не закрепился в видимом поле до второго reload.');
    await assertNoSaveFailure('Новый UI-маркер перед reload checkpoint #2');

    // Checkpoint #2: a later reload after a new visible mutation committed between sessions.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('heading', { name: 'D&D World', exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1600);
    const checkpointTwo = await durableVisibleCampaignMarkers();
    assertSameVisibleMarkers(checkpointBaseline, checkpointTwo, 'Reload checkpoint #2');
    await openCharacter(HERO_NAME);
    await clickButton('Записи');
    const restoredPlayerField = page.locator('main label').filter({ visible: true, hasText: 'Игрок' }).locator('xpath=..').locator('input[type="text"]').first();
    if (!await restoredPlayerField.count() || await restoredPlayerField.inputValue() !== recordMarker) {
      throw new QaFailure(`Reload checkpoint #2: межсессионный UI-маркер «${recordMarker}» не восстановлен.`);
    }
    await assertNoSaveFailure('Reload checkpoint #2');
    return `Два reload checkpoint восстановили одинаковые UI-маркеры героя, HP/КД, зелья, денег, инвентаря, торговца, ${checkpointBaseline.chestRows.length} сценовых сундуков, боя и мимика; новый маркер «Игрок» между reload также сохранен.`;
  });
}

async function main() {
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true });
  baseUrl = process.env.DND_WORLD_QA_URL || await startStaticServer();
  const launchOptions = { headless: HEADLESS };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = path.resolve(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH);
  }
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', serviceWorkers: 'block' });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', message => consoleEvents.push({ type: message.type(), text: message.text(), location: message.location(), at: new Date().toISOString() }));
  page.on('pageerror', error => consoleEvents.push({ type: 'error', text: error.message, stack: error.stack, at: new Date().toISOString() }));
  page.on('requestfailed', request => networkEvents.push({ kind: 'requestfailed', method: request.method(), url: request.url(), failure: request.failure(), at: new Date().toISOString() }));
  page.on('response', response => { if (response.status() >= 400) networkEvents.push({ kind: 'http', method: response.request().method(), url: response.url(), status: response.status(), at: new Date().toISOString() }); });
  page.on('dialog', async dialog => {
    const answer = dialog.type() === 'prompt' && dialogAnswers.length ? dialogAnswers.shift() : null;
    const decision = dialog.type() === 'confirm' && dialogDecisions.length ? dialogDecisions.shift() : false;
    const accepted = answer != null || decision === true;
    dialogEvents.push({ type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue(), accepted, at: new Date().toISOString() });
    if (answer != null) await dialog.accept(answer).catch(() => {});
    else if (decision === true) await dialog.accept().catch(() => {});
    else await dialog.dismiss().catch(() => {});
  });

  try {
    await runJourney();
  } finally {
    const summary = {
      schemaVersion: 'dnd-world-player-agent-run/1', runId: RUN_ID, role: PLAYER_ROLE,
      targetUrl: baseUrl, startedWithCleanBrowserContext: true,
      blackBoxGuarantees: ['visible UI only', 'DOM evidence only', 'no application storage access', 'no internal function calls', 'all dice values supplied by scenario'],
      phases: PHASES,
      counts: results.reduce((counts, result) => { counts[result.status] = (counts[result.status] || 0) + 1; return counts; }, { PASS: 0, FAIL: 0, BLOCKED: 0 }),
      results, consoleEvents, networkEvents, dialogEvents
    };
    await fsp.writeFile(path.join(ARTIFACT_DIR, 'run.json'), JSON.stringify(summary, null, 2), 'utf8');
    await browser?.close().catch(() => {});
    await new Promise(resolve => server ? server.close(resolve) : resolve());
    process.stdout.write(`${JSON.stringify({ runId: RUN_ID, artifactDir: ARTIFACT_DIR, counts: summary.counts }, null, 2)}\n`);
    if (summary.counts.FAIL) process.exitCode = 1;
  }
}

main().catch(async error => {
  await browser?.close().catch(() => {});
  if (server && server.listening) await new Promise(resolve => server.close(resolve));
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
