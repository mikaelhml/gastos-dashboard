import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFinancialAnalysisModel } from '../../js/utils/financial-analysis.js';

test('buildFinancialAnalysisModel consolidates budget, debt, cashflow, and spending into one shared contract', () => {
  const model = buildFinancialAnalysisModel({
    recurringCommitments: [
      { valor: 2300 },
      { valor: 900 },
    ],
    extratoSummary: [
      { mes: 'Fev/2026', saldoInicial: 5000, entradas: 10000, saidas: 9100, rendimento: 0, saldoFinal: 5900, variacao: 900 },
      { mes: 'Mar/2026', saldoInicial: 5900, entradas: 11000, saidas: 10700, rendimento: 0, saldoFinal: 6200, variacao: 300 },
    ],
    orcamentos: [
      { cat: 'Moradia', valor: 1200 },
      { cat: 'Lazer', valorMensal: 300 },
    ],
    registratoInsights: {
      exposicaoTotal: 15000,
      dividaVencida: 500,
      limiteCredito: 2000,
    },
    cardBillSummaries: [
      { fatura: 'Mar/2026', total: 2500 },
    ],
    spendAnalytics: {
      categories: ['Alimentação', 'Moradia'],
      categoryTotals: { Alimentação: 1800, Moradia: 1200 },
      monthTotals: { 'Mar/2026': 900 },
      totalSpend: 3000,
      latestMonth: 'Mar/2026',
      previousMonth: 'Fev/2026',
      movers: [{ cat: 'Alimentação', delta: 200 }],
      quality: { shouldWarn: false, note: '', outrosShare: 0.1, outrosTotal: 300 },
    },
    scrProjectionModel: {
      totals: {
        includedMonthlyTotal: 700,
        conflictMonthlyTotal: 200,
      },
    },
    automaticProjection: {
      inputs: {
        salario: 9800,
        rendaExtra: 1200,
        itau: 2500,
        outros: 1800,
      },
    },
  });

  assert.equal(model.budget.estimatedIncome, 11000);
  assert.equal(model.budget.recurringBase, 3200);
  assert.equal(model.budget.includedCreditCommitments, 700);
  assert.equal(model.budget.recurringWithCredit, 3900);
  assert.equal(model.budget.variableSpendEstimate, 4300);
  assert.equal(model.budget.totalPlannedSpend, 8200);
  assert.equal(model.budget.freeBudgetEstimate, 2800);
  assert.equal(model.budget.configuredBudgetTotal, 1500);
  assert.equal(model.budget.status.tone, 'healthy');

  assert.equal(model.debt.totalExposure, 15000);
  assert.equal(model.debt.overdue, 500);
  assert.equal(model.debt.includedProjection, 700);

  assert.equal(model.cashflow.currentBalance, 6200);
  assert.equal(model.cashflow.best.mes, 'Fev/2026');
  assert.equal(model.cashflow.worst.mes, 'Mar/2026');

  assert.equal(model.spending.strongestCategory.cat, 'Alimentação');
  assert.equal(model.spending.strongestCategory.share, 0.6);
  assert.equal(model.spending.previousMonth, 'Fev/2026');
  assert.equal(model.summaryCards.length, 6);
  assert.equal(model.highlights.length > 0, true);
  assert.match(model.narrative.headline, /histórico atual|orçamento-base/i);
});

test('buildFinancialAnalysisModel escalates budget pressure when planned spending is above estimated income', () => {
  const model = buildFinancialAnalysisModel({
    recurringCommitments: [{ valor: 3500 }],
    extratoSummary: [{ mes: 'Mar/2026', saldoFinal: 1500, entradas: 5000, saidas: 5200, variacao: -200 }],
    registratoInsights: { exposicaoTotal: 8000, dividaVencida: 0, limiteCredito: 1500 },
    spendAnalytics: {
      categories: ['Outros'],
      categoryTotals: { Outros: 900 },
      monthTotals: { 'Mar/2026': 900 },
      totalSpend: 900,
      latestMonth: 'Mar/2026',
      movers: [],
      quality: { shouldWarn: true, note: "'Outros' representa 100% do gasto analisado.", outrosShare: 1, outrosTotal: 900 },
    },
    scrProjectionModel: { totals: { includedMonthlyTotal: 600, conflictMonthlyTotal: 0 } },
    automaticProjection: { inputs: { salario: 3000, rendaExtra: 0, itau: 900, outros: 500 } },
  });

  assert.equal(model.budget.freeBudgetEstimate, -2500);
  assert.equal(model.budget.status.tone, 'critical');
  assert.equal(model.highlights.some(item => /Qualidade da categorização/.test(item.title)), true);
  assert.match(model.narrative.headline, /pressionado/i);
});
