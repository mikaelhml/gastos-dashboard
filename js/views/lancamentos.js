import { fmt } from '../utils/formatters.js';
import { buildTransactionsCsv, downloadTransactionsCsv } from '../utils/transaction-export.js';
import { addItem, putItem, deleteItem, getAll } from '../db.js';
import { escapeHtml } from '../utils/dom.js';
import { enriquecerCanal, getCanalMeta, inferirCanal, listarCanais } from '../utils/transaction-tags.js';
import { buildEmptyStateViewModels } from '../utils/empty-states.js';
import { buildAliasLookup, buildDisplayNameMeta, buildTransactionAliasKey } from '../utils/display-names.js';
import {
  applyCategorizationToImportedRows,
  buildCategoryMemoryRecord,
  buildCategorizationRuntime,
  buildRecategorizedRowPatches,
  normalizeCategoryText,
  sortCategorizationRules,
} from '../utils/categorization-engine.js';

let _lancamentos = [];
let _currentDisplayedRows = [];
let _dialogBound = false;
let _editDialogBound = false;
let _categorizationDialogBound = false;
let _analyticsChart = null;
let _sortState = { key: 'data', direction: 'desc' };
let _categorizationRules = [];
let _categorizationMemories = [];
let _firstRunLancamentosModel = null;
let _transactionAliasLookup = new Map();
const ANALYTICS_COLORS = ['#fc8181', '#63b3ed', '#68d391', '#f6e05e', '#b794f4', '#f6ad55', '#76e4f7', '#fbb6ce', '#90cdf4', '#a0aec0'];

function parseDataTs(data) {
  const parts = String(data ?? '').split('/');
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts.map(Number);
  return new Date(yyyy, mm - 1, dd).getTime();
}

// Retorna o nome do store correto para leitura/escrita no IndexedDB
function getStore(lancamento) {
  return lancamento.source === 'conta' ? 'extrato_transacoes' : 'lancamentos';
}

// Prepara o objeto para salvar no DB: restaura o id original para itens da conta
function prepareForDb(item) {
  if (item.source !== 'conta') return item;
  return { ...item, id: item._origId };
}

