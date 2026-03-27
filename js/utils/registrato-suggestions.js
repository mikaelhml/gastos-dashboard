import { putItem, addItem } from '../db.js';

const INSTITUTION_DEFS = [
  { id: 'caixa', label: 'Caixa', aliases: ['CAIXA ECONOMICA FEDERAL', 'CAIXA'], defaultCat: 'Moradia' },
  { id: 'itau', label: 'Itaú', aliases: ['ITAU UNIBANCO', 'ITAUCARD', 'FINANCEIRA ITAU', 'ITAU'], defaultCat: 'Financeiro' },
  { id: 'nubank', label: 'Nubank', aliases: ['NU FINANCEIRA', 'NU PAGAMENTOS', 'NUBANK'], defaultCat: 'Financeiro' },
  { id: 'banco-inter', label: 'Banco Inter', aliases: ['BANCO INTER', 'INTER'], defaultCat: 'Financeiro' },
  { id: 'banco-do-brasil', label: 'Banco do Brasil', aliases: ['BANCO DO BRASIL', 'BB'], defaultCat: 'Financeiro' },
];

const PRODUCT_DEFS = [
  { id: 'financiamento-habitacional', type: 'financiamento', label: 'Financiamento habitacional', category: 'Moradia', patterns: [/FINANCIAMENTO HABITACIONAL/i, /SFH/i] },
  { id: 'credito-pessoal', type: 'financiamento', label: 'Crédito pessoal', category: 'Financeiro', patterns: [/CREDITO PESSOAL/i] },
  { id: 'credito-rotativo', type: 'parcelamento', label: 'Crédito rotativo', category: 'Financeiro', patterns: [/CREDITO ROTATIVO/i] },
];

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const SUGGESTION_STORE = 'registrato_sugestoes_dispensa';

export function buildRegistratoSuggestions({
  despesasFixas = [],
  assinaturas = [],
  lancamentos = [],
  extratoTransacoes = [],
  registratoSnapshots = [],
  registratoResumos = [],
  dismissals = [],
}) {
  const existingNames = new Set([
    ...despesasFixas.map(item => normalizeText(item?.desc ?? item?.nome)),
    ...assinaturas.map(item => normalizeText(item?.nome)),
  ].filter(Boolean));
  const dismissedKeys = new Set((dismissals || []).map(item => String(item?.key ?? '').trim()).filter(Boolean));

  const signals = extrairSinaisRegistrato(registratoSnapshots, registratoResumos);
  const recurringGroups = agruparTransacoesRecorrentes(lancamentos, extratoTransacoes, existingNames);
  const suggestions = [];
  const consumedGroups = new Set();

  for (const signal of signals) {
    const candidate = escolherGrupoParaSignal(signal, recurringGroups);
    if (!candidate) continue;
    consumedGroups.add(candidate.key);

    suggestions.push(criarSugestao({
      key: `registrato:${signal.key}:${candidate.key}`,
      tipo: signal.type,
      nome: montarNomeSugestao(signal, candidate),
      cat: signal.category || candidate.cat || 'Financeiro',
      valor: candidate.valorMedio,
      confianca: calcularConfiancaFinanciamento(signal, candidate),
      justificativa: `${signal.label} identificado no Registrato e recorrência encontrada em ${candidate.months.length} mes(es).`,
      origem: 'Registrato + transações',
      institutionLabel: signal.institutionLabel,
      signalLabel: signal.label,
      meses: candidate.months,
      repeticoesNoMesmoMes: candidate.sameMonthMultiple,
      hintParcelas: candidate.parcelHint,
      matchedInstitutionId: candidate.matchedInstitution?.id || signal.institutionId,
    }));
  }

  for (const group of recurringGroups) {
    if (consumedGroups.has(group.key)) continue;

    if (group.parcelHint && !group.sameMonthMultiple && group.months.length >= 2) {
      suggestions.push(criarSugestao({
        key: `parcelamento:${group.key}`,
        tipo: 'parcelamento',
        nome: group.prettyName,
        cat: group.cat || 'Outros',
        valor: group.valorMedio,
        confianca: group.months.length >= 3 ? 'alta' : 'media',
        justificativa: `Padrao de parcela ${group.parcelHint.label} detectado em ${group.months.length} mes(es).`,
        origem: 'Transações recorrentes',
        institutionLabel: group.matchedInstitution?.label || '',
        signalLabel: group.parcelHint.label,
        meses: group.months,
        repeticoesNoMesmoMes: false,
        hintParcelas: group.parcelHint,
        matchedInstitutionId: group.matchedInstitution?.id || '',
      }));
      continue;
    }

    if (group.months.length >= 2 && group.isStable && !group.sameMonthMultiple) {
      suggestions.push(criarSugestao({
        key: `despesa:${group.key}`,
        tipo: 'despesa',
        nome: group.prettyName,
        cat: group.cat || 'Outros',
        valor: group.valorMedio,
        confianca: group.months.length >= 3 ? 'alta' : 'media',
        justificativa: `Mesmo estabelecimento e valor recorrente em ${group.months.length} mes(es).`,
        origem: 'Transações recorrentes',
        institutionLabel: group.matchedInstitution?.label || '',
        signalLabel: '',
        meses: group.months,
        repeticoesNoMesmoMes: false,
        hintParcelas: null,
        matchedInstitutionId: group.matchedInstitution?.id || '',
      }));
    }
  }

  return suggestions
    .filter(item => !dismissedKeys.has(item.key))
    .filter(item => Number.isFinite(item.valor) && item.valor > 0)
    .sort((a, b) => {
      const score = confidenceScore(b.confianca) - confidenceScore(a.confianca);
      if (score !== 0) return score;
      if (b.meses.length !== a.meses.length) return b.meses.length - a.meses.length;
      return b.valor - a.valor;
    });
}

