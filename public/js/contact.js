// public/js/contact.js
mountChrome('/contact');

// ---- FAQs (accordion) ------------------------------------------------------
const FAQS = [
  { q: 'How do I track my shipment?', a: 'Enter your SwiftNova tracking number (starting with SWN) in the tracking field on our homepage or the Track Shipment page. You\'ll see live status, a full timeline, and a delivery countdown. No account is required.' },
  { q: 'Where do I find my tracking number?', a: 'Your tracking number is provided in your shipping confirmation email or receipt. It always begins with the letters "SWN". It\'s case-insensitive and ignores spaces and dashes.' },
  { q: 'What does the delivery countdown mean?', a: 'The countdown shows the estimated time remaining until your estimated delivery date and time. It updates automatically. Delivery times are estimates and may change if there are delays.' },
  { q: 'My delivery estimate passed. What now?', a: 'If the estimated time has passed, your parcel may still be in transit and an updated estimate may be pending. Check back soon or contact support with your tracking number.' },
  { q: 'Can I change the delivery address?', a: 'Address changes may be possible before a parcel is out for delivery. Contact support with your tracking number as soon as possible.' },
  { q: 'What if my package is delayed?', a: 'If a shipment is delayed, we record the reason and update the estimated delivery date. A customer-visible explanation appears on your tracking page.' },
  { q: 'How do I file a claim?', a: 'Contact support with your tracking number and details of the issue. Claims are handled according to your shipping agreement and any insurance purchased.' },
  { q: 'Is my personal information secure?', a: 'Yes. The public tracking page only shows the information needed to follow a parcel. Sensitive recipient contact details and private administrative notes are never exposed publicly.' },
];

const faqList = document.getElementById('faqList');
faqList.innerHTML = FAQS.map((f, i) => `
  <div class="card overflow-hidden reveal" style="transition-delay:${Math.min(i * 50, 300)}ms">
    <button type="button" class="faq-toggle flex w-full items-center justify-between gap-4 p-5 text-left" aria-expanded="false">
      <span class="flex items-center gap-3 font-semibold text-ink"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-yellow/20 text-brand-yellow-700">${deliveryIcon('box', 'h-4 w-4')}</span>${f.q}</span>
      <svg class="h-5 w-5 shrink-0 text-ink/40 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-panel hidden px-5 pb-5 text-sm text-ink/60">${f.a}</div>
  </div>`).join('');
setupReveal();

faqList.querySelectorAll('.faq-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = btn.nextElementSibling;
    const icon = btn.querySelector('svg');
    const open = panel.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!open));
    icon.style.transform = open ? '' : 'rotate(180deg)';
  });
});

// ---- Contact form (client-side validation + confirmation) ------------------
const form = document.getElementById('contactForm');
const errorEl = document.getElementById('contactError');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('cfName').value.trim();
  const email = document.getElementById('cfEmail').value.trim();
  const subject = document.getElementById('cfSubject').value.trim();
  const message = document.getElementById('cfMessage').value.trim();

  if (!name || !email || !subject || !message) {
    errorEl.textContent = 'Please fill in all fields.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');
  // This demo does not persist contact messages; confirm receipt to the user.
  form.reset();
  toast('Thanks! Your message has been received. Our team will reply within one business day.', 'success');
});
