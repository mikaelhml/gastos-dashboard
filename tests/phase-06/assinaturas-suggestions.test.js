import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../../js/views/assinaturas.js';

test('detectarSugestoes only returns recurring subscriptions when one occurrence is in the latest month', () => {
  const lancamentos = [
    { id: 1, desc: 'SPOTIFY', valor: 21.9, fatura: 'Jan/2026', cat: 'Streaming' },
    { id: 2, desc: 'SPOTIFY', valor: 21.9, fatura: 'Fev/2026', cat: 'Streaming' },
    { id: 3, desc: 'NETFLIX', valor: 39.9, fatura: 'Jan/2026', cat: 'Streaming' },
    { id: 4, desc: 'NETFLIX', valor: 39.9, fatura: 'Fev/2026', cat: 'Streaming' },
    { id: 5, desc: 'YOUTUBE PREMIUM', valor: 24.9, fatura: 'Fev/2026', cat: 'Streaming' },
    { id: 6, desc: 'YOUTUBE PREMIUM', valor: 24.9, fatura: 'Mar/2026', cat: 'Streaming' },
  ];

  const suggestions = __test__.detectarSugestoes(lancamentos, [], new Set(), new Set());
  const names = suggestions.map(item => item.nome);

  assert.deepEqual(names, ['Youtube Premium']);
});