export function initLancamentos(lancamentos, extratoTransacoes = [], _assinaturas = [], _despesasFixas = [], context = {}) {
  // Normaliza extrato para o mesmo formato dos lançamentos do cartão
  const extratoNorm = extratoTransacoes.map(t => enriquecerCanal({
    ...t,
    _origId: t.id,
    id: 'ext_' + (t.id ?? Math.random()),
    fatura: t.mes,
    source: 'conta',
  }));

  const cartaoNorm = lancamentos.map(l => enriquecerCanal({ ...l, source: 'cartao' }));
  const contextRows = (context.registratoContextRows || []).map(item => ({ ...item }));
  _categorizationRules = sortCategorizationRules(context.categorizationRules || []).map(rule => ({
    ...rule,
    enabled: rule?.enabled !== false,
  }));
  _categorizationMemories = (context.categorizationMemories || []).map(memory => ({
    ...memory,
    enabled: memory?.enabled !== false,
  }));
  _transactionAliasLookup = buildAliasLookup(context.transactionAliases || []);
  const emptyStates = buildEmptyStateViewModels({
    importedTransactionCount: cartaoNorm.length + extratoNorm.length,
    manualSubscriptionCount: _assinaturas?.length || 0,
    manualFixedExpenseCount: _despesasFixas?.length || 0,
  });
  _firstRunLancamentosModel = emptyStates.transactions.shouldRender ? emptyStates.transactions : null;

  // Mescla e ordena por data decrescente
  _lancamentos = [...cartaoNorm, ...extratoNorm, ...contextRows].sort((a, b) => parseDataTs(b.data) - parseDataTs(a.data));

  toggleLancamentosSections(!_firstRunLancamentosModel);
  renderLancamentosEmptyState(_firstRunLancamentosModel);

  if (_firstRunLancamentosModel) {
    if (_analyticsChart) {
      _analyticsChart.destroy();
      _analyticsChart = null;
    }
    const count = document.getElementById('lancamentosCount');
    if (count) count.innerHTML = '';
    return;
  }

  refreshLancamentosFilterOptions(document.getElementById('filterCat')?.value || '');

  const canais = listarCanais(_lancamentos);
  const selCanal = document.getElementById('filterCanal');
  if (selCanal) {
    selCanal.innerHTML = '<option value="">Todos os canais</option>';
    canais.forEach(canal => {
      const meta = getCanalMeta(canal);
      selCanal.innerHTML += `<option value="${meta.id}">${meta.icon} ${escapeHtml(meta.label)}</option>`;
    });
  }

  const faturas = [...new Set(_lancamentos.map(l => l.fatura))].sort();
  const selFat = document.getElementById('filterFatura');
  selFat.innerHTML = '<option value="">Todos os meses/faturas</option>';
  faturas.forEach(f => selFat.innerHTML += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`);

  bindConvertDialog();
  bindEditDialog();
  bindCategorizationDialog();
  bindExportButton();
  renderLancamentosAnalytics(context.analytics || null);
  buildLancamentosContextPanel(context.cardBillSummaries || [], contextRows);
  renderCategorizationPanel();
  renderLancamentos(getSortedLancamentos(_lancamentos));
}

function toggleLancamentosSections(visible) {
  const display = visible ? '' : 'none';
  [
    'lancamentosAnalyticsPanel',
    'lancamentosContextPanel',
    'lancamentosCategorizationPanel',
    'lancamentosFilters',
    'lancamentosTableWrap',
    'lancamentosCount',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  });
}

function renderLancamentosEmptyState(model) {
  const host = document.getElementById('lancamentosEmptyState');
  if (!host) return;

  if (!model?.shouldRender) {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }

  host.innerHTML = buildGuidedEmptyMarkup(model, 'Lançamentos reais');
  host.style.display = '';
  bindGuidedEmptyActions(host);
}

function buildGuidedEmptyMarkup(model, badge) {
  return `
    <div class="guided-empty-state">
      <div class="guided-empty-state-header">
        <div>
          <h3>${escapeHtml(model.title || '')}</h3>
          <p>${escapeHtml(model.body || '')}</p>
        </div>
        <div class="guided-empty-state-badge">${escapeHtml(badge)}</div>
      </div>
      <div class="guided-empty-state-actions">
        ${(model.actions || []).map(action => `
          <button
            type="button"
            class="${action.intent === 'importar' ? 'btn-primary' : 'btn-inline-secondary'}"
            data-empty-state-intent="${escapeHtml(action.intent)}"
            data-empty-state-tab="${escapeHtml(action.tab)}"
          >${escapeHtml(action.label)}</button>
        `).join('')}
      </div>
    </div>`;
}

function bindGuidedEmptyActions(container) {
  container.querySelectorAll('[data-empty-state-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-empty-state-tab');
      const intent = button.getAttribute('data-empty-state-intent');
      if (!tab) return;
      window.switchTab?.(null, tab);
      if (intent === 'restaurar-backup') {
        document.getElementById('fullBackupImportBtn')?.click();
      }
    });
  });
}

const CAT_COLORS = {
  'Alimentação':    { bg: '#33210d', color: '#f6ad55', border: '#744210' },
  'Salário':        { bg: '#1a4731', color: '#68d391', border: '#276749' },
  'Rendimento':     { bg: '#1a3a3a', color: '#4fd1c5', border: '#234e52' },
  'Família':        { bg: '#3d1a3a', color: '#f687b3', border: '#702459' },
  'Moradia':        { bg: '#1a2e4a', color: '#63b3ed', border: '#2a4a7f' },
  'Educação':       { bg: '#1e2257', color: '#7f9cf5', border: '#3c366b' },
  'Telecom':        { bg: '#1a3340', color: '#76e4f7', border: '#1d4044' },
  'Transporte':     { bg: '#1f2a44', color: '#90cdf4', border: '#2c5282' },
  'Utilidades':     { bg: '#3d3000', color: '#f6e05e', border: '#744210' },
  'Fatura Crédito': { bg: '#3d1a1a', color: '#fc8181', border: '#742a2a' },
  'Saúde':          { bg: '#3d2a1a', color: '#fbd38d', border: '#7b341e' },
  'Previdência':    { bg: '#2d1f00', color: '#f6ad55', border: '#7b341e' },
  'Associação':     { bg: '#1a3320', color: '#9ae6b4', border: '#22543d' },
  'Investimentos':  { bg: '#332200', color: '#d69e2e', border: '#744210' },
  'Transferência':  { bg: '#2d1f40', color: '#b794f4', border: '#553c9a' },
  'Contexto SCR':   { bg: '#2d1f4f', color: '#d6bcfa', border: '#6b46c1' },
};

function catBadgeStyle(cat) {
  const c = CAT_COLORS[cat];
  if (!c) return 'background:#2d3748;color:#a0aec0;border:1px solid #4a5568';
  return `background:${c.bg};color:${c.color};border:1px solid ${c.border}`;
}

function buildTipoBadge(l) {
  if (!l.tipo_classificado) return '';
  const map = {
    assinatura:    { cls: 'tipo-badge-assinatura',   icon: '🔁', label: 'Assinatura' },
    despesa:       { cls: 'tipo-badge-despesa',       icon: '📋', label: 'Despesa Fixa' },
    despesa_variavel: { cls: 'tipo-badge-despesa-variavel', icon: '📈', label: 'Despesa Variavel' },
    parcelamento:  { cls: 'tipo-badge-parcelamento',  icon: '📦', label: 'Parcelamento' },
    financiamento: { cls: 'tipo-badge-financiamento', icon: '🏦', label: 'Financiamento' },
  };
  const m = map[l.tipo_classificado];
  if (!m) return '';
  const nome = l.classificado_nome ? ` · ${escapeHtml(l.classificado_nome)}` : '';
  return `<span class="${m.cls}">${m.icon} ${m.label}${nome}</span>`;
}

function buildCanalBadge(item) {
  const meta = getCanalMeta(item.canal || inferirCanal(item));
  return `<span class="badge ${meta.badgeClass}">${meta.icon} ${escapeHtml(meta.label)}</span>`;
}

function calcParcelaAtual(parcela, dataLanc) {
  if (!parcela) return null;
  const match = /^(\d+)\/(\d+)$/.exec(String(parcela));
  if (!match) return null;
  const parcelaDoc = parseInt(match[1], 10);
  const total      = parseInt(match[2], 10);
  const parts      = String(dataLanc ?? '').split('/');
  if (parts.length !== 3) return { parcelaDoc, total, atual: parcelaDoc };
  const mm   = parseInt(parts[1], 10);
  const yyyy = parseInt(parts[2], 10);
  if (!mm || !yyyy) return { parcelaDoc, total, atual: parcelaDoc };
  const today = new Date();
  const diff  = (today.getFullYear() - yyyy) * 12 + (today.getMonth() + 1 - mm);
  const atual = Math.max(parcelaDoc, Math.min(parcelaDoc + diff, total));
  return { parcelaDoc, total, atual };
}

function renderLancamentos(data) {
  _currentDisplayedRows = data;
  const realCount = data.filter(r => !r.contextoDerivado).length;
  const scope = document.getElementById('lancamentosExportScope');
  if (scope) scope.textContent = `${realCount} transaç${realCount !== 1 ? 'ões' : 'ão'} filtrada${realCount !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('lancamentosTable');
  tbody.innerHTML = '';
  updateSortButtons();

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>Nenhum lançamento encontrado</strong>
            Ajuste os filtros ou importe uma fatura para preencher esta aba.
          </div>
        </td>
      </tr>`;
    document.getElementById('lancamentosCount').textContent = '0 lançamentos';
    return;
  }

  data.forEach((l, i) => {
    const isContexto   = !!l.contextoDerivado;
    const isParc       = !!l.parcela;
    const isClassificado = !!l.tipo_classificado;
    const isConta      = l.source === 'conta';
    const isCartao     = l.source === 'cartao';
    const isEntrada    = isConta && l.tipo === 'entrada';

    let parcelaHtml = '';
    if (isParc && !isContexto) {
      const cp = calcParcelaAtual(l.parcela, l.data);
      if (cp && cp.atual > cp.parcelaDoc) {
        parcelaHtml = `<span class="parcela-badge" style="margin-left:6px">📦 ${cp.parcelaDoc}/${cp.total}<span style="color:#a0aec0;font-size:0.74rem;margin-left:4px">→ ${cp.atual}ª atual</span></span>`;
      } else {
        parcelaHtml = `<span class="parcela-badge" style="margin-left:6px">📦 ${escapeHtml(l.parcela)}</span>`;
      }
    }
    const displayName = buildDisplayNameMeta(l.desc, {
      maxLength: isContexto ? 56 : 44,
      stripInstallmentSuffix: isParc && !isContexto,
      aliases: _transactionAliasLookup,
    });
    const descHtml = `
      <span class="display-name display-name--table" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</span>
      ${parcelaHtml}`;

    // Badge de origem
    const origemBadge = isContexto
      ? `<span class="badge badge-purple" style="font-size:0.7rem;margin-left:4px">🏛️ Registrato</span>`
      : isConta
      ? `<span class="badge" style="background:#1a3535;color:#4fd1c5;border:1px solid #234e52;font-size:0.7rem;margin-left:4px">🏦 Conta</span>`
      : `<span class="badge" style="background:#1a2240;color:#7f9cf5;border:1px solid #3c366b;font-size:0.7rem;margin-left:4px">💳 Cartão</span>`;
    const canalBadge = isContexto ? '' : buildCanalBadge(l);

    // Saídas da conta também são classificáveis (despesa, assinatura etc.)
    const canClassify = !isContexto && (!isConta || l.tipo === 'saida');

    const classifyHtml = isClassificado
      ? buildTipoBadge(l)
      : canClassify
        ? `<div class="cell-actions">
            <button type="button" class="btn-inline-secondary" data-lancamento-action="assinatura" data-lancamento-id="${l.id ?? ''}">Assinatura</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="despesa" data-lancamento-id="${l.id ?? ''}">Despesa</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="despesa_variavel" data-lancamento-id="${l.id ?? ''}">Variavel</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="parcelamento" data-lancamento-id="${l.id ?? ''}">Parcelamento</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="financiamento" data-lancamento-id="${l.id ?? ''}">Financiamento</button>
          </div>`
        : '';

    const acoesHtml = isContexto ? '' : `
      <div class="row-actions-wrap">
        <div class="row-classify">${classifyHtml}</div>
        <div class="row-edit-del">
          <button type="button" class="btn-icon-edit" data-edit-id="${l.id ?? ''}" title="Editar lançamento">✏️</button>
          <button type="button" class="btn-icon-del" data-del-id="${l.id ?? ''}" title="Excluir lançamento">🗑️</button>
        </div>
      </div>`;

    const valorColor = isContexto ? '#b794f4' : isEntrada ? '#68d391' : (isConta || isCartao) ? '#fc8181' : 'inherit';
    const valorSign  = isEntrada ? '+' : (isConta || isCartao) ? '−' : '';
    const resumoRegistrato = l.registratoResumo || null;
    const descricaoFinal = isContexto
      ? `${descHtml}<div style="font-size:0.78rem;color:#718096;margin-top:4px">${escapeHtml(
          resumoRegistrato?.semRegistros
            ? 'Sem operações de crédito nesta competência.'
            : `Em dia ${fmt(Number(resumoRegistrato?.emDia || 0))} · Vencida ${fmt(Number(resumoRegistrato?.vencida || 0))} · Outros ${fmt(Number(resumoRegistrato?.outrosCompromissos || 0))}`
        )}</div>`
      : descHtml;

    tbody.innerHTML += `
      <tr class="${isParc ? 'row-parcela' : ''}${isClassificado ? ' row-classificado' : ''}${isConta ? ' row-conta' : ''}${isContexto ? ' row-contexto-scr' : ''}">
        <td data-label="#" style="color:#718096">${i + 1}</td>
        <td data-label="Data">${escapeHtml(l.data)}</td>
        <td data-label="Fatura/Mês"><span class="badge badge-blue">${escapeHtml(l.fatura)}</span>${origemBadge}</td>
        <td data-label="Descrição">${descricaoFinal}</td>
        <td data-label="Categoria"><div class="cell-badges"><span class="badge" style="${catBadgeStyle(l.cat)}">${escapeHtml(l.cat)}</span>${canalBadge}</div></td>
        <td data-label="Valor" style="text-align:right;font-weight:600;color:${valorColor}">${isContexto && resumoRegistrato?.semRegistros ? '—' : `${valorSign}${fmt(l.valor)}`}</td>
        <td data-label="Ações" style="text-align:right">${acoesHtml}</td>
      </tr>`;
  });

  const reais = data.filter(l => !l.contextoDerivado);
  const nCartao  = reais.filter(l => l.source === 'cartao').length;
  const nConta   = reais.filter(l => l.source === 'conta').length;
  const nParc    = reais.filter(l => l.parcela).length;
  const nClass   = reais.filter(l => l.tipo_classificado).length;
  const nScr     = data.filter(l => l.contextoDerivado).length;
  document.getElementById('lancamentosCount').innerHTML =
    `${reais.length} transaç${reais.length !== 1 ? 'ões' : 'ão'} reais &nbsp;·&nbsp; ` +
    `<span style="color:#7f9cf5">💳 ${nCartao} cartão</span> &nbsp;·&nbsp; ` +
    `<span style="color:#4fd1c5">🏦 ${nConta} conta</span>` +
    `${nScr ? ` &nbsp;·&nbsp; <span style="color:#b794f4">🏛️ ${nScr} linha(s) SCR</span>` : ''}` +
    `${nParc ? ` &nbsp;·&nbsp; 📦 ${nParc} parcelados` : ''}` +
    `${nClass ? ` &nbsp;·&nbsp; ${nClass} classificados` : ''}`;

  bindActionButtons();
  bindEditDeleteButtons();
}

export function filterLancamentos() {
  const q      = document.getElementById('searchInput').value.toLowerCase();
  const fat    = document.getElementById('filterFatura').value;
  const cat    = document.getElementById('filterCat').value;
  const tipo   = document.getElementById('filterTipo')?.value || '';
  const origem = document.getElementById('filterOrigem')?.value || '';
  const canal  = document.getElementById('filterCanal')?.value || '';

  const filtered = _lancamentos.filter(l => {
    if (q && !l.desc.toLowerCase().includes(q)) return false;
    if (fat && l.fatura !== fat) return false;
    if (cat && l.cat !== cat) return false;
    if (origem && l.source !== origem) return false;
    if (canal && (l.canal || inferirCanal(l)) !== canal) return false;
    if (l.contextoDerivado) return !tipo;
    if (tipo === 'nao_classificado' && l.tipo_classificado) return false;
    if (tipo && tipo !== 'nao_classificado' && l.tipo_classificado !== tipo) return false;
    return true;
  });
  renderLancamentos(getSortedLancamentos(filtered));
}

export function clearLancamentosFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterFatura').value = '';
  document.getElementById('filterCat').value = '';
  const filterTipo   = document.getElementById('filterTipo');
  const filterCanal  = document.getElementById('filterCanal');
  const filterOrigem = document.getElementById('filterOrigem');
  if (filterTipo)   filterTipo.value = '';
  if (filterCanal)  filterCanal.value = '';
  if (filterOrigem) filterOrigem.value = '';
  filterLancamentos();
}

export function sortLancamentosBy(key) {
  if (!key) return;
  _sortState = _sortState.key === key
    ? { key, direction: _sortState.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: (key === 'data' || key === 'valor') ? 'desc' : 'asc' };
  filterLancamentos();
}

function getSortedLancamentos(items) {
  const sorted = [...items];
  const direction = _sortState.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    const base = compareLancamentoValues(a, b, _sortState.key);
    if (base !== 0) return base * direction;
    return parseDataTs(b?.data) - parseDataTs(a?.data);
  });

  return sorted;
}

function compareLancamentoValues(a, b, key) {
  if (key === 'data') return parseDataTs(a?.data) - parseDataTs(b?.data);
  if (key === 'fatura') return compareText(a?.fatura, b?.fatura);
  if (key === 'descricao') return compareText(a?.desc, b?.desc);
  if (key === 'categoria') return compareText(a?.cat, b?.cat);
  if (key === 'valor') return getComparableDisplayValue(a) - getComparableDisplayValue(b);
  return 0;
}

function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { sensitivity: 'base' });
}

function updateSortButtons() {
  document.querySelectorAll('[data-sort-lancamentos]').forEach(button => {
    const key = button.getAttribute('data-sort-lancamentos');
    const isActive = key === _sortState.key;
    const arrow = isActive ? (_sortState.direction === 'asc' ? '▲' : '▼') : '↕';
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('active', isActive);
    const label = button.getAttribute('data-sort-label') || button.textContent || '';
    button.innerHTML = `<span>${escapeHtml(label)}</span><span class="sort-indicator">${arrow}</span>`;
  });
}

function getComparableDisplayValue(item) {
  if (item?.contextoDerivado) {
    return item?.registratoResumo?.semRegistros ? 0 : Number(item?.valor || 0);
  }

  if (item?.source === 'conta' && item?.tipo === 'entrada') {
    return Number(item?.valor || 0);
  }

  return -Math.abs(Number(item?.valor || 0));
}

function buildLancamentosContextPanel(cardBillSummaries, contextRows) {
  const panel = document.getElementById('lancamentosContextPanel');
  if (!panel) return;

  if ((!cardBillSummaries || cardBillSummaries.length === 0) && (!contextRows || contextRows.length === 0)) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.style.display = '';
  panel.innerHTML = `
    <div class="helper-panel-header">
      <div>
        <h3>Faturas do cartão + contexto do Registrato</h3>
        <p>Os gastos reais do cartão continuam nas linhas normais. O SCR entra como linha derivada por competência para ajudar a interpretar compromissos em aberto sem duplicar valores transacionais.</p>
      </div>
    </div>
    <div class="helper-badges">
      ${cardBillSummaries.slice(0, 6).map(item => `<span class="badge badge-red">💳 ${escapeHtml(item.fatura)} · ${escapeHtml(fmt(item.total))}</span>`).join('')}
      ${contextRows.length ? `<span class="badge badge-purple">🏛️ ${contextRows.length} competência(s) do SCR refletidas nas faturas importadas</span>` : ''}
    </div>
  `;
}

function renderCategorizationPanel() {
  const panel = document.getElementById('lancamentosCategorizationPanel');
  const summary = document.getElementById('categorizationRulesSummary');
  if (!panel || !summary) return;

  const enabledRules = _categorizationRules.filter(rule => rule.enabled !== false).length;
  const enabledMemories = _categorizationMemories.filter(memory => memory.enabled !== false).length;

  panel.style.display = '';
  summary.innerHTML = `
    <span class="badge badge-blue">🧩 ${enabledRules}/${_categorizationRules.length} regra(s) ativa(s)</span>
    <span class="badge badge-purple">🧠 ${enabledMemories}/${_categorizationMemories.length} correção(ões) ativa(s)</span>
    <span class="badge badge-gray">Ordem: memória → regra explícita → padrão → Outros</span>
  `;
}

function getKnownCategories() {
  return [...new Set([
    ...Object.keys(CAT_COLORS).filter(cat => cat !== 'Contexto SCR'),
    ..._lancamentos.map(item => normalizeCategoryText(item?.cat)).filter(Boolean),
    ..._categorizationRules.map(rule => normalizeCategoryText(rule?.category)).filter(Boolean),
    ..._categorizationMemories.map(memory => normalizeCategoryText(memory?.category)).filter(Boolean),
  ])].sort((left, right) => left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }));
}

function populateCategorizationCategorySelect(selectedCategory = '') {
  const selectEl = document.getElementById('categorizationRuleCategorySelect');
  if (!selectEl) return;

  const normalizedSelected = normalizeCategoryText(selectedCategory);
  const knownCategories = getKnownCategories();
  const hasKnownMatch = normalizedSelected && knownCategories.includes(normalizedSelected);

  selectEl.innerHTML = `
    <option value="">Selecione uma categoria</option>
    ${knownCategories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
    <option value="__custom__">+ Nova categoria</option>
  `;

  if (hasKnownMatch) {
    selectEl.value = normalizedSelected;
    setCategorizationCategoryMode('select', normalizedSelected);
    return;
  }

  if (normalizedSelected) {
    selectEl.value = '__custom__';
    setCategorizationCategoryMode('custom', normalizedSelected);
    return;
  }

  selectEl.value = '';
  setCategorizationCategoryMode('select', '');
}

function setCategorizationCategoryMode(mode, customValue = '') {
  const customField = document.getElementById('categorizationRuleCustomCategoryField');
  const customInput = document.getElementById('categorizationRuleCustomCategory');
  if (!customField || !customInput) return;

  const isCustom = mode === 'custom';
  customField.style.display = isCustom ? '' : 'none';
  customInput.required = isCustom;
  customInput.value = isCustom ? customValue : '';
}

function getCategorizationRuleCategoryValue() {
  const selectEl = document.getElementById('categorizationRuleCategorySelect');
  const customInput = document.getElementById('categorizationRuleCustomCategory');
  if (!selectEl) return '';

  if (selectEl.value === '__custom__') {
    return normalizeCategoryText(customInput?.value || '');
  }

  return normalizeCategoryText(selectEl.value || '');
}

function refreshLancamentosFilterOptions(selectedCategory = '') {
  const selectEl = document.getElementById('filterCat');
  if (!selectEl) return;

  const normalizedSelected = normalizeCategoryText(selectedCategory);
  const categories = getKnownCategories();

  selectEl.innerHTML = '<option value="">Todas as categorias</option>';
  categories.forEach(category => {
    selectEl.innerHTML += `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
  });

  if (normalizedSelected && categories.includes(normalizedSelected)) {
    selectEl.value = normalizedSelected;
    return;
  }

  selectEl.value = '';
}

function syncInMemoryRecategorization(runtime, rules = [], memories = []) {
  _categorizationRules = sortCategorizationRules(rules).map(rule => ({
    ...rule,
    enabled: rule?.enabled !== false,
  }));
  _categorizationMemories = (memories || []).map(memory => ({
    ...memory,
    enabled: memory?.enabled !== false,
  }));

  _lancamentos = _lancamentos.map(item => {
    if (item?.contextoDerivado) return item;

    const [recategorized] = applyCategorizationToImportedRows([item], runtime, {
      source: item?.source === 'conta' ? 'conta' : 'cartao',
      direction: getLancamentoDirection(item),
    });

    return {
      ...item,
      cat: recategorized?.cat ?? item.cat,
      cat_origem: recategorized?.cat_origem ?? item.cat_origem ?? null,
      cat_regra_id: recategorized?.cat_regra_id ?? item.cat_regra_id ?? null,
    };
  });

  refreshLancamentosFilterOptions(document.getElementById('filterCat')?.value || '');
  renderCategorizationPanel();
  filterLancamentos();
}

async function recategorizePersistedImportsFromRules() {
  const [rules, memories, cardRows, accountRows] = await Promise.all([
    getAll('categorizacao_regras'),
    getAll('categorizacao_memoria'),
    getAll('lancamentos'),
    getAll('extrato_transacoes'),
  ]);

  const runtime = buildCategorizationRuntime({ rules, memories });
  const cardPatches = buildRecategorizedRowPatches(cardRows, runtime, {
    source: 'cartao',
    direction: 'saida',
  });
  const accountPatches = buildRecategorizedRowPatches(accountRows, runtime, {
    source: 'conta',
    direction: row => row?.tipo === 'entrada' ? 'entrada' : 'saida',
  });

  await Promise.all([
    ...cardPatches.map(item => putItem('lancamentos', item)),
    ...accountPatches.map(item => putItem('extrato_transacoes', item)),
  ]);

  syncInMemoryRecategorization(runtime, rules, memories);

  return {
    totalChanged: cardPatches.length + accountPatches.length,
    cardChanged: cardPatches.length,
    accountChanged: accountPatches.length,
  };
}

function appendRecategorizationMessage(message, recategorizationResult = {}) {
  const totalChanged = Number(recategorizationResult?.totalChanged || 0);
  if (!totalChanged) {
    return `${message} Nenhum lançamento existente precisou ser reclassificado.`;
  }

  const details = [];
  if (recategorizationResult.cardChanged) details.push(`${recategorizationResult.cardChanged} de cartão`);
  if (recategorizationResult.accountChanged) details.push(`${recategorizationResult.accountChanged} de conta`);

  return `${message} ${totalChanged} lançamento(s) existente(s) reclassificado(s)${details.length ? ` (${details.join(' · ')})` : ''}.`;
}

function bindExportButton() {
  const btn   = document.getElementById('lancamentosExportCsvBtn');
  const scope = document.getElementById('lancamentosExportScope');
  if (!btn || btn.dataset.exportBound) return;
  btn.dataset.exportBound = '1';
  btn.addEventListener('click', () => {
    const csv     = buildTransactionsCsv(_currentDisplayedRows);
    const now     = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadTransactionsCsv(csv, `lancamentos_${now}.csv`);
    if (scope) scope.textContent = `${_currentDisplayedRows.filter(r => !r.contextoDerivado).length} transações exportadas`;
  });
}

function bindCategorizationDialog() {
  if (_categorizationDialogBound) return;
  _categorizationDialogBound = true;

  const dialog = document.getElementById('lancamentosCategorizationDialog');
  const openBtn = document.getElementById('openLancamentosCategorizationDialog');
  const closeTop = document.getElementById('lancamentosCategorizationCloseTop');
  const closeBtn = document.getElementById('lancamentosCategorizationClose');
  const form = document.getElementById('categorizationRuleForm');
  const resetBtn = document.getElementById('categorizationRuleReset');
  const categorySelect = document.getElementById('categorizationRuleCategorySelect');
  const rulesList = document.getElementById('categorizationRulesList');
  const memoryList = document.getElementById('categorizationMemoryList');
  if (!dialog || !form || !categorySelect || !rulesList || !memoryList) return;

  const close = () => {
    dialog.close();
    setFeedback('', '', 'categorizationRuleFormFeedback');
  };
  const refreshFromDb = async (message, reopenDialog = true) => {
    const shouldReopen = reopenDialog && dialog.open;
    if (shouldReopen) dialog.close();
    await window.refreshDashboard?.();
    setFeedback(message, 'success', 'categorizationRulesFeedback');
    if (shouldReopen) {
      renderCategorizationDialog();
      dialog.showModal();
    }
  };

  openBtn?.addEventListener('click', () => {
    resetCategorizationRuleForm();
    renderCategorizationDialog();
    dialog.showModal();
  });
  closeTop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  resetBtn?.addEventListener('click', () => resetCategorizationRuleForm());
  categorySelect.addEventListener('change', () => {
    setCategorizationCategoryMode(
      categorySelect.value === '__custom__' ? 'custom' : 'select',
      '',
    );
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const ruleId = document.getElementById('categorizationRuleId')?.value || '';
    const pattern = document.getElementById('categorizationRulePattern')?.value.trim() || '';
    const category = getCategorizationRuleCategoryValue();
    const sourceScope = document.getElementById('categorizationRuleSource')?.value || 'all';
    const directionScope = document.getElementById('categorizationRuleDirection')?.value || 'all';
    const enabled = !!document.getElementById('categorizationRuleEnabled')?.checked;

    if (!pattern || !category) {
      setFeedback('Informe um padrão e uma categoria para salvar a regra.', 'error', 'categorizationRuleFormFeedback');
      return;
    }

    const existingRule = _categorizationRules.find(rule => String(rule.id) === String(ruleId));
    const nextPriority = existingRule?.priority
      ?? (_categorizationRules.reduce((max, rule) => Math.max(max, Number(rule?.priority || 0)), 0) + 1);

    const payload = {
      ...(existingRule || {}),
      ...(ruleId ? { id: existingRule?.id ?? Number(ruleId) } : {}),
      pattern,
      category,
      sourceScope,
      directionScope,
      enabled,
      priority: nextPriority,
    };

    if (existingRule) {
      await putItem('categorizacao_regras', payload);
    } else {
      await addItem('categorizacao_regras', payload);
    }
    const recategorizationResult = await recategorizePersistedImportsFromRules();

    resetCategorizationRuleForm();
    close();
    await refreshFromDb(appendRecategorizationMessage('Regra de categorização salva.', recategorizationResult), false);
  });

  rulesList.addEventListener('click', async event => {
    const button = event.target.closest('[data-rule-action]');
    if (!button) return;

    const ruleId = button.getAttribute('data-rule-id');
    const action = button.getAttribute('data-rule-action');
    const rule = _categorizationRules.find(item => String(item.id) === String(ruleId));
    if (!rule) return;

    if (action === 'edit') {
      resetCategorizationRuleForm(rule);
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Excluir a regra "${rule.pattern}"?`)) return;
      await deleteItem('categorizacao_regras', rule.id);
      const recategorizationResult = await recategorizePersistedImportsFromRules();
      await refreshFromDb(appendRecategorizationMessage('Regra removida.', recategorizationResult));
      return;
    }

    if (action === 'toggle') {
      await putItem('categorizacao_regras', { ...rule, enabled: rule.enabled === false });
      const recategorizationResult = await recategorizePersistedImportsFromRules();
      await refreshFromDb(
        appendRecategorizationMessage(rule.enabled === false ? 'Regra ativada.' : 'Regra pausada.', recategorizationResult),
      );
      return;
    }

    if (action === 'move-up' || action === 'move-down') {
      const ordered = sortCategorizationRules(_categorizationRules);
      const currentIndex = ordered.findIndex(item => String(item.id) === String(ruleId));
      const targetIndex = action === 'move-up' ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

      const nextOrder = [...ordered];
      [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
      const normalizedOrder = sortCategorizationRules(nextOrder.map((item, index) => ({
        ...item,
        priority: index + 1,
      })));
      for (const item of normalizedOrder) {
        await putItem('categorizacao_regras', item);
      }
      const recategorizationResult = await recategorizePersistedImportsFromRules();
      await refreshFromDb(appendRecategorizationMessage('Prioridade da regra atualizada.', recategorizationResult));
    }
  });

  memoryList.addEventListener('click', async event => {
    const button = event.target.closest('[data-memory-action]');
    if (!button) return;

    const action = button.getAttribute('data-memory-action');
    const memoryKey = button.getAttribute('data-memory-key');
    const memory = _categorizationMemories.find(item => String(item.key) === String(memoryKey));
    if (!memory) return;

    if (action === 'edit') {
      const nextCategory = window.prompt('Nova categoria lembrada:', memory.category || '');
      if (nextCategory == null) return;
      const normalized = normalizeCategoryText(nextCategory);
      if (!normalized) {
        setFeedback('Informe uma categoria válida para a memória.', 'error', 'categorizationRuleFormFeedback');
        return;
      }
      await putItem('categorizacao_memoria', { ...memory, category: normalized });
      await refreshFromDb('Correção lembrada atualizada.');
      return;
    }

    if (action === 'toggle') {
      await putItem('categorizacao_memoria', { ...memory, enabled: memory.enabled === false });
      await refreshFromDb(memory.enabled === false ? 'Correção lembrada ativada.' : 'Correção lembrada pausada.');
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Excluir a correção lembrada para "${memory.descriptionNorm}"?`)) return;
      await deleteItem('categorizacao_memoria', memory.key);
      await refreshFromDb('Correção lembrada removida.');
    }
  });
}

