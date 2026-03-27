import { fmt, gerarMesesFuturos } from '../utils/formatters.js';

// Referências para destruição / recriação dos gráficos
let _chartSaldo  = null;
let _chartBarras = null;
let _chartPizza  = null;

// Dados carregados — usados ao recalcular
let _fixoMensal = { itens: {}, total: 0 };
let _historico  = [];
let _saldoAtual = 0;
let _ultimoMes  = 'Fev/2026';
let _registratoInsights = null;

function parseNumberInput(id, fallback = 0) {
  const value = parseFloat(document.getElementById(id)?.value ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function parseMonthCount() {
  const value = parseInt(document.getElementById('pMeses')?.value ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : 6;
}

/**
 * Calcula FIXO_MENSAL a partir das despesasFixas (+ média Nubank de crédito).
 * A 'Fatura Nubank (crédito)' não está em despesas_fixas pois é paga pelo cartão.
 */
function computeFixoMensal(despesasFixas) {
  const itens = {};
  despesasFixas.forEach(d => { itens[d.desc] = d.valor; });
  return { itens, total: Object.values(itens).reduce((s, v) => s + v, 0) };
}

/**
 * Monta o array HISTORICO a partir do extratoSummary (inclui a entrada apenasHistorico).
 */
function computeHistorico(extratoSummary) {
  return extratoSummary.map(m => ({ mes: m.mes, saldo: m.saldoFinal }));
}

/**
 * Inicializa a aba Projeção.
 * @param {Array} despesasFixas
 * @param {Array} extratoSummary  (inclui Nov/2025 apenasHistorico)
 */
export function initProjecao(despesasFixas, extratoSummary, registratoInsights = null) {
  _fixoMensal = computeFixoMensal(despesasFixas);
  _historico  = computeHistorico(extratoSummary);
  _registratoInsights = registratoInsights;

  // Último mês com dados reais (exclui apenasHistorico)
  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);
  const ultimo      = summaryReal[summaryReal.length - 1];
  _saldoAtual = ultimo ? ultimo.saldoFinal : 0;
  _ultimoMes  = ultimo ? ultimo.mes : 'Fev/2026';

  buildCenarios();
  recalcularProjecao();
}

function calcProjecao(salario, rendaExtra, itau, outros, nMeses) {
  const meses = gerarMesesFuturos(_ultimoMes, nMeses);
  let saldo   = _saldoAtual;
  return meses.map(mes => {
    const entradas    = salario + rendaExtra;
    const fixo        = _fixoMensal.total;
    const totalSaidas = fixo + itau + outros;
    const resultado   = entradas - totalSaidas;
    saldo            += resultado;
    return { mes, entradas, salario, rendaExtra, fixo, itau, outros, totalSaidas, resultado, saldo };
  });
}

function buildCenarios() {
  const cenarios = [
    { id: 'otimista',   sal: 10000, itau: 2500, outros: 800 },
    { id: 'realista',   sal:  7000, itau: 1800, outros: 1000 },
    { id: 'pessimista', sal:  5000, itau: 2500, outros: 1800 },
  ];
  cenarios.forEach(c => {
    const res   = c.sal - _fixoMensal.total - c.itau - c.outros;
    const idCap = c.id.charAt(0).toUpperCase() + c.id.slice(1);
    document.getElementById('sc' + idCap + 'Val').textContent =
      `${res >= 0 ? '+' : ''}${fmt(res)}/mês`;
    if (res >= 0) {
      document.getElementById('sc' + idCap + 'Time').textContent =
        `✅ Saldo cresce ${fmt(res * 12)}/ano`;
    } else {
      const projRows = calcProjecao(c.sal, 0, c.itau, c.outros, 24);
      const zeraRow  = projRows.find(r => r.saldo <= 0);
      document.getElementById('sc' + idCap + 'Time').textContent =
        zeraRow ? `🔴 Saldo zera em ${zeraRow.mes}` : `⚠️ Saldo negativo em 24+ meses`;
    }
  });
  // Ponto de equilíbrio
  const peq = _fixoMensal.total + 1800 + 1000;
  document.getElementById('scEquilibrioVal').textContent = fmt(peq) + '/mês';
  document.getElementById('scEquilibrioSub').textContent =
    `Fixos ${fmt(_fixoMensal.total)} + Cartão ${fmt(1800)} + Outros ${fmt(1000)}`;
}

/**
 * Recalcula a projeção com os valores dos inputs. Exposta ao window em app.js.
 */
export function recalcularProjecao() {
  const salario    = parseNumberInput('pSalario', 0);
  const rendaExtra = parseNumberInput('pRendaExtra', 0);
  const itau       = parseNumberInput('pItau', 0);
  const outros     = parseNumberInput('pOutros', 0);
  const nMeses     = parseMonthCount();

  const rows      = calcProjecao(salario, rendaExtra, itau, outros, nMeses);
  const resultMes = salario + rendaExtra - _fixoMensal.total - itau - outros;

  const el = document.getElementById('pResultadoMensal');
  const complementoScr = _registratoInsights?.financiamentoMensalSugerido
    ? ` <span style="color:#90cdf4">· SCR sugere até ${fmt(_registratoInsights.financiamentoMensalSugerido)}/mês em compromissos financeiros</span>`
    : '';
  el.innerHTML = `Resultado mensal estimado: <strong style="color:${resultMes >= 0 ? '#68d391' : '#fc8181'}">${resultMes >= 0 ? '+' : ''}${fmt(resultMes)}</strong>${complementoScr}`;

  renderProjecaoTable(rows);
  updateProjecaoCharts(rows, itau, outros);
  renderAlerta(rows, resultMes);
}

function renderProjecaoTable(rows) {
  const tbody = document.getElementById('projecaoTable');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const cor      = r.resultado >= 0 ? '#68d391' : '#fc8181';
    const saldoCor = r.saldo >= 2000 ? '#68d391' : r.saldo >= 0 ? '#f6e05e' : '#fc8181';
    const saldoIcon = r.saldo >= 5000 ? '🟢' : r.saldo >= 0 ? '🟡' : '🔴';
    tbody.innerHTML += `
      <tr>
        <td><span class="badge badge-blue">${r.mes}</span></td>
        <td style="text-align:right;color:#68d391">+${fmt(r.salario)}</td>
        <td style="text-align:right;color:${r.rendaExtra > 0 ? '#76e4f7' : '#718096'}">${r.rendaExtra > 0 ? '+' + fmt(r.rendaExtra) : '—'}</td>
        <td style="text-align:right;color:#a0aec0">${fmt(r.fixo)}</td>
        <td style="text-align:right;color:#fc8181">${fmt(r.itau)}</td>
        <td style="text-align:right;color:#f6ad55">${fmt(r.outros)}</td>
        <td style="text-align:right;font-weight:600;color:#fc8181">${fmt(r.totalSaidas)}</td>
        <td style="text-align:right;font-weight:700;color:${cor}">${r.resultado >= 0 ? '+' : ''}${fmt(r.resultado)}</td>
        <td style="text-align:right;font-weight:700;color:${saldoCor}">${saldoIcon} ${fmt(r.saldo)}</td>
      </tr>`;
  });
  const totalRes  = rows.reduce((s, r) => s + r.resultado, 0);
  const saldoFinal = rows[rows.length - 1]?.saldo ?? 0;
  tbody.innerHTML += `
    <tr class="total-row">
      <td colspan="7"><strong>ACUMULADO ${rows.length} MESES</strong></td>
      <td style="text-align:right"><strong style="color:${totalRes >= 0 ? '#68d391' : '#fc8181'}">${totalRes >= 0 ? '+' : ''}${fmt(totalRes)}</strong></td>
      <td style="text-align:right"><strong style="color:${saldoFinal >= 0 ? '#68d391' : '#fc8181'}">${fmt(saldoFinal)}</strong></td>
    </tr>`;
}

