import { addItem, getAll, bulkAdd, deleteItem } from '../db.js';
import { inferirCanal } from '../utils/transaction-tags.js';
import { applyCategorizationToImportedRows, buildCategorizationRuntime } from '../utils/categorization-engine.js';
import {
  buildImportQuality,
  buildLancamentoFingerprint,
  dedupeImportedLancamentos,
  planScopedReplacement,
} from '../utils/import-integrity.js';
import { computeHash, extrairEstruturaPDF, extrairParcelaFinal, parseBRL, MESES_ABREV } from './pdf-utils.js';

// Aceita prefixo de ícone (contactless, débito, etc.) antes da data
const RE_DATA_SLASH = /^\d{2}\/\d{2}(?:\/\d{4})?$/;
const RE_DATA_PREFIX = /^[^\d]*\d{2}\/\d{2}(?:\/\d{4})?(?:\s|$)/;
const RE_VALOR_ITEM = /^-?[\d.]{1,10},\d{2}$/;
const RE_TRANSACAO = /^[^\d]*(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+(-?[\d.]{1,10},\d{2})$/;
const RE_DESC_INVALIDA = /^-?[\d.]{1,10},\d{2}$/;
const ITAU_FATURA_PROFILE = {
  DOMESTIC_CLASSIC: 'itau-domestico-classico',
  DOMESTIC_MULTICARD: 'itau-domestico-multicartao',
  INTERNATIONAL_BLACK: 'itau-internacional-black',
};
const SOURCE_KEY = 'itau-fatura';

const SECTION_PATTERNS = {
  purchases: ['LANCAMENTOS COMPRAS E SAQUES'],
  services: ['LANCAMENTOS PRODUTOS SERVICOS', 'LANCAMENTOS PRODUTOS E SERVICOS'],
  international: ['LANCAMENTOS INTERNACIONAIS'],
  // installments encerra a seção de compras (esses lançamentos são de faturas futuras)
  installments: ['COMPRAS PARCELADAS', 'PROXIMAS FATURAS', 'PROXIMA FATURA'],
  payments: ['PAGAMENTO EFETUADO', 'PAGAMENTOS EFETUADOS', 'TOTAL DOS PAGAMENTOS', 'PAGAMENTO VIA CONTA'],
  // Linhas puladas sem mudar a seção — nunca usar como STOP global
  // (linhas de encargos/juros/limite podem aparecer na coluna oposta às compras)
  ignore: [
    'RESUMO DA FATURA',
    'TOTAL DA FATURA',
    'SALDO FINANCIADO',
    'VENCIMENTO',
    'EMISSAO',
    'POSTAGEM',
    'PREVISAO',
    'TITULAR',
    'CARTAO',
    'PAGAMENTO MINIMO',
    'PARCELAS FIXAS',
    'ENCARGOS',
    'JUROS',
    'IOF',
    'LIMITE',
    'ESTAMOS LHE ENVIANDO',
    'OUTRA VIA',
    'CASO VOC',
    'PAGAMENTO OBRIGATORIO',
    'CONSULTE OUTRAS OPCOES',
    'ANUIDADE DIFERENCIADA',
    'LANCAMENTOS NACIONAIS',
    'LANCAMENTOS INTERNACIONAIS',
    'TOTAL TRANSACOES INTER',
    'TOTAL LANCAMENTOS INTER',
    'REPASSE DE IOF',
    'DOLAR DE CONVERSAO',
    'TOTAL DOS LANCAMENTOS',
    'FIQUE ATENTO',
    'SIMULACAO',
    'LIMITES DE CREDITO',
  ],
};

export function pareceFaturaItauPorNome(fileName) {
  const upper = String(fileName ?? '').toUpperCase();
  return upper.includes('ITAU') || upper.includes('VISA') || upper.startsWith('FATURA_');
}

export async function importarItauFatura(file, onProgress = () => {}) {
  onProgress(5);

  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo PDF.'));
    reader.readAsArrayBuffer(file);
  });

  onProgress(10);

  const hash = await computeHash(buffer);
  const pdfsImportados = await getAll('pdfs_importados');
  if (pdfsImportados.some(p => p.hash === hash)) {
    return { importado: 0, duplicata: true, mes: '', warnings: [] };
  }

  onProgress(30);
  const { paginas, grupos, linhas: linhasRaw } = await extrairEstruturaPDF(buffer, 3);
  const linhasColunadas = montarLinhasColunadas(paginas);
  const linhas = linhasColunadas.flatMap(linha => [linha.left, linha.right].filter(Boolean));
  onProgress(50);

  const emissor = detectarEmissorItau(linhas);
  if (!emissor) {
    return {
      importado: 0,
      duplicata: false,
      mes: '',
      warnings: [],
      erro: 'Este PDF de fatura não foi reconhecido como Itaú/Visa. O layout atual não é suportado pelo parser Itaú.',
    };
  }

  const mesFatura = extrairMesFaturaItau(linhas);
  const profile = detectarPerfilFaturaItau(linhas);
  const rawLancamentos = parsearLancamentosItau(linhasColunadas, grupos, linhasRaw, paginas, mesFatura, profile);
  const [rules, memories] = await Promise.all([
    getAll('categorizacao_regras'),
    getAll('categorizacao_memoria'),
  ]);
  const categorizationRuntime = buildCategorizationRuntime({ rules, memories });
  const lancamentos = applyCategorizationToImportedRows(
    rawLancamentos,
    categorizationRuntime,
    { source: 'cartao', direction: 'saida' },
  );
  console.log(
    `[itau-fatura] "${file.name}": ${lancamentos.length} lançamentos, fatura=${mesFatura || 'não identificada'}, perfil=${profile}`
  );

  if (lancamentos.length === 0) {
    if (isFaturaSemLancamentos(linhas)) {
      onProgress(100);
      return { importado: 0, duplicata: false, mes: mesFatura || '', warnings: [] };
    }
    const amostra = linhas.slice(0, 30).join('\n');
    console.error('[itau-fatura] Nenhum lançamento. Primeiras 30 linhas:\n', amostra);
    return {
      importado: 0,
      duplicata: false,
      mes: mesFatura || '',
      warnings: [],
      erro: `Nenhum lançamento encontrado em "${file.name}". Verifique o console (F12) para ver o texto extraído.`,
      debug: amostra,
    };
  }

  if (!mesFatura) {
    const amostra = linhas.slice(0, 30).join('\n');
    console.error('[itau-fatura] Cabeçalho da fatura não reconhecido. Primeiras 30 linhas:\n', amostra);
    return {
      importado: 0,
      duplicata: false,
      mes: '',
      warnings: [],
      erro: `Não foi possível identificar o mês da fatura em "${file.name}". Verifique o console (F12).`,
      debug: amostra,
    };
  }

  onProgress(75);

  const incomingItems = lancamentos.map(item => ({
    ...item,
    fatura: mesFatura,
    importSource: SOURCE_KEY,
    importPeriodKey: mesFatura,
    importFingerprint: buildLancamentoFingerprint({
      ...item,
      fatura: mesFatura,
      importSource: SOURCE_KEY,
    }),
  }));

  const dedupeResult = dedupeImportedLancamentos(incomingItems);
  const todos = await getAll('lancamentos');
  const replacementPlan = planScopedReplacement({
    existingItems: todos,
    incomingItems: dedupeResult.uniqueItems,
    sourceKey: SOURCE_KEY,
    periodKey: mesFatura,
  });

  for (const id of replacementPlan.deleteIds) {
    await deleteItem('lancamentos', id);
  }

  await bulkAdd('lancamentos', dedupeResult.uniqueItems);

  onProgress(85);

  await addItem('pdfs_importados', {
    hash,
    nome: file.name,
    tamanho: file.size,
    importadoEm: new Date().toISOString(),
    transacoes: dedupeResult.uniqueItems.length,
    mes: mesFatura,
    tipo: 'fatura-itau',
  });

  onProgress(100);
  const warnings = [
    ...dedupeResult.warnings,
    ...replacementPlan.warnings,
  ];

  return {
    importado: dedupeResult.uniqueItems.length,
    duplicata: false,
    mes: mesFatura,
    quality: buildImportQuality({
      importedCount: dedupeResult.uniqueItems.length,
      duplicateCount: dedupeResult.duplicateCount,
      warningCount: warnings.length,
      unitLabel: 'transação',
    }),
    warnings,
  };
}

