import { sortMonthLabels } from './analytics.js';
import { buildTransactionAliasKey } from './display-names.js';
import { inferirCanal } from './transaction-tags.js';

export function buildAutomaticProjectionInputs({
  extratoTransacoes = [],
  extratoSummary = [],
  cardBillSummaries = [],
  recurringCommitments = [],
} = {}) {
  const realSummary = (extratoSummary || []).filter(item => !item?.apenasHistorico);
  const months = sortMonthLabels(realSummary.map(item => item?.mes).filter(Boolean));
  const recentMonths = months.slice(-6);

  const recurringIncome = estimateRecurringIncome(extratoTransacoes, recentMonths);
  const salario = roundMoney(recurringIncome.salary || recurringIncome.primary || 0);
  const rendaExtra = roundMoney(recurringIncome.extra || 0);

  const recentBills = (cardBillSummaries || []).slice(0, 3);
  const itau = roundMoney(average(recentBills.map(item => Number(item?.total || 0))));

  const recurringKeys = new Set(
    (recurringCommitments || [])
      .map(item => buildTransactionAliasKey(item?.desc ?? item?.nome ?? ''))
      .filter(Boolean),
  );
  const outros = estimateOtherSpend(extratoTransacoes, recentMonths, recurringKeys);

  return {
    inputs: {
      salario,
      rendaExtra,
      itau,
      outros,
      meses: 6,
    },
    notes: [
      {
        id: 'salario',
        label: 'Entradas recorrentes',
        value: salario,
        note: recurringIncome.salaryLabel
          ? `Principal origem recorrente detectada: ${recurringIncome.salaryLabel}.`
          : recurringIncome.groups.length
            ? 'Usando a maior entrada recorrente encontrada no histórico.'
            : 'Sem recorrência forte detectada nas entradas.',
      },
      {
        id: 'rendaExtra',
        label: 'Renda extra média',
        value: rendaExtra,
        note: recurringIncome.extraCount
          ? `${recurringIncome.extraCount} outra(s) entrada(s) recorrente(s) elegível(is) entraram como complemento.`
          : 'Sem complemento recorrente suficiente para entrar automaticamente.',
      },
      {
        id: 'itau',
        label: 'Fatura média do cartão',
        value: itau,
        note: recentBills.length
          ? `Média das últimas ${recentBills.length} fatura(s) importada(s).`
          : 'Sem faturas suficientes para estimar cartão.',
      },
      {
        id: 'outros',
        label: 'Saídas variáveis da conta',
        value: outros,
        note: 'Média de saídas da conta sem pagamento de fatura e sem itens já tratados como recorrentes.',
      },
    ],
    diagnostics: {
      monthsAnalyzed: recentMonths.length,
      recurringIncomeCount: recurringIncome.groups.length,
      billCount: recentBills.length,
      recurringIncomeGroups: recurringIncome.groups,
      topVariableCategories: buildTopVariableCategories(extratoTransacoes, recentMonths),
    },
  };
}

function estimateRecurringIncome(extratoTransacoes = [], recentMonths = []) {
  const monthSet = new Set(recentMonths);
  const groups = new Map();

  for (const item of extratoTransacoes || []) {
    if (item?.tipo !== 'entrada') continue;
    const month = String(item?.mes || '').trim();
    if (!month || (monthSet.size && !monthSet.has(month))) continue;

    const key = buildTransactionAliasKey(item?.desc || '');
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        desc: String(item?.desc || '').trim(),
        months: new Map(),
        categories: new Set(),
        channels: new Set(),
      });
    }

    const bucket = groups.get(key);
    bucket.months.set(month, roundMoney((bucket.months.get(month) || 0) + Number(item?.valor || 0)));
    if (item?.cat) bucket.categories.add(String(item.cat));
    bucket.channels.add(inferirCanal(item));
  }

  const recurringGroups = [...groups.values()]
    .map(group => {
      const values = [...group.months.values()];
      const avg = average(values);
      const spread = avg > 0 ? (Math.max(...values) - Math.min(...values)) / avg : 0;
      const categories = [...group.categories];
      const isSalaryCategory = categories.includes('Salário');
      const normalizedDesc = normalizeText(group.desc);
      const incomeKind = classifyIncomeGroup({
        normalizedDesc,
        channels: [...group.channels],
        categories,
      });

      return {
        ...group,
        count: values.length,
        average: roundMoney(avg),
        spread,
        incomeKind,
        isSalaryCategory,
        eligible: isEligibleIncomeGroup({ incomeKind, spread }),
      };
    })
    .filter(group => group.count >= 2 && group.average > 0 && group.eligible)
    .sort((left, right) => right.average - left.average);

  const salaryGroup = recurringGroups.find(group => group.isSalaryCategory || group.incomeKind === 'salary')
    || recurringGroups.find(group => group.incomeKind === 'possible-salary')
    || recurringGroups.find(group => group.incomeKind === 'eligible')
    || null;

  const extraGroups = recurringGroups.filter(group =>
    group !== salaryGroup &&
    (group.incomeKind === 'extra' || group.incomeKind === 'eligible')
  );

  return {
    groups: recurringGroups,
    salary: roundMoney(salaryGroup?.average || 0),
    salaryLabel: salaryGroup?.desc || '',
    primary: roundMoney(recurringGroups[0]?.average || 0),
    extra: roundMoney(extraGroups.reduce((sum, group) => sum + group.average, 0)),
    extraCount: extraGroups.length,
  };
}

