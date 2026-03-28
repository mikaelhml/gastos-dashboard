import { addItem, getAll, bulkAdd, deleteItem } from '../db.js';
import { inferirCanal } from '../utils/transaction-tags.js';
import { applyCategorizationToImportedRows, buildCategorizationRuntime } from '../utils/categorization-engine.js';
import {
  buildImportQuality,
  buildLancamentoFingerprint,
  dedupeImportedLancamentos,
  planScopedReplacement,
} from '../utils/import-integrity.js';
import {
  computeHash,
  extrairLinhasPDF,
  extrairParcelaFinal,
  parseBRL,
  parseDataNubank,
  MESES_ABREV,
  MESES_NUBANK,
  MESES_LONGOS,
  normalizarMes,
} from './pdf-utils.js';

const SOURCE_KEY = 'nubank-fatura';
const RE_VALOR_FINAL = /([\d.]{1,10},\d{2})\s*$/;
const RE_TRANSACAO = /^((?:\d{2}\s+[A-Z]{3}(?:\s+\d{4})?)|(?:\d{2}\/\d{2}(?:\/\d{4})?))\s+(.+?)\s+([\d.]{1,10},\d{2})$/i;
const RE_DATA_SOZINHA = /^(?:\d{2}\s+[A-Z]{3}(?:\s+\d{4})?|\d{2}\/\d{2}(?:\/\d{4})?)$/i;
const RE_LINHA_INVALIDA = /^(pagamento recebido|saldo em aberto|total|encargos|juros|multa|iof|limite|resumo|cliente|cpf|vencimento|fechamento|parcelamento de fatura|valor pago|demonstrativo|ol[aá],|nubank)/i;
// Descs inválidas no novo layout Nubank (a linha começa com data, mas desc é de controle)
const RE_DESC_INVALIDA = /^(pagamento\s+em|saldo\s+restante)/i;
// Novo layout Nubank: "•••• 6975 NomeLoja" — prefixo de número de cartão no desc
const RE_CARD_PREFIX = /^[•·\*]{2,}\s*\d{4}\s+/;

