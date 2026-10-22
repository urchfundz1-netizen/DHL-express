// public/js/admin.js
// Admin dashboard: single-page app with client-side routing.

// ---- Shared state ----------------------------------------------------------
const ADMIN = {
  constants: { statuses: [], statusTone: {}, delayReasons: [], categories: [], shippingMethods: [], currencies: [] },
  me: null,
  route: 'dashboard',
  shipmentsState: { page: 1, search: '', status: '', sort: 'created_at', dir: 'desc', total: 0, totalPages: 1 },
};

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.headers['X-CSRF-Token'] = getCsrfToken();
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401) { window.location.href = '/admin/login'; throw new Error('Unauthorized'); }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.field = data.field; err.data = data;
    throw err;
  }
  return data;
}

// ---- Sidebar nav -----------------------------------------------------------
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 001-1h3m-6 0a1 1 0 001-1v-4a1 1 0 00-1-1h-4a1 1 0 00-1 1v4a1 1 0 001 1"/>' },
  { id: 'shipments', label: 'All Shipments', icon: '<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>' },
  { id: 'create', label: 'Create Shipment', icon: '<path d="M12 4v16m8-8H4"/>' },
  { id: 'updates', label: 'Delivery Updates', icon: '<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>' },
  { id: 'delayed', label: 'Delayed Shipments', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: 'recipients', label: 'Recipients', icon: '<path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>' },
  { id: 'reports', label: 'Reports', icon: '<path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>' },
  { id: 'activity', label: 'Activity Logs', icon: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>' },
  { id: 'settings', label: 'Settings', icon: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' },
];

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = NAV.map((n) => {
    const active = ADMIN.route === n.id;
    return `<button data-nav="${n.id}" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${active ? 'bg-brand-yellow text-ink' : 'text-white/70 hover:bg-white/5 hover:text-white'}">
      <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg>
      ${n.label}
    </button>`;
  }).join('');
  nav.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.getAttribute('data-nav'));
      closeSidebar();
    });
  });
}

function openSidebar() {
  document.getElementById('sidebar').classList.remove('-translate-x-full');
  document.getElementById('sidebarOverlay').classList.remove('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.add('-translate-x-full');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}
document.getElementById('sidebarToggle').addEventListener('click', openSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);


// ---- Logout ----------------------------------------------------------------
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': getCsrfToken() } });
  } catch (e) {}
  window.location.href = '/admin/login';
});

// ---- Router ----------------------------------------------------------------
function navigate(route, opts = {}) {
  ADMIN.route = route;
  renderSidebar();
  const active = NAV.find((n) => n.id === route);
  document.getElementById('pageTitle').textContent = active ? active.label : 'Dashboard';
  const view = document.getElementById('view');
  view.innerHTML = `<div class="py-20 text-center text-sm text-ink/50">Loading…</div>`;
  const views = {
    dashboard: viewDashboard,
    shipments: viewShipments,
    create: viewCreateShipment,
    updates: viewDeliveryUpdates,
    delayed: viewDelayed,
    recipients: viewRecipients,
    reports: viewReports,
    activity: viewActivity,
    settings: viewSettings,
  };
  const fn = views[route] || viewDashboard;
  Promise.resolve(fn(view, opts)).catch((err) => {
    view.innerHTML = `<div class="card p-6 text-center"><p class="font-semibold text-brand-red">${escapeHtml(err.message || 'Something went wrong')}</p></div>`;
  });
}

