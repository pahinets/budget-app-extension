document.addEventListener('DOMContentLoaded', () => {
  const ext = (typeof browser !== "undefined" && browser.storage) ? browser : chrome;

  function fmtTime(sec) {
    sec = Math.floor(sec);
    if (sec <= 0) return '0хв';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + 'г ' + m + 'хв';
    return m > 0 ? m + 'хв' : (sec % 60) + 'с';
  }

  const params = new URLSearchParams(window.location.search);
  const site  = params.get('site')  || 'невідомий сайт';
  const used  = parseInt(params.get('used'))  || 0;
  const limit = parseInt(params.get('limit')) || 1800;
  const over  = Math.max(0, used - limit);

  document.getElementById('site-display').textContent = site;
  document.getElementById('stat-used').textContent  = fmtTime(used);
  document.getElementById('stat-limit').textContent = fmtTime(limit);
  document.getElementById('stat-over').textContent  = over > 0 ? '+' + fmtTime(over) : '0хв';

  const pct = Math.min(200, limit > 0 ? (used / limit) * 100 : 100);
  document.getElementById('progress-fill').style.width = Math.min(100, pct) + '%';
  document.getElementById('prog-label').textContent = pct.toFixed(0) + '%';

  function updateCountdown() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = Math.floor((midnight - now) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    document.getElementById('time-left').textContent = h + 'г ' + m + 'хв';
  }
  
  updateCountdown();
  setInterval(updateCountdown, 30000);

  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  document.getElementById('reset-time').textContent =
    midnight.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) + ' (північ)';

  document.getElementById('btn-back').addEventListener('click', async () => {
    const data = await ext.storage.local.get(['usage', 'limits', 'blocked']);
    const currentUsage = data.usage?.[site] || 0;
    const currentLimit = data.limits?.[site] ?? 1800;

    if (currentUsage < currentLimit) {
      const blocked = data.blocked || {};
      delete blocked[site];
      await ext.storage.local.set({ blocked });
      history.length > 1 ? history.back() : window.close();
    } else {
      alert('Повернення неможливе: денний ліміт часу повністю вичерпано.');
    }
  });

  let overrideClicks = 0;
  document.getElementById('btn-override').addEventListener('click', async () => {
    overrideClicks++;
    if (overrideClicks < 3) {
      document.getElementById('countdown').textContent =
        'Натисніть ще ' + (3 - overrideClicks) + ' раз(и) для підтвердження';
      return;
    }
    
    const data = await ext.storage.local.get(['blocked', 'ignored']);
    const blocked = data.blocked || {};
    const ignored = data.ignored || {};

    ignored[site] = true;
    delete blocked[site];
    
    await ext.storage.local.set({ blocked, ignored });
    history.length > 1 ? history.back() : window.close();
  });
});