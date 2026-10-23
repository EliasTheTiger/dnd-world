'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// The same actual classic-script modules used by the page. Isolated VM harnesses
// need their definitions too; missing runtime dependencies must never be mocked.
const modules = ['artificer-rules', 'artificer-catalog', 'artificer-spell-runtime',
  'artificer-elixir-runtime', 'party-starter', 'artificer-runtime', 'party-starter-runtime',
  'artificer-utility-runtime', 'artificer-basic-spells']
  .map(name => ({filename: 'scripts/' + name + '.js',
    source: fs.readFileSync(path.resolve(__dirname, '../../scripts', name + '.js'), 'utf8')}));
exports.loadArtificerScripts = function loadArtificerScripts(context) {
  for (const entry of modules) vm.runInContext(entry.source, context, {filename: entry.filename});
};
