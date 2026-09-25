import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const source=read('docs/item-cards/rule-copy-source.json');
const overrides=read('docs/item-cards/rule-copy-overrides.json');
const damage={Acid:'кислотой',Cold:'холодом',Fire:'огнём',Lightning:'электричеством',Thunder:'звуком',Poison:'ядом',Psychic:'психической энергией',Radiant:'излучением',Necrotic:'некротической энергией',Force:'силовым полем',Slashing:'рубящего урона',Piercing:'колющего урона',Bludgeoning:'дробящего урона',MainWeaponDamageType:'урона того же типа, что и оружие',MainRangedWeaponDamageType:'урона дальнобойного оружия',MainMeleeWeaponDamageType:'урона рукопашного оружия'};
const words={CharismaModifier:'модификатор Харизмы',StrengthModifier:'модификатор Силы',DexterityModifier:'модификатор Ловкости',ConstitutionModifier:'модификатор Телосложения',IntelligenceModifier:'модификатор Интеллекта',WisdomModifier:'модификатор Мудрости',SpellCastingAbilityModifier:'модификатор базовой характеристики заклинаний',UnarmedMeleeAbilityModifier:'модификатор характеристики безоружной атаки',Level:'уровень персонажа',MainRangedWeapon:'урон дальнобойного оружия',MainMeleeWeapon:'урон рукопашного оружия',MainWeapon:'урон оружия'};
function split(value,separator=',') {const out=[];let depth=0,start=0;for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===separator&&depth===0){out.push(value.slice(start,i).trim());start=i+1;}}out.push(value.slice(start).trim());return out;}
function formula(value){return String(value).replace(/max\(1,\s*StrengthModifier\)/g,'модификатор Силы (минимум 1)').replace(/max\(DexterityModifier,\s*StrengthModifier\)/g,'больший из модификаторов Ловкости и Силы').replace(/LevelMapValue\(BardicInspiration\)/g,'кость бардовского вдохновения').replace(/LevelMapValue\(SneakAttack\)/g,'урон скрытой атаки').replace(/LevelMapValue\(StarryForm\)/g,'урон звёздной формы').replace(/[A-Za-z][A-Za-z]+/g,word=>words[word]||word);}
function parameter(value){const match=String(value).trim().match(/^(\w+)\((.*)\)$/s);if(!match)return formula(value);const [,fn,body]=match,args=split(body);if(fn==='Distance')return args[0].replace('.',',')+' м';if(fn==='DealDamage'){const amount=formula(args[0]),type=damage[args[1]];return amount+(type?' '+(/урона/.test(type)?type:'урона '+type):' урона');}if(fn==='RegainHitPoints')return formula(args[0])+' хитов';if(fn==='GainTemporaryHitPoints')return formula(args[0])+' временных хитов';return formula(value);}
function clean(text){return String(text||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/испытаниям/gi,'спасброскам').replace(/испытаниях/gi,'спасбросках').replace(/испытание/gi,'спасбросок').replace(/испытаний/gi,'спасбросков').replace(/испытания/gi,'спасброски').replace(/(?<![А-Яа-я])КС(?![А-Яа-я])/gu,'СЛ').replace(/(?<![А-Яа-я])КБ(?![А-Яа-я])/gu,'КД').replace(/выносливости/g,'Телосложения').replace(/бонусу умения/g,'бонусу мастерства').replace(/бонус умения/g,'бонус мастерства').replace(/фокусов/g,'заговоров').replace(/фокусы/g,'заговоры').replace(/1 ход\(а\/ов\)/g,'1 раунд').replace(/классу брони/g,'классу доспеха').replace(/класс брони/g,'класс доспеха').replace(/\+-/g,'−').replace(/--(?=\d)/g,'−').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
const result={},issues=[];
for(const [key,row] of Object.entries(source)){
 const p=row.properties||{},params=split(p.DescriptionParams||'',';').map(parameter),override=overrides[key]||{},name=clean(override.name??row.name),extraParams=split(p.ExtraDescriptionParams||'',';').map(parameter),description=row.description+(row.extraDescription?'\n'+row.extraDescription.replace(/\[(\d+)\]/g,(_,index)=>extraParams[+index-1]||'[не заполнено]'):''),text=clean(override.text??description.replace(/\[(\d+)\]/g,(_,index)=>params[+index-1]||'[не заполнено]'));
 const choices=String(p.ContainerSpells||'').split(';').filter(id=>id&&source[id]?.description);
 const links=[...new Set([...description.matchAll(/<LSTag Type="(?:Status|Passive|Spell)" Tooltip="([^"]+)"/g)].map(m=>m[1]).filter(id=>id!==key&&source[id]?.description))];
 const facts=[];
 if(p.TargetRadius)facts.push('Дистанция: '+({MeleeMainWeaponRange:'досягаемость оружия',RangedMainWeaponRange:'дальность оружия'}[p.TargetRadius]||p.TargetRadius.replace('.',',')+' м'));
 if(+p.AreaRadius>0)facts.push('Радиус: '+p.AreaRadius.replace('.',',')+' м');
 if(p.Cooldown)facts.push(({OncePerRestPerItem:'Раз за продолжительный отдых',OncePerRest:'Раз за продолжительный отдых',OncePerShortRestPerItem:'Раз за короткий отдых',OncePerShortRest:'Раз за короткий отдых',OncePerTurn:'Раз за ход',OncePerCombat:'Раз за бой'})[p.Cooldown]);
 if(/IsConcentration/.test(p.SpellFlags||''))facts.push('Концентрация');
 const save=(p.SpellRoll||'').match(/SavingThrow\(Ability\.(\w+),\s*([^,)]+(?:\(\))?)/);
 if(save){const ability={Strength:'Силы',Dexterity:'Ловкости',Constitution:'Телосложения',Intelligence:'Интеллекта',Wisdom:'Мудрости',Charisma:'Харизмы'}[save[1]],dc=/^\d+$/.test(save[2])?save[2]:/SourceSpellDC/.test(save[2])?'заклинаний владельца':'8 + бонус мастерства + модификатор Телосложения';facts.push('Спасбросок '+ability+' · СЛ '+dc);}
 else if(/Attack\(/.test(p.SpellRoll||''))facts.push(/SpellAttack/.test(p.SpellRoll)?'Атака заклинанием':'Атака оружием');
 const cost=split(p.UseCosts||'',';').map(v=>({ActionPoint:'Действие',BonusActionPoint:'Бонусное действие',ReactionActionPoint:'Реакция'})[v.split(':')[0]]).filter(Boolean).join(' + ');
 const durations=[...String(p.TooltipStatusApply||'').matchAll(/ApplyStatus\([^,]+,\s*100,\s*(\d+)\)/g)].map(m=>+m[1]).filter(n=>n>0);
 if(durations.length&&new Set(durations).size===1)facts.push('Длительность: '+(durations[0]===10?'1 минута':durations[0]+' раунд'+(durations[0]===1?'':durations[0]<5?'а':'ов')));
 const lines=split(p.TooltipDamageList||'',';').filter(Boolean).map(parameter);
 // Do not guess conditional alternatives hidden in tooltip damage lists.
 const summary=lines.length===1?clean(lines[0]):'';
 const value={name,text,...(facts.length?{facts:facts.filter(Boolean)}:{}),...(cost?{cost}:{}),...(summary?{summary}:{}),...(links.length?{links}:{}),...(choices.length?{choices}:{})};
 if(override.facts)value.facts=override.facts;
 if(override.cost)value.cost=override.cost;
 if(override.hidden)value.hidden=true;
 if(/[\[\]]|\b(?:DealDamage|RegainHitPoints|LevelMapValue|SourceSpellDC)\b/.test(text)||(!name&&text))issues.push({id:key,name,text});
 result[key]=value;
}
if(issues.length){console.error(JSON.stringify(issues,null,2));throw new Error('Unresolved player copy: '+issues.length);}
const equipmentSource=read('docs/item-cards/equipment-facts-source.json');
const abilities={Strength:'Силы',Dexterity:'Ловкости',Constitution:'Телосложения',Intelligence:'Интеллекта',Wisdom:'Мудрости',Charisma:'Харизмы'};
const skills={Persuasion:'Убеждение',Deception:'Обман',Stealth:'Скрытность',SleightOfHand:'Ловкость рук',Nature:'Природа',Athletics:'Атлетика',Arcana:'Магия',Religion:'Религия',Acrobatics:'Акробатика',Perception:'Внимательность',Survival:'Выживание',Intimidation:'Запугивание',Performance:'Выступление'};
const damageNames={Slashing:'рубящему',Bludgeoning:'дробящему',Lightning:'электрическому',Fire:'огненному',Cold:'холодному'};
const signed=n=>+n>0?'+'+n:String(n);
function equipmentFact(raw){
 const value=raw.trim(),match=value.match(/^(\w+)\((.*)\)$/);if(!match)return null;const [,name,body]=match,args=split(body);
 if(name==='Resistance')return (args[1]==='Vulnerable'?'Уязвимость':'Сопротивление')+' к '+damageNames[args[0]]+' урону.';
 if(name==='Skill')return signed(args[1])+' к проверкам навыка «'+skills[args[0]]+'».';
 if(name==='RollBonus')return signed(args[1])+' к '+(args[0]==='Attack'?'броскам атаки':'спасброскам'+(args[2]?' '+abilities[args[2]]:''))+'.';
 if(name==='Advantage'||name==='Disadvantage')return (name==='Advantage'?'Преимущество':'Помеха')+' на '+(args[0]==='SavingThrow'?'спасброски '+abilities[args[1]]:'проверки навыка «'+skills[args[1]]+'»')+'.';
 if(name==='Ability')return 'Значение '+abilities[args[0]]+' '+(+args[1]>0?'увеличивается':'уменьшается')+' на '+Math.abs(+args[1])+(args[2]?' (максимум '+args[2]+')':'')+'.';
 if(name==='AbilityOverrideMinimum')return 'Значение '+abilities[args[0]]+' становится '+args[1]+', если оно было ниже.';
 if(name==='ProficiencyBonus')return 'Владение спасбросками '+abilities[args[1]]+'.';
 if(name==='Proficiency')return 'Владение '+({Battleaxes:'боевыми топорами',Sickles:'серпами'}[args[0]])+'.';
 if(name==='AC')return signed(args[0])+' к классу доспеха.';
 if(name==='ActionResource'&&args[0]==='Movement')return 'Скорость увеличивается на '+args[1]+' м.';
 if(name==='WeaponDamage')return 'Дополнительный урон оружия: '+parameter('DealDamage('+body+')')+'.';
 if(name==='CannotBeDisarmed')return 'Это оружие нельзя выбить из рук.';
 if(name==='ItemReturnToOwner')return 'После броска оружие возвращается владельцу.';
 return null;
}
const equipment={};
for(const [id,source] of Object.entries(equipmentSource)){
 const facts=[],enchantments=[];
 for(const raw of new Set(Object.values(source.fields).flatMap(v=>split(v,';')))){
  const value=raw.trim();if(!value)continue;
  const enchant=value.match(/^WeaponEnchantment\((\d+)\)$/);if(enchant){enchantments.push(+enchant[1]);continue;}
  // These are object durability/cinematic flags or named actions already shown separately.
  if(/^(?:CriticalHit\(|HiddenDuringCinematic\(|UnlockSpell\(|Tag\(|WeaponProperty\()/.test(value)||/^IF.*UnlockSpell\(/.test(value))continue;
  if(/^IF.*CharacterWeaponDamage\(1d6,Necrotic\)$/.test(value)){facts.push('В руках медсестры Дома исцеления оружие наносит дополнительно 1d6 некротического урона.');continue;}
  const fact=equipmentFact(value);if(!fact||/undefined/.test(fact))throw new Error('Untranslated equipment fact: '+source.statsId+' / '+value);facts.push(fact);
 }
 if(facts.length||enchantments.length)equipment[id]={facts:[...new Set(facts)],...(enchantments.length?{enchantment:Math.max(...enchantments)}:{})};
}
const output='/* Generated by build-item-player-copy.mjs. Gameplay text only. */\n(function(root){root.DndWorldItemRuleCopy='+JSON.stringify(result)+';root.DndWorldItemEquipmentCopy='+JSON.stringify(equipment)+';})(globalThis);\n';
const target=new URL('scripts/item-player-copy.js',root);
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw new Error('Player copy is stale');}else fs.writeFileSync(target,output);
console.log(JSON.stringify({rules:Object.keys(result).length,bytes:Buffer.byteLength(output),check:process.argv.includes('--check')}));