function montarLinhasColunadas(paginas) {
  const linhas = [];

  for (const pagina of paginas) {
    const estrutura = montarEstruturaPaginaColunas(pagina);

    for (const row of estrutura.fullWidthRows) {
      linhas.push({
        page: pagina.page,
        y: row.y,
        left: row.raw,
        right: '',
      });
    }

    for (const row of estrutura.leftRows) {
      linhas.push({
        page: pagina.page,
        y: row.y,
        left: row.raw,
        right: '',
      });
    }

    for (const row of estrutura.rightRows) {
      linhas.push({
        page: pagina.page,
        y: row.y,
        left: '',
        right: row.raw,
      });
    }
  }

  return linhas.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.y !== b.y) return b.y - a.y;
    return Number(Boolean(b.left)) - Number(Boolean(a.left));
  });
}

function montarEstruturaPaginaColunas(pagina) {
  const items = pagina.items ?? [];
  if (!items.length) {
    return { columnSplit: 280, fullWidthRows: [], leftRows: [], rightRows: [] };
  }

  const columnSplit = detectarColumnSplit(items);
  const leftItems = items.filter(item => (item.x || 0) < columnSplit);
  const rightItems = items.filter(item => (item.x || 0) >= columnSplit);

  return {
    columnSplit,
    fullWidthRows: agruparItensPorY(items, 3)
      .map(row => criarRowEstruturada(pagina.page, row))
      .filter(row => isStructuralFullWidthRow(row.raw, row.itens, columnSplit)),
    leftRows: agruparItensPorY(leftItems, 3)
      .map(row => criarRowEstruturada(pagina.page, row))
      .filter(row => row.raw),
    rightRows: agruparItensPorY(rightItems, 3)
      .map(row => criarRowEstruturada(pagina.page, row))
      .filter(row => row.raw),
  };
}

function criarRowEstruturada(page, row) {
  const raw = joinItems(row.itens);
  return {
    page,
    y: row.y,
    itens: row.itens,
    raw,
    text: limparRuidoEstruturalLinha(raw),
  };
}

