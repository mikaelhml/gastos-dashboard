import { calcEndDate } from './formatters.js';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function buildParcelamentoSummary({ despesasFixas = [], lancamentos = [] } = {}) {
  const financiamentosAtivos = (despesasFixas || []).filter(item =>
    item?.parcelas?.tipo === 'financiamento' &&
    Number(item?.parcelas?.total || 0) > Number(item?.parcelas?.pagas || 0)
  );

  const financiamentoEndDates = financiamentosAtivos
    .map(item => calcEndDate(item.parcelas.inicio, Number(item.parcelas.total || 0)))
    .filter(Boolean)
    .sort(compareLocalizedMonthYear);

  const cartaoAtivos = buildCardInstallmentGroups(lancamentos);
  const cartaoEndDates = cartaoAtivos
    .map(item => item.proximoTermino)
    .filter(Boolean)
    .sort(compareLocalizedMonthYear);

  return {
    financiamentos: {
      ativos: financiamentosAtivos.length,
      totalMensal: roundMoney(sumBy(financiamentosAtivos, item => Number(item?.valor || 0))),
      saldoDevedor: roundMoney(sumBy(financiamentosAtivos, item => {
        const restantes = Number(item?.parcelas?.total || 0) - Number(item?.parcelas?.pagas || 0);
        return Math.max(restantes, 0) * Number(item?.valor || 0);
      })),
      proximoTermino: financiamentoEndDates[0] || '—',
    },
    cartaoParcelado: {
      ativos: cartaoAtivos.length,
      totalMensal: roundMoney(sumBy(cartaoAtivos, item => item.valorMensal)),
      saldoRestante: roundMoney(sumBy(cartaoAtivos, item => item.saldoRestante)),
      proximoTermino: cartaoEndDates[0] || '—',
    },
  };
}

function buildCardInstallmentGroups(lancamentos = []) {
  const grouped = new Map();

  for (const item of lancamentos || []) {
    if (!item?.parcela) continue;
    const desc = String(item?.desc || '').trim();
    if (!desc) continue;
    if (!grouped.has(desc)) grouped.set(desc, []);
    grouped.get(desc).push(item);
  }

  return [...grouped.values()]
    .map(items => {
      const latest = items.slice().sort((a, b) => extractInstallmentIndex(b.parcela) - extractInstallmentIndex(a.parcela))[0];
      const { atual, total } = parseParcelas(latest?.parcela);
      const restantes = Math.max(total - atual, 0);
      if (restantes <= 0) return null;

      const endLabel = shiftMonthLabel(String(latest?.fatura || ''), restantes);
      return {
        valorMensal: Number(latest?.valor || 0),
        saldoRestante: roundMoney(restantes * Number(latest?.valor || 0)),
        proximoTermino: labelToLocalizedMonth(endLabel),
      };
    })
    .filter(Boolean);
}

function parseParcelas(value) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(String(value || '').trim());
  if (!match) return { atual: 0, total: 0 };
  return {
    atual: Number(match[1]),
    total: Number(match[2]),
  };
}

function extractInstallmentIndex(value) {
  return parseParcelas(value).atual;
}

function shiftMonthLabel(label, offset) {
  const [mes, ano] = String(label || '').split('/');
  const index = MONTH_NAMES.indexOf(mes);
  if (index < 0 || !ano) return '';

  let monthIndex = index + Number(offset || 0);
  let year = Number(ano);
  while (monthIndex >= 12) {
    monthIndex -= 12;
    year += 1;
  }
  while (monthIndex < 0) {
    monthIndex += 12;
    year -= 1;
  }
  return `${MONTH_NAMES[monthIndex]}/${year}`;
}

function labelToLocalizedMonth(label) {
  const [mes, ano] = String(label || '').split('/');
  const index = MONTH_NAMES.indexOf(mes);
  if (index < 0 || !ano) return '—';
  return new Date(Number(ano), index, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function compareLocalizedMonthYear(a, b) {
  return localizedMonthToSort(a) - localizedMonthToSort(b);
}

function localizedMonthToSort(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s+de\s+(\d{4})/.exec(normalized);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 12 + ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(match[1]);
}

function sumBy(items, iteratee) {
  return (items || []).reduce((sum, item) => sum + Number(iteratee(item) || 0), 0);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
