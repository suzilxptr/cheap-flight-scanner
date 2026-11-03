const DAY_MS = 86_400_000;
const MAX_DATES = 20;
const RESULT_LIMIT = 15;
const CONCURRENCY = 3;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date, n) {
  return new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
}

export function parseParams(q) {
  const p = {
    from: String(q.from ?? 'HEL').toUpperCase(),
    to: String(q.to ?? 'KTM').toUpperCase(),
    start: String(q.start ?? ''),
    end: String(q.end ?? q.start ?? ''),
    tripDays: Number(q.tripDays ?? 14),
    step: Number(q.step ?? 1),
    maxPrice: Number(q.maxPrice ?? 1000),
    maxHours: Number(q.maxHours ?? 24),
    maxStops: Number(q.maxStops ?? 1),
    maxReturnChecks: Number(q.maxReturnChecks ?? 10),
  };
  const errors = [];
  if (!/^[A-Z]{3}$/.test(p.from) || !/^[A-Z]{3}$/.test(p.to)) errors.push('Airport codes must be 3 letters.');
  if (!isoDate.test(p.start) || !isoDate.test(p.end) || Number.isNaN(Date.parse(p.start)) || Number.isNaN(Date.parse(p.end)))
    errors.push('Dates must be YYYY-MM-DD.');
  else if (p.end < p.start) errors.push('End date must not be before start date.');
  if (!Number.isInteger(p.tripDays) || p.tripDays < 1 || p.tripDays > 90) errors.push('Trip length must be 1-90 days.');
  if (!Number.isInteger(p.step) || p.step < 1 || p.step > 30) errors.push('Step must be 1-30 days.');
  if (!(p.maxPrice > 0) || !(p.maxHours > 0)) errors.push('Max price and max hours must be positive.');
  if (!Number.isInteger(p.maxStops) || p.maxStops < 0 || p.maxStops > 2) errors.push('maxStops must be 0-2.');
  if (!Number.isInteger(p.maxReturnChecks) || p.maxReturnChecks < 0 || p.maxReturnChecks > 20)
    errors.push('maxReturnChecks must be 0-20.');
  if (!errors.length && datesFor(p).length > MAX_DATES)
    errors.push(`Too many dates (max ${MAX_DATES}); shorten the window or increase the step.`);
  return { params: p, errors };
}

export function datesFor({ start, end, step }) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, step)) out.push(d);
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export async function search(provider, p) {
  const maxMin = p.maxHours * 60;
  const stopsOk = (o) => o.route.length - 2 <= p.maxStops;
  const dates = datesFor(p);
  const errors = [];

  const perDate = await mapLimit(dates, CONCURRENCY, async (departDate) => {
    const q = { from: p.from, to: p.to, departDate, returnDate: addDays(departDate, p.tripDays), maxStops: p.maxStops };
    try {
      return (await provider.searchOutbound(q)).map((o) => ({ ...o, departDate, returnDate: q.returnDate }));
    } catch (e) {
      errors.push(`${departDate}: ${e.message}`);
      return [];
    }
  });

  const seen = perDate.flat();
  const cheapestOverall = seen.reduce((m, o) => (!m || o.price < m.price ? o : m), null);
  const candidates = seen
    .filter((o) => o.price <= p.maxPrice && o.durationMin <= maxMin && stopsOk(o))
    .sort((a, b) => a.price - b.price || a.durationMin - b.durationMin);

  // Round-trip price covers both legs, so also check the return leg fits the time limit.
  const results = [];
  let checks = 0;
  for (const c of candidates) {
    if (results.length >= RESULT_LIMIT) break;
    if (!c.departureToken || checks >= p.maxReturnChecks) {
      results.push({ ...c, returnLeg: null });
      continue;
    }
    checks++;
    try {
      const q = { from: p.from, to: p.to, departDate: c.departDate, returnDate: c.returnDate, maxStops: p.maxStops };
      const back = (await provider.searchReturn(q, c.departureToken))
        .filter((r) => r.durationMin <= maxMin && r.price <= p.maxPrice && stopsOk(r))
        .sort((a, b) => a.price - b.price)[0];
      if (back) results.push({ ...c, price: back.price, returnLeg: back });
    } catch (e) {
      errors.push(`return ${c.departDate}: ${e.message}`);
      results.push({ ...c, returnLeg: null });
    }
  }
  results.sort((a, b) => a.price - b.price);

  return {
    provider: provider.name,
    datesScanned: dates.length,
    optionsSeen: seen.length,
    cheapestOverall,
    results,
    errors,
  };
}
