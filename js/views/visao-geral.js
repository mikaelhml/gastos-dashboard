import { fmt } from '../utils/formatters.js';
import { escapeHtml } from '../utils/dom.js';

let _chartDespesas = null;
let _chartSubs     = null;
let _chartFluxo    = null;
let _chartSaldo    = null;
let _chartUltimoMes = null;

const CAT_PALETTE = [
  '#63b3ed','#68d391','#f6e05e','#f687b3','#fc8181',
  '#b794f4','#76e4f7','#f6ad55','#9ae6b4','#fbb6ce','#a0aec0',
];

/**
 * Renderiza a aba Visão Geral.
 */
export function buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, transacoes, lancamentos = []) {
  const totals      = calcTotals(assinaturas, despesasFixas);
  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);

  buildCharts(assinaturas, despesasFixas);
  buildNewKpiCards(summaryReal, lancamentos);
  buildRenovacaoAlerta(assinaturas);

  if (summaryReal.length > 0) {
    buildExtratoCards(summaryReal);
    buildFluxoCharts(summaryReal);
    buildUltimoMes(transacoes, summaryReal);
    buildPrevisaoMes(summaryReal, totals);
  } else {
    const container = document.getElementById('extratoCards');
    if (container) container.innerHTML = `
      <div class="empty-state">
        <strong>Sem extrato importado ainda</strong>
        Importe PDFs da conta para visualizar fluxo de caixa e saldo por mês.
      </div>`;
    const ul = document.getElementById('ultimoMesWrap');
    const pv = document.getElementById('previsaoWrap');
    if (ul) ul.style.display = 'none';
    if (pv) pv.style.display = 'none';
  }

  buildResumoTable(totals, assinaturas, despesasFixas);
}

// ── KPIs extras ──────────────────────────────────────────────────────────────

function buildNewKpiCards(summaryReal, lancamentos) {
  const ultimo = summaryReal[summaryReal.length - 1];
  const saldo  = ultimo?.saldoFinal ?? null;

  const saldoEl    = document.getElementById('saldoAtualConta');
  const saldoSubEl = document.getElementById('saldoAtualSub');
  const cardSaldo  = saldoEl?.closest('.card');
  if (saldoEl) {
    saldoEl.textContent = saldo !== null ? fmt(saldo) : '—';
    if (saldoSubEl) saldoSubEl.textContent = ultimo ? `Atualizado: ${ultimo.mes}` : 'Sem extrato importado';
    if (cardSaldo) {
      const color = saldo === null ? '#718096' : saldo > 1000 ? '#68d391' : saldo > 0 ? '#f6e05e' : '#fc8181';
      cardSaldo.style.setProperty('--accent', color);
      saldoEl.style.color = color;
    }
  }

  const naoClass    = lancamentos.filter(l => !l.tipo_classificado).length;
  const naoClassEl  = document.getElementById('lancamentosNaoClassificados');
  const cardNaoClass = naoClassEl?.closest('.card');
  if (naoClassEl) {
    naoClassEl.textContent = naoClass;
    const urgColor = naoClass > 10 ? '#fc8181' : naoClass > 5 ? '#f6ad55' : '#68d391';
    naoClassEl.style.color = urgColor;
    if (cardNaoClass) cardNaoClass.style.setProperty('--accent', urgColor);
  }
}

// ── Alerta de renovação ───────────────────────────────────────────────────────

function buildRenovacaoAlerta(assinaturas) {
  const container = document.getElementById('renovacaoAlerta');
  if (!container) return;
  if (assinaturas.length === 0) { container.innerHTML = ''; return; }

  const today    = new Date();
  const next1st  = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysLeft = Math.ceil((next1st - today) / 86400000);

  if (daysLeft > 7) { container.innerHTML = ''; return; }

  const nomes = assinaturas.map(a => escapeHtml(a.nome)).join(', ');
  container.innerHTML = `
    <div style="background:#3d1500;border:1px solid #c05621;border-radius:12px;padding:14px 18px;display:flex;gap:14px;align-items:flex-start;margin-bottom:24px">
      <span style="font-size:1.6rem;flex-shrink:0">🔔</span>
      <div>
        <div style="font-weight:700;color:#f6ad55;margin-bottom:4px">Renovações em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}!</div>
        <div style="font-size:0.85rem;color:#a0aec0">${nomes}</div>
      </div>
    </div>`;
}

// ── Último Mês Fechado ────────────────────────────────────────────────────────

