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
export function buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, transacoes, lancamentos = [], registratoInsights = null, cardBillSummaries = []) {
  const totals      = calcTotals(assinaturas, despesasFixas);
  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);

  buildTopSummaryCards(totals, despesasFixas, lancamentos, cardBillSummaries);
  buildCharts(assinaturas, despesasFixas);
  buildNewKpiCards(summaryReal, lancamentos, registratoInsights);
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

function buildNewKpiCards(summaryReal, lancamentos, registratoInsights) {
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

  const totalSaldoEl = document.getElementById('totalSaldoDevedor');
  const totalSaldoSubEl = document.getElementById('totalSaldoSub');
  if (registratoInsights && totalSaldoEl && totalSaldoSubEl) {
    totalSaldoSubEl.textContent = `Parcelas em aberto + SCR: ${fmt(registratoInsights.exposicaoTotal)} · ${registratoInsights.sugestoesPendentes} sugestão(ões)`;
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
  const totalFixo     = totals.total;
  const saldoPrevisto = saldoAtual + mediaEnt - totalFixo;

  const previsaoEl = document.getElementById('previsaoSaldo');
  const mediaEntEl = document.getElementById('previsaoEntradas');
  const mediaFixEl = document.getElementById('previsaoFixos');

  if (previsaoEl) {
    previsaoEl.textContent = fmt(saldoPrevisto);
    previsaoEl.style.color = saldoPrevisto >= 0 ? '#68d391' : '#fc8181';
  }
  if (mediaEntEl) mediaEntEl.textContent = fmt(mediaEnt);
  if (mediaFixEl) mediaFixEl.textContent = fmt(totalFixo);
}

// ── Cálculos de totais ────────────────────────────────────────────────────────

function calcTotals(assinaturas, despesasFixas) {
  const totalAssinaturas = assinaturas.reduce((s, a) => s + toMoney(a.valor), 0);
  const totalFixas       = despesasFixas.filter(d => d.ativo !== false).reduce((s, d) => s + toMoney(d.valor), 0);
  return { totalAssinaturas, totalFixas, total: totalAssinaturas + totalFixas };
}

function buildTopSummaryCards(totals, despesasFixas, lancamentos, cardBillSummaries = []) {
  const totalSubsEl = document.getElementById('totalSubs');
  const totalFixedEl = document.getElementById('totalFixed');
  const totalAllEl = document.getElementById('totalAll');
  const totalAnualEl = document.getElementById('totalAnual');
  const totalSaldoEl = document.getElementById('totalSaldoDevedor');
  const totalSaldoSubEl = document.getElementById('totalSaldoSub');
  const faturaAtualEl = document.getElementById('faturaAtualCartao');
  const faturaAtualSubEl = document.getElementById('faturaAtualSub');

  if (totalSubsEl) totalSubsEl.textContent = fmt(totals.totalAssinaturas);
  if (totalFixedEl) totalFixedEl.textContent = fmt(totals.totalFixas);
  if (totalAllEl) totalAllEl.textContent = fmt(totals.total);
  if (totalAnualEl) totalAnualEl.textContent = fmt(totals.total * 12);

  const saldoParcelasFixas = despesasFixas
    .filter(item => item.ativo !== false && item.parcelas)
    .reduce((sum, item) => {
      const pagas = Number(item.parcelas?.pagas);
      const total = Number(item.parcelas?.total);
      if (!Number.isInteger(pagas) || !Number.isInteger(total) || total <= pagas) return sum;
      return sum + ((total - pagas) * toMoney(item.valor));
    }, 0);

  const gruposCartao = new Map();
  lancamentos
    .filter(item => item.parcela)
    .forEach(item => {
      const key = `${item.desc}|${item.parcela}`;
      if (!gruposCartao.has(key)) gruposCartao.set(key, item);
    });

  const saldoParcelasCartao = [...gruposCartao.values()].reduce((sum, item) => {
    const [atual, total] = String(item.parcela ?? '').split('/').map(Number);
    if (!Number.isInteger(atual) || !Number.isInteger(total) || total <= atual) return sum;
    return sum + ((total - atual) * toMoney(item.valor));
  }, 0);

  const saldoDevedor = saldoParcelasFixas + saldoParcelasCartao;
  if (totalSaldoEl) totalSaldoEl.textContent = fmt(saldoDevedor);

  if (totalSaldoSubEl) {
    const partes = [];
    if (saldoParcelasFixas > 0) partes.push('despesas parceladas');
    if (saldoParcelasCartao > 0) partes.push('cartão parcelado');
    totalSaldoSubEl.textContent = partes.length > 0
      ? `Em aberto: ${partes.join(' + ')}`
      : 'Sem parcelamentos em aberto';
  }

  const ultimaFatura = cardBillSummaries[0] || null;
  if (faturaAtualEl) {
    faturaAtualEl.textContent = ultimaFatura ? fmt(ultimaFatura.total) : '—';
  }
  if (faturaAtualSubEl) {
    faturaAtualSubEl.textContent = ultimaFatura
      ? `${ultimaFatura.fatura} · ${ultimaFatura.quantidade} lançamento(s)${ultimaFatura.parcelados ? ` · ${ultimaFatura.parcelados} parcelado(s)` : ''}`
      : 'Sem fatura importada';
  }
}

function toMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

// ── Charts estáticos (assinaturas + despesas fixas) ───────────────────────────

function buildCharts(assinaturas, despesasFixas) {
  if (_chartSubs)     { _chartSubs.destroy();     _chartSubs     = null; }
  if (_chartDespesas) { _chartDespesas.destroy(); _chartDespesas = null; }

  const ctxSubs = document.getElementById('chartSubs');
  if (ctxSubs && assinaturas.length > 0) {
    _chartSubs = new Chart(ctxSubs, {
      type: 'doughnut',
      data: {
        labels:   assinaturas.map(a => a.nome),
        datasets: [{ data: assinaturas.map(a => a.valor), backgroundColor: CAT_PALETTE, borderWidth: 0 }],
      },
      options: {
        cutout: '60%',
        plugins: { legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 10 } } } },
      },
    });
  }

  const ctxDesp = document.getElementById('chartDespesas');
  const ativas  = despesasFixas.filter(d => d.ativo !== false);
  if (ctxDesp && ativas.length > 0) {
    _chartDespesas = new Chart(ctxDesp, {
      type: 'doughnut',
      data: {
        labels:   ativas.map(d => d.nome),
        datasets: [{ data: ativas.map(d => d.valor), backgroundColor: CAT_PALETTE, borderWidth: 0 }],
      },
      options: {
        cutout: '60%',
        plugins: { legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 10 } } } },
      },
    });
  }
}

