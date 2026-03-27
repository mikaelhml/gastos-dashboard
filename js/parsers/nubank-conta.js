/**
 * nubank-conta.js — Parser de Extrato Conta Nubank (PDF)
 *
 * Formato real identificado nas PDFs:
 *   - Cabeçalho: "DD MMM YYYY  Total de entradas/saídas  + valor_total"
 *   - Linhas de transação: "Descrição da operação  X.XXX,YY"
 *   - Saldo: "Saldo inicial X.XXX,YY" / "Saldo final do período X.XXX,YY"
 *
 * Exemplo de bloco real:
 *   06 FEV 2026 Total de entradas + 9.820,75
 *   Transferência Recebida GS3 TECNOLOGIA E GESTAO DA INFORMACAO 9.820,75
 *   Total de saídas - 11.765,04
 *   Pagamento de boleto efetuado AABR 153,68
 *   Transferência enviada pelo Pix Claro - 40.432.544/0001-47 - CLARO PAY 119,90
 */

import { addItem, putItem, getAll, bulkAdd, deleteItem } from '../db.js';
import { categorizar } from '../utils/categorizer.js';
import { inferirCanal } from '../utils/transaction-tags.js';
import {
  computeHash,
  extrairLinhasPDF,
  parseBRL,
  parseDataNubank,
  MESES_ABREV,
  MESES_NUBANK,
  MES_PT_MAP,
} from './pdf-utils.js';

// ── Constantes ────────────────────────────────────────────────────────────────

// ── Parsing de período (nome do arquivo) ─────────────────────────────────────

function parsePeriodoFilename(filename) {
  const m = filename.toUpperCase()
    .match(/NU_\d+_\d+([A-Z]{3})(\d{4})_\d+([A-Z]{3})(\d{4})/);
  if (!m) return null;
  return {
    mesInicio:    `${MES_PT_MAP[m[1]] || m[1]}/${m[2]}`,
    mesFim:       `${MES_PT_MAP[m[3]] || m[3]}/${m[4]}`,
    mesPrincipal: `${MES_PT_MAP[m[3]] || m[3]}/${m[4]}`,
  };
}

// ── Parser principal de transações ────────────────────────────────────────────

/**
 * Parseia as linhas extraídas do PDF e retorna transações.
 *
 * Máquina de estados:
 *   dataAtual  — data do bloco corrente (definida por linhas "DD MMM YYYY")
 *   tipoAtual  — 'entrada' | 'saida' (definida por "Total de entradas/saídas")
 *
 * Uma linha é considerada transação quando:
 *   • Não é linha de data / total / saldo / rodapé
 *   • Termina com valor BRL: "X.XXX,YY"
 */
