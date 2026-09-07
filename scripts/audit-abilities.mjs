import fs from 'node:fs';
import {loadInstalledRuntimeCatalogs} from '../tests/helpers/runtime-catalog-loader.mjs';
const {abilities}=loadInstalledRuntimeCatalogs();
const count=key=>Object.fromEntries([...new Set(abilities.map(key))].sort().map(value=>[value,abilities.filter(ab=>key(ab)===value).length]));
const report={revision:'abilities-ru-2026-09-07.1',total:abilities.length,
 editions:count(ab=>ab.abilityReview.edition),names:count(ab=>ab.abilityReview.nameStatus),descriptions:count(ab=>ab.abilityReview.descriptionStatus),
 renamed:abilities.filter(ab=>ab.n!==ab.abilityReview.aliases[0]).length,
 editedDescriptions:abilities.filter(ab=>ab.x!==ab.abilityReview.originalDescription).length,
 entries:abilities.map(ab=>({id:ab.id,name:ab.n,previousName:ab.abilityReview.aliases[0],edition:ab.abilityReview.edition,
 nameStatus:ab.abilityReview.nameStatus,nameSource:ab.abilityReview.nameSource||null,descriptionStatus:ab.abilityReview.descriptionStatus,
 execution:ab.mechanics?.mode==='manual'?'manual':ab.mechanics?.role||ab.mode||'manual'}))};
const output=new URL('../docs/ability-audit.json',import.meta.url);
const serialized=JSON.stringify(report,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(output,'utf8')!==serialized)throw new Error('Ability audit is stale; run node scripts/audit-abilities.mjs');}
else fs.writeFileSync(output,serialized);
const {entries,...summary}=report;console.log(JSON.stringify(summary,null,2));
