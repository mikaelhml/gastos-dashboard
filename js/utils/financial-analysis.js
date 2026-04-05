export function toNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function roundMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

export function fmtCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function average(values = []) {
  const numbers = values.map(toNumber).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return roundMoney(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

export function percentage(value, total) {
  if (toNumber(total) <= 0) return 0;
  return Number((toNumber(value) / toNumber(total)).toFixed(4));
}

function pickBudgetValue(item = {}) {
  const candidates = [
    item?.valorMensal,
    item?.valor,
    item?.limite,
    item?.orcamento,
    item?.mensal,
  ];

  const hit = candidates.find(value => Number.isFinite(Number(value)) && Number(value) > 0);
  return hit == null ? 0 : roundMoney(hit);
}

function buildBudgetStatus({ estimatedIncome = 0, freeBudgetEstimate = 0, pressureRatio = 0 } = {}) {
  if (estimatedIncome <= 0 && freeBudgetEstimate <= 0) {
    return {
      tone: 'neutral',
      label: 'Sem base suficiente',
      note: 'Importe mais histórico para transformar a leitura em orçamento mensal.',
    };
  }

  if (freeBudgetEstimate < 0 || pressureRatio >= 1) {
    return {
      tone: 'critical',
      label: 'Pressão alta',
      note: 'O cenário-base consome mais do que a renda estimada.',
    };
  }

  if (freeBudgetEstimate <= (estimatedIncome * 0.1) || pressureRatio >= 0.85) {
    return {
      tone: 'attention',
      label: 'Folga curta',
      note: 'Há pouco espaço para variação nas despesas variáveis e na fatura.',
    };
  }

  return {
    tone: 'healthy',
    label: 'Folga positiva',
    note: 'O cenário-base ainda preserva margem após compromissos e variáveis.',
  };
}

function buildCashflow(summaryReal = []) {
  const months = (summaryReal || []).map(item => ({
    mes: String(item?.mes || '').trim(),
    saldoInicial: roundMoney(item?.saldoInicial || 0),
    entradas: roundMoney(item?.entradas || 0),
    saidas: roundMoney(item?.saidas || 0),
    rendimento: roundMoney(item?.rendimento || 0),
    saldoFinal: roundMoney(item?.saldoFinal || 0),
    variacao: roundMoney(item?.variacao ?? ((item?.entradas || 0) + (item?.rendimento || 0) - (item?.saidas || 0))),
  })).filter(item => item.mes);

  const latest = months.at(-1) || null;
  const best = months.slice().sort((left, right) => right.variacao - left.variacao)[0] || null;
  const worst = months.slice().sort((left, right) => left.variacao - right.variacao)[0] || null;

  return {
    months,
    latest,
    best,
    worst,
    averageNet: average(months.map(item => item.variacao)),
    currentBalance: roundMoney(latest?.saldoFinal || 0),
  };
}

function buildDebt(insights = {}, scrProjectionModel = {}) {
  const totalExposure = roundMoney(insights?.exposicaoTotal || 0);
  const overdue = roundMoney(insights?.dividaVencida || 0);
  const creditLimit = roundMoney(insights?.limiteCredito || 0);
  const inGoodStanding = roundMoney(Math.max(totalExposure - overdue, 0));
  const includedProjection = roundMoney(scrProjectionModel?.totals?.includedMonthlyTotal || 0);
  const conflictProjection = roundMoney(scrProjectionModel?.totals?.conflictMonthlyTotal || 0);

  return {
    totalExposure,
    overdue,
    inGoodStanding,
    creditLimit,
    includedProjection,
    conflictProjection,
    shares: {
      overdue: percentage(overdue, totalExposure),
      inGoodStanding: percentage(inGoodStanding, totalExposure),
    },
  };
}

function buildSpending(spendAnalytics = {}) {
  const totalSpend = roundMoney(spendAnalytics?.totalSpend || 0);
  const categoryTotals = spendAnalytics?.categoryTotals || {};
  const monthTotals = spendAnalytics?.monthTotals || {};
  const topCategories = (spendAnalytics?.categories || [])
    .slice(0, 5)
    .map(cat => ({
      cat,
      total: roundMoney(categoryTotals?.[cat] || 0),
      share: percentage(categoryTotals?.[cat] || 0, totalSpend),
    }));

  const latestMonth = String(spendAnalytics?.latestMonth || '').trim();
  const previousMonth = String(spendAnalytics?.previousMonth || '').trim();
  const latestMonthSpend = roundMoney(monthTotals?.[latestMonth] || 0);

  return {
    totalSpend,
    latestMonth,
    previousMonth,
    latestMonthSpend,
    topCategories,
    strongestCategory: topCategories[0] || null,
    movers: (spendAnalytics?.movers || []).slice(0, 3),
    quality: spendAnalytics?.quality || { shouldWarn: false, note: '', outrosShare: 0, outrosTotal: 0 },
  };
}

function buildBudget({
  recurringCommitments = [],
  automaticProjection = {},
  scrProjectionModel = {},
  orcamentos = [],
} = {}) {
  const recurringBase = roundMoney((recurringCommitments || []).reduce((sum, item) => sum + toNumber(item?.valor), 0));
  const inputs = automaticProjection?.inputs || {};
  const estimatedIncome = roundMoney(toNumber(inputs.salario) + toNumber(inputs.rendaExtra));
  const variableSpendEstimate = roundMoney(toNumber(inputs.itau) + toNumber(inputs.outros));
  const includedCreditCommitments = roundMoney(scrProjectionModel?.totals?.includedMonthlyTotal || 0);
  const recurringWithCredit = roundMoney(recurringBase + includedCreditCommitments);
  const totalPlannedSpend = roundMoney(recurringWithCredit + variableSpendEstimate);
  const freeBudgetEstimate = roundMoney(estimatedIncome - totalPlannedSpend);
  const configuredBudgetTotal = roundMoney((orcamentos || []).reduce((sum, item) => sum + pickBudgetValue(item), 0));
  const configuredGap = configuredBudgetTotal > 0
    ? roundMoney(estimatedIncome - configuredBudgetTotal)
    : null;
  const commitmentRatio = percentage(recurringWithCredit, estimatedIncome);
  const pressureRatio = percentage(totalPlannedSpend, estimatedIncome);
  const status = buildBudgetStatus({ estimatedIncome, freeBudgetEstimate, pressureRatio });

  return {
    estimatedIncome,
    recurringBase,
    includedCreditCommitments,
    recurringWithCredit,
    variableSpendEstimate,
    totalPlannedSpend,
    freeBudgetEstimate,
    configuredBudgetTotal,
    configuredGap,
    commitmentRatio,
    pressureRatio,
    status,
  };
}

function buildCoverage({
  summaryReal = [],
  cardBillSummaries = [],
  registratoInsights = {},
  spendAnalytics = {},
} = {}) {
  return {
    monthsInAccountHistory: summaryReal.length,
    cardBillCount: (cardBillSummaries || []).length,
    hasRegistrato: toNumber(registratoInsights?.exposicaoTotal) > 0 || toNumber(registratoInsights?.limiteCredito) > 0,
    categorizedSpendCount: (spendAnalytics?.categories || []).length,
  };
}

function buildHighlights({ budget, debt, spending, cashflow, coverage }) {
  const highlights = [];

  highlights.push({
    tone: budget?.status?.tone || 'neutral',
    title: 'Leitura mensal base',
    message: budget?.estimatedIncome > 0
      ? `A leitura automática aponta renda estimada de ${fmtCurrency(budget.estimatedIncome)} e saldo livre de ${fmtCurrency(budget.freeBudgetEstimate)} após fixos, cartão, variáveis e compromissos extras incluídos.`
      : 'Ainda não há histórico suficiente para estimar a renda mensal de forma confiável.',
  });

  if (debt?.totalExposure > 0) {
    highlights.push({
      tone: debt.overdue > 0 ? 'critical' : 'attention',
      title: 'Endividamento consolidado',
      message: debt.overdue > 0
        ? `Há ${fmtCurrency(debt.overdue)} em dívida vencida dentro de uma exposição total de ${fmtCurrency(debt.totalExposure)}.`
        : `A exposição total no SCR está em ${fmtCurrency(debt.totalExposure)}, com ${fmtCurrency(debt.inGoodStanding)} em dia.`,
    });
  }

  if (spending?.strongestCategory) {
    const sharePct = Math.round((spending.strongestCategory.share || 0) * 100);
    highlights.push({
      tone: sharePct >= 30 ? 'attention' : 'neutral',
      title: 'Maior concentração de gasto',
      message: `${spending.strongestCategory.cat} lidera a amostra com ${fmtCurrency(spending.strongestCategory.total)} (${sharePct}% do gasto analisado).`,
    });
  }

  if (spending?.quality?.shouldWarn) {
    highlights.push({
      tone: 'attention',
      title: 'Qualidade da categorização',
      message: spending.quality.note || 'Parte relevante do gasto ainda está em Outros.',
    });
  }

  if (cashflow?.worst?.mes) {
    highlights.push({
      tone: cashflow.worst.variacao < 0 ? 'attention' : 'neutral',
      title: 'Oscilação do caixa',
      message: `O pior mês observado foi ${cashflow.worst.mes}, com variação de ${fmtCurrency(cashflow.worst.variacao)}. O histórico cobre ${coverage.monthsInAccountHistory} mês(es).`,
    });
  }

  return highlights.slice(0, 4);
}

function buildNarrative({ budget, debt, spending, coverage }) {
  const headline = budget?.status?.tone === 'critical'
    ? 'O orçamento-base está pressionado e precisa de ajuste antes de ampliar compromissos.'
    : budget?.status?.tone === 'attention'
      ? 'O orçamento-base está funcional, mas com pouca margem para novas oscilações.'
      : 'O histórico atual já sustenta uma leitura consolidada de orçamento, dívida e consumo.';

  const bullets = [
    budget?.estimatedIncome > 0
      ? `Comprometimento mensal estimado em ${Math.round((budget.commitmentRatio || 0) * 100)}% da renda antes dos gastos variáveis.`
      : 'A renda recorrente ainda depende de mais histórico para estabilizar a estimativa.',
    debt?.totalExposure > 0
      ? `Registrato contribui com ${fmtCurrency(debt.totalExposure)} de exposição consolidada e ${fmtCurrency(debt.includedProjection)} já entra na projeção quando há evidência suficiente.`
      : 'Sem exposição relevante de SCR suficiente para interferir na leitura base.',
    spending?.strongestCategory
      ? `${spending.strongestCategory.cat} é hoje o principal centro de gasto da amostra categorizada.`
      : 'Ainda não há gasto categorizado suficiente para destacar concentrações.',
    coverage?.cardBillCount > 0
      ? `${coverage.cardBillCount} fatura(s) ajudam a estimar a pressão média do cartão.`
      : 'A pressão média do cartão ainda depende de mais faturas importadas.',
  ];

  return { headline, bullets };
}

function buildSummaryCards({ budget, debt, spending, cashflow }) {
  return [
    {
      id: 'income',
      label: 'Renda estimada/mês',
      value: budget.estimatedIncome,
      tone: 'info',
      sub: budget.estimatedIncome > 0 ? 'Salário recorrente + complementos detectados' : 'Sem recorrência suficiente nas entradas',
    },
    {
      id: 'commitment',
      label: 'Comprometimento base',
      value: budget.recurringWithCredit,
      tone: budget.status.tone,
      sub: `${Math.round((budget.commitmentRatio || 0) * 100)}% da renda antes dos variáveis`,
    },
    {
      id: 'variable',
      label: 'Variáveis estimados',
      value: budget.variableSpendEstimate,
      tone: 'attention',
      sub: 'Fatura média recente + saídas variáveis da conta',
    },
    {
      id: 'free-budget',
      label: 'Saldo livre estimado',
      value: budget.freeBudgetEstimate,
      tone: budget.freeBudgetEstimate >= 0 ? 'healthy' : 'critical',
      sub: cashflow?.latest?.mes ? `Baseado no cenário atual de ${cashflow.latest.mes}` : 'Baseado no histórico importado',
    },
    {
      id: 'debt',
      label: 'Exposição no SCR',
      value: debt.totalExposure,
      tone: debt.overdue > 0 ? 'critical' : 'neutral',
      sub: debt.overdue > 0 ? 'Inclui dívida vencida' : 'Saldo consolidado de crédito',
    },
    {
      id: 'spending-top',
      label: 'Maior categoria',
      value: spending.strongestCategory?.total || 0,
      tone: 'neutral',
      sub: spending.strongestCategory
        ? `${spending.strongestCategory.cat} · ${Math.round((spending.strongestCategory.share || 0) * 100)}% do total`
        : 'Sem categoria dominante ainda',
    },
  ];
}

export function buildHealthScore({ budget = {}, debt = {}, cashflow = {} } = {}) {
  const pressure = toNumber(budget.pressureRatio);
  const free = toNumber(budget.freeBudgetEstimate);
  const income = toNumber(budget.estimatedIncome);
  const totalExposure = toNumber(debt.totalExposure);
  const overdue = toNumber(debt.overdue);
  const avgNet = toNumber(cashflow.averageNet);

  let score = 50;

  // Budget pressure scoring (only when income data exists)
  if (income > 0) {
    if (pressure < 0.7) score += 25;
    else if (pressure < 0.85) score += 15;
    else if (pressure < 1.0) score += 5;
    else score -= 10; // over-budget penalty
  }

  // Debt scoring
  if (totalExposure > 0 || overdue > 0) {
    if (overdue <= 0) score += 15;
    else score -= 15;
  }

  // Cashflow scoring
  if (avgNet > 0) score += 15;
  else if (avgNet < 0 && avgNet > -500) score += 5;

  // Free budget scoring (only when income data exists)
  if (income > 0 && free > income * 0.2) score += 10;
  else if (income > 0 && free > 0) score += 5;

  score = Math.max(0, Math.min(100, score));

  const label = score >= 70 ? 'Saudavel' : score >= 40 ? 'Atencao' : 'Critico';
  const tone = score >= 70 ? 'healthy' : score >= 40 ? 'attention' : 'critical';
  const emoji = score >= 70 ? '💚' : score >= 40 ? '💛' : '❤️';

  return { score, label, emoji, tone };
}

export function buildInstallmentRelief(despesasFixas = []) {
  const parcelas = (despesasFixas || []).filter(
    item => item?.parcelaAtual != null && item?.totalParcelas != null
  );

  if (!parcelas.length) {
    return { activeParcelas: 0, totalMonthly: 0, totalRemaining: 0, reliefDate: null, monthlySavingsAfterRelief: 0 };
  }

  let totalMonthly = 0;
  let totalRemaining = 0;
  let maxRemainingMonths = 0;
  const parcelaDetails = [];

  for (const item of parcelas) {
    const monthly = roundMoney(toNumber(item.valorMensal) || toNumber(item.valor));
    const remaining = Math.max(0, toNumber(item.totalParcelas) - toNumber(item.parcelaAtual));
    totalMonthly += monthly;
    totalRemaining += roundMoney(remaining * monthly);
    parcelaDetails.push({ monthly, remaining });
    if (remaining > maxRemainingMonths) maxRemainingMonths = remaining;
  }

  totalMonthly = roundMoney(totalMonthly);
  totalRemaining = roundMoney(totalRemaining);

  // Compute relief date
  let reliefDate = null;
  if (maxRemainingMonths > 0) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + maxRemainingMonths, 1);
    reliefDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  }

  // Monthly savings after relief = sum of parcelas ending at max remaining
  const monthlySavingsAfterRelief = roundMoney(
    parcelaDetails
      .filter(p => p.remaining === maxRemainingMonths)
      .reduce((sum, p) => sum + p.monthly, 0)
  );

  return { activeParcelas: parcelas.length, totalMonthly, totalRemaining, reliefDate, monthlySavingsAfterRelief };
}

