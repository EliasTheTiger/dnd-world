const assert=require('node:assert/strict');
const test=require('node:test');
const defs=require('../scripts/definition-repository.js');

test('definition repository resolves one explicit priority order',()=>{const repo=new defs.DefinitionRepository();repo.replaceLayer('builtin',[{id:'fire',n:'Fire'}],{kind:'spell',priority:10});repo.replaceLayer('campaign',[{id:'fire',n:'Campaign Fire'}],{kind:'spell',priority:20});assert.equal(repo.get('spell','fire').n,'Campaign Fire');assert.equal(repo.record('spell','fire').layer,'campaign');});
test('same-priority duplicate definitions fail instead of depending on array order',()=>{const repo=new defs.DefinitionRepository();repo.replaceLayer('one',[{id:'x'}],{kind:'item',priority:10});assert.throws(()=>repo.replaceLayer('two',[{id:'x'}],{kind:'item',priority:10}),error=>error.code==='DUPLICATE_DEFINITION');});
test('unresolved inventory and spellbook references are reported with owners',()=>{const repo=new defs.DefinitionRepository();repo.replaceLayer('world',[{id:'rope'}],{kind:'item',priority:10});const audit=repo.auditReferences([{owner:'char:a/inventory:1',kind:'item',id:'missing'},{owner:'char:a/inventory:2',kind:'item',id:'rope'},{owner:'char:a/spellbook:1',kind:'spell',id:'light'}]);assert.equal(audit.ok,false);assert.deepEqual(audit.missing.map(row=>row.id),['missing','light']);});