function renderCategorizationDialog() {
  const rulesList = document.getElementById('categorizationRulesList');
  const memoryList = document.getElementById('categorizationMemoryList');
  if (!rulesList || !memoryList) return;

  populateCategorizationCategorySelect(getCategorizationRuleCategoryValue());

  const orderedRules = sortCategorizationRules(_categorizationRules);
  rulesList.innerHTML = orderedRules.length
    ? orderedRules.map((rule, index) => `
      <div class="categorization-list-item">
        <div>
          <div class="categorization-list-title">${escapeHtml(rule.pattern)}</div>
          <div class="categorization-list-meta">
            <span class="badge ${rule.enabled === false ? 'badge-gray' : 'badge-blue'}">${rule.enabled === false ? 'Pausada' : 'Ativa'}</span>
            <span class="badge badge-purple">${escapeHtml(rule.category || 'Outros')}</span>
            <span class="badge badge-gray">${escapeHtml(describeRuleScope(rule))}</span>
            <span class="badge badge-gray">Prioridade ${index + 1}</span>
          </div>
        </div>
        <div class="categorization-list-actions">
          <button type="button" class="btn-inline-secondary" data-rule-action="move-up" data-rule-id="${rule.id ?? ''}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-inline-secondary" data-rule-action="move-down" data-rule-id="${rule.id ?? ''}" ${index === orderedRules.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn-inline-secondary" data-rule-action="edit" data-rule-id="${rule.id ?? ''}">Editar</button>
          <button type="button" class="btn-inline-secondary" data-rule-action="toggle" data-rule-id="${rule.id ?? ''}">${rule.enabled === false ? 'Ativar' : 'Pausar'}</button>
          <button type="button" class="btn-inline-secondary btn-danger" data-rule-action="delete" data-rule-id="${rule.id ?? ''}">Excluir</button>
        </div>
      </div>
    `).join('')
    : '<div class="empty-state"><strong>Nenhuma regra explícita ainda.</strong> Crie uma regra para sobrescrever a categorização padrão nas próximas importações.</div>';

  memoryList.innerHTML = _categorizationMemories.length
    ? _categorizationMemories.map(memory => `
      <div class="categorization-list-item">
        <div>
          <div class="categorization-list-title">${escapeHtml(memory.descriptionNorm || memory.key)}</div>
          <div class="categorization-list-meta">
            <span class="badge ${memory.enabled === false ? 'badge-gray' : 'badge-purple'}">${memory.enabled === false ? 'Pausada' : 'Ativa'}</span>
            <span class="badge badge-blue">${escapeHtml(memory.category || 'Outros')}</span>
            <span class="badge badge-gray">${escapeHtml(describeMemoryScope(memory))}</span>
          </div>
        </div>
        <div class="categorization-list-actions">
          <button type="button" class="btn-inline-secondary" data-memory-action="edit" data-memory-key="${escapeHtml(memory.key || '')}">Editar categoria</button>
          <button type="button" class="btn-inline-secondary" data-memory-action="toggle" data-memory-key="${escapeHtml(memory.key || '')}">${memory.enabled === false ? 'Ativar' : 'Pausar'}</button>
          <button type="button" class="btn-inline-secondary btn-danger" data-memory-action="delete" data-memory-key="${escapeHtml(memory.key || '')}">Excluir</button>
        </div>
      </div>
    `).join('')
    : '<div class="empty-state"><strong>Nenhuma correção lembrada ainda.</strong> Quando você corrigir uma categoria manualmente, ela aparecerá aqui para futuras importações.</div>';
}

