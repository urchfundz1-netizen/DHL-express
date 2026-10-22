// public/js/track-languages.js
// Language picker for the track page (Google Translate driven).
    // ---- Language data (name, native, Google Translate code) -----------------
    const LANGUAGES = [
      { name: 'English', native: 'English', code: 'en' },
      { name: 'French', native: 'Français', code: 'fr' },
      { name: 'Spanish', native: 'Español', code: 'es' },
      { name: 'German', native: 'Deutsch', code: 'de' },
      { name: 'Italian', native: 'Italiano', code: 'it' },
      { name: 'Portuguese', native: 'Português', code: 'pt' },
      { name: 'Dutch', native: 'Nederlands', code: 'nl' },
      { name: 'Russian', native: 'Русский', code: 'ru' },
      { name: 'Chinese (Simplified)', native: '简体中文', code: 'zh-CN' },
      { name: 'Chinese (Traditional)', native: '繁體中文', code: 'zh-TW' },
      { name: 'Japanese', native: '日本語', code: 'ja' },
      { name: 'Korean', native: '한국어', code: 'ko' },
      { name: 'Arabic', native: 'العربية', code: 'ar' },
      { name: 'Hindi', native: 'हिन्दी', code: 'hi' },
      { name: 'Bengali', native: 'বাংলা', code: 'bn' },
      { name: 'Urdu', native: 'اردو', code: 'ur' },
      { name: 'Turkish', native: 'Türkçe', code: 'tr' },
      { name: 'Vietnamese', native: 'Tiếng Việt', code: 'vi' },
      { name: 'Thai', native: 'ไทย', code: 'th' },
      { name: 'Indonesian', native: 'Bahasa Indonesia', code: 'id' },
      { name: 'Malay', native: 'Bahasa Melayu', code: 'ms' },
      { name: 'Filipino', native: 'Filipino', code: 'fil' },
      { name: 'Polish', native: 'Polski', code: 'pl' },
      { name: 'Ukrainian', native: 'Українська', code: 'uk' },
      { name: 'Romanian', native: 'Română', code: 'ro' },
      { name: 'Greek', native: 'Ελληνικά', code: 'el' },
      { name: 'Czech', native: 'Čeština', code: 'cs' },
      { name: 'Swedish', native: 'Svenska', code: 'sv' },
      { name: 'Norwegian', native: 'Norsk', code: 'no' },
      { name: 'Danish', native: 'Dansk', code: 'da' },
      { name: 'Finnish', native: 'Suomi', code: 'fi' },
      { name: 'Hungarian', native: 'Magyar', code: 'hu' },
      { name: 'Hebrew', native: 'עברית', code: 'he' },
      { name: 'Persian', native: 'فارسی', code: 'fa' },
      { name: 'Swahili', native: 'Kiswahili', code: 'sw' },
      { name: 'Tamil', native: 'தமிழ்', code: 'ta' },
      { name: 'Telugu', native: 'తెలుగు', code: 'te' },
      { name: 'Marathi', native: 'मराठी', code: 'mr' },
      { name: 'Gujarati', native: 'ગુજરાતી', code: 'gu' },
      { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'pa' },
      { name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn' },
      { name: 'Malayalam', native: 'മലയാളം', code: 'ml' },
      { name: 'Sinhala', native: 'සිංහල', code: 'si' },
      { name: 'Nepali', native: 'नेपाली', code: 'ne' },
      { name: 'Burmese', native: 'မြန်မာ', code: 'my' },
      { name: 'Khmer', native: 'ខ្មែរ', code: 'km' },
      { name: 'Lao', native: 'ລາວ', code: 'lo' },
      { name: 'Amharic', native: 'አማርኛ', code: 'am' },
      { name: 'Hausa', native: 'Hausa', code: 'ha' },
      { name: 'Yoruba', native: 'Yorùbá', code: 'yo' },
      { name: 'Igbo', native: 'Igbo', code: 'ig' },
      { name: 'Zulu', native: 'isiZulu', code: 'zu' },
      { name: 'Afrikaans', native: 'Afrikaans', code: 'af' },
      { name: 'Somali', native: 'Soomaali', code: 'so' },
      { name: 'Serbian', native: 'Српски', code: 'sr' },
      { name: 'Croatian', native: 'Hrvatski', code: 'hr' },
      { name: 'Bulgarian', native: 'Български', code: 'bg' },
      { name: 'Slovak', native: 'Slovenčina', code: 'sk' },
      { name: 'Slovenian', native: 'Slovenščina', code: 'sl' },
      { name: 'Lithuanian', native: 'Lietuvių', code: 'lt' },
      { name: 'Latvian', native: 'Latviešu', code: 'lv' },
      { name: 'Estonian', native: 'Eesti', code: 'et' },
      { name: 'Catalan', native: 'Català', code: 'ca' },
      { name: 'Basque', native: 'Euskara', code: 'eu' },
      { name: 'Galician', native: 'Galego', code: 'gl' },
      { name: 'Irish', native: 'Gaeilge', code: 'ga' },
      { name: 'Welsh', native: 'Cymraeg', code: 'cy' },
      { name: 'Icelandic', native: 'Íslenska', code: 'is' },
      { name: 'Albanian', native: 'Shqip', code: 'sq' },
      { name: 'Macedonian', native: 'Македонски', code: 'mk' },
      { name: 'Bosnian', native: 'Bosanski', code: 'bs' },
      { name: 'Georgian', native: 'ქართული', code: 'ka' },
      { name: 'Armenian', native: 'Հայերեն', code: 'hy' },
      { name: 'Azerbaijani', native: 'Azərbaycan', code: 'az' },
      { name: 'Kazakh', native: 'Қазақ', code: 'kk' },
      { name: 'Uzbek', native: 'Oʻzbek', code: 'uz' },
      { name: 'Mongolian', native: 'Монгол', code: 'mn' },
      { name: 'Pashto', native: 'پښتو', code: 'ps' },
      { name: 'Kurdish', native: 'Kurdî', code: 'ku' },
      { name: 'Maltese', native: 'Malti', code: 'mt' },
      { name: 'Belarusian', native: 'Беларуская', code: 'be' },
      { name: 'Haitian Creole', native: 'Kreyòl', code: 'ht' },
      { name: 'Cebuano', native: 'Cebuano', code: 'ceb' },
      { name: 'Hmong', native: 'Hmong', code: 'hmn' },
      { name: 'Javanese', native: 'Basa Jawa', code: 'jw' },
      { name: 'Sundanese', native: 'Basa Sunda', code: 'su' },
      { name: 'Malagasy', native: 'Malagasy', code: 'mg' },
      { name: 'Chichewa', native: 'Chichewa', code: 'ny' },
      { name: 'Kinyarwanda', native: 'Kinyarwanda', code: 'rw' },
      { name: 'Xhosa', native: 'isiXhosa', code: 'xh' },
    ];

    // ---- Dropdown behaviour --------------------------------------------------
    const langSelect = document.getElementById('langSelect');
    const langBtn = document.getElementById('langBtn');
    const langMenu = document.getElementById('langMenu');
    const langSearch = document.getElementById('langSearch');
    const langList = document.getElementById('langList');
    const langCurrent = document.getElementById('langCurrent');

    // Restore a previously chosen language (Google stores it in a cookie).
    function currentLangCode() {
      const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
      if (m) {
        const parts = decodeURIComponent(m[1]).split('/');
        return parts[2] || 'en';
      }
      return 'en';
    }

    function renderLangList(filter) {
      const q = (filter || '').trim().toLowerCase();
      const active = currentLangCode();
      const items = LANGUAGES.filter((l) =>
        !q || l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
      );
      if (items.length === 0) {
        langList.innerHTML = '<li class="lang-empty">No languages found</li>';
        return;
      }
      langList.innerHTML = items.map((l) => `
        <li data-code="${l.code}" class="${l.code === active ? 'selected' : ''}" role="option">
          <span>${l.name}</span>
          <span class="lang-native">${l.native}</span>
        </li>`).join('');
    }

    function openLang() {
      langSelect.classList.add('open');
      langBtn.setAttribute('aria-expanded', 'true');
      renderLangList('');
      langSearch.value = '';
      setTimeout(() => langSearch.focus(), 50);
    }
    function closeLang() {
      langSelect.classList.remove('open');
      langBtn.setAttribute('aria-expanded', 'false');
    }

    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langSelect.classList.contains('open') ? closeLang() : openLang();
    });
    langSearch.addEventListener('input', () => renderLangList(langSearch.value));
    langList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-code]');
      if (!li) return;
      const code = li.getAttribute('data-code');
      const lang = LANGUAGES.find((l) => l.code === code);
      langCurrent.textContent = lang ? lang.name : code;
      closeLang();
      setLanguage(code);
    });
    document.addEventListener('click', (e) => {
      if (!langSelect.contains(e.target)) closeLang();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLang();
    });

    // ---- Google Translate integration ---------------------------------------
    function googleTranslateElementInit() {
      new google.translate.TranslateElement(
        { pageLanguage: 'en', autoDisplay: false },
        'google_translate_element'
      );
    }

    // The widget is a few hundred KB, so it is only fetched when a non-English
    // language is actually selected (or was already chosen on a previous visit).
    let translateLoading = false;
    function loadGoogleTranslate() {
      if ((window.google && window.google.translate) || document.getElementById('google-translate-script')) return;
      if (translateLoading) return;
      translateLoading = true;
      const script = document.createElement('script');
      script.id = 'google-translate-script';
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.body.appendChild(script);
    }

    // Drive the hidden Google <select> that the widget injects.
    function setLanguage(code) {
      // Persist across every page (Google reads this cookie on init).
      document.cookie = 'googtrans=' + (code === 'en' ? '/en/en' : '/en/' + code) + ';path=/';
      if (code !== 'en' && !document.querySelector('select.goog-te-combo')) loadGoogleTranslate();
      const trySet = () => {
        const combo = document.querySelector('select.goog-te-combo');
        if (combo) {
          combo.value = code;
          combo.dispatchEvent(new Event('change'));
          return true;
        }
        return false;
      };
      if (!trySet()) {
        // Widget may still be initialising; retry briefly.
        let tries = 0;
        const iv = setInterval(() => {
          if (trySet() || ++tries > 50) clearInterval(iv);
        }, 200);
      }
    }

    // Show the current language label if one is already active.
    (function initLang() {
      const code = currentLangCode();
      const lang = LANGUAGES.find((l) => l.code === code);
      if (lang) langCurrent.textContent = lang.name;
      if (code !== 'en') setLanguage(code);
    })();
  