/**
 * itau-conta.js — Parser de Extrato Conta Corrente Itaú (PDF)
 *
 * Formato real identificado nos PDFs gerados pelo internet banking Itaú:
 *   - Linhas de transação: "DD/MM/YYYY  DESCRIÇÃO  ±VALOR"
 *   - Linhas de saldo:     "DD/MM/YYYY  SALDO DO DIA  SALDO" (ignoradas como transação)
 *   - PDF ordenado do mais recente (topo) para o mais antigo (base)
 *   - Valor negativo = débito (saída), positivo = crédito (entrada)
 *
 * Exemplo:
 *   12/03/2026 SALDO DO DIA 95,84
 *   11/03/2026 PIX TRANSF MIKAEL 11/03 5.000,00
 *   09/03/2026 FATURAAZUL INFINITE -12.461,32
 */

import { addItem, putItem, getAll, bulkAdd, deleteItem } from '../db.js';
import { inferirCanal } from '../utils/transaction-tags.js';
import { buildImportQuality } from '../utils/import-integrity.js';
import { applyCategorizationToImportedRows, buildCategorizationRuntime } from '../utils/categorization-engine.js';
import {
  computeHash,
  extrairLinhasPDF,
  parseBRL,
  MESES_ABREV,
} from './pdf-utils.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const MESES_NUM = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Regex: DD/MM/YYYY + descrição + valor (com ou sem sinal, com ou sem milhar)
const RE_TX = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})\s*$/;

// Linhas que nunca são transações
const RE_SALDO_DIA  = /SALDO\s+DO\s+DIA/i;
const RE_IGNORAR    = /^(data\s+lan[çc]|per[íi]odo|emitido|saldo\s+em\s+conta|limite|total\s+contratado|\*\s+total|extrato\s+conta|aviso!|os\s+saldos|consultas|recla|deficiente|0800|4004|ligue|sac:|ouvidoria)/i;

// ── Utilitários de data ───────────────────────────────────────────────────────

/** "DD/MM/YYYY" → ts numérico para comparação */
function dateTs(dateStr) {
  const [dd, mm, yyyy] = dateStr.split('/').map(Number);
  return yyyy * 10000 + mm * 100 + dd;
}

/** "DD/MM/YYYY" → "Mar/2026" */
function dataMesLabel(dateStr) {
  const [, mm, yyyy] = dateStr.split('/');
  return `${MESES_NUM[parseInt(mm, 10) - 1]}/${yyyy}`;
}

/** "Mar/2026" → "Fev/2026" */
function mesAnteriorStr(mesStr) {
  const [mes, ano] = mesStr.split('/');
  const idx = MESES_ABREV.indexOf(mes);
  if (idx <= 0) return `Dez/${parseInt(ano, 10) - 1}`;
  return `${MESES_ABREV[idx - 1]}/${ano}`;
}

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Parseia linhas extraídas do PDF.
 * Ignora "SALDO DO DIA" e linhas de rodapé.
 * Retorna transações + mapa de saldos diários.
 */
function parsearLinhas(linhas) {
  const transacoes = [];
  const saldosDia  = {}; // "DD/MM/YYYY" → saldo (number)

  for (const linha of linhas) {
    if (!linha?.trim()) continue;
    if (RE_IGNORAR.test(linha.trim())) continue;

    const m = linha.match(RE_TX);
    if (!m) continue;

    const [, dateStr, desc, valorRaw] = m;
    const valor = parseBRL(valorRaw.replace(/^-/, '').trim());
    if (isNaN(valor)) continue;

    // Linha de saldo diário: capturar para anchor
    if (RE_SALDO_DIA.test(desc)) {
      saldosDia[dateStr] = parseBRL(valorRaw.replace(/^-/, '').trim());
      continue;
    }

    const tipo = valorRaw.trim().startsWith('-') ? 'saida' : 'entrada';
    const mes  = dataMesLabel(dateStr);

    transacoes.push({
      data: dateStr,
      mes,
      tipo,
      desc: desc.trim(),
      valor,
      banco: 'itau',
    });
  }

  return { transacoes, saldosDia };
}

/**
 * Extrai o saldo âncora: o SALDO DO DIA da data mais antiga no PDF.
 * Esse valor representa o saldo ao final daquele dia e serve como
 * ponto de partida para recalcularSummary().
 */
function extrairAnchorSaldo(saldosDia) {
  const datas = Object.keys(saldosDia);
  if (datas.length === 0) return null;

  const maisAntiga = datas.reduce((min, d) => (dateTs(d) < dateTs(min) ? d : min));
  return { dateStr: maisAntiga, saldo: saldosDia[maisAntiga] };
}

// ── Recalcular extrato_summary ────────────────────────────────────────────────

