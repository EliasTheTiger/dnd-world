const test = require('node:test');
const assert = require('node:assert/strict');
const navigation = require('../scripts/world-navigation.js');

function harness(hash = '') {
  const listeners = {};
  const visits = [];
  const history = [];
  const buttons = navigation.tabs.map(tab => ({
    dataset: {tab}, textContent: tab, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  }));
  const panels = Object.fromEntries(navigation.tabs.map(tab => ['tab-' + tab, {
    attributes: {}, focused: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { this.focused = true; },
  }]));
  const doc = {querySelectorAll: () => buttons, getElementById: id => panels[id]};
  const win = {
    location: {hash, pathname: '/dnd-world/releases/example/index.html', search: '?campaign=demo'},
    history: {pushState(state, title, url) { history.push(url); win.location.hash = url.slice(url.indexOf('#')); }},
    addEventListener(name, fn) { listeners[name] = fn; },
  };
  const controller = navigation.create({window: win, document: doc, onNavigate(tab, options) {
    visits.push(tab);
    controller.sync(tab, options);
  }});
  return {controller, win, doc, buttons, panels, history, visits, listeners};
}

test('only known world sections are accepted as routes', () => {
  for (const tab of navigation.tabs) assert.equal(navigation.readTab('#tab=' + tab), tab);
  assert.equal(navigation.readTab(''), 'chars');
  for (const hash of ['#tab=missing', '#tab=__proto__', '#tab=rules&other=x', '#main-content', '#tab=%72ules']) {
    assert.equal(navigation.readTab(hash), null);
  }
});

test('a bookmarked section opens after initialization without adding history', () => {
  const h = harness('#tab=rules');
  h.controller.start();
  h.controller.start();
  assert.deepEqual(h.visits, ['rules']);
  assert.deepEqual(h.history, []);
  const selected = h.buttons.filter(button => button.attributes['aria-current'] === 'page');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].dataset.tab, 'rules');
  assert.equal(h.panels['tab-rules'].attributes['aria-labelledby'], selected[0].id);
  assert.equal(h.doc.title, 'D&D World — rules');
  assert.equal(h.panels['tab-rules'].focused, false, 'startup does not steal focus');
});

test('section changes preserve the deployment path and query without duplicate entries', () => {
  const h = harness();
  h.controller.start();
  h.controller.sync('spellsdb');
  h.controller.sync('spellsdb');
  assert.deepEqual(h.history, ['/dnd-world/releases/example/index.html?campaign=demo#tab=spellsdb']);
  assert.equal(h.buttons[0].attributes['aria-current'], undefined);
  assert.equal(h.controller.sync('missing'), false);
  assert.equal(h.doc.title, 'D&D World — spellsdb');
});

test('Back and Forward restore sections once and move focus into visible content', () => {
  const h = harness();
  h.controller.start();
  h.controller.sync('combat');
  h.win.location.hash = '';
  h.listeners.popstate();
  h.listeners.hashchange();
  assert.deepEqual(h.visits, ['chars', 'chars']);
  assert.equal(h.panels['tab-chars'].focused, true);
  h.win.location.hash = '#tab=combat';
  h.listeners.popstate();
  h.listeners.hashchange();
  assert.deepEqual(h.visits, ['chars', 'chars', 'combat']);
  assert.equal(h.history.length, 1, 'history restoration must not append history');
});

test('unrelated anchors do not hide the current section', () => {
  const h = harness('#tab=rules');
  h.controller.start();
  h.win.location.hash = '#main-content';
  h.listeners.hashchange();
  assert.deepEqual(h.visits, ['rules']);
  const unknown = harness('#tab=unknown');
  unknown.controller.start();
  assert.deepEqual(unknown.visits, ['chars']);
  assert.deepEqual(unknown.history, []);
});

test('history restrictions in previews do not break section switching', () => {
  const h = harness();
  h.controller.start();
  h.win.history.pushState = () => { throw new Error('History is unavailable'); };
  assert.equal(h.controller.sync('itemsdb'), true);
  assert.equal(h.doc.title, 'D&D World — itemsdb');
});
