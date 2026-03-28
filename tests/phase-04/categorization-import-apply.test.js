import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCategorizationToImportedRows,
  buildCategorizationRuntime,
} from '../../js/utils/categorization-engine.js';

test('applyCategorizationToImportedRows preserves parsed row shape and only stamps categorization fields', () => {
  const inputRows = [
    {
      id: 7,
      data: '2026-03-10',
      desc: 'Uber Trip Sao Paulo',
      valor: 18.4,
      parcela: '1/2',
      totalCompra: 36.8,
      importFingerprint: 'abc123',
      origemArquivo: 'cartao-marco.pdf',
    },
  ];

  const runtime = buildCategorizationRuntime({
    rules: [
      {
        id: 'rule-uber',
        pattern: 'UBER',
        category: 'Mobilidade Premium',
        sourceScope: 'cartao',
        directionScope: 'saida',
        enabled: true,
        priority: 1,
      },
    ],
  });

  const outputRows = applyCategorizationToImportedRows(
    inputRows,
    runtime,
    { source: 'cartao', direction: 'saida' },
  );

  assert.deepEqual(inputRows[0], {
    id: 7,
    data: '2026-03-10',
    desc: 'Uber Trip Sao Paulo',
    valor: 18.4,
    parcela: '1/2',
    totalCompra: 36.8,
    importFingerprint: 'abc123',
    origemArquivo: 'cartao-marco.pdf',
  });

  assert.deepEqual(outputRows, [
    {
      id: 7,
      data: '2026-03-10',
      desc: 'Uber Trip Sao Paulo',
      valor: 18.4,
      parcela: '1/2',
      totalCompra: 36.8,
      importFingerprint: 'abc123',
      origemArquivo: 'cartao-marco.pdf',
      cat: 'Mobilidade Premium',
      cat_origem: 'regra',
      cat_regra_id: 'rule-uber',
    },
  ]);
  assert.notEqual(outputRows[0], inputRows[0]);
});