function resetCategorizationRuleForm(rule = null) {
  const idEl = document.getElementById('categorizationRuleId');
  const patternEl = document.getElementById('categorizationRulePattern');
  const sourceEl = document.getElementById('categorizationRuleSource');
  const directionEl = document.getElementById('categorizationRuleDirection');
  const enabledEl = document.getElementById('categorizationRuleEnabled');
  const submitEl = document.getElementById('categorizationRuleSubmit');
  if (!idEl || !patternEl || !sourceEl || !directionEl || !enabledEl || !submitEl) return;

  idEl.value = rule?.id ?? '';
  patternEl.value = rule?.pattern ?? '';
  sourceEl.value = rule?.sourceScope ?? 'all';
  directionEl.value = rule?.directionScope ?? 'all';
  enabledEl.checked = rule?.enabled !== false;
  submitEl.textContent = rule ? 'Salvar regra' : 'Criar regra';
  populateCategorizationCategorySelect(rule?.category ?? '');
  setFeedback('', '', 'categorizationRuleFormFeedback');
}

function describeRuleScope(rule) {
  const source = rule?.sourceScope && rule.sourceScope !== 'all' ? rule.sourceScope : 'qualquer origem';
  const direction = rule?.directionScope && rule.directionScope !== 'all' ? rule.directionScope : 'qualquer direção';
  return `${source} · ${direction}`;
}

