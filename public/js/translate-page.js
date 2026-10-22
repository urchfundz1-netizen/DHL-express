// public/js/translate-page.js
// Applies the saved language on pages that do not mount the shared chrome.
    (function () {
      // shared.js is loaded on this page: use its selector + widget handling.
      if (typeof initLanguageControls === 'function') {
        initLanguageControls();
        return;
      }

      // ---- Fallback (shared.js unavailable) ---------------------------------
      var KEY = 'swiftnova.language';
      var code = '';
      try { code = localStorage.getItem(KEY) || ''; } catch (e) {}
      if (!code) {
        var m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
        if (m) {
          try { code = decodeURIComponent(m[1]).split('/')[2] || ''; } catch (e) {}
        }
      }
      if (!code || code === 'en') return;
      // Re-apply a persistent cookie so Google keeps translating on navigation.
      document.cookie = 'googtrans=/en/' + code + ';path=/;max-age=31536000;SameSite=Lax';
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
