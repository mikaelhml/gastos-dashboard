import { fmt } from '../utils/formatters.js';
import { addItem } from '../db.js';

let _lancamentos = [];
let _dialogBound = false;

export function initLancamentos(lancamentos) {
  _lancamentos = lancamentos;

  const cats = [...new Set(lancamentos.map(l => l.cat))].sort();
  const sel = document.getElementById('filterCat');
  sel.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => sel.innerHTML += `<option value="${c}">${c}</option>`);

  const faturas = [...new Set(lancamentos.map(l => l.fatura))].sort();
  const selFat = document.getElementById('filterFatura');
  selFat.innerHTML = '<option value="">Todas as faturas</option>';
  faturas.forEach(f => selFat.innerHTML += `<option value="${f}">${f}</option>`);

  bindConvertDialog();
  renderLancamentos(lancamentos);
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
    const isParc = !!l.parcela;
    const descHtml = isParc
      ? `${l.desc} <span class="parcela-badge" style="margin-left:6px">📦 ${l.parcela}</span>`
      : l.desc;

    tbody.innerHTML += `
      <tr class="${isParc ? 'row-parcela' : ''}">
        <td style="color:#718096">${i + 1}</td>
        <td>${l.data}</td>
        <td><span class="badge badge-blue">${l.fatura}</span></td>
        <td>${descHtml}</td>
        <td><span class="badge badge-purple">${l.cat}</span></td>
        <td style="text-align:right;font-weight:600;color:${isParc ? '#f6ad55' : 'inherit'}">${fmt(l.valor)}</td>
        <td style="text-align:right">
          <div class="cell-actions">
            <button type="button" class="btn-inline-secondary" data-lancamento-action="assinatura" data-lancamento-id="${l.id ?? ''}">Assinatura</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="despesa" data-lancamento-id="${l.id ?? ''}">Despesa</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="parcelamento" data-lancamento-id="${l.id ?? ''}">Parcelamento</button>
            <button type="button" class="btn-inline-secondary" data-lancamento-action="financiamento" data-lancamento-id="${l.id ?? ''}">Financiamento</button>
          </div>
        </td>
      </tr>`;
  });

  const total = data.reduce((s, l) => s + l.valor, 0);
  const nParc = data.filter(l => l.parcela).length;
  document.getElementById('lancamentosCount').textContent =
    `${data.length} lançamento${data.length !== 1 ? 's' : ''} · Total: ${fmt(total)}${nParc ? ` · 📦 ${nParc} parcelados` : ''}`;

  bindActionButtons();
}

export function filterLancamentos() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const fat = document.getElementById('filterFatura').value;
  const cat = document.getElementById('filterCat').value;
  const filtered = _lancamentos.filter(l =>
    (!q || l.desc.toLowerCase().includes(q)) &&
    (!fat || l.fatura === fat) &&
    (!cat || l.cat === cat)
  );
  renderLancamentos(filtered);
}

export function clearLancamentosFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterFatura').value = '';
  document.getElementById('filterCat').value = '';
  filterLancamentos();
}

function bindActionButtons() {
  document.querySelectorAll('[data-lancamento-action]').forEach(button => {
    button.onclick = () => {
      const action = button.getAttribute('data-lancamento-action');
      const rawId = button.getAttribute('data-lancamento-id');
      const lancamento = _lancamentos.find(item => String(item.id) === String(rawId));
      if (!lancamento) return;
      openConvertDialog(lancamento, action);
    };
  });
}

function bindConvertDialog() {
  if (_dialogBound) return;

  const dialog = document.getElementById('lancamentoConvertDialog');
  const form = document.getElementById('lancamentoConvertForm');
  const cancelButton = document.getElementById('lancamentoConvertCancel');
  const cancelTopButton = document.getElementById('lancamentoConvertCancelTop');
  if (!dialog || !form || !cancelButton || !cancelTopButton) return;

  cancelButton.onclick = () => closeConvertDialog();
  cancelTopButton.onclick = () => closeConvertDialog();
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      closeConvertDialog();
    }
  });

  form.onsubmit = async event => {
    event.preventDefault();

    const action = document.getElementById('convertAction').value;
    const rawId = document.getElementById('convertLancamentoId').value;
    const lancamento = _lancamentos.find(item => String(item.id) === String(rawId));
    if (!lancamento) {
      setFeedback('Lançamento não encontrado.', 'error', 'lancamentoConvertFeedback');
      return;
    }

    const categoria = document.getElementById('convertCategoria').value.trim();
    const descricao = document.getElementById('convertDescricao').value.trim();
    const valor = Number(document.getElementById('convertValor').value);
    const observacao = document.getElementById('convertObs').value.trim();

    if (!categoria || !descricao || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('Revise categoria, descrição e valor antes de salvar.', 'error', 'lancamentoConvertFeedback');
      return;
    }

    if (action === 'assinatura') {
      await addItem('assinaturas', {
        icon: document.getElementById('convertIcon').value || '💳',
        nome: descricao,
        cat: categoria,
        valor,
      });
      closeConvertDialog();
      setFeedback(`"${descricao}" convertido em assinatura.`, 'success');
      await window.refreshDashboard?.();
      return;
    }

    if (action === 'despesa') {
      await addItem('despesas_fixas', {
        cat: categoria,
        desc: descricao,
        valor,
        obs: observacao || buildObsBase(lancamento),
      });
      closeConvertDialog();
      setFeedback(`"${descricao}" convertido em despesa fixa.`, 'success');
      await window.refreshDashboard?.();
      return;
    }

    const pagas = Number(document.getElementById('convertPagas').value);
    const total = Number(document.getElementById('convertTotal').value);
    const inicio = document.getElementById('convertInicio').value;
    const label = action === 'financiamento' ? 'Financiamento' : 'Cartão de crédito';

    if (!Number.isInteger(pagas) || pagas < 1 || !Number.isInteger(total) || total < pagas || !/^\d{4}-\d{2}$/.test(inicio)) {
      setFeedback('Revise parcelas pagas, total de parcelas e mês inicial.', 'error', 'lancamentoConvertFeedback');
      return;
    }

    await addItem('despesas_fixas', {
      cat: categoria,
      desc: descricao,
      valor,
      obs: observacao || buildObsBase(lancamento),
      parcelas: {
        tipo: action,
        pagas,
        total,
        inicio,
        label,
      },
    });

    closeConvertDialog();
    setFeedback(`"${descricao}" convertido em ${action}.`, 'success');
    await window.refreshDashboard?.();
  };

  _dialogBound = true;
}

