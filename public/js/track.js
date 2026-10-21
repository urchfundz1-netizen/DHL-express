// public/js/track.js
// Customer tracking results page: lookup, sky panel with a plane whose
// position is the shipment progress, route card, detail cards, day-grouped
// scan history, live countdown, and customer-visible updates.

mountChrome('/track');

const els = {
  form: document.getElementById('trackBarForm'),
  input: document.getElementById('trackBarInput'),
  error: document.getElementById('trackBarError'),
  loading: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  emptyState: document.getElementById('emptyState'),
  resultState: document.getElementById('resultState'),
  routeCard: document.getElementById('routeCard'),
  infoCards: document.getElementById('infoCards'),
  timeline: document.getElementById('timeline'),
  comments: document.getElementById('commentsCard'),
  planePct: document.getElementById('planePct'),
  backBtn: document.getElementById('backBtn'),
  detailsBtn: document.getElementById('detailsBtn'),
  demoNumbers: document.getElementById('demoNumbers'),
  errorRetry: document.getElementById('errorRetry'),
  customsNotice: document.getElementById('customsNotice'),
};

let countdownTimer = null;
let refreshTimer = null;
// Tracking number the page currently cares about; late responses for any
// other number are discarded so a slow lookup can't clobber a newer one.
let activeNorm = null;

function showState(name) {
  ['loading', 'errorState', 'emptyState', 'resultState'].forEach((k) => els[k].classList.add('hidden'));
  if (name) els[name].classList.remove('hidden');
}
function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.remove('hidden');
}
function clearError() { els.error.classList.add('hidden'); }

function stopTimers() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

// ---- Form handling --------------------------------------------------------
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = els.input.value.trim();
  if (!v) { showError('Please enter a tracking number.'); els.input.focus(); return; }
  clearError();
  const norm = v.replace(/[\s-]+/g, '').toUpperCase();
  const url = new URL(window.location.href);
  url.searchParams.set('t', norm);
  window.history.replaceState({}, '', url);
  loadTracking(norm);
});

// Drop ?t= so a reload doesn't resurrect a shipment we've navigated away from.
function clearTrackParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('t')) {
    url.searchParams.delete('t');
    window.history.replaceState({}, '', url);
  }
}

els.errorRetry.addEventListener('click', () => {
  stopTimers();
  activeNorm = null;
  clearTrackParam();
  showState('emptyState');
  els.input.focus();
  els.input.select();
});

els.backBtn.addEventListener('click', () => {
  stopTimers();
  activeNorm = null;
  clearTrackParam();
  showState('emptyState');
  els.input.focus();
  els.input.select();
});

// ---- Details page ---------------------------------------------------------
// "See package details" opens the dedicated email-style details page for the
// shipment currently being viewed.
if (els.detailsBtn) {
  els.detailsBtn.addEventListener('click', () => {
    if (!activeNorm) return;
    window.location.href = `/tracking/details?t=${encodeURIComponent(activeNorm)}`;
  });
}

// ---- Load tracking --------------------------------------------------------
// A shipment held at customs is served by the dedicated customs page. The
// customer is sent there instead of the results page, unless they asked
// explicitly for the full timeline (`?full=1`, linked from the customs page)
// — otherwise the two pages would redirect into each other.
const CUSTOMS_STATUS = 'Customs Clearance';

function wantsFullDetails() {
  return new URLSearchParams(window.location.search).get('full') === '1';
}

function goToCustomsPage(norm) {
  window.location.replace(`/customs?t=${encodeURIComponent(norm)}`);
}

async function loadTracking(norm) {
  activeNorm = norm;
  stopTimers();
  showState('loading');
  try {
    const data = await api(`/api/track/${encodeURIComponent(norm)}`);
    if (norm !== activeNorm) return; // superseded by a newer search
    if (data.shipment.status === CUSTOMS_STATUS && !wantsFullDetails()) {
      goToCustomsPage(norm);
      return;
    }
    renderResult(data, { animate: true });
    // Poll for live updates every 30s (keeps the page fresh without refresh).
    refreshTimer = setInterval(() => refreshTracking(norm), 30000);
  } catch (err) {
    if (norm !== activeNorm) return;
    els.errorMessage.textContent = err.message || 'No shipment found for that tracking number.';
    showState('errorState');
  }
}

