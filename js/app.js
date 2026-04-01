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
import { buildAnaliseFinanceira }       from './views/analise-financeira.js';
import { buildAssinaturas }             from './views/assinaturas.js';
import { buildDespesasFixas }           from './views/despesas-fixas.js';
import { buildParcelamentos }           from './views/parcelamentos.js';
import { initLancamentos, filterLancamentos, clearLancamentosFilters, sortLancamentosBy } from './views/lancamentos.js';
import { initExtrato, filterExtrato, clearExtratoFilters }   from './views/extrato.js';
import { initProjecao, recalcularProjecao } from './views/projecao.js';
import { buildRegistrato }               from './views/registrato.js';
import { buildImportar, clearBase, clearAllDashboardData }     from './views/importar.js';
import { buildRegistratoSuggestions, computeRegistratoInsights }   from './utils/registrato-suggestions.js';
import { extrairParcelaFinal } from './parsers/pdf-utils.js';
import { buildCardBillSummaries } from './utils/dashboard-context.js';
import { buildSpendAnalytics } from './utils/analytics.js';
import { buildScrProjectionModel } from './utils/projection-model.js';
import { buildAutomaticProjectionInputs } from './utils/projection-auto.js';
import { buildFinancialAnalysisModel } from './utils/financial-analysis.js';
import { buildParcelamentoSummary } from './utils/parcelamento-summary.js';
import { reconcileAccountCardPayments } from './utils/card-payment-reconciliation.js';
import { normalizeOwnTransfers } from './utils/self-transfer-detection.js';

let _refreshChain = Promise.resolve();
const REGISTRATO_VALUE_FIELDS = ['emDia', 'vencida', 'outrosCompromissos', 'creditoALiberar', 'coobrigacoes', 'limite'];

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
    projecaoParametros,
    assinaturaSugestoesDispensa,
    categorizacaoRegras,
    categorizacaoMemoria,
    transactionAliases,
    registratoSnapshots,
    registratoResumos,
    registratoSugestoesDispensa,
  ] = await Promise.all([
    getAll('assinaturas'),
    getAll('observacoes'),
    getAll('despesas_fixas'),
    getAll('lancamentos'),
    getAll('extrato_transacoes'),
    getAll('extrato_summary'),
    getAll('orcamentos'),
    getAll('projecao_parametros'),
    getAll('assinatura_sugestoes_dispensa'),
    getAll('categorizacao_regras'),
    getAll('categorizacao_memoria'),
    getAll('transaction_aliases'),
    getAll('registrato_scr_snapshot'),
    getAll('registrato_scr_resumo_mensal'),
    getAll('registrato_sugestoes_dispensa'),
  ]);

  extratoSummary.sort((a, b) => {
    const mesesNomes = ['Nov','Dez','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out'];
    const [mA, aA] = a.mes.split('/');
    const [mB, aB] = b.mes.split('/');
    if (aA !== aB) return parseInt(aA, 10) - parseInt(aB, 10);
    return mesesNomes.indexOf(mA) - mesesNomes.indexOf(mB);
  });

  const lancamentosNormalizados = lancamentos
    .map(normalizeLancamentoCartao)
    .filter(Boolean);

  const registratoResumosNormalizados = registratoResumos.filter(normalizeRegistratoEntry);
  const registratoSnapshotsNormalizados = registratoSnapshots.filter(normalizeRegistratoEntry);

  return {
    assinaturas,
    observacoes,
    despesasFixas: despesasFixas.map(normalizeDespesaFixa),
    lancamentos: lancamentosNormalizados,
    extratoTransacoes,
    extratoSummary,
    orcamentos,
    simuladorProjecaoConfig: projecaoParametros[0] || null,
    assinaturaSugestoesDispensa,
    categorizacaoRegras,
    categorizacaoMemoria,
    transactionAliases,
    registratoSnapshots: registratoSnapshotsNormalizados,
    registratoResumos: registratoResumosNormalizados,
    registratoSugestoesDispensa,
  };
}

