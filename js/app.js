/**
 * app.js — Orquestrador principal do Dashboard de Gastos
 *
 * Fluxo:
 *   1. Abre o IndexedDB
 *   2. Popula com seed data se estiver vazio
 *   3. Carrega todos os dados
 *   4. Inicializa cada view
 *   5. Expõe funções usadas no HTML ao window
 */

import { openDB, seedIfEmpty, getAll } from './db.js';
import { SEED_DATA }                    from './seed.js';

import { buildVisaoGeral }              from './views/visao-geral.js';
import { buildAssinaturas }             from './views/assinaturas.js';
import { buildDespesasFixas }           from './views/despesas-fixas.js';
import { buildParcelamentos }           from './views/parcelamentos.js';
import { initLancamentos, filterLancamentos } from './views/lancamentos.js';
import { initExtrato, filterExtrato }   from './views/extrato.js';
import { initProjecao, recalcularProjecao } from './views/projecao.js';
import { buildImportar, clearBase }     from './views/importar.js';

let _refreshChain = Promise.resolve();

// ── Inicialização ─────────────────────────────────────────────────────────────

async function init() {
  try {
    await openDB();
    await seedIfEmpty(SEED_DATA);
    await refreshDashboard();

    // Remove tela de carregamento se houver
    const loader = document.getElementById('loader');
    if (loader) loader.remove();

  } catch (err) {
    console.error('[Dashboard] Erro na inicialização:', err);
    document.body.innerHTML = `
      <div style="color:#fc8181;padding:40px;font-family:monospace;text-align:center">
        <div style="font-size:2rem;margin-bottom:16px">❌</div>
        <strong>Erro ao carregar o dashboard</strong><br>
        <span style="color:#a0aec0;font-size:0.9rem">${err.message}</span><br><br>
        <button onclick="location.reload()" style="background:#2d3748;border:none;color:#e2e8f0;padding:10px 20px;border-radius:8px;cursor:pointer">
          🔄 Tentar novamente
        </button>
      </div>`;
  }
}

async function loadDashboardData() {
  const [
    assinaturas,
    observacoes,
    despesasFixas,
    lancamentos,
    extratoTransacoes,
    extratoSummary,
  ] = await Promise.all([
    getAll('assinaturas'),
    getAll('observacoes'),
    getAll('despesas_fixas'),
    getAll('lancamentos'),
    getAll('extrato_transacoes'),
    getAll('extrato_summary'),
  ]);

  extratoSummary.sort((a, b) => {
    const mesesNomes = ['Nov','Dez','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out'];
    const [mA, aA] = a.mes.split('/');
    const [mB, aB] = b.mes.split('/');
    if (aA !== aB) return parseInt(aA, 10) - parseInt(aB, 10);
    return mesesNomes.indexOf(mA) - mesesNomes.indexOf(mB);
  });

  return {
    assinaturas,
    observacoes,
    despesasFixas,
    lancamentos,
    extratoTransacoes,
    extratoSummary,
  };
}

async function renderDashboard() {
  const {
    assinaturas,
    observacoes,
    despesasFixas,
    lancamentos,
    extratoTransacoes,
    extratoSummary,
  } = await loadDashboardData();

  buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, extratoTransacoes);
  buildAssinaturas(assinaturas, observacoes);
  buildDespesasFixas(despesasFixas);
  buildParcelamentos(despesasFixas, lancamentos);
  initLancamentos(lancamentos);
  initExtrato(extratoTransacoes, extratoSummary);
  initProjecao(despesasFixas, extratoSummary);
  await buildImportar();
}

function refreshDashboard() {
  _refreshChain = _refreshChain
    .catch(() => {})
    .then(() => renderDashboard());
  return _refreshChain;
}

// ── Navegação por abas ────────────────────────────────────────────────────────

function switchTab(event, name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.currentTarget.classList.add('active');
}

// ── Exposição ao window (chamadas vindas dos atributos onclick/oninput no HTML) ─

window.switchTab          = switchTab;
window.filterLancamentos  = filterLancamentos;
window.filterExtrato      = filterExtrato;
window.recalcularProjecao = recalcularProjecao;
window.clearBase          = clearBase;
window.refreshDashboard   = refreshDashboard;

// ── Executa ───────────────────────────────────────────────────────────────────

init();
