import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pointerBytes=read('data/bg3/current.json'),pointer=JSON.parse(pointerBytes),manifestHash=hash(read('data/bg3/'+pointer.manifest));
if(manifestHash!==pointer.manifestSha256)throw new Error('Catalog pointer does not match its manifest');
const presentationHash=hash(read('data/bg3/ui/'+pointer.catalogVersion+'-item-presentation/manifest.json'));
const replacements=new Map([
 ['index.html',[[/(rootManifestSha256=')[a-f0-9]{64}(')/g,manifestHash],[/(BG3_ITEM_PRESENTATION_MANIFEST_SHA256\s*=\s*')[a-f0-9]{64}(')/g,presentationHash]]],
 ['tests/bg3-dethrone-runtime.test.mjs',[[/(currentSha256:\s*')[a-f0-9]{64}(')/g,hash(pointerBytes)],[/(manifestSha256:\s*')[a-f0-9]{64}(')/g,manifestHash]]],
 ['tests/bg3-extra-projectiles-runtime.test.mjs',[[/(manifestSha256:\s*')[a-f0-9]{64}(')/g,manifestHash]]],
 ['tests/effect-engine.test.mjs',[[/(PRODUCTION_BG3_ITEM_PRESENTATION=Object\.freeze\(\{\s*manifestSha256:')[a-f0-9]{64}(')/g,presentationHash]]],
]);
const pending=[];
for(const [name,patterns] of replacements){const before=read(name).toString();let after=before;for(const [pattern,value] of patterns){let count=0;after=after.replace(pattern,(_match,prefix,suffix)=>{count++;return prefix+value+suffix;});if(count!==1)throw new Error('Expected one release pin in '+name+': '+pattern);}
 if(process.argv.includes('--check')){if(after!==before)throw new Error('Release pins are stale: '+name);}else if(after!==before)pending.push([name,after]);
}
for(const [name,after] of pending)fs.writeFileSync(new URL(name,root),after);
console.log(JSON.stringify({manifestSha256:manifestHash,presentationSha256:presentationHash}));
