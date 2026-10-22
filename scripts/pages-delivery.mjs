import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {brotliCompress, gzipSync, constants} from 'node:zlib';
import {promisify} from 'node:util';

const digest = value => createHash('sha256').update(value).digest('hex');
const compress = promisify(brotliCompress);
const pin = code => ({bytes:Buffer.byteLength(code),sha256:digest(code)});
// These classic scripts have global lexical declarations and their own strict
// directive. Keep their script boundaries; never wrap, rename or eval the engine.
const separate = new Set(['scripts/recipe-tabletop-runtime.js', 'scripts/arcanum-runtime.js', 'scripts/recipe-workbench.js', 'data/dnd5e/open5e-cc-v1/catalog.js']);

export async function prepareDelivery(source, root, base, catalogPaths = []) {
  const external = [...source.matchAll(/<script src="([^"]+)"><\/script>/gu)];
  const app = [...source.matchAll(/<script>\s*([\s\S]*?)<\/script>/gu)];
  if (app.length !== 1 || !external.length) throw new Error('Pages delivery requires one classic application script and its ordered dependencies');
  const groups = []; let pending = [];
  const flush = () => {if (pending.length) {groups.push(pending); pending = [];}};
  for (const [, path] of external) {
    const code = await readFile(join(root, path), 'utf8');
    if (separate.has(path)) {flush(); groups.push([{path, code}]);}
    else pending.push({path, code});
  }
  flush(); groups.push([{path:'index.html#application', code:app[0][1]}]);
  const assets = groups.map((group, index) => {
    // A failed dependency (including a syntax/runtime error) must stop later
    // scripts before loadAll can read or migrate any campaign data.
    const strict = group.length === 1 && /^['"]use strict['"]/u.test(group[0].code.trimStart());
    const code = `${strict ? "'use strict';\n" : ''}if(globalThis.DndWorldDelivery.failed||globalThis.DndWorldDelivery.loaded!==${index}){globalThis.DndWorldDelivery.fail();throw new Error('Incomplete game download');}\n`
      + group.map(row => `// ${row.path}\n${row.code}\n;\n`).join('')
      + `\nglobalThis.DndWorldDelivery.loaded=${index + 1};\n`;
    const hash = digest(code), path = `scripts/delivery/${hash}.js`;
    return {path, code, hash, integrity:'sha256-'+Buffer.from(hash,'hex').toString('base64'), sources:group.map(row=>row.path)};
  });
  const generated = [];
  async function compressedDescriptor(path,code) {
    const descriptor=pin(code);
    if(descriptor.bytes<80000)return descriptor;
    const bytes=await compress(Buffer.from(code),{params:{[constants.BROTLI_PARAM_QUALITY]:11}});
    const compressedPath=`scripts/delivery/${digest(bytes)}.br`;
    generated.push({path:compressedPath,code:bytes});
    descriptor.compressed={...pin(bytes),url:base+compressedPath,encoding:'br'};
    return descriptor;
  }
  const descriptors=await Promise.all(assets.map(async asset=>({url:base+asset.path,...await compressedDescriptor(asset.path,asset.code)})));
  const catalogs={};
  for(const path of catalogPaths)catalogs[base+path]=await compressedDescriptor(path,await readFile(join(root,path)));
  const vendor=join(root,'node_modules','brotli-dec-wasm');
  const module=await readFile(join(vendor,'pkg','brotli_dec_wasm.js'));
  const wasm=await readFile(join(vendor,'pkg','brotli_dec_wasm_bg.wasm'));
  const modulePath=`scripts/delivery/${digest(module)}.mjs`,wasmPath=`scripts/delivery/${digest(wasm)}.wasm`;
  const wasmGzip=gzipSync(wasm,{level:9}),wasmGzipPath=`scripts/delivery/${digest(wasmGzip)}.wasm.gz`;
  generated.push({path:modulePath,code:module},{path:wasmPath,code:wasm},
    {path:wasmGzipPath,code:wasmGzip},
    {path:'scripts/delivery/brotli-dec-wasm-LICENSE-MIT.txt',code:await readFile(join(vendor,'LICENSE-MIT'))});
  const transport=await readFile(join(root,'scripts','compressed-delivery.js'),'utf8');
  const config={decoderModuleURL:base+modulePath,decoderModule:pin(module),decoderWasmURL:base+wasmPath,decoderWasm:{...pin(wasm),compressed:{...pin(wasmGzip),url:base+wasmGzipPath,encoding:'gzip'}}};
  let html = source;
  for (const [tag] of external) html = html.replace(tag, '');
  html = html.replace(app[0][0], '');
  const bootstrap = `<script data-delivery-bootstrap>
${transport}
(() => {
  if(globalThis.DND_WORLD_RELOADING)return;
  const state = globalThis.DndWorldDelivery = {loaded:0, failed:false, complete:false,
    fail() {if(globalThis.DndWorldDelivery!==state)return;state.failed=true; const label=document.getElementById('deliveryMessage'); if(label)label.textContent='Не удалось загрузить игру. Проверьте соединение и обновите страницу.';const retry=document.getElementById('deliveryRetry');if(retry)retry.hidden=false;},
    ready() {if(!state.failed){state.complete=true;const content=document.getElementById('deliveryContent');if(content)content.replaceWith(...content.childNodes);document.getElementById('deliveryStatus')?.remove();}}
  };
  addEventListener('error',()=>{if(!state.complete)state.fail();});
  addEventListener('unhandledrejection',()=>{if(!state.complete)state.fail();});
  const domReady=new Promise(resolve=>{if(document.readyState!=='loading')resolve();else addEventListener('DOMContentLoaded',resolve,{once:true});});
  const nativeFetch=globalThis.fetch.bind(globalThis), transport=DndWorldCompressedDelivery.create(${JSON.stringify(config)});
  const catalogs=${JSON.stringify(catalogs)};
  // Only immutable, build-pinned catalog files use this lossless transport.
  // The engine still verifies its own manifests/programs and sees original bytes.
  globalThis.fetch=function(input,options){
    const isURL=typeof input==='string'||input instanceof URL;
    if(isURL&&(!options||!options.method||options.method==='GET')){
      const url=new URL(input,document.baseURI),descriptor=url.origin===location.origin&&!url.search&&catalogs[url.pathname];
      if(descriptor)return transport.fetchBytes(url.href,options,descriptor).then(bytes=>new Response(bytes,{headers:{'Content-Type':'application/json'}}));
    }
    return nativeFetch(input,options);
  };
  const assets=${JSON.stringify(descriptors)};
  (async()=>{
    // Fetch concurrently, but execute classic scripts in the original order,
    // only after every byte is verified and the entire HTML has been parsed.
    const sources=await Promise.all(assets.map(asset=>transport.fetchBytes(asset.url,{cache:'force-cache'},asset)));
    await domReady;
    for(let index=0;index<sources.length;index++){
      if(globalThis.DndWorldDelivery!==state||globalThis.DND_WORLD_RELOADING)return;
      if(state.failed)throw new Error('Game initialization stopped');
      const script=document.createElement('script');script.textContent=new TextDecoder().decode(sources[index]);document.head.appendChild(script);
      if(state.loaded!==index+1)throw new Error('Game script did not complete');
    }
  })().catch(async()=>{await domReady;if(globalThis.DndWorldDelivery===state&&!globalThis.DND_WORLD_RELOADING)state.fail();});
})();
</script>`;
  // Start downloads before stylesheets. Even an unavailable font provider
  // must not hold up an inline classic loader behind pending CSS.
  const releaseBootstrap=html.match(/<script data-release-bootstrap>[\s\S]*?<\/script>/u);
  html = releaseBootstrap ? html.replace(releaseBootstrap[0],releaseBootstrap[0]+'\n'+bootstrap) : html.replace('<head>','<head>\n'+bootstrap);
  html = html.replace('<body>', '<body>\n<div id="deliveryStatus" role="status" aria-live="polite" style="padding:12px;text-align:center"><span id="deliveryMessage">Загружаем игру и восстанавливаем персонажей…</span> <button id="deliveryRetry" type="button" hidden onclick="location.reload()">Повторить загрузку</button></div><div id="deliveryContent" inert>');
  html=html.replace('</body>','</div></body>');
  return {html, assets, generated, descriptors};
}
