import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNewDeals, recordSent, pruneState, topPerDuration } from '../src/deals.js';

const deal = (price, departDate = '2027-02-01', tripDays = 7) => ({
  from: 'HEL', to: 'PKR', departDate, returnDate: '2027-02-08', price, tripDays,
});

test('notifies new deals and meaningful price drops only', () => {
  const state = {};
  const first = pickNewDeals([deal(700)], state, 20);
  assert.equal(first.length, 1);
  recordSent(state, first);
  assert.equal(pickNewDeals([deal(700)], state, 20).length, 0);
  assert.equal(pickNewDeals([deal(690)], state, 20).length, 0);
  assert.equal(pickNewDeals([deal(670)], state, 20).length, 1);
});

test('prunes past departures', () => {
  const state = {};
  recordSent(state, [deal(700, '2026-12-01'), deal(700, '2027-02-01')]);
  pruneState(state, '2027-01-01');
  assert.equal(Object.keys(state).length, 1);
});

test('keeps top N per duration', () => {
  const deals = [deal(500, 'a', 7), deal(600, 'b', 7), deal(700, 'c', 7), deal(650, 'd', 30)];
  assert.deepEqual(topPerDuration(deals, 2).map((d) => d.price), [500, 600, 650]);
});
