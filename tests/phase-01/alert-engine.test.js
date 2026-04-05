import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateContextualAlerts } from '../../js/utils/alert-engine.js';

describe('generateContextualAlerts', () => {
  it('returns danger alert when budget pressure >= 1', () => {
    const alerts = generateContextualAlerts({
      budget: { pressureRatio: 1.2, estimatedIncome: 3000, freeBudgetEstimate: -500 },
    });
    const danger = alerts.find(a => a.type === 'danger' && a.message.includes('Despesas excedem'));
    assert.ok(danger, 'Expected danger alert for over-budget');
  });

  it('returns danger alert when overdue debt > 0', () => {
    const alerts = generateContextualAlerts({
      debt: { overdue: 1500 },
    });
    const danger = alerts.find(a => a.type === 'danger' && a.message.includes('vencida'));
    assert.ok(danger, 'Expected danger alert for overdue debt');
  });

  it('returns warning when free budget < 10% of income', () => {
    const alerts = generateContextualAlerts({
      budget: { freeBudgetEstimate: 400, estimatedIncome: 5000, pressureRatio: 0.8 },
    });
    const warning = alerts.find(a => a.type === 'warning' && a.message.includes('10%'));
    assert.ok(warning, 'Expected warning alert for thin margin');
  });

  it('returns success when cashflow average is positive', () => {
    const alerts = generateContextualAlerts({
      cashflow: { averageNet: 500 },
    });
    const success = alerts.find(a => a.type === 'success' && a.message.includes('positivo'));
    assert.ok(success, 'Expected success alert for positive cashflow');
  });

  it('returns info when health score >= 70', () => {
    const alerts = generateContextualAlerts({
      healthScore: { score: 75 },
    });
    const info = alerts.find(a => a.type === 'info' && a.message.includes('saudavel'));
    assert.ok(info, 'Expected info alert for good health');
  });

  it('returns at most 4 alerts', () => {
    const alerts = generateContextualAlerts({
      budget: { pressureRatio: 1.5, freeBudgetEstimate: 100, estimatedIncome: 5000 },
      debt: { overdue: 2000 },
      cashflow: { averageNet: 100 },
      healthScore: { score: 75 },
    });
    assert.ok(alerts.length <= 4, `Expected <= 4 alerts, got ${alerts.length}`);
  });

  it('prioritizes danger first', () => {
    const alerts = generateContextualAlerts({
      budget: { pressureRatio: 1.5, freeBudgetEstimate: 0, estimatedIncome: 5000 },
      debt: { overdue: 500 },
      cashflow: { averageNet: 100 },
      healthScore: { score: 80 },
    });
    assert.equal(alerts[0].type, 'danger');
  });

  it('returns empty array for all-zero input', () => {
    const alerts = generateContextualAlerts({});
    assert.deepEqual(alerts, []);
  });

  it('each alert has type, message, icon keys', () => {
    const alerts = generateContextualAlerts({
      budget: { pressureRatio: 1.2, estimatedIncome: 3000 },
    });
    for (const alert of alerts) {
      assert.ok('type' in alert);
      assert.ok('message' in alert);
      assert.ok('icon' in alert);
    }
  });

  it('type values are only danger, warning, info, or success', () => {
    const alerts = generateContextualAlerts({
      budget: { pressureRatio: 1.2, freeBudgetEstimate: 100, estimatedIncome: 5000 },
      debt: { overdue: 500 },
      cashflow: { averageNet: 200 },
      healthScore: { score: 80 },
    });
    const validTypes = ['danger', 'warning', 'info', 'success'];
    for (const alert of alerts) {
      assert.ok(validTypes.includes(alert.type), `Invalid type: ${alert.type}`);
    }
  });
});