export async function acceptRegistratoSuggestion(suggestion) {
  const obsBase = `Sugerido pelo motor Registrato (${suggestion.origem})`;
  const payload = {
    nome: suggestion.nome,
    desc: suggestion.nome,
    cat: suggestion.cat,
    valor: suggestion.valor,
    obs: `${obsBase} — ${suggestion.justificativa}`,
    recorrencia: suggestion.tipo === 'despesa' ? 'fixa' : 'fixa',
    origem_sugestao: 'registrato',
  };

  if (suggestion.tipo === 'parcelamento' || suggestion.tipo === 'financiamento') {
    const hint = suggestion.hintParcelas || inferirParcelasDefault(suggestion);
    payload.parcelas = {
      tipo: suggestion.tipo === 'financiamento' ? 'financiamento' : 'parcelamento',
      label: suggestion.tipo === 'financiamento' ? 'Financiamento' : 'Parcelamento',
      pagas: hint.atual,
      total: hint.total,
      inicio: hint.inicio,
    };
  }

  await addItem('despesas_fixas', payload);
  await putItem(SUGGESTION_STORE, {
    key: suggestion.key,
    nome: suggestion.nome,
    motivo: 'accepted',
    registradoEm: new Date().toISOString(),
  });
}

export async function dismissRegistratoSuggestion(suggestion) {
  await putItem(SUGGESTION_STORE, {
    key: suggestion.key,
    nome: suggestion.nome,
    motivo: 'dismissed',
    registradoEm: new Date().toISOString(),
  });
}

export function computeRegistratoInsights(registratoResumos = [], suggestions = []) {
  const latest = registratoResumos
    .slice()
    .sort((a, b) => compareMonthLabel(a?.mesLabel || a?.mesRef || '', b?.mesLabel || b?.mesRef || ''))
    .at(-1);

  return {
    latest,
    exposicaoTotal: Number(latest?.emDia || 0) + Number(latest?.vencida || 0) + Number(latest?.outrosCompromissos || 0),
    dividaVencida: Number(latest?.vencida || 0),
    limiteCredito: Number(latest?.limite || 0),
    sugestoesPendentes: suggestions.length,
    financiamentoMensalSugerido: roundMoney(
      suggestions
        .filter(item => item.tipo === 'financiamento' || item.tipo === 'parcelamento')
        .reduce((sum, item) => sum + Number(item.valor || 0), 0),
    ),
  };
}

function criarSugestao(base) {
  const riscoRecorrencia = base.repeticoesNoMesmoMes ? 'Compras repetidas no mesmo mes reduzem a confianca em parcelamento.' : '';
  return {
    ...base,
    observacaoRisco: riscoRecorrencia,
  };
}

