import { fmtCurrency } from './financial-analysis.js';

export function generateContextualAlerts({ budget = {}, debt = {}, spending = {}, cashflow = {}, healthScore = {} } = {}) {
  const alerts = [];
  const income = Number(budget.estimatedIncome) || 0;
  const pressure = Number(budget.pressureRatio) || 0;
  const free = Number(budget.freeBudgetEstimate) || 0;
  const overdue = Number(debt.overdue) || 0;
  const avgNet = Number(cashflow.averageNet) || 0;
  const score = Number(healthScore.score) || 0;

  // Danger alerts (highest priority)
  if (pressure >= 1) {
    alerts.push({ type: 'danger', message: 'Despesas excedem a renda estimada', icon: '\uD83D\uDEA8' });
  }
  if (overdue > 0) {
    alerts.push({ type: 'danger', message: `Divida vencida de ${fmtCurrency(overdue)}`, icon: '\u26A0\uFE0F' });
  }

  // Warning alerts
  if (free > 0 && income > 0 && free < income * 0.1) {
    alerts.push({ type: 'warning', message: 'Margem livre abaixo de 10% da renda', icon: '\uD83D\uDCC9' });
  }

  // Info alerts
  if (score >= 70) {
    alerts.push({ type: 'info', message: 'Saude financeira saudavel', icon: '\uD83D\uDCA1' });
  }

  // Success alerts
  if (avgNet > 0) {
    alerts.push({ type: 'success', message: 'Fluxo de caixa medio positivo', icon: '\u2705' });
  }

  // Priority order: danger, warning, info, success (already in order), max 4
  return alerts.slice(0, 4);
}
