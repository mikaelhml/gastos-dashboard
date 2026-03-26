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

function bindConver