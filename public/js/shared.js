// public/js/shared.js
// Shared frontend utilities: API client, formatting, header/footer injection.

// ---- API client ------------------------------------------------------------
function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.headers['X-CSRF-Token'] = getCsrfToken();
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.field = data.field;
    err.data = data;
    throw err;
  }
  return data;
}

// ---- Formatting ------------------------------------------------------------
function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function fmtTimeOnly(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = String(timeStr).split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ---- Status badge ----------------------------------------------------------
const STATUS_TONE_CLASSES = {
  gray: 'bg-ink/10 text-ink/70',
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-brand-red/10 text-brand-red',
  yellow: 'bg-brand-yellow/20 text-brand-yellow-700',
  green: 'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
};
const STATUS_DOT_CLASSES = {
  gray: 'bg-ink/40', blue: 'bg-blue-500', amber: 'bg-amber-500',
  red: 'bg-brand-red', yellow: 'bg-brand-yellow-600', green: 'bg-green-500', purple: 'bg-purple-500',
};
function statusBadge(status, tone) {
  const cls = STATUS_TONE_CLASSES[tone] || STATUS_TONE_CLASSES.gray;
  const dot = STATUS_DOT_CLASSES[tone] || STATUS_DOT_CLASSES.gray;
  return `<span class="badge ${cls}"><span class="h-1.5 w-1.5 rounded-full ${dot}"></span>${escapeHtml(status)}</span>`;
}

// ---- Icons -----------------------------------------------------------------
const DELIVERY_ICONS = {
  truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h3.5L21 14v2h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
  plane: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  ship: '<path d="M3 15h18l-2 5H5l-2-5Z"/><path d="M5 15V9h14v6"/><path d="M12 3v6"/>',
  shield: '<path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  warehouse: '<path d="M3 21V8l9-4 9 4v13"/><path d="M7 21v-7h10v7"/><path d="M7 17h10"/>',
  bolt: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h5a4 4 0 0 0 0-8H8a4 4 0 0 1 0-8h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
};

function deliveryIcon(name, cls = 'h-6 w-6') {
  const paths = DELIVERY_ICONS[name] || DELIVERY_ICONS.box;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// ---- Scroll reveal ---------------------------------------------------------
let revealObserver = null;

function setupReveal() {
  const pending = document.querySelectorAll('.reveal:not(.is-visible)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    pending.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  }
  pending.forEach((el) => revealObserver.observe(el));
}

// ---- Language --------------------------------------------------------------
const SITE_LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'French', code: 'fr' },
  { name: 'Spanish', code: 'es' },
  { name: 'German', code: 'de' },
  { name: 'Italian', code: 'it' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Dutch', code: 'nl' },
  { name: 'Russian', code: 'ru' },
  { name: 'Chinese (Simplified)', code: 'zh-CN' },
  { name: 'Chinese (Traditional)', code: 'zh-TW' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Bengali', code: 'bn' },
  { name: 'Urdu', code: 'ur' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Vietnamese', code: 'vi' },
  { name: 'Thai', code: 'th' },
  { name: 'Indonesian', code: 'id' },
  { name: 'Malay', code: 'ms' },
  { name: 'Filipino', code: 'fil' },
  { name: 'Polish', code: 'pl' },
  { name: 'Ukrainian', code: 'uk' },
  { name: 'Romanian', code: 'ro' },
  { name: 'Greek', code: 'el' },
  { name: 'Czech', code: 'cs' },
  { name: 'Swedish', code: 'sv' },
  { name: 'Norwegian', code: 'no' },
  { name: 'Danish', code: 'da' },
  { name: 'Finnish', code: 'fi' },
  { name: 'Hungarian', code: 'hu' },
  { name: 'Hebrew', code: 'he' },
  { name: 'Persian', code: 'fa' },
  { name: 'Swahili', code: 'sw' },
  { name: 'Tamil', code: 'ta' },
  { name: 'Telugu', code: 'te' },
  { name: 'Marathi', code: 'mr' },
  { name: 'Gujarati', code: 'gu' },
  { name: 'Punjabi', code: 'pa' },
  { name: 'Kannada', code: 'kn' },
  { name: 'Malayalam', code: 'ml' },
  { name: 'Sinhala', code: 'si' },
  { name: 'Nepali', code: 'ne' },
  { name: 'Burmese', code: 'my' },
  { name: 'Khmer', code: 'km' },
  { name: 'Lao', code: 'lo' },
  { name: 'Amharic', code: 'am' },
  { name: 'Hausa', code: 'ha' },
  { name: 'Yoruba', code: 'yo' },
  { name: 'Igbo', code: 'ig' },
  { name: 'Zulu', code: 'zu' },
  { name: 'Afrikaans', code: 'af' },
  { name: 'Somali', code: 'so' },
  { name: 'Serbian', code: 'sr' },
  { name: 'Croatian', code: 'hr' },
  { name: 'Bulgarian', code: 'bg' },
  { name: 'Slovak', code: 'sk' },
  { name: 'Slovenian', code: 'sl' },
  { name: 'Lithuanian', code: 'lt' },
  { name: 'Latvian', code: 'lv' },
  { name: 'Estonian', code: 'et' },
  { name: 'Catalan', code: 'ca' },
  { name: 'Basque', code: 'eu' },
  { name: 'Galician', code: 'gl' },
  { name: 'Irish', code: 'ga' },
  { name: 'Welsh', code: 'cy' },
  { name: 'Icelandic', code: 'is' },
  { name: 'Albanian', code: 'sq' },
  { name: 'Macedonian', code: 'mk' },
  { name: 'Bosnian', code: 'bs' },
  { name: 'Georgian', code: 'ka' },
  { name: 'Armenian', code: 'hy' },
  { name: 'Azerbaijani', code: 'az' },
  { name: 'Kazakh', code: 'kk' },
  { name: 'Uzbek', code: 'uz' },
  { name: 'Mongolian', code: 'mn' },
  { name: 'Pashto', code: 'ps' },
  { name: 'Kurdish', code: 'ku' },
  { name: 'Maltese', code: 'mt' },
  { name: 'Belarusian', code: 'be' },
  { name: 'Haitian Creole', code: 'ht' },
  { name: 'Cebuano', code: 'ceb' },
  { name: 'Hmong', code: 'hmn' },
  { name: 'Javanese', code: 'jw' },
  { name: 'Sundanese', code: 'su' },
  { name: 'Malagasy', code: 'mg' },
  { name: 'Chichewa', code: 'ny' },
  { name: 'Kinyarwanda', code: 'rw' },
  { name: 'Xhosa', code: 'xh' },
];

const LANGUAGE_STORAGE_KEY = 'swiftnova.language';

function storedLanguageCode() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function cookieLanguageCode() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  if (!m) return '';
  try {
    const parts = decodeURIComponent(m[1]).split('/');
    return parts[2] || '';
  } catch (e) {
    return '';
  }
}

// localStorage is the source of truth: Google may rewrite or clear its own
// cookie, but the selected language must survive refreshes and page changes.
function currentLanguageCode() {
  return storedLanguageCode() || cookieLanguageCode() || 'en';
}

function persistLanguage(code) {
  const value = code === 'en' ? '/en/en' : `/en/${code}`;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch (e) { /* private mode / storage disabled */ }
  document.cookie = `googtrans=${value};path=/;max-age=31536000;SameSite=Lax`;
}

function syncLanguageCookie() {
  const code = storedLanguageCode();
  if (!code) return;
  const value = code === 'en' ? '/en/en' : `/en/${code}`;
  document.cookie = `googtrans=${value};path=/;max-age=31536000;SameSite=Lax`;
}

function languageOptions(selected) {
  return SITE_LANGUAGES.map(
    (l) => `<option value="${l.code}"${l.code === selected ? ' selected' : ''}>${l.name}</option>`
  ).join('');
}

function languageSelect(id, extraClass = '') {
  return `<select id="${id}" data-language-select aria-label="Language"
    class="rounded-lg border border-ink/15 bg-white/70 px-2 py-2 text-xs font-semibold text-ink focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/30 ${extraClass}">
    ${languageOptions(currentLanguageCode())}
  </select>`;
}

function setSiteLanguage(code) {
  persistLanguage(code);
  window.location.reload();
}

let googleTranslateLoading = false;

// Everything Google injects on top of the page: the translation banner
// ("The content of this secure page will be sent to Google..."), the language
// menu and the tooltips. The current widget no longer uses
// .goog-te-banner-frame - it appends an iframe with an obfuscated class name
// (VIpgJd-...) plus "skiptranslate" to the body, so match on that instead.
const GOOGLE_UI_SELECTOR =
  'iframe.skiptranslate, .goog-te-banner-frame, .goog-te-menu-frame, .goog-te-balloon-frame, .goog-te-float-top, .goog-te-float-bottom, .goog-te-ftab-float, .goog-tooltip, .goog-gt-popup, #goog-gt-tt, iframe[src*="translate.google.com"], iframe[src*="translate.googleapis.com"]';

function hideGoogleUi(node) {
  if (!node || node.nodeType !== 1) return;
  // The banner lives in a cross-origin iframe: hide it instead of removing
  // it from the DOM, so the widget keeps working.
  if (node.style && node.style.setProperty) {
    node.style.setProperty('display', 'none', 'important');
    node.style.setProperty('visibility', 'hidden', 'important');
  }
  if (node.setAttribute) node.setAttribute('aria-hidden', 'true');
}

function stripGoogleUi(node) {
  if (!node || node.nodeType !== 1 || !node.matches) return;
  if (node.matches(GOOGLE_UI_SELECTOR)) {
    if (node.tagName === 'IFRAME') {
      hideGoogleUi(node);
    } else {
      node.remove();
    }
    return;
  }
  if (node.querySelectorAll) {
    node.querySelectorAll(GOOGLE_UI_SELECTOR).forEach((el) => {
      if (el.tagName === 'IFRAME') {
        hideGoogleUi(el);
      } else {
        el.remove();
      }
    });
  }
}

let googleUiWatcher = null;
function watchGoogleUi() {
  if (googleUiWatcher || !document.body) return;
  stripGoogleUi(document.body);
  if (typeof MutationObserver === 'undefined') return;
  googleUiWatcher = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const cls = typeof node.className === 'string' ? node.className : '';
        const hasFrame = node.tagName === 'IFRAME' || (node.querySelector && node.querySelector('iframe'));
        if (cls.indexOf('goog') !== -1 || hasFrame) stripGoogleUi(node);
      }
    }
  });
  googleUiWatcher.observe(document.body, { childList: true, subtree: true });
}