async function recalcularSummary() {
  const transacoes   = await getAll('extrato_transacoes');
  const summaryAtual = await getAll('extrato_summary');

  const porMes = {};
  for (const t of transacoes) {
    if (!porMes[t.mes]) porMes[t.mes] = { entradas: 0, saidas: 0, rendimento: 0 };
    if (t.tipo === 'entrada') {
      porMes[t.mes].entradas += t.valor;
      if (t.cat === 'Rendimento') porMes[t.mes].rendimento += t.valor;
    } else {
      porMes[t.mes].saidas += t.valor;
    }
  }

  // Meses com transações, ordenados cronologicamente
  const mesList = Object.keys(porMes).sort((a, b) => {
    const [mA, aA] = a.split('/');
    const [mB, aB] = b.split('/');
    if (aA !== aB) return parseInt(aA, 10) - parseInt(aB, 10);
    return MESES_ABREV.indexOf(mA) - MESES_ABREV.indexOf(mB);
  });

  let prevSaldo = null;

  for (const mes of mesList) {
    const g = porMes[mes];
    let saldoInicial;

    if (prevSaldo !== null) {
      saldoInicial = prevSaldo;
    } else {
      const mesAnt = mesAnteriorStr(mes);
      const anchor = summaryAtual.find(s => s.mes === mesAnt);
      if (anchor && typeof anchor.saldoFinal === 'number') {
        saldoInicial = anchor.saldoFinal;
      } else {
        const existing = summaryAtual.find(s => s.mes === mes);
        saldoInicial = (existing && typeof existing.saldoInicial === 'number')
          ? existing.saldoInicial : 0;
      }
    }

    const saldoFinal = parseFloat((saldoInicial + g.entradas - g.saidas).toFixed(2));

    await putItem('extrato_summary', {
      mes,
      entradas:   parseFloat(g.entradas.toFixed(2)),
      saidas:     parseFloat(g.saidas.toFixed(2)),
      saldoFinal,
      saldoInicial,
      rendimento: parseFloat(g.rendimento.toFixed(2)),
    });

    prevSaldo = saldoFinal;
  }
}

// ── Exportação principal ──────────────────────────────────────────────────────

/**
 * Importa um PDF de extrato conta corrente Itaú.
 *
 * @param {File}     file
 * @param {Function} onProgress — callback (0–100)
 * @returns {{ importado, duplicata, mes, erro?, debug? }}
 */
export async function importarItauConta(file, onProgress = () => {}) {
  onProgress(5);

  // 1. ArrayBuffer
  const buffer = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => res(e.target.result);
    reader.onerror = () => rej(new Error('Erro ao ler o arquivo PDF.'));
    reader.readAsArrayBuffer(file);
  });

  onProgress(10);

  // 2. Verificar duplicata via SHA-256
  const hash           = await computeHash(buffer);
  const pdfsImportados = await getAll('pdfs_importados');
  if (pdfsImportados.some(p => p.hash === hash)) {
    return {
      importado: 0,
      duplicata: true,
      mes: '',
      warnings: [{ code: 'duplicate-file', level: 'info', message: 'Este PDF ja havia sido importado anteriormente.' }],
    };
  }

  onProgress(30);

  // 3. Extrair linhas do PDF
  const linhas = await extrairLinhasPDF(buffer);
  onProgress(60);

  // 4. Parsear transações e saldos diários
  const { transacoes, saldosDia } = parsearLinhas(linhas);
  const anchor = extrairAnchorSaldo(saldosDia);

  console.log(`[itau-conta] "${file.name}": ${transacoes.length} transações, anchor=`, anchor);

  onProgress(65);

  // 5. Sem transações → erro com amostra de diagnóstico
  if (transacoes.length === 0) {
    const amostra = linhas.slice(0, 30).join('\n');
    console.error('[itau-conta] Nenhuma transação. Primeiras 30 linhas:\n', amostra);
    return {
      importado: 0, duplicata: false, mes: '',
      erro:  `Nenhuma transação encontrada em "${file.name}". Verifique o console (F12).`,
      debug: amostra,
    };
  }

  const [rules, memories] = await Promise.all([
    getAll('categorizacao_regras'),
    getAll('categorizacao_memoria'),
  ]);
  const categorizationRuntime = buildCategorizationRuntime({ rules, memories });
  const categorizedTransacoes = applyCategorizationToImportedRows(
    transacoes,
    categorizationRuntime,
    {
      source: 'conta',
      direction: tx => tx.tipo,
    },
  ).map(tx => ({
    ...tx,
    canal: inferirCanal({ ...tx, source: 'conta' }),
  }));
  onProgress(70);

  // 7. Determinar meses cobertos
  const mesesNoPDF = [...new Set(categorizedTransacoes.map(t => t.mes))];

  // 8. Remover transações existentes dos mesmos meses e da mesma conta (não apagar outras contas)
  const todas = await getAll('extrato_transacoes');
  for (const t of todas) {
    if (mesesNoPDF.includes(t.mes) && t.banco === 'itau') await deleteItem('extrato_transacoes', t.id);
  }

  // 9. Inserir novas transações
  await bulkAdd('extrato_transacoes', categorizedTransacoes);
  onProgress(80);

  // 10. Definir âncora de saldo no summary (mês mais antigo do PDF)
  if (anchor) {
    const mesAnchor = dataMesLabel(anchor.dateStr);
    const summaryAtual = await getAll('extrato_summary');
    const entrada = summaryAtual.find(s => s.mes === mesAnchor);
    if (entrada) {
      if (entrada.saldoFinal !== anchor.saldo) {
        await putItem('extrato_summary', { ...entrada, saldoFinal: anchor.saldo });
      }
    } else {
      await putItem('extrato_summary', {
        mes: mesAnchor, entradas: 0, saidas: 0,
        saldoFinal: anchor.saldo, saldoInicial: 0,
        rendimento: 0, apenasHistorico: true,
      });
    }
  }

  onProgress(85);

  // 11. Registrar PDF importado
  const mesLabel = mesesNoPDF.join(', ');
  await addItem('pdfs_importados', {
    hash, nome: file.name, tamanho: file.size,
    importadoEm: new Date().toISOString(),
    transacoes:  categorizedTransacoes.length,
    mes:         mesLabel,
    saldoAnchor: anchor?.saldo ?? null,
  });

  // 12. Recalcular summary encadeado
  await recalcularSummary();
  onProgress(100);

  return {
    importado: categorizedTransacoes.length,
    duplicata: false,
    mes: mesLabel,
    quality: buildImportQuality({
      importedCount: categorizedTransacoes.length,
      warningCount: 0,
      unitLabel: 'transação',
    }),
    warnings: [],
  };
}
