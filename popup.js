// ── Cross-browser API normalization ─────────────────────────────────────
const ext = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

// ── Popup Script ───────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// Форматування секунд → "1г 23хв" або "45хв"
function fmtTime(sec) {
  sec = Math.floor(sec);
  if (sec <= 0) return '0хв';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}г ${m}хв`;
  if (m > 0) return `${m}хв`;
  return `${s}с`;
}

function fmtDate(d) {
  return d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Load & Render ─────────────────────────────────────────────────────────
async function loadData() {
  const data = await ext.storage.local.get(['sites', 'usage', 'limits', 'blocked']);
  const sites   = data.sites   || [];
  const usage   = data.usage   || {};
  const limits  = data.limits  || {};
  const blocked = data.blocked || {};




  // ── Overview: summary ──
  const totalUsed = Object.values(usage).reduce((a, b) => a + b, 0);
  const totalLimit = sites.reduce((a, s) => a + (limits[s] ?? 1800), 0);
  const blockedSites = Object.values(blocked).filter(Boolean).length;

  $('summary-block').innerHTML = `
    <div class="summary-item">
      <div class="summary-val">${fmtTime(totalUsed)}</div>
      <div class="summary-lbl">Витрачено</div>
    </div>
    <div class="summary-item">
      <div class="summary-val">${fmtTime(Math.max(0, totalLimit - totalUsed))}</div>
      <div class="summary-lbl">Залишок</div>
    </div>
    <div class="summary-item">
      <div class="summary-val">${blockedSites}</div>
      <div class="summary-lbl">Заблоковано</div>
    </div>
  `;

  // ── Overview: usage list ──
  if (sites.length === 0) {
    $('usage-list').innerHTML = '<div class="empty">Сайти не додано до реєстру</div>';
  } else {
    const sorted = [...sites].sort((a, b) => (usage[b] || 0) - (usage[a] || 0));
    $('usage-list').innerHTML = sorted.map(site => {
      const used  = usage[site]  || 0;
      const limit = limits[site] ?? 1800;
      const pct   = Math.min(100, limit > 0 ? (used / limit) * 100 : 0);
      const over  = used >= limit;
      const isBlocked = !!blocked[site];
      return `
        <div class="status-card" style="margin-bottom:8px;">
          <div class="status-row">
            <span class="site-name">${site}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              ${isBlocked ? '<span class="badge-blocked">Блок</span>' : '<span class="badge-ok">OK</span>'}
              <span class="time-display ${over ? 'over' : ''}">${fmtTime(used)} / ${fmtTime(limit)}</span>
            </div>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="pct-label">${pct.toFixed(0)}%</div>
        </div>
      `;
    }).join('');
  }

  // ── Sites tab ──
  if (sites.length === 0) {
    $('sites-list').innerHTML = '<div class="empty" style="padding:12px 0">Список порожній</div>';
  } else {
    $('sites-list').innerHTML = sites.map(site => {
      const limitMin = Math.round((limits[site] ?? 1800) / 60);
      return `
        <div class="site-row">
          <span class="site-row-name">${site}</span>
          <span class="site-row-limit">${limitMin} хв</span>
          <button class="btn-remove" data-site="${site}">Видалити</button>
        </div>
      `;
    }).join('');

    // Remove buttons
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const site = btn.dataset.site;
        const d = await ext.storage.local.get(['sites', 'limits', 'usage', 'blocked']);
        const newSites = (d.sites || []).filter(s => s !== site);
        const newLimits = { ...(d.limits || {}) };
        const newUsage  = { ...(d.usage  || {}) };
        const newBlocked = { ...(d.blocked || {}) };
        delete newLimits[site];
        delete newUsage[site];
        delete newBlocked[site];
        await ext.storage.local.set({ sites: newSites, limits: newLimits, usage: newUsage, blocked: newBlocked });
        loadData();
      });
    });
  }

  // ── Settings: default limit ──
  const anyLimit = sites.length > 0 ? (limits[sites[0]] ?? 1800) : 1800;
  $('default-limit').value = Math.round(anyLimit / 60);
}

// ── Add site ──────────────────────────────────────────────────────────────
$('btn-add-site').addEventListener('click', async () => {
  const rawSite  = $('new-site').value.trim().toLowerCase().replace(/^www\./, '').replace(/https?:\/\//, '');
  const limitMin = parseInt($('new-limit').value) || 30;

  if (!rawSite || !rawSite.includes('.')) {
    $('new-site').focus();
    return;
  }

  const d = await ext.storage.local.get(['sites', 'limits', 'usage']);
  const sites  = d.sites  || [];
  const limits = d.limits || {};
  const usage  = d.usage  || {};

  if (!sites.includes(rawSite)) {
    sites.push(rawSite);
  }
  limits[rawSite] = limitMin * 60;
  if (usage[rawSite] === undefined) usage[rawSite] = 0;

  await ext.storage.local.set({ sites, limits, usage });
  $('new-site').value  = '';
  $('new-limit').value = '';
  loadData();
});

// Enter key in add form
$('new-site').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-add-site').click(); });
$('new-limit').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-add-site').click(); });

// ── Settings actions ──────────────────────────────────────────────────────
$('btn-save-settings').addEventListener('click', async () => {
  const limitMin = parseInt($('default-limit').value) || 30;
  const d = await ext.storage.local.get(['sites', 'limits']);
  const limits = d.limits || {};
  (d.sites || []).forEach(s => { limits[s] = limitMin * 60; });
  await ext.storage.local.set({ limits });
  loadData();
});

$('btn-reset-today').addEventListener('click', async () => {
  const d = await ext.storage.local.get('sites');
  const usage = {};
  (d.sites || []).forEach(s => { usage[s] = 0; });
  await ext.storage.local.set({ usage, lastReset: new Date().toDateString() });
  loadData();
});

$('btn-unblock-all').addEventListener('click', async () => {
  await ext.storage.local.set({ blocked: {} });
  loadData();
});

$('btn-clear-all').addEventListener('click', async () => {
  if (!confirm('Видалити всі дані розширення? Це скине налаштування та статистику.')) return;
  await ext.storage.local.clear();
  loadData();
});

// ── Init ──────────────────────────────────────────────────────────────────
loadData();
