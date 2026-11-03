import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, search } from '../src/search.js';

const opt = (price, hours, token = 't') => ({
  price,
  durationMin: hours * 60,
  airlines: ['X'],
  route: ['HEL', 'DOH', 'PKR'],
  layovers: [],
  departureToken: token,
});

test('filters by price and duration, verifies return leg, sorts by price', async () => {
  const provider = {
    name: 'fake',
    searchOutbound: async () => [opt(700, 20), opt(900, 10), opt(500, 30), opt(600, 22, 'bad-return')],
    searchReturn: async (_q, token) => (token === 'bad-return' ? [opt(600, 40)] : [opt(700, 18)]),
  };
  const { params } = parseParams({ start: '2027-01-10', end: '2027-01-10', tripDays: 7, maxPrice: 800 });
  const out = await search(provider, params);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].price, 700);
  assert.equal(out.cheapestOverall.price, 500);
});

test('rejects bad input', () => {
  assert.ok(parseParams({ start: 'nope', end: 'nope' }).errors.length);
  assert.ok(parseParams({ start: '2027-01-01', end: '2027-12-31', step: 1 }).errors.length);
});
