import { fmt } from '../utils/formatters.js';
import { addItem } from '../db.js';

let _lancamentos = [];

/**
 * Inicializa a aba Lançamentos com os dados carregados.
 * @param {Array} lancamentos
 */
export function initLancamentos(lancamentos) {
  _lancamentos = lancamentos;

  // Popula filtro de categorias dinamicamente
  const cats = [...new Set(lancamentos.map(l => l.cat))].sort();
  const sel  = document.getElementById('filterCat');
  sel.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => sel.innerHTML += `<option value="${c}">${c}</option>`);

  // Popula filtro de faturas dinamicamente
  const faturas = [...new Set(lancamentos.map(l => l.fatura))].sort();
  const selFat  = document.getElementById('filterFatura');
  selFat.innerHTML = '<option value="">Todas as faturas</option>';
  faturas.forEach(f => selFat.innerHTML += `<option value="${f}">${f}</option>`);

  renderLancamentos(lancamentos);
}

function renderLancamentos(data) {
  const tbody = document.getElementById('lancamentosTable');
  tbody.innerHTML = '';
  data.forEach((l, i) => {
    const isParc   = !!l.parcela;
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
            <button type="button" class="btn-inline-secondary" data-lancamento-action="parcelamento" data-lancamento-id="${l.id ?? ''}" ${!l.parcela ? 'disabled' : ''}>Parcelamento</button>
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

/**
 * Filtra a tabela de lançamentos. Chamado pelos inputs do HTML.
 */
export function filterLancamentos() {
  const q   = document.getElementById('searchInput').value.toLowerCase();
  const fat = document.getElementById('filterFatura').value;
  const cat = document.getElementById('filterCat').value;
  const filtered = _lancamentos.filter(l =>
    (!q   || l.desc.toLowerCase().includes(q)) &&
    (!fat || l.fatura === fat) &&
    (!cat || l.cat    === cat)
  );
  renderLancamentos(filtered);
}

function bindActionButtons() {
  document.querySelectorAll('[data-lancamento-action]').forEach(button => {
    button.onclick = async () => {
      const action = button.getAttribute('data-lancamento-action');
      const rawId = button.getAttribute('data-lancamento-id');
      const lancamento = _lancamentos.find(item => String(item.id) === String(rawId));
      if (!lancamento) return;

      if (action === 'assinatura') {
        await addItem('assinaturas', {
          icon: '💳',
          nome: lancamento.desc,
          cat: lancamento.cat,
          valor: lancamento.valor,
        });
        setFeedback(`"${lancamento.desc}" convertido em assinatura.`, 'success');
      }

      if (action === 'despesa') {
        await addItem('despesas_fixas', {
          cat: lancamento.cat,
          desc: lancamento.desc,
          valor: lancamento.valor,
          obs: `Criado a partir do lançamento ${lancamento.data} (${lancamento.fatura})`,
        });
        setFeedback(`"${lancamento.desc}" convertido em despesa fixa.`, 'success');
      }

      if (action === 'parcelamento' && lancamento.parcela) {
        const [pagas, total] = lancamento.parcela.split('/').map(Number);
        await addItem('despesas_fixas', {
          cat: lancamento.cat,
          desc: lancamento.desc,
          valor: lancamento.valor,
          obs: `Criado a partir do lançamento ${lancamento.data} (${lancamento.fatura})`,
          parcelas: {
            tipo: 'parcelamento',
            pagas,
            total,
            inicio: inferirInicioParcelamento(lancamento.data, pagas),
            label: 'Cartão de crédito',
          },
        });
        setFeedback(`"${lancamento.desc}" convertido em parcelamento.`, 'success');
      }

      await window.refreshDashboard?.();
    };
  });
}

function inferirInicioParcelamento(data, pagas) {
  const [, mm, yyyy] = String(data ?? '').split('/').map(Number);
  if (!Number.isInteger(mm) || !Number.isInteger(yyyy) || !Number.isInteger(pagas) || pagas < 1) {
    return '2026-01';
  }

  const inicio = new Date(yyyy, mm - pagas, 1);
  return `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
}

function setFeedback(message, type) {
  const el = document.getElementById('lancamentosActionFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.className = `inline-form-feedback${type ? ` is-${type}` : ''}`;
}
