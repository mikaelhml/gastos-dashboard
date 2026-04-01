import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateMonthlyCategoryTotals,
  buildSpendAnalytics,
  isSpendTransaction,
  normalizeAnalyticsTransactions,
} from '../../js/utils/analytics.js';

test('normalizeAnalyticsTransactions merges card fatura and account mes into a unified axis', () => {
  const items = normalizeAnalyticsTransactions({
    lancamentos: [{ fatura: 'Jan/2026', desc: 'Mercado', valor: 50 }],
    extratoTransacoes: [{ mes: 'Fev/2026', desc: 'Conta luz', valor: 90, tipo: 'saida' }],
  });

  assert.deepEqual(items.map(item => [item.source, item.monthLabel]), [
    ['cartao', 'Jan/2026'],
    ['conta', 'Fev/2026'],
  ]);
});

test('isSpendTransaction excludes derived rows, non-saida account rows, Fatura Crédito payments, and own transfers', () => {
  assert.equal(isSpendTransaction({ source: 'cartao', valor: 20, cat: 'Alimentação' }), true);
  assert.equal(isSpendTransaction({ source: 'conta', tipo: 'entrada', valor: 100, cat: 'Salário' }), false);
  assert.equal(isSpendTransaction({ source: 'conta', tipo: 'saida', valor: 300, cat: 'Fatura Crédito' }), false);
  assert.equal(isSpendTransaction({ source: 'conta', tipo: 'saida', valor: 300, cat: 'Transferência própria' }), false);
  assert.equal(isSpendTransaction({ source: 'conta', tipo: 'saida', valor: 10, cat: 'Moradia', contextoDerivado: true }), false);
});

test('aggregateMonthlyCategoryTotals merges imported spending without double counting bill payments', () => {
  const result = aggregateMonthlyCategoryTotals({
    lancamentos: [
      { fatura: 'Jan/2026', desc: 'Mercado', valor: 120, cat: 'Alimentação' },
      { fatura: 'Fev/2026', desc: 'Cinema', valor: 80, cat: 'Lazer' },
    ],
    extratoTransacoes: [
      { mes: 'Jan/2026', desc: 'Conta de luz', valor: 90, cat: 'Utilidades', tipo: 'saida' },
      { mes: 'Jan/2026', desc: 'Pagamento fatura', valor: 120, cat: 'Fatura Crédito', tipo: 'saida' },
      { mes: 'Fev/2026', desc: 'Linha SCR', valor: 999, cat: 'Contexto SCR', tipo: 'saida', contextoDerivado: true },
    ],
  });

  assert.deepEqual(result.months, ['Jan/2026', 'Fev/2026']);
  assert.deepEqual(result.totalsByMonth['Jan/2026'], {
    'Alimentação': 120,
    Utilidades: 90,
  });
  assert.equal(result.totalsByMonth['Jan/2026']['Fatura Crédito'], undefined);
  assert.equal(result.totalsByMonth['Fev/2026'].Lazer, 80);
});

test('buildSpendAnalytics exposes an honest quality warning when Outros is large', () => {
  const analytics = buildSpendAnalytics({
    lancamentos: [
      { fatura: 'Jan/2026', desc: 'Compra livre', valor: 100, cat: 'Outros' },
      { fatura: 'Jan/2026', desc: 'Mercado', valor: 200, cat: 'Alimentação' },
    ],
    extratoTransacoes: [],
  });

  assert.equal(analytics.quality.shouldWarn, true);
  assert.equal(analytics.quality.outrosTotal, 100);
  assert.match(analytics.quality.note, /Outros/);
});