// ---- Formatting helpers ----------------------------------------------------
function trackingDisplay(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!s.startsWith('SWN')) return s;
  const groups = (s.slice(3).match(/.{1,4}/g) || []);
  return ['SWN', ...groups].join(' ');
}
function fmtDateShort(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDT(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function statusBadgeAdmin(status) {
  const tone = ADMIN.constants.statusTone[status] || 'gray';
  return statusBadge(status, tone);
}
function relativeTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---- Modal helper ----------------------------------------------------------
function openModal(title, bodyHtml, footerHtml = '') {
  const host = document.getElementById('modalHost');
  host.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" data-modal-backdrop>
      <div class="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-card-lg sm:rounded-xl2 animate-fade-in-up">
        <div class="sticky top-0 flex items-center justify-between gap-4 border-b border-ink/10 bg-white px-5 py-4">
          <h3 class="text-lg font-bold">${title}</h3>
          <button data-modal-close class="grid h-9 w-9 place-items-center rounded-lg text-ink/50 hover:bg-ink/5" aria-label="Close">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="px-5 py-5">${bodyHtml}</div>
        ${footerHtml ? `<div class="sticky bottom-0 border-t border-ink/10 bg-white px-5 py-4">${footerHtml}</div>` : ''}
      </div>
    </div>`;
  const close = () => { host.innerHTML = ''; };
  host.querySelector('[data-modal-close]').addEventListener('click', close);
  host.querySelector('[data-modal-backdrop]').addEventListener('click', (e) => { if (e.target.hasAttribute('data-modal-backdrop')) close(); });
  return { el: host, close };
}

// ---- Dashboard view --------------------------------------------------------
function statCard(label, value, tone, icon) {
  const tones = {
    ink: 'bg-ink/5 text-ink', blue: 'bg-blue-100 text-blue-700', yellow: 'bg-brand-yellow/20 text-brand-yellow-700',
    red: 'bg-brand-red/10 text-brand-red', green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-700',
  };
  return `<div class="card p-5">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-ink/60">${label}</p>
      <span class="grid h-9 w-9 place-items-center rounded-lg ${tones[tone] || tones.ink}"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
    </div>
    <p class="mt-3 text-3xl font-extrabold tracking-tight">${value}</p>
  </div>`;
}

async function viewDashboard(view) {
  const data = await api('/api/admin/dashboard');
  const s = data.stats;
  view.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      ${statCard('Total Shipments', s.total, 'ink', '<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>')}
      ${statCard('Awaiting Pickup', s.awaiting_pickup, 'blue', '<path d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/>')}
      ${statCard('In Transit', s.in_transit, 'yellow', '<path d="M13 10V3L4 14h7v7l9-11h-7z"/>')}
      ${statCard('Out for Delivery', s.out_for_delivery, 'amber', '<path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/><path d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1"/>')}
      ${statCard('Delayed', s.delayed, 'red', '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>')}
      ${statCard('On Hold', s.on_hold, 'amber', '<path d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>')}
      ${statCard('Delivered', s.delivered, 'green', '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>')}
      ${statCard('Archived', s.archived, 'ink', '<path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>')}
    </div>
    <div id="dashRecent"></div>
  `;
  renderDashboardRecent(view, data);
}


function renderDashboardRecent(view, data) {
  const host = view.querySelector('#dashRecent');
  host.innerHTML = `
    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <div class="card lg:col-span-2 overflow-hidden">
        <div class="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 class="font-bold">Recently created shipments</h2>
          <button data-go="shipments" class="text-sm font-semibold text-brand-red hover:underline">View all</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
              <th class="px-5 py-3 font-semibold">Tracking</th><th class="px-5 py-3 font-semibold">Recipient</th>
              <th class="px-5 py-3 font-semibold">Status</th><th class="px-5 py-3 font-semibold">Est. delivery</th></tr></thead>
            <tbody>
              ${data.recentShipments.map((r) => `
                <tr class="border-b border-ink/5 hover:bg-ink/[0.02] cursor-pointer" data-open="${r.id}">
                  <td class="px-5 py-3 font-mono text-xs font-semibold">${trackingDisplay(r.tracking_number)}</td>
                  <td class="px-5 py-3">${escapeHtml(r.recipient_name)}<span class="block text-xs text-ink/40">${escapeHtml(r.destination_city || '')}</span></td>
                  <td class="px-5 py-3">${statusBadgeAdmin(r.status)}</td>
                  <td class="px-5 py-3 text-ink/60">${fmtDateShort(r.estimated_delivery_date)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="px-5 py-8 text-center text-ink/40">No shipments yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card overflow-hidden">
        <h2 class="border-b border-ink/10 px-5 py-4 font-bold">Recent status updates</h2>
        <ul class="divide-y divide-ink/5">
          ${data.recentEvents.map((e) => `
            <li class="px-5 py-3">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs font-semibold text-ink/70">${trackingDisplay(e.tracking_number)}</span>
                <span class="text-xs text-ink/40">${relativeTime(e.created_at)}</span>
              </div>
              <p class="mt-1 text-sm">${escapeHtml(e.status)}</p>
              <p class="text-xs text-ink/40 truncate">${escapeHtml(e.description)}</p>
            </li>`).join('') || '<li class="px-5 py-6 text-center text-ink/40 text-sm">No updates yet.</li>'}
        </ul>
      </div>
    </div>
    ${data.delayedShipments.length ? `
    <div class="mt-6 card overflow-hidden border-brand-red/20">
      <div class="flex items-center justify-between border-b border-ink/10 px-5 py-4">
        <h2 class="font-bold text-brand-red">Delayed shipments</h2>
        <button data-go="delayed" class="text-sm font-semibold text-brand-red hover:underline">Manage delays</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
            <th class="px-5 py-3 font-semibold">Tracking</th><th class="px-5 py-3 font-semibold">Recipient</th>
            <th class="px-5 py-3 font-semibold">Status</th><th class="px-5 py-3 font-semibold">Est. delivery</th></tr></thead>
          <tbody>
            ${data.delayedShipments.map((r) => `
              <tr class="border-b border-ink/5 hover:bg-ink/[0.02] cursor-pointer" data-open="${r.id}">
                <td class="px-5 py-3 font-mono text-xs font-semibold">${trackingDisplay(r.tracking_number)}</td>
                <td class="px-5 py-3">${escapeHtml(r.recipient_name)}</td>
                <td class="px-5 py-3">${statusBadgeAdmin(r.status)}</td>
                <td class="px-5 py-3 text-brand-red">${fmtDateShort(r.estimated_delivery_date)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;
  view.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => navigate(b.getAttribute('data-go'))));
  view.querySelectorAll('[data-open]').forEach((tr) => tr.addEventListener('click', () => openShipmentModal(parseInt(tr.getAttribute('data-open'), 10))));
}

// ---- Shipments list view ---------------------------------------------------
async function viewShipments(view) {
  const st = ADMIN.shipmentsState;
  view.innerHTML = `
    <div class="card overflow-hidden">
      <div class="flex flex-col gap-4 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="font-bold">All Shipments</h2>
          <p class="text-sm text-ink/50" id="shipCount"></p>
        </div>
        <button data-go="create" class="btn-primary shrink-0">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4"/></svg>
          New Shipment
        </button>
      </div>
      <div class="grid gap-3 border-b border-ink/10 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <input id="searchInput" class="input input-sm lg:col-span-2" placeholder="Search tracking, recipient, city…" value="${escapeHtml(st.search)}" />
        <select id="statusFilter" class="input input-sm">
          <option value="">All statuses</option>
          ${ADMIN.constants.statuses.map((s) => `<option ${st.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select id="archivedFilter" class="input input-sm">
          <option value="false" ${st.archived === 'false' ? 'selected' : ''}>Active</option>
          <option value="true" ${st.archived === 'true' ? 'selected' : ''}>Archived</option>
          <option value="all" ${st.archived === 'all' ? 'selected' : ''}>All</option>
        </select>
      </div>
      <div id="shipTable"></div>
    </div>
  `;
  view.querySelector('[data-go="create"]').addEventListener('click', () => navigate('create'));
  const searchInput = view.querySelector('#searchInput');
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { st.search = searchInput.value; st.page = 1; loadShipTable(view); }, 300);
  });
  view.querySelector('#statusFilter').addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; loadShipTable(view); });
  view.querySelector('#archivedFilter').addEventListener('change', (e) => { st.archived = e.target.value; st.page = 1; loadShipTable(view); });
  loadShipTable(view);
}

function sortHeader(key, label) {
  const st = ADMIN.shipmentsState;
  const active = st.sort === key;
  const arrow = active ? (st.dir === 'asc' ? '▲' : '▼') : '';
  return `<th class="px-4 py-3 font-semibold"><button data-sort="${key}" class="inline-flex items-center gap-1 hover:text-ink">${label}<span class="text-[10px]">${arrow}</span></button></th>`;
}


async function loadShipTable(view) {
  const st = ADMIN.shipmentsState;
  const host = view.querySelector('#shipTable');
  host.innerHTML = `<div class="py-12 text-center text-sm text-ink/40">Loading…</div>`;
  const params = new URLSearchParams({ search: st.search, status: st.status, sort: st.sort, dir: st.dir, page: st.page, limit: 15, archived: st.archived || 'false' });
  const data = await api(`/api/admin/shipments?${params}`);
  st.total = data.total; st.totalPages = data.totalPages;
  view.querySelector('#shipCount').textContent = `${data.total} shipment${data.total !== 1 ? 's' : ''} found`;

  if (data.rows.length === 0) {
    host.innerHTML = `<div class="py-16 text-center"><p class="text-ink/50">No shipments match your filters.</p></div>`;
    return;
  }
  const viewBtn = `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
  const copyBtn = `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>`;

  host.innerHTML = `
    <div class="hidden md:block overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-ink/50">
          ${sortHeader('tracking_number', 'Tracking')}
          ${sortHeader('recipient_name', 'Recipient')}
          ${sortHeader('status', 'Status')}
          <th class="px-4 py-3 font-semibold">Route</th>
          ${sortHeader('estimated_delivery_date', 'Est. delivery')}
          ${sortHeader('updated_at', 'Updated')}
          <th class="px-4 py-3 font-semibold text-right">Actions</th>
        </tr></thead>
        <tbody>
          ${data.rows.map((r) => `
            <tr class="border-b border-ink/5 hover:bg-ink/[0.02]">
              <td class="px-4 py-3"><button data-open="${r.id}" class="font-mono text-xs font-semibold text-brand-red hover:underline">${trackingDisplay(r.tracking_number)}</button>${r.archived ? '<span class="badge ml-1 bg-ink/10 text-ink/50">Archived</span>' : ''}</td>
              <td class="px-4 py-3">${escapeHtml(r.recipient_name)}</td>
              <td class="px-4 py-3">${statusBadgeAdmin(r.status)}</td>
              <td class="px-4 py-3 text-ink/60">${escapeHtml(r.origin_city || '—')} → ${escapeHtml(r.destination_city || '—')}</td>
              <td class="px-4 py-3 text-ink/60">${fmtDateShort(r.estimated_delivery_date)}</td>
              <td class="px-4 py-3 text-ink/40 text-xs">${relativeTime(r.updated_at)}</td>
              <td class="px-4 py-3"><div class="flex items-center justify-end gap-1">
                <button data-copy="${r.tracking_number}" class="rounded p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink" title="Copy tracking">${copyBtn}</button>
                <button data-open="${r.id}" class="rounded p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink" title="View">${viewBtn}</button>
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="md:hidden divide-y divide-ink/10">
      ${data.rows.map((r) => `
        <div class="p-4">
          <div class="flex items-start justify-between gap-2">
            <button data-open="${r.id}" class="font-mono text-sm font-bold text-brand-red">${trackingDisplay(r.tracking_number)}</button>
            ${statusBadgeAdmin(r.status)}
          </div>
          <p class="mt-1 text-sm font-medium">${escapeHtml(r.recipient_name)}</p>
          <p class="text-xs text-ink/50">${escapeHtml(r.origin_city || '—')} → ${escapeHtml(r.destination_city || '—')}</p>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs text-ink/40">Est. ${fmtDateShort(r.estimated_delivery_date)}</span>
            <div class="flex gap-1">
              <button data-copy="${r.tracking_number}" class="rounded p-1.5 text-ink/50 hover:bg-ink/5">${copyBtn}</button>
              <button data-open="${r.id}" class="rounded p-1.5 text-ink/50 hover:bg-ink/5">${viewBtn}</button>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="flex items-center justify-between border-t border-ink/10 px-5 py-4">
      <p class="text-sm text-ink/50">Page ${data.page} of ${data.totalPages}</p>
      <div class="flex gap-2">
        <button data-page="${data.page - 1}" class="btn-outline ${data.page <= 1 ? 'opacity-40 pointer-events-none' : ''}">Previous</button>
        <button data-page="${data.page + 1}" class="btn-outline ${data.page >= data.totalPages ? 'opacity-40 pointer-events-none' : ''}">Next</button>
      </div>
    </div>`;

  host.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    const key = b.getAttribute('data-sort');
    if (st.sort === key) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
    else { st.sort = key; st.dir = 'asc'; }
    loadShipTable(view);
  }));
  host.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.getAttribute('data-copy'))));
  host.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openShipmentModal(parseInt(b.getAttribute('data-open'), 10))));
  host.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = parseInt(b.getAttribute('data-page'), 10);
    if (p >= 1 && p <= st.totalPages) { st.page = p; loadShipTable(view); }
  }));
}


