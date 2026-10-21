// public/js/translate-page.js
// Loads Google Translate when a non-English language was selected.
    (function () {
      var m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
      if (!m) return;
      var parts = decodeURIComponent(m[1]).split('/');
      if (!parts[2] || parts[2] === 'en') return;
      var host = document.createElement('div');
      host.id = 'google_translate_element';
      host.style.cssText = 'position:absolute;left:-9999px;height:0;overflow:hidden;';
      document.body.appendChild(host);
      window.googleTranslateElementInit = function () {
        new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
      };
      var s = document.createElement('script');
      s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      s.async = true;
      document.body.appendChild(s);
    })();
  