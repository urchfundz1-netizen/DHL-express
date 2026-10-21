// verify-lang.mjs — confirm the language selector + removals are live.
const BASE = 'http://localhost:3999';
const t = await (await fetch(`${BASE}/track`)).text();
console.log('GET /track ->', (await fetch(`${BASE}/track`)).status, '| bytes:', t.length);
const checks = {
  'Customer Portal Logins removed': !t.includes('Customer Portal Logins'),
  'Nigeria link removed': !t.includes('Nigeria'),
  'lang selector markup': t.includes('id="langSelect"') && t.includes('id="langBtn"') && t.includes('id="langMenu"'),
  'lang search box': t.includes('id="langSearch"'),
  'lang list container': t.includes('id="langList"'),
  'language data array': (t.match(/\{ name: '/g) || []).length,
  'Google Translate element': t.includes('google_translate_element') && t.includes('translate_a/element.js'),
  'styled (lang-menu CSS)': t.includes('.lang-menu') && t.includes('.lang-list'),
};
for (const k in checks) console.log(' ', k, '->', checks[k]);
// Count distinct language codes present
const codes = [...t.matchAll(/\{ name: '[^']+', native: '[^']*', code: '([^']+)' \}/g)].map((m) => m[1]);
console.log('\nDistinct language codes found:', new Set(codes).size);