// ---- Create Shipment view --------------------------------------------------
function field(label, name, type = 'text', opts = {}) {
  const { required = false, placeholder = '', value = '', options = null, help = '', textarea = false, min = '', step = '' } = opts;
  const req = required ? '<span class="text-brand-red">*</span>' : '';
  let control;
  if (textarea) {
    control = `<textarea id="f_${name}" name="${name}" rows="3" class="input" placeholder="${placeholder}">${escapeHtml(value)}</textarea>`;
  } else if (options) {
    control = `<select id="f_${name}" name="${name}" class="input">
      <option value="">— Select —</option>
      ${options.map((o) => `<option ${value === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`;
  } else {
    control = `<input id="f_${name}" name="${name}" type="${type}" class="input" placeholder="${placeholder}" value="${escapeHtml(value)}" ${min ? `min="${min}"` : ''} ${step ? `step="${step}"` : ''} />`;
  }
  return `<div>
    <label class="label" for="f_${name}">${label} ${req}</label>
    ${control}
    ${help ? `<p class="help">${help}</p>` : ''}
    <p class="field-error hidden" data-err="${name}"></p>
  </div>`;
}

async function viewCreateShipment(view) {
  const C = ADMIN.constants;
  const today = new Date().toISOString().slice(0, 10);
  view.innerHTML = `
    <form id="createForm" novalidate>
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-xl font-bold">Create a New Shipment</h2>
          <p class="text-sm text-ink/50">A unique tracking number is generated automatically.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" data-go="shipments" class="btn-outline">Cancel</button>
          <button type="submit" id="createBtn" class="btn-primary">Create Shipment</button>
        </div>
      </div>

      <div id="createError" class="hidden mb-5 rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red" role="alert"></div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="card p-6">
          <h3 class="mb-4 font-bold">Sender &amp; Origin</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            ${field("Sender's full name", 'sender_name', 'text', { required: true, placeholder: 'Jane Doe' })}
            ${field('Sender contact', 'sender_contact', 'text', { placeholder: 'Email or phone' })}
            ${field('Origin address', 'origin_address', 'text', { placeholder: 'Street address' })}
            ${field('Origin city', 'origin_city', 'text', { required: true, placeholder: 'London' })}
            ${field('Origin country', 'origin_country', 'text', { required: true, placeholder: 'United Kingdom' })}
          </div>
        </div>

        <div class="card p-6">
          <h3 class="mb-4 font-bold">Recipient &amp; Destination</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            ${field("Recipient's full name", 'recipient_name', 'text', { required: true, placeholder: 'John Smith' })}
            ${field('Recipient contact', 'recipient_contact', 'text', { placeholder: 'Email or phone (for notifications)' })}
            ${field('Destination address', 'destination_address', 'text', { placeholder: 'Street address' })}
            ${field('Destination city', 'destination_city', 'text', { required: true, placeholder: 'New York' })}
            ${field('Destination country', 'destination_country', 'text', { required: true, placeholder: 'United States' })}
          </div>
        </div>

        <div class="card p-6">
          <h3 class="mb-4 font-bold">Package Information</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            ${field('Package description', 'description', 'text', { required: true, placeholder: 'e.g. Electronics (1 carton)' })}
            ${field('Category', 'category', 'text', { options: C.categories })}
            ${field('Weight (kg)', 'weight_kg', 'number', { placeholder: '0.0', step: '0.1', min: '0' })}
            ${field('Dimensions', 'dimensions', 'text', { placeholder: '40x30x15 cm' })}
            ${field('Shipping method', 'shipping_method', 'text', { options: C.shippingMethods })}
            ${field('Internal reference', 'internal_reference', 'text', { placeholder: 'Optional' })}
          </div>
        </div>

        <div class="card p-6">
          <h3 class="mb-4 font-bold">Delivery Information</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            ${field('Initial status', 'status', 'text', { options: C.statuses, value: 'Shipment Created' })}
            ${field('Pickup date', 'pickup_date', 'date')}
            ${field('Dispatch date', 'dispatch_date', 'date')}
            ${field('Estimated delivery date', 'estimated_delivery_date', 'date', { value: today })}
            ${field('Estimated delivery time', 'estimated_delivery_time', 'time')}
          </div>
          <div class="mt-4">
            <label class="label" for="f_delivery_instructions">Delivery instructions (customer-visible)</label>
            <textarea id="f_delivery_instructions" name="delivery_instructions" rows="2" class="input" placeholder="e.g. Leave with the concierge"></textarea>
          </div>
          <label class="mt-4 flex items-center gap-2 text-sm">
            <input id="f_notify" name="notify_customer" type="checkbox" class="h-4 w-4 rounded border-ink/30 text-brand-red" checked />
            Notify customer by email (if a contact email is provided)
          </label>
        </div>
      </div>
    </form>
    <div id="successModalHost"></div>
  `;

  view.querySelector('[data-go="shipments"]').addEventListener('click', () => navigate('shipments'));

  const form = view.querySelector('#createForm');
  form.addEventListener('submit', (e) => submitCreate(e, form, view));
}

async function submitCreate(e, form, view) {
  e.preventDefault();
  const errBox = view.querySelector('#createError');
  const btn = view.querySelector('#createBtn');
  errBox.classList.add('hidden');
  form.querySelectorAll('[data-err]').forEach((p) => { p.classList.add('hidden'); p.textContent = ''; });

  // Client-side required check for quick feedback (server re-validates).
  const requiredFields = ['sender_name', 'origin_city', 'origin_country', 'recipient_name', 'destination_city', 'destination_country', 'description'];
  let missing = false;
  requiredFields.forEach((name) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el && !el.value.trim()) {
      const p = form.querySelector(`[data-err="${name}"]`);
      if (p) { p.textContent = 'This field is required'; p.classList.remove('hidden'); }
      missing = true;
    }
  });
  if (missing) { errBox.textContent = 'Please complete all required fields.'; errBox.classList.remove('hidden'); return; }

  const fd = new FormData(form);
  const payload = {};
  for (const [k, v] of fd.entries()) {
    if (k === 'notify_customer') continue;
    payload[k] = v;
  }
  payload.notify_customer = form.querySelector('#f_notify').checked;

  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Creating…';

  try {
    const data = await api('/api/admin/shipments', { method: 'POST', body: payload });
    showCreatedModal(data.tracking_number);
    form.reset();
  } catch (err) {
    errBox.textContent = err.message || 'Failed to create shipment.';
    errBox.classList.remove('hidden');
    if (err.field) {
      const p = form.querySelector(`[data-err="${err.field}"]`);
      if (p) { p.textContent = err.message; p.classList.remove('hidden'); }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function showCreatedModal(tracking) {
  const host = document.getElementById('modalHost');
  host.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" data-modal-backdrop>
      <div class="w-full max-w-md rounded-xl2 bg-white p-8 text-center shadow-card-lg animate-fade-in-up">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 text-green-600">
          <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <h3 class="mt-4 text-xl font-bold">Shipment created!</h3>
        <p class="mt-2 text-sm text-ink/60">The shipment is now live and can be tracked by the customer.</p>
        <div class="mt-5 rounded-lg border border-ink/10 bg-ink/[0.02] p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-ink/40">Tracking number</p>
          <div class="mt-2 flex items-center justify-center gap-2">
            <span class="font-mono text-lg font-bold">${trackingDisplay(tracking)}</span>
            <button id="copyNewTracking" class="rounded p-1.5 text-ink/50 hover:bg-ink/10" title="Copy">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
            </button>
          </div>
        </div>
        <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button id="viewCreated" class="btn-primary">View in shipments</button>
          <button id="createAnother" class="btn-outline">Create another</button>
        </div>
      </div>
    </div>`;
  host.querySelector('#copyNewTracking').addEventListener('click', () => copyText(tracking));
  host.querySelector('#viewCreated').addEventListener('click', () => { host.innerHTML = ''; navigate('shipments'); });
  host.querySelector('#createAnother').addEventListener('click', () => { host.innerHTML = ''; });
  host.querySelector('[data-modal-backdrop]').addEventListener('click', (e) => { if (e.target.hasAttribute('data-modal-backdrop')) host.innerHTML = ''; });
}

// ---- Shipment detail modal -------------------------------------------------
async function openShipmentModal(id) {
  const { close } = openModal('Loading shipment…', `<div class="py-10 text-center text-sm text-ink/40">Loading…</div>`);
  try {
    const data = await api(`/api/admin/shipments/${id}`);
    renderShipmentModal(data, close);
  } catch (err) {
    document.getElementById('modalHost').innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" data-modal-backdrop>
        <div class="rounded-xl2 bg-white p-8 text-center shadow-card-lg">
          <p class="font-semibold text-brand-red">${escapeHtml(err.message)}</p>
          <button class="btn-outline mt-4" data-modal-close>Close</button>
        </div>
      </div>`;
    // Inline handlers are blocked by the production CSP (script-src-attr 'none').
    document.querySelector('#modalHost [data-modal-close]').addEventListener('click', () => {
      document.getElementById('modalHost').innerHTML = '';
    });
  }
}

function detailRow(label, value) {
  return `<div><dt class="text-xs font-semibold uppercase tracking-wide text-ink/40">${label}</dt><dd class="mt-0.5 text-sm font-medium">${value}</dd></div>`;
}

function renderShipmentModal(data, close) {
  const s = data.shipment;
  const C = ADMIN.constants;
  const host = document.getElementById('modalHost');
  host.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" data-modal-backdrop>
      <div class="w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-t-2xl bg-white shadow-card-lg sm:rounded-xl2 animate-fade-in-up">
        <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink/10 bg-white px-5 py-4">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-mono text-lg font-bold">${trackingDisplay(s.tracking_number)}</h3>
              <button data-copy="${s.tracking_number}" class="rounded p-1 text-ink/50 hover:bg-ink/5" title="Copy"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg></button>
              ${s.archived ? '<span class="badge bg-ink/10 text-ink/50">Archived</span>' : ''}
            </div>
            <div class="mt-1 flex items-center gap-2">${statusBadgeAdmin(s.status)}<span class="badge bg-ink/10 text-ink/60">${s.status_mode === 'manual' ? 'Manual' : 'Automatic'}</span></div>
          </div>
          <button data-close class="grid h-9 w-9 place-items-center rounded-lg text-ink/50 hover:bg-ink/5"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>

        <div class="px-5 py-5">
          <!-- Quick actions -->
          <div class="flex flex-wrap gap-2">
            <button data-tab="overview" class="tab-btn btn btn-md ${'bg-brand-yellow text-ink'}">Overview</button>
            <button data-tab="edit" class="tab-btn btn btn-md border border-ink/15">Edit</button>
            <button data-tab="status" class="tab-btn btn btn-md border border-ink/15">Update Status</button>
            <button data-tab="delay" class="tab-btn btn btn-md border border-ink/15">Delay</button>
            <button data-tab="comment" class="tab-btn btn btn-md border border-ink/15">Add Comment</button>
            <button data-tab="files" class="tab-btn btn btn-md border border-ink/15">Documents</button>
          </div>

          <div id="modalTabContent" class="mt-5"></div>
        </div>
      </div>
    </div>`;

  const closeModal = () => { host.innerHTML = ''; };
  host.querySelector('[data-close]').addEventListener('click', closeModal);
  host.querySelector('[data-modal-backdrop]').addEventListener('click', (e) => { if (e.target.hasAttribute('data-modal-backdrop')) closeModal(); });
  host.querySelector('[data-copy]').addEventListener('click', () => copyText(s.tracking_number));
  host.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('.tab-btn').forEach((x) => { x.className = 'tab-btn btn btn-md border border-ink/15'; });
    b.className = 'tab-btn btn btn-md bg-brand-yellow text-ink';
    renderModalTab(data, b.getAttribute('data-tab'));
  }));
  renderModalTab(data, 'overview');
}

