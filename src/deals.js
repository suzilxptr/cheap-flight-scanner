export const dealKey = (d) => `${d.from}-${d.to}|${d.departDate}|${d.returnDate}`;

// A deal is new if never notified, or its price dropped by at least minDrop since last time.
export function pickNewDeals(deals, state, minDrop) {
  return deals.filter((d) => {
    const prev = state[dealKey(d)];
    return !prev || d.price <= prev.price - minDrop;
  });
}

export function recordSent(state, sent, now = new Date().toISOString()) {
  for (const d of sent) state[dealKey(d)] = { price: d.price, departDate: d.departDate, notifiedAt: now };
}

export function pruneState(state, today) {
  for (const [k, v] of Object.entries(state)) if (v.departDate < today) delete state[k];
}

export function topPerDuration(deals, n) {
  const byDuration = new Map();
  const seenKeys = new Set();
  // One entry per date pair: the cheapest itinerary.
  for (const d of [...deals].sort((a, b) => a.price - b.price)) {
    if (seenKeys.has(dealKey(d))) continue;
    seenKeys.add(dealKey(d));
    const group = `${d.to}|${d.tripDays}`;
    const list = byDuration.get(group) ?? [];
    if (list.length < n) list.push(d);
    byDuration.set(group, list);
  }
  return [...byDuration.values()].flat().sort((a, b) => a.price - b.price);
}
