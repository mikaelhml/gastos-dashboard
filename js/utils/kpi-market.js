import { toNumber, roundMoney, percentage } from './financial-analysis.js';

export function computeMarketKpis({ budget = {}, debt = {}, cashflow = {}, spending = {} } = {}) {
  const income = toNumber(budget.estimatedIncome);
  const totalPlannedSpend = toNumber(budget.totalPlannedSpend);
  const currentBalance = toNumber(cashflow.currentBalance);
  const totalDebt = toNumber(debt.totalExposure);
  const latestMonthSpend = toNumber(spending.latestMonthSpend);

  const netWorth = roundMoney(currentBalance - totalDebt);

  const savingsRate = income > 0
    ? percentage(income - totalPlannedSpend, income)
    : 0;

  const debtToIncome = income > 0
    ? percentage(totalDebt, income * 12)
    : 0;

  const monthlyExpenseBase = totalPlannedSpend > 0 ? totalPlannedSpend : latestMonthSpend;
  const emergencyFundCoverage = monthlyExpenseBase > 0
    ? roundMoney(currentBalance / monthlyExpenseBase)
    : 0;

  const spendingVelocity = latestMonthSpend > 0
    ? roundMoney(latestMonthSpend / 30)
    : 0;

  const cashRunway = monthlyExpenseBase > 0
    ? roundMoney(currentBalance / monthlyExpenseBase)
    : 0;

  return {
    netWorth,
    savingsRate,
    debtToIncome,
    emergencyFundCoverage,
    spendingVelocity,
    cashRunway,
    _partial: true,
  };
}
