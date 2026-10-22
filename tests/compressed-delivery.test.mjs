import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import zlib from 'node:zlib';
import init,{decompress} from 'brotli-dec-wasm/web';
import delivery from '../scripts/compressed-delivery.js';

await init(fs.readFileSync(new URL('../node_modules/brotli-dec-wasm/pkg/brotli_dec_wasm_bg.wasm',import.meta.url)));
const original=Buffer.from('Пример каталога: настоящие байты, переносы\r\n'+('Повторные спасброски и инвентарь персонажа. '.repeat(400)));
const compressed=zlib.brotliCompressSync(original);
const pin=bytes=>({bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
const descriptor={...pin(original),compressed:{...pin(compressed),url:'catalog.br',encoding:'br'}};
function setup({compressedBody=compressed,rawBody=original,status=200,decode=decompress,decoderError=false}={}){
  const calls=[];let decodes=0,decoderLoads=0;
  const fetch=async(url,options)=>{
    calls.push({url,options});const packed=url.endsWith('.br'),bytes=packed?compressedBody:rawBody;
    return {ok:!packed||status===200,status:packed?status:200,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  };
  const client=delivery.create({baseURL:'https://game.test/dnd-world/',fetch,
    digest:bytes=>crypto.webcrypto.subtle.digest('SHA-256',bytes),
    loadDecoder:async()=>{decoderLoads++;if(decoderError)throw Error('WASM unsupported');return bytes=>{decodes++;return decode(bytes);};},
  });
  return {client,calls,counts:()=>({decodes,decoderLoads})};
}

test('actual WASM decoder restores original Unicode bytes and reuses one initialization for concurrent loads',async()=>{
  const {client,calls,counts}=setup(),options={cache:'force-cache'};
  const results=await Promise.all([client.fetchBytes('catalog.json',options,descriptor),client.fetchBytes('catalog.json',options,descriptor)]);
  for(const bytes of results)assert.deepEqual(Buffer.from(bytes),original);
  assert.deepEqual(counts(),{decodes:2,decoderLoads:1});
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.url==='https://game.test/dnd-world/catalog.br'));
  assert.ok(calls.every(call=>call.options===options));
});

test('tampered compressed bytes never reach the decoder and fall back to verified original bytes',async()=>{
  const forged=Buffer.from(compressed);forged[0]^=1;
  const {client,calls,counts}=setup({compressedBody:forged});
  assert.deepEqual(Buffer.from(await client.fetchBytes('catalog.json',{},descriptor)),original);
  assert.equal(counts().decodes,0);assert.equal(calls.length,2);
});

test('valid compressed bytes with an incorrect restored hash fall back without exposing bad output',async()=>{
  const {client,calls}=setup({decode:()=>new Uint8Array(original.length)});
  assert.deepEqual(Buffer.from(await client.fetchBytes('catalog.json',{},descriptor)),original);
  assert.equal(calls.length,2);
});

for(const failure of ['missing','unsupported','decode'])test(failure+' compressed transport uses the original representation',async()=>{
  const {client,calls}=setup(failure==='missing'?{status:404}:failure==='unsupported'?{decoderError:true}:{decode:()=>{throw Error('invalid brotli');}});
  assert.deepEqual(Buffer.from(await client.fetchBytes('catalog.json',{},descriptor)),original);
  assert.equal(calls.length,2);assert.equal(calls[1].url,'https://game.test/dnd-world/catalog.json');
});

test('corrupt original fallback is rejected rather than weakening catalog integrity',async()=>{
  const forged=Buffer.from(original);forged[0]^=1;
  const {client}=setup({status:404,rawBody:forged});
  await assert.rejects(client.fetchBytes('catalog.json',{},descriptor),/SHA-256 mismatch/);
});

test('cross-origin compressed descriptors never issue foreign requests',async()=>{
  const {client,calls,counts}=setup();
  const external={...descriptor,compressed:{...descriptor.compressed,url:'https://elsewhere.test/catalog.br'}};
  assert.deepEqual(Buffer.from(await client.fetchBytes('catalog.json',{},external)),original);
  assert.equal(calls.length,1);assert.equal(counts().decodes,0);
  await assert.rejects(client.fetchBytes('https://elsewhere.test/catalog.json',{},descriptor),/same-origin/);
  assert.equal(calls.length,1);
});

test('an aborted compressed request does not start a fallback request',async()=>{
  const controller=new AbortController();controller.abort();const {client,calls}=setup({status:404});
  await assert.rejects(client.fetchBytes('catalog.json',{signal:controller.signal},descriptor));
  assert.equal(calls.length,1);
});

// Expose only the production byte loader inside an isolated test realm. No
// module evaluation is needed to test the decoder transport's integrity gate.
function decoderTransport({failure='',supportsGzip=true,rawCorrupt=false}={}){
  const wasm=fs.readFileSync(new URL('../node_modules/brotli-dec-wasm/pkg/brotli_dec_wasm_bg.wasm',import.meta.url));
  const gz=zlib.gzipSync(wasm,{level:9}),calls=[];
  const source=fs.readFileSync(new URL('../scripts/compressed-delivery.js',import.meta.url),'utf8').replace('return Object.freeze({fetchBytes});','return Object.freeze({fetchBytes,readDecoderBytes});');
  const context={URL,Blob,Response,Uint8Array,WebAssembly,crypto:crypto.webcrypto,DecompressionStream:supportsGzip?DecompressionStream:undefined};
  vm.runInNewContext(source,context);
  const compressedPin={...pin(gz),url:'decoder.wasm.gz',encoding:'gzip'};
  let packed=gz;
  if(failure==='corrupt'){packed=Buffer.from(gz);packed[0]^=1;}
  if(failure==='decode'){packed=Buffer.from('not gzip');Object.assign(compressedPin,pin(packed));}
  if(failure==='restored'){packed=zlib.gzipSync(Buffer.alloc(wasm.length));Object.assign(compressedPin,pin(packed));}
  const fetch=async url=>{
    calls.push(url);const compressed=url.endsWith('.gz'),body=compressed?packed:rawCorrupt?Buffer.alloc(wasm.length):wasm;
    return {ok:!compressed||failure!=='missing',status:compressed&&failure==='missing'?404:200,arrayBuffer:async()=>Uint8Array.from(body).buffer};
  };
  const client=context.DndWorldCompressedDelivery.create({baseURL:'https://game.test/',fetch,decoderWasmURL:'decoder.wasm',decoderWasm:{...pin(wasm),compressed:compressedPin}});
  return {wasm,calls,client};
}

test('WASM decoder gzip transport restores pinned original bytes without fetching the raw decoder',async()=>{
  const {wasm,calls,client}=decoderTransport();
  assert.deepEqual(Buffer.from(await client.readDecoderBytes()),wasm);
  assert.deepEqual(calls,['https://game.test/decoder.wasm.gz']);
});

for(const failure of ['missing','corrupt','decode','restored'])test('WASM gzip '+failure+' falls back to verified raw decoder bytes',async()=>{
  const {wasm,calls,client}=decoderTransport({failure});
  assert.deepEqual(Buffer.from(await client.readDecoderBytes()),wasm);
  assert.deepEqual(calls,['https://game.test/decoder.wasm.gz','https://game.test/decoder.wasm']);
});

test('WASM gzip absence of browser support directly uses the pinned raw decoder',async()=>{
  const {wasm,calls,client}=decoderTransport({supportsGzip:false});
  assert.deepEqual(Buffer.from(await client.readDecoderBytes()),wasm);
  assert.deepEqual(calls,['https://game.test/decoder.wasm']);
});

test('WASM gzip fallback cannot admit a corrupt raw decoder',async()=>{
  const {client}=decoderTransport({failure:'missing',rawCorrupt:true});
  await assert.rejects(client.readDecoderBytes(),/SHA-256 mismatch/);
});

for(const damage of ['hash','length'])test('original '+damage+' mismatch reloads a stale cache once and verifies fresh bytes',async()=>{
  const calls=[],broken=damage==='hash'?Buffer.alloc(original.length):Buffer.from('short');
  const client=delivery.create({baseURL:'https://game.test/',fetch:async(url,options)=>{
    calls.push({url,cache:options.cache});const bytes=options.cache==='reload'?original:broken;
    return {ok:true,status:200,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  }});
  assert.deepEqual(Buffer.from(await client.fetchBytes('catalog.json',{cache:'force-cache'},pin(original))),original);
  assert.deepEqual(calls.map(row=>row.cache),['force-cache','reload']);
});

test('original fallback remains blocked after one unsuccessful cache repair',async()=>{
  const calls=[];
  const client=delivery.create({baseURL:'https://game.test/',fetch:async(url,options)=>{
    calls.push(options.cache);return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array(original.length).buffer};
  }});
  await assert.rejects(client.fetchBytes('catalog.json',{cache:'force-cache'},pin(original)),/SHA-256 mismatch/);
  assert.deepEqual(calls,['force-cache','reload']);
  calls.length=0;
  await assert.rejects(client.fetchBytes('catalog.json',{cache:'reload'},pin(original)),/SHA-256 mismatch/);
  assert.deepEqual(calls,['reload']);
});

test('original abort and HTTP failure never start cache repair, and invalid pins never fetch',async()=>{
  const controller=new AbortController();let calls=0;
  const client=delivery.create({baseURL:'https://game.test/',fetch:async()=>{
    calls++;return {ok:true,status:200,arrayBuffer:async()=>{controller.abort();return new Uint8Array(original.length).buffer;}};
  }});
  await assert.rejects(client.fetchBytes('catalog.json',{cache:'force-cache',signal:controller.signal},pin(original)));
  assert.equal(calls,1);
  await assert.rejects(client.fetchBytes('catalog.json',{}, {bytes:1,sha256:'invalid'}),/descriptor is invalid/);
  assert.equal(calls,1);
  const missing=delivery.create({baseURL:'https://game.test/',fetch:async()=>{calls++;return {ok:false,status:404};}});
  await assert.rejects(missing.fetchBytes('catalog.json',{cache:'force-cache'},pin(original)),/HTTP 404/);
  assert.equal(calls,2);
});
