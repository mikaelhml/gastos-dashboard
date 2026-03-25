import { fmt } from '../utils/formatters.js';

let _chartDespesas = null;
let _chartSubs = null;
let _chartFluxo = null;
let _chartSaldo = null;

/**
 * Renderiza a aba Visão Geral.
 * @param {Array} assinaturas
 * @param {Array} despesasFixas
 * @param {Array} extratoSummary  (inclui apenasHistorico)
 * @param {Array} transacoes
 */
export function buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, transacoes) {
  const totals = calcTotals(assinaturas, despesasFixas);
  buildResumoTable(totals, assinaturas, despesasFixas);
  buildCharts(assinaturas, despesasFixas);

  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);
  if (summaryReal.length > 0) {
    buildExtratoCards(summaryReal);
    buildFluxoCharts(summaryReal);
  }
}

function calcTotals(assinaturas, despesasFixas) {
  const totalSubs  = assinaturas.reduce((s, a) => s + a.valor, 0);
  const totalFixed = despesasFixas.reduce((s, d) => s + d.valor, 0);
  const totalAll   = totalSubs + totalFixed;

  const parcelados  = despesasFixas.filter(d => d.parcelas);
  const totalSaldo  = parcelados.reduce((s, d) => s + (d.parcelas.total - d.parcelas.pagas) * d.valor, 0);

  document.getElementById('totalSubs').textContent         = fmt(totalSubs);
  document.getElementById('totalFixed').textContent        = fmt(totalFixed);
  document.getElementById('totalAll').textContent          = fmt(totalAll);
  document.getElementById('totalAnual').textContent        = fmt(totalAll * 12);
  document.getElementById('totalSaldoDevedor').textContent = fmt(totalSaldo);
  document.getElementById('totalSaldoSub').textContent     =
    `${parcelados.length} parcelamento${parcelados.length !== 1 ? 's' : ''} em aberto`;

  document.getElementById('subTotalBar').textContent  = fmt(totalSubs);
  document.getElementById('subAnualBar').textContent  = fmt(totalSubs * 12);
  document.getElementById('fixedTotalBar').textContent = fmt(totalFixed);
  document.getElementById('fixedAnualBar').textContent = fmt(totalFixed * 12);

  return { totalSubs, totalFixed, totalAll };
}