function normalizeDespesaFixa(item) {
  const desc = String(item?.desc ?? item?.nome ?? '').trim();
  const nome = String(item?.nome ?? item?.desc ?? '').trim();
  const recorrencia = String(item?.recorrencia ?? 'fixa').trim() || 'fixa';
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
    recorrencia,
    parcelas,
  };
}

function normalizeLancamentoCartao(item) {
  const desc = String(item?.desc ?? '').trim();
  if (!desc) return item;
  if (isResumoNaoTransacionalCartao(desc)) return null;
  if (item?.parcela) return item;

  const parcelaInfo = extrairParcelaFinal(desc);
  if (!parcelaInfo || !parcelaInfo.desc) return item;

  return {
    ...item,
    desc: parcelaInfo.desc,
    parcela: parcelaInfo.parcela,
    totalCompra: item?.totalCompra ?? null,
  };
}

function isResumoNaoTransacionalCartao(desc) {
  const normalized = String(desc ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const moneyCount = [...String(desc ?? '').matchAll(/[\d.]{1,10},\d{2}/g)].length;

  return moneyCount >= 2 && (
    normalized.includes('PROXIMAS FATURAS') ||
    normalized.includes('PROXIMA FATURA') ||
    normalized.includes('XIMAS FATURAS') ||
    normalized.includes('COMPRAS PARCELADAS')
  );
}

function normalizeRegistratoEntry(item) {
  if (!item) return false;
  if (item?.semRegistros) return true;
  if (Number(item?.totalOperacoes || 0) > 0) return true;

  return REGISTRATO_VALUE_FIELDS.some(field => {
    const value = Number(item?.[field]);
    return Number.isFinite(value) && value > 0;
  });
}

function buildProjectionRecurringItems(despesasFixas = [], assinaturas = []) {
  const manualFixas = (despesasFixas || []).map(item => ({ ...item }));
  const subscriptions = (assinaturas || [])
    .map(item => ({
      id: `assinatura:${item?.id ?? item?.nome ?? ''}`,
      desc: String(item?.nome ?? '').trim(),
      nome: String(item?.nome ?? '').trim(),
      cat: String(item?.cat ?? 'Assinaturas').trim() || 'Assinaturas',
      valor: Number(item?.valor || 0),
      recorrencia: 'fixa',
      source: 'assinatura',
    }))
    .filter(item => item.desc && Number.isFinite(item.valor) && item.valor > 0);

  return [...manualFixas, ...subscriptions];
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
    simuladorProjecaoConfig,
    assinaturaSugestoesDispensa,
    categorizacaoRegras,
    categorizacaoMemoria,
    transactionAliases,
    registratoSnapshots,
    registratoResumos,
    registratoSugestoesDispensa,
  } = await loadDashboardData();

  const registratoSuggestions = buildRegistratoSuggestions({
    despesasFixas,
    assinaturas,
    lancamentos,
    extratoTransacoes,
    registratoSnapshots,
    registratoResumos,
    dismissals: registratoSugestoesDispensa,
  });
  const registratoInsights = computeRegistratoInsights(registratoResumos, registratoSuggestions);
  const cardBillSummaries = buildCardBillSummaries(lancamentos);
  const extratoTransacoesReconciled = normalizeOwnTransfers(
    reconcileAccountCardPayments(extratoTransacoes, cardBillSummaries),
  );
  const spendAnalytics = buildSpendAnalytics({
    lancamentos,
    extratoTransacoes: extratoTransacoesReconciled,
  });
  const scrProjectionModel = buildScrProjectionModel({
    despesasFixas,
    lancamentos,
    extratoTransacoes: extratoTransacoesReconciled,
    registratoSnapshots,
    registratoResumos,
    dismissals: registratoSugestoesDispensa,
  });
  const parcelamentoSummary = buildParcelamentoSummary({
    despesasFixas,
    lancamentos,
  });
  const projectionRecurringItems = buildProjectionRecurringItems(despesasFixas, assinaturas);
  const automaticProjection = buildAutomaticProjectionInputs({
    extratoTransacoes: extratoTransacoesReconciled,
    extratoSummary,
    cardBillSummaries,
    recurringCommitments: projectionRecurringItems,
  });
  const financialAnalysis = buildFinancialAnalysisModel({
    assinaturas,
    despesasFixas,
    recurringCommitments: projectionRecurringItems,
    extratoSummary,
    orcamentos,
    registratoInsights,
    cardBillSummaries,
    spendAnalytics,
    scrProjectionModel,
    automaticProjection,
  });

  buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, extratoTransacoesReconciled, lancamentos, registratoInsights, cardBillSummaries, {
    financialAnalysis,
  });
  buildAnaliseFinanceira(financialAnalysis, {
    automaticProjection,
    scrProjectionModel,
  });
  buildAssinaturas(assinaturas, observacoes, lancamentos, extratoTransacoesReconciled, assinaturaSugestoesDispensa, transactionAliases);
  buildDespesasFixas(despesasFixas, registratoSuggestions, transactionAliases);
  buildParcelamentos(despesasFixas, lancamentos, transactionAliases);
  initLancamentos(lancamentos, extratoTransacoesReconciled, assinaturas, despesasFixas, {
    analytics: spendAnalytics,
    cardBillSummaries,
    categorizationRules: categorizacaoRegras,
    categorizationMemories: categorizacaoMemoria,
    financialAnalysis,
    registratoContextRows: [],
    transactionAliases,
  });
  initExtrato(extratoTransacoesReconciled, extratoSummary, {
    cardBillSummaries,
    financialAnalysis,
    registratoContextRows: [],
    registratoInsights,
    transactionAliases,
  });
  initProjecao(despesasFixas, extratoSummary, registratoInsights, {
    scrProjectionModel,
    parcelamentoSummary,
    automaticProjection,
    persistedSimulatorConfig: simuladorProjecaoConfig,
    financialAnalysis,
    extratoTransacoes: extratoTransacoesReconciled,
    cardBillSummaries,
    recurringCommitments: projectionRecurringItems,
  });
  buildRegistrato(registratoResumos, registratoSnapshots, registratoSuggestions, registratoInsights, {
    financialAnalysis,
  });
  await buildImportar();
}

