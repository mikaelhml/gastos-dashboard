import { addItem, bulkAdd, deleteItem, getAll } from '../db.js';
import { computeHash, extrairEstruturaPDF, MESES_ABREV, parseBRL } from './pdf-utils.js';

const SUMMARY_FIELDS = [
  'emDia',
  'vencida',
  'outrosCompromissos',
  'creditoALiberar',
  'coobrigacoes',
  'limite',
];

const SUMMARY_INLINE_PATTERNS = {
  emDia: /EM DIA\s+R\$\s*([\d.]+,\d{2})/i,
  vencida: /VENCIDA\s+R\$\s*([\d.]+,\d{2})/i,
  outrosCompromissos: /OUTROS COMPROMISSOS(?: FINANCEIROS)?\s+R\$\s*([\d.]+,\d{2})/i,
  creditoALiberar: /CREDITO A LIBERAR\s+R\$\s*([\d.]+,\d{2})/i,
  coobrigacoes: /COOBRIGACOES\s+R\$\s*([\d.]+,\d{2})/i,
  limite: /LIMITES? DE CREDITO\s+R\$\s*([\d.]+,\d{2})/i,
};

const CATEGORY_LABELS = new Map([
  ['EMPRESTIMOS', 'Empréstimos'],
  ['OUTROS CREDITOS', 'Outros créditos'],
  ['LIMITE', 'Limite'],
  ['FINANCIAMENTOS IMOBILIARIOS', 'Financiamentos imobiliários'],
  ['FINANCIAMENTOS', 'Financiamentos'],
  ['COOBRIGACOES', 'Coobrigações'],
  ['CREDITO A LIBERAR', 'Crédito a liberar'],
  ['OUTROS COMPROMISSOS FINANCEIROS', 'Outros compromissos financeiros'],
]);

const HEADER_LINES = new Set([
  'DIVIDAS',
  'EM DIA',
  'VENCIDA',
  'OUTROS COMPROMISSOS FINANCEIROS',
  'CREDITO A LIBERAR',
  'COOBRIGACOES',
  'LIMITES DE CREDITO',
  'INSTITUICAO',
]);

const INSTITUTION_HINT_RE = /\b(BANCO|CAIXA|UNIBANCO|FINANCEIRA|PAGAMENTOS|PAGAMENTO|ITAUCARD|HOLDING|SOCIEDADE|FEDERAL|INVESTIMENTO|BRASIL|INTER|XP|SWAP|CBD)\b/;
const MONEY_LINE_RE = /^R\$\s*([\d.]+,\d{2})$/i;
const MONTH_LINE_RE = /MES DE REFERENCIA:\s*(\d{2})\/(\d{4})/i;