function buildResumoTable(totals, assinaturas, despesasFixas) {
  const tbody = document.getElementById('resumoTable');
  tbody.innerHTML = '';
  const rows = [
    ...despesasFixas.map(d => ({ cat: d.cat,      desc: d.desc, val: d.valor })),
    ...assinaturas.map(a  => ({ cat: 'Assinatura', desc: a.nome, val: a.valor })),
  ].sort((a, b) => b.val - a.val);

   if (rows.length === 0 || totals.totalAll <= 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;color:#718096;padding:20px">
          Nenhum dado cadastrado ainda. Adicione assinaturas, despesas fixas ou importe PDFs.
        </td>
      </tr>
      <tr class="total-row">
        <td colspan="2"><strong>TOTAL COMPROMETIDO / MÊS</strong></td>
        <td><strong>${fmt(0)}</strong></td>
        <td><strong style="color:#718096">0%</strong></td>
      </tr>`;
    return;
  }

  rows.forEach(r => {
    const pct = (r.val / totals.totalAll * 100).toFixed(1);
    tbody.innerHTML += `
      <tr>
        <td><span class="badge badge-blue">${r.cat}</span></td>
        <td>${r.desc}</td>
        <td><strong>${fmt(r.val)}</strong></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="progress-wrap" style="flex:1">
              <div class="progress-bar" style="width:${pct}%;--color:#63b3ed"></div>
            </div>
            <span style="font-size:0.8rem;color:#718096;min-width:40px">${pct}%</span>
          </div>
        </td>
      </tr>`;
  });
  tbody.innerHTML += `
    <tr class="total-row">
      <td colspan="2"><strong>TOTAL COMPROMETIDO / MÊS</strong></td>
      <td><strong>${fmt(totals.totalAll)}</strong></td>
      <td><strong style="color:#f6e05e">100%</strong></td>
    </tr>`;
}

function buildCharts(assinaturas, despesasFixas) {
  if (_chartDespesas) {
    _chartDespesas.destroy();
    _chartDespesas = null;
  }
  if (_chartSubs) {
    _chartSubs.destroy();
    _chartSubs = null;
  }

  _chartDespesas = new Chart(document.getElementById('chartDespesas'), {
    type: 'doughnut',
    data: {
      labels: despesasFixas.length ? despesasFixas.map(d => d.desc) : ['Sem dados'],
      datasets: [{
        data: despesasFixas.length ? despesasFixas.map(d => d.valor) : [1],
        backgroundColor: ['#63b3ed','#68d391','#f6e05e','#b794f4','#fc8181','#fbb6ce','#76e4f7','#f687b3','#a0aec0'],
        borderWidth: 0,
      }],
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: '#a0aec0', font: { size: 11 } } } },
      cutout: '65%',
    },
  });

  _chartSubs = new Chart(document.getElementById('chartSubs'), {
    type: 'doughnut',
    data: {
      labels: assinaturas.length ? assinaturas.map(a => a.nome) : ['Sem dados'],
      datasets: [{
        data: assinaturas.length ? assinaturas.map(a => a.valor) : [1],
        backgroundColor: ['#63b3ed','#68d391','#f6e05e','#b794f4','#fc8181','#fbb6ce','#76e4f7','#f687b3'],
        borderWidth: 0,
      }],
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: '#a0aec0', font: { size: 11 } } } },
      cutout: '65%',
    },
  });
}

function buildExtratoCards(summaryReal) {
  const container = document.getElementById('extratoCards');
  container.innerHTML = '';
  summaryReal.forEach(m => {
    const diff      = m.saldoFinal - m.saldoInicial;
    const diffColor = diff >= 0 ? '#68d391' : '#fc8181';
    const diffSign  = diff >= 0 ? '+' : '';
    container.innerHTML += `
      <div class="card" style="--accent:${diffColor}">
        <div class="label">${m.mes}</div>
        <div class="value" style="font-size:1.2rem">${fmt(m.saldoFinal)}</div>
        <div class="sub">▲ Entradas: <strong style="color:#68d391">${fmt(m.entradas)}</strong></div>
        <div class="sub">▼ Saídas: <strong style="color:#fc8181">${fmt(m.saidas)}</strong></div>
        <div class="sub" style="margin-top:4px">Variação: <strong style="color:${diffColor}">${diffSign}${fmt(diff)}</strong></div>
      </div>`;
  });
}

function buildFluxoCharts(summaryReal) {
  if (_chartFluxo) {
    _chartFluxo.destroy();
    _chartFluxo = null;
  }
  if (_chartSaldo) {
    _chartSaldo.destroy();
    _chartSaldo = null;
  }

  _chartFluxo = new Chart(document.getElementById('chartFluxo'), {
    type: 'bar',
    data: {
      labels: summaryReal.map(m => m.mes),
      datasets: [
        { label: 'Entradas', data: summaryReal.map(m => m.entradas), backgroundColor: '#48bb78', borderRadius: 6 },
        { label: 'Saídas',   data: summaryReal.map(m => m.saidas),   backgroundColor: '#fc8181', borderRadius: 6 },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { ticks: { color: '#a0aec0' },             grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  _chartSaldo = new Chart(document.getElementById('chartSaldo'), {
    type: 'line',
    data: {
      labels: summaryReal.map(m => m.mes),
      datasets: [{
        label: 'Saldo Final',
        data: summaryReal.map(m => m.saldoFinal),
        borderColor: '#63b3ed', backgroundColor: 'rgba(99,179,237,0.15)',
        tension: 0.4, fill: true, pointRadius: 6, pointBackgroundColor: '#63b3ed',
      }],
    },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { ticks: { color: '#a0aec0' },             grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(1) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });
}