function updateProjecaoCharts(rows, itau, outros) {
  if (_chartSaldo)  { _chartSaldo.destroy();  _chartSaldo  = null; }
  if (_chartBarras) { _chartBarras.destroy(); _chartBarras = null; }
  if (_chartPizza)  { _chartPizza.destroy();  _chartPizza  = null; }

  const nMeses = rows.length;

  // ── Gráfico 1: Saldo histórico + 3 cenários ──────────────────────────────
  const cenOtim    = calcProjecao(10000, 0, 2500, 800, nMeses);
  const cenReal    = calcProjecao(7000,  0, 1800, 1000, nMeses);
  const cenPessim  = calcProjecao(5000,  0, 2500, 1800, nMeses);

  const labHist   = _historico.map(h => h.mes);
  const labFut    = rows.map(r => r.mes);
  const allLabels = labHist.length ? [...labHist, ...labFut] : labFut;
  const nHist     = _historico.length;
  const hasHistorico = nHist > 0;
  const ultimoSaldoHistorico = hasHistorico ? _historico[nHist - 1].saldo : _saldoAtual;
  const prefixLength = Math.max(nHist - 1, 0);

  const histData = hasHistorico
    ? [..._historico.map(h => h.saldo), ...Array(nMeses).fill(null)]
    : Array(nMeses).fill(null);
  const otimData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...cenOtim.map(r => r.saldo)]
    : cenOtim.map(r => r.saldo);
  const realData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...cenReal.map(r => r.saldo)]
    : cenReal.map(r => r.saldo);
  const pessData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...cenPessim.map(r => r.saldo)]
    : cenPessim.map(r => r.saldo);
  const customData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...rows.map(r => r.saldo)]
    : rows.map(r => r.saldo);

  _chartSaldo = new Chart(document.getElementById('chartProjecaoSaldo'), {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        { label: 'Histórico Real',  data: histData,   borderColor: '#63b3ed', backgroundColor: 'rgba(99,179,237,0.1)', tension: 0.3, fill: true,  pointRadius: 5, borderWidth: 2 },
        { label: '🌟 Otimista',     data: otimData,   borderColor: '#68d391', borderDash: [6, 3],                       tension: 0.3, fill: false, pointRadius: 3, borderWidth: 2 },
        { label: '⚖️ Realista',    data: realData,   borderColor: '#f6e05e', borderDash: [6, 3],                       tension: 0.3, fill: false, pointRadius: 3, borderWidth: 2 },
        { label: '⚠️ Pessimista',  data: pessData,   borderColor: '#fc8181', borderDash: [6, 3],                       tension: 0.3, fill: false, pointRadius: 3, borderWidth: 2 },
        { label: '⚙️ Configurado', data: customData, borderColor: '#b794f4',                                           tension: 0.3, fill: false, pointRadius: 4, borderWidth: 2.5 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#a0aec0', font: { size: 10 } }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(1) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  // ── Gráfico 2: Barras entradas vs saídas ─────────────────────────────────
  _chartBarras = new Chart(document.getElementById('chartProjecaoBarras'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.mes),
      datasets: [
        { label: 'Entradas',      data: rows.map(r => r.entradas),    backgroundColor: '#48bb78', borderRadius: 5 },
        { label: 'Total Saídas',  data: rows.map(r => r.totalSaidas), backgroundColor: '#fc8181', borderRadius: 5 },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { ticks: { color: '#a0aec0', font: { size: 10 } }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  // ── Gráfico 3: Pizza composição saídas ───────────────────────────────────
  const fixoItens   = Object.entries(_fixoMensal.itens);
  const pizzaLabels = [...fixoItens.map(([k]) => k), 'Fatura Itaú', 'Outros variáveis'];
  const pizzaData   = [...fixoItens.map(([, v]) => v), itau, outros];
  const pizzaColors = ['#63b3ed','#68d391','#f6e05e','#b794f4','#fc8181','#f6ad55','#76e4f7','#fbb6ce','#a0aec0','#4fd1c5','#fc8181','#f6ad55'];

  _chartPizza = new Chart(document.getElementById('chartProjecaoPizza'), {
    type: 'doughnut',
    data: { labels: pizzaLabels, datasets: [{ data: pizzaData, backgroundColor: pizzaColors, borderWidth: 0 }] },
    options: {
      plugins: { legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 9.5 } } } },
      cutout: '55%',
    },
  });
}

function renderAlerta(rows, resultMes) {
  const el      = document.getElementById('projecaoAlerta');
  const zeraEm  = rows.find(r => r.saldo <= 0);
  if (zeraEm) {
    el.innerHTML = `
      <div style="background:#4a1515;border:1px solid #fc8181;border-radius:10px;padding:14px 18px;font-size:0.9rem;color:#fc8181">
        🚨 <strong>Atenção:</strong> Com os parâmetros atuais, o saldo chegará a zero em <strong>${zeraEm.mes}</strong>.
        Seria necessário reduzir as saídas em <strong>${fmt(Math.abs(resultMes))}/mês</strong> ou aumentar a renda para atingir equilíbrio.
      </div>`;
  } else if (resultMes < 500) {
    el.innerHTML = `
      <div style="background:#3d2a00;border:1px solid #f6ad55;border-radius:10px;padding:14px 18px;font-size:0.9rem;color:#f6ad55">
        ⚠️ <strong>Margem baixa:</strong> O resultado mensal é de apenas <strong>${fmt(resultMes)}/mês</strong>. Qualquer despesa inesperada pode comprometer o saldo.
      </div>`;
  } else {
    el.innerHTML = `
      <div style="background:#1c4532;border:1px solid #68d391;border-radius:10px;padding:14px 18px;font-size:0.9rem;color:#68d391">
        ✅ <strong>Saldo estável:</strong> Com resultado de <strong>+${fmt(resultMes)}/mês</strong>, o saldo tende a crescer nos próximos meses.
      </div>`;
  }

  if (_registratoInsights?.latest) {
    el.innerHTML += `
      <div style="margin-top:12px;background:#1a2e4a;border:1px solid #2c5282;border-radius:10px;padding:14px 18px;font-size:0.88rem;color:#90cdf4">
        🏛️ <strong>Contexto do SCR (${_registratoInsights.latest.mesLabel || _registratoInsights.latest.mesRef}):</strong>
        exposição ${fmt(_registratoInsights.exposicaoTotal)} · vencida ${fmt(_registratoInsights.dividaVencida)} · limite ${fmt(_registratoInsights.limiteCredito)}.
        Este bloco é apenas informativo e ainda não entra automaticamente no cálculo da projeção.
      </div>`;
  }
}