function buildUltimoMes(transacoes, summaryReal) {
  const wrap = document.getElementById('ultimoMesWrap');
  if (!wrap) return;
  wrap.style.display = '';

  const ultimoMes  = summaryReal[summaryReal.length - 1];
  const mesLabel   = ultimoMes.mes;

  // atualiza o título
  const titleEl = document.getElementById('ultimoMesTitulo');
  if (titleEl) titleEl.textContent = `📊 Último Mês Fechado — ${mesLabel}`;

  // saídas do mês agrupadas por categoria
  const saidas = transacoes.filter(t => t.tipo === 'saida' && t.mes === mesLabel);
  const catMap  = {};
  saidas.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.valor; });
  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const totalSaidas = saidas.reduce((s, t) => s + t.valor, 0);

  // donut chart
  if (_chartUltimoMes) { _chartUltimoMes.destroy(); _chartUltimoMes = null; }
  const ctx = document.getElementById('chartUltimoMes');
  if (ctx) {
    _chartUltimoMes = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels:   entries.map(([cat]) => cat),
        datasets: [{
          data:            entries.map(([, v]) => v),
          backgroundColor: CAT_PALETTE.slice(0, entries.length),
          borderWidth: 0,
        }],
      },
      options: {
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#a0aec0', font: { size: 11 }, boxWidth: 14 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } },
        },
      },
    });
  }

  // ranking lateral
  const rank = document.getElementById('ultimoMesRank');
  if (!rank) return;
  rank.innerHTML = `
    <div style="font-size:0.78rem;color:#718096;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em">Top gastos</div>
    ${entries.slice(0, 8).map(([cat, val], i) => {
      const pct  = totalSaidas > 0 ? ((val / totalSaidas) * 100).toFixed(1) : '0.0';
      const cor  = CAT_PALETTE[i % CAT_PALETTE.length];
      return `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:3px">
            <span style="color:${cor};font-weight:600">${escapeHtml(cat)}</span>
            <span style="color:#e2e8f0">${fmt(val)} <span style="color:#718096;font-size:0.78rem">${pct}%</span></span>
          </div>
          <div style="height:5px;background:#2d3748;border-radius:3px">
            <div style="width:${pct}%;height:100%;background:${cor};border-radius:3px;transition:width .4s"></div>
          </div>
        </div>`;
    }).join('')}
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid #2d3748;display:flex;justify-content:space-between;font-size:0.9rem">
      <span style="color:#a0aec0">Total saídas</span>
      <strong style="color:#fc8181">${fmt(totalSaidas)}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-top:6px">
      <span style="color:#a0aec0">Total entradas</span>
      <strong style="color:#68d391">${fmt(ultimoMes.entradas)}</strong>
    </div>`;
}

// ── Previsão Mês Corrente ─────────────────────────────────────────────────────

