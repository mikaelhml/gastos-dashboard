import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCategorizationRuntime,
  buildRecategorizedRowPatches,
} from '../../js/utils/categorization-engine.js';

test('buildRecategorizedRowPatches returns only persisted rows whose categorization changed', () => {
  const storedRows = [
    {
      id: 1,
      desc: 'Uber Trip Sao Paulo',
      valor: 18.4,
      cat: 'Transporte',
      cat_origem: 'padrao',
      cat_regra_id: null,
      importFingerprint: 'abc123',
    },
    {
      id: 2,
      desc: 'Salario Empresa',
      valor: 5200,
      tipo: 'entrada',
      cat: 'Salário',
      cat_origem: 'padrao',
      cat_regra_id: null,
      importFingerprint: 'def456',
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

  const patches = buildRecategorizedRowPatches(
    storedRows,
    runtime,
    { source: (_, index) => (index === 0 ? 'cartao' : 'conta'), direction: row => row.tipo === 'entrada' ? 'entrada' : 'saida' },
  );

  assert.deepEqual(patches, [
    {
      id: 1,
      desc: 'Uber Trip Sao Paulo',
      valor: 18.4,
      cat: 'Mobilidade Premium',
      cat_origem: 'regra',
      cat_regra_id: 'rule-uber',
      importFingerprint: 'abc123',
    },
  ]);
});
