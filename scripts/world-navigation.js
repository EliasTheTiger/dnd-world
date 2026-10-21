(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DndWorldNavigation = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const tabs = Object.freeze(['chars', 'combat', 'races', 'classes', 'spellsdb', 'itemsdb', 'chests', 'merchants', 'abilitiesdb', 'foes', 'rules']);

  function readTab(hash) {
    if (!hash || hash === '#') return 'chars';
    const match = /^#tab=([a-z]+)$/.exec(hash);
    return match && tabs.includes(match[1]) ? match[1] : null;
  }

  function create({window: win, document: doc, onNavigate}) {
    let active = null;
    let started = false;

    function sync(tab, options = {}) {
      if (!tabs.includes(tab)) return false;
      const changed = active !== tab;
      active = tab;
      const buttons = doc.querySelectorAll('#tabsNav [data-tab]');
      for (const button of buttons) {
        const selected = button.dataset.tab === tab;
        if (!button.id) button.id = 'world-nav-' + button.dataset.tab;
        button.setAttribute('aria-controls', 'tab-' + button.dataset.tab);
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
        const panel = doc.getElementById('tab-' + button.dataset.tab);
        if (panel) {
          panel.setAttribute('role', 'region');
          panel.setAttribute('aria-labelledby', button.id);
          panel.setAttribute('tabindex', '-1');
        }
        if (selected) doc.title = 'D&D World — ' + button.textContent.trim();
      }
      if (changed && options.history !== 'none' && readTab(win.location.hash) !== tab) {
        const url = win.location.pathname + win.location.search + '#tab=' + tab;
        // Embedded/file previews can disallow history writes; navigation still works.
        try { win.history.pushState(null, '', url); } catch (_) { /* URL is optional. */ }
      }
      if (options.focus) {
        const panel = doc.getElementById('tab-' + tab);
        if (panel && typeof panel.focus === 'function') panel.focus({preventScroll: true});
      }
      return true;
    }

    function restore() {
      const tab = readTab(win.location.hash);
      // Leave unrelated anchors alone, and avoid rendering twice when Back emits both events.
      if (tab && tab !== active) onNavigate(tab, {history: 'none', focus: true});
    }

    function start() {
      if (started) return;
      started = true;
      win.addEventListener('popstate', restore);
      win.addEventListener('hashchange', restore);
      onNavigate(readTab(win.location.hash) || 'chars', {history: 'none'});
    }

    return Object.freeze({start, sync});
  }

  return Object.freeze({tabs, readTab, create});
});
