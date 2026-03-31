import { gerarMesesFuturos } from './formatters.js';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const INSTITUTION_DEFS = [
  { id: 'caixa', label: 'Caixa', aliases: ['CAIXA ECONOMICA FEDERAL', 'CAIXA'] },
  { id: 'itau', label: 'Itaú', aliases: ['ITAU UNIBANCO', 'ITAUCARD', 'FINANCEIRA ITAU', 'ITAU'] },
  { id: 'nubank', label: 'Nubank', aliases: ['NU FINANCEIRA', 'NU PAGAMENTOS', 'NUBANK'] },
  { id: 'banco-inter', label: 'Banco Inter', aliases: ['BANCO INTER', 'INTER'] },
  { id: 'banco-do-brasil', label: 'Banco do Brasil', aliases: ['BANCO DO BRASIL', 'BB'] },
];

const PRODUCT_DEFS = [
  {
    id: 'financiamento-habitacional',
    type: 'financiamento',
    label: 'Financiamento habitacional',
    patterns: [/FINANCIAMENTO HABITACIONAL/i, /HABITACAO/i, /HABITACIONAL/i, /SFH/i],
  },
  {
    id: 'credito-pessoal',
    type: 'financiamento',
    label: 'Crédito pessoal',
    patterns: [/CREDITO PESSOAL/i],
  },
  {
    id: 'credito-rotativo',
    type: 'parcelamento',
    label: 'Crédito rotativo',
    patterns: [/CREDITO ROTATIVO/i],
  },
];

export function buildScrProjectionModel({
  despesasFixas = [],
  lancamentos = [],
  extratoTransacoes = [],
  registratoSnapshots = [],
  registratoResumos = [],
  dismissals = [],
} = {}) {
  const signals = extractSignals(registratoSnapshots);
  const recurringGroups = buildRecurringGroups({ lancamentos, extratoTransacoes });
  const dismissedKeys = new Set((dismissals || []).map(item => String(item?.key ?? item).trim()).filter(Boolean));

  const commitments = signals.map(signal => classifySignal({
    signal,
    recurringGroups,
    despesasFixas,
    dismissedKeys,
  }));

  const resumoContext = buildResumoContextCommitment(registratoResumos);
  if (resumoContext) commitments.push(resumoContext);

  return {
    commitments,
    totals: {
      includedMonthlyTotal: roundMoney(sumBy(commitments.filter(item => item.status === 'included'), item => item.projectionImpactMonthly)),
      conflictMonthlyTotal: roundMoney(sumBy(commitments.filter(item => item.status === 'conflict'), item => item.valorMensal)),
      contextualCount: commitments.filter(item => item.status === 'contextual-only').length,
      includedCount: commitments.filter(item => item.status === 'included').length,
      conflictCount: commitments.filter(item => item.status === 'conflict').length,
    },
  };
}

export function buildProjectionSchedule({
  despesasFixas = [],
  includedCommitments = [],
  startMonthLabel,
  nMeses,
} = {}) {
  const horizon = Number.isInteger(Number(nMeses)) && Number(nMeses) > 0 ? Number(nMeses) : 6;
  const baseTotal = roundMoney(sumBy(despesasFixas, item => Number(item?.valor || 0)));
  const meses = gerarMesesFuturos(startMonthLabel || 'Jan/2026', horizon);

  return meses.map(mes => {
    const fixoProgramado = roundMoney(sumBy(despesasFixas, item => scheduledValueForMonth(item, mes)));
    const scrIncluido = roundMoney(sumBy(includedCommitments, item => includedCommitmentValueForMonth(item, mes)));

    return {
      mes,
      fixoBase: baseTotal,
      fixoProgramado,
      scrIncluido,
      totalCompromissosFixos: roundMoney(fixoProgramado + scrIncluido),
    };
  });
}

