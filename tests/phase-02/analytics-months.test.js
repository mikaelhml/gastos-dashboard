import test from 'node:test';
import assert from 'node:assert/strict';

import { monthLabelToKey, sortMonthLabels } from '../../js/utils/analytics.js';

test('monthLabelToKey converts Jan/2026-style labels into sortable keys', () => {
  assert.equal(monthLabelToKey('Jan/2026'), 202601);
  assert.equal(monthLabelToKey('Dez/2025'), 202512);
  assert.equal(monthLabelToKey('invalid'), null);
});

test('sortMonthLabels orders months chronologically across year boundaries', () => {
  const result = sortMonthLabels(['Mar/2026', 'Jan/2026', 'Dez/2025', 'Fev/2026', 'Jan/2026']);
  assert.deepEqual(result, ['Dez/2025', 'Jan/2026', 'Fev/2026', 'Mar/2026']);
});