function loadGoogleTranslate() {
  syncLanguageCookie();
  watchGoogleUi();
  if (window.google && window.google.translate) return;
  if (googleTranslateLoading) return;
  if (document.querySelector('script[data-google-translate]')) return;
  googleTranslateLoading = true;

  // The widget renders its own toolbar; keep it off-screen and hidden by CSS.
  let host = document.getElementById('google_translate_element');
  if (!host) {
    host = document.createElement('div');
    host.id = 'google_translate_element';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
  }

  window.googleTranslateElementInit = function init() {
    new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
    watchGoogleUi();
    const code = currentLanguageCode();
    if (!code || code === 'en') return;
    let tries = 0;
    const timer = setInterval(() => {
      const combo = document.querySelector('select.goog-te-combo');
      if (combo) {
        if (combo.value !== code) {
          combo.value = code;
          combo.dispatchEvent(new Event('change'));
        }
        clearInterval(timer);
        setTimeout(watchGoogleUi, 100);
      } else if (++tries > 50) {
        clearInterval(timer);
      }
    }, 200);
  };
  const script = document.createElement('script');
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  script.dataset.googleTranslate = 'true';
  document.body.appendChild(script);
}

function initLanguageControls() {
  // The admin area stays in English: no selector, no Google Translate.
  if (document.body && document.body.dataset && document.body.dataset.noTranslate !== undefined) return;
  syncLanguageCookie();
  const current = currentLanguageCode();
  document.querySelectorAll('[data-language-select]').forEach((sel) => {
    if (!sel.options.length) sel.innerHTML = languageOptions(current);
    sel.value = current;
    sel.addEventListener('change', () => setSiteLanguage(sel.value));
  });
  if (current !== 'en') loadGoogleTranslate();
}

