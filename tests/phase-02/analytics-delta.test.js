import test from 'node:test';
import assert from 'node:assert/strict';

import { computeMonthOverMonthDeltas } from '../../js/utils/analytics.js';

test('computeMonthOverMonthDeltas sorts movers by absolute delta and preserves semantics', () => {
  const result = computeMonthOverMonthDeltas({
    months: ['Jan/2026', 'Fev/2026'],
    totalsByMonth: {
      'Jan/2026': { Alimentação: 100, Moradia: 200, Transporte: 40 },
      'Fev/2026': { Alimentação: 180, Moradia: 0, Saúde: 90, Transporte: 40 },
    },
  });

  assert.equal(result.previousMonth, 'Jan/2026');
  assert.equal(result.currentMonth, 'Fev/2026');
  assert.deepEqual(result.movers.map(item => item.cat), ['Moradia', 'Saúde', 'Alimentação', 'Transporte']);

  const zeroed = result.movers.find(item => item.cat === 'Moradia');
  const newer = result.movers.find(item => item.cat === 'Saúde');
  const up = result.movers.find(item => item.cat === 'Alimentação');
  const flat = result.movers.find(item => item.cat === 'Transporte');

  assert.deepEqual(
    { previous: zeroed.previous, current: zeroed.current, delta: zeroed.delta, status: zeroed.status, note: zeroed.note, pct: zeroed.pct },
    { previous: 200, current: 0, delta: -200, status: 'zeroed', note: 'zerado', pct: null },
  );
  assert.deepEqual(
    { previous: newer.previous, current: newer.current, delta: newer.delta, status: newer.status, note: newer.note, pct: newer.pct },
    { previous: 0, current: 90, delta: 90, status: 'new', note: 'novo gasto', pct: null },
  );
  assert.equal(up.status, 'up');
  assert.equal(up.pct, 80);
  assert.equal(flat.status, 'flat');
  assert.equal(flat.delta, 0);
});
