import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findMatchingCardBillPayment,
  reconcileAccountCardPayments,
} from '../../js/utils/card-payment-reconciliation.js';

test('reconcileAccountCardPayments classifies pix outflow that matches imported card bill total', () => {
  const extrato = [
    { mes: 'Mar/2026', tipo: 'saida', desc: 'PIX TRANSF ITAUCARD', valor: 8056.00, cat: 'Outros', canal: 'pix' },
  ];
  const bills = [
    { fatura: 'Mar/2026', total: 8056.06 },
  ];

  const result = reconcileAccountCardPayments(extrato, bills);

  assert.equal(result[0].cat, 'Fatura Crédito');
  assert.equal(result[0].reconciledAsCardBillPayment, true);
  assert.equal(result[0].matchedCardBillLabel, 'Mar/2026');
});

test('findMatchingCardBillPayment ignores unrelated pix outflow when amount does not match card bill', () => {
  const match = findMatchingCardBillPayment(
    { mes: 'Mar/2026', tipo: 'saida', desc: 'PIX ENVIADO MERCADO CENTRAL', valor: 8120.00, cat: 'Outros', canal: 'pix' },
    [{ fatura: 'Mar/2026', total: 8056.06, monthKey: 202603 }],
  );

  assert.equal(match, null);
});