async function renderRegistratoSurfaces() {
  const {
    assinaturas,
    categorizacaoMemoria,
    categorizacaoRegras,
    despesasFixas,
    lancamentos,
    extratoTransacoes,
    extratoSummary,
    orcamentos,
    simuladorProjecaoConfig,
    registratoSnapshots,
    registratoResumos,
    registratoSugestoesDispensa,
    transactionAliases,
  } = await loadDashboardData();

  const registratoSuggestions = buildRegistratoSuggestions({
    despesasFixas,
    assinaturas,
    lancamentos,
    extratoTransacoes,
    registratoSnapshots,
    registratoResumos,
    dismissals: registratoSugestoesDispensa,
  });
  const registratoInsights = computeRegistratoInsights(registratoResumos, registratoSuggestions);
  const cardBillSummaries = buildCardBillSummaries(lancamentos);
  const extratoTransacoesReconciled = normalizeOwnTransfers(
    reconcileAccountCardPayments(extratoTransacoes, cardBillSummaries),
  );
  const scrProjectionModel = buildScrProjectionModel({
    despesasFixas,
    lancamentos,
    extratoTransacoes: extratoTransacoesReconciled,
    registratoSnapshots,
    registratoResumos,
    dismissals: registratoSugestoesDispensa,
  });
  const parcelamentoSummary = buildParcelamentoSummary({
    despesasFixas,
    lancamentos,
  });
  const projectionRecurringItems = buildProjectionRecurringItems(despesasFixas, assinaturas);
  const automaticProjection = buildAutomaticProjectionInputs({
    extratoTransacoes: extratoTransacoesReconciled,
    extratoSummary,
    cardBillSummaries,
    recurringCommitments: projectionRecurringItems,
  });
  const spendAnalytics = buildSpendAnalytics({
    lancamentos,
    extratoTransacoes: extratoTransacoesReconciled,
  });
  const financialAnalysis = buildFinancialAnalysisModel({
    assinaturas,
    despesasFixas,
    recurringCommitments: projectionRecurringItems,
    extratoSummary,
    orcamentos,
    registratoInsights,
    cardBillSummaries,
    spendAnalytics,
    scrProjectionModel,
    automaticProjection,
  });

  buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, extratoTransacoesReconciled, lancamentos, registratoInsights, cardBillSummaries, {
    financialAnalysis,
  });
  buildAnaliseFinanceira(financialAnalysis, {
    automaticProjection,
    scrProjectionModel,
  });
  buildDespesasFixas(despesasFixas, registratoSuggestions, transactionAliases);
  buildParcelamentos(despesasFixas, lancamentos, transactionAliases);
  initLancamentos(lancamentos, extratoTransacoesReconciled, assinaturas, despesasFixas, {
    analytics: spendAnalytics,
    cardBillSummaries,
    categorizationRules: categorizacaoRegras,
    categorizationMemories: categorizacaoMemoria,
    financialAnalysis,
    registratoContextRows: [],
    transactionAliases,
  });
  initExtrato(extratoTransacoesReconciled, extratoSummary, {
    cardBillSummaries,
    financialAnalysis,
    registratoContextRows: [],
    registratoInsights,
    transactionAliases,
  });
  initProjecao(despesasFixas, extratoSummary, registratoInsights, {
    scrProjectionModel,
    parcelamentoSummary,
    automaticProjection,
    persistedSimulatorConfig: simuladorProjecaoConfig,
    financialAnalysis,
    extratoTransacoes: extratoTransacoesReconciled,
    cardBillSummaries,
    recurringCommitments: projectionRecurringItems,
  });
  buildRegistrato(registratoResumos, registratoSnapshots, registratoSuggestions, registratoInsights, {
    financialAnalysis,
  });
}

