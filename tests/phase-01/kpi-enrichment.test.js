import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHealthScore,
  buildInstallmentRelief,
  buildConsolidatedDebt,
} from '../../js/utils/financial-analysis.js';

describe('buildHealthScore', () => {
  it('returns score >= 85 for good budget, no debt, positive cashflow, free > 20% income', () => {
    const result = buildHealthScore({
      budget: { pressureRatio: 0.6, freeBudgetEstimate: 1500, estimatedIncome: 5000 },
      debt: { totalExposure: 0, overdue: 0 },
      cashflow: { averageNet: 500 },
    });
    assert.ok(result.score >= 85, `Expected score >= 85, got ${result.score}`);
    assert.equal(result.label, 'Saudavel');
    assert.equal(result.tone, 'healthy');
  });

  it('returns score <= 30 for over-budget, overdue debt, negative cashflow', () => {
    const result = buildHealthScore({
      budget: { pressureRatio: 1.2, freeBudgetEstimate: -500, estimatedIncome: 3000 },
      debt: { totalExposure: 10000, overdue: 2000 },
      cashflow: { averageNet: -1000 },
    });
    assert.ok(result.score <= 30, `Expected score <= 30, got ${result.score}`);
    assert.equal(result.label, 'Critico');
    assert.equal(result.tone, 'critical');
  });

  it('returns score ~55-65 for neutral data', () => {
    const result = buildHealthScore({
      budget: { pressureRatio: 0.95, freeBudgetEstimate: -50, estimatedIncome: 4000 },
      debt: { totalExposure: 0, overdue: 0 },
      cashflow: { averageNet: -200 },
    });
    assert.ok(result.score >= 55 && result.score <= 65, `Expected 55-65, got ${result.score}`);
  });

  it('returns safe defaults for zero/empty input', () => {
    const result = buildHealthScore({});
    assert.equal(result.score, 50);
    assert.equal(result.label, 'Atencao');
    assert.equal(result.tone, 'attention');
  });

  it('clamps score to 0-100 range', () => {
    const highResult = buildHealthScore({
      budget: { pressureRatio: 0.3, freeBudgetEstimate: 5000, estimatedIncome: 6000 },
      debt: { totalExposure: 0, overdue: 0 },
      cashflow: { averageNet: 2000 },
    });
    assert.ok(highResult.score <= 100);
    assert.ok(highResult.score >= 0);
  });
});

describe('buildInstallmentRelief', () => {
  it('returns correct values for active installments', () => {
    const despesas = [
      { nome: 'TV', valorMensal: 200, parcelaAtual: 3, totalParcelas: 10 },
      { nome: 'Geladeira', valor: 150, parcelaAtual: 6, totalParcelas: 12 },
    ];
    const result = buildInstallmentRelief(despesas);
    assert.equal(result.activeParcelas, 2);
    assert.equal(result.totalMonthly, 350);
    // TV: 7 remaining * 200 = 1400, Geladeira: 6 remaining * 150 = 900
    assert.equal(result.totalRemaining, 2300);
    assert.ok(result.reliefDate !== null);
    assert.ok(result.monthlySavingsAfterRelief >= 0);
  });

  it('returns zeros for no parcelas', () => {
    const result = buildInstallmentRelief([]);
    assert.equal(result.activeParcelas, 0);
    assert.equal(result.totalMonthly, 0);
    assert.equal(result.totalRemaining, 0);
    assert.equal(result.reliefDate, null);
    assert.equal(result.monthlySavingsAfterRelief, 0);
  });

  it('returns zeros for undefined input', () => {
    const result = buildInstallmentRelief();
    assert.equal(result.activeParcelas, 0);
    assert.equal(result.totalMonthly, 0);
  });

  it('ignores items without parcelaAtual and totalParcelas', () => {
    const despesas = [
      { nome: 'Aluguel', valorMensal: 1500 },
      { nome: 'TV', valorMensal: 200, parcelaAtual: 3, totalParcelas: 10 },
    ];
    const result = buildInstallmentRelief(despesas);
    assert.equal(result.activeParcelas, 1);
    assert.equal(result.totalMonthly, 200);
  });
});

describe('buildConsolidatedDebt', () => {
  it('sums SCR exposure and financing from despesasFixas', () => {
    const result = buildConsolidatedDebt({
      debt: { totalExposure: 15000, overdue: 500 },
      despesasFixas: [
        { nome: 'Financiamento carro', tipo: 'Financiamento', valorMensal: 800, parcelaAtual: 12, totalParcelas: 48 },
        { nome: 'Aluguel', tipo: 'Moradia', valorMensal: 1500 },
      ],
    });
    assert.equal(result.scrExposure, 15000);
    // financing: 800 * (48-12) = 28800
    assert.equal(result.financingTotal, 28800);
    assert.equal(result.total, 15000 + 28800);
    assert.equal(result.overdueAmount, 500);
  });

  it('returns zeros for empty input', () => {
    const result = buildConsolidatedDebt({});
    assert.equal(result.total, 0);
    assert.equal(result.scrExposure, 0);
    assert.equal(result.financingTotal, 0);
    assert.equal(result.overdueAmount, 0);
  });

  it('matches emprestimo tipo', () => {
    const result = buildConsolidatedDebt({
      debt: { totalExposure: 0 },
      despesasFixas: [
        { nome: 'Emprestimo pessoal', tipo: 'Emprestimo', valorMensal: 500, parcelaAtual: 2, totalParcelas: 10 },
      ],
    });
    // 500 * (10-2) = 4000
    assert.equal(result.financingTotal, 4000);
    assert.equal(result.total, 4000);
  });
});