function parsearTransacoes(linhas) {
  const transacoes = [];
  let dataAtual = null;
  let tipoAtual = null;

  // Regexes de classificação de linha
  const RE_DATA_INICIO  = /^\d{2}\s+[A-Z]{3}\s+\d{4}/;          // "03 FEV 2026 ..."
  const RE_TOT_ENT      = /total\s+de\s+entradas/i;
  const RE_TOT_SAI      = /total\s+de\s+sa[íi]das/i;
  const RE_SALDO        = /^saldo/i;
  const RE_RS           = /^r\$/i;
  const RE_MOVIM        = /^movimenta[çc]/i;
  const RE_RODAPE       = /^(tem\s+alguma|atendimento|capitais|metropolitanas|demais|agência:|conta\s+corrente)/i;
  const RE_DETALHE_CTH  = /agência:\s*\d/i;                      // linha de detalhe de conta
  // Valor BRL no final da linha: "1.234,56" ou "234,56"
  const RE_VALOR_FINAL  = /([\d.]{1,10},\d{2})\s*$/;

  for (const linha of linhas) {
    if (!linha) continue;

    // ── 1. Linha de data (cabeçalho de dia) ──────────────────────────────────
    if (RE_DATA_INICIO.test(linha)) {
      const info = parseDataNubank(linha);
      if (info) {
        dataAtual = info;
        // Pode conter tipo na mesma linha: "03 FEV 2026 Total de saídas - 335,00"
        if (RE_TOT_ENT.test(linha)) tipoAtual = 'entrada';
        else if (RE_TOT_SAI.test(linha)) tipoAtual = 'saida';
      }
      continue;
    }

    // ── 2. Subtítulos de tipo dentro de um dia ────────────────────────────────
    if (RE_TOT_ENT.test(linha)) { tipoAtual = 'entrada'; continue; }
    if (RE_TOT_SAI.test(linha)) { tipoAtual = 'saida';   continue; }

    // ── 3. Linhas que nunca são transações ────────────────────────────────────
    if (RE_SALDO.test(linha))      continue;
    if (RE_RS.test(linha))         continue;
    if (RE_MOVIM.test(linha))      continue;
    if (RE_RODAPE.test(linha))     continue;
    if (RE_DETALHE_CTH.test(linha)) continue;

    // ── 4. Sem contexto → não há como classificar ────────────────────────────
    if (!dataAtual || !tipoAtual) continue;

    // ── 5. Tentar extrair transação (linha que termina com BRL) ──────────────
    const mValor = linha.match(RE_VALOR_FINAL);
    if (!mValor) continue;

    const valor = parseBRL(mValor[1]);
    if (isNaN(valor) || valor <= 0) continue;

    // Descrição = tudo antes do valor, removendo traços/espaços extras no fim
    const descRaw = linha.slice(0, linha.lastIndexOf(mValor[0])).trim();
    const desc    = descRaw.replace(/\s*[-–]\s*$/, '').trim();
    if (!desc || desc.length < 4) continue;

    transacoes.push({
      data:  dataAtual.data,
      mes:   dataAtual.mes,
      tipo:  tipoAtual,
      desc,
      valor,
      banco: 'nubank',
    });
  }

  return transacoes;
}

// ── Extração de saldos ────────────────────────────────────────────────────────

function extrairSaldos(linhas) {
  let saldoInicial = null;
  let saldoFinal   = null;

  for (const linha of linhas) {
    const low = linha.toLowerCase();

    // "Saldo inicial 3.111,70" ou "Saldo anterior 3.111,70"
    if ((low.includes('saldo inicial') || low.includes('saldo anterior'))
        && !low.includes('rendimento')) {
      const m = linha.match(/([\d.]+,\d{2})\s*$/);
      if (m) saldoInicial = parseBRL(m[1]);
    }

    // "Saldo final do período 669,15" — sem "Rendimento" ou "Total" misturado
    if (low.includes('saldo final')
        && !low.includes('rendimento')
        && !low.includes('total')
        && !low.includes('r$')) {
      const m = linha.match(/([\d.]+,\d{2})\s*$/);
      if (m) saldoFinal = parseBRL(m[1]);
    }

    // "R$ 669,15 Total de entradas ..." — saldo final como primeiro token
    if (/^r\$\s*[\d.]+,\d{2}/i.test(linha)) {
      const m = linha.match(/^R\$\s*([\d.]+,\d{2})/i);
      if (m && saldoFinal === null) saldoFinal = parseBRL(m[1]);
    }
  }

  return { saldoInicial, saldoFinal };
}

// ── Recalcular extrato_summary ────────────────────────────────────────────────

