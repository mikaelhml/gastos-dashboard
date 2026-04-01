const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const QUALITY_WARNING_THRESHOLD = 0.25;

function toNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function monthLabelToKey(label) {
  const [month, year] = String(label ?? '').trim().split('/');
  const monthIndex = MONTH_NAMES.indexOf(month);
  const yearNumber = Number(year);

  if (monthIndex === -1 || !Number.isInteger(yearNumber)) {
    return null;
  }

  return (yearNumber * 100) + (monthIndex + 1);
}

export function sortMonthLabels(labels = []) {
  return unique(labels).sort((left, right) => {
    const leftKey = monthLabelToKey(left) ?? 0;
    const rightKey = monthLabelToKey(right) ?? 0;
    return leftKey - rightKey;
  });
}

export function normalizeAnalyticsTransactions({ lancamentos = [], extratoTransacoes = [] } = {}) {
  const cardRows = lancamentos.map(item => ({
    ...item,
    monthLabel: item?.fatura || item?.mes || '',
    source: item?.source || 'cartao',
  }));

  const accountRows = extratoTransacoes.map(item => ({
    ...item,
    monthLabel: item?.mes || item?.fatura || '',
    source: item?.source || 'conta',
  }));

  return [...cardRows, ...accountRows];
}

export function isSpendTransaction(item) {
  if (!item || item.contextoDerivado) return false;

  const amount = toNumber(item.valor);
  if (amount <= 0) return false;

  if (item.source === 'conta') {
    if (item.tipo !== 'saida') return false;
    if (item.cat === 'Fatura Crédito') return false;
    if (item.cat === 'Transferência própria') return false;
  }

  return true;
}

export function aggregateMonthlyCategoryTotals(input = {}) {
  const items = normalizeAnalyticsTransactions(input).filter(isSpendTransaction);
  const months = sortMonthLabels(items.map(item => item.monthLabel));
  const totalsByMonth = Object.fromEntries(months.map(month => [month, {}]));

  for (const item of items) {
    const month = item.monthLabel;
    const category = String(item.cat || 'Outros').trim() || 'Outros';
    if (!totalsByMonth[month]) totalsByMonth[month] = {};
    totalsByMonth[month][category] = roundMoney((totalsByMonth[month][category] || 0) + toNumber(item.valor));
  }

  const categoryTotals = {};
  for (const month of months) {
    for (const [category, value] of Object.entries(totalsByMonth[month] || {})) {
      categoryTotals[category] = roundMoney((categoryTotals[category] || 0) + value);
    }
  }

  const categories = Object.keys(categoryTotals).sort((left, right) => categoryTotals[right] - categoryTotals[left]);
  const totalSpend = roundMoney(Object.values(categoryTotals).reduce((sum, value) => sum + value, 0));
  const outrosTotal = roundMoney(categoryTotals.Outros || 0);
  const outrosShare = totalSpend > 0 ? Number((outrosTotal / totalSpend).toFixed(4)) : 0;

  return {
    items,
    months,
    categories,
    totalsByMonth,
    categoryTotals,
    totalSpend,
    quality: {
      outrosTotal,
      outrosShare,
      shouldWarn: outrosShare >= QUALITY_WARNING_THRESHOLD,
      note: outrosShare >= QUALITY_WARNING_THRESHOLD
        ? `'Outros' representa ${Math.round(outrosShare * 100)}% do gasto analisado.`
        : '',
    },
  };
}

export function computeMonthOverMonthDeltas({ totalsByMonth = {}, months = [] } = {}) {
  if (!Array.isArray(months) || months.length < 2) {
    return {
      currentMonth: null,
      previousMonth: null,
      movers: [],
    };
  }

  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const categories = new Set([
    ...Object.keys(totalsByMonth[previousMonth] || {}),
    ...Object.keys(totalsByMonth[currentMonth] || {}),
  ]);

  const movers = [...categories]
    .map(category => {
      const previous = roundMoney(totalsByMonth[previousMonth]?.[category] || 0);
      const current = roundMoney(totalsByMonth[currentMonth]?.[category] || 0);
      const delta = roundMoney(current - previous);

      let status = 'flat';
      let note = '';
      let pct = previous > 0 && current > 0 ? Number(((delta / previous) * 100).toFixed(2)) : null;

      if (previous === 0 && current > 0) {
        status = 'new';
        note = 'novo gasto';
        pct = null;
      } else if (previous > 0 && current === 0) {
        status = 'zeroed';
        note = 'zerado';
        pct = null;
      } else if (delta > 0) {
        status = 'up';
      } else if (delta < 0) {
        status = 'down';
      }

      return {
        cat: category,
        previous,
        current,
        delta,
        pct,
        status,
        note,
      };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return {
    currentMonth,
    previousMonth,
    movers,
  };
}

export function buildSpendAnalytics({ lancamentos = [], extratoTransacoes = [] } = {}) {
  const aggregated = aggregateMonthlyCategoryTotals({ lancamentos, extratoTransacoes });
  const { currentMonth, previousMonth, movers } = computeMonthOverMonthDeltas({
    totalsByMonth: aggregated.totalsByMonth,
    months: aggregated.months,
  });

  const trendDatasets = aggregated.categories.map((category, index) => ({
    label: category,
    data: aggregated.months.map(month => roundMoney(aggregated.totalsByMonth[month]?.[category] || 0)),
    colorIndex: index,
  }));

  return {
    months: aggregated.months,
    categories: aggregated.categories,
    totalsByMonth: aggregated.totalsByMonth,
    trendDatasets,
    latestMonth: currentMonth,
    previousMonth,
    movers,
    quality: aggregated.quality,
    totalSpend: aggregated.totalSpend,
  };
}
