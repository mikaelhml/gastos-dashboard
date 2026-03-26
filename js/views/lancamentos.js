import { fmt } from '../utils/formatters.js';
import { addItem, putItem, deleteItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';

let _lancamentos = [];
let _dialogBound = false;
let _editDialogBound = false;

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

export function initLancamentos(lancamentos, extratoTransacoes = [], _assinaturas = [], _despesasFixas = []) {
  // Normaliza extrato para o mesmo formato dos lançamentos do cartão
  const extratoNorm = extratoTransacoes.map(t => ({
    ...t,                        // mantém todos os campos originais (incluindo id real)
    _origId: t.id,               // backup do id real para escrita no DB
    id:      'ext_' + (t.id ?? Math.random()), // id prefixado para evitar colisão em memória
    fatura:  t.mes,              // alias de exibição
    source:  'conta',
  }));

  const cartaoNorm = lancamentos.map(l => ({ ...l, source: 'cartao' }));

  // Mescla e ordena por data decrescente
  _lancamentos = [...cartaoNorm, ...extratoNorm].sort((a, b) => parseDataTs(b.data) - parseDataTs(a.data));

  const cats = [...new Set(_lancamentos.map(l => l.cat))].sort();
  const sel = document.getElementById('filterCat');
  sel.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => sel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);

  const faturas = [...new Set(_lancamentos.map(l => l.fatura))].sort();
  const selFat = document.getElementById('filterFatura');
  selFat.innerHTML = '<option value="">Todos os meses/faturas</option>';
  faturas.forEach(f => selFat.innerHTML += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`);

  bindConvertDialog();
  bindEditDialog();
  renderLancamentos(_lancamentos);
}

const CAT_COLORS = {
  'Salário':        { bg: '#1a4731', color: '#68d391', border: '#276749' },
  'Rendimento':     { bg: '#1a3a3a', color: '#4fd1c5', border: '#234e52' },
  'Família':        { bg: '#3d1a3a', color: '#f687b3', border: '#702459' },
  'Moradia':        { bg: '#1a2e4a', color: '#63b3ed', border: '#2a4a7f' },
  'Educação':       { bg: '#1e2257', color: '#7f9cf5', border: '#3c366b' },
  'Telecom':        { bg: '#1a3340', color: '#76e4f7', border: '#1d4044' },
  'Utilidades':     { bg: '#3d3000', color: '#f6e05e', border: '#744210' },
  'Fatura Crédito': { bg: '#3d1a1a', color: '#fc8181', border: '#742a2a' },
  'Saúde':          { bg: '#3d2a1a', color: '#fbd38d', border: '#7b341e' },
  'Previdência':    { bg: '#2d1f00', color: '#f6ad55', border: '#7b341e' },
  'Associação':     { bg: '#1a3320', color: '#9ae6b4', border: '#22543d' },
  'Investimentos':  { bg: '#332200', color: '#d69e2e', border: '#744210' },
  'Transferência':  { bg: '#2d1f40', color: '#b794f4', border: '#553c9a' },
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
    parcelamento:  { cls: 'tipo-badge-parcelamento',  icon: '📦', label: 'Parcelamento' },
    financiamento: { cls: 'tipo-badge-financiamento', icon: '🏦', label: 'Financiamento' },
  };
  const m = map[l.tipo_classificado];
  if (!m) return '';
  const nome = l.classificado_nome ? ` · ${escapeHtml(l.classificado_nome)}` : '';
  return `<span class="${m.cls}">${m.icon} ${m.label}${nome}</span>`;
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
  const tbody = document.getElementById('lancamentosTable');
  tbody.innerHTML = '';

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
    const isParc       = !!l.parcela;
    const isClassificado = !!l.tipo_classificado;
    const isConta      = l.source === 'conta';
    const isEntrada    = isConta && l.tipo === 'entrada';

    let parcelaHtml = '';
    if (isParc) {
      const cp = calcParcelaAtual(l.parcela, l.data);
      if (cp && cp.atual > cp.parcelaDoc) {
        parcelaHtml = `<span class="parcela-badge" style="margin-left:6px">📦 ${cp.parcelaDoc}/${cp.total}<span style="color:#a0aec0;font-size:0.74rem;margin-left:4px">→ ${cp.atual}ª atual</span></span>`;
      } else {
        parcelaHtml = `<span class="parcela-badge" style="margin-left:6px">📦 ${escapeHtml(l.parcela)}</span>`;
      }
    }
    const descHtml = `${escapeHtml(l.desc)}${parcelaHtml}`;

    // Badge de origem
    const origemBadge = isConta
      ? `<span class="badge" style="background:#1a3535;color:#4fd1c5;border:1px solid #234e52;font-size:0.7rem;margin-left:4px">🏦 Conta</span>`
      : `<span class="badge" style="background:#1a2240;color:#7f9cf5;border:1px solid #3c366b;font-size:0.7rem;margin-left:4px">💳 Cartão</span>`;

    // Saídas da conta também são classificáveis (despesa, assinatura etc.)
    const canClassify = !isConta || l.tipo === 'saida';

    const classifyHtml = isClassificado
      ? buildTipoBadge(l)
      : canClassify
        ? `<div class="cell-actions">
            <button type="button" class="btn-inline-secondary" data-lancamento-action="assinatura" data-lancamento-id="${l.id ?? ''}">Assinatura</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="despesa" data-lancamento-id="${l.id ?? ''}">Despesa</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="parcelamento" data-lancamento-id="${l.id ?? ''}">Parcelamento</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="financiamento" data-lancamento-id="${l.id ?? ''}">Financiamento</button>
          </div>`
        : '';

    const acoesHtml = `
      <div class="row-actions-wrap">
        <div class="row-classify">${classifyHtml}</div>
        <div class="row-edit-del">
          <button type="button" class="btn-icon-edit" data-edit-id="${l.id ?? ''}" title="Editar lançamento">✏️</button>
          <button type="button" class="btn-icon-del" data-del-id="${l.id ?? ''}" title="Excluir lançamento">🗑️</button>
        </div>
      </div>`;

    // Cor do valor: conta-entrada=verde, conta-saída=vermelho, cartão-parcela=laranja, cartão=padrão
    const valorColor = isEntrada ? '#68d391' : isConta ? '#fc8181' : isParc ? '#f6ad55' : 'inherit';
    const valorSign  = isEntrada ? '+' : isConta ? '−' : '';

    tbody.innerHTML += `
      <tr class="${isParc ? 'row-parcela' : ''}${isClassificado ? ' row-classificado' : ''}${isConta ? ' row-conta' : ''}">
        <td style="color:#718096">${i + 1}</td>
        <td>${escapeHtml(l.data)}</td>
        <td><span class="badge badge-blue">${escapeHtml(l.fatura)}</span>${origemBadge}</td>
        <td>${descHtml}</td>
        <td><span class="badge" style="${catBadgeStyle(l.cat)}">${escapeHtml(l.cat)}</span></td>
        <td style="text-align:right;font-weight:600;color:${valorColor}">${valorSign}${fmt(l.valor)}</td>
        <td style="text-align:right">${acoesHtml}</td>
      </tr>`;
  });

  const nCartao  = data.filter(l => l.source !== 'conta').length;
  const nConta   = data.filter(l => l.source === 'conta').length;
  const nParc    = data.filter(l => l.parcela).length;
  const nClass   = data.filter(l => l.tipo_classificado).length;
  document.getElementById('lancamentosCount').innerHTML =
    `${data.length} transaç${data.length !== 1 ? 'ões' : 'ão'} &nbsp;·&nbsp; ` +
    `<span style="color:#7f9cf5">💳 ${nCartao} cartão</span> &nbsp;·&nbsp; ` +
    `<span style="color:#4fd1c5">🏦 ${nConta} conta</span>` +
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

  const filtered = _lancamentos.filter(l => {
    if (q && !l.desc.toLowerCase().includes(q)) return false;
    if (fat && l.fatura !== fat) return false;
    if (cat && l.cat !== cat) return false;
    if (origem && l.source !== origem) return false;
    if (tipo === 'nao_classificado' && l.tipo_classificado) return false;
    if (tipo && tipo !== 'nao_classificado' && l.tipo_classificado !== tipo) return false;
    return true;
  });
  renderLancamentos(filtered);
}

export function clearLancamentosFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterFatura').value = '';
  document.getElementById('filterCat').value = '';
  const filterTipo   = document.getElementById('filterTipo');
  const filterOrigem = document.getElementById('filterOrigem');
  if (filterTipo)   filterTipo.value = '';
  if (filterOrigem) filterOrigem.value = '';
  filterLancamentos();
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
      if (action === 'assinatura') {
        await addItem('assinaturas', { icon, nome, cat, valor });
      } else if (action === 'despesa') {
        await addItem('despesas_fixas', { icon, nome, cat, valor, obs });
      } else if (action === 'parcelamento') {
        const pagas = parseInt(document.getElementById('convertPagas').value, 10) || 1;
        const total = parseInt(document.getElementById('convertTotal').value, 10) || 12;
        const inicio = document.getElementById('convertInicio').value || inferirInicioParcelamento(lancamento.data, pagas);
        await addItem('despesas_fixas', { icon, nome, cat, valor, obs, tipo: 'parcelamento', pagas, total, inicio });
      } else if (action === 'financiamento') {
        const pagas = parseInt(document.getElementById('convertPagas').value, 10) || 1;
        const total = parseInt(document.getElementById('convertTotal').value, 10) || 48;
        const inicio = document.getElementById('convertInicio').value || inferirInicioParcelamento(lancamento.data, pagas);
        await addItem('despesas_fixas', { icon, nome, cat, valor, obs, tipo: 'financiamento', pagas, total, inicio });
      }

      const store = getStore(lancamento);
      const updated = prepareForDb({
        ...lancamento,
        tipo_classificado: action,
        classificado_nome: nome,
      });
      await putItem(store, updated);

      const idx = _lancamentos.findIndex(l => String(l.id) === String(lancamentoId));
      if (idx !== -1) {
        _lancamentos[idx] = { ..._lancamentos[idx], tipo_classificado: action, classificado_nome: nome };
      }

      setFeedback('Salvo com sucesso!', 'success', 'lancamentoConvertFeedback');
      setTimeout(() => { close(); renderLancamentos(_lancamentos); window.refreshDashboard?.(); }, 800);
    } catch (err) {
      console.error('[lancamentos] Erro ao converter:', err);
      setFeedback('Erro ao salvar. Tente novamente.', 'error', 'lancamentoConvertFeedback');
    }
  });
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
  document.getElementById('convertPagas').value = parcelaAtual;
  document.getElementById('convertTotal').value = parcelaTotal;
  document.getElementById('convertInicio').value = inferirInicioParcelamento(lancamento.data, parcelaAtual);

  const isParcelado = action === 'parcelamento' || action === 'financiamento';
  document.querySelectorAll('.convert-parcelado-field').forEach(el => {
    el.style.display = isParcelado ? '' : 'none';
  });
  const obsField = document.getElementById('convertObsField');
  if (obsField) obsField.style.display = action === 'assinatura' ? 'none' : '';
  const iconField = document.getElementById('convertIconField');
  if (iconField) iconField.style.display = action === 'despesa' || action === 'assinatura' ? '' : 'none';

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
      renderLancamentos(_lancamentos);
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
    renderLancamentos(_lancamentos);
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
    const cat     = document.getElementById('editCat').value.trim();
    const valor   = parseFloat(document.getElementById('editValor').value);
    const parcela = document.getElementById('editParcela').value.trim() || null;

    if (!data || !fatura || !desc || !cat || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('Preencha todos os campos obrigatórios.', 'error', 'lancamentoEditFeedback');
      return;
    }

    const updated = prepareForDb({ ...lancamento, data, fatura, desc, cat, valor, parcela });
    await putItem(getStore(lancamento), updated);
    const idx = _lancamentos.findIndex(l => String(l.id) === String(rawId));
    if (idx !== -1) { _lancamentos[idx] = { ..._lancamentos[idx], data, fatura, desc, cat, valor, parcela }; }

    setFeedback('Salvo!', 'success', 'lancamentoEditFeedback');
    setTimeout(() => { close(); renderLancamentos(_lancamentos); }, 700);
  });
}

function openEditDialog(lancamento) {
  const dialog = document.getElementById('lancamentoEditDialog');
  if (!dialog) return;
  document.getElementById('editLancamentoId').value = lancamento.id ?? '';
  document.getElementById('editData').value    = lancamento.data    || '';
  document.getElementById('editFatura').value  = lancamento.fatura  || '';
  document.getElementById('editDesc').value    = lancamento.desc    || '';
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
  if (action === 'parcelamento') return 'Registrar parcelamento';
  return 'Registrar financiamento';
}

function getDialogSubmitLabel(action) {
  if (action === 'assinatura')   return 'Salvar assinatura';
  if (action === 'despesa')      return 'Salvar despesa fixa';
  if (action === 'parcelamento') return 'Salvar parcelamento';
  return 'Salvar financiamento';
}

function buildObsBase(lancamento) {
  return `Criado a partir do lançamento ${lancamento.data} (${lancamento.fatura})`;
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