function mesAnteriorStr(mesStr) {
  const [mes, ano] = mesStr.split('/');
  const idx = MESES_ABREV.indexOf(mes);
  if (idx <= 0) return `Dez/${parseInt(ano, 10) - 1}`;
  return `${MESES_ABREV[idx - 1]}/${ano}`;
}

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

  const mesList = Object.keys(porMes).sort((a, b) => {
    const [mA, aA] = a.split('/');
    const [mB, aB] = b.split('/');
    if (aA !== aB) return parseInt(aA, 10) - parseInt(aB, 10);
    return MESES_ABREV.indexOf(mA) - MESES_ABREV.indexOf(mB);
  });

  let prevSaldo = null;

  for (let i = 0; i < mesList.length; i++) {
    const mes = mesList[i];
    const g   = porMes[mes];

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
 * Importa um PDF de extrato conta Nubank.
 *
 * @param {File}     file
 * @param {Function} onProgress  — callback (0–100)
 * @returns {{ importado, duplicata, mes, erro?, debug? }}
 */
export async function importarNubankConta(file, onProgress = () => {}) {
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
    return { importado: 0, duplicata: true, mes: '' };
  }

  onProgress(20);

  // 3. Período pelo nome do arquivo
  const periodo = parsePeriodoFilename(file.name);

  // 4. Extrair linhas do PDF
  onProgress(30);
  const linhas = await extrairLinhasPDF(buffer);
  onProgress(60);

  // 5. Parsear transações e saldos
  const transacoes = parsearTransacoes(linhas);
  const { saldoInicial, saldoFinal } = extrairSaldos(linhas);

  console.log(`[nubank-conta] "${file.name}": ${transacoes.length} transações, saldoInicial=${saldoInicial}, saldoFinal=${saldoFinal}`);

  onProgress(70);

  // 6. Sem transações → erro com amostra de diagnóstico
  if (transacoes.length === 0) {
    const amostra = linhas.slice(0, 30).join('\n');
    console.error('[nubank-conta] Nenhuma transação. Primeiras 30 linhas:\n', amostra);
    return {
      importado: 0, duplicata: false, mes: '',
      erro:  `Nenhuma transação encontrada em "${file.name}". Verifique o console (F12) para ver o texto extraído.`,
      debug: amostra,
    };
  }

  // 7. Categorizar
  for (const tx of transacoes) {
    tx.cat = categorizar(tx.desc);
    tx.canal = inferirCanal({ ...tx, source: 'conta' });
  }

  onProgress(75);

  // 8. Determinar meses cobertos
  const mesesNoPDF = periodo
    ? [periodo.mesPrincipal]
    : [...new Set(transacoes.map(t => t.mes))];

  // 9. Remover transações existentes do mesmo período e da mesma conta (não apagar outras contas)
  const todas = await getAll('extrato_transacoes');
  for (const t of todas) {
    if (mesesNoPDF.includes(t.mes) && t.banco === 'nubank') await deleteItem('extrato_transacoes', t.id);
  }

  // 10. Inserir novas transações
  await bulkAdd('extrato_transacoes', transacoes);
  onProgress(85);

  // 11. Atualizar âncora de saldo no summary se extraímos saldoInicial do PDF
  if (saldoInicial !== null) {
    const mesPrincipal = mesesNoPDF[0];
    const mesAnt       = mesAnteriorStr(mesPrincipal);
    const summaryAtual = await getAll('extrato_summary');
    const entrada      = summaryAtual.find(s => s.mes === mesAnt);
    if (entrada) {
      if (entrada.saldoFinal !== saldoInicial) {
        await putItem('extrato_summary', { ...entrada, saldoFinal: saldoInicial });
      }
    } else {
      await putItem('extrato_summary', {
        mes: mesAnt, entradas: 0, saidas: 0,
        saldoFinal: saldoInicial, saldoInicial: 0,
        rendimento: 0, apenasHistorico: true,
      });
    }
  }

  // 12. Registrar PDF
  await addItem('pdfs_importados', {
    hash, nome: file.name, tamanho: file.size,
    importadoEm:  new Date().toISOString(),
    transacoes:   transacoes.length,
    mes:          mesesNoPDF.join(', '),
    saldoInicial: saldoInicial ?? null,
    saldoFinal:   saldoFinal   ?? null,
  });

  // 13. Recalcular summary
  await recalcularSummary();
  onProgress(100);

  return { importado: transacoes.length, duplicata: false, mes: mesesNoPDF.join(', ') };
}