function describeMemoryScope(memory) {
  const source = memory?.sourceScope && memory.sourceScope !== 'all' ? memory.sourceScope : 'qualquer origem';
  const direction = memory?.directionScope && memory.directionScope !== 'all' ? memory.directionScope : 'qualquer direção';
  return `${source} · ${direction}`;
}

function renderLancamentosAnalytics(analytics) {
  const panel = document.getElementById('lancamentosAnalyticsPanel');
  const summary = document.getElementById('lancamentosAnalyticsSummary');
  const movers = document.getElementById('lancamentosAnalyticsMovers');
  const quality = document.getElementById('lancamentosAnalyticsQuality');

  if (!panel || !summary || !movers || !quality) return;

  if (_analyticsChart) {
    _analyticsChart.destroy();
    _analyticsChart = null;
  }

  if (!analytics || !analytics.months?.length) {
    panel.style.display = '';
    summary.innerHTML = `
      <div class="empty-state lancamentos-analytics-empty">
        <strong>Sem histórico suficiente para analytics</strong>
        Importe meses de cartão e/ou conta para montar a tendência por categoria nesta aba.
      </div>
    `;
    quality.innerHTML = '<span class="badge badge-gray">Aguardando dados</span>';
    movers.innerHTML = '';
    return;
  }

  panel.style.display = '';

  summary.innerHTML = `
    <div class="lancamentos-analytics-cards">
      <div class="card" style="--accent:#63b3ed">
        <div class="label">Meses analisados</div>
        <div class="value">${analytics.months.length}</div>
        <div class="sub">${escapeHtml(analytics.months[0])} → ${escapeHtml(analytics.months[analytics.months.length - 1])}</div>
      </div>
      <div class="card" style="--accent:#fc8181">
        <div class="label">Gasto analisado</div>
        <div class="value">${fmt(analytics.totalSpend)}</div>
        <div class="sub">Somente saídas reais de cartão + conta</div>
      </div>
      <div class="card" style="--accent:#b794f4">
        <div class="label">Categorias visíveis</div>
        <div class="value">${analytics.categories.length}</div>
        <div class="sub">${escapeHtml(analytics.latestMonth || analytics.months[analytics.months.length - 1])}</div>
      </div>
    </div>
  `;

  if (analytics.quality?.shouldWarn) {
    quality.innerHTML = `<div class="lancamentos-analytics-quality-box is-warning">⚠️ ${escapeHtml(analytics.quality.note)}</div>`;
  } else {
    quality.innerHTML = '<span class="badge badge-green">Qualidade de categorização estável</span>';
  }

  movers.innerHTML = buildMoversMarkup(analytics);
  renderAnalyticsChart(analytics);
}

