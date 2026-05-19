// ── Content Script ─────────────────────────────────────────────────────────

(async () => {
  const hostname = window.location.hostname.replace(/^www\./, '');

  // Нормалізуємо API: Firefox має browser.*, Chrome — chrome.*
  const ext = (typeof browser !== 'undefined' && browser.storage)
    ? browser
    : chrome;

  try {
    const data = await ext.storage.local.get(['sites', 'blocked', 'usage', 'limits']);
    const sites   = data.sites   || [];
    const blocked = data.blocked || {};
    const usage   = data.usage   || {};
    const limits  = data.limits  || {};

    const matchedSite = sites.find(s => hostname === s || hostname.endsWith('.' + s));
    if (!matchedSite) return;

    const used  = usage[matchedSite]  || 0;
    const limit = limits[matchedSite] ?? 1800;

    if (used >= limit || blocked[matchedSite]) {
      window.location.replace(
        ext.runtime.getURL(
          `blocked.html?site=${encodeURIComponent(matchedSite)}&used=${used}&limit=${limit}`
        )
      );
    }
  } catch {
  }
})();