function renderModalTab(data, tab) {
  const host = document.getElementById('modalTabContent');
  if (!host) return;
  if (tab === 'overview') host.innerHTML = overviewTab(data);
  else if (tab === 'edit') host.innerHTML = editTab(data);
  else if (tab === 'status') host.innerHTML = statusTab(data);
  else if (tab === 'delay') host.innerHTML = delayTab(data);
  else if (tab === 'comment') host.innerHTML = commentTab(data);
  else if (tab === 'files') host.innerHTML = filesTab(data);
  bindModalTab(data, tab, host);
}

function overviewTab(data) {
  const s = data.shipment;
  return `
    <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      ${detailRow('Package', escapeHtml(s.description))}
      ${detailRow('Category', escapeHtml(s.category || '—'))}
      ${detailRow('Weight', s.weight_kg ? escapeHtml(s.weight_kg) + ' kg' : '—')}
      ${detailRow('Dimensions', escapeHtml(s.dimensions || '—'))}
      ${detailRow('Shipping method', escapeHtml(s.shipping_method || '—'))}
      ${detailRow('Internal ref', escapeHtml(s.internal_reference || '—'))}
      ${detailRow('From', `${escapeHtml(s.origin_city)}, ${escapeHtml(s.origin_country)}`)}
      ${detailRow('To', `${escapeHtml(s.destination_city)}, ${escapeHtml(s.destination_country)}`)}
      ${detailRow('Sender', escapeHtml(s.sender_name))}
      ${detailRow('Recipient', escapeHtml(s.recipient_name))}
      ${detailRow('Created', fmtDT(s.created_at))}
      ${detailRow('Est. delivery', fmtDateShort(s.estimated_delivery_date) + (s.estimated_delivery_time ? ' · ' + s.estimated_delivery_time.slice(0, 5) : ''))}
    </dl>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <div>
        <h4 class="mb-2 text-sm font-bold">Timeline</h4>
        <div class="space-y-3">
          ${data.events.slice().reverse().map((e) => `
            <div class="border-l-2 ${e.status === 'Delayed' ? 'border-brand-red' : 'border-ink/15'} pl-3">
              <p class="text-sm font-medium">${escapeHtml(e.status)}</p>
              <p class="text-xs text-ink/50">${escapeHtml(e.description)}</p>
              <p class="text-xs text-ink/40">${fmtDT(e.created_at)}${e.location ? ' · ' + escapeHtml(e.location) : ''}</p>
            </div>`).join('') || '<p class="text-sm text-ink/40">No events.</p>'}
        </div>
      </div>
      <div>
        <h4 class="mb-2 text-sm font-bold">Comments</h4>
        <div class="space-y-3">
          ${data.comments.map((c) => `
            <div class="rounded-lg border ${c.visibility === 'customer' ? 'border-brand-yellow/40 bg-brand-yellow/10' : 'border-ink/10'} p-3">
              <div class="flex items-center justify-between">
                <span class="badge ${c.visibility === 'customer' ? 'bg-brand-yellow/20 text-brand-yellow-700' : 'bg-ink/10 text-ink/60'}">${c.visibility === 'customer' ? 'Customer-visible' : 'Internal'}</span>
                <span class="text-xs text-ink/40">${fmtDT(c.created_at)}</span>
              </div>
              <p class="mt-1 text-sm">${escapeHtml(c.text)}</p>
              <p class="text-xs text-ink/40">${escapeHtml(c.admin_name || 'System')}</p>
            </div>`).join('') || '<p class="text-sm text-ink/40">No comments.</p>'}
        </div>
        ${data.delayHistory.length ? `
        <h4 class="mb-2 mt-5 text-sm font-bold text-brand-red">Delay history</h4>
        <div class="space-y-2">
          ${data.delayHistory.map((h) => `
            <div class="rounded-lg border border-ink/10 p-3 text-sm">
              <p class="font-medium">${escapeHtml(h.reason)}</p>
              <p class="text-xs text-ink/50">${fmtDateShort(h.previous_date)} → <span class="text-brand-red font-medium">${fmtDateShort(h.new_date)}</span></p>
              <p class="text-xs text-ink/40">${fmtDT(h.created_at)} · ${escapeHtml(h.admin_name || '')}</p>
            </div>`).join('')}
        </div>` : ''}
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2 border-t border-ink/10 pt-5">
      <button data-act="archive" class="btn btn-md border border-ink/15">${s.archived ? 'Unarchive' : 'Archive'}</button>
      <button data-act="delete" class="btn btn-md bg-brand-red/10 text-brand-red hover:bg-brand-red/20">Delete</button>
      <a href="/tracking?t=${encodeURIComponent(s.tracking_number)}" target="_blank" class="btn btn-md border border-ink/15">Open tracking page</a>
    </div>
  `;
}

