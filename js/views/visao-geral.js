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
    ? ultimos3.reduce((s, m) => 