function classifySignal({ signal, recurringGroups, despesasFixas, dismissedKeys }) {
  const matchingGroups = recurringGroups
    .filter(group => !signal.institutionId || group.institutionId === signal.institutionId)
    .filter(group => group.months.length >= 2)
    .sort(compareGroupsForSignal);

  const preferredGroup = matchingGroups[0] || null;
  const commitmentBase = buildCommitmentBase(signal, preferredGroup);
  const dismissalKey = `projection:${signal.key}:${preferredGroup?.key || 'none'}`;

  if (isSignalDismissed({ signal, preferredGroup, dismissalKey, dismissedKeys })) {
    return {
      ...commitmentBase,
      status: 'contextual-only',
      motivoStatus: 'dismissed',
      confidence: 'baixa',
      projectionImpactMonthly: 0,
    };
  }

  if (!preferredGroup) {
    return {
      ...commitmentBase,
      status: 'contextual-only',
      motivoStatus: 'weak-evidence',
      confidence: 'baixa',
      projectionImpactMonthly: 0,
    };
  }

  const equallyStrongGroups = matchingGroups.filter(group =>
    group.source === preferredGroup.source &&
    group.months.length === preferredGroup.months.length &&
    Math.abs(group.valorMedio - preferredGroup.valorMedio) <= 1
  );
  if (equallyStrongGroups.length > 1) {
    return {
      ...commitmentBase,
      status: 'contextual-only',
      motivoStatus: 'multiple-candidates',
      confidence: 'media',
      projectionImpactMonthly: 0,
    };
  }

  if (preferredGroup.source === 'cartao') {
    return {
      ...commitmentBase,
      status: 'contextual-only',
      motivoStatus: 'card-bucket-risk',
      confidence: preferredGroup.confidence,
      sourceChannel: 'cartao',
      projectionImpactMonthly: 0,
    };
  }

  if (!preferredGroup.isStable || preferredGroup.months.length < 2) {
    return {
      ...commitmentBase,
      status: 'contextual-only',
      motivoStatus: 'weak-evidence',
      confidence: preferredGroup.confidence,
      sourceChannel: preferredGroup.source,
      projectionImpactMonthly: 0,
    };
  }

  const conflictWith = detectManualConflict({
    despesasFixas,
    institutionId: signal.institutionId,
    signalLabel: signal.signalLabel,
    valorMensal: preferredGroup.valorMedio,
  });
  if (conflictWith) {
    return {
      ...commitmentBase,
      status: 'conflict',
      motivoStatus: 'manual-conflict',
      confidence: preferredGroup.confidence,
      sourceChannel: preferredGroup.source,
      conflictWith,
      projectionImpactMonthly: 0,
    };
  }

  return {
    ...commitmentBase,
    status: 'included',
    motivoStatus: 'matched-account-recurring',
    confidence: preferredGroup.confidence,
    sourceChannel: preferredGroup.source,
    projectionImpactMonthly: preferredGroup.valorMedio,
  };
}

function isSignalDismissed({ signal, preferredGroup, dismissalKey, dismissedKeys }) {
  if (!dismissedKeys?.size) return false;

  const candidates = [
    dismissalKey,
    signal?.key,
    preferredGroup?.key ? `registrato:${signal?.key}:${preferredGroup.key}` : '',
  ].filter(Boolean);

  return candidates.some(key => dismissedKeys.has(key));
}

function buildCommitmentBase(signal, group) {
  const valorMensal = roundMoney(group?.valorMedio ?? signal.valorMensal ?? 0);
  const mesesEvidencia = [...new Set([...(signal.months || []), ...(group?.months || [])])].sort(compareMonthLabel);

  return {
    key: `scr:${signal.key}:${group?.key || 'sem-grupo'}`,
    nome: `${signal.signalLabel} — ${signal.institutionLabel}`,
    tipo: signal.type,
    institutionLabel: signal.institutionLabel,
    signalLabel: signal.signalLabel,
    valorMensal,
    origem: group ? 'Registrato + transações' : 'Registrato consolidado',
    confidence: group?.confidence || signal.confidence || 'baixa',
    sourceChannel: group?.source || 'scr-only',
    mesesEvidencia,
    hintParcelas: group?.parcelHint || null,
    conflictWith: null,
    projectionImpactMonthly: 0,
  };
}

function buildResumoContextCommitment(registratoResumos = []) {
  const latest = registratoResumos
    .filter(item => !item?.semRegistros)
    .slice()
    .sort((a, b) => compareMonthLabel(a?.mesLabel || monthRefToLabel(a?.mesRef), b?.mesLabel || monthRefToLabel(b?.mesRef)))
    .at(-1);
  if (!latest) return null;

  const valorMensal = roundMoney(Number(latest?.outrosCompromissos || 0) || calcExposure(latest));
  if (valorMensal <= 0) return null;

  const monthLabel = latest?.mesLabel || monthRefToLabel(latest?.mesRef);

  return {
    key: `resumo:${latest?.mesRef || monthLabel}`,
    nome: 'Exposição consolidada do SCR',
    tipo: 'contexto',
    institutionLabel: 'Registrato',
    signalLabel: 'Resumo consolidado',
    valorMensal,
    status: 'contextual-only',
    motivoStatus: 'aggregated-only',
    origem: 'Registrato consolidado',
    confidence: 'baixa',
    sourceChannel: 'scr-only',
    mesesEvidencia: monthLabel ? [monthLabel] : [],
    hintParcelas: null,
    conflictWith: null,
    projectionImpactMonthly: 0,
  };
}

