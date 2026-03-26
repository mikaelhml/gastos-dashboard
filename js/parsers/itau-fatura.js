import { addItem, getAll, bulkAdd, deleteItem } from '../db.js';
import { categorizar } from '../utils/categorizer.js';
import { computeHash, extrairEstruturaPDF, parseBRL, MESES_ABREV } from './pdf-utils.js';

const RE_DATA_SLASH = /^\d{2}\/\d{2}(?:\/\d{4})?$/;
const RE_VALOR_ITEM = /^[\d.]{1,10},\d{2}$/;
const RE_TRANSACAO = /^(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+([\d.]{1,10},\d{2})$/;

const SECTION_PATTERNS = {
  purchases: ['LANCAMENTOS COMPRAS E SAQUES'],
  services: ['LANCAMENTOS PRODUTOS SERVICOS', 'LANCAMENTOS PRODUTOS E SERVICOS'],
  installments: ['COMPRAS PARCELADAS', 'PROXIMAS FATURAS', 'PROXIMA FATURA'],
  payments: ['PAGAMENTO EFETUADO', 'PAGAMENTOS EFETUADOS', 'TOTAL DOS PAGAMENTOS', 'PAGAMENTO VIA CONTA'],
  // Padrões que encerram definitivamente a seção de lançamentos
  stop: [
    'RESUMO DA FATURA',
    'TOTAL DA FATURA',
    'SALDO FINANCIADO',
    'ENCARGOS',
    'JUROS',
    'IOF',
    'LIMITE',
    'PAGAMENTO MINIMO',
    'PARCELAS FIXAS',
    'ESTAMOS LHE ENVIANDO',
    'OUTRA VIA',
    'CASO VOC',
    'PAGAMENTO OBRIGATORIO',
    'CONSULTE OUTRAS OPCOES',
    'ANUIDADE DIFERENCIADA',
  ],
  // Padrões que devem ser ignorados (linha pulada), mas NÃO mudam a seção atual
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
    'TOTAL DOS LANCAMENTOS',
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
    return { importado: 0, duplicata: true, mes: '' };
  }

  onProgress(30);
  const { grupos, linhas: linhasRaw } = await extrairEstruturaPDF(buffer, 3);
  const linhasColunadas = montarLinhasColunadas(grupos);
  const linhas = linhasColunadas.flatMap(linha => [linha.left, linha.right].filter(Boolean));
  onProgress(50);

  const emissor = detectarEmissorItau(linhas);
  if (!emissor) {
    return {
      importado: 0,
      duplicata: false,
      mes: '',
      erro: 'Este PDF de fatura não foi reconhecido como Itaú/Visa. O layout atual não é suportado pelo parser Itaú.',
    };
  }

  const mesFatura = extrairMesFaturaItau(linhas);
  const lancamentos = parsearLancamentosItau(linhasColunadas, grupos, linhasRaw, mesFatura);
  console.log(`[itau-fatura] "${file.name}": ${lancamentos.length} lançamentos, fatura=${mesFatura || 'não identificada'}`);

  if (lancamentos.length === 0) {
    if (isFaturaSemLancamentos(linhas)) {
      onProgress(100);
      return { importado: 0, duplicata: false, mes: mesFatura || '' };
    }
    const amostra = linhas.slice(0, 30).join('\n');
    console.error('[itau-fatura] Nenhum lançamento. Primeiras 30 linhas:\n', amostra);
    return {
      importado: 0,
      duplicata: false,
      mes: mesFatura || '',
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
      erro: `Não foi possível identificar o mês da fatura em "${file.name}". Verifique o console (F12).`,
      debug: amostra,
    };
  }

  onProgress(75);

  const todos = await getAll('lancamentos');
  for (const item of todos) {
    if (item.fatura === mesFatura) {
      await deleteItem('lancamentos', item.id);
    }
  }

  await bulkAdd('lancamentos', lancamentos.map(item => ({
    ...item,
    fatura: mesFatura,
  })));

  onProgress(85);

  await addItem('pdfs_importados', {
    hash,
    nome: file.name,
    tamanho: file.size,
    importadoEm: new Date().toISOString(),
    transacoes: lancamentos.length,
    mes: mesFatura,
    tipo: 'fatura-itau',
  });

  onProgress(100);
  return { importado: lancamentos.length, duplicata: false, mes: mesFatura };
}

