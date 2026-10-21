// public/js/customs-page.js
// Customs holding page: site chrome plus the shipment context card.
    mountChrome(); setupReveal();

    // ---- Shipment context ----------------------------------------------------
    // /customs?t=SWN... shows which shipment is held at customs, so the
    // customer can see the route, the estimate and a way back to the timeline.
    (function loadShipmentContext() {
      const raw = new URLSearchParams(window.location.search).get('t');
      const host = document.getElementById('customsDetail');
      if (!raw || !host) return;

      const norm = raw.replace(/[\s-]+/g, '').toUpperCase();
      const pretty = (() => {
        const body = norm.startsWith('SWN') ? norm.slice(3) : norm;
        const groups = body.match(/.{1,4}/g) || [];
        return (norm.startsWith('SWN') ? ['SWN', ...groups] : [body]).join(' ');
      })();

      api(`/api/track/${encodeURIComponent(norm)}`).then((data) => {
        const s = data.shipment;
        const eta = s.estimated_delivered_at ? fmtDateTime(s.estimated_delivered_at) : 'To be confirmed';
        const inCustoms = s.status === 'Customs Clearance';
        host.innerHTML = `
          <div class="rounded-xl2 border border-ink/10 bg-ink/[0.02] p-5 text-left">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-widest text-ink/50">Shipment</p>
                <p class="mt-1 text-lg font-extrabold tracking-wide text-ink">${escapeHtml(pretty)}</p>
              </div>
              ${statusBadge(s.status, (data.meta && data.meta.tone) || 'amber')}
            </div>
            <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">From</dt><dd class="mt-0.5 text-ink/80">${escapeHtml(s.origin_city)}, ${escapeHtml(s.origin_country)}</dd></div>
              <div><dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">To</dt><dd class="mt-0.5 text-ink/80">${escapeHtml(s.destination_city)}, ${escapeHtml(s.destination_country)}</dd></div>
              <div><dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Current status</dt><dd class="mt-0.5 text-ink/80">${escapeHtml(s.status)}</dd></div>
              <div><dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Estimated delivery</dt><dd class="mt-0.5 text-ink/80">${escapeHtml(eta)}</dd></div>
            </dl>
            ${inCustoms ? '' : `<p class="mt-4 text-sm text-ink/60">This shipment is no longer held at customs — its status has since changed.</p>`}
            <div class="mt-5 flex flex-wrap gap-3">
              <a href="/tracking?t=${encodeURIComponent(norm)}&full=1" class="btn-primary">View full tracking timeline</a>
            </div>
          </div>`;
      }).catch(() => {
        // Unknown tracking number: keep the generic customs page as it is.
      });
    })();
  