function editTab(data) {
  const s = data.shipment;
  const C = ADMIN.constants;
  return `
    <form id="editShipForm" class="grid gap-4 sm:grid-cols-2">
      ${field("Sender's name", 'sender_name', 'text', { required: true, value: s.sender_name })}
      ${field('Sender contact', 'sender_contact', 'text', { value: s.sender_contact || '' })}
      ${field('Origin address', 'origin_address', 'text', { value: s.origin_address || '' })}
      ${field('Origin city', 'origin_city', 'text', { required: true, value: s.origin_city })}
      ${field('Origin country', 'origin_country', 'text', { required: true, value: s.origin_country })}
      ${field("Recipient's name", 'recipient_name', 'text', { required: true, value: s.recipient_name })}
      ${field('Recipient contact', 'recipient_contact', 'text', { value: s.recipient_contact || '' })}
      ${field('Destination address', 'destination_address', 'text', { value: s.destination_address || '' })}
      ${field('Destination city', 'destination_city', 'text', { required: true, value: s.destination_city })}
      ${field('Destination country', 'destination_country', 'text', { required: true, value: s.destination_country })}
      ${field('Description', 'description', 'text', { required: true, value: s.description })}
      ${field('Category', 'category', 'text', { options: C.categories, value: s.category || '' })}
      ${field('Weight (kg)', 'weight_kg', 'number', { value: s.weight_kg || '', step: '0.1' })}
      ${field('Dimensions', 'dimensions', 'text', { value: s.dimensions || '' })}
      ${field('Shipping method', 'shipping_method', 'text', { options: C.shippingMethods, value: s.shipping_method || '' })}
      ${field('Internal ref', 'internal_reference', 'text', { value: s.internal_reference || '' })}
      <div class="sm:col-span-2">
        <label class="label" for="f_delivery_instructions">Delivery instructions</label>
        <textarea id="f_delivery_instructions" name="delivery_instructions" rows="2" class="input">${escapeHtml(s.delivery_instructions || '')}</textarea>
      </div>
      <div class="sm:col-span-2">
        <div id="editError" class="hidden mb-3 rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red"></div>
        <button type="submit" class="btn-primary">Save changes</button>
        <p class="help mt-2">The tracking number and status are not changed here. Use their dedicated actions.</p>
      </div>
    </form>
  `;
}

