// public/js/admin-login.js
// Admin login: CSRF bootstrap, show/hide password, submit with validation.

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Bootstrap: hit a public endpoint so the server sets the session + CSRF cookie.
(async function bootstrap() {
  try { await fetch('/api/constants', { credentials: 'same-origin' }); } catch (e) { /* ignore */ }
})();

// If already authenticated, bounce to the dashboard.
(async function check() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) window.location.href = '/admin';
    }
  } catch (e) { /* stay on login */ }
})();

// Show/hide password
const pw = document.getElementById('password');
const togglePw = document.getElementById('togglePw');
const eyeOpen = document.getElementById('eyeOpen');
const eyeClosed = document.getElementById('eyeClosed');
togglePw.addEventListener('click', () => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  eyeOpen.classList.toggle('hidden', show);
  eyeClosed.classList.toggle('hidden', !show);
  togglePw.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

// Submit
const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const errorEl = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');

  const email = emailEl.value.trim();
  const password = pw.value;

  if (!email || !password) { showError('Please enter your email and password.'); return; }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Signing in…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showError(data.error || 'Invalid email or password.');
      btn.disabled = false;
      btn.textContent = original;
      return;
    }
    window.location.href = '/admin';
  } catch (err) {
    showError('Something went wrong. Please try again.');
    btn.disabled = false;
    btn.textContent = original;
  }
});