function buildMoversMarkup(analytics) {
  if (!analytics.previousMonth || !analytics.latestMonth) {
    return `
      <div class="empty-state lancamentos-analytics-empty">
        <strong>Comparativo mensal indisponível</strong>
        É preciso ter pelo menos dois meses importados para mostrar altas e quedas.
      </div>
    `;
  }

  if (!analytics.movers?.length) {
    return `
      <div class="empty-state lancamentos-analytics-empty">
        <strong>Sem variações detectadas</strong>
        Os meses ${escapeHtml(analytics.previousMonth)} e ${escapeHtml(analytics.latestMonth)} não trouxeram mudanças relevantes.
      </div>
    `;
  }

  return `
    <div class="lancamentos-movers-period">
      ${escapeHtml(analytics.previousMonth)} → ${escapeHtml(analytics.latestMonth)}
    </div>
    <div class="lancamentos-movers-list">
      ${analytics.movers.slice(0, 8).map(item => {
        const toneClass = item.delta > 0 || item.status === 'new'
          ? 'is-up'
          : item.delta < 0 || item.status === 'zeroed'
            ? 'is-down'
            : 'is-flat';
        const deltaPrefix = item.delta > 0 ? '+' : '';
        const pctLabel = item.note
          ? item.note
          : item.pct == null
            ? 'sem base comparável'
            : `${item.pct > 0 ? '+' : ''}${item.pct.toFixed(0)}%`;

        return `
          <div class="lancamentos-mover ${toneClass}">
            <div>
              <div class="lancamentos-mover-cat">${escapeHtml(item.cat)}</div>
              <div class="lancamentos-mover-meta">
                ${fmt(item.previous)} → ${fmt(item.current)}
              </div>
            </div>
            <div class="lancamentos-mover-delta">
              <strong>${deltaPrefix}${fmt(item.delta)}</strong>
              <span>${escapeHtml(pctLabel)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderAnalyticsChart(analytics) {
  const canvas = document.getElementById('lancamentosAnalyticsChart');
  if (!canvas || typeof Chart === 'undefined') return;

  _analyticsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: analytics.months,
      datasets: analytics.trendDatasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.data,
        backgroundColor: ANALYTICS_COLORS[index % ANALYTICS_COLORS.length],
        borderRadius: 6,
        borderSkipped: false,
      })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#a0aec0',
            boxWidth: 12,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: context => ` ${context.dataset.label}: ${fmt(context.raw)}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#a0aec0' },
          grid: { color: '#2d3748' },
        },
        y: {
          stacked: true,
          ticks: {
            color: '#a0aec0',
            callback: value => fmt(Number(value)),
          },
          grid: { color: '#2d3748' },
        },
      },
    },
  });
}

function bindActionButtons() {
  document.querySelectorAll('[data-lancamento-action]').forEach(button => {
    button.onclick = () => {
      const action = button.getAttribute('data-lancamento-action');
      const rawId  = button.getAttribute('data-lancamento-id');
      const lancamento = _lancamentos.find(item => String(item.id) === String(rawId));
      if (!lancamento) return;
      openConvertDialog(lancamento, action);
    };
  });
}

function bindConvertDialog() {
  if (_dialogBound) return;
  _dialogBound = true;

  const dialog   = document.getElementById('lancamentoConvertDialog');
  const form     = document.getElementById('lancamentoConvertForm');
  const cancelTop = document.getElementById('lancamentoConvertCancelTop');
  const cancelBtn = document.getElementById('lancamentoConvertCancel');
  const submitBtn = document.getElementById('lancamentoConvertSubmit');
  if (!dialog || !form) return;

  const close = () => { dialog.close(); setFeedback('', '', 'lancamentoConvertFeedback'); };
  cancelTop?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const lancamentoId = document.getElementById('convertLancamentoId').value;
    const action       = document.getElementById('convertAction').value;
    const icon         = document.getElementById('convertIcon')?.value || '💳';
    const nome         = document.getElementById('convertDescricao').value.trim();
    const cat          = document.getElementById('convertCategoria').value.trim();
    const valor        = parseFloat(document.getElementById('convertValor').value);
    const obs          = document.getElementById('convertObs').value.trim();

    if (!nome || !cat || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('Preencha todos os campos obrigatórios.', 'error', 'lancamentoConvertFeedback');
      return;
    }

    const lancamento = _lancamentos.find(l => String(l.id) === String(lancamentoId));
    if (!lancamento) return;

    try {
      toggleConvertSavingState(true);
      if (action === 'assinatura') {
        await addItem('assinaturas', { icon, nome, cat, valor });
      } else if (action === 'despesa') {
        await addItem('despesas_fixas', { icon, nome, desc: nome, cat, valor, obs });
      } else if (action === 'despesa_variavel') {
        await addItem('despesas_fixas', {
          icon,
          nome,
          desc: nome,
          cat,
          valor,
          obs,
          recorrencia: 'variavel',
        });
      } else if (action === 'parcelamento') {
        const pagas = parseInt(document.getElementById('convertPagas').value, 10) || 1;
        const total = parseInt(document.getElementById('convertTotal').value, 10) || 12;
        const inicio = document.getElementById('convertInicio').value || inferirInicioParcelamento(lancamento.data, pagas);
        await addItem('despesas_fixas', {
          icon,
          nome,
          desc: nome,
          cat,
          valor,
          obs,
          parcelas: { tipo: 'parcelamento', label: 'Parcelamento', pagas, total, inicio },
        });
      } else if (action === 'financiamento') {
        const pagas = parseInt(document.getElementById('convertPagas').value, 10) || 1;
        const total = parseInt(document.getElementById('convertTotal').value, 10) || 48;
        const inicio = document.getElementById('convertInicio').value || inferirInicioParcelamento(lancamento.data, pagas);
        await addItem('despesas_fixas', {
          icon,
          nome,
          desc: nome,
          cat,
          valor,
          obs,
          parcelas: { tipo: 'financiamento', label: 'Financiamento', pagas, total, inicio },
        });
      }

      const store = getStore(lancamento);
      const updated = prepareForDb({
        ...lancamento,
        tipo_classificado: action,
        classificado_nome: nome,
      });
      await putItem(store, updated);
      await rememberLancamentoCategory(lancamento, cat, 'convert-dialog');

      const idx = _lancamentos.findIndex(l => String(l.id) === String(lancamentoId));
      if (idx !== -1) {
        _lancamentos[idx] = { ..._lancamentos[idx], tipo_classificado: action, classificado_nome: nome };
      }

      close();
      renderLancamentos(getSortedLancamentos(_lancamentos));
      await window.refreshDashboard?.();
    } catch (err) {
      console.error('[lancamentos] Erro ao converter:', err);
      setFeedback('Erro ao salvar. Tente novamente.', 'error', 'lancamentoConvertFeedback');
    } finally {
      toggleConvertSavingState(false);
    }
  });

  function toggleConvertSavingState(isSaving) {
    if (submitBtn) {
      submitBtn.disabled = isSaving;
      submitBtn.textContent = isSaving ? 'Salvando...' : getDialogSubmitLabel(document.getElementById('convertAction')?.value || '');
    }
    if (cancelBtn) cancelBtn.disabled = isSaving;
    if (cancelTop) cancelTop.disabled = isSaving;
  }
}

function openConvertDialog(lancamento, action) {
  const dialog     = document.getElementById('lancamentoConvertDialog');
  const titleEl    = document.getElementById('lancamentoConvertTitle');
  const subtitleEl = document.getElementById('lancamentoConvertSubtitle');
  const submitBtn  = document.getElementById('lancamentoConvertSubmit');
  const preview    = document.getElementById('convertPreviewCard');
  if (!dialog) return;

  document.getElementById('convertLancamentoId').value = lancamento.id ?? '';
  document.getElementById('convertAction').value = action;
  document.getElementById('convertDescricao').value = lancamento.desc || '';
  document.getElementById('convertCategoria').value = lancamento.cat || '';
  document.getElementById('convertValor').value = (lancamento.valor ?? '').toString();
  document.getElementById('convertObs').value = buildObsBase(lancamento);

  const [parcelaAtual, parcelaTotal] = extrairParcelaPadrao(lancamento.parcela, action);
  document.getElementById('convertPagas').value = action === 'assinatura' ? '' : parcelaAtual;
  document.getElementById('convertTotal').value = action === 'assinatura' ? '' : parcelaTotal;
  document.getElementById('convertInicio').value = action === 'assinatura' ? '' : inferirInicioParcelamento(lancamento.data, parcelaAtual);

  const isParcelado = action === 'parcelamento' || action === 'financiamento';
  document.querySelectorAll('.convert-parcelado-field').forEach(el => {
    el.style.display = isParcelado ? '' : 'none';
  });
  const obsField = document.getElementById('convertObsField');
  if (obsField) obsField.style.display = action === 'assinatura' ? 'none' : '';
  const iconField = document.getElementById('convertIconField');
  if (iconField) iconField.style.display = action === 'despesa' || action === 'despesa_variavel' || action === 'assinatura' ? '' : 'none';

  if (titleEl)   titleEl.textContent = getDialogTitle(action);
  if (submitBtn) submitBtn.textContent = getDialogSubmitLabel(action);
  if (subtitleEl) subtitleEl.textContent = `${lancamento.data} · ${lancamento.fatura} · R$ ${(lancamento.valor ?? 0).toFixed(2).replace('.', ',')}`;

  if (preview) {
    preview.innerHTML = `<span style="font-size:0.8rem;color:#718096">Lançamento origem:</span><br>
      <strong style="color:#e2e8f0">${escapeHtml(lancamento.desc)}</strong>
      <span style="color:#a0aec0;font-size:0.85rem"> · R$ ${(lancamento.valor ?? 0).toFixed(2).replace('.', ',')}</span>`;
  }

  window.syncEmojiPicker?.('convertIconPicker', 'convertIconPreview', '💳');
  setFeedback('', '', 'lancamentoConvertFeedback');
  dialog.showModal();
}

function bindEditDeleteButtons() {
  document.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.onclick = async () => {
      const rawId = btn.getAttribute('data-del-id');
      const lancamento = _lancamentos.find(l => String(l.id) === String(rawId));
      if (!lancamento) return;
      if (!confirm(`Excluir lançamento "${lancamento.desc}"?`)) return;
      await deleteItem(getStore(lancamento), prepareForDb(lancamento).id ?? lancamento._origId ?? lancamento.id);
      _lancamentos = _lancamentos.filter(l => String(l.id) !== String(rawId));
      renderLancamentos(getSortedLancamentos(_lancamentos));
      window.refreshDashboard?.();
    };
  });

  document.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.onclick = () => {
      const rawId = btn.getAttribute('data-edit-id');
      const lancamento = _lancamentos.find(l => String(l.id) === String(rawId));
      if (!lancamento) return;
      openEditDialog(lancamento);
    };
  });
}

function bindEditDialog() {
  if (_editDialogBound) return;
  _editDialogBound = true;

  const dialog    = document.getElementById('lancamentoEditDialog');
  const form      = document.getElementById('lancamentoEditForm');
  const cancelTop = document.getElementById('lancamentoEditCancelTop');
  const cancelBtn = document.getElementById('lancamentoEditCancel');
  const removeBtn = document.getElementById('lancamentoEditRemoveClass');
  const aliasInput = document.getElementById('editAlias');
  if (!dialog || !form) return;

  const close = () => { dialog.close(); setFeedback('', '', 'lancamentoEditFeedback'); };
  cancelTop?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

  removeBtn?.addEventListener('click', async () => {
    const rawId = document.getElementById('editLancamentoId').value;
    const lancamento = _lancamentos.find(l => String(l.id) === String(rawId));
    if (!lancamento) return;
    const updated = prepareForDb({ ...lancamento, tipo_classificado: null, classificado_nome: null });
    await putItem(getStore(lancamento), updated);
    const idx = _lancamentos.findIndex(l => String(l.id) === String(rawId));
    if (idx !== -1) { _lancamentos[idx] = { ..._lancamentos[idx], tipo_classificado: null, classificado_nome: null }; }
    close();
    renderLancamentos(getSortedLancamentos(_lancamentos));
    window.refreshDashboard?.();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const rawId   = document.getElementById('editLancamentoId').value;
    const lancamento = _lancamentos.find(l => String(l.id) === String(rawId));
    if (!lancamento) return;

    const data    = document.getElementById('editData').value.trim();
    const fatura  = document.getElementById('editFatura').value.trim();
    const desc    = document.getElementById('editDesc').value.trim();
    const alias   = aliasInput?.value.trim() || '';
    const cat     = document.getElementById('editCat').value.trim();
    const valor   = parseFloat(document.getElementById('editValor').value);
    const parcela = document.getElementById('editParcela').value.trim() || null;

    if (!data || !fatura || !desc || !cat || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('Preencha todos os campos obrigatórios.', 'error', 'lancamentoEditFeedback');
      return;
    }

    const canal = inferirCanal({ ...lancamento, data, fatura, desc, cat, valor, parcela });
    const updated = prepareForDb({ ...lancamento, data, fatura, desc, cat, canal, valor, parcela });
    await putItem(getStore(lancamento), updated);
    await persistTransactionAlias(desc, alias, { stripInstallmentSuffix: !!parcela });
    if (normalizeCategoryText(cat) !== normalizeCategoryText(lancamento.cat)) {
      await rememberLancamentoCategory(lancamento, cat, 'manual-edit');
    }
    const idx = _lancamentos.findIndex(l => String(l.id) === String(rawId));
    if (idx !== -1) { _lancamentos[idx] = { ..._lancamentos[idx], data, fatura, desc, cat, canal, valor, parcela }; }

    setFeedback('Salvo!', 'success', 'lancamentoEditFeedback');
    setTimeout(() => {
      close();
      renderLancamentos(getSortedLancamentos(_lancamentos));
      window.refreshDashboard?.();
    }, 700);
  });
}

function openEditDialog(lancamento) {
  const dialog = document.getElementById('lancamentoEditDialog');
  if (!dialog) return;
  document.getElementById('editLancamentoId').value = lancamento.id ?? '';
  document.getElementById('editData').value    = lancamento.data    || '';
  document.getElementById('editFatura').value  = lancamento.fatura  || '';
  document.getElementById('editDesc').value    = lancamento.desc    || '';
  const aliasInput = document.getElementById('editAlias');
  if (aliasInput) {
    const aliasKey = buildTransactionAliasKey(lancamento.desc, { stripInstallmentSuffix: !!lancamento.parcela });
    aliasInput.value = _transactionAliasLookup.get(aliasKey) || '';
  }
  document.getElementById('editCat').value     = lancamento.cat     || '';
  document.getElementById('editValor').value   = (lancamento.valor ?? '').toString();
  document.getElementById('editParcela').value = lancamento.parcela || '';

  const infoEl = document.getElementById('editClassificacaoInfo');
  const removeBtn = document.getElementById('lancamentoEditRemoveClass');
  if (lancamento.tipo_classificado && infoEl) {
    infoEl.style.display = '';
    infoEl.innerHTML = `<span style="font-size:0.8rem;color:#a0aec0">Classificado como: <strong style="color:#e2e8f0">${lancamento.tipo_classificado}</strong>${lancamento.classificado_nome ? ` · ${escapeHtml(lancamento.classificado_nome)}` : ''}</span>`;
    if (removeBtn) removeBtn.style.display = '';
  } else {
    if (infoEl) infoEl.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  setFeedback('', '', 'lancamentoEditFeedback');
  dialog.showModal();
}

function inferirInicioParcelamento(data, pagas) {
  const parts = String(data ?? '').split('/').map(Number);
  if (parts.length !== 3) return '';
  const [, mm, yyyy] = parts;
  if (!Number.isInteger(mm) || !Number.isInteger(yyyy) || !Number.isInteger(pagas) || pagas < 1) return '';
  const inicio = new Date(yyyy, mm - pagas, 1);
  return `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
}