function extrairSinaisRegistrato(snapshots, resumos) {
  const byKey = new Map();
  const sources = snapshots.length > 0 ? snapshots : resumos;

  for (const item of sources) {
    const raw = (item?.detalheLinhas || []).join(' ') || item?.rawText || '';
    const text = normalizeText(raw);
    if (!text) continue;

    for (const institution of INSTITUTION_DEFS) {
      if (!institution.aliases.some(alias => text.includes(normalizeText(alias)))) continue;

      for (const product of PRODUCT_DEFS) {
        if (!product.patterns.some(pattern => pattern.test(raw))) continue;

        const key = `${institution.id}:${product.id}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            institutionId: institution.id,
            institutionLabel: institution.label,
            label: product.label,
            type: product.type,
            category: product.category || institution.defaultCat,
            months: new Set(),
          });
        }

        byKey.get(key).months.add(item?.mesLabel || item?.mesRef || '');
      }
    }
  }

  return [...byKey.values()]
    .map(item => ({ ...item, months: [...item.months].filter(Boolean).sort(compareMonthLabel) }))
    .filter(item => item.months.length > 0);
}

function agruparTransacoesRecorrentes(lancamentos, extratoTransacoes, existingNames) {
  const merged = [
    ...(lancamentos || []).map(item => ({ ...item, source: 'cartao' })),
    ...(extratoTransacoes || []).map(item => ({ ...item, source: 'conta', fatura: item.mes })),
  ];
  const groups = new Map();

  for (const item of merged) {
    if (item?.tipo === 'entrada') continue;
    if (item?.tipo_classificado) continue;
    if (!Number.isFinite(Number(item?.valor)) || Number(item?.valor) <= 0) continue;

    const month = String(item?.fatura ?? item?.mes ?? '').trim();
    const rawDesc = String(item?.desc ?? '').trim();
    if (!month || !rawDesc) continue;

    const merchant = normalizeMerchant(rawDesc);
    if (!merchant || merchant.length < 3) continue;
    if (existingNames.has(merchant)) continue;

    const key = `${merchant}|${resolveInstitutionId(rawDesc) || 'na'}|${item.source}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        merchant,
        prettyName: toTitleCase(removerSufixoParcela(rawDesc)),
        cat: String(item?.cat ?? '').trim() || inferirCategoriaPorDescricao(rawDesc),
        byMonth: new Map(),
        matchedInstitution: resolveInstitution(rawDesc),
        source: item.source,
      });
    }

    const group = groups.get(key);
    if (!group.byMonth.has(month)) group.byMonth.set(month, []);
    group.byMonth.get(month).push(item);
  }

  return [...groups.values()]
    .map(group => {
      const months = [...group.byMonth.keys()].sort(compareMonthLabel);
      const occurrences = [...group.byMonth.values()].flat();
      const monthTotals = months.map(month => group.byMonth.get(month).reduce((sum, item) => sum + Number(item.valor), 0));
      const avg = monthTotals.reduce((sum, value) => sum + value, 0) / Math.max(monthTotals.length, 1);
      const min = Math.min(...monthTotals);
      const max = Math.max(...monthTotals);
      const parcelHints = occurrences.map(extractParcelHint).filter(Boolean);
      const sameMonthMultiple = [...group.byMonth.values()].some(items => items.length > 1);

      return {
        ...group,
        months,
        monthTotals,
        valorMedio: roundMoney(avg),
        sameMonthMultiple,
        isStable: monthTotals.length > 0 ? Math.abs(max - min) <= Math.max(3, avg * 0.06) : false,
        parcelHint: consolidateParcelHints(parcelHints, months, sameMonthMultiple),
      };
    })
    .filter(group => group.months.length >= 2);
}

function escolherGrupoParaSignal(signal, groups) {
  const candidates = groups
    .filter(group => group.matchedInstitution?.id === signal.institutionId)
    .filter(group => group.months.length >= 2)
    .filter(group => !group.sameMonthMultiple || group.parcelHint);

  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    if (b.months.length !== a.months.length) return b.months.length - a.months.length;
    if (Number(Boolean(b.parcelHint)) !== Number(Boolean(a.parcelHint))) return Number(Boolean(b.parcelHint)) - Number(Boolean(a.parcelHint));
    return b.valorMedio - a.valorMedio;
  })[0];
}