export async function importarRegistratoScr(file, onProgress = () => {}) {
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
  if (pdfsImportados.some(item => item.hash === hash)) {
    return { importado: 0, duplicata: true, mes: '' };
  }

  onProgress(30);

  const { linhasRaw, blocosFallback, totalPaginas } = await extrairLinhasRegistrato(buffer);
  const linhas = normalizarLinhas(linhasRaw);
  const blocos = separarBlocosMensais(linhas);
  const blocosRegistrato = blocos.length > 0 ? blocos : blocosFallback;
  const periodo = montarPeriodo(blocosRegistrato);

  if (blocosRegistrato.length === 0) {
    const amostra = linhas.slice(0, 80).join('\n');
    console.error('[registrato-scr] Nenhum bloco mensal identificado. Primeiras 80 linhas:\n', amostra);
    return {
      importado: 0,
      duplicata: false,
      mes: '',
      erro: `Nao foi possivel identificar os meses de referencia em "${file.name}". Verifique o console (F12).`,
      debug: amostra,
    };
  }

  onProgress(55);

  const snapshots = [];
  const resumosMensais = [];

  blocosRegistrato.forEach((bloco, blocoIndex) => {
    const blocoEnriquecido = {
      ...bloco,
      resumoValores: resolverResumoValores(bloco),
      semRegistros: hasSemRegistrosNotice(bloco),
    };

    const registros = parsearBlocoMensal(blocoEnriquecido, blocoIndex, file.name, hash);
    const snapshotsDoBloco = registros.length > 0
      ? registros
      : [criarSnapshotConsolidado(blocoEnriquecido, blocoIndex, file.name, hash)];
    const snapshotsValidos = snapshotsDoBloco.filter(isRegistratoEntryMeaningful);
    const resumoMensal = criarResumoMensal(blocoEnriquecido, snapshotsValidos, file.name, hash);

    if (!isRegistratoEntryMeaningful(resumoMensal)) {
      return;
    }

    snapshots.push(...snapshotsValidos);
    resumosMensais.push(resumoMensal);
  });

  if (resumosMensais.length === 0) {
    const amostra = linhas.slice(0, 80).join('\n');
    console.error('[registrato-scr] Blocos encontrados, mas nenhum resumo mensal foi gerado:\n', amostra);
    return {
      importado: 0,
      duplicata: false,
      mes: '',
      erro: `Nao foi possivel consolidar os dados do Registrato em "${file.name}". Verifique o console (F12).`,
      debug: amostra,
    };
  }

  onProgress(75);

  await substituirMesesExistentes(resumosMensais.map(item => item.mesRef));
  await bulkAdd('registrato_scr_resumo_mensal', resumosMensais);
  await bulkAdd('registrato_scr_snapshot', snapshots);

  onProgress(85);

  await addItem('pdfs_importados', {
    hash,
    nome: file.name,
    tamanho: file.size,
    importadoEm: new Date().toISOString(),
    transacoes: snapshots.length,
    mes: periodo,
    tipo: 'registrato-scr',
  });

  onProgress(100);

  return {
    importado: resumosMensais.length,
    snapshots: snapshots.length,
    paginas: totalPaginas,
    duplicata: false,
    mes: periodo,
  };
}

function normalizarLinhas(rawLines) {
  return rawLines
    .map(line => sanitizarLinha(String(line ?? '')))
    .filter(Boolean)
    .filter(line => !deveIgnorarLinha(line));
}

async function extrairLinhasRegistrato(buffer) {
  const { paginas } = await extrairEstruturaPDF(buffer, 2);
  return {
    linhasRaw: paginas.flatMap(pagina => montarLinhasPaginaRegistrato(pagina.items ?? [])),
    blocosFallback: extrairBlocosFallbackPorPagina(paginas),
    totalPaginas: paginas.length,
  };
}