function extrairParcelaPadrao(parcela, tipo) {
  if ((tipo === 'parcelamento' || tipo === 'financiamento') && /^\d+\/\d+$/.test(String(parcela ?? ''))) {
    return String(parcela).split('/').map(Number);
  }
  return [1, tipo === 'financiamento' ? 48 : 12];
}

function getDialogTitle(action) {
  if (action === 'assinatura')   return 'Converter em assinatura';
  if (action === 'despesa')      return 'Converter em despesa fixa';
  if (action === 'despesa_variavel') return 'Converter em despesa recorrente variavel';
  if (action === 'parcelamento') return 'Registrar parcelamento';
  return 'Registrar financiamento';
}

function getDialogSubmitLabel(action) {
  if (action === 'assinatura')   return 'Salvar assinatura';
  if (action === 'despesa')      return 'Salvar despesa fixa';
  if (action === 'despesa_variavel') return 'Salvar despesa variavel';
  if (action === 'parcelamento') return 'Salvar parcelamento';
  return 'Salvar financiamento';
}

function buildObsBase(lancamento) {
  return `Criado a partir do lançamento ${lancamento.data} (${lancamento.fatura})`;
}

function getLancamentoDirection(lancamento) {
  if (lancamento?.source === 'conta') {
    return lancamento?.tipo === 'entrada' ? 'entrada' : 'saida';
  }
  return 'saida';
}

