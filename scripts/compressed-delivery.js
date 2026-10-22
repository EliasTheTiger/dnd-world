(function(root){
'use strict';

// Transport only: callers keep ownership of catalog validation and all saves.
// Compressed bytes and the reconstructed original are independently pinned.
function create(config){
  config=config||{};
  const nativeFetch=config.fetch||(root.fetch&&root.fetch.bind(root));
  const digest=config.digest||((bytes)=>root.crypto.subtle.digest('SHA-256',bytes));
  const baseURL=String(config.baseURL||(root.document&&root.document.baseURI)||(root.location&&root.location.href)||'');
  let decoderPromise=null;
  function sameOrigin(value){
    const url=new URL(String(value),baseURL),base=new URL(baseURL);
    if(url.origin!==base.origin||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Compressed delivery requires a same-origin URL.');
    return url.href;
  }
  function validPin(pin){return !!(pin&&Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&/^[a-f0-9]{64}$/.test(String(pin.sha256||'')));}
  function integrityError(message){const error=new Error(message);error.code='DND_DELIVERY_INTEGRITY';return error;}
  async function verify(bytes,pin){
    if(!validPin(pin))throw new Error('Compressed delivery descriptor is invalid.');
    if(bytes.byteLength!==pin.bytes)throw integrityError('Compressed delivery byte length mismatch.');
    const actual=Array.from(new Uint8Array(await digest(bytes)),value=>value.toString(16).padStart(2,'0')).join('');
    if(actual!==pin.sha256)throw integrityError('Compressed delivery SHA-256 mismatch.');
    return bytes;
  }
  async function read(url,options){
    if(typeof nativeFetch!=='function')throw new Error('Fetch is unavailable.');
    const response=await nativeFetch(url,options);
    if(!response.ok)throw new Error('HTTP '+response.status+' while loading '+url);
    return new Uint8Array(await response.arrayBuffer());
  }
  async function readDecoderBytes(){
    const compressed=config.decoderWasm&&config.decoderWasm.compressed;
    if(compressed&&compressed.encoding==='gzip'&&validPin(compressed)){
      try{
        // gzip uses the browser's decoder and never depends on Brotli/WASM.
        const stream=new root.DecompressionStream('gzip');
        const bytes=await verify(await read(sameOrigin(compressed.url),{cache:'force-cache'}),compressed);
        const output=new Uint8Array(await new root.Response(new root.Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
        return await verify(output,config.decoderWasm);
      }catch(_unavailable){/* The pinned original decoder remains available. */}
    }
    return verify(await read(sameOrigin(config.decoderWasmURL),{cache:'force-cache'}),config.decoderWasm);
  }
  async function loadDecoder(){
    if(typeof config.loadDecoder==='function')return config.loadDecoder();
    if(typeof root.DecompressionStream==='function'&&typeof root.Blob==='function'&&typeof root.Response==='function'){
      try{
        // The constructor is the feature test: gzip support does not imply br.
        new root.DecompressionStream('brotli');
        return async bytes=>new Uint8Array(await new root.Response(new root.Blob([bytes]).stream().pipeThrough(new root.DecompressionStream('brotli'))).arrayBuffer());
      }catch(_unsupported){/* Older browsers use the same pinned WASM decoder. */}
    }
    if(typeof root.WebAssembly!=='object')throw new Error('WebAssembly is unavailable.');
    const moduleURL=sameOrigin(config.decoderModuleURL);
    if(!validPin(config.decoderModule)||!validPin(config.decoderWasm))throw new Error('Decoder bytes are not pinned.');
    const [moduleBytes,bytes]=await Promise.all([
      read(moduleURL,{cache:'force-cache'}).then(bytes=>verify(bytes,config.decoderModule)),
      readDecoderBytes(),
    ]);
    const verifiedModuleURL=URL.createObjectURL(new root.Blob([moduleBytes],{type:'text/javascript'}));
    try{
      const module=await import(verifiedModuleURL);
      await module.default(bytes);
      if(typeof module.decompress!=='function')throw new Error('Brotli decoder is unavailable.');
      return bytes=>module.decompress(bytes);
    }finally{URL.revokeObjectURL(verifiedModuleURL);}
  }
  function decoder(){
    if(!decoderPromise)decoderPromise=Promise.resolve().then(loadDecoder).then(decode=>{
      if(typeof decode!=='function')throw new Error('Invalid Brotli decoder.');
      return decode;
    });
    return decoderPromise;
  }
  async function fetchBytes(url,options,descriptor){
    options=options||{};
    const originalURL=sameOrigin(url);
    if(descriptor&&!validPin(descriptor))throw new Error('Original delivery descriptor is invalid.');
    const compressed=descriptor&&descriptor.compressed;
    const get=String(options.method||'GET').toUpperCase()==='GET';
    if(get&&compressed&&compressed.encoding==='br'&&validPin(compressed)){
      try{
        const compressedURL=sameOrigin(compressed.url);
        const [bytes,decode]=await Promise.all([
          read(compressedURL,options).then(bytes=>verify(bytes,compressed)),
          decoder(),
        ]);
        const output=await decode(bytes);
        if(!(output instanceof Uint8Array))throw new Error('Brotli decoder did not return bytes.');
        return await verify(output,descriptor);
      }catch(error){
        if(options.signal&&options.signal.aborted)throw error;
        // Unsupported WASM, missing files, failed decoding and stale caches all
        // return to the original representation; its pin still applies.
      }
    }
    const bytes=await read(originalURL,options);
    if(!descriptor)return bytes;
    try{return await verify(bytes,descriptor);}
    catch(error){
      if(error.code!=='DND_DELIVERY_INTEGRITY'||options.cache==='reload'||options.signal&&options.signal.aborted)throw error;
      // A bad HTTP cache entry must not permanently strand a valid release.
      // Reload once, then fail closed if the network bytes are still wrong.
      return verify(await read(originalURL,Object.assign({},options,{cache:'reload'})),descriptor);
    }
  }
  return Object.freeze({fetchBytes});
}
let configured=null;
const api=Object.freeze({
  create,
  configure(config){configured=create(config);return configured;},
  fetchBytes(url,options,descriptor){if(!configured)configured=create();return configured.fetchBytes(url,options,descriptor);},
});
root.DndWorldCompressedDelivery=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
