// ── Background Service Worker (Chrome) / Background Script (Firefox) ──────
// Сумісний з Chrome MV3 та Firefox MV3 (128+) і Firefox MV3 зі scripts

const DEFAULT_SITES = [
  "youtube.com", "twitter.com", "x.com", "instagram.com",
  "facebook.com", "tiktok.com", "reddit.com", "twitch.tv",
  "netflix.com", "vk.com", "9gag.com", "pinterest.com"
];

// Firefox MV3 може не мати globalThis.chrome в усіх контекстах
const ext = (typeof chrome !== 'undefined' ? chrome : browser);

// ── Сховище ────────────────────────────────────────────────────────────────
async function getStore(keys) {
  return new Promise(resolve => ext.storage.local.get(keys, resolve));
}
async function setStore(obj) {
  return new Promise(resolve => ext.storage.local.set(obj, resolve));
}

async function initStorage() {
  const data = await getStore(['sites', 'limits', 'usage', 'lastReset', 'blocked']);
  const today = new Date().toDateString();

  if (!data.sites) {
    await setStore({ sites: DEFAULT_SITES });
  }
  if (!data.limits) {
    const limits = {};
    DEFAULT_SITES.forEach(s => { limits[s] = 1800; });
    await setStore({ limits });
  }
  if (!data.usage || data.lastReset !== today) {
    const sites = data.sites || DEFAULT_SITES;
    const usage = {};
    sites.forEach(s => { usage[s] = 0; });
    await setStore({ usage, lastReset: today, blocked: {} });
  }
}

// ── Перевірка блокування ───────────────────────────────────────────────────
function extractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function checkAndBlock(tabId, url) {
  if (!url) return;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') || url.startsWith('about:')) return;

  const hostname = extractHostname(url);
  if (!hostname) return;

  const data = await getStore(['sites', 'usage', 'limits', 'blocked']);
  const sites   = data.sites   || [];
  const usage   = data.usage   || {};
  const limits  = data.limits  || {};
  const blocked = data.blocked || {};

  const matchedSite = sites.find(s => hostname === s || hostname.endsWith('.' + s));
  if (!matchedSite) return;

  const used  = usage[matchedSite]  || 0;
  const limit = limits[matchedSite] ?? 1800;

  if (used >= limit) {
    blocked[matchedSite] = true;
    await setStore({ blocked });

    const blockedUrl = ext.runtime.getURL(
      `blocked.html?site=${encodeURIComponent(matchedSite)}&used=${used}&limit=${limit}`
    );
    // chrome.tabs.update працює однаково у Chrome і Firefox
    ext.tabs.update(tabId, { url: blockedUrl });
  }
}

// ── Трекінг часу ──────────────────────────────────────────────────────────
let activeTab = { tabId: null, site: null, startTime: null };

async function startTracking(tabId, url) {
  await stopTracking();

  if (!url) return;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') || url.startsWith('about:')) return;

  const hostname = extractHostname(url);
  if (!hostname) return;

  const { sites } = await getStore('sites');
  const matchedSite = (sites || []).find(s => hostname === s || hostname.endsWith('.' + s));
  if (!matchedSite) return;

  activeTab = { tabId, site: matchedSite, startTime: Date.now() };
}

async function stopTracking() {
  if (!activeTab.site || !activeTab.startTime) return;

  const elapsed = Math.floor((Date.now() - activeTab.startTime) / 1000);
  if (elapsed <= 0) { activeTab = { tabId: null, site: null, startTime: null }; return; }

  const { usage } = await getStore('usage');
  const newUsage = { ...(usage || {}) };
  newUsage[activeTab.site] = (newUsage[activeTab.site] || 0) + elapsed;
  await setStore({ usage: newUsage });

  activeTab = { tabId: null, site: null, startTime: null };
}

// ── Події вкладок ─────────────────────────────────────────────────────────
ext.tabs.onActivated.addListener(({ tabId }) => {
  ext.tabs.get(tabId, tab => {
    if (ext.runtime.lastError) return; // вкладка вже закрита
    startTracking(tabId, tab.url);
    checkAndBlock(tabId, tab.url);
  });
});

ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    checkAndBlock(tabId, changeInfo.url);
  }
  if (changeInfo.status === 'complete' && tab.active) {
    startTracking(tabId, tab.url);
  }
});

ext.tabs.onRemoved.addListener(tabId => {
  if (activeTab.tabId === tabId) stopTracking();
});

// ── Скидання опівночі ─────────────────────────────────────────────────────
function nextMidnightMs() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

// Chrome: chrome.alarms; Firefox: підтримує теж
if (ext.alarms) {
  ext.alarms.create('midnight-reset', {
    when: nextMidnightMs(),
    periodInMinutes: 1440
  });

  ext.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === 'midnight-reset') {
      const { sites } = await getStore('sites');
      const usage = {};
      (sites || DEFAULT_SITES).forEach(s => { usage[s] = 0; });
      await setStore({ usage, lastReset: new Date().toDateString(), blocked: {} });
    }
  });
}

// ── Ініціалізація ─────────────────────────────────────────────────────────
ext.runtime.onInstalled.addListener(initStorage);

// Firefox не завжди викликає onStartup для розширень — initStorage при старті
initStorage();