function extractSignals(registratoSnapshots = []) {
  const signalsByKey = new Map();

  for (const snapshot of registratoSnapshots || []) {
    if (!snapshot || snapshot?.semRegistros) continue;
    const instituicao = String(snapshot?.instituicao || '').trim();
    if (!instituicao || instituicao === 'CONSOLIDADO SCR') continue;

    const institution = resolveInstitution(instituicao) || resolveInstitution((snapshot?.detalheLinhas || []).join(' '));
    const text = [
      instituicao,
      ...(Array.isArray(snapshot?.detalheLinhas) ? snapshot.detalheLinhas : []),
      ...(snapshot?.operacoes || []).flatMap(item => [item?.categoria, item?.subtipo]),
    ].filter(Boolean).join(' ');
    const product = resolveProduct(text);
    if (!institution || !product) continue;

    const key = `${institution.id}:${product.id}`;
    if (!signalsByKey.has(key)) {
      signalsByKey.set(key, {
        key,
        institutionId: institution.id,
        institutionLabel: institution.label,
        signalLabel: product.label,
        type: product.type,
        months: new Set(),
        confidence: 'media',
      });
    }

    const signal = signalsByKey.get(key);
    signal.months.add(snapshot?.mesLabel || monthRefToLabel(snapshot?.mesRef) || '');
  }

  return [...signalsByKey.values()].map(signal => ({
    ...signal,
    months: [...signal.months].filter(Boolean).sort(compareMonthLabel),
  }));
}

