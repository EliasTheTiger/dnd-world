(function publicItemSurfaceModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DndWorldPublicItemSurface = api;
})(typeof globalThis === 'object' ? globalThis : this, function buildPublicItemSurfaceModule() {
  'use strict';

  const FORBIDDEN_BRANDING = /(?:\bBG3\b|Baldur(?:'|’)?s\s+Gate\s*3)/iu;
  const INTERNAL_FIELD = /^(?:artifact|bg3Id|executor|handler|labelSource|profile|programId|rootArtifact|rootTemplateUuid|sourceAction|sourceActions|sourceField|sourceRuleId|sourceRuleIds)$/iu;
  const INTERNAL_VALUE = /(?:\bBG3\b|Baldur(?:'|’)?s\s+Gate\s*3|(?:^|[/:._-])bg3(?:[/:._-]|$)|\b(?:delegated-[a-z-]*program|programId|rootArtifact|rootTemplateUuid|sourceField)\b)/iu;

  function containsForbiddenBranding(value) {
    return FORBIDDEN_BRANDING.test(String(value == null ? '' : value));
  }

  function sanitizePublicText(value) {
    return String(value == null ? '' : value)
      .replace(/Baldur(?:'|’)?s\s+Gate\s*3/giu, 'D&D World')
      .replace(/\bBG3\b/giu, 'D&D World');
  }

  function publicItemId(value) {
    return String(value == null ? '' : value).replace(/^bg3:/iu, 'dnd-world:');
  }

  function publicTagValues(values) {
    return (Array.isArray(values) ? values : [])
      .map(value => String(value == null ? '' : value).trim())
      .filter(value => value && !/(?:^|[.:_-])bg3(?:$|[.:_-])/iu.test(value) && !containsForbiddenBranding(value));
  }

  function publicEngineReference(value) {
    const raw = String(value == null ? '' : value).trim();
    if (/^bg3[A-Z]/u.test(raw)) {
      const suffix = raw.slice(3);
      return suffix.charAt(0).toLocaleLowerCase('en-US') + suffix.slice(1);
    }
    return sanitizePublicText(raw.replace(/^bg3(?=[.:_-])/iu, 'item'));
  }

  function publicHandlerValues(values) {
    return (Array.isArray(values) ? values : []).map(reference => ({
      id: publicEngineReference(reference && reference.id),
      executor: publicEngineReference(reference && reference.executor),
    }));
  }

  function publicStructuredText(value, codeLabel) {
    const label = typeof codeLabel === 'function' ? codeLabel : raw => String(raw == null ? '' : raw).replace(/[._-]+/gu, ' ').trim();
    if (Array.isArray(value)) return value.map(row => publicStructuredText(row, label)).filter(Boolean).join(', ');
    if (value && typeof value === 'object') {
      const delegated = typeof value.kind === 'string' && /^delegated-[a-z-]*program$/iu.test(value.kind);
      const parts = Object.keys(value).sort().filter(key => !INTERNAL_FIELD.test(key) && !/^bg3/iu.test(key) && !(delegated && key === 'kind')).map(key => {
        const projected = publicStructuredText(value[key], label);
        return projected ? `${label(key)}: ${projected}` : '';
      }).filter(Boolean);
      return parts.join(', ') || 'типизированное правило предмета';
    }
    if (typeof value === 'boolean') return value ? 'да' : 'нет';
    const raw = String(value == null ? '' : value);
    return INTERNAL_VALUE.test(raw) ? 'типизированное правило предмета' : sanitizePublicText(raw);
  }

  function publicSourceLabel() {
    return 'Встроенный каталог D&D World · редакция 10';
  }

  function publicIconLabel(icon) {
    return icon && icon.kind === 'glyph' ? `встроенный символ ${sanitizePublicText(icon.value)}` : 'встроенная иконка предмета';
  }

  function sanitizeElementAttributes(element) {
    if (!element || typeof element.getAttribute !== 'function') return;
    for (const name of ['aria-label', 'placeholder', 'title']) {
      const before = element.getAttribute(name);
      if (before == null) continue;
      const after = sanitizePublicText(before);
      if (after !== before) element.setAttribute(name, after);
    }
  }

  function sanitizeDom(rootNode) {
    if (!rootNode) return;
    const documentValue = rootNode.ownerDocument || (rootNode.nodeType === 9 ? rootNode : null);
    if (!documentValue || typeof documentValue.createTreeWalker !== 'function') return;
    if (rootNode.nodeType === 1) sanitizeElementAttributes(rootNode);
    const elementWalker = documentValue.createTreeWalker(rootNode, 1);
    while (elementWalker.nextNode()) sanitizeElementAttributes(elementWalker.currentNode);
    const textWalker = documentValue.createTreeWalker(rootNode, 4);
    while (textWalker.nextNode()) {
      const node = textWalker.currentNode;
      const after = sanitizePublicText(node.nodeValue);
      if (after !== node.nodeValue) node.nodeValue = after;
    }
  }

  function attachDomGuard(documentValue) {
    if (!documentValue || !documentValue.documentElement) return null;
    sanitizeDom(documentValue.documentElement);
    const ViewMutationObserver = documentValue.defaultView && documentValue.defaultView.MutationObserver;
    if (typeof ViewMutationObserver !== 'function') return null;
    const observer = new ViewMutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') {
          const after = sanitizePublicText(record.target.nodeValue);
          if (after !== record.target.nodeValue) record.target.nodeValue = after;
        } else if (record.type === 'attributes') {
          sanitizeElementAttributes(record.target);
        } else {
          for (const node of record.addedNodes || []) sanitizeDom(node);
        }
      }
    });
    observer.observe(documentValue.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'placeholder', 'title'],
    });
    return observer;
  }

  return Object.freeze({
    containsForbiddenBranding,
    sanitizePublicText,
    publicItemId,
    publicTagValues,
    publicEngineReference,
    publicHandlerValues,
    publicStructuredText,
    publicSourceLabel,
    publicIconLabel,
    sanitizeDom,
    attachDomGuard,
  });
});
