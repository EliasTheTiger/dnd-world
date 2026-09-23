import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import art from '../scripts/campaign-item-art.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('assets/item-art/v1/manifest.json',root),'utf8'));
const engine=loadRuntimeIntegrationEngine(root);

test('every built-in item has verified original artwork with explicit aliases',()=>{
  const seeds=engine.catalogs.items;
  assert.equal(seeds.length,193);
  assert.equal(manifest.items.length,seeds.length);
  assert.deepEqual(new Set(manifest.items.map(item=>item.id)),new Set(seeds.map(item=>item.id)));
  assert.equal(new Set(manifest.items.map(item=>item.sha256)).size,manifest.items.filter(item=>!item.sharedWith).length,'only explicitly shared illustrations may repeat');
  for(const item of manifest.items.filter(item=>item.sharedWith)){
    const source=manifest.items.find(other=>other.id===item.sharedWith);
    assert.ok(source,item.id);assert.equal(item.src,source.src);assert.equal(item.sha256,source.sha256);
  }
  for(const item of manifest.items){
    const bytes=readFileSync(new URL(item.src,root));
    assert.equal(bytes.toString('ascii',0,4),'RIFF',item.id);
    assert.equal(bytes.toString('ascii',8,12),'WEBP',item.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.id);
    assert.equal(art.forItem(seeds.find(seed=>seed.id===item.id)).src,item.src,item.id);
    assert.equal(item.width,256);assert.equal(item.height,256);
  }
  execFileSync(process.execPath,[fileURLToPath(new URL('scripts/build-campaign-item-art.mjs',root)),'--check']);
});

test('saved inventory copies gain artwork without changing their data or explicit source images',()=>{
  const saved=JSON.parse(JSON.stringify(engine.catalogs.items)),before=JSON.stringify(saved);
  for(const item of saved){
    const expected=art.icons[item.id];
    assert.equal(art.forItem(item).src,expected.src,item.n);
    for(const html of [engine.itemsApi.icon(item,42),engine.itemsApi.bag(item),engine.itemsApi.equipment(item,'main')]){
      assert.ok(html.includes('src="'+expected.src+'"'),item.n);
      assert.doesNotMatch(html,/item-glyph|item-icon-fallback/);
      assert.match(html,/onerror="this.onerror=null;this.src='data:image\/webp;base64,/);
    }
  }
  assert.equal(JSON.stringify(saved),before);
  const explicit={src:'assets/bg3/verified-source.webp'};
  assert.equal(art.forItem({id:saved[0].id,icon:explicit}),explicit);
  assert.equal(art.forItem({item:{id:saved[0].id,icon:explicit}}),explicit);
  assert.equal(art.forItem({icon:{src:'https://example.org/my-custom-art.webp'}}).src,'https://example.org/my-custom-art.webp');
});

test('renamed definitions keep their image by identity and custom items have a drawn fallback',()=>{
  const soap=art.icons['it_мыло'];
  assert.equal(art.forItem({id:'it_мыло',n:'Моё мыло'}).src,soap.src);
  assert.equal(art.forItem({n:'  МЫЛО  '}).src,soap.src);
  assert.ok(art.forItem({id:'custom-weapon',type:'weapon'}).src.startsWith('assets/item-art/v1/'));
  assert.ok(art.forItem({id:'unknown',type:'unlisted'}).src.startsWith('assets/item-art/v1/'));
  const fallback=Buffer.from(art.fallbackData.split(',')[1],'base64');
  assert.equal(fallback.toString('ascii',8,12),'WEBP');
  assert.ok(fallback.length>100,'the offline fallback contains actual artwork');
});
