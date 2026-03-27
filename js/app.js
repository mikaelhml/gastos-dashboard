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
import { initLancamentos, filterLancamentos, clearLancamentosFilters } from './views/lancamentos.js';
import { initExtrato, filterExtrato, clearExtratoFilters }   from './views/extrato.js';
import { initProjecao, recalcularProjecao } from './views/projecao.js';
import { buildImportar, clearBase, clearAllDashboardData }     from './views/importar.js';

let _refreshChain = Promise.resolve();

// ── Inicialização ─────────────────────────────────────────────────────────────

async function init() {
  try {
    await openDB();
    await seedIfEmpty(SEED_DATA);
    bindTabKeyboardNavigation();
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
    orcamentos,
    assinaturaSugestoesDispensa,
  ] = await Promise.all([
    getAll('assinaturas'),
    getAll('observacoes'),
    getAll('despesas_fixas'),
    getAll('lancamentos'),
    getAll('extrato_transacoes'),
    getAll('extrato_summary'),
    getAll('orcamentos'),
    getAll('assinatura_sugestoes_dispensa'),
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
    despesasFixas: despesasFixas.map(normalizeDespesaFixa),
    lancamentos,
    extratoTransacoes,
    extratoSummary,
    orcamentos,
    assinaturaSugestoesDispensa,
  };
}

function normalizeDespesaFixa(item) {
  const desc = String(item?.desc ?? item?.nome ?? '').trim();
  const nome = String(item?.nome ?? item?.desc ?? '').trim();
  const parcelas = item?.parcelas ?? (
    item?.tipo && Number.isInteger(Number(item?.pagas)) && Number.isInteger(Number(item?.total)) && item?.inicio
      ? {
          tipo: item.tipo,
          label: item.tipo === 'financiamento' ? 'Financiamento' : 'Parcelamento',
          pagas: Number(item.pagas),
          total: Number(item.total),
          inicio: item.inicio,
        }
      : null
  );

  return {
    ...item,
    desc,
    nome,
    parcelas,
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
    orcamentos,
    assinaturaSugestoesDispensa,
  } = await loadDashboardData();

  buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, extratoTransacoes, lancamentos);
  buildAssinaturas(assinaturas, observacoes, lancamentos, extratoTransacoes, assinaturaSugestoesDispensa);
  buildDespesasFixas(despesasFixas);
  buildParcelamentos(despesasFixas, lancamentos);
  initLancamentos(lancamentos, extratoTransacoes, assinaturas, despesasFixas);
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
  const currentTab = event?.currentTarget || document.getElementById(`tab-button-${name}`);
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('tabindex', '-1');
  });
  document.querySelectorAll('.tab-content').forEach(panel => panel.classList.remove('active'));

  document.getElementById('tab-' + name)?.classList.add('active');
  currentTab?.classList.add('active');
  currentTab?.setAttribute('aria-selected', 'true');
  currentTab?.setAttribute('tabindex', '0');
}

function bindTabKeyboardNavigation() {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', event => {
      const lastIndex = tabs.length - 1;
      let nextIndex = index;

      if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
      if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = lastIndex;

      if (nextIndex !== index) {
        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      }
    });
  });
}

// ── Exposição ao window (chamadas vindas dos atributos onclick/oninput no HTML) ─

window.switchTab          = switchTab;
window.filterLancamentos  = filterLancamentos;
window.clearLancamentosFilters = clearLancamentosFilters;
window.filterExtrato      = filterExtrato;
window.clearExtratoFilters = clearExtratoFilters;
window.recalcularProjecao = recalcularProjecao;
window.clearBase          = clearBase;
window.clearAllDashboardData = clearAllDashboardData;
window.refreshDashboard   = refreshDashboard;

// Emoji picker helpers — usados pelos onclick inline no HTML
window.selectEmoji = function selectEmoji(inputId, previewId, pickerId, btn, emoji) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const picker = document.getElementById(pickerId);
  if (input)   input.value = emoji;
  if (preview) preview.textContent = emoji;
  if (picker)  picker.style.display = 'none';
  picker?.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
  btn?.classList.add('selected');
};

window.syncEmojiPicker = function syncEmojiPicker(pickerId, previewId, emoji) {
  const picker  = document.getElementById(pickerId);
  const preview = document.getElementById(previewId);
  if (preview) preview.textContent = emoji || '✨';
  picker?.querySelectorAll('.emoji-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.emoji === emoji);
  });
};

window.toggleEmojiPicker = function toggleEmojiPicker(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
};

// ── Executa ───────────────────────────────────────────────────────────────────

init();
