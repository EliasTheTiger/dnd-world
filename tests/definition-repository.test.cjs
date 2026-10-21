const assert=require('node:assert/strict');
const test=require('node:test');
const defs=require('../scripts/definition-repository.js');

test('definition repository resolves one explicit priority order',()=>{const repo=new defs.DefinitionRepository();repo.replaceLayer('builtin',[{id:'fire',n:'Fire'}],{kind:'spell',priority:10});repo.replaceLayer('campaign',[{id:'fire',n:'Campaign Fire'}],{kind:'spell',priority:20});assert.equal(repo.get('spell','fire').n,'Campaign Fire');assert.equal(repo.record('spell','fire').layer,'campaign');});
test('same-priority duplicate definitions fail instead of depending on array order',()=>{const repo=new defs.DefinitionRepository();repo.replaceLayer('one',[{id:'x'}],{kind:'item',priority:10});assert.throws(()=>repo.replaceLayer('two',[{id:'x'}],{kind:'item',priority:10}),error=>error.code==='DUPLICATE_DEFINITION');});
test('unresolved inventory and spellbook references are reported with owners',()=>{const repo=new defs.DefinitionRepository();repo.replaceLayer('world',[{id:'rope'}],{kind:'item',priority:10});const audit=repo.auditReferences([{owner:'char:a/inventory:1',kind:'item',id:'missing'},{owner:'char:a/inventory:2',kind:'item',id:'rope'},{owner:'char:a/spellbook:1',kind:'spell',id:'light'}]);assert.equal(audit.ok,false);assert.deepEqual(audit.missing.map(row=>row.id),['missing','light']);});

test('rejected catalog import preserves inventory and spellbook definitions',()=>{
  const repo=new defs.DefinitionRepository();
  const rope={id:'rope',n:'Rope'},light={id:'light',n:'Light'};
  repo.replaceLayer('world',[{kind:'item',definition:rope},{kind:'spell',definition:light}],{priority:10});
  const before=repo.entries();
  assert.throws(()=>repo.replaceLayer('import',[{id:'rope',n:'Conflicting rope'}],{kind:'item',priority:10}),error=>error.code==='DUPLICATE_DEFINITION');
  assert.deepEqual(repo.entries(),before);
  assert.equal(repo.layers.has('import'),false);
  assert.equal(repo.require('item','rope'),rope);
  assert.equal(repo.require('spell','light'),light);
  assert.equal(repo.auditReferences([{owner:'char:a/inventory:1',kind:'item',id:'rope'},{owner:'char:a/spellbook:1',kind:'spell',id:'light'}]).ok,true);
  assert.doesNotThrow(()=>repo.rebuild());
});

test('rejected campaign replacement retains its overrides and allows a corrected retry',()=>{
  const repo=new defs.DefinitionRepository();
  repo.replaceLayer('builtin',[{id:'fire',n:'Fire'}],{kind:'spell',priority:10});
  repo.replaceLayer('campaign',[{id:'fire',n:'Campaign Fire'},{id:'light',n:'Campaign Light'}],{kind:'spell',priority:20});
  const before=repo.entries(),previousLayer=repo.layers.get('campaign');
  assert.throws(()=>repo.replaceLayer('campaign',[{id:'fire',n:'First'},{id:'fire',n:'Duplicate'}],{kind:'spell',priority:20}),error=>error.code==='DUPLICATE_DEFINITION');
  assert.deepEqual(repo.entries(),before);
  assert.equal(repo.layers.get('campaign'),previousLayer);
  assert.equal(repo.require('spell','fire').n,'Campaign Fire');
  assert.equal(repo.require('spell','light').n,'Campaign Light');
  assert.equal(repo.replaceLayer('campaign',[{id:'fire',n:'Corrected Fire'}],{kind:'spell',priority:20}),1);
  assert.equal(repo.require('spell','fire').n,'Corrected Fire');
  assert.equal(repo.get('spell','light'),null);
});
