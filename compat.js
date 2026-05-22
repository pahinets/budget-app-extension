(function () {
  if (typeof globalThis === 'undefined') return;

  const isFirefox = typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined';

  globalThis.__isFirefox = isFirefox;
})();