export async function importarNubankFatura(file, onProgress = () => {}) {
  onProgress(5);

  const buffer = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = () => rej(new Error('Erro ao ler o arquivo PDF.'));
    reader.readAsArrayBuffer(file);
  });

  onProgress(10);

  const hash = await computeHash(buffer);
  const pdfsImportados = await getAll('pdfs_importados');
  if (pdfsImportados.some(p => p.hash === hash)) {
    return { importado: 0, duplicata: true, mes: '', warnings: [] };
  }

  onProgress(20);
  const linhas = await extrairLinhasPDF(buffer);
  onProgress(30);

  const emissor = detectarEmissorFatura(linhas);
  if (emissor !== 'nubank') {
    return {
      importado: 0,
      duplicata: false,
      mes: '',
      warnings: [],
      erro: emissor === 'itau'
        ? 'Este PDF parece ser de fatura Itaú/Visa, não de Nubank. O parser atual suporta apenas faturas Nubank.'
        : 'Este PDF de fatura não foi reconhecido como Nubank. O layout atual não é suportado pelo parser.',
    };
  }

  const mesFatura = extrairMesFatura(linhas);
  const [rules, memories] = await Promise.all([
    getAll('categorizacao_regras'),
    getAll('categorizacao_memoria'),
  ]);
  const categorizationRuntime = buildCategorizationRuntime({ rules, memories });
  onProgress(60);
  const { lancamentos: rawLancamentos, parseWarnings } = parsearLancamentos(linhas, mesFatura);
  const lancamentos = applyCategorizationToImportedRows(
    rawLancamentos,
    categorizationRuntime,
    { source: 'cartao', direction: 'saida' },
  );

  console.log(`[nubank-fatura] "${file.name}": ${lancamentos.length} lançamentos, fatura=${mesFatura || 'não identificada'}`);

  if (lancamentos.length === 0) {
    const amostra = linhas.slice(0, 30).join('\n');
    console.error('[nubank-fatura] Nenhum lançamento. Primeiras 30 linhas:\n', amostra);
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
    console.error('[nubank-fatura] Cabeçalho da fatura não reconhecido. Primeiras 30 linhas:\n', amostra);
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
    tipo: 'fatura',
  });

  onProgress(100);
  const warnings = [
    ...dedupeResult.warnings,
    ...replacementPlan.warnings,
    ...parseWarnings,
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

function extrairMesFatura(linhas) {
  for (const linha of linhas) {
    const cleaned = linha.replace(/\s+/g, ' ').trim();

    // Novo layout: "Data de vencimento: 16 MAR 2026" ou "FATURA 16 MAR 2026"
    let match = cleaned.match(/vencimento:\s*\d{1,2}\s+([A-Z]{3})\s+(\d{4})/i);
    if (match) {
      const mesIdx = MESES_NUBANK[normalizarMes(match[1])];
      if (mesIdx !== undefined) return `${MESES_ABREV[mesIdx]}/${match[2]}`;
    }

    match = cleaned.match(/^FATURA\s+\d{1,2}\s+([A-Z]{3})\s+(\d{4})/i);
    if (match) {
      const mesIdx = MESES_NUBANK[normalizarMes(match[1])];
      if (mesIdx !== undefined) return `${MESES_ABREV[mesIdx]}/${match[2]}`;
    }

    match = cleaned.match(/fatura\s+de\s+([a-zçãé]+)(?:\s+de)?\s+(\d{4})/i);
    if (match) {
      const mes = MESES_LONGOS[normalizarMes(match[1])];
      if (mes) return `${mes}/${match[2]}`;
    }

    match = cleaned.match(/fatura\s+([a-z]{3})[\/\s-](\d{4})/i);
    if (match) {
      const mes = MESES_ABREV.find(m => m.toUpperCase() === normalizarMes(match[1]));
      if (mes) return `${mes}/${match[2]}`;
    }

    match = cleaned.match(/([a-zçãé]+)\s+(\d{4})\s+fatura/i);
    if (match) {
      const mes = MESES_LONGOS[normalizarMes(match[1])];
      if (mes) return `${mes}/${match[2]}`;
    }

    match = cleaned.match(/vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
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

function detectarEmissorFatura(linhas) {
  const amostra = linhas
    .slice(0, 80)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (amostra.includes('NUBANK')) return 'nubank';
  if (
    amostra.includes('ITAU') ||
    amostra.includes('ITAU CARTOES') ||
    amostra.includes('VISA') ||
    amostra.includes('INFINITE') ||
    amostra.includes('SIGNATURE')
  ) {
    return 'itau';
  }

  return 'desconhecido';
}

function parsearLancamentos(linhas, mesFatura) {
  const lancamentos = [];
  const candidatos = montarLinhasCandidatas(linhas);
  const rejectedSamples = [];
  let rejectedCount = 0;

  for (const linha of candidatos) {
    const match = linha.match(RE_TRANSACAO);
    if (!match) continue;

    const [, rawData, rawDescRaw, rawValor] = match;
    const dataInfo = parseDataFatura(rawData.toUpperCase(), mesFatura);
    const valor = parseBRL(rawValor);

    if (!dataInfo || !Number.isFinite(valor) || valor <= 0) {
      rejectedCount++;
      if (rejectedSamples.length < 3) rejectedSamples.push(linha);
      continue;
    }

    // Novo layout Nubank inclui "R$ valor" na linha — strip do sufixo R$
    let desc = rawDescRaw.trim().replace(/\s*R\$\s*$/, '');

    // Filtrar linhas de controle: "Pagamento em DD MMM", "Saldo restante da fatura anterior"
    if (RE_DESC_INVALIDA.test(desc)) {
      rejectedCount++;
      if (rejectedSamples.length < 3) rejectedSamples.push(linha);
      continue;
    }

    // Novo layout: strip prefixo de número de cartão "•••• 6975 "
    desc = desc.replace(RE_CARD_PREFIX, '').trim();
    const parcelaInfo = extrairParcelaValida(desc);
    const parcela = parcelaInfo?.parcela || null;
    if (parcelaInfo) {
      desc = parcelaInfo.desc;
    }

    if (!desc || desc.length < 2) {
      rejectedCount++;
      if (rejectedSamples.length < 3) rejectedSamples.push(linha);
      continue;
    }

    lancamentos.push({
      data: dataInfo.data,
      fatura: mesFatura || dataInfo.mes,
      desc,
      canal: inferirCanal({ desc, source: 'cartao' }),
      valor,
      ...(parcela ? { parcela, totalCompra: null } : {}),
    });
  }

  const parseWarnings = rejectedCount > 0
    ? [{
        code: 'parser-candidates-skipped',
        level: 'info',
        message: rejectedCount === 1
          ? '1 linha candidata foi ignorada na validacao final.'
          : `${rejectedCount} linhas candidatas foram ignoradas na validacao final.`,
        ...(rejectedSamples.length > 0 ? { sample: rejectedSamples.join(' | ') } : {}),
      }]
    : [];

  return { lancamentos, parseWarnings };
}

function extrairParcelaValida(desc) {
  const parcelaInfo = extrairParcelaFinal(desc);
  if (!parcelaInfo) return null;

  const descSemParcela = parcelaInfo.desc;
  if (descSemParcela.length < 2 || !temDescricaoComercialMinima(descSemParcela)) return null;

  return {
    parcela: parcelaInfo.parcela,
    desc: descSemParcela,
  };
}

function temDescricaoComercialMinima(texto) {
  const somenteLetras = String(texto ?? '').replace(/[^A-Za-zÀ-ÿ]/g, '');
  return somenteLetras.length >= 3;
}

function parseDataFatura(rawData, mesFatura) {
  const slash = parseDataSlash(rawData, mesFatura);
  if (slash) return slash;

  const direta = parseDataNubank(rawData, null);
  if (direta) return direta;

  const match = rawData.match(/^(\d{2})\s+([A-Z]{3})$/i);
  if (!match || !mesFatura) return null;

  const [, dd, rawMes] = match;
  const mesTransacao = normalizarMes(rawMes);
  const idxTransacao = MESES_NUBANK[mesTransacao];
  if (idxTransacao === undefined) return null;

  const [mesFaturaStr, anoFaturaStr] = mesFatura.split('/');
  const idxFatura = MESES_ABREV.indexOf(mesFaturaStr);
  const anoFatura = Number(anoFaturaStr);
  if (idxFatura < 0 || !Number.isFinite(anoFatura)) return null;

  const anoTransacao = idxTransacao > idxFatura ? anoFatura - 1 : anoFatura;
  return parseDataNubank(`${dd} ${mesTransacao} ${anoTransacao}`);
}

function montarLinhasCandidatas(linhas) {
  const candidatos = [];

  for (let i = 0; i < linhas.length; i++) {
    const atual = limparLinha(linhas[i]);
    if (!atual || RE_LINHA_INVALIDA.test(atual)) continue;

    if (RE_VALOR_FINAL.test(atual)) {
      candidatos.push(atual);
    }

    const proxima = limparLinha(linhas[i + 1]);
    if (!proxima || RE_LINHA_INVALIDA.test(proxima)) continue;

    if (RE_DATA_SOZINHA.test(atual) && RE_VALOR_FINAL.test(proxima)) {
      candidatos.push(`${atual} ${proxima}`);
      continue;
    }

    if (atual.match(/^((?:\d{2}\s+[A-Z]{3}(?:\s+\d{4})?)|(?:\d{2}\/\d{2}(?:\/\d{4})?))\s+/i) && !RE_VALOR_FINAL.test(atual)) {
      const combinada = `${atual} ${proxima}`;
      if (RE_VALOR_FINAL.test(combinada)) {
        candidatos.push(combinada);
      }
    }
  }

  return [...new Set(candidatos)];
}

function limparLinha(linha) {
  return String(linha ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDataSlash(rawData, mesFatura) {
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