// ---- Logo ------------------------------------------------------------------
const BRAND_NAME = 'Express Delivery';

function brandLogo({ dark = false, large = false } = {}) {
  const cls = ['brand-logo', dark ? 'is-dark' : '', large ? 'brand-logo-lg' : ''].join(' ').trim();
  return `<span class="${cls}" aria-label="${BRAND_NAME}">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="#FFCC00"/>
        <g class="brand-speed" stroke="#D40511" stroke-width="2.2" stroke-linecap="round">
          <path d="M4 14h5"/>
          <path d="M3 20h6"/>
          <path d="M5 26h4"/>
        </g>
        <g fill="none" stroke="#121417" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
          <path d="M15 14l6-3 6 3v10l-6 3-6-3V14Z"/>
          <path d="M15 14l6 3 6-3M21 17v13"/>
        </g>
      </svg>
    </span>
    <span class="brand-text">
      <span class="brand-word">Express <span class="brand-word-2">Delivery</span></span>
      <span class="brand-route" aria-hidden="true">
        <span class="brand-route-line"></span>
        <svg class="brand-van" viewBox="0 0 30 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3.5h12v8H2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M14 6h5l4 4v1.5h-9V6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <circle cx="7" cy="12.5" r="1.7" fill="currentColor"/>
          <circle cx="21" cy="12.5" r="1.7" fill="currentColor"/>
        </svg>
        <span class="brand-plane" aria-hidden="true">
          <span class="brand-plane-trail"></span>
          <svg class="brand-plane-icon" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M46.5 12C46.5 9.3 44.8 7.5 42 7.3L13 7.3C9 7.3 5.5 8.6 3 10.6C2 11.2 2 12.4 3 13C5.5 15 9 16.3 13 16.3L42 16.6C44.8 16.6 46.5 14.7 46.5 12Z"/>
            <path fill="currentColor" d="M16 7.3 6.5 0.8 2.6 0.8 8.4 7.3Z"/>
            <path fill="currentColor" d="M7 8.2 0.8 6.4 0 6.6 2.8 9.4Z"/>
            <path fill="currentColor" d="M31 14.4 19.5 22.4 15 22.4 25.5 14.2Z"/>
            <ellipse cx="26.5" cy="18.6" rx="3.6" ry="1.8" transform="rotate(-8 26.5 18.6)" fill="currentColor"/>
          </svg>
        </span>
      </span>
    </span>
  </span>`;
}