function estimateOtherSpend(extratoTransacoes = [], recentMonths = [], recurringKeys = new Set()) {
  const monthSet = new Set(recentMonths);
  const totalsByMonth = new Map();

  for (const item of extratoTransacoes || []) {
    if (item?.tipo !== 'saida') continue;
    if (String(item?.cat || '').trim() === 'Fatura Crédito') continue;

    const month = String(item?.mes || '').trim();
    if (!month || (monthSet.size && !monthSet.has(month))) continue;

    const key = buildTransactionAliasKey(item?.desc || '');
    if (key && recurringKeys.has(key)) continue;
    if (isSelfTransferLike(item)) continue;

    totalsByMonth.set(month, roundMoney((totalsByMonth.get(month) || 0) + Number(item?.valor || 0)));
  }

  return roundMoney(average([...totalsByMonth.values()]));
}

function buildTopVariableCategories(extratoTransacoes = [], recentMonths = []) {
  const monthSet = new Set(recentMonths);
  const totals = new Map();

  for (const item of extratoTransacoes || []) {
    if (item?.tipo !== 'saida') continue;
    if (String(item?.cat || '').trim() === 'Fatura Crédito') continue;
    if (isSelfTransferLike(item)) continue;
    const month = String(item?.mes || '').trim();
    if (!month || (monthSet.size && !monthSet.has(month))) continue;

    const cat = String(item?.cat || 'Outros').trim() || 'Outros';
    totals.set(cat, roundMoney((totals.get(cat) || 0) + Number(item?.valor || 0)));
  }

  return [...totals.entries()]
    .map(([cat, total]) => ({ cat, total }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 4);
}

function classifyIncomeGroup({ normalizedDesc = '', channels = [], categories = [] } = {}) {
  if (categories.includes('Salário') || /\b(salario|salario empresa|folha|proventos)\b/.test(normalizedDesc)) {
    return 'salary';
  }

  if (/\b(ltda|sa|s a|eireli|me|mei|tecnologia|gestao|gestao da informacao|servicos|servicos|solucoes|industria|comercio|holding)\b/.test(normalizedDesc)) {
    return 'possible-salary';
  }

  if (/\b(rendimento|resgate|invest|aplicacao|aplicacao automatica|transferencia|transf|ted|doc)\b/.test(normalizedDesc)) {
    return 'ignore';
  }

  if (channels.includes('transferencia') && !/\b(cliente|freela|aluguel|comissao|comissao|servico)\b/.test(normalizedDesc)) {
    return 'ignore';
  }

  if (/\b(cliente|freela|servico|prestacao|prestacao|aluguel|comissao|comissao)\b/.test(normalizedDesc)) {
    return 'extra';
  }

  if (channels.includes('pix')) return 'possible-salary';
  return 'eligible';
}

function isEligibleIncomeGroup({ incomeKind = '', spread = 0 } = {}) {
  if (incomeKind === 'ignore') return false;
  if (incomeKind === 'extra') return spread <= 0.4;
  return spread <= 0.18;
}

function isSelfTransferLike(item = {}) {
  const desc = normalizeText(item?.desc || '');
  const canal = inferirCanal(item);
  if (/\b(rendimento|resgate|invest|aplicacao)\b/.test(desc)) return true;
  if (canal === 'transferencia' && /\b(conta|transferencia|transf|ted|doc)\b/.test(desc)) return true;
  return false;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function average(values = []) {
  const numbers = values.map(Number).filter(value => Number.isFinite(value) && value >= 0);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
