'use strict';

// A disposable campaign, UI file chooser and real downloaded files only.
// No application functions, storage inspection, cloud account or existing user campaign.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..', process.env.QA_SITE_ROOT || '.');
const output = path.resolve(process.env.QA_ARTIFACT_DIR || path.join(__dirname, 'evidence', 'import-export'));
fs.mkdirSync(output, {recursive:true});
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/, '/').replace(/^\//, '') || 'index.html';
  if (relative === 'favicon.ico') { response.writeHead(204).end(); return; }
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', ({'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp'})[path.extname(file)] || 'application/octet-stream');
    response.setHeader('cache-control', 'no-store');
    fs.createReadStream(file).pipe(response);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440, height:1000}, acceptDownloads:true});
  const page = await context.newPage(), errors = [], failedLocalResponses = [], checks = [], dialogs = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) failedLocalResponses.push({url:response.url(), status:response.status()}); });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const originalName = 'Эйра Проверка Файла', changedName = 'Изменено перед импортом', protectedName = 'Сохранить при отказе';
  const back = page.getByRole('button', {name:'← К списку героев', exact:true});
  const newHero = page.getByRole('button', {name:'✠ Новый герой', exact:true});
  const report = () => ({ok:checks.length === 4 && !errors.length && !failedLocalResponses.length, siteRoot:root, checks, dialogs, errors, failedLocalResponses, guarantees:['fresh isolated browser context', 'UI and downloaded files only', 'all catalog network local', 'no cloud or existing user campaign']});

  async function exportFile(filename) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', {name:'Выгрузить летопись', exact:true}).click();
    const download = await pending, file = path.join(output, filename);
    assert.equal(download.suggestedFilename(), 'dnd-world-letopis.json');
    assert.equal(await download.failure(), null);
    await download.saveAs(file);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(value.app, 'dndworld2');
    assert.ok(Array.isArray(value.chars));
    return {file, value};
  }

  async function importFile(file, expected) {
    const chooserPending = page.waitForEvent('filechooser');
    await page.getByRole('button', {name:'Загрузить летопись', exact:true}).click();
    const chooser = await chooserPending;
    const dialogPending = page.waitForEvent('dialog', {timeout:120000});
    await chooser.setFiles(file);
    const dialog = await dialogPending;
    const message = dialog.message(); dialogs.push({file:path.basename(file), type:dialog.type(), message});
    assert.equal(dialog.type(), 'alert');
    await dialog.accept();
    assert.match(message, expected);
    await page.locator('.wrap:not([inert]):not([aria-busy="true"])').waitFor({state:'visible'});
    assert.equal(await page.locator('#impFile').inputValue(), '', 'file input resets so the same file can be retried');
    return message;
  }

  async function openHero(name) {
    if (await back.isVisible()) await back.click();
    await newHero.waitFor();
    await page.locator('#character-search').fill(name);
    const card = page.locator('.char-card:visible').filter({hasText:name});
    assert.equal(await card.count(), 1, 'exactly one restored hero must be visible');
    await card.click();
    assert.equal(await page.locator('#sheet-name').inputValue(), name);
  }

  function stablePayload(value) { const copy = structuredClone(value); delete copy.exported; return copy; }

  try {
    await page.goto(origin + '/dnd-world/', {waitUntil:'domcontentloaded'});
    await back.or(newHero).first().waitFor({timeout:120000});
    if (await back.isVisible()) await back.click();
    const initialCount = await page.locator('.char-card').count();
    await newHero.click();
    await page.locator('#creator-name').fill(originalName);
    await page.locator('#creator-race').selectOption('Эльф');
    await page.locator('#creator-subrace').selectOption('Лесной эльф');
    await page.locator('#creator-cls').selectOption('Волшебник');
    await page.locator('#creator-level').fill('3'); await page.locator('#creator-level').press('Tab');
    await page.locator('#creator-subcls').selectOption('Школа Воплощения');
    await page.locator('#creator-bg').selectOption('Аколит');
    await page.locator('#creator-biography').fill('Синтетическая биография для проверки скачанного файла.');
    await page.getByRole('button', {name:'Далее →', exact:true}).click();
    for (const [key, value] of Object.entries({str:8, dex:14, con:13, int:15, wis:12, cha:10})) {
      await page.locator('#creator-ab-' + key).fill(String(value)); await page.locator('#creator-ab-' + key).press('Tab');
    }
    await page.getByRole('button', {name:'Далее →', exact:true}).click();
    await page.getByLabel('Анализ', {exact:true}).check(); await page.getByLabel('Магия', {exact:true}).check();
    await page.locator('#creator-language-0').selectOption('Драконий'); await page.locator('#creator-language-1').selectOption('Гномий');
    await page.getByRole('button', {name:'Далее →', exact:true}).click();
    await page.getByRole('button', {name:'Создать героя', exact:true}).click();
    await page.locator('#sheet-name').waitFor();
    const hp = page.getByRole('spinbutton', {name:'Текущие хиты', exact:true});
    const originalHp = await hp.inputValue();
    const original = await exportFile('original-download.json');
    assert.equal(original.value.chars.length, initialCount + 1);
    assert.equal(original.value.chars.filter(character => character.name === originalName).length, 1);
    const originalBytes = fs.readFileSync(original.file);
    await page.locator('#sheet-name').fill(changedName);
    await hp.fill('5'); await hp.press('Tab');
    assert.equal(await page.locator('#sheet-name').inputValue(), changedName);
    assert.equal(await hp.inputValue(), '5');
    await importFile(original.file, /^Летопись загружена\./);
    await openHero(originalName);
    assert.equal(await hp.inputValue(), originalHp);
    await page.getByRole('button', {name:'Предыстория', exact:true}).click();
    assert.equal(await page.locator('#character-biography').inputValue(), 'Синтетическая биография для проверки скачанного файла.');
    assert.deepEqual(fs.readFileSync(original.file), originalBytes, 'import does not rewrite the downloaded backup');
    checks.push('real exported file restores the changed hero, HP and biography through the UI file chooser');
    console.log('Roundtrip PASS');

    await page.getByRole('button', {name:'Характеристики', exact:true}).click();
    await page.locator('#sheet-name').fill(protectedName);
    await hp.fill('6'); await hp.press('Tab');
    const beforeRejected = await exportFile('before-rejected-imports.json');
    const malformed = path.join(output, 'malformed-fixture.json'); fs.writeFileSync(malformed, '{"app":"dndworld2","chars":[');
    await importFile(malformed, /^Летопись не загружена:/);
    assert.equal(await page.locator('#sheet-name').inputValue(), protectedName); assert.equal(await hp.inputValue(), '6');
    const afterMalformed = await exportFile('after-malformed.json');
    assert.deepEqual(stablePayload(afterMalformed.value), stablePayload(beforeRejected.value), 'malformed JSON cannot change any exported campaign state');
    checks.push('malformed JSON is rejected and the complete current exported campaign remains unchanged');
    console.log('Malformed JSON PASS');

    const duplicate = structuredClone(beforeRejected.value);
    duplicate.chars.push(structuredClone(duplicate.chars.find(character => character.name === protectedName)));
    const duplicateFile = path.join(output, 'duplicate-id-fixture.json'); fs.writeFileSync(duplicateFile, JSON.stringify(duplicate));
    await importFile(duplicateFile, /повторный идентификатор.*chars/);
    assert.equal(await page.locator('#sheet-name').inputValue(), protectedName); assert.equal(await hp.inputValue(), '6');
    const afterDuplicate = await exportFile('after-duplicate.json');
    assert.deepEqual(stablePayload(afterDuplicate.value), stablePayload(beforeRejected.value), 'duplicate IDs cannot replace or truncate the live campaign');
    checks.push('duplicate character ID is rejected without losing the current hero or other exported state');
    console.log('Duplicate ID PASS');

    await importFile(original.file, /^Летопись загружена\./);
    await openHero(originalName); assert.equal(await hp.inputValue(), originalHp);
    await page.reload({waitUntil:'domcontentloaded'});
    await back.or(newHero).first().waitFor({timeout:120000});
    await openHero(originalName); assert.equal(await hp.inputValue(), originalHp);
    await page.screenshot({path:path.join(output, 'restored-after-reload.png'), fullPage:true});
    checks.push('valid import remains usable after both failures and survives a real page reload');
    assert.deepEqual(errors, []); assert.deepEqual(failedLocalResponses, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report(), null, 2));
    console.log('Import/export UI acceptance: 4/4 PASS');
  } catch (error) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({...report(), ok:false, failure:String(error.stack || error)}, null, 2));
    await page.screenshot({path:path.join(output, 'failure.png'), fullPage:true}).catch(() => {});
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