function logoMark() {
  return `
    <a href="/" class="inline-flex" aria-label="${BRAND_NAME} home">
      ${brandLogo()}
    </a>`;
}

// Standalone logo mark (no link) for dark backgrounds, e.g. admin.
function logoMarkDark() {
  return brandLogo({ dark: true });
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/track', label: 'Track Shipment' },
  { href: '/services', label: 'Our Services' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact' },
];

function renderHeader(active) {
  const links = NAV_LINKS.map((l) => {
    const isActive = active === l.href;
    return `<a href="${l.href}" class="relative px-1 py-2 text-sm font-semibold ${isActive ? 'text-brand-red' : 'text-ink/80 hover:text-ink'} transition">${l.label}<span class="absolute left-0 -bottom-0.5 h-0.5 w-full origin-left scale-x-0 bg-brand-red transition-transform ${isActive ? 'scale-x-100' : ''}"></span></a>`;
  }).join('');
  return `
  <header class="sticky top-0 z-40 border-b border-ink/10 bg-brand-yellow">
    <div class="container-x flex h-16 items-center justify-between gap-4">
      ${logoMark()}
      <nav class="hidden items-center gap-7 md:flex group">${links}</nav>
      <div class="flex items-center gap-2">
        ${languageSelect('siteLanguage', 'hidden sm:block max-w-[9.5rem]')}
        <a href="/track" class="btn-primary hidden sm:inline-flex">Track a Package</a>
        <button id="navToggle" class="grid h-10 w-10 place-items-center rounded-lg border border-ink/15 text-ink md:hidden" aria-label="Toggle menu" aria-expanded="false">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </div>
    <div id="mobileNav" class="hidden border-t border-ink/10 bg-brand-yellow md:hidden">
      <nav class="container-x flex flex-col py-2">
        ${NAV_LINKS.map((l) => `<a href="${l.href}" class="rounded-lg px-3 py-3 text-sm font-semibold ${active === l.href ? 'bg-ink/10 text-brand-red' : 'text-ink/80'}">${l.label}</a>`).join('')}
        <a href="/track" class="btn-primary mt-2 mb-2">Track a Package</a>
        <label for="siteLanguageMobile" class="mt-2 px-3 text-xs font-bold uppercase tracking-wider text-ink/60">Language</label>
        ${languageSelect('siteLanguageMobile', 'mt-1 mb-3 w-full')}
      </nav>
    </div>
  </header>`;
}


function renderFooter() {
  const year = new Date().getFullYear();
  return `
  <footer class="mt-auto bg-brand-yellow text-ink/80">
    <div class="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        ${logoMark()}
        <p class="mt-4 text-sm leading-relaxed">Excellence. Simply delivered. Your parcels, tracked in real time from pickup to doorstep across 220+ countries and territories.</p>
      </div>
      <div>
        <h4 class="mb-3 text-sm font-bold uppercase tracking-wider text-ink">Company</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="/about" class="hover:text-brand-red">About Us</a></li>
          <li><a href="/services" class="hover:text-brand-red">Our Services</a></li>
          <li><a href="/track" class="hover:text-brand-red">Track Shipment</a></li>
          <li><a href="/contact" class="hover:text-brand-red">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4 class="mb-3 text-sm font-bold uppercase tracking-wider text-ink">Support</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="/contact#faq" class="hover:text-brand-red">FAQs</a></li>
          <li><a href="/about#privacy" class="hover:text-brand-red">Privacy Policy</a></li>
          <li><a href="/about#terms" class="hover:text-brand-red">Terms of Service</a></li>
          <li><a href="/contact" class="hover:text-brand-red">Customer Support</a></li>
        </ul>
      </div>
      <div>
        <h4 class="mb-3 text-sm font-bold uppercase tracking-wider text-ink">Contact</h4>
        <ul class="space-y-2 text-sm">
          <li>+49 228 555-0142</li>
          <li>Mon–Sat, 8:00–20:00</li>
        </ul>
      </div>
    </div>
    <div class="border-t border-ink/10">
      <div class="container-x flex flex-col items-center justify-between gap-2 py-5 text-xs sm:flex-row">
      </div>
    </div>
  </footer>`;
}

function mountChrome(active) {
  const headerEl = document.querySelector('[data-site-header]');
  const footerEl = document.querySelector('[data-site-footer]');
  if (headerEl) headerEl.outerHTML = renderHeader(active);
  if (footerEl) footerEl.outerHTML = renderFooter();
  initLanguageControls();
  const toggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('hidden');
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }
  setupReveal();
}

// ---- Toast -----------------------------------------------------------------
function toast(message, type = 'info') {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  const tone = type === 'error' ? 'bg-brand-red' : type === 'success' ? 'bg-green-600' : 'bg-ink';
  el.className = `${tone} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-card-lg animate-fade-in-up`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

// ---- Copy helper -----------------------------------------------------------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Copied to clipboard', 'success');
  }
}

