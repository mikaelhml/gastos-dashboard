import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateInstallmentPurchase, computePurchaseImpact } from '../../js/utils/purchase-simulator.js';

describe('simulateInstallmentPurchase', () => {
  it('computes zero-interest installments correctly', () => {
    const result = simulateInstallmentPurchase({ totalValue: 1200, installments: 12, monthlyInterestRate: 0 });
    assert.equal(result.monthlyPayment, 100);
    assert.equal(result.totalPaid, 1200);
    assert.equal(result.totalInterest, 0);
    assert.equal(result.installments, 12);
    assert.equal(result.effectiveRate, 0);
  });

  it('computes compound interest with PMT formula (R$1000, 10x, 2% a.m.)', () => {
    const result = simulateInstallmentPurchase({ totalValue: 1000, installments: 10, monthlyInterestRate: 2 });
    // PMT = 1000 * (0.02 * 1.02^10) / (1.02^10 - 1) ≈ 111.33
    assert.ok(Math.abs(result.monthlyPayment - 111.33) < 0.01, `Monthly: ${result.monthlyPayment}`);
    // totalPaid = 111.33 * 10 ≈ 1113.27
    assert.ok(Math.abs(result.totalPaid - 1113.27) < 0.05, `Total: ${result.totalPaid}`);
    // totalInterest ≈ 113.27
    assert.ok(Math.abs(result.totalInterest - 113.27) < 0.05, `Interest: ${result.totalInterest}`);
    assert.equal(result.installments, 10);
    assert.ok(result.effectiveRate > 0);
  });

  it('returns null for zero totalValue', () => {
    assert.equal(simulateInstallmentPurchase({ totalValue: 0, installments: 5, monthlyInterestRate: 0 }), null);
  });

  it('returns null for zero installments', () => {
    assert.equal(simulateInstallmentPurchase({ totalValue: 500, installments: 0, monthlyInterestRate: 0 }), null);
  });

  it('returns null for negative totalValue', () => {
    assert.equal(simulateInstallmentPurchase({ totalValue: -100, installments: 3, monthlyInterestRate: 1 }), null);
  });

  it('handles negative interest rate as zero interest', () => {
    const result = simulateInstallmentPurchase({ totalValue: 600, installments: 6, monthlyInterestRate: -1 });
    assert.equal(result.monthlyPayment, 100);
    assert.equal(result.totalInterest, 0);
  });
});

describe('computePurchaseImpact', () => {
  it('computes impact correctly for viable purchase', () => {
    const result = computePurchaseImpact({ monthlyPayment: 200, freeBudgetEstimate: 1500, estimatedIncome: 5000 });
    assert.equal(result.newFreeBalance, 1300);
    // 200/1500 ≈ 0.1333
    assert.ok(Math.abs(result.paymentAsPercentOfFree - 0.1333) < 0.001, `%Free: ${result.paymentAsPercentOfFree}`);
    assert.equal(result.paymentAsPercentOfIncome, 0.04); // 200/5000
    assert.equal(result.viable, true);
  });

  it('returns viable=false when payment > free budget', () => {
    const result = computePurchaseImpact({ monthlyPayment: 2000, freeBudgetEstimate: 1500, estimatedIncome: 5000 });
    assert.equal(result.viable, false);
    assert.equal(result.newFreeBalance, -500);
  });

  it('returns viable=false when free budget <= 0', () => {
    const result = computePurchaseImpact({ monthlyPayment: 100, freeBudgetEstimate: 0, estimatedIncome: 3000 });
    assert.equal(result.viable, false);
    assert.equal(result.paymentAsPercentOfFree, 0);
  });

  it('handles zero income gracefully', () => {
    const result = computePurchaseImpact({ monthlyPayment: 100, freeBudgetEstimate: 500, estimatedIncome: 0 });
    assert.equal(result.paymentAsPercentOfIncome, 0);
    assert.equal(result.viable, true);
  });
});