function statusTab(data) {
  const s = data.shipment;
  const auto = s.status_mode !== 'manual';
  return `
    <form id="statusForm" class="space-y-4">
      <div class="rounded-lg border border-ink/10 bg-ink/[0.02] p-4">
        <label class="mt-2 flex items-start gap-2 text-sm">
          <input type="radio" name="statusMode" value="auto" class="mt-1" ${auto ? 'checked' : ''} />
          <span><span class="font-medium">Automatic</span></span>
        </label>
        <label class="mt-2 flex items-start gap-2 text-sm">
          <input type="radio" name="statusMode" value="manual" class="mt-1" ${auto ? '' : 'checked'} />
          <span><span class="font-medium">Manual</span></span>
        </label>
      </div>
      <div>
        <label class="label" for="newStatus">New status <span class="text-brand-red">*</span></label>
        <select id="newStatus" class="input" ${auto ? 'disabled' : ''}>
          ${ADMIN.constants.statuses.map((st) => `<option ${s.status === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div class="${auto ? 'pointer-events-none opacity-50' : ''}" id="manualFields">
        ${field('Location (optional)', 'statusLocation', 'text', { placeholder: 'e.g. Frankfurt' })}
        ${field('Description (optional)', 'statusDesc', 'text', { placeholder: 'Custom note for the timeline' })}
      </div>
      <div id="statusError" class="hidden rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red"></div>
      <button type="submit" class="btn-primary">${auto ? 'Save automatic mode' : 'Update status'}</button>
    </form>
  `;
}

function delayTab(data) {
  const s = data.shipment;
  const prevDate = s.estimated_delivery_date ? String(s.estimated_delivery_date).slice(0, 10) : '';
  const prevTime = s.estimated_delivery_time ? String(s.estimated_delivery_time).slice(0, 5) : '';
  return `
    <form id="delayForm" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div><label class="label">Previous estimated date</label><input class="input bg-ink/[0.03]" value="${prevDate || '—'}" disabled /></div>
        <div><label class="label">Previous estimated time</label><input class="input bg-ink/[0.03]" value="${prevTime || '—'}" disabled /></div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        ${field('New estimated date', 'new_date', 'date', { required: true })}
        ${field('New estimated time', 'new_time', 'time')}
      </div>
      <div>
        <label class="label" for="delayReason">Reason for delay <span class="text-brand-red">*</span></label>
        <select id="delayReason" name="reason" class="input">
          <option value="">— Select a reason —</option>
          ${ADMIN.constants.delayReasons.map((r) => `<option>${r}</option>`).join('')}
        </select>
      </div>
      ${field('Customer-visible explanation', 'customer_explanation', 'text', { textarea: true, placeholder: 'Shown on the tracking page if visible' })}
      ${field('Internal notes', 'internal_notes', 'text', { textarea: true, placeholder: 'Private admin notes' })}
      <label class="flex items-center gap-2 text-sm"><input id="delayVisible" type="checkbox" class="h-4 w-4 rounded border-ink/30 text-brand-red" checked /> Make this visible to the customer</label>
      <div id="delayError" class="hidden rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red"></div>
      <button type="submit" class="btn-primary">Save new estimate</button>
    </form>
  `;
}

function commentTab(data) {
  return `
    <form id="commentForm" class="space-y-4">
      <div>
        <label class="label" for="commentText">Comment <span class="text-brand-red">*</span></label>
        <textarea id="commentText" rows="4" class="input" placeholder="e.g. Your package has arrived at the sorting facility."></textarea>
      </div>
      <div>
        <label class="label" for="commentVisibility">Visibility</label>
        <select id="commentVisibility" class="input">
          <option value="customer">Customer-visible (shown on tracking page)</option>
          <option value="internal">Internal admin note (private)</option>
        </select>
      </div>
      <div id="commentError" class="hidden rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red"></div>
      <button type="submit" class="btn-primary">Add comment</button>
    </form>
  `;
}

function filesTab(data) {
  const s = data.shipment;
  const files = Array.isArray(s.files) ? s.files : [];
  const rows = files.map((f) => `
    <div class="flex items-center gap-3 rounded-lg border border-ink/10 p-3">
      <div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink/5 text-ink/50">${fileIcon(f.type)}</div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">${escapeHtml(f.name)}</p>
        <p class="text-xs text-ink/40">${fmtBytes(f.size)} · ${escapeHtml(f.uploaded_by || '')} · ${fmtDT(f.uploaded_at)}</p>
      </div>
      <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="btn btn-sm border border-ink/15">Open</a>
      <button type="button" data-remove="${escapeHtml(f.id)}" class="btn btn-sm bg-brand-red/10 text-brand-red hover:bg-brand-red/20">Remove</button>
    </div>`).join('') || '<p class="text-sm text-ink/40">No documents attached.</p>';

  return `
    <div class="space-y-4">
      <div id="filesDisabled" class="hidden rounded-lg border border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3 text-sm">
        File storage is not set up yet. Enable Storage in the Firebase console, then set
        <span class="font-mono">FIREBASE_STORAGE_BUCKET</span> in <span class="font-mono">.env</span> and restart the server.
      </div>

      <form id="fileForm" class="rounded-lg border border-dashed border-ink/20 p-4">
        <label class="label" for="fileInput">Add a document</label>
        <input id="fileInput" type="file" name="file" class="input file:mr-3 file:rounded file:border-0 file:bg-ink/5 file:px-3 file:py-1.5 file:text-sm" />
        <p class="mt-1 text-xs text-ink/40">PDF, image, Word or Excel · up to 10 MB.</p>
        <div id="fileError" class="mt-3 hidden rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red"></div>
        <div class="mt-3 flex items-center gap-3">
          <button type="submit" class="btn-primary">Upload</button>
          <span id="fileProgress" class="hidden text-sm text-ink/50">Uploading…</span>
        </div>
      </form>

      <div class="space-y-2">
        <h4 class="text-sm font-bold">Attached documents</h4>
        ${rows}
      </div>
    </div>
  `;
}

function fileIcon(type) {
  const t = String(type || '');
  if (t.startsWith('image/')) return '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  if (t.includes('pdf')) return '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
  return '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></svg>';
}

function fmtBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function bindModalTab(data, tab, host) {
  const s = data.shipment;
  if (tab === 'overview') {
    host.querySelector('[data-act="archive"]').addEventListener('click', async () => {
      await api(`/api/admin/shipments/${s.id}/archive`, { method: 'PATCH', body: {} });
      toast(s.archived ? 'Shipment restored' : 'Shipment archived', 'success');
      document.getElementById('modalHost').innerHTML = '';
      if (ADMIN.route === 'shipments') navigate('shipments'); else navigate(ADMIN.route);
    });
    host.querySelector('[data-act="delete"]').addEventListener('click', () => {
      if (!confirm('Permanently delete this shipment and all its history? This cannot be undone.')) return;
      (async () => {
        await api(`/api/admin/shipments/${s.id}`, { method: 'DELETE' });
        toast('Shipment deleted', 'success');
        document.getElementById('modalHost').innerHTML = '';
        navigate(ADMIN.route);
      })().catch((e) => toast(e.message, 'error'));
    });
  } else if (tab === 'edit') {
    const form = host.querySelector('#editShipForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = host.querySelector('#editError');
      errBox.classList.add('hidden');
      const fd = new FormData(form);
      const payload = {};
      for (const [k, v] of fd.entries()) payload[k] = v;
      try {
        await api(`/api/admin/shipments/${s.id}`, { method: 'PUT', body: payload });
        toast('Shipment updated', 'success');
        openShipmentModal(s.id);
      } catch (err) {
        errBox.textContent = err.message || 'Failed to update';
        errBox.classList.remove('hidden');
      }
    });
  } else if (tab === 'status') {
    const form = host.querySelector('#statusForm');
    const select = host.querySelector('#newStatus');
    const manualFields = host.querySelector('#manualFields');
    host.querySelectorAll('input[name="statusMode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isAuto = host.querySelector('input[name="statusMode"]:checked').value === 'auto';
        select.disabled = isAuto;
        manualFields.classList.toggle('pointer-events-none', isAuto);
        manualFields.classList.toggle('opacity-50', isAuto);
      });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = host.querySelector('#statusError');
      errBox.classList.add('hidden');
      const mode = host.querySelector('input[name="statusMode"]:checked').value;
      const body = mode === 'auto'
        ? { mode: 'auto' }
        : {
          status: select.value,
          location: host.querySelector('[name="statusLocation"]').value,
          description: host.querySelector('[name="statusDesc"]').value,
        };
      try {
        await api(`/api/admin/shipments/${s.id}/status`, { method: 'PATCH', body });
        toast(mode === 'auto' ? 'Status set to automatic' : 'Status updated', 'success');
        openShipmentModal(s.id);
      } catch (err) {
        errBox.textContent = err.message || 'Failed to update status';
        errBox.classList.remove('hidden');
      }
    });
  } else if (tab === 'delay') {
    const form = host.querySelector('#delayForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = host.querySelector('#delayError');
      errBox.classList.add('hidden');
      const body = {
        new_date: host.querySelector('[name="new_date"]').value,
        new_time: host.querySelector('[name="new_time"]').value,
        reason: host.querySelector('#delayReason').value,
        customer_explanation: host.querySelector('[name="customer_explanation"]').value,
        internal_notes: host.querySelector('[name="internal_notes"]').value,
        customer_visible: host.querySelector('#delayVisible').checked,
      };
      try {
        await api(`/api/admin/shipments/${s.id}/delay`, { method: 'PATCH', body });
        toast('Delivery estimate updated', 'success');
        openShipmentModal(s.id);
      } catch (err) {
        errBox.textContent = err.message || 'Failed to update estimate';
        errBox.classList.remove('hidden');
      }
    });
  } else if (tab === 'comment') {
    const form = host.querySelector('#commentForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = host.querySelector('#commentError');
      errBox.classList.add('hidden');
      const body = {
        text: host.querySelector('#commentText').value,
        visibility: host.querySelector('#commentVisibility').value,
      };
      try {
        await api(`/api/admin/shipments/${s.id}/comments`, { method: 'POST', body });
        toast('Comment added', 'success');
        openShipmentModal(s.id);
      } catch (err) {
        errBox.textContent = err.message || 'Failed to add comment';
        errBox.classList.remove('hidden');
      }
    });
  } else if (tab === 'files') {
    bindFilesTab(data, host);
  }
}

function bindFilesTab(data, host) {
  const s = data.shipment;
  const form = host.querySelector('#fileForm');
  const errBox = host.querySelector('#fileError');
  const progress = host.querySelector('#fileProgress');
  const submitBtn = form.querySelector('button[type="submit"]');

  fetch('/api/admin/storage/status', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((info) => { if (!info.enabled) host.querySelector('#filesDisabled').classList.remove('hidden'); })
    .catch(() => { host.querySelector('#filesDisabled').classList.remove('hidden'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const input = host.querySelector('#fileInput');
    if (!input.files || !input.files[0]) {
      errBox.textContent = 'Choose a file first.';
      errBox.classList.remove('hidden');
      return;
    }
    const fd = new FormData();
    fd.append('file', input.files[0]);
    progress.classList.remove('hidden');
    submitBtn.disabled = true;
    try {
      // Not using api() here: FormData must set its own multipart boundary, so
      // the JSON Content-Type header would break the request.
      const res = await fetch(`/api/admin/shipments/${s.id}/files`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        body: fd,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `Upload failed (${res.status})`);
      toast('Document uploaded', 'success');
      openShipmentModal(s.id);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      progress.classList.add('hidden');
      submitBtn.disabled = false;
    }
  });

  host.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-remove');
      if (!confirm('Remove this document? The file is deleted from storage.')) return;
      try {
        await api(`/api/admin/shipments/${s.id}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast('Document removed', 'success');
        openShipmentModal(s.id);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

// ---- Delivery Updates view (recent timeline events) ------------------------
async function viewDeliveryUpdates(view) {
  const data = await api('/api/admin/dashboard');
  view.innerHTML = `
    <div class="card overflow-hidden">
      <div class="border-b border-ink/10 px-5 py-4">
        <h2 class="font-bold">Recent Delivery Updates</h2>
        <p class="text-sm text-ink/50">The latest status changes across all shipments.</p>
      </div>
      <ul class="divide-y divide-ink/5">
        ${data.recentEvents.map((e) => `
          <li class="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-semibold text-brand-red">${trackingDisplay(e.tracking_number)}</span>
                ${statusBadgeAdmin(e.status)}
              </div>
              <p class="mt-1 text-sm text-ink/70">${escapeHtml(e.description)}</p>
            </div>
            <span class="text-xs text-ink/40">${fmtDT(e.created_at)}</span>
          </li>`).join('') || '<li class="px-5 py-10 text-center text-ink/40">No updates yet.</li>'}
      </ul>
    </div>
  `;
}

// ---- Delayed Shipments view ------------------------------------------------
async function viewDelayed(view) {
  const data = await api('/api/admin/shipments/delayed');
  view.innerHTML = `
    <div class="card overflow-hidden">
      <div class="border-b border-ink/10 px-5 py-4">
        <h2 class="font-bold text-brand-red">Delayed Shipments</h2>
        <p class="text-sm text-ink/50">Shipments marked delayed or whose estimated delivery has passed.</p>
      </div>
      ${data.rows.length === 0 ? '<div class="px-5 py-12 text-center text-ink/40">No delayed shipments. 🎉</div>' : `
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-ink/50">
            <th class="px-5 py-3 font-semibold">Tracking</th><th class="px-5 py-3 font-semibold">Recipient</th>
            <th class="px-5 py-3 font-semibold">Status</th><th class="px-5 py-3 font-semibold">Est. delivery</th><th class="px-5 py-3 font-semibold text-right">Actions</th></tr></thead>
          <tbody>
            ${data.rows.map((r) => `
              <tr class="border-b border-ink/5 hover:bg-ink/[0.02]">
                <td class="px-5 py-3"><button data-open="${r.id}" class="font-mono text-xs font-semibold text-brand-red hover:underline">${trackingDisplay(r.tracking_number)}</button></td>
                <td class="px-5 py-3">${escapeHtml(r.recipient_name)}</td>
                <td class="px-5 py-3">${statusBadgeAdmin(r.status)}</td>
                <td class="px-5 py-3 text-brand-red">${fmtDateShort(r.estimated_delivery_date)}</td>
                <td class="px-5 py-3 text-right"><button data-open="${r.id}" class="btn btn-md border border-ink/15">Manage</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="md:hidden divide-y divide-ink/10">
        ${data.rows.map((r) => `
          <div class="p-4">
            <div class="flex items-center justify-between"><button data-open="${r.id}" class="font-mono text-sm font-bold text-brand-red">${trackingDisplay(r.tracking_number)}</button>${statusBadgeAdmin(r.status)}</div>
            <p class="mt-1 text-sm">${escapeHtml(r.recipient_name)}</p>
            <p class="text-xs text-brand-red">Est. ${fmtDateShort(r.estimated_delivery_date)}</p>
            <button data-open="${r.id}" class="btn btn-md border border-ink/15 mt-2">Manage delay</button>
          </div>`).join('')}
      </div>`}
    </div>
  `;
  view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openShipmentModal(parseInt(b.getAttribute('data-open'), 10))));
}


// ---- Reports view ----------------------------------------------------------
async function viewReports(view) {
  const data = await api('/api/admin/reports');
  const maxStatus = Math.max(1, ...data.byStatus.map((r) => r.count));
  view.innerHTML = `
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="card p-6">
        <h2 class="font-bold">Shipments by status</h2>
        <div class="mt-4 space-y-3">
          ${data.byStatus.map((r) => `
            <div>
              <div class="flex items-center justify-between text-sm"><span>${escapeHtml(r.status)}</span><span class="font-semibold">${r.count}</span></div>
              <div class="mt-1 h-2 rounded-full bg-ink/10"><div class="h-2 rounded-full bg-brand-red" style="width:${(r.count / maxStatus) * 100}%"></div></div>
            </div>`).join('') || '<p class="text-sm text-ink/40">No data.</p>'}
        </div>
      </div>
      <div class="card p-6">
        <h2 class="font-bold">Shipments by method</h2>
        <div class="mt-4 space-y-3">
          ${data.byMethod.map((r) => `
            <div class="flex items-center justify-between rounded-lg border border-ink/10 px-4 py-3">
              <span class="text-sm font-medium">${escapeHtml(r.method)}</span>
              <span class="badge bg-ink/10 text-ink/70">${r.count}</span>
            </div>`).join('') || '<p class="text-sm text-ink/40">No data.</p>'}
        </div>
      </div>
      <div class="card p-6 lg:col-span-2">
        <h2 class="font-bold">Shipments created (last 30 days)</h2>
        <div class="mt-4 flex h-40 items-end gap-1 overflow-x-auto">
          ${data.last30.length ? data.last30.map((r) => {
            const max = Math.max(1, ...data.last30.map((x) => x.count));
            return `<div class="flex flex-1 min-w-[8px] flex-col items-center justify-end" title="${r.day}: ${r.count}"><div class="w-full rounded-t bg-brand-yellow" style="height:${(r.count / max) * 100}%"></div></div>`;
          }).join('') : '<p class="text-sm text-ink/40">No data for this period.</p>'}
        </div>
      </div>
    </div>
  `;
}

// ---- Activity Logs view ----------------------------------------------------
async function viewActivity(view) {
  let page = 1;
  async function load() {
    const data = await api(`/api/admin/activity?page=${page}&limit=25`);
    view.innerHTML = `
      <div class="card overflow-hidden">
        <div class="border-b border-ink/10 px-5 py-4"><h2 class="font-bold">Activity Logs</h2><p class="text-sm text-ink/50">Audit trail of administrative actions.</p></div>
        ${data.rows.length === 0 ? '<div class="px-5 py-12 text-center text-ink/40">No activity recorded.</div>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-ink/50">
              <th class="px-5 py-3 font-semibold">When</th><th class="px-5 py-3 font-semibold">Admin</th>
              <th class="px-5 py-3 font-semibold">Action</th><th class="px-5 py-3 font-semibold">Details</th></tr></thead>
            <tbody>
              ${data.rows.map((r) => `
                <tr class="border-b border-ink/5">
                  <td class="px-5 py-3 text-ink/50 text-xs">${fmtDT(r.created_at)}</td>
                  <td class="px-5 py-3">${escapeHtml(r.admin_name || r.admin_email || 'System')}</td>
                  <td class="px-5 py-3"><span class="badge bg-ink/10 text-ink/70">${escapeHtml(r.action)}</span></td>
                  <td class="px-5 py-3 text-ink/60">${escapeHtml(r.details || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between border-t border-ink/10 px-5 py-4">
          <p class="text-sm text-ink/50">Page ${data.page} of ${data.totalPages}</p>
          <div class="flex gap-2">
            <button data-page="${data.page - 1}" class="btn-outline ${data.page <= 1 ? 'opacity-40 pointer-events-none' : ''}">Previous</button>
            <button data-page="${data.page + 1}" class="btn-outline ${data.page >= data.totalPages ? 'opacity-40 pointer-events-none' : ''}">Next</button>
          </div>
        </div>`}
      </div>`;
    view.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      const p = parseInt(b.getAttribute('data-page'), 10);
      if (p >= 1 && p <= data.totalPages) { page = p; load(); }
    }));
  }
  load();
}

// ---- Recipients view -------------------------------------------------------
async function viewRecipients(view) {
  const data = await api('/api/admin/recipients');
  view.innerHTML = `
    <div class="card overflow-hidden">
      <div class="border-b border-ink/10 px-5 py-4">
        <h2 class="font-bold">Recipients</h2>
        <p class="text-sm text-ink/50">Unique recipients from all shipments.</p>
      </div>
      ${data.rows.length === 0 ? '<div class="px-5 py-12 text-center text-ink/40">No recipients yet.</div>' : `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-ink/50">
            <th class="px-5 py-3 font-semibold">Name</th><th class="px-5 py-3 font-semibold">Contact</th>
            <th class="px-5 py-3 font-semibold">Destination</th></tr></thead>
          <tbody>
            ${data.rows.map((r) => `
              <tr class="border-b border-ink/5">
                <td class="px-5 py-3 font-medium">${escapeHtml(r.recipient_name)}</td>
                <td class="px-5 py-3 text-ink/60">${escapeHtml(r.recipient_contact || '—')}</td>
                <td class="px-5 py-3 text-ink/60">${escapeHtml(r.destination_city || '')}${r.destination_country ? ', ' + escapeHtml(r.destination_country) : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  `;
}

// ---- Settings view ---------------------------------------------------------
async function viewSettings(view) {
  view.innerHTML = `
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="card p-6">
        <h2 class="font-bold">Account</h2>
        <p class="mt-1 text-sm text-ink/50">Change your administrator password.</p>
        <form id="pwForm" class="mt-5 space-y-4">
          ${field('Current password', 'current_password', 'password')}
          ${field('New password', 'new_password', 'password', { help: 'At least 8 characters' })}
          ${field('Confirm new password', 'confirm_password', 'password')}
          <div id="pwError" class="hidden rounded-lg bg-brand-red/10 px-4 py-3 text-sm font-medium text-brand-red"></div>
          <button type="submit" class="btn-primary">Update password</button>
        </form>
      </div>
      <div class="card p-6">
        <h2 class="font-bold">About this platform</h2>
        <p class="mt-2 text-sm text-ink/60">SwiftNova Global Express — a demonstration delivery &amp; shipment tracking platform. All data is stored in Firebase Firestore and persists across devices and restarts.</p>
        <ul class="mt-4 space-y-2 text-sm text-ink/60">
          <li>• Shipments, events, comments, and delay history are fully linked.</li>
          <li>• Tracking numbers are generated server-side and are unique.</li>
          <li>• Every administrative action is recorded in the audit log.</li>
        </ul>
      </div>
    </div>
  `;
  view.querySelector('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = view.querySelector('#pwError');
    errBox.classList.add('hidden');
    const body = {
      current_password: view.querySelector('[name="current_password"]').value,
      new_password: view.querySelector('[name="new_password"]').value,
      confirm_password: view.querySelector('[name="confirm_password"]').value,
    };
    try {
      await api('/api/auth/change-password', { method: 'POST', body });
      toast('Password updated', 'success');
      view.querySelector('#pwForm').reset();
    } catch (err) {
      errBox.textContent = err.message || 'Failed to update password';
      errBox.classList.remove('hidden');
    }
  });
}

// ---- Bootstrap -------------------------------------------------------------
(async function init() {
  try {
    const [me, constants] = await Promise.all([
      api('/api/auth/me'),
      api('/api/admin/constants'),
    ]);
    ADMIN.me = me.admin;
    ADMIN.constants = constants;
    document.getElementById('adminName').textContent = me.admin.name;
    document.getElementById('adminEmail').textContent = me.admin.email;
    document.getElementById('adminAvatar').textContent = (me.admin.name || 'A').charAt(0).toUpperCase();
    renderSidebar();
    navigate('dashboard');
  } catch (err) {
    // api() already redirects to login on 401.
    if (!window.location.pathname.startsWith('/admin/login')) window.location.href = '/admin/login';
  }
})();

