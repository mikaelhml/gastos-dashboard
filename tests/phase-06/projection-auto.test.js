import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAutomaticProjectionInputs } from '../../js/utils/projection-auto.js';

test('buildAutomaticProjectionInputs estimates projection defaults from imported history', () => {
  const extratoSummary = [
    { mes: 'Jan/2026', entradas: 6500, saidas: 3200, saldoFinal: 3300 },
    { mes: 'Fev/2026', entradas: 6700, saidas: 3400, saldoFinal: 3600 },
    { mes: 'Mar/2026', entradas: 6600, saidas: 3500, saldoFinal: 3700 },
  ];

  const extratoTransacoes = [
    { mes: 'Jan/2026', tipo: 'entrada', desc: 'SALARIO EMPRESA XPTO', valor: 6000 },
    { mes: 'Fev/2026', tipo: 'entrada', desc: 'SALARIO EMPRESA XPTO', valor: 6000 },
    { mes: 'Mar/2026', tipo: 'entrada', desc: 'SALARIO EMPRESA XPTO', valor: 6000 },
    { mes: 'Jan/2026', tipo: 'entrada', desc: 'PIX FREELA CLIENTE A', valor: 500 },
    { mes: 'Fev/2026', tipo: 'entrada', desc: 'PIX FREELA CLIENTE A', valor: 700 },
    { mes: 'Mar/2026', tipo: 'entrada', desc: 'PIX FREELA CLIENTE A', valor: 600 },
    { mes: 'Jan/2026', tipo: 'saida', desc: 'COMPRA DEBITO SUPERMERCADO ZAFFARI', cat: 'Alimentação', valor: 800 },
    { mes: 'Fev/2026', tipo: 'saida', desc: 'COMPRA DEBITO SUPERMERCADO ZAFFARI', cat: 'Alimentação', valor: 900 },
    { mes: 'Mar/2026', tipo: 'saida', desc: 'COMPRA DEBITO SUPERMERCADO ZAFFARI', cat: 'Alimentação', valor: 1000 },
    { mes: 'Jan/2026', tipo: 'saida', desc: 'PAGAMENTO FATURA ITAU', cat: 'Fatura Crédito', valor: 2100 },
    { mes: 'Fev/2026', tipo: 'saida', desc: 'PAGAMENTO FATURA ITAU', cat: 'Fatura Crédito', valor: 2200 },
    { mes: 'Mar/2026', tipo: 'saida', desc: 'PAGAMENTO FATURA ITAU', cat: 'Fatura Crédito', valor: 2300 },
  ];

  const cardBillSummaries = [
    { fatura: 'Mar/2026', total: 2300 },
    { fatura: 'Fev/2026', total: 2200 },
    { fatura: 'Jan/2026', total: 2100 },
  ];

  const recurringCommitments = [
    { desc: 'Aluguel', valor: 1800 },
  ];

  const model = buildAutomaticProjectionInputs({
    extratoTransacoes,
    extratoSummary,
    cardBillSummaries,
    recurringCommitments,
  });

  assert.equal(model.inputs.salario, 6000);
  assert.equal(model.inputs.rendaExtra, 600);
  assert.equal(model.inputs.itau, 2200);
  assert.equal(model.inputs.outros, 900);
  assert.equal(model.diagnostics.billCount, 3);
});

test('buildAutomaticProjectionInputs does not sum recurring transfers into salary', () => {
  const extratoSummary = [
    { mes: 'Jan/2026', entradas: 19700, saidas: 5000, saldoFinal: 7000 },
    { mes: 'Fev/2026', entradas: 19700, saidas: 5200, saldoFinal: 7100 },
  ];

  const extratoTransacoes = [
    { mes: 'Jan/2026', tipo: 'entrada', desc: 'SALARIO EMPRESA XPTO', cat: 'Salário', valor: 9700 },
    { mes: 'Fev/2026', tipo: 'entrada', desc: 'SALARIO EMPRESA XPTO', cat: 'Salário', valor: 9700 },
    { mes: 'Jan/2026', tipo: 'entrada', desc: 'TRANSFERENCIA RECEBIDA CONTA INVESTIMENTOS', cat: 'Transferência', valor: 10000 },
    { mes: 'Fev/2026', tipo: 'entrada', desc: 'TRANSFERENCIA RECEBIDA CONTA INVESTIMENTOS', cat: 'Transferência', valor: 10000 },
  ];

  const model = buildAutomaticProjectionInputs({
    extratoTransacoes,
    extratoSummary,
    cardBillSummaries: [],
    recurringCommitments: [],
  });

  assert.equal(model.inputs.salario, 9700);
  assert.equal(model.inputs.rendaExtra, 0);
});