async function rememberLancamentoCategory(lancamento, category, learnedFrom) {
  if (!lancamento || lancamento?.contextoDerivado) return;

  const normalizedCategory = normalizeCategoryText(category);
  if (!normalizedCategory) return;

  const source = lancamento?.source === 'conta' ? 'conta' : 'cartao';
  const memoryRecord = buildCategoryMemoryRecord({
    desc: lancamento.desc,
    source,
    direction: getLancamentoDirection(lancamento),
    category: normalizedCategory,
    learnedFrom,
  });

  await putItem('categorizacao_memoria', memoryRecord);
}

async function persistTransactionAlias(desc, alias, options = {}) {
  const key = buildTransactionAliasKey(desc, options);
  if (!key) return;

  if (!alias) {
    _transactionAliasLookup.delete(key);
    await deleteItem('transaction_aliases', key);
    return;
  }

  const record = {
    key,
    alias,
    updatedAt: new Date().toISOString(),
  };
  _transactionAliasLookup.set(key, alias);
  await putItem('transaction_aliases', record);
}

function setFeedback(message, type, elementId = 'lancamentosActionFeedback') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message || '';
  el.className = `inline-form-feedback${type ? ` is-${type}` : ''}`;
  if (type === 'success') {
    window.clearTimeout(setFeedback._timer);
    setFeedback._timer = window.setTimeout(() => {
      el.textContent = '';
      el.className = 'inline-form-feedback';
    }, 3500);
  }
}