export function buildConsolidatedDebt({ debt = {}, despesasFixas = [] } = {}) {
  const scrExposure = toNumber(debt.totalExposure);
  const overdueAmount = toNumber(debt.overdue);

  const financingItems = (despesasFixas || []).filter(item => {
    const tipo = String(item?.tipo || '').toLowerCase();
    return tipo.includes('financiamento') || tipo.includes('emprestimo');
  });

  const financingTotal = roundMoney(
    financingItems.reduce((sum, item) => {
      const monthly = toNumber(item.valorMensal) || toNumber(item.valor);
      const remaining = Math.max(0, toNumber(item.totalParcelas) - toNumber(item.parcelaAtual));
      return sum + monthly * remaining;
    }, 0)
  );

  return {
    total: roundMoney(scrExposure + financingTotal),
    scrExposure,
    financingTotal,
    overdueAmount,
  };
}

export function buildFinancialAnalysisModel({
  assinaturas = [],
  despesasFixas = [],
  recurringCommitments = [],
  extratoSummary = [],
  orcamentos = [],
  registratoInsights = null,
  cardBillSummaries = [],
  spendAnalytics = null,
  scrProjectionModel = null,
  automaticProjection = null,
} = {}) {
  const summaryReal = (extratoSummary || []).filter(item => !item?.apenasHistorico);
  const budget = buildBudget({
    recurringCommitments: recurringCommitments?.length ? recurringCommitments : [
      ...despesasFixas,
      ...(assinaturas || []).map(item => ({ valor: item?.valor || 0 })),
    ],
    automaticProjection,
    scrProjectionModel,
    orcamentos,
  });
  const debt = buildDebt(registratoInsights || {}, scrProjectionModel || {});
  const spending = buildSpending(spendAnalytics || {});
  const cashflow = buildCashflow(summaryReal);
  const coverage = buildCoverage({
    summaryReal,
    cardBillSummaries,
    registratoInsights: registratoInsights || {},
    spendAnalytics: spendAnalytics || {},
  });
  const highlights = buildHighlights({ budget, debt, spending, cashflow, coverage });
  const narrative = buildNarrative({ budget, debt, spending, coverage });

  return {
    budget,
    debt,
    spending,
    cashflow,
    coverage,
    highlights,
    narrative,
    summaryCards: buildSummaryCards({ budget, debt, spending, cashflow }),
    healthScore: buildHealthScore({ budget, debt, cashflow }),
    installmentRelief: buildInstallmentRelief(despesasFixas),
    consolidatedDebt: buildConsolidatedDebt({ debt, despesasFixas }),
  };
}
