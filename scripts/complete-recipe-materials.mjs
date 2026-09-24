import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import links from './recipe-item-links.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(root,'data/bg3',links.sourceVersion);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value)+'\n');
const descriptions={
 OBJ_Dead_Pixie:'Крохотное тело пикси с хрупкими крыльями. Ритуальный компонент для создания фонаря теней: одну пикси соединяют со сломанным лунным фонарём в круге древних знаков. После завершения обряда компонент расходуется; переноска сама по себе не даёт магических эффектов.',
 UNI_LOW_SteelWatchFoundry_WatcherArm:'Тяжёлая металлическая рука стального стража. Её сочленения и силовой механизм служат основой адского самовзводного арбалета. На специальном верстаке одна рука преобразуется в готовый арбалет; при этом расходуются один модуль прицеливания и один чертёж арбалета. Отдельно эта деталь не является действующим оружием.',
 UNI_LOW_SteelWatchtFoundry_WatcherTargetingModule:'Прицельный узел стального стража: оптика, крепления и передаточный механизм. Для сборки адского самовзводного арбалета нужны одна рука стража, один модуль и один чертёж арбалета. На верстаке рука преобразуется в оружие, а модуль и чертёж расходуются. Лежащий в инвентаре модуль не повышает точность атак.',
 ALCH_Ingredient_Herb_NightOrchid:'Тёмный цветок с тонкими лепестками. Алхимическое сырьё: три ночные орхидеи перерабатываются в одну суспензию ночной орхидеи. Сырой цветок хранится отдельными порциями и расходуется только после подтверждения переработки. Готовая суспензия участвует в дальнейших рецептах.',
 QUEST_WYR_GemlessRing:'Металлическая оправа кольца с пустым гнездом. Соединяется с самоцветом без кольца, чтобы восстановить волшебное кольцо. Для одной сборки требуется одна оправа; до восстановления она не даёт свойств готового кольца.',
 QUEST_WYR_RinglessGemstone:'Самоцвет, вынутый из своей оправы. Вместе с кольцом без камня используется для восстановления волшебного кольца. На одну сборку расходуется один самоцвет; отдельно камень не даёт свойств восстановленного предмета.',
 QUEST_WYR_RestoredMagicRing:'Восстановленное волшебное кольцо: самоцвет вновь закреплён в своей оправе. Готовое украшение можно носить на пальце, хранить, передавать или продавать. Для сборки нужны одна пустая оправа и один подходящий самоцвет; после сборки они становятся единым предметом. Само по себе кольцо не даёт прибавок к характеристикам, защите или броскам.',
};
const englishDescriptions={
 OBJ_Dead_Pixie:'The tiny body of a pixie, with fragile wings. One dead pixie and a broken moonlantern are consumed in the ritual that creates a shadow lantern at the ritual circle. Carrying this component grants no magical effect.',
 UNI_LOW_SteelWatchFoundry_WatcherArm:'A heavy metal arm from a Steel Watcher. Its joints and power mechanism form the frame of the Hellfire Engine Crossbow. At the workbench, one arm transforms into the completed crossbow; one targeting module and one crossbow diagram are consumed. The detached arm is not a working weapon.',
 UNI_LOW_SteelWatchtFoundry_WatcherTargetingModule:'A Steel Watcher targeting assembly containing optics, fittings and a transmission mechanism. Assembly requires one arm, one module and one crossbow diagram. At the workbench the arm transforms into the weapon, while the module and diagram are consumed. Carrying the module does not improve attack rolls.',
 ALCH_Ingredient_Herb_NightOrchid:'A dark flower with delicate petals. Three night orchids are processed into one suspension of night orchid. The flowers are individual inventory ingredients and are consumed only when extraction is confirmed. The suspension is used in further recipes.',
 QUEST_WYR_GemlessRing:'A metal ring setting with an empty socket. Combine one setting with the ringless gemstone to restore the magic ring. The empty setting does not grant the completed ring’s properties.',
 QUEST_WYR_RinglessGemstone:'A gemstone removed from its setting. Combine one gemstone with the gemless ring to restore the magic ring. The loose gemstone does not grant the completed ring’s properties.',
 QUEST_WYR_RestoredMagicRing:'A restored magic ring with its gemstone secured in the setting again. The completed ornament can be worn, carried, transferred or sold. One empty setting and one matching gemstone become a single item when assembled. The ring itself grants no ability, defence or roll bonuses.',
};
const materialStats=new Set(Object.keys(descriptions).filter(id=>id!=='QUEST_WYR_RestoredMagicRing').concat(['OBJ_AutomatonPart','OBJ_AutomatonPart_B','OBJ_AutomatonPart_C']));
const referenced=new Map(links.items.filter(row=>row.roles.some(role=>role!=='dye-target')).map(row=>[row.id,row]));
let edited=0,compiled=0;
for(const name of fs.readdirSync(path.join(base,'items')).sort()){
 const file=path.join(base,'items',name),payload=read(file);let changed=false;
 for(const item of payload.items||[]){
  const refs=referenced.get(item.id);if(!refs)continue;
  const stats=item.source.statsId,mechanics=item.mechanics,coverage=mechanics.engineCoverage;
  if(descriptions[stats]){
   const provenance=mechanics.provenance;
   provenance.gameDescription ||= {source:'D&D World: описание игрового компонента по проверенным связям рецептов',original:item.desc||'',originalLocalized:item.i18n?.ru?.description||'',originalEnglish:item.i18n?.en?.description||''};
   item.desc=descriptions[stats];if(item.i18n?.ru)item.i18n.ru.description=item.desc;
   if(item.i18n?.en)item.i18n.en.description=englishDescriptions[stats];
   // The source remains archived in provenance; authored text is not source localization.
   coverage.descriptionStatus='game-authored';
   coverage.characteristicIssues=coverage.characteristicIssues.filter(code=>code!=='description-handle-unresolved');
   changed=true;
  }
  if(stats==='UNI_LOW_SteelWatchFoundry_WatcherHarpoonCrossbowDiagram'){
   mechanics.provenance.gameName ||= {original:item.n,source:'D&D World: назначение чертежа'};
   item.n='Чертёж адского самовзводного арбалета';if(item.i18n?.ru)item.i18n.ru.name=item.n;if(item.i18n?.en)item.i18n.en.name='Hellfire Engine Crossbow Diagram';changed=true;
  }
  if(stats==='QUEST_WYR_RestoredMagicRing'){
   // The old alias joined this magical, 40 gp recipe result to an ordinary
   // 20 gp ring solely through a reused template. Those are not equivalent.
   mechanics.provenance.gameIdentity ||= {originalName:item.n,originalClassification:item.source.classification,originalAlias:item.source.semanticAliasOf,reason:'Exact recipe Stats and item properties differ from the old template alias.'};
   item.n='Восстановленное волшебное кольцо';item.i18n.ru.name=item.n;item.i18n.en.name='Restored Magic Ring';
   item.source.classification='playable';item.source.classificationReasons=item.source.classificationReasons.filter(reason=>reason!=='exact-semantic-duplicate');item.source.semanticAliasOf=null;
   if(Array.isArray(item.tags))item.tags=item.tags.map(tag=>tag==='bg3-duplicate'?'bg3-playable':tag);
   if(!mechanics.interactions.some(action=>action.handler==='valuableSell'))mechanics.interactions.push({id:'sell',label:'Продать',handler:'valuableSell',cost:'long'});
   coverage.counts.genericInteractions=mechanics.interactions.length;coverage.runtimeState='ready';coverage.effectStatus='runtime-ready';
   changed=true;edited++;continue;
  }
  if(!materialStats.has(stats))continue;
  mechanics.profile.material ||= {category:stats.startsWith('ALCH_')?'alchemy.ingredient':'crafting.material',sourceStats:stats};
  mechanics.profile.kind='material';
  if(!mechanics.interactions.some(row=>row.handler==='materialInspect'))mechanics.interactions.push({id:'inspect',label:'Свойства и рецепты',handler:'materialInspect',cost:'free'});
  coverage.counts.genericInteractions=mechanics.interactions.length;
  // A23 is a recipe launcher. Category membership is sufficient evidence, too;
  // the old compiler considered only direct Stats inputs and missed these parts.
  for(const action of mechanics.actions||[]){
   if(action.handler!=='bg3RootProgram'||action.program?.sourceAction?.primary?.actionType!==23)continue;
   if(String(action.program.sourceAction.primary.attributes.Conditions||'').trim())throw new Error('Conditional combination needs a separate implementation: '+item.id);
   const recipeIds=refs.recipes.filter(id=>links.recipes[id].inputs.some(input=>input.ids.includes(item.id)||input.aliases.includes(item.id))).map(id=>id.replace(/^bg3:recipe:/,''));
   if(!recipeIds.length)throw new Error('Combination has no input recipe: '+item.id);
   const rootFile=path.join(base,action.program.rootArtifact),rootPayload=read(rootFile),program=rootPayload.programs.find(row=>row.id===action.program.id);
   if(!program||program.validation.length)throw new Error('Unexpected A23 contract: '+item.id);
   const special={kind:'bg3Recipe',matchingRecipeIds:recipeIds};
   program.consequences=[{op:'openRecipePreflight',executable:true,matchingRecipeIds:recipeIds,mutationPolicy:'recipe-contract-only',phase:'consequences'}];
   program.mode='typed';program.summary={typedOpcodes:program.commit.length+1,manualOpcodes:0};program.special=special;
   save(rootFile,rootPayload);
   action.handler='bg3RecipeProgram';action.program.mode='typed';action.program.special=special;action.special=special;
   coverage.counts.blockedActions--;coverage.counts.readyActions++;
   coverage.counts.blockedRootPrograms--;coverage.counts.readyRootPrograms++;
   compiled++;
  }
  if(!coverage.counts.blockedActions&&!coverage.counts.blockedLifecycle&&!coverage.counts.blockedRootPrograms&&!coverage.blockedDescriptors.length){
   coverage.blockerCodes=coverage.blockerCodes.filter(code=>!['manual-mechanics-review-required','source-program-mixed'].includes(code));
   if(!coverage.blockerCodes.length&&!coverage.characteristicIssues.length){coverage.runtimeState='ready';coverage.effectStatus='runtime-ready';}
  }
  changed=true;edited++;
 }
 if(changed)save(file,payload);
}
console.log(JSON.stringify({materials:edited,compiledCombinations:compiled}));
