// public/js/page-chrome.js
// Injects the shared header/footer for pages that only need the site chrome.
// Kept as an external file because the production CSP only allows 'self'
// scripts - inline blocks would be blocked and the page would lose its
// header, footer and scroll-reveal behaviour.
(function () {
  const el = document.currentScript;
  const active = (el && el.dataset && el.dataset.active) || '';
  mountChrome(active);
})();
