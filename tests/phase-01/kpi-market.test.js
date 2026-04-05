import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMarketKpis } from '../../js/utils/kpi-market.js';

describe('computeMarketKpis', () => {
  it('returns all 6 KPI values with correct keys', () => {
    const result = computeMarketKpis({
      budget: { estimatedIncome: 5000, totalPlannedSpend: 3500 },
      debt: { totalExposure: 8000 },
      cashflow: { currentBalance: 12000 },
      spending: { latestMonthSpend: 3500 },
    });
    assert.ok('netWorth' in result);
    assert.ok('savingsRate' in result);
    assert.ok('debtToIncome' in result);
    assert.ok('emergencyFundCoverage' in result);
    assert.ok('spendingVelocity' in result);
    assert.ok('cashRunway' in result);
    assert.ok('_partial' in result);
  });

  it('computes correct values for known scenario', () => {
    const result = computeMarketKpis({
      budget: { estimatedIncome: 5000, totalPlannedSpend: 3500 },
      debt: { totalExposure: 8000 },
      cashflow: { currentBalance: 12000 },
      spending: { latestMonthSpend: 3500 },
    });
    assert.equal(result.netWorth, 4000); // 12000 - 8000
    assert.equal(result.savingsRate, 0.3); // (5000-3500)/5000
    // DTI = 8000 / (5000*12) = 0.1333
    assert.ok(Math.abs(result.debtToIncome - 0.1333) < 0.001, `DTI: ${result.debtToIncome}`);
    // emergencyFundCoverage = 12000/3500 = 3.4286 -> roundMoney -> 3.43
    assert.ok(Math.abs(result.emergencyFundCoverage - 3.43) < 0.01, `EFC: ${result.emergencyFundCoverage}`);
    // spendingVelocity = 3500/30 = 116.67
    assert.ok(Math.abs(result.spendingVelocity - 116.67) < 0.01, `SV: ${result.spendingVelocity}`);
    // cashRunway = 12000/3500 = 3.43
    assert.ok(Math.abs(result.cashRunway - 3.43) < 0.01, `CR: ${result.cashRunway}`);
  });

  it('returns all zeros for empty input', () => {
    const result = computeMarketKpis({});
    assert.equal(result.netWorth, 0);
    assert.equal(result.savingsRate, 0);
    assert.equal(result.debtToIncome, 0);
    assert.equal(result.emergencyFundCoverage, 0);
    assert.equal(result.spendingVelocity, 0);
    assert.equal(result.cashRunway, 0);
  });

  it('returns all zeros for undefined input', () => {
    const result = computeMarketKpis();
    assert.equal(result.netWorth, 0);
    assert.equal(result.savingsRate, 0);
  });

  it('handles zero income gracefully', () => {
    const result = computeMarketKpis({
      budget: { estimatedIncome: 0, totalPlannedSpend: 1000 },
      debt: { totalExposure: 5000 },
      cashflow: { currentBalance: 3000 },
      spending: { latestMonthSpend: 1000 },
    });
    assert.equal(result.savingsRate, 0);
    assert.equal(result.debtToIncome, 0);
    assert.equal(result.netWorth, -2000); // 3000 - 5000
  });

  it('uses latestMonthSpend as fallback for expense base', () => {
    const result = computeMarketKpis({
      budget: { estimatedIncome: 5000, totalPlannedSpend: 0 },
      debt: { totalExposure: 0 },
      cashflow: { currentBalance: 6000 },
      spending: { latestMonthSpend: 2000 },
    });
    // emergencyFundCoverage = 6000/2000 = 3
    assert.equal(result.emergencyFundCoverage, 3);
    // cashRunway = 6000/2000 = 3
    assert.equal(result.cashRunway, 3);
  });
});
