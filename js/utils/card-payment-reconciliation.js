import { inferirCanal } from './transaction-tags.js';
import { monthLabelToKey } from './analytics.js';

const PAYMENT_CHANNELS = new Set(['pix', 'transferencia', 'boleto']);
const PAYMENT_HINT_RE = /\b(fatura|itaucard|itau card|uniclass|visa|mastercard|credito|cr[eé]dito|cartao|cart[aã]o|azul|infinite)\b/i;

export function reconcileAccountCardPayments(extratoTransacoes = [], cardBillSummaries = []) {
  const bills = normalizeBills(cardBillSummaries);
  if (!bills.length) return (extratoTransacoes || []).map(item => ({ ...item }));

  return (extratoTransacoes || []).map(item => {
    const match = findMatchingCardBillPayment(item, bills);
    if (!match) return { ...item };

    return {
      ...item,
      cat: 'Fatura Crédito',
      reconciledAsCardBillPayment: true,
      matchedCardBillLabel: match.fatura,
      matchedCardBillAmount: match.total,
      matchedCardBillDelta: match.delta,
    };
  });
}

export function findMatchingCardBillPayment(item = {}, bills = []) {
  if (item?.tipo !== 'saida') return null;

  const valor = Number(item?.valor || 0);
  if (!Number.isFinite(valor) || valor <= 0) return null;

  const existingCategory = String(item?.cat || '').trim();
  if (existingCategory === 'Fatura Crédito') {
    return findNearestBillByAmount(item, bills);
  }

  const channel = inferirCanal(item);
  const desc = String(item?.desc || '').trim();
  const hintedPayment = PAYMENT_CHANNELS.has(channel) || PAYMENT_HINT_RE.test(desc);
  if (!hintedPayment) return null;

  const match = findNearestBillByAmount(item, bills);
  if (!match) return null;

  const hasBillHint = PAYMENT_HINT_RE.test(desc);
  const permissiveTolerance = hasBillHint ? 2 : 0.2;
  if (match.delta > permissiveTolerance) return null;
  return match;
}

function findNearestBillByAmount(item = {}, bills = []) {
  const valor = Number(item?.valor || 0);
  const monthKey = monthLabelToKey(item?.mes);
  const candidates = bills
    .filter(bill => Number.isFinite(bill.total) && bill.total > 0)
    .map(bill => ({
      ...bill,
      delta: roundMoney(Math.abs(bill.total - valor)),
      monthDistance: computeMonthDistance(monthKey, bill.monthKey),
    }))
    .filter(bill => bill.monthDistance <= 1)
    .sort((left, right) => {
      if (left.delta !== right.delta) return left.delta - right.delta;
      return left.monthDistance - right.monthDistance;
    });

  return candidates[0] || null;
}

function normalizeBills(cardBillSummaries = []) {
  return (cardBillSummaries || [])
    .map(item => ({
      fatura: String(item?.fatura || '').trim(),
      total: roundMoney(Number(item?.total || 0)),
      monthKey: monthLabelToKey(item?.fatura),
    }))
    .filter(item => item.fatura && Number.isFinite(item.total) && item.total > 0 && item.monthKey !== null);
}

function computeMonthDistance(leftKey, rightKey) {
  if (!Number.isInteger(leftKey) || !Number.isInteger(rightKey)) return 999;
  const leftYear = Math.floor(leftKey / 100);
  const leftMonth = leftKey % 100;
  const rightYear = Math.floor(rightKey / 100);
  const rightMonth = rightKey % 100;
  return Math.abs((leftYear * 12 + leftMonth) - (rightYear * 12 + rightMonth));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