function detectarColumnSplit(items) {
  const xs = items
    .map(item => Number(item.x) || 0)
    .filter(x => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);

  if (xs.length < 10) return 280;

  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  if (maxX <= minX) return 280;

  const span = maxX - minX;
  const faixaCentralMin = minX + span * 0.28;
  const faixaCentralMax = minX + span * 0.72;
  const centralXs = xs.filter(x => x >= faixaCentralMin && x <= faixaCentralMax);
  const base = centralXs.length >= 2 ? centralXs : xs;
  const xSupport = new Map();
  for (const x of base) {
    const key = Number(x.toFixed(1));
    xSupport.set(key, (xSupport.get(key) ?? 0) + 1);
  }
  const candidatosComSuporte = [...xSupport.entries()]
    .filter(([, count]) => count >= 2)
    .map(([x]) => x)
    .sort((a, b) => a - b);
  const candidatos = candidatosComSuporte.length >= 2 ? candidatosComSuporte : base;
  const baseline = minX + span * 0.52;
  const supportEntries = [...xSupport.entries()].filter(([, count]) => count >= 2);
  const maxSupport = supportEntries.reduce((acc, [, count]) => Math.max(acc, count), 0);
  const supportThreshold = Math.max(3, Math.ceil(maxSupport * 0.12));
  const significantEntries = supportEntries
    .filter(([, count]) => count >= supportThreshold)
    .sort((a, b) => a[0] - b[0]);
  const leftPeak = significantEntries.filter(([x]) => x < baseline).at(-1);
  const rightPeak = significantEntries.find(([x]) => x >= baseline);

  let melhorGap = 0;
  let split = baseline;

  if (leftPeak && rightPeak && rightPeak[0] - leftPeak[0] >= 20) {
    return leftPeak[0] + (rightPeak[0] - leftPeak[0]) / 2;
  }

  for (let i = 1; i < candidatos.length; i++) {
    const anterior = candidatos[i - 1];
    const atual = candidatos[i];
    const gap = atual - anterior;
    if (gap > melhorGap) {
      melhorGap = gap;
      split = anterior + gap / 2;
    }
  }

  return split;
}

function agruparItensPorY(items, tol = 3) {
  const grupos = [];

  for (const item of items) {
    const grupo = grupos.find(current => Math.abs(current.y - item.y) < tol);
    if (grupo) {
      grupo.itens.push(item);
    } else {
      grupos.push({ y: item.y, itens: [item] });
    }
  }

  grupos.sort((a, b) => b.y - a.y);
  return grupos.map(grupo => ({
    y: grupo.y,
    itens: grupo.itens.slice().sort((a, b) => (a.x || 0) - (b.x || 0)),
  }));
}

function isStructuralFullWidthRow(text, items, columnSplit) {
  const normalized = normalizeForMatch(text);
  const hasLeft = items.some(item => (item.x || 0) < columnSplit);
  const hasRight = items.some(item => (item.x || 0) >= columnSplit);
  const hasTransactionDate = startsWithTransactionDate(text);
  const amountCount = items.filter(item => RE_VALOR_ITEM.test(normalizeLine(item.str))).length;
  const hasCardHolderHeader = /\bFINAL\s+\d{4}\b/.test(normalized) && amountCount === 0 && !hasTransactionDate;

  if (!hasLeft || !hasRight) return false;
  if (hasTransactionDate) return false;
  if (amountCount > 0 && !matchesAny(text, SECTION_PATTERNS.payments)) return false;

  return (
    matchesAny(text, SECTION_PATTERNS.purchases) ||
    matchesAny(text, SECTION_PATTERNS.services) ||
    matchesAny(text, SECTION_PATTERNS.installments) ||
    matchesAny(text, SECTION_PATTERNS.payments) ||
    hasCardHolderHeader ||
    normalized.includes('VENCIMENTO') ||
    normalized.includes('EMISSAO') ||
    normalized.includes('POSTAGEM') ||
    normalized.includes('TITULAR')
  );
}

