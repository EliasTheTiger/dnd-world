const assert=require('node:assert/strict');
const fs=require('node:fs');
const test=require('node:test');
const rules=require('../scripts/ruleset-registry.js');
const manifest=JSON.parse(fs.readFileSync('data/rulesets/manifest.json','utf8'));

test('repository declares one explicit 2014 ruleset and a scoped BG3 extension',()=>{
  const registry=new rules.RulesetRegistry(manifest),active=registry.activeRefs(),resolved=registry.resolve(active);
  assert.deepEqual(active.map(row=>row.id),['dnd5e-2014-local','bg3-5e-2014-adaptation']);
  assert.equal(resolved[0].id,'dnd5e-2014-local');
  assert.equal(registry.capability(active,'spells').ok,true);
  assert.equal(registry.capability(active,'bg3-scenes').ok,true);
  assert.equal(manifest.rulesets[0].completeness.status,'unknown');
});

test('definitions without an explicit compatible ruleset fail closed',()=>{
  const registry=new rules.RulesetRegistry(manifest),active=registry.activeRefs();
  assert.equal(registry.checkDefinition({id:'spell:no-ref'},active).code,'MISSING_RULESET_REF');
  assert.equal(registry.checkDefinition({id:'spell:future',rulesetRef:{id:'dnd5e-2024',version:'1'}},active).code,'UNKNOWN_RULESET');
  assert.equal(registry.checkDefinition({id:'spell:ok',rulesetRef:active[0]},active).ok,true);
});

test('manifest source sets prohibit unsupported completeness claims',()=>{
  for(const source of manifest.sourceSets)assert.notEqual(source.allowedCompletenessClaim,'all-official-rules');
});