function montarNomeSugestao(signal, candidate) {
  return signal.type === 'financiamento'
    ? `${signal.label} — ${signal.institutionLabel}`
    : candidate.prettyName;
}

function calcularConfiancaFinanciamento(signal, candidate) {
  if (candidate.sameMonthMultiple && !candidate.parcelHint) return 'baixa';
  if (candidate.parcelHint && candidate.months.length >= 3) return 'alta';
  if (signal.months.length >= 3 && candidate.months.length >= 2) return 'alta';
  return 'media';
}

function extractParcelHint(item) {
  const direct = parseParcelPattern(item?.parcela);
  if (direct) return direct;
  return parseParcelPattern(String(item?.desc ?? '').match(/(\d{1,2}\/\d{1,2})\s*$/)?.[1] ?? '');
}

function consolidateParcelHints(hints, months, sameMonthMultiple) {
  if (hints.length === 0 || sameMonthMultiple) return null;
  const totalSet = new Set(hints.map(item => item.total));
  if (totalSet.size !== 1) return null;

  const highestCurrent = hints.reduce((max, item) => Math.max(max, item.atual), 0);
  const total = hints[0].total;
  const latestMonth = months[months.length - 1];
  const inicio = latestMonth ? shiftMonthLabel(latestMonth, -(highestCurrent - 1)) : '';

  return { atual: highestCurrent, total, inicio, label: `${highestCurrent}/${total}` };
}

function parseParcelPattern(value) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const atual = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(atual) || !Number.isInteger(total) || atual < 1 || total < atual) return null;
  return { atual, total };
}

function inferirParcelasDefault(suggestion) {
  const meses = Math.max(suggestion?.meses?.length || 1, 1);
  const total = suggestion.tipo === 'financiamento' ? Math.max(24, meses * 12) : Math.max(6, meses * 2);
  const atual = Math.max(1, meses);
  const latestMonth = suggestion?.meses?.[suggestion.meses.length - 1] || '';
  return {
    atual,
    total,
    inicio: latestMonth ? shiftMonthLabel(latestMonth, -(atual - 1)) : '',
  };
}

function resolveInstitution(description) {
  const normalized = normalizeText(description);
  return INSTITUTION_DEFS.find(inst => inst.aliases.some(alias => normalized.includes(normalizeText(alias)))) || null;
}

function resolveInstitutionId(description) {
  return resolveInstitution(description)?.id || '';
}

function removerSufixoParcela(description) {
  return String(description ?? '').replace(/\s+\d{1,2}\/\d{1,2}\s*$/u, '').trim();
}

function normalizeMerchant(description) {
  return normalizeText(removerSufixoParcela(description))
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferirCategoriaPorDescricao(description) {
  const normalized = normalizeText(description);
  if (normalized.includes('CAIXA') || normalized.includes('ALUGUEL') || normalized.includes('CONDOMINIO')) return 'Moradia';
  if (normalized.includes('FIES') || normalized.includes('UNIVERSIDADE') || normalized.includes('ESCOLA')) return 'Educação';
  if (normalized.includes('CLARO') || normalized.includes('VIVO') || normalized.includes('TIM') || normalized.includes('INTERNET')) return 'Telecom';
  if (normalized.includes('ITAU') || normalized.includes('NUBANK') || normalized.includes('BANCO')) return 'Financeiro';
  return 'Outros';
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value) {
  return String(value ?? '')
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1))
    .join(' ');
}

function compareMonthLabel(a, b) {
  return monthToSort(a) - monthToSort(b);
}

function monthToSort(label) {
  const [mes, ano] = String(label ?? '').split('/');
  const idx = MONTH_NAMES.indexOf(mes);
  return (Number(ano) * 100) + idx;
}

function shiftMonthLabel(label, offset) {
  const [mes, ano] = String(label ?? '').split('/');
  const idx = MONTH_NAMES.indexOf(mes);
  if (idx < 0) return '';
  const date = new Date(Number(ano), idx + offset, 1);
  return `${MONTH_NAMES[date.getMonth()]}/${date.getFullYear()}`;
}

function confidenceScore(value) {
  if (value === 'alta') return 3;
  if (value === 'media') return 2;
  return 1;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
