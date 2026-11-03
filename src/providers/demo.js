// Deterministic fake data so the UI works without an API key.
function hash(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function fake(q, salt) {
  const h = hash(q.departDate + q.returnDate + salt);
  const via = ['DOH', 'IST', 'DEL', 'AUH'][h % 4];
  const airlines = { DOH: 'Qatar Airways', IST: 'Turkish Airlines', DEL: 'Air India', AUH: 'Etihad' };
  return {
    price: 650 + (h % 400),
    durationMin: 15 * 60 + (h % 14) * 60,
    airlines: [airlines[via]],
    route: [q.from, via, 'KTM', q.to],
    departTime: `${q.departDate} 0${6 + (h % 3)}:30`,
    arriveTime: '',
    layovers: [{ airport: via, minutes: 90 + (h % 5) * 40, overnight: false }],
    departureToken: `demo-${h}`,
    url: 'https://www.google.com/travel/flights',
  };
}

export const demoProvider = {
  name: 'DEMO DATA (no SERPAPI_KEY set)',
  async searchOutbound(q) {
    return [fake(q, 'a'), fake(q, 'b'), fake(q, 'c')];
  },
  async searchReturn(q) {
    return [{ ...fake(q, 'r'), departTime: `${q.returnDate} 10:00` }];
  },
};