function nextPaint() {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function refreshDashboard(options = {}) {
  const { defer = false } = options;
  _refreshChain = _refreshChain
    .catch(() => {})
    .then(async () => {
      if (defer) await nextPaint();
      return renderDashboard();
    });
  return _refreshChain;
}

function refreshRegistratoSurfaces(options = {}) {
  const { defer = false } = options;
  _refreshChain = _refreshChain
    .catch(() => {})
    .then(async () => {
      if (defer) await nextPaint();
      return renderRegistratoSurfaces();
    });
  return _refreshChain;
}

// ── Navegação por abas ────────────────────────────────────────────────────────

function switchTab(event, name) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('tabindex', '-1');
  });
  document.querySelectorAll('.tab-content').forEach(panel => panel.classList.remove('active'));

  document.getElementById('tab-' + name)?.classList.add('active');

  // Ativa o botão da aba no menu desktop
  const tabBtn = event?.currentTarget?.classList?.contains('tab')
    ? event.currentTarget
    : document.getElementById(`tab-button-${name}`);
  tabBtn?.classList.add('active');
  tabBtn?.setAttribute('aria-selected', 'true');
  tabBtn?.setAttribute('tabindex', '0');

  // Sincroniza o seletor mobile
  const mobileSelect = document.getElementById('mobileTabSelect');
  if (mobileSelect && mobileSelect.value !== name) mobileSelect.value = name;
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

if (typeof window !== 'undefined') {
  window.switchTab          = switchTab;
  window.filterLancamentos  = filterLancamentos;
  window.sortLancamentosBy  = sortLancamentosBy;
  window.clearLancamentosFilters = clearLancamentosFilters;
  window.filterExtrato      = filterExtrato;
  window.clearExtratoFilters = clearExtratoFilters;
  window.recalcularProjecao = recalcularProjecao;
  window.clearBase          = clearBase;
  window.clearAllDashboardData = clearAllDashboardData;
  window.refreshDashboard   = refreshDashboard;
  window.refreshRegistratoSurfaces = refreshRegistratoSurfaces;

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
}

// ── Executa ───────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof indexedDB !== 'undefined') {
  init();
}
