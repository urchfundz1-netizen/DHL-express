// public/js/track-languages.js
// Language picker for the track page. It uses the same select component, the
// same language list and the same persistence as the rest of the site
// (see shared.js), but translates in place so the tracking form keeps its
// state instead of reloading the page.
(function () {
  const select = document.getElementById('trackLanguage');
  if (!select) return;

  const current = currentLanguageCode();
  if (!select.options.length) select.innerHTML = languageOptions(current);
  select.value = current;
  syncLanguageCookie();

  // Drive the hidden Google <select> that the widget injects.
  function setLanguage(code) {
    persistLanguage(code);
    if (code !== 'en' && !document.querySelector('select.goog-te-combo')) loadGoogleTranslate();
    const trySet = () => {
      const combo = document.querySelector('select.goog-te-combo');
      if (!combo) return false;
      if (combo.value !== code) {
        combo.value = code;
        combo.dispatchEvent(new Event('change'));
      }
      return true;
    };
    if (trySet()) return;
    // The widget may still be initialising; retry briefly.
    let tries = 0;
    const timer = setInterval(() => {
      if (trySet() || ++tries > 50) clearInterval(timer);
    }, 200);
  }

  select.addEventListener('change', () => setLanguage(select.value));

  // Apply a language that was chosen on another page.
  if (current !== 'en') setLanguage(current);
})();
