import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportQuality,
  dedupeImportedLancamentos,
  planScopedReplacement,
} from '../../js/utils/import-integrity.js';

test('planScopedReplacement preserves same-period rows from another source', () => {
  const incomingItems = [
    { data: '10/03/2026', desc: 'Mercado XYZ', valor: 100, importSource: 'nubank-fatura', importPeriodKey: 'Mar/2026' },
  ];

  const result = planScopedReplacement({
    existingItems: [
      { id: 1, fatura: 'Mar/2026', importSource: 'itau-fatura', desc: 'Mercado XYZ', valor: 100, data: '10/03/2026' },
      { id: 2, fatura: 'Mar/2026', importSource: 'nubank-fatura', desc: 'Padaria', valor: 25, data: '09/03/2026' },
    ],
    incomingItems,
    sourceKey: 'nubank-fatura',
    periodKey: 'Mar/2026',
  });

  assert.deepEqual(result.deleteIds, [2]);
  assert.equal(result.warnings.length, 0);
});

test('planScopedReplacement replaces same-source rows for the same period', () => {
  const result = planScopedReplacement({
    existingItems: [
      { id: 'a', fatura: 'Mar/2026', importSource: 'nubank-fatura', desc: 'Mercado', valor: 19.9, data: '05/03/2026' },
      { id: 'b', fatura: 'Fev/2026', importSource: 'nubank-fatura', desc: 'Cinema', valor: 40, data: '05/02/2026' },
    ],
    incomingItems: [
      { data: '07/03/2026', desc: 'Padaria', valor: 10, importSource: 'nubank-fatura', importPeriodKey: 'Mar/2026' },
    ],
    sourceKey: 'nubank-fatura',
    periodKey: 'Mar/2026',
  });

  assert.deepEqual(result.deleteIds, ['a']);
});

test('planScopedReplacement only deletes legacy rows when fingerprint matches incoming rows', () => {
  const incomingItems = [
    { data: '10/03/2026', desc: 'Mercado Central', valor: 88.5, importSource: 'itau-fatura', importPeriodKey: 'Mar/2026' },
  ];

  const result = planScopedReplacement({
    existingItems: [
      { id: 1, fatura: 'Mar/2026', desc: 'Mercado Central', valor: 88.5, data: '10/03/2026' },
      { id: 2, fatura: 'Mar/2026', desc: 'Farmacia', valor: 30, data: '11/03/2026' },
    ],
    incomingItems,
    sourceKey: 'itau-fatura',
    periodKey: 'Mar/2026',
  });

  assert.deepEqual(result.deleteIds, [1]);
  assert.equal(result.ambiguousCount, 1);
  assert.match(result.warnings[0].message, /mantido/);
});

test('dedupeImportedLancamentos collapses duplicate parsed rows and emits warnings', () => {
  const result = dedupeImportedLancamentos([
    { data: '10/03/2026', desc: 'Mercado', valor: 20, importSource: 'nubank-fatura' },
    { data: '10/03/2026', desc: 'Mercado', valor: 20, importSource: 'nubank-fatura' },
    { data: '11/03/2026', desc: 'Cinema', valor: 40, importSource: 'nubank-fatura' },
  ]);

  assert.equal(result.uniqueItems.length, 2);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.warnings[0].code, 'duplicate-import-rows');
});

test('buildImportQuality produces deterministic trust badge metadata', () => {
  const quality = buildImportQuality({
    importedCount: 28,
    duplicateCount: 1,
    warningCount: 1,
    unitLabel: 'transação',
  });

  assert.deepEqual(quality, {
    score: 94,
    label: '28 transações · confiança 94%',
    unitLabel: 'transação',
    importedCount: 28,
    warningCount: 1,
  });
});

test('buildImportQuality returns zero confidence when nothing was imported', () => {
  const quality = buildImportQuality({
    importedCount: 0,
    warningCount: 0,
    unitLabel: 'transação',
  });

  assert.equal(quality.score, 0);
  assert.equal(quality.label, '0 transações · confiança 0%');
});