async function refreshTracking(norm) {
  try {
    const data = await api(`/api/track/${encodeURIComponent(norm)}`);
    if (norm !== activeNorm) return; // stale refresh
    // The shipment may have been moved to customs while the page was open.
    if (data.shipment.status === CUSTOMS_STATUS && !wantsFullDetails()) {
      goToCustomsPage(norm);
      return;
    }
    renderResult(data);
  } catch (e) { /* keep showing last good state */ }
}

// ---- Helpers --------------------------------------------------------------
function formatTrackingDisplay(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!s.startsWith('SWN')) return s;
  const body = s.slice(3);
  const groups = body.match(/.{1,4}/g) || [];
  return ['SWN', ...groups].join(' ');
}

// Progress percentage (0–100). The server sends a ready-made `meta.progress`
// covering every status (incl. On Hold / Delayed); older responses fall back
// to the stage index.
function shipmentProgress(meta) {
  if (!meta) return 0;
  if (meta.delivered) return 100;
  if (typeof meta.progress === 'number') {
    return Math.max(0, Math.min(100, Math.round(meta.progress)));
  }
  const total = Math.max(1, (meta.totalStages || 1) - 1);
  const pct = Math.round(((meta.stageIndex || 0) / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

// Drive the sky plane position (0..1 across the track) and the route-card fill.
function setProgress(pct) {
  document.documentElement.style.setProperty('--progress', pct + '%');
  document.documentElement.style.setProperty('--plane-p', (pct / 100).toFixed(4));
}

// Short pseudo-airport code derived from a city name (Bremen -> BRE).
function cityCode(city) {
  const s = String(city || '').trim();
  if (!s) return '—';
  const letters = s.replace(/[^A-Za-z]/g, '');
  return (letters.slice(0, 3) || s.slice(0, 3)).toUpperCase();
}

function timeLeftText(shipment) {
  if (shipment.status === 'Delivered') return 'Delivered';
  const eta = shipment.estimated_delivered_at;
  if (!eta) return 'To be confirmed';
  const diff = new Date(eta).getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ---- Result rendering -----------------------------------------------------
// `animate: true` on first show: start the plane at 0% while the panel is
// still hidden, then after it becomes visible transition it (and the route
// bar) to the real progress, counting the % pill up in sync.
function renderResult(data, { animate = false } = {}) {
  const { shipment, events, customerComments, meta } = data;
  const pct = shipmentProgress(meta);

  if (animate) setProgress(0);
  else setProgress(pct);

  if (els.planePct) els.planePct.textContent = `${animate ? 0 : pct}% · ${shipment.status}`;
  renderRouteCard(shipment, pct);
  renderInfoCards(shipment);
  if (shipment.status === 'Customs Clearance') {
    renderCustomsNotice();
  } else if (els.customsNotice) {
    els.customsNotice.remove();
  }
  renderTimeline(events);
  renderComments(customerComments);

  if (animate) {
    showState('resultState');
    void els.resultState.offsetWidth; // flush styles at 0% so the transition runs
    setProgress(pct);
    animatePctTo(pct, shipment.status);
  }
}

// Count the "NN% · Status" pill up from 0 to match the plane's travel.
let pctRaf = null;
function animatePctTo(target, status) {
  if (pctRaf) cancelAnimationFrame(pctRaf);
  if (!els.planePct) return;
  const dur = 900;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const val = Math.round(target * (1 - Math.pow(1 - t, 3)));
    els.planePct.textContent = `${val}% · ${status}`;
    if (t < 1) pctRaf = requestAnimationFrame(tick);
  };
  pctRaf = requestAnimationFrame(tick);
}

// ---- Route card (origin -> destination with progress track) ---------------
function renderRouteCard(shipment, pct) {
  const etaTime = shipment.estimated_delivery_time
    ? fmtTimeOnly(shipment.estimated_delivery_time)
    : '—';
  els.routeCard.innerHTML = `
    <div class="tk-row"><span>${fmtTime(shipment.created_at)}</span><span>${escapeHtml(etaTime)}</span></div>
    <div class="tk-route-line">
      <span class="tk-code">${escapeHtml(cityCode(shipment.origin_city))}</span>
      <div class="tk-track"><div class="done"></div></div>
      <span class="tk-code">${escapeHtml(cityCode(shipment.destination_city))}</span>
    </div>
    <div class="tk-row">
      <span>${escapeHtml(shipment.origin_city)}, ${escapeHtml(shipment.origin_country)}</span>
      <span>${escapeHtml(shipment.destination_city)}, ${escapeHtml(shipment.destination_country)}</span>
    </div>
    <div class="tk-row">
      <span class="tk-pill">${escapeHtml(formatTrackingDisplay(shipment.tracking_number))}</span>
      <span>${escapeHtml(shipment.status)} · ${pct}%</span>
    </div>`;
}

// ---- Detail cards ---------------------------------------------------------
function renderInfoCards(shipment) {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  els.infoCards.innerHTML = `
    <div class="tk-card">
      <span class="label flex items-center gap-2">${deliveryIcon('clock', 'h-4 w-4')} Time left</span>
      <span class="value" id="tkTimeLeft">${escapeHtml(timeLeftText(shipment))}</span>
    </div>
    <div class="tk-card">
      <span class="label flex items-center gap-2">${deliveryIcon('truck', 'h-4 w-4')} Service</span>
      <span class="value">${escapeHtml(shipment.shipping_method || '—')}</span>
    </div>
    <div class="tk-card wide">
      <span class="label flex items-center justify-center gap-2">${deliveryIcon('box', 'h-4 w-4')} Included</span>
      <span class="value">${escapeHtml(shipment.delivery_instructions || shipment.description)}</span>
    </div>`;

  if (shipment.status !== 'Delivered' && shipment.estimated_delivered_at) {
    countdownTimer = setInterval(() => {
      const el = document.getElementById('tkTimeLeft');
      if (!el) { clearInterval(countdownTimer); countdownTimer = null; return; }
      el.textContent = timeLeftText(shipment);
    }, 1000);
  }
}

// ---- Timeline (scan history grouped by day) -------------------------------
const checkMarker = `<span class="tk-check"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
const triMarker = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#9b9ea3" stroke-width="2.5" stroke-linejoin="round"><path d="M13 4L23 22H3z"/></svg>`;

function renderTimeline(events) {
  if (!events || events.length === 0) {
    els.timeline.classList.add('tk-empty');
    els.timeline.innerHTML = `<li class="tk-group"><p class="tk-empty-note text-sm text-ink/50">No tracking events yet.</p></li>`;
    return;
  }
  els.timeline.classList.remove('tk-empty');

  // Events are chronological (oldest first). Reverse for newest-first display.
  const ordered = [...events].reverse();
  const groups = [];
  const byKey = new Map();
  for (const ev of ordered) {
    const d = new Date(ev.created_at);
    const key = d.toDateString();
    let g = byKey.get(key);
    if (!g) {
      g = {
        weekday: d.toLocaleDateString(undefined, { weekday: 'long' }),
        date: d.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' }),
        events: [],
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.events.push(ev);
  }

  els.timeline.innerHTML = groups.map((g) => `
    <li class="tk-group">
      <div class="tk-day">
        <div class="weekday">${escapeHtml(g.weekday)}</div>
        <div class="date">${escapeHtml(g.date)}</div>
      </div>
      ${g.events.map((ev) => {
        const ok = ev.status === 'Delivered';
        return `
        <div class="tk-event ${ok ? 'ok' : ''}">
          <span class="tk-marker">${ok ? checkMarker : triMarker}</span>
          <div>${fmtTime(ev.created_at)} Local time</div>
          <div class="title">${escapeHtml(ev.status)}</div>
          ${ev.location ? `<div class="sub">${escapeHtml(ev.location)}</div>` : ''}
          <div>${escapeHtml(ev.description)}</div>
        </div>`;
      }).join('')}
    </li>`).join('');
}

// ---- Customs notice (shipment held at customs) ----------------------------
function renderCustomsNotice() {
  const anchor = els.routeCard || document.getElementById('resultState');
  if (!anchor) return;
  if (els.customsNotice) els.customsNotice.remove();
  els.customsNotice = document.createElement('section');
  els.customsNotice.id = 'customsNotice';
  els.customsNotice.className = 'mt-6 reveal is-visible';
  els.customsNotice.innerHTML = `
    <div class="card p-6 sm:p-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div class="grid h-12 w-12 place-items-center rounded-full bg-brand-yellow/20 text-brand-yellow-700">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="flex-1">
          <h2 class="text-xl font-bold">Customs Clearance in Progress</h2>
          <p class="mt-2 text-ink/70">Your shipment is undergoing customs clearance at the destination. This is a standard process and may take additional time depending on local requirements.</p>
          <p class="mt-2 text-ink/70">We'll update your tracking timeline as soon as it's cleared and onward delivery resumes.</p>
          <div class="mt-4">
            <a href="/customs" class="btn-ghost">Learn more</a>
          </div>
        </div>
      </div>
    </div>
  `;
  anchor.insertAdjacentElement('afterend', els.customsNotice);
}

// ---- Comments (customer-visible) ------------------------------------------
function renderComments(customerComments) {
  if (!els.comments) return;
  if (!customerComments || customerComments.length === 0) {
    els.comments.innerHTML = `<h2 class="flex items-center gap-2 text-lg font-bold"><span class="text-brand-red">${deliveryIcon('box', 'h-5 w-5')}</span>Shipment Updates</h2><p class="mt-3 text-sm text-ink/50">No public updates yet. Live updates will appear here as your parcel moves.</p>`;
    return;
  }
  const latest = customerComments[0];
  els.comments.innerHTML = `
    <h2 class="flex items-center gap-2 text-lg font-bold"><span class="text-brand-red">${deliveryIcon('box', 'h-5 w-5')}</span>Latest Update</h2>
    <div class="mt-3 rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 p-4">
      <p class="text-sm text-ink">${escapeHtml(latest.text)}</p>
      <p class="mt-2 text-xs text-ink/40">${fmtDateTime(latest.created_at)}${latest.admin_name ? ' · ' + escapeHtml(latest.admin_name) : ''}</p>
    </div>
    ${customerComments.length > 1 ? `
      <button id="toggleHistory" class="mt-4 text-sm font-semibold text-brand-red hover:underline">View previous updates (${customerComments.length - 1})</button>
      <div id="commentHistory" class="mt-3 hidden space-y-3">
        ${customerComments.slice(1).map((c) => `
          <div class="rounded-lg border border-ink/10 p-3">
            <p class="text-sm text-ink/80">${escapeHtml(c.text)}</p>
            <p class="mt-1 text-xs text-ink/40">${fmtDateTime(c.created_at)}</p>
          </div>`).join('')}
      </div>` : ''}
  `;
  const toggle = document.getElementById('toggleHistory');
  const history = document.getElementById('commentHistory');
  if (toggle && history) {
    toggle.addEventListener('click', () => {
      const hidden = history.classList.toggle('hidden');
      toggle.textContent = hidden ? `View previous updates (${customerComments.length - 1})` : 'Hide previous updates';
    });
  }
}

// ---- Init ------------------------------------------------------------------
function init() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('t');
  if (t) {
    const norm = t.replace(/[\s-]+/g, '').toUpperCase();
    els.input.value = formatTrackingDisplay(norm);
    loadTracking(norm);
  } else {
    showState('emptyState');
    els.demoNumbers.innerHTML = `
      <span class="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink/50">Tip: use the number from your shipping confirmation.</span>`;
  }
}
init();
