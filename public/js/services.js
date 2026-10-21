// public/js/services.js
mountChrome('/services');

const SERVICES = [
  { icon: 'truck', title: 'Express Delivery', desc: 'Time-definite next-day and two-day delivery across major corridors, with priority handling and live tracking.', tone: 'brand-red', meta: '1–2 business days' },
  { icon: 'box', title: 'Standard Parcel', desc: 'Affordable, reliable door-to-door parcel service for everyday shipments.', tone: 'blue', meta: '3–5 business days' },
  { icon: 'plane', title: 'International Freight', desc: 'Air, sea, and road freight with customs clearance and documentation handled for you.', tone: 'purple', meta: 'Varies by lane' },
  { icon: 'shield', title: 'Secure & Insured', desc: 'High-value shipments with enhanced security, signature confirmation, and full insurance.', tone: 'green', meta: 'Add-on' },
  { icon: 'warehouse', title: 'Warehousing', desc: 'Short- and long-term storage with inventory management and fulfilment.', tone: 'amber', meta: 'Flexible terms' },
  { icon: 'bolt', title: 'Same Day', desc: 'Urgent documents and parcels collected and delivered the very same day.', tone: 'brand-yellow', meta: 'Within hours' },
];

function toneClasses(tone) {
  const map = {
    'brand-red': 'bg-brand-red/10 text-brand-red',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    'brand-yellow': 'bg-brand-yellow/20 text-brand-yellow-700',
  };
  return map[tone] || map.blue;
}

const grid = document.getElementById('servicesGrid');
grid.innerHTML = SERVICES.map((s, i) => `
  <div class="card group p-6 transition duration-300 hover:-translate-y-1 hover:shadow-card-lg reveal" style="transition-delay:${i * 70}ms">
    <div class="flex items-center justify-between">
      <div class="grid h-12 w-12 place-items-center rounded-lg ${toneClasses(s.tone)} transition duration-300 group-hover:scale-110">
        ${deliveryIcon(s.icon)}
      </div>
      <span class="badge bg-ink/5 text-ink/60">${s.meta}</span>
    </div>
    <h3 class="mt-4 text-lg font-bold">${s.title}</h3>
    <p class="mt-2 text-sm text-ink/60">${s.desc}</p>
    <a href="/contact" class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-red hover:underline">Learn more <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  </div>`).join('');
setupReveal();
