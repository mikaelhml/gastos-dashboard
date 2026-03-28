import test from 'node:test';
import assert from 'node:assert/strict';

import { buildParcelamentoSummary } from '../../js/utils/parcelamento-summary.js';

test('buildParcelamentoSummary returns compact financing and card-installment impact', () => {
  const summary = buildParcelamentoSummary({
    despesasFixas: [
      {
        desc: 'Financiamento carro',
        valor: 900,
        parcelas: { tipo: 'financiamento', pagas: 5, total: 12, inicio: '2025-10' },
      },
      {
        desc: 'Notebook',
        valor: 300,
        parcelas: { tipo: 'parcelamento', pagas: 3, total: 6, inicio: '2026-01' },
      },
      {
        desc: 'Curso',
        valor: 200,
        parcelas: { tipo: 'parcelamento', pagas: 6, total: 6, inicio: '2025-08' },
      },
    ],
    lancamentos: [
      { fatura: 'Jan/2026', desc: 'TV OLED', valor: 250, parcela: '1/3', totalCompra: 750 },
      { fatura: 'Fev/2026', desc: 'TV OLED', valor: 250, parcela: '2/3', totalCompra: 750 },
      { fatura: 'Fev/2026', desc: 'Curso online', valor: 120, parcela: '4/4', totalCompra: 480 },
    ],
  });

  assert.deepEqual(summary.financiamentos, {
    ativos: 1,
    totalMensal: 900,
    saldoDevedor: 6300,
    proximoTermino: 'out. de 2026',
  });

  assert.deepEqual(summary.cartaoParcelado, {
    ativos: 1,
    totalMensal: 250,
    saldoRestante: 250,
    proximoTermino: 'mar. de 2026',
  });
});