function buildPrevisaoMes(summaryReal, totals) {
  const wrap = document.getElementById('previsaoWrap');
  if (!wrap) return;
  wrap.style.display = '';

  const saldoAtual = summaryReal[summaryReal.length - 1]?.saldoFinal ?? 0;

  // Média de entradas dos últimos 3 meses (excluindo Rendimento, que é passivo)
  const ultimos3   = summaryReal.slice(-3);
  const mediaEnt   = ultimos3.length
    ? ultimos3.reduce((s, m) => s + m.entradas, 0) / ultimos3.length
    : 0;

  // Saídas fixas cadastradas (assinaturas + despesas fixas)
  const saidasFixas = totals.totalAll;

  // Saldo estimado ao fim do mês
  const saldoEstimado = saldoAtual + mediaEnt - saidasFixas;
  const estColor = saldoEstimado > 1000 ? '#68d391' : saldoEstimado > 0 ? '#f6e05e' : '#fc8181';

  const grid = document.getElementById('previsaoGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="card" style="--accent:#63b3ed">
      <div class="label">Saldo Atual</div>
      <div class="value" style="color:#63b3ed;font-size:1.4rem">${fmt(saldoAtual)}</div>
      <div class="sub">Último saldo importado</div>
    </div>
    <div class="card" style="--accent:#68d391">
      <div class="label">Entradas Esperadas</div>
      <div class="value" style="color:#68d391;font-size:1.4rem">${fmt(mediaEnt)}</div>
      <div class="sub">Média dos últimos ${ultimos3.length} meses</div>
    </div>
    <div class="card" style="--accent:#fc8181">
      <div class="label">Saídas Fixas Previstas</div>
      <div class="value" style="color:#fc8181;font-size:1.4rem">${fmt(saidasFixas)}</div>
      <div class="sub">Assinaturas + Despesas cadastradas</div>
    </div>
    <div class="card" style="--accent:${estColor};border:2px solid ${estColor}">
      <div class="label">🔮 Saldo Estimado (fim do mês)</div>
      <div class="value" style="color:${estColor};font-size:1.5rem">${fmt(saldoEstimado)}</div>
      <div class="sub" style="color:#718096;font-size:0.78rem">Saldo atual + entradas esperadas − fixos</div>
    </div>`;
}

// ── Cálculos e tabela ─────────────────────────────────────────────────────────

function calcTotals(assinaturas, despesasFixas) {
  const totalSubs  = assinaturas.reduce((s, a) => s + a.valor, 0);
  const totalFixed = despesasFixas.reduce((s, d) => s + d.valor, 0);
  const totalAll   = totalSubs + totalFixed;

  const parcelados = despesasFixas.filter(d => d.parcelas);
  const totalSaldo = parcelados.reduce((s, d) => s + (d.parcelas.total - d.parcelas.pagas) * d.valor, 0);

  document.getElementById('totalSubs').textContent         = fmt(totalSubs);
  document.getElementById('totalFixed').textContent        = fmt(totalFixed);
  document.getElementById('totalAll').textContent          = fmt(totalAll);
  document.getElementById('totalAnual').textContent        = fmt(totalAll * 12);
  document.getElementById('totalSaldoDevedor').textContent = fmt(totalSaldo);
  document.getElementById('totalSaldoSub').textContent     =
    `${parcelados.length} parcelamento${parcelados.length !== 1 ? 's' : ''} em aberto`;

  document.getElementById('subTotalBar').textContent   = fmt(totalSubs);
  document.getElementById('subAnualBar').textContent   = fmt(totalSubs * 12);
  document.getElementById('fixedTotalBar').textContent = fmt(totalFixed);
  document.getElementById('fixedAnualBar').textContent = fmt(totalFixed * 12);

  return { totalSubs, totalFixed, totalAll };
}

function buildResumoTable(totals, assinaturas, despesasFixas) {
  const tbody = document.getElementById('resumoTable');
  tbody.innerHTML = '';
  const rows = [
    ...despesasFixas.map(d => ({ cat: d.cat,       desc: d.desc, val: d.valor })),
    ...assinaturas.map(a  => ({ cat: 'Assinatura', desc: a.nome, val: a.valor })),
  ].sort((a, b) => b.val - a.val);

  if (rows.length === 0 || totals.totalAll <= 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;color:#718096;padding:20px">
          Nenhum dado cadastrado ainda.
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
        <td><span class="badge badge-blue">${escapeHtml(r.cat)}</span></td>
        <td>${escapeHtml(r.desc)}</td>
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
  if (_chartDespesas) { _chartDespesas.destroy(); _chartDespesas = null; }
  if (_chartSubs)     { _chartSubs.destroy();     _chartSubs     = null; }

  _chartDespesas = new Chart(document.getElementById('chartDespesas'), {
    type: 'doughnut',
    data: {
      labels:   despesasFixas.length ? despesasFixas.map(d => d.desc) : ['Sem dados'],
      datasets: [{ data: despesasFixas.length ? despesasFixas.map(d => d.valor) : [1], backgroundColor: CAT_PALETTE, borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#a0aec0', font: { size: 11 } } } }, cutout: '65%' },
  });

  _chartSubs = new Chart(document.getElementById('chartSubs'), {
    type: 'doughnut',
    data: {
      labels:   assinaturas.length ? assinaturas.map(a => a.nome) : ['Sem dados'],
      datasets: [{ data: assinaturas.length ? assinaturas.map(a => a.valor) : [1], backgroundColor: CAT_PALETTE, borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#a0aec0', font: { size: 11 } } } }, cutout: '65%' },
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
        <div class="label">${escapeHtml(m.mes)}</div>
        <div class="value" style="font-size:1.2rem">${fmt(m.saldoFinal)}</div>
        <div class="sub">▲ Entradas: <strong style="color:#68d391">${fmt(m.entradas)}</strong></div>
        <div class="sub">▼ Saídas: <strong style="color:#fc8181">${fmt(m.saidas)}</strong></div>
        <div class="sub" style="margin-top:4px">Variação: <strong style="color:${diffColor}">${diffSign}${fmt(diff)}</strong></div>
      </div>`;
  });
}

function buildFluxoCharts(summaryReal) {
  if (_chartFluxo) { _chartFluxo.destroy(); _chartFluxo = null; }
  if (_chartSaldo) { _chartSaldo.destroy(); _chartSaldo = null; }

  _chartFluxo = new Chart(document.getElementById('chartFluxo'), {
    type: 'bar',
    data: {
      labels:   summaryReal.map(m => m.mes),
      datasets: [
        { label: 'Entradas', data: summaryReal.map(m => m.entradas), backgroundColor: '#48bb78', borderRadius: 6 },
        { label: 'Saídas',   data: summaryReal.map(m => m.saidas),   backgroundColor: '#fc8181', borderRadius: 6 },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  _chartSaldo = new Chart(document.getElementById('chartSaldo'), {
    type: 'line',
    data: {
      labels:   summaryReal.map(m => m.mes),
      datasets: [{
        label: 'Saldo Final',
        data:  summaryReal.map(m => m.saldoFinal),
        borderColor: '#63b3ed', backgroundColor: 'rgba(99,179,237,0.15)',
        tension: 0.4, fill: true, pointRadius: 6, pointBackgroundColor: '#63b3ed',
      }],
    },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(1) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });
}


