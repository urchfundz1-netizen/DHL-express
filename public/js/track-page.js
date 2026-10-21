// public/js/track-page.js
// Track landing page: form handling, legacy ?t= forwarding and scroll reveals.
    // Submitting a tracking number sends the visitor to the dedicated results page.
    const form = document.getElementById('trackingForm');
    const input = document.getElementById('trackingNumber');
    const trackError = document.getElementById('trackError');
    const backToTop = document.getElementById('backToTop');

    function goToTracking(raw) {
      const norm = String(raw).replace(/[\s-]+/g, '').toUpperCase();
      window.location.href = '/tracking?t=' + encodeURIComponent(norm);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        trackError.textContent = 'Please enter a tracking number.';
        trackError.classList.remove('hidden');
        input.focus();
        return;
      }
      trackError.classList.add('hidden');
      goToTracking(v);
    });

    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    setupReveal();

    // Legacy /track?t=... links are forwarded to the results page.
    (function () {
      const t = new URLSearchParams(window.location.search).get('t');
      if (t) window.location.replace('/tracking?t=' + encodeURIComponent(t.replace(/[\s-]+/g, '').toUpperCase()));
    })();
  