function montarLinhasPaginaRegistrato(items) {
  if (!items.length) return [];

  const rows = [];
  const sorted = items
    .slice()
    .sort((a, b) => {
      const deltaY = (Number(b.y) || 0) - (Number(a.y) || 0);
      if (Math.abs(deltaY) > 2) return deltaY;
      return (Number(a.x) || 0) - (Number(b.x) || 0);
    });

  for (const item of sorted) {
    const y = Number(item.y) || 0;
    const current = rows[rows.length - 1];
    if (current && Math.abs(current.y - y) <= 2) {
      current.items.push(item);
      continue;
    }
    rows.push({ y, items: [item] });
  }

  return rows
    .map(row => row.items
      .slice()
      .sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0))
      .map(item => String(item.str ?? '').trim())
      .filter(Boolean)
      .join(' '))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sanitizarLinha(line) {
  return String(line ?? '')
    .replace(/Relat[oó]rio de Empr[eé]stimos e Financiamentos \(SCR\)/gi, ' ')
    .replace(/Verifique a autenticidade em https?:\/\/\S+/gi, ' ')
    .replace(/Relat[oó]rio emitido por:\s*\S+\s+em\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/gi, ' ')
    .replace(/P[aá]gina\s+\d+\s+de\s+\d+/gi, ' ')
    .replace(/\bNome:\s+.*$/gi, ' ')
    .replace(/\bCPF\/CNPJ:\s+.*$/gi, ' ')
    .replace(/Quer saber mais sobre este relat[oó]rio\?.*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairBlocosFallbackPorPagina(paginas) {
  const blocos = [];

  for (const pagina of paginas) {
    const pageText = montarTextoPagina(pagina.items ?? []);
    if (!pageText) continue;

    const matches = [...pageText.matchAll(/MES DE REFERENCIA:\s*(\d{2})\/(\d{4})/gi)];
    if (matches.length === 0) continue;

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      const start = index === 0 ? 0 : matches[index - 1].index + matches[index - 1][0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : pageText.length;
      const segment = pageText.slice(start, end).trim();
      const mes = Number(match[1]);
      const ano = Number(match[2]);
      const mesRef = `${String(mes).padStart(2, '0')}/${ano}`;
      const mesLabel = `${MESES_ABREV[mes - 1]}/${ano}`;
      const afterMonth = segment.slice(segment.toUpperCase().indexOf(match[0].toUpperCase()) + match[0].length);
      const resumoValores = extractMoneyValues(afterMonth).slice(0, SUMMARY_FIELDS.length);

      blocos.push({
        mesRef,
        mesLabel,
        resumoValores,
        detalheLinhas: normalizarLinhas([segment]),
        rawText: segment,
      });
    }
  }

  return blocos;
}

function montarTextoPagina(items) {
  return items
    .slice()
    .sort((a, b) => {
      const deltaY = (Number(b.y) || 0) - (Number(a.y) || 0);
      if (Math.abs(deltaY) > 2) return deltaY;
      return (Number(a.x) || 0) - (Number(b.x) || 0);
    })
    .map(item => sanitizarLinha(String(item.str ?? '')))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function deveIgnorarLinha(line) {
  const normalized = normalizeForMatch(line);

  if (!normalized) return true;
  if (normalized === 'RELATORIO DE EMPRESTIMOS E FINANCIAMENTOS (SCR)') return true;
  if (/^PAGINA \d+ DE \d+$/.test(normalized)) return true;
  if (normalized.startsWith('NOME: ')) return true;
  if (normalized.startsWith('CPF/CNPJ: ')) return true;
  if (normalized.startsWith('PERIODO PESQUISADO:')) return true;
  if (HEADER_LINES.has(normalized)) return true;
  if (normalized.startsWith('IMPORTANTE')) return true;
  if (normalized.startsWith('QUER SABER MAIS')) return true;
  if (normalized.startsWith('RELATORIO EMITIDO POR:')) return true;
  if (normalized.startsWith('VERIFIQUE A AUTENTICIDADE')) return true;
  if (line.startsWith('•')) return true;

  return false;
}

function separarBlocosMensais(lines) {
  const blocos = [];
  let detalheAtual = [];

  for (let index = 0; index < lines.length; index++) {
    const monthInfo = parseMonthReference(lines[index]);
    if (!monthInfo) {
      detalheAtual.push(lines[index]);
      continue;
    }

    const resumoValores = extractMoneyValues(lines[index].replace(MONTH_LINE_RE, '').trim());
    let cursor = index + 1;
    while (cursor < lines.length && isMoneyLine(lines[cursor])) {
      resumoValores.push(parseMoneyLine(lines[cursor]));
      cursor++;
    }

    blocos.push({
      mesRef: monthInfo.mesRef,
      mesLabel: monthInfo.mesLabel,
      resumoValores,
      detalheLinhas: detalheAtual.slice(),
    });

    detalheAtual = [];
    index = cursor - 1;
  }

  return blocos;
}

function parsearBlocoMensal(bloco, blocoIndex, fileName, hash) {
  const registros = [];
  const lines = bloco.detalheLinhas;

  let cursor = 0;
  let recordOrder = 0;

  while (cursor < lines.length) {
    if (!looksLikeInstitutionLine(lines[cursor])) {
      cursor++;
      continue;
    }

    const institutionInfo = consumeInstitution(lines, cursor);
    const instituicao = institutionInfo.value;
    cursor = institutionInfo.nextIndex;

    const resumoValores = [];
    while (cursor < lines.length && isMoneyLine(lines[cursor])) {
      resumoValores.push(parseMoneyLine(lines[cursor]));
      cursor++;
    }

    const operacoes = [];
    while (cursor < lines.length) {
      if (looksLikeInstitutionLine(lines[cursor])) break;
      if (!isCategoryLine(lines[cursor])) {
        cursor++;
        continue;
      }

      const categoryLine = lines[cursor];
      const categoria = canonicalCategory(categoryLine);
      cursor++;

      const subtipoPartes = [];
      while (
        cursor < lines.length &&
        !isMoneyLine(lines[cursor]) &&
        !isCategoryLine(lines[cursor]) &&
        !looksLikeInstitutionLine(lines[cursor])
      ) {
        subtipoPartes.push(lines[cursor]);
        cursor++;
      }

      const valores = [];
      while (cursor < lines.length && isMoneyLine(lines[cursor])) {
        valores.push(parseMoneyLine(lines[cursor]));
        cursor++;
      }

      operacoes.push({
        categoria,
        subtipo: subtipoPartes.join(' ').trim(),
        valores,
        ...mapValuesToColumns(valores),
      });
    }

    recordOrder++;
    registros.push({
      id: buildSnapshotId(bloco.mesRef, instituicao, blocoIndex, recordOrder),
      mesRef: bloco.mesRef,
      mesLabel: bloco.mesLabel,
      instituicao,
      arquivoOrigem: fileName,
      hash,
      resumoValores,
      operacoes,
      totalOperacoes: operacoes.length,
      detalheLinhas: lines.slice(institutionInfo.startIndex, cursor),
      importadoEm: new Date().toISOString(),
      ...mapValuesToColumns(resumoValores),
    });
  }

  return registros;
}

function criarResumoMensal(bloco, registros, fileName, hash) {
  const intervalo = bloco.mesRef.split('/');
  const ano = Number(intervalo[1]);
  const mes = Number(intervalo[0]);

  return {
    mesRef: bloco.mesRef,
    mesLabel: bloco.mesLabel,
    ano,
    mes,
    arquivoOrigem: fileName,
    hash,
    resumoValores: bloco.resumoValores,
    semRegistros: Boolean(bloco?.semRegistros),
    totalInstituicoes: registros.length,
    totalOperacoes: registros.reduce((sum, item) => sum + item.totalOperacoes, 0),
    detalheLinhas: bloco.detalheLinhas,
    importadoEm: new Date().toISOString(),
    ...mapValuesToColumns(bloco.resumoValores),
  };
}

function criarSnapshotConsolidado(bloco, blocoIndex, fileName, hash) {
  return {
    id: buildSnapshotId(bloco.mesRef, 'CONSOLIDADO SCR', blocoIndex, 0),
    mesRef: bloco.mesRef,
    mesLabel: bloco.mesLabel,
    instituicao: 'CONSOLIDADO SCR',
    arquivoOrigem: fileName,
    hash,
    resumoValores: bloco.resumoValores,
    operacoes: [],
    totalOperacoes: 0,
    detalheLinhas: bloco.detalheLinhas,
    importadoEm: new Date().toISOString(),
    sintetico: true,
    semRegistros: Boolean(bloco?.semRegistros),
    ...mapValuesToColumns(bloco.resumoValores),
  };
}

async function substituirMesesExistentes(mesesRef) {
  const months = new Set(mesesRef);
  const [resumos, snapshots] = await Promise.all([
    getAll('registrato_scr_resumo_mensal'),
    getAll('registrato_scr_snapshot'),
  ]);

  for (const resumo of resumos) {
    if (months.has(resumo.mesRef)) {
      await deleteItem('registrato_scr_resumo_mensal', resumo.mesRef);
    }
  }

  for (const snapshot of snapshots) {
    if (months.has(snapshot.mesRef)) {
      await deleteItem('registrato_scr_snapshot', snapshot.id);
    }
  }
}

function consumeInstitution(lines, startIndex) {
  const parts = [lines[startIndex]];
  let cursor = startIndex + 1;

  while (cursor < lines.length && isInstitutionContinuationLine(lines[cursor])) {
    parts.push(lines[cursor]);
    cursor++;
  }

  return {
    startIndex,
    nextIndex: cursor,
    value: parts.join(' ').trim(),
  };
}

function buildSnapshotId(mesRef, instituicao, blocoIndex, recordOrder) {
  return `${mesRef}:${String(blocoIndex).padStart(2, '0')}:${String(recordOrder).padStart(3, '0')}:${slugify(instituicao)}`;
}

function montarPeriodo(blocos) {
  if (blocos.length === 0) return '';
  const ordenados = blocos.slice().sort((a, b) => sortMesRef(a.mesRef) - sortMesRef(b.mesRef));
  const primeiro = ordenados[0]?.mesRef;
  const ultimo = ordenados[ordenados.length - 1]?.mesRef;
  return primeiro === ultimo ? primeiro : `${primeiro} - ${ultimo}`;
}

function sortMesRef(mesRef) {
  const [mes, ano] = String(mesRef ?? '').split('/').map(Number);
  return (ano * 100) + mes;
}

function parseMonthReference(line) {
  const normalized = normalizeForMatch(line);
  const match = normalized.match(MONTH_LINE_RE);
  if (!match) return null;

  const mes = Number(match[1]);
  const ano = Number(match[2]);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) {
    return null;
  }

  return {
    mesRef: `${String(mes).padStart(2, '0')}/${ano}`,
    mesLabel: `${MESES_ABREV[mes - 1]}/${ano}`,
  };
}

function mapValuesToColumns(values) {
  const mapped = {};
  SUMMARY_FIELDS.forEach((field, index) => {
    mapped[field] = values[index] ?? null;
  });
  return mapped;
}

function isMoneyLine(line) {
  return MONEY_LINE_RE.test(String(line ?? '').trim());
}

function extractMoneyValues(line) {
  return [...String(line ?? '').matchAll(/R\$\s*([\d.]+,\d{2})/gi)]
    .map(match => parseBRL(match[1]))
    .filter(value => Number.isFinite(value));
}

function parseMoneyLine(line) {
  const match = String(line ?? '').trim().match(MONEY_LINE_RE);
  return match ? parseBRL(match[1]) : NaN;
}

function resolverResumoValores(bloco) {
  const resumoOriginal = SUMMARY_FIELDS.map((_, index) => {
    const value = Number(bloco?.resumoValores?.[index]);
    return Number.isFinite(value) && value > 0 ? value : null;
  });

  if (resumoOriginal.some(value => value !== null)) {
    return resumoOriginal;
  }

  const text = [
    ...(Array.isArray(bloco?.detalheLinhas) ? bloco.detalheLinhas : []),
    String(bloco?.rawText ?? ''),
  ].join(' ');

  const resumoPorLabels = SUMMARY_FIELDS.map(field => {
    const match = normalizeForMatch(text).match(SUMMARY_INLINE_PATTERNS[field]);
    return match ? parseBRL(match[1]) : null;
  });

  return resumoPorLabels.some(value => Number.isFinite(value) && value > 0)
    ? resumoPorLabels
    : resumoOriginal;
}

function isRegistratoEntryMeaningful(item) {
  if (!item) return false;
  if (item?.semRegistros) return true;

  if (Number(item?.totalOperacoes || 0) > 0) return true;

  return SUMMARY_FIELDS.some(field => {
    const value = Number(item?.[field]);
    return Number.isFinite(value) && value > 0;
  });
}

function hasSemRegistrosNotice(bloco) {
  const text = [
    ...(Array.isArray(bloco?.detalheLinhas) ? bloco.detalheLinhas : []),
    String(bloco?.rawText ?? ''),
  ].join(' ');

  return normalizeForMatch(text).includes('NAO FORAM ENCONTRADOS REGISTROS DE OPERACOES DE CREDITO EM NOME DO CLIENTE PARA O MES DE REFERENCIA');
}

function looksLikeInstitutionLine(line) {
  const normalized = normalizeForMatch(line);
  if (!normalized || isCategoryLine(line) || isMoneyLine(line) || MONTH_LINE_RE.test(normalized)) {
    return false;
  }

  return isUppercaseLike(line) && INSTITUTION_HINT_RE.test(normalized);
}

function isInstitutionContinuationLine(line) {
  const normalized = normalizeForMatch(line);
  if (!normalized || isCategoryLine(line) || isMoneyLine(line) || MONTH_LINE_RE.test(normalized)) {
    return false;
  }
  return isUppercaseLike(line);
}

function isCategoryLine(line) {
  return CATEGORY_LABELS.has(normalizeForMatch(line));
}

function canonicalCategory(line) {
  return CATEGORY_LABELS.get(normalizeForMatch(line)) || String(line ?? '').trim();
}

function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isUppercaseLike(value) {
  const text = String(value ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  if (!text) return false;
  return text === text.toUpperCase();
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
