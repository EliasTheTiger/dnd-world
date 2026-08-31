import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const path=resolve('index.html'),stylePath=resolve('styles.css'),source=await readFile(path,'utf8'),start=source.indexOf('<style>'),end=source.indexOf('</style>',start);
let output=source;
if(start>=0&&end>start){const style=source.slice(start,end),formatted=style.replace(/\/\*[\s\S]*?\*\//g,'').replace(/[ \t]+$/gm,'').replace(/\n[ \t]*/g,'').replace(/;\s+/g,';').replace(/\s*{\s*/g,'{').replace(/\s+}/g,'}').replace(/,\s+/g,',').replace(/:\s+/g,':');await writeFile(stylePath,formatted.slice('<style>'.length).trim()+'\n','utf8');output=source.slice(0,start)+'<link rel="stylesheet" href="styles.css">'+source.slice(end+'</style>'.length);}
output=output.replace(/<!--[\s\S]*?-->/g,'').replace(/[ \t]+$/gm,'');
const scriptStart=output.indexOf('<script>\n');if(scriptStart>0)output=output.slice(0,scriptStart).replace(/\n[ \t]*\n/g,'\n')+output.slice(scriptStart);
let earlyBlankLines=0;output=output.split('\n').filter((line,index)=>!(index<1500&&line.trim()===''&&earlyBlankLines++<32)).join('\n');
if(output!==source)await writeFile(path,output,'utf8');
process.stdout.write(JSON.stringify({removedCharacters:source.length-output.length})+'\n');