// ── Cards mensais do extrato ──────────────────────────────────────────────────

function buildExtratoCards(summaryReal) {
  const container = document.getElementById('extratoCards');
  if (!container) return;

  container.innerHTML = summaryReal.map(m => {
    const saldo = m.saldoFinal ?? 0;
    const cor   = saldo > 1000 ? '#68d391' : saldo > 0 ? '#f6e05e' : '#fc8181';
    return `
      <div class="card" style="min-width:160px;flex:1">
        <div style="font-size:0.78rem;color:#718096;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${m.mes}</div>
        <div style="font-size:0.85rem;color:#68d391">▲ ${fmt(m.entradas)}</div>
        <div style="font-size:0.85rem;color:#fc8181">▼ ${fmt(m.saidas)}</div>
        <div style="margin-top:8px;font-size:1.1rem;font-weight:700;color:${cor}">${fmt(saldo)}</div>
      </div>`;
  }).join('');
}

// ── Gráficos de fluxo e saldo ─────────────────────────────────────────────────

function buildFluxoCharts(summaryReal) {
  if (_chartFluxo) { _chartFluxo.destroy(); _chartFluxo = null; }
  if (_chartSaldo) { _chartSaldo.destroy(); _chartSaldo = null; }

  const meses    = summaryReal.map(m => m.mes);
  const entradas = summaryReal.map(m => m.entradas);
  const saidas   = summaryReal.map(m => m.saidas);
  const saldos   = summaryReal.map(m => m.saldoFinal ?? 0);

  const ctxFluxo = document.getElementById('chartFluxo');
  if (ctxFluxo) {
    _chartFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [
          { label: 'Entradas', data: entradas, backgroundColor: '#68d39188', borderRadius: 4 },
          { label: 'Saídas',   data: saidas,   backgroundColor: '#fc818188', borderRadius: 4 },
        ],
      },
      options: {
        plugins: { legend: { labels: { color: '#a0aec0', font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
          y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(1) + 'k' }, grid: { color: '#2d3748' } },
        },
      },
    });
  }

  const ctxSaldo = document.getElementById('chartSaldo');
  if (ctxSaldo) {
    _chartSaldo = new Chart(ctxSaldo, {
      type: 'line',
      data: {
        labels: meses,
        datasets: [{
          label: 'Saldo Final',
          data: saldos,
          borderColor: '#63b3ed',
          backgroundColor: '#63b3ed22',
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#63b3ed',
        }],
      },
      options: {
        plugins: { legend: { labels: { color: '#a0aec0', font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
          y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(1) + 'k' }, grid: { color: '#2d3748' } },
        },
      },
    });
  }
}

// ── Tabela resumo geral ───────────────────────────────────────────────────────

function buildResumoTable(totals, assinaturas, despesasFixas) {
  const tbody = document.getElementById('resumoTableBody');
  if (!tbody) return;

  const ativas = despesasFixas.filter(d => d.ativo !== false);
  const rows   = [
    ...assinaturas.map(a => ({ icon: a.icon || '🔁', nome: a.nome, tipo: 'Assinatura', valor: a.valor })),
    ...ativas.map(d      => ({ icon: d.icon || '📋', nome: d.nome, tipo: 'Fixa',       valor: d.valor })),
  ].sort((a, b) => b.valor - a.valor);

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.icon)} ${escapeHtml(r.nome)}</td>
      <td><span class="badge badge-blue" style="font-size:0.7rem">${r.tipo}</span></td>
      <td style="text-align:right;color:#fc8181">${fmt(r.valor)}</td>
      <td style="text-align:right;color:#a0aec0">${fmt(r.valor * 12)}</td>
    </tr>`).join('');

  const totalEl = document.getElementById('resumoTotalMes');
  const anualEl = document.getElementById('resumoTotalAno');
  if (totalEl) totalEl.textContent = fmt(totals.total);
  if (anualEl) anualEl.textContent  = fmt(totals.total * 12);
}