function buildRecurringGroups({ lancamentos = [], extratoTransacoes = [] }) {
  const merged = [
    ...(extratoTransacoes || []).map(item => ({
      source: 'conta',
      monthLabel: String(item?.mes || '').trim(),
      desc: String(item?.desc || '').trim(),
      valor: Number(item?.valor || 0),
      tipo: item?.tipo,
    })),
    ...(lancamentos || []).map(item => ({
      source: 'cartao',
      monthLabel: String(item?.fatura || item?.mes || '').trim(),
      desc: String(item?.desc || '').trim(),
      valor: Number(item?.valor || 0),
      parcela: item?.parcela,
    })),
  ];

  const groups = new Map();
  for (const item of merged) {
    if (!item.monthLabel || !item.desc || !Number.isFinite(item.valor) || item.valor <= 0) continue;
    if (item.source === 'conta' && item.tipo && item.tipo !== 'saida') continue;

    const institution = resolveInstitution(item.desc);
    const normalizedMerchant = normalizeMerchant(item.desc);
    const key = `${item.source}:${institution?.id || 'na'}:${normalizedMerchant}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        source: item.source,
        institutionId: institution?.id || '',
        institutionLabel: institution?.label || '',
        merchant: normalizedMerchant,
        months: new Map(),
        parcelHints: [],
      });
    }

    const group = groups.get(key);
    if (!group.months.has(item.monthLabel)) group.months.set(item.monthLabel, []);
    group.months.get(item.monthLabel).push(item);
    const hint = parseParcelHint(item.parcela || item.desc);
    if (hint) group.parcelHints.push(hint);
  }

  return [...groups.values()].map(group => {
    const months = [...group.months.keys()].sort(compareMonthLabel);
    const totals = months.map(month => sumBy(group.months.get(month), item => item.valor));
    const average = totals.length ? sumBy(totals, value => value) / totals.length : 0;
    const min = totals.length ? Math.min(...totals) : 0;
    const max = totals.length ? Math.max(...totals) : 0;
    const sameMonthMultiple = [...group.months.values()].some(items => items.length > 1);

    return {
      ...group,
      months,
      valorMedio: roundMoney(average),
      isStable: totals.length > 0 ? Math.abs(max - min) <= Math.max(10, average * 0.12) : false,
      confidence: months.length >= 3 && !sameMonthMultiple ? 'alta' : months.length >= 2 ? 'media' : 'baixa',
      parcelHint: consolidateParcelHints(group.parcelHints, months, sameMonthMultiple),
    };
  });
}

function detectManualConflict({ despesasFixas = [], institutionId, signalLabel, valorMensal }) {
  const signalText = normalizeText(signalLabel);
  const numericTolerance = Math.max(50, Number(valorMensal || 0) * 0.15);

  return (despesasFixas || []).find(item => {
    const desc = String(item?.desc ?? item?.nome ?? '').trim();
    const normalized = normalizeText(desc);
    const value = Number(item?.valor || 0);
    const institutionMatches = institutionId ? resolveInstitution(desc)?.id === institutionId : false;
    const textMatches = signalText ? normalized.includes(signalText.split(' ')[0]) || normalized.includes(signalText) : false;
    const valueMatches = Number.isFinite(value) && Math.abs(value - Number(valorMensal || 0)) <= numericTolerance;
    const isActive = !item?.parcelas || Number(item?.parcelas?.pagas || 0) < Number(item?.parcelas?.total || 0);
    return isActive && valueMatches && (institutionMatches || textMatches);
  }) || null;
}

function scheduledValueForMonth(item, monthLabel) {
  const value = Number(item?.valor || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!item?.parcelas) return value;
  return isScheduledForMonth(item.parcelas, monthLabel) ? value : 0;
}

function includedCommitmentValueForMonth(item, monthLabel) {
  if (item?.status !== 'included') return 0;
  const value = Number(item?.valorMensal || item?.projectionImpactMonthly || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!item?.hintParcelas) return value;
  return isScheduledForMonth(
    {
      ...item.hintParcelas,
      pagas: item.hintParcelas?.pagas ?? item.hintParcelas?.atual ?? 0,
    },
    monthLabel,
  ) ? value : 0;
}

function isScheduledForMonth(parcelas, monthLabel) {
  const inicio = String(parcelas?.inicio || '').trim();
  const total = Number(parcelas?.total || 0);
  const pagas = Number(parcelas?.pagas ?? parcelas?.atual ?? 0);
  if (!inicio || !Number.isInteger(total) || total <= 0) return false;

  const startLabel = isoMonthToLabel(inicio);
  const installmentNumber = diffMonthLabels(startLabel, monthLabel) + 1;
  if (installmentNumber < 1 || installmentNumber > total) return false;
  return installmentNumber > pagas;
}

function resolveInstitution(value) {
  const normalized = normalizeText(value);
  return INSTITUTION_DEFS.find(inst => inst.aliases.some(alias => normalized.includes(normalizeText(alias)))) || null;
}

function resolveProduct(value) {
  const raw = String(value || '');
  return PRODUCT_DEFS.find(product => product.patterns.some(pattern => pattern.test(raw))) || null;
}

function normalizeMerchant(description) {
  return normalizeText(String(description || '')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')
    .replace(/\bPARC(?:ELA)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]+/gi, ' ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseParcelHint(value) {
  const match = /(\d{1,2})\/(\d{1,2})/.exec(String(value || '').trim());
  if (!match) return null;
  const atual = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(atual) || !Number.isInteger(total) || atual < 1 || total < atual) return null;
  return { atual, total };
}

function consolidateParcelHints(hints, months, sameMonthMultiple) {
  if (!hints.length || sameMonthMultiple) return null;
  const totalSet = new Set(hints.map(item => item.total));
  if (totalSet.size !== 1) return null;

  const atual = hints.reduce((max, item) => Math.max(max, item.atual), 0);
  const total = hints[0].total;
  const latestMonth = months[months.length - 1];
  return {
    atual,
    total,
    inicio: shiftMonthLabel(latestMonth, -(atual - 1)),
  };
}

function compareGroupsForSignal(a, b) {
  if (a.source !== b.source) return a.source === 'conta' ? -1 : 1;
  if (b.months.length !== a.months.length) return b.months.length - a.months.length;
  if (Number(Boolean(b.parcelHint)) !== Number(Boolean(a.parcelHint))) return Number(Boolean(b.parcelHint)) - Number(Boolean(a.parcelHint));
  return b.valorMedio - a.valorMedio;
}

function calcExposure(item) {
  return Number(item?.emDia || 0) + Number(item?.vencida || 0) + Number(item?.outrosCompromissos || 0);
}

function monthRefToLabel(mesRef) {
  const [mes, ano] = String(mesRef || '').split('/');
  const index = Number(mes) - 1;
  if (index < 0 || index >= MONTH_NAMES.length || !ano) return '';
  return `${MONTH_NAMES[index]}/${ano}`;
}

function isoMonthToLabel(value) {
  const [ano, mes] = String(value || '').split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return '';
  return `${MONTH_NAMES[mes - 1]}/${ano}`;
}

function shiftMonthLabel(label, offset) {
  const [mes, ano] = String(label || '').split('/');
  const index = MONTH_NAMES.indexOf(mes);
  if (index < 0 || !ano) return '';

  let monthIndex = index + offset;
  let year = Number(ano);
  while (monthIndex < 0) {
    monthIndex += 12;
    year -= 1;
  }
  while (monthIndex >= 12) {
    monthIndex -= 12;
    year += 1;
  }
  return `${MONTH_NAMES[monthIndex]}/${year}`;
}

function diffMonthLabels(fromLabel, toLabel) {
  return monthLabelToSort(toLabel) - monthLabelToSort(fromLabel);
}

function compareMonthLabel(a, b) {
  return monthLabelToSort(a) - monthLabelToSort(b);
}

function monthLabelToSort(value) {
  const [mes, ano] = String(value || '').split('/');
  const monthIndex = MONTH_NAMES.indexOf(mes);
  if (monthIndex < 0 || !ano) return 0;
  return (Number(ano) * 12) + monthIndex;
}

function sumBy(items, iteratee) {
  return (items || []).reduce((sum, item) => sum + Number(iteratee(item) || 0), 0);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
