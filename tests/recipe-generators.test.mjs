import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const cwd=fileURLToPath(new URL('../',import.meta.url));
for(const locale of ['en-US','ru-RU'])test(`committed recipe artifacts reproduce with ${locale} host sorting`,()=>{
  // Exercise the actual generators with the default collation used by CI and
  // the editor's Windows host. Explicit display-language choices stay intact.
  const preload='data:text/javascript,'+encodeURIComponent(`const original=String.prototype.localeCompare;String.prototype.localeCompare=function(other,locales,options){return original.call(this,other,locales||${JSON.stringify(locale)},options);};`);
  for(const script of ['build-recipe-tabletop-items','build-recipe-item-links','audit-recipe-items','audit-game-recipes']){
    const output=execFileSync(process.execPath,['--import',preload,`scripts/${script}.mjs`,'--check'],{cwd,encoding:'utf8',windowsHide:true,timeout:120000});
    assert.ok(output.trim(),`${script}: check completed`);
  }
});