function montarLinhasColunadas(grupos) {
  const maxX = grupos.reduce((acc, grupo) => {
    const maiorGrupo = grupo.reduce((inner, item) => Math.max(inner, item.x || 0), 0);
    return Math.max(acc, maiorGrupo);
  }, 0);
  const columnSplit = maxX > 0 ? maxX * 0.52 : 280;

  return grupos.map(grupo => {
    const leftItems = grupo.filter(item => (item.x || 0) < columnSplit);
    const rightItems = grupo.filter(item => (item.x || 0) >= columnSplit);

    return {
      page: grupo[0]?.page ?? 1,
      y: grupo[0]?.y ?? 0,
      left: joinItems(leftItems),
      right: joinItems(rightItems),
    };
  });
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

function parsearLancamentosItau(linhasColunadas, grupos, linhasRaw, mesFatura) {
  const colunas = separarPorColuna(linhasColunadas);
  let rowsCompras = [
    ...parseTransactionSections(colunas.left, mesFatura),
    ...parseTransactionSections(colunas.right, mesFatura),
  ];
  const parcelasMap = new Map([
    ...parseInstallmentSection(colunas.left),
    ...parseInstallmentSection(colunas.right),
  ]);

  console.log(`[itau-fatura][debug] left=${colunas.left.length} rows, right=${colunas.right.length} rows`);
  console.log(`[itau-fatura][debug] strategy1 (sections): ${rowsCompras.length} transações`);
  console.log('[itau-fatura][debug] left sample:', colunas.left.slice(0, 5).map(r => r.text));
  console.log('[itau-fatura][debug] right sample:', colunas.right.slice(0, 5).map(r => r.text));

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
    const parcelaInfo = parcelasMap.get(normalizarChaveDescricao(lancamento.desc));
    return parcelaInfo
      ? { ...lancamento, ...parcelaInfo }
      : lancamento;
  });
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
  let currentSection = null;
  let pending = null;

  for (const row of rows) {
    const text = normalizeLine(row.text);
    if (!text) continue;

    const section = detectarSection(text);
    if (section) {
      if (section === 'ignore') {
        console.log(`[itau-fatura][debug] STOP na secao por: "${text.slice(0, 60)}"`);
      }
      currentSection = section;
      pending = null;
      continue;
    }

    if (!isTransactionSection(currentSection) || isIgnorableRow(text)) {
      pending = null;
      continue;
    }

    if (RE_DATA_SLASH.test(text)) {
      pending = text;
      continue;
    }

    if (pending) {
      pending = `${pending} ${text}`.trim();
      const parsed = parseTransactionLine(pending, mesFatura);
      if (parsed) {
        lancamentos.push(parsed);
        pending = null;
      }
      continue;
    }

    const parsed = parseTransactionLine(text, mesFatura);
    if (parsed) {
      lancamentos.push(parsed);
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseInstallmentSection(rows) {
  const installments = new Map();
  let currentSection = null;

  for (const row of rows) {
    const text = normalizeLine(row.text);
    if (!text) continue;

    const section = detectarSection(text);
    if (section) {
      currentSection = section;
      continue;
    }

    if (currentSection !== 'installments' || isIgnorableRow(text)) continue;

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
  // Usa 'stop' (não 'ignore') — 'ignore' tem keywords curtas como CARTAO/TITULAR
  // que causam falsos positivos em sub-cabeçalhos de múltiplos cartões
  if (matchesAny(text, SECTION_PATTERNS.stop)) return 'ignore';
  return null;
}

function isTransactionSection(section) {
  return section === 'purchases' || section === 'services';
}

function isIgnorableRow(text) {
  const normalized = normalizeForMatch(text);
  return (
    matchesAny(text, SECTION_PATTERNS.ignore) ||
    matchesAny(text, SECTION_PATTERNS.payments) ||
    normalized.startsWith('DATA ') ||
    normalized.startsWith('ESTABELECIMENTO ') ||
    normalized.startsWith('VALOR ') ||
    normalized.startsWith('PRODUTOS ') ||
    normalized.startsWith('SERVICOS ')
  );
}

function parseTransactionFallback(rows, mesFatura) {
  const lancamentos = [];
  let pending = null;

  for (const row of rows) {
    const text = normalizeLine(row.text);
    if (!text || isIgnorableRow(text) || matchesAny(text, SECTION_PATTERNS.installments)) {
      pending = null;
      continue;
    }

    if (RE_DATA_SLASH.test(text)) {
      pending = text;
      continue;
    }

    if (pending) {
      pending = `${pending} ${text}`.trim();
      const parsed = parseTransactionLine(pending, mesFatura);
      if (parsed) {
        lancamentos.push(parsed);
        pending = null;
      }
      continue;
    }

    const parsed = parseTransactionLine(text, mesFatura);
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
      .map(item => normalizeLine(item.str))
      .filter(Boolean);

    const dataIndex = itens.findIndex(item => RE_DATA_SLASH.test(item));
    const valorIndex = findLastIndex(itens, item => RE_VALOR_ITEM.test(item));
    if (dataIndex < 0 || valorIndex <= dataIndex) continue;

    const textoLinha = itens.join(' ');
    if (isIgnorableRow(textoLinha)) continue;

    const desc = sanitizarDescricaoItau(itens.slice(dataIndex + 1, valorIndex).join(' '));
    if (!desc || desc.length < 2) continue;

    const parsed = parseTransactionLine(`${itens[dataIndex]} ${desc} ${itens[valorIndex]}`, mesFatura);
    if (parsed) {
      lancamentos.push(parsed);
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionSlidingGroupFallback(grupos, mesFatura) {
  const prepared = grupos.map(grupo => ({
    page: grupo[0]?.page ?? 1,
    tokens: grupo.map(item => normalizeLine(item.str)).filter(Boolean),
    text: grupo.map(item => normalizeLine(item.str)).filter(Boolean).join(' '),
  }));

  const lancamentos = [];

  for (let i = 0; i < prepared.length; i++) {
    const current = prepared[i];
    if (!current.tokens.some(token => RE_DATA_SLASH.test(token))) continue;
    if (isIgnorableRow(current.text)) continue;

    let buffer = [...current.tokens];
    let consumedEnd = i;

    for (let j = i; j < Math.min(i + 5, prepared.length); j++) {
      if (j > i) {
        const next = prepared[j];
        if (next.page !== current.page) break;
        if (isIgnorableRow(next.text)) continue;

        const hasNewDate = next.tokens.some(token => RE_DATA_SLASH.test(token));
        const alreadyHasValue = findLastIndex(buffer, token => RE_VALOR_ITEM.test(token)) > buffer.findIndex(token => RE_DATA_SLASH.test(token));
        if (hasNewDate && alreadyHasValue) {
          break;
        }

        buffer = buffer.concat(next.tokens);
        consumedEnd = j;
      }

      const parsed = parseTransactionTokens(buffer, mesFatura);
      if (parsed) {
        lancamentos.push(parsed);
        i = consumedEnd;
        break;
      }
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionLine(text, mesFatura) {
  const extracted = extractTransactionCandidate(text);
  if (!extracted) return null;

  const { rawData, rawDesc, rawValor } = extracted;
  const dataInfo = parseDataItau(rawData, mesFatura);
  const valor = parseBRL(rawValor);
  const desc = sanitizarDescricaoItau(rawDesc);

  if (!dataInfo || !Number.isFinite(valor) || valor <= 0 || !desc || desc.length < 2) {
    return null;
  }

  return {
    data: dataInfo.data,
    fatura: mesFatura || dataInfo.mes,
    desc,
    cat: categorizar(desc),
    valor,
  };
}

function parseTransactionRawLinesFallback(linhas, mesFatura) {
  const lancamentos = [];

  for (let i = 0; i < linhas.length; i++) {
    let buffer = normalizeLine(linhas[i]);
    if (!buffer || isIgnorableRow(buffer)) continue;

    for (let j = i; j < Math.min(i + 4, linhas.length); j++) {
      if (j > i) {
        const next = normalizeLine(linhas[j]);
        if (!next || isIgnorableRow(next)) continue;
        buffer = `${buffer} ${next}`.trim();
      }

      const parsed = parseTransactionLine(buffer, mesFatura);
      if (parsed) {
        lancamentos.push(parsed);
        i = j;
        break;
      }
    }
  }

  return dedupeLancamentos(lancamentos);
}

function parseTransactionTokens(tokens, mesFatura) {
  const dataIndex = tokens.findIndex(token => RE_DATA_SLASH.test(token));
  const valorIndex = findLastIndex(tokens, token => RE_VALOR_ITEM.test(token));
  if (dataIndex < 0 || valorIndex <= dataIndex) return null;

  const rawData = tokens[dataIndex];
  const rawValor = tokens[valorIndex];
  const rawDesc = tokens.slice(dataIndex + 1, valorIndex).join(' ').trim();
  if (!rawDesc) return null;

  return parseTransactionLine(`${rawData} ${rawDesc} ${rawValor}`, mesFatura);
}

function parseInstallmentLine(text) {
  const valorMatch = text.match(/([\d.]{1,10},\d{2})\s*$/);
  if (!valorMatch) return null;

  const body = text.slice(0, text.lastIndexOf(valorMatch[0])).trim();
  const parcelaMatch = [...body.matchAll(/(\d{1,2}\/\d{1,2})/g)].pop();
  if (!parcelaMatch) return null;

  const [atual, total] = parcelaMatch[1].split('/').map(Number);
  if (
    !Number.isInteger(atual) ||
    !Number.isInteger(total) ||
    total < 2 ||
    total > 36 ||
    atual < 1 ||
    atual > total
  ) {
    return null;
  }

  let desc = body.slice(0, parcelaMatch.index).trim();
  if (!desc) {
    desc = body.replace(parcelaMatch[1], '').trim();
  }

  desc = sanitizarDescricaoItau(desc);
  if (!desc || desc.length < 2) return null;

  return {
    desc,
    parcela: `${atual}/${total}`,
  };
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

function extractTransactionCandidate(text) {
  const normalized = normalizeLine(text);
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
  const valores = [...normalized.matchAll(/([\d.]{1,10},\d{2})/g)];
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

function dedupeLancamentos(lancamentos) {
  const seen = new Set();
  return lancamentos.filter(item => {
    const key = `${item.data}|${item.desc}|${item.valor.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
