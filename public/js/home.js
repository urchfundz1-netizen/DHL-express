// public/js/home.js
// Homepage behavior: chrome, services grid, tracking form.

mountChrome('/');

// ---- Services grid ---------------------------------------------------------
const SERVICES = [
  { icon: 'truck', title: 'Express Delivery', desc: 'Time-definite next-day and two-day delivery across major corridors.', tone: 'brand-red' },
  { icon: 'box', title: 'Standard Parcel', desc: 'Affordable door-to-door parcel service with full tracking.', tone: 'blue' },
  { icon: 'plane', title: 'International Freight', desc: 'Air, sea, and road freight with customs clearance handled for you.', tone: 'purple' },
  { icon: 'shield', title: 'Secure & Insured', desc: 'High-value shipments with enhanced security and full insurance.', tone: 'green' },
  { icon: 'warehouse', title: 'Warehousing', desc: 'Short- and long-term storage with inventory management.', tone: 'amber' },
  { icon: 'bolt', title: 'Same Day', desc: 'Urgent documents and parcels delivered the very same day.', tone: 'brand-yellow' },
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

function renderServices() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  grid.innerHTML = SERVICES.map((s, i) => `
    <div class="card group p-6 transition duration-300 hover:-translate-y-1 hover:shadow-card-lg reveal" style="transition-delay:${i * 60}ms">
      <div class="grid h-12 w-12 place-items-center rounded-lg ${toneClasses(s.tone)} transition duration-300 group-hover:scale-110">
        ${deliveryIcon(s.icon)}
      </div>
      <h3 class="mt-4 text-lg font-bold">${s.title}</h3>
      <p class="mt-2 text-sm text-ink/60">${s.desc}</p>
    </div>`).join('');
  setupReveal();
}
renderServices();

// ---- Tracking form ---------------------------------------------------------
const form = document.getElementById('trackForm');
const input = document.getElementById('trackingInput');
const errorEl = document.getElementById('trackError');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  input.classList.add('border-brand-red', 'ring-2', 'ring-brand-red/30');
}
function clearError() {
  errorEl.classList.add('hidden');
  input.classList.remove('border-brand-red', 'ring-2', 'ring-brand-red/30');
}

input.addEventListener('input', clearError);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (!value) {
    showError('Please enter a tracking number to continue.');
    input.focus();
    return;
  }
  clearError();
  const normalized = value.replace(/[\s-]+/g, '').toUpperCase();
  // Navigate to the dedicated tracking results page with the code.
  window.location.href = `/tracking?t=${encodeURIComponent(normalized)}`;
});