function joinItems(items) {
  return items
    .map(item => String(item.str ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function detectarEmissorItau(linhas) {
  const amostra = linhas
    .slice(0, 80)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  return (
    amostra.includes('ITAU') ||
    amostra.includes('VISA') ||
    amostra.includes('INFINITE') ||
    amostra.includes('SIGNATURE')
  );
}

function extrairMesFaturaItau(linhas) {
  for (const linha of linhas) {
    const cleaned = normalizeLine(linha);
    let match = cleaned.match(/vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (match) {
      const [, , mm, yyyy] = match;
      const idx = Number(mm) - 1;
      if (idx >= 0 && idx < 12) return `${MESES_ABREV[idx]}/${yyyy}`;
    }

    match = cleaned.match(/emiss[aã]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (match) {
      const [, , mm, yyyy] = match;
      const idx = Number(mm) - 1;
      if (idx >= 0 && idx < 12) return `${MESES_ABREV[idx]}/${yyyy}`;
    }
  }

  return null;
}

function detectarPerfilFaturaItau(linhas) {
  const sample = normalizeForMatch(linhas.slice(0, 240).join(' '));
  const finais = sample.match(/\bFINAL\s+\d{4}\b/g) ?? [];

  if (
    sample.includes('LANCAMENTOS INTERNACIONAIS') &&
    (
      sample.includes('US R') ||
      sample.includes('USD') ||
      sample.includes('DOLAR DE CONVERSAO')
    )
  ) {
    return ITAU_FATURA_PROFILE.INTERNATIONAL_BLACK;
  }

  if (
    finais.length > 1 ||
    sample.includes('LANCAMENTOS PRODUTOS E SERVICOS') ||
    sample.includes('COMPRAS PARCELADAS PROXIMAS FATURAS')
  ) {
    return ITAU_FATURA_PROFILE.DOMESTIC_MULTICARD;
  }

  return ITAU_FATURA_PROFILE.DOMESTIC_CLASSIC;
}

function parsearLancamentosItau(linhasColunadas, grupos, linhasRaw, paginas, mesFatura, profile) {
  if (profile === ITAU_FATURA_PROFILE.INTERNATIONAL_BLACK) {
    return parsearLancamentosItauInternacional(paginas, mesFatura);
  }

  return parsearLancamentosItauDomestico(linhasColunadas, grupos, linhasRaw, paginas, mesFatura, profile);
}

function parsearLancamentosItauDomestico(linhasColunadas, grupos, linhasRaw, paginas, mesFatura, profile) {
  const colunas = separarPorColuna(linhasColunadas);
  const sectionRows = parseTransactionSections([
    ...colunas.left.map(r => ({ ...r, _col: 0 })),
    ...colunas.right.map(r => ({ ...r, _col: 1 })),
  ].sort((a, b) => a.page !== b.page ? a.page - b.page : a.y !== b.y ? b.y - a.y : a._col - b._col), mesFatura);
  const directRows = parseTransactionColumnDirect(paginas, mesFatura);

  let rowsCompras = sectionRows;
  if (profile === ITAU_FATURA_PROFILE.DOMESTIC_MULTICARD) {
    rowsCompras = mergeLancamentos(sectionRows, directRows);
  } else if (directRows.length > rowsCompras.length) {
    rowsCompras = directRows;
  }

  const parcelasMap = new Map([
    ...parseInstallmentSection(colunas.left),
    ...parseInstallmentSection(colunas.right),
  ]);

  if (rowsCompras.length === 0) {
    rowsCompras = [
      ...parseTransactionFallback(colunas.left, mesFatura),
      ...parseTransactionFallback(colunas.right, mesFatura),
    ];
  }

  if (rowsCompras.length === 0) {
    rowsCompras = parseTransactionRawGroupFallback(grupos, mesFatura);
  }

  if (rowsCompras.length === 0) {
    rowsCompras = parseTransactionSlidingGroupFallback(grupos, mesFatura);
  }

  if (rowsCompras.length === 0) {
    rowsCompras = parseTransactionRawLinesFallback(linhasRaw, mesFatura);
  }

  return rowsCompras.map(lancamento => {
    const { _sourceKey, ...cleanLancamento } = lancamento;
    const parcelaInfo = parcelasMap.get(normalizarChaveDescricao(lancamento.desc));
    return parcelaInfo
      ? { ...cleanLancamento, ...parcelaInfo }
      : cleanLancamento;
  });
}

function parsearLancamentosItauInternacional(paginas, mesFatura) {
  const lancamentos = [];

  for (const pagina of paginas) {
    const estrutura = montarEstruturaPaginaColunas(pagina);
    const mergedRows = [
      ...estrutura.fullWidthRows.map(row => ({ ...row, _col: -1 })),
      ...estrutura.leftRows.map(row => ({ ...row, _col: 0 })),
      ...estrutura.rightRows.map(row => ({ ...row, _col: 1 })),
    ].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (a.y !== b.y) return b.y - a.y;
      return a._col - b._col;
    });

    let active = false;

    for (const row of mergedRows) {
      const raw = normalizeLine(row.raw);
      if (!raw) continue;

      if (matchesAny(raw, SECTION_PATTERNS.international)) {
        active = true;
        continue;
      }

      if (!active) continue;

      if (row._col === -1 && isInternationalStopRow(raw)) {
        active = false;
        continue;
      }

      if (row._col !== 0) continue;

      const text = limparRuidoEstruturalLinha(raw);
      if (!text || isIgnorableInternationalRow(text)) continue;

      if (isInternationalStopRow(text)) {
        active = false;
        continue;
      }

      if (!startsWithTransactionDate(text)) continue;

      const parsed = parseTransactionLine(text, mesFatura, buildSourceKey(row.page, row._col, row.y));
      if (parsed) {
        lancamentos.push(parsed);
      }
    }
  }

  return dedupeLancamentos(lancamentos).map(({ _sourceKey, ...item }) => item);
}

function parseTransactionColumnDirect(paginas, mesFatura) {
  const lancamentos = [];

  for (const pagina of paginas) {
    const estrutura = montarEstruturaPaginaColunas(pagina);
    const mergedRows = [
      ...estrutura.fullWidthRows.map(row => ({ ...row, _col: -1 })),
      ...estrutura.leftRows.map(row => ({ ...row, _col: 0 })),
      ...estrutura.rightRows.map(row => ({ ...row, _col: 1 })),
    ].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (a.y !== b.y) return b.y - a.y;
      return a._col - b._col;
    });

    const active = [false, false];

    for (const row of mergedRows) {
      const raw = row.raw;
      const text = row.text;
      const section = detectarSection(raw);

      if (row._col === -1) {
        if (section && isTransactionSection(section)) {
          active[0] = true;
          active[1] = true;
        } else if (section && !isTransactionSection(section)) {
          active[0] = false;
          active[1] = false;
        }
        continue;
      }

      const col = row._col;
      if (section) {
        active[col] = isTransactionSection(section);
        continue;
      }

      if (!active[col] || !text || isIgnorableRow(text)) continue;

      const parsed = parseTransactionLine(text, mesFatura, buildSourceKey(row.page, row._col, row.y));
      if (parsed) {
        lancamentos.push(parsed);
      }
    }
  }

  return dedupeLancamentos(lancamentos);
}

function separarPorColuna(linhasColunadas) {
  const left = [];
  const right = [];

  linhasColunadas.forEach(linha => {
    if (linha.left) {
      left.push({ page: linha.page, y: linha.y, text: linha.left });
    }
    if (linha.right) {
      right.push({ page: linha.page, y: linha.y, text: linha.right });
    }
  });

  return { left, right };
}

function parseTransactionSections(rows, mesFatura) {
  const lancamentos = [];
  // Seção independente por coluna: left (_col=0) e right (_col=1)
  // Isso evita que "Compras parceladas" da coluna direita mate transações da esquerda,
  // e que "Encargos/Juros" da coluna oposta (faturas 1 cartão) encerre a seção ativa
  const sections = [null, null];
  const pendings = [null, null];
  // Seções não-transacionais (installments/payments) só encerram a seção de compras
  // DEPOIS que pelo menos 1 transação foi encontrada. Isso evita que nav links da
  // página 1 (capa) que têm o mesmo texto das seções reais matem a seção prematuramente.
  let foundAnyTransaction = false;

  for (const row of rows) {
    const rawText = normalizeLine(row.text);
    if (!rawText) continue;
    const text = limparRuidoEstruturalLinha(rawText);

    const col = row._col ?? 0;
    const section = detectarSection(rawText);
    if (section) {
      // Se ainda não achamos nenhuma transação, ignorar seções não-transacionais
      // (installments/payments) para não matar a seção ativa por causa de nav links
      if (!isTransactionSection(section) && !foundAnyTransaction) {
        pendings[col] = null;
        continue;
      }
      sections[col] = section;
      // Se a outra coluna ainda não tem seção ativa, propaga (cabeçalho full-width
      // capturado na col esquerda também abre a col direita)
      const other = 1 - col;
      if (sections[other] === null && isTransactionSection(section)) {
        sections[other] = section;
      }
      pendings[col] = null;
      continue;
    }

    if (!isTransactionSection(sections[col])) {
      pendings[col] = null;
      continue;
    }

    if (!text || isIgnorableRow(text)) {
      pendings[col] = null;
      continue;
    }

    if (startsWithTransactionDate(text)) {
      pendings[col] = {
        text,
        sourceKey: buildSourceKey(row.page, row._col, row.y),
      };
      continue;
    }

    if (pendings[col]) {
      pendings[col].text = `${pendings[col].text} ${text}`.trim();
      const parsed = parseTransactionLine(pendings[col].text, mesFatura, pendings[col].sourceKey);
      if (parsed) {
        lancamentos.push(parsed);
        foundAnyTransaction = true;
        pendings[col] = null;
      }
      continue;
    }

    const parsed = parseTransactionLine(text, mesFatura, buildSourceKey(row.page, row._col, row.y));
    if (parsed) {
      lancamentos.push(parsed);
      foundAnyTransaction = true;
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseInstallmentSection(rows) {
  const installments = new Map();
  let currentSection = null;

  for (const row of rows) {
    const rawText = normalizeLine(row.text);
    if (!rawText) continue;
    const text = limparRuidoEstruturalLinha(rawText);

    const section = detectarSection(rawText);
    if (section) {
      currentSection = section;
      continue;
    }

    if (currentSection !== 'installments' || !text || isIgnorableRow(text)) continue;

    const parsed = parseInstallmentLine(text);
    if (!parsed) continue;

    installments.set(normalizarChaveDescricao(parsed.desc), {
      parcela: parsed.parcela,
      totalCompra: null,
    });
  }

  return installments;
}

function detectarSection(text) {
  if (matchesAny(text, SECTION_PATTERNS.purchases)) return 'purchases';
  if (matchesAny(text, SECTION_PATTERNS.services)) return 'services';
  if (matchesAny(text, SECTION_PATTERNS.installments)) return 'installments';
  if (matchesAny(text, SECTION_PATTERNS.payments)) return 'payments';
  return null;
}

function isTransactionSection(section) {
  return section === 'purchases' || section === 'services';
}

function isIgnorableRow(text) {
  const normalized = normalizeForMatch(text);
  const hasTransactionDate = startsWithTransactionDate(text);
  return (
    matchesAny(text, SECTION_PATTERNS.ignore) ||
    matchesAny(text, SECTION_PATTERNS.payments) ||
    (!hasTransactionDate && normalized.includes('LANCAMENTOS NO CARTAO')) ||
    (!hasTransactionDate && normalized.includes('TOTAL DOS LANCAMENTOS ATUAIS')) ||
    (!hasTransactionDate && /\bFINAL\s+\d{4}\b/.test(normalized)) ||
    normalized.startsWith('DATA ') ||
    normalized.startsWith('ESTABELECIMENTO ') ||
    normalized.startsWith('VALOR ') ||
    normalized.startsWith('PRODUTOS ') ||
    normalized.startsWith('SERVICOS ')
  );
}

function isIgnorableInternationalRow(text) {
  const normalized = normalizeForMatch(text);
  return (
    isIgnorableRow(text) ||
    normalized.startsWith('DATA ESTABELECIMENTO US R') ||
    normalized.startsWith('LANCAMENTOS INTERNACIONAIS') ||
    normalized.startsWith('LIMITE TOTAL') ||
    normalized.startsWith('LIMITE DISPONIVEL') ||
    normalized.startsWith('ENCARGOS COBRADOS') ||
    normalized.startsWith('JUROS DO ROTATIVO') ||
    normalized.startsWith('JUROS DE MORA') ||
    normalized.startsWith('MULTA POR ATRASO') ||
    normalized.startsWith('FIQUE ATENTO') ||
    normalized.startsWith('PERIODO') ||
    normalized.startsWith('CONTINUA') ||
    normalized.startsWith('PC 00') ||
    normalized.startsWith('4004 4828') ||
    normalized.startsWith('0800 970 4828') ||
    normalized.startsWith('DOLAR DE CONVERSAO')
  );
}

function isInternationalStopRow(text) {
  const normalized = normalizeForMatch(text);
  return (
    normalized.startsWith('TOTAL TRANSACOES INTER EM R') ||
    normalized.startsWith('REPASSE DE IOF EM R') ||
    normalized.startsWith('TOTAL LANCAMENTOS INTER EM R') ||
    normalized.includes('L TOTAL DOS LANCAMENTOS ATUAIS') ||
    normalized.startsWith('ENCARGOS COBRADOS NESTA FATURA') ||
    normalized.startsWith('NOVO TETO DE JUROS') ||
    normalized.startsWith('SIMULACAO DE COMPRAS') ||
    normalized.startsWith('SIMULACAO SAQUE CASH')
  );
}

function parseTransactionFallback(rows, mesFatura) {
  const lancamentos = [];
  let pending = null;

  for (const row of rows) {
    const text = limparRuidoEstruturalLinha(normalizeLine(row.text));
    if (!text || isIgnorableRow(text) || matchesAny(text, SECTION_PATTERNS.installments)) {
      pending = null;
      continue;
    }

    if (startsWithTransactionDate(text)) {
      pending = {
        text,
        sourceKey: buildSourceKey(row.page, 0, row.y),
      };
      continue;
    }

    if (pending) {
      pending.text = `${pending.text} ${text}`.trim();
      const parsed = parseTransactionLine(pending.text, mesFatura, pending.sourceKey);
      if (parsed) {
        lancamentos.push(parsed);
        pending = null;
      }
      continue;
    }

    const parsed = parseTransactionLine(text, mesFatura, buildSourceKey(row.page, 0, row.y));
    if (parsed) {
      lancamentos.push(parsed);
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionRawGroupFallback(grupos, mesFatura) {
  const lancamentos = [];

  for (const grupo of grupos) {
    const itens = grupo
      .map(item => limparRuidoEstruturalLinha(normalizeLine(item.str)))
      .filter(Boolean);

    const dataIndex = itens.findIndex(item => startsWithTransactionDate(item));
    const valorIndex = findLastIndex(itens, item => RE_VALOR_ITEM.test(item));
    if (dataIndex < 0 || valorIndex <= dataIndex) continue;

    const textoLinha = itens.join(' ');
    if (isIgnorableRow(textoLinha)) continue;

    const desc = sanitizarDescricaoItau(itens.slice(dataIndex + 1, valorIndex).join(' '));
    if (!desc || desc.length < 2) continue;

    const parsed = parseTransactionLine(
      `${itens[dataIndex]} ${desc} ${itens[valorIndex]}`,
      mesFatura,
      buildSourceKey(grupo[0]?.page ?? 1, 0, grupo[0]?.y ?? dataIndex)
    );
    if (parsed) {
      lancamentos.push(parsed);
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionSlidingGroupFallback(grupos, mesFatura) {
  const prepared = grupos.map(grupo => ({
    page: grupo[0]?.page ?? 1,
    tokens: grupo.map(item => limparRuidoEstruturalLinha(normalizeLine(item.str))).filter(Boolean),
    text: grupo.map(item => limparRuidoEstruturalLinha(normalizeLine(item.str))).filter(Boolean).join(' '),
  }));

  const lancamentos = [];

  for (let i = 0; i < prepared.length; i++) {
    const current = prepared[i];
    if (!current.tokens.some(token => startsWithTransactionDate(token))) continue;
    if (isIgnorableRow(current.text)) continue;

    let buffer = [...current.tokens];
    let consumedEnd = i;

    for (let j = i; j < Math.min(i + 5, prepared.length); j++) {
      if (j > i) {
        const next = prepared[j];
        if (next.page !== current.page) break;
        if (isIgnorableRow(next.text)) continue;

        const hasNewDate = next.tokens.some(token => startsWithTransactionDate(token));
        const alreadyHasValue = findLastIndex(buffer, token => RE_VALOR_ITEM.test(token)) > buffer.findIndex(token => startsWithTransactionDate(token));
        if (hasNewDate && alreadyHasValue) {
          break;
        }

        buffer = buffer.concat(next.tokens);
        consumedEnd = j;
      }

      const parsed = parseTransactionTokens(
        buffer,
        mesFatura,
        buildSourceKey(current.page, 0, i)
      );
      if (parsed) {
        lancamentos.push(parsed);
        i = consumedEnd;
        break;
      }
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionLine(text, mesFatura, sourceKey = '') {
  const extracted = extractTransactionCandidate(text);
  if (!extracted) return null;

  const { rawData, rawDesc, rawValor } = extracted;
  const dataInfo = parseDataItau(rawData, mesFatura);
  const valor = parseBRL(rawValor);
  const descOriginal = sanitizarDescricaoItau(rawDesc);
  const parcelaInfo = extrairParcelaValidaDaDescricao(descOriginal);
  const desc = parcelaInfo?.desc || descOriginal;

  if (
    !dataInfo ||
    !Number.isFinite(valor) ||
    valor === 0 ||
    !desc ||
    desc.length < 2 ||
    RE_DESC_INVALIDA.test(desc) ||
    isNonTransactionalCardSummary(rawDesc, desc)
  ) {
    return null;
  }

  return {
    data: dataInfo.data,
    fatura: mesFatura || dataInfo.mes,
    desc,
      canal: inferirCanal({ desc, source: 'cartao' }),
    valor,
    ...(parcelaInfo ? { parcela: parcelaInfo.parcela, totalCompra: null } : {}),
    _sourceKey: sourceKey,
  };
}

function parseTransactionRawLinesFallback(linhas, mesFatura) {
  const lancamentos = [];

  for (let i = 0; i < linhas.length; i++) {
    let buffer = limparRuidoEstruturalLinha(normalizeLine(linhas[i]));
    if (!buffer || isIgnorableRow(buffer)) continue;

    for (let j = i; j < Math.min(i + 4, linhas.length); j++) {
      if (j > i) {
        const next = limparRuidoEstruturalLinha(normalizeLine(linhas[j]));
        if (!next || isIgnorableRow(next)) continue;
        buffer = `${buffer} ${next}`.trim();
      }

      const parsed = parseTransactionLine(buffer, mesFatura, buildSourceKey(0, 0, i));
      if (parsed) {
        lancamentos.push(parsed);
        i = j;
        break;
      }
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionTokens(tokens, mesFatura, sourceKey = '') {
  const dataIndex = tokens.findIndex(token => startsWithTransactionDate(token));
  const valorIndex = findLastIndex(tokens, token => RE_VALOR_ITEM.test(token));
  if (dataIndex < 0 || valorIndex <= dataIndex) return null;

  const rawData = tokens[dataIndex];
  const rawValor = tokens[valorIndex];
  const rawDesc = tokens.slice(dataIndex + 1, valorIndex).join(' ').trim();
  if (!rawDesc) return null;

  return parseTransactionLine(`${rawData} ${rawDesc} ${rawValor}`, mesFatura, sourceKey);
}

function parseInstallmentLine(text) {
  const valorMatch = text.match(/([\d.]{1,10},\d{2})\s*$/);
  if (!valorMatch) return null;

  const body = text.slice(0, text.lastIndexOf(valorMatch[0])).trim();
  const parcelaInfo = extrairParcelaValidaDaDescricao(body);
  if (!parcelaInfo) return null;

  return {
    desc: parcelaInfo.desc,
    parcela: parcelaInfo.parcela,
  };
}

function extrairParcelaValidaDaDescricao(desc) {
  const parcelaInfo = extrairParcelaFinal(desc);
  if (!parcelaInfo) return null;

  const descSemParcela = sanitizarDescricaoItau(parcelaInfo.desc);
  if (!descSemParcela || descSemParcela.length < 2 || !temDescricaoComercialMinima(descSemParcela)) {
    return null;
  }

  return {
    parcela: parcelaInfo.parcela,
    desc: descSemParcela,
  };
}

function temDescricaoComercialMinima(texto) {
  const somenteLetras = String(texto ?? '').replace(/[^A-Za-zÀ-ÿ]/g, '');
  return somenteLetras.length >= 3;
}

function sanitizarDescricaoItau(rawDesc) {
  let desc = String(rawDesc ?? '').replace(/\s+/g, ' ').trim();
  if (!desc) return '';

  desc = desc
    .replace(/\bDATA\s+ESTABELECIMENTO\s+VALOR\s+EM\s+R\$\b.*$/i, '')
    .replace(/\bESTABELECIMENTO\s+VALOR\s+EM\s+R\$\b.*$/i, '')
    .replace(/\bDATA\s+PRODUTOS\/SERVI[ÇC]OS\s+VALOR\s+EM\s+R\$\b.*$/i, '')
    .replace(/\bVALOR\s+EM\s+R\$\b.*$/i, '')
    .replace(/\bTOTAL\s+DOS\s+PAGAMENTOS\b.*$/i, '')
    .replace(/\bPAGAMENTO\s+VIA\s+CONTA\b.*$/i, '')
    .replace(/\bLANCAMENTOS\s+PRODUTOS\s+E\s+SERVI[ÇC]OS\b.*$/i, '')
    .replace(/\bANUIDADE\s+DIFERENCIADA\b.*$/i, '')
    .trim();

  desc = desc.replace(/\s+[\d.]{1,10},\d{2}\s*$/g, '').trim();

  return desc;
}

function isNonTransactionalCardSummary(rawDesc, cleanedDesc = '') {
  const rawNormalized = normalizeForMatch(rawDesc);
  const cleanNormalized = normalizeForMatch(cleanedDesc);
  const moneyCount = [...String(rawDesc ?? '').matchAll(/[\d.]{1,10},\d{2}/g)].length;

  return (
    moneyCount >= 2 &&
    (
      rawNormalized.includes('PROXIMAS FATURAS') ||
      rawNormalized.includes('PROXIMA FATURA') ||
      rawNormalized.includes('XIMAS FATURAS') ||
      rawNormalized.includes('COMPRAS PARCELADAS') ||
      cleanNormalized.includes('PROXIMAS FATURAS') ||
      cleanNormalized.includes('PROXIMA FATURA') ||
      cleanNormalized.includes('XIMAS FATURAS')
    )
  );
}

function extractTransactionCandidate(text) {
  const normalized = limparRuidoEstruturalLinha(normalizeLine(text));
  if (!normalized) return null;

  const strict = normalized.match(RE_TRANSACAO);
  if (strict) {
    return {
      rawData: strict[1],
      rawDesc: strict[2],
      rawValor: strict[3],
    };
  }

  const dataMatch = normalized.match(/(\d{2}\/\d{2}(?:\/\d{4})?)/);
  const valores = [...normalized.matchAll(/(-?[\d.]{1,10},\d{2})/g)];
  const valorMatch = valores.at(-1);
  if (!dataMatch || !valorMatch) return null;

  const dataIndex = dataMatch.index ?? -1;
  const valorIndex = valorMatch.index ?? -1;
  if (dataIndex < 0 || valorIndex <= dataIndex) return null;

  const rawData = dataMatch[1];
  const rawValor = valorMatch[1];
  const rawDesc = normalized.slice(dataIndex + rawData.length, valorIndex).trim();
  if (!rawDesc) return null;

  return { rawData, rawDesc, rawValor };
}

function limparRuidoEstruturalLinha(text) {
  let cleaned = normalizeLine(text);
  if (!cleaned) return '';

  cleaned = cleaned
    .replace(/^DATA\s+ESTABELECIMENTO\s+VALOR\s+EM\s+R\$\s*/i, '')
    .replace(/^ESTABELECIMENTO\s+VALOR\s+EM\s+R\$\s*/i, '')
    .replace(/^DATA\s+ESTABELECIMENTO\s*/i, '')
    .replace(/^VALOR\s+EM\s+R\$\s*/i, '')
    .replace(/\s+Lançamentos no cartão\s+\(final\s+\d{4}\)\s+[\d.]{1,10},\d{2}\s*$/i, '')
    .replace(/\s+L\s*Total dos lançamentos atuais\s+[\d.]{1,10},\d{2}\s*$/i, '')
    .replace(/\s+Total dos lançamentos atuais\s+[\d.]{1,10},\d{2}\s*$/i, '')
    .trim();

  return cleaned;
}

function dedupeLancamentos(lancamentos) {
  const seen = new Set();
  return lancamentos.filter(item => {
    const key = item._sourceKey || `${item.data}|${item.desc}|${item.valor.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeLancamentos(...grupos) {
  return dedupeLancamentos(grupos.flat());
}

function buildSourceKey(page, col, rowRef) {
  return `${page ?? 0}|${col ?? 0}|${rowRef ?? 0}`;
}

function matchesAny(text, patterns) {
  const normalized = normalizeForMatch(text);
  return patterns.some(pattern => normalized.includes(pattern));
}

function isFaturaSemLancamentos(linhas) {
  const normalized = normalizeForMatch(linhas.join(' '));
  return normalized.includes('TOTAL DESTA FATURA 0 00') || normalized.includes('LANCAMENTOS ATUAIS 0 00');
}

function parseDataItau(rawData, mesFatura) {
  const match = rawData.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
  if (!match) return null;

  const [, dd, mm, yyyyRaw] = match;
  const idxTransacao = Number(mm) - 1;
  if (idxTransacao < 0 || idxTransacao > 11) return null;

  let yyyy = yyyyRaw;
  if (!yyyy) {
    if (!mesFatura) return null;
    const [mesFaturaStr, anoFaturaStr] = mesFatura.split('/');
    const idxFatura = MESES_ABREV.indexOf(mesFaturaStr);
    const anoFatura = Number(anoFaturaStr);
    if (idxFatura < 0 || !Number.isFinite(anoFatura)) return null;
    yyyy = String(idxTransacao > idxFatura ? anoFatura - 1 : anoFatura);
  }

  return {
    data: `${dd}/${String(idxTransacao + 1).padStart(2, '0')}/${yyyy}`,
    mes: `${MESES_ABREV[idxTransacao]}/${yyyy}`,
  };
}

function startsWithTransactionDate(text) {
  return RE_DATA_SLASH.test(text) || RE_DATA_PREFIX.test(text);
}

function normalizeLine(line) {
  return String(line ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarChaveDescricao(desc) {
  return String(desc ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

function findLastIndex(items, predicate) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i], i)) return i;
  }
  return -1;
}
