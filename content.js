(async () => {
  const hostname = window.location.hostname.replace(/^www\./, '');

  const ext = (typeof browser !== 'undefined' && browser.storage)
    ? browser
    : chrome;

  try {
    const data = await ext.storage.local.get(['sites', 'blocked', 'usage', 'limits', 'ignored']);
    const sites   = data.sites   || [];
    const blocked = data.blocked || {};
    const usage   = data.usage   || {};
    const limits  = data.limits  || {};
    const ignored = data.ignored || {};

    const matchedSite = sites.find(s => hostname === s || hostname.endsWith('.' + s));
    if (!matchedSite) return;

    if (ignored[matchedSite]) return;

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