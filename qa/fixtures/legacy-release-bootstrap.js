(() => {
  const embedded = '__DND_WORLD_RELEASE__';
  globalThis.DND_WORLD_RELEASE = embedded;
  if (typeof location === 'undefined' || location.hostname !== 'eliasthetiger.github.io' || !/^[0-9a-f]{40}$/u.test(embedded)) return;
  const releaseManifest = new URL('/dnd-world/release.json', location.origin);
  fetch(releaseManifest, {cache: 'no-store'}).then(response => response.ok ? response.json() : null).then(release => {
    const latest = String(release && release.commit || '').toLowerCase();
    if (!/^[0-9a-f]{40}$/u.test(latest) || latest === embedded) return null;
    const versioned = new URL('/dnd-world/releases/' + latest + '/index.html', location.origin);
    return fetch(versioned, {cache: 'no-store'}).then(response => response.ok ? response.text() : '').then(html => {
      const marker = '<meta name="dnd-world-release" content="' + latest + '">';
      if (!html.includes(marker)) return;
      document.open();
      document.write(html);
      document.close();
    });
  }).catch(() => {});
})();