function openConvertDialog(lancamento, action) {
  const dialog = document.getElementById('lancamentoConvertDialog');
  if (!dialog) return;

  const [pagasPadrao, totalPadrao] = extrairParcelaPadrao(lancamento.parcela, action);
  const inicioPadrao = inferirInicioParcelamento(lancamento.data, pagasPadrao);
  const isAssinatura = action === 'assinatura';
  const isDespesa = action === 'despesa';
  const isParcelado = action === 'parcelamento' || action === 'financiamento';

  document.getElementById('convertLancamentoId').value = String(lancamento.id ?? '');
  document.getElementById('convertAction').value = action;
  document.getElementById('lancamentoConvertTitle').textContent = getDialogTitle(action);
  document.getElementById('lancamentoConvertSubtitle').textContent = `${lancamento.data} · ${lancamento.fatura} · ${fmt(lancamento.valor)}`;
  document.getElementById('convertIcon').value = '💳';
  document.getElementById('convertCategoria').value = lancamento.cat || '';
  document.getElementById('convertDescricao').value = lancamento.desc || '';
  document.getElementById('convertValor').value = String(lancamento.valor ?? '');
  document.getElementById('convertObs').value = buildObsBase(lancamento);
  document.getElementById('convertPagas').value = String(pagasPadrao);
  document.getElementById('convertTotal').value = String(totalPadrao);
  document.getElementById('convertInicio').value = inicioPadrao;
  document.getElementById('lancamentoConvertSubmit').textContent = getDialogSubmitLabel(action);
  document.getElementById('convertIconField').hidden = !isAssinatura;
  document.getElementById('convertObsField').hidden = !isDespesa;
  document.querySelectorAll('.convert-parcelado-field').forEach(field => {
    field.hidden = !isParcelado;
  });
  setFeedback('', '', 'lancamentoConvertFeedback');

  dialog.showModal();
  document.getElementById('convertDescricao').focus();
}

function closeConvertDialog() {
  const dialog = document.getElementById('lancamentoConvertDialog');
  if (!dialog?.open) return;
  dialog.close();
  setFeedback('', '', 'lancamentoConvertFeedback');
}

function inferirInicioParcelamento(data, pagas) {
  const [, mm, yyyy] = String(data ?? '').split('/').map(Number);
  if (!Number.isInteger(mm) || !Number.isInteger(yyyy) || !Number.isInteger(pagas) || pagas < 1) {
    return '2026-01';
  }

  const inicio = new Date(yyyy, mm - pagas, 1);
  return `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
}

function extrairParcelaPadrao(parcela, tipo) {
  if (tipo === 'parcelamento' && /^\d+\/\d+$/.test(String(parcela ?? ''))) {
    return String(parcela).split('/').map(Number);
  }
  return [1, 12];
}

function getDialogTitle(action) {
  if (action === 'assinatura') return 'Converter em assinatura';
  if (action === 'despesa') return 'Converter em despesa fixa';
  if (action === 'parcelamento') return 'Registrar parcelamento';
  return 'Registrar financiamento';
}

function getDialogSubmitLabel(action) {
  if (action === 'assinatura') return 'Salvar assinatura';
  if (action === 'despesa') return 'Salvar despesa fixa';
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
  if (type === 'success' && elementId === 'lancamentosActionFeedback') {
    window.clearTimeout(setFeedback._timer);
    setFeedback._timer = window.setTimeout(() => {
      el.textContent = '';
      el.className = 'inline-form-feedback';
    }, 3500);
  }
}
