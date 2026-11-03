const BASE = 'https://serpapi.com/search.json';

export class ProviderError extends Error {}

async function call(apiKey, params) {
  const url = new URL(BASE);
  const all = { engine: 'google_flights', hl: 'en', currency: 'EUR', ...params, api_key: apiKey };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  const body = await res.json().catch(() => ({}));
  if (body.error) {
    if (/hasn't returned any results/i.test(body.error)) return {};
    throw new ProviderError(body.error);
  }
  if (!res.ok) throw new ProviderError(`SerpApi HTTP ${res.status}`);
  return body;
}

function normalize(opt, meta) {
  const legs = opt.flights ?? [];
  if (!legs.length || typeof opt.price !== 'number') return null;
  const durationMin =
    opt.total_duration ??
    legs.reduce((s, l) => s + (l.duration ?? 0), 0) +
      (opt.layovers ?? []).reduce((s, l) => s + (l.duration ?? 0), 0);
  return {
    price: opt.price,
    durationMin,
    airlines: [...new Set(legs.map((l) => l.airline).filter(Boolean))],
    route: [legs[0].departure_airport?.id, ...legs.map((l) => l.arrival_airport?.id)],
    departTime: legs[0].departure_airport?.time,
    arriveTime: legs.at(-1).arrival_airport?.time,
    layovers: (opt.layovers ?? []).map((l) => ({
      airport: l.id,
      minutes: l.duration,
      overnight: Boolean(l.overnight),
    })),
    departureToken: opt.departure_token,
    url: meta?.google_flights_url,
  };
}

function extract(body) {
  return [...(body.best_flights ?? []), ...(body.other_flights ?? [])]
    .map((o) => normalize(o, body.search_metadata))
    .filter(Boolean);
}

export function createSerpApiProvider(apiKey) {
  const base = (q) => ({
    departure_id: q.from,
    arrival_id: q.to,
    outbound_date: q.departDate,
    return_date: q.returnDate,
    type: 1,
    sort_by: 2,
    // SerpApi: 1 = nonstop only, 2 = up to 1 stop, 3 = up to 2 stops.
    ...(q.maxStops != null && { stops: q.maxStops + 1 }),
  });

  return {
    name: 'SerpApi Google Flights',
    // Round-trip options; `price` is the total round-trip price, duration is the outbound leg.
    async searchOutbound(q) {
      return extract(await call(apiKey, base(q)));
    },
    // Return-leg options for a chosen outbound; duration is the return leg.
    async searchReturn(q, departureToken) {
      return extract(await call(apiKey, { ...base(q), departure_token: departureToken }));
    },
  };
}
