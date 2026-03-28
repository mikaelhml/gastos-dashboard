import test from 'node:test';
import assert from 'node:assert/strict';

import { sortCategorizationRules } from '../../js/utils/categorization-engine.js';

test('sortCategorizationRules keeps stable ordering and normalizes duplicated priorities', () => {
  const rules = [
    { id: 'late', pattern: 'Late', category: 'Late', priority: 3 },
    { id: 'first', pattern: 'First', category: 'First', priority: 1 },
    { id: 'second-a', pattern: 'Second A', category: 'Second A', priority: 2 },
    { id: 'second-b', pattern: 'Second B', category: 'Second B', priority: 2 },
    { id: 'no-priority', pattern: 'No Priority', category: 'No Priority' },
  ];

  const originalClone = structuredClone(rules);
  const sorted = sortCategorizationRules(rules);

  assert.deepEqual(rules, originalClone);
  assert.deepEqual(sorted.map(rule => rule.id), [
    'first',
    'second-a',
    'second-b',
    'late',
    'no-priority',
  ]);
  assert.deepEqual(sorted.map(rule => rule.priority), [1, 2, 3, 4, 5]);
});
