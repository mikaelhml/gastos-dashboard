import { toNumber, roundMoney, percentage } from './financial-analysis.js';

export function simulateInstallmentPurchase({ totalValue, installments, monthlyInterestRate = 0 } = {}) {
  const value = toNumber(totalValue);
  const n = toNumber(installments);
  if (value <= 0 || n <= 0) return null;

  const rate = toNumber(monthlyInterestRate);
  let monthlyPayment;

  if (rate <= 0) {
    // Zero interest: simple division
    monthlyPayment = roundMoney(value / n);
  } else {
    // Compound interest: PMT formula
    const r = rate / 100;
    const factor = Math.pow(1 + r, n);
    monthlyPayment = roundMoney(value * (r * factor) / (factor - 1));
  }

  const totalPaid = roundMoney(monthlyPayment * n);
  const totalInterest = roundMoney(totalPaid - value);
  const effectiveRate = value > 0 ? percentage(totalInterest, value) : 0;

  return { monthlyPayment, totalPaid, totalInterest, installments: n, effectiveRate };
}

export function computePurchaseImpact({ monthlyPayment = 0, freeBudgetEstimate = 0, estimatedIncome = 0 } = {}) {
  const payment = toNumber(monthlyPayment);
  const free = toNumber(freeBudgetEstimate);
  const income = toNumber(estimatedIncome);

  const newFreeBalance = roundMoney(free - payment);
  const paymentAsPercentOfFree = free > 0 ? percentage(payment, free) : 0;
  const paymentAsPercentOfIncome = income > 0 ? percentage(payment, income) : 0;
  const viable = free > 0 && payment <= free;

  return { newFreeBalance, paymentAsPercentOfFree, paymentAsPercentOfIncome, viable };
}
