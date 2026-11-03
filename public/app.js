const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
form.start.value = iso(new Date(today.getTime() + 30 * 864e5));
form.end.value = iso(new Date(today.getTime() + 60 * 864e5));

const fmtDur = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function legLine(label, date, leg) {
  const via = leg.route.slice(1, -1).join(' → ') || 'direct';
  const p = el('div', null, 'meta leg');
  p.append(
    el('strong', `${label} ${date}: `),
    document.createTextNode(`${leg.route[0]} → ${leg.route.at(-1)} via ${via} · ${fmtDur(leg.durationMin)} · ${leg.airlines.join(', ')}`),
  );
  return p;
}

function card(r) {
  const c = el('div', null, 'card');
  const left = el('div');
  left.append(legLine('Out', r.departDate, r));
  left.append(
    r.returnLeg
      ? legLine('Back', r.returnDate, r.returnLeg)
      : el('div', `Back ${r.returnDate}: return time not verified`, 'meta'),
  );
  const price = el('div', `€${Math.round(r.price)}`, 'price');
  if (/^https:\/\//.test(r.url ?? '')) {
    const a = el('a', 'View on Google Flights');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    price.append(a);
  }
  c.append(left, price);
  return c;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  statusEl.className = '';
  statusEl.textContent = 'Scanning dates… this can take up to a minute.';
  resultsEl.replaceChildren();

  try {
    const res = await fetch('/api/search?' + new URLSearchParams(new FormData(form)));
    const data = await res.json();
    if (!res.ok) throw new Error(data.errors?.join(' ') ?? 'Request failed');

    const max = form.maxPrice.value;
    const hrs = form.maxHours.value;
    statusEl.textContent =
      `${data.results.length} option(s) under €${max} and ${hrs}h · ${data.datesScanned} dates scanned, ` +
      `${data.optionsSeen} itineraries seen${data.cached ? ' (cached)' : ''}`;

    if (data.provider.startsWith('DEMO')) resultsEl.append(el('div', 'Demo data: set SERPAPI_KEY for real prices.', 'demo'));
    if (!data.results.length && data.cheapestOverall) {
      const c = data.cheapestOverall;
      resultsEl.append(el('p', `Nothing matched. Cheapest seen overall: €${Math.round(c.price)}, ${fmtDur(c.durationMin)} outbound (departing ${c.departDate}).`));
    }
    data.results.forEach((r) => resultsEl.append(card(r)));
    if (data.errors.length) resultsEl.append(el('p', `Some lookups failed: ${data.errors.slice(0, 3).join('; ')}`, 'meta'));
  } catch (e) {
    statusEl.className = 'error';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});
