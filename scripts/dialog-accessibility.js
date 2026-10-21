(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DndWorldDialogs = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create({document: doc, window: win, dialogs}) {
    let top = null, started = false, changingFocus = false, lastFocused = doc.activeElement;
    let previousOverflow = null;
    const returnFocus = new Map(), background = new Map();
    const selector = 'button,input:not([type="hidden"]),select,textarea,a[href],summary,[tabindex]';
    const visible = el => !!el && el.isConnected && !el.hidden && el.getClientRects().length > 0 && win.getComputedStyle(el).visibility !== 'hidden';
    const usable = el => visible(el) && !el.disabled && !el.closest('[inert]');
    const controls = el => [...el.querySelectorAll(selector)].filter(node => usable(node) && node.tabIndex >= 0);

    function focusInside(root, preferred) {
      if (!root || changingFocus) return;
      changingFocus = true;
      try {
        const target = preferred && root.contains(preferred) && usable(preferred) ? preferred : controls(root)[0] || root;
        if (!target.hasAttribute('tabindex') && target === root) target.tabIndex = -1;
        target.focus({preventScroll: true});
      } finally { changingFocus = false; }
    }

    function restoreBackground() {
      for (const [node, inert] of background) node.inert = inert;
      background.clear();
    }

    function refresh() {
      const open = dialogs.map(config => ({config, root: doc.getElementById(config.id)})).filter(entry => visible(entry.root));
      open.sort((a, b) => (Number(win.getComputedStyle(a.root).zIndex) || 0) - (Number(win.getComputedStyle(b.root).zIndex) || 0));
      const next = open.length ? open[open.length - 1] : null;
      const changed = top?.root !== next?.root;
      const previous = top;
      if (changed && next && !returnFocus.has(next.root)) returnFocus.set(next.root, doc.activeElement);
      restoreBackground();
      top = next;
      if (top) {
        for (const node of doc.body.children) {
          if (node === top.root || node.contains(top.root) || ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)) continue;
          background.set(node, node.inert);
          node.inert = true;
        }
        if (previousOverflow === null) { previousOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden'; }
      } else if (previousOverflow !== null) { doc.body.style.overflow = previousOverflow; previousOverflow = null; }
      if (changed) {
        const saved = previous && returnFocus.get(previous.root);
        if (top) focusInside(top.root, saved);
        else {
          const target = usable(saved) ? saved : doc.getElementById('main-content');
          if (target) target.focus({preventScroll: true});
        }
      }
      const openRoots = new Set(open.map(entry => entry.root));
      for (const root of returnFocus.keys()) if (!openRoots.has(root)) returnFocus.delete(root);
    }

    function keydown(event) {
      if (!top || event.isComposing) return;
      if (event.key === 'Escape' && typeof top.config.close === 'function') {
        event.preventDefault(); event.stopImmediatePropagation(); top.config.close(); refresh(); return;
      }
      if (event.key !== 'Tab') return;
      const list = controls(top.root), first = list[0], last = list[list.length - 1], active = doc.activeElement;
      if (!first || !top.root.contains(active) || !list.includes(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault(); focusInside(top.root, event.shiftKey ? last : first);
      }
    }

    function focusin(event) {
      // Some existing dialogs focus their first field synchronously, before the observer runs.
      const entered = dialogs.map(config => doc.getElementById(config.id)).find(root => root && root.contains(event.target));
      if (entered && !returnFocus.has(entered)) returnFocus.set(entered, lastFocused);
      if (top && visible(top.root) && !top.root.contains(event.target)) focusInside(top.root);
      else lastFocused = event.target;
    }
    const observer = new win.MutationObserver(refresh);
    function start() {
      if (started) return;
      started = true;
      doc.addEventListener('keydown', keydown, true);
      doc.addEventListener('focusin', focusin, true);
      observer.observe(doc.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style','hidden']});
      refresh();
    }
    return Object.freeze({start, refresh});
  }
  return Object.freeze({create});
});
