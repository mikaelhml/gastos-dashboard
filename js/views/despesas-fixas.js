import { fmt, calcEndDate } from '../utils/formatters.js';
import { addItem, deleteItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';

/**
 * Renderiza a aba Despesas Fixas.
 * @param {Array} despesasFixas
 */
export function buildDespesasFixas(despesasFixas) {
  const total = despesasFixas.reduce((s, d) => s + d.valor, 0);

  document.getElementById('fixedTotalBar').textContent = fmt(total);
  document.getElementById('fixedAnualBar').textContent = fmt(total * 12);

  const tbody = document.getElementById('fixedTable');
  tbody.innerHTML = '';

  despesasFixas.forEach(d => {
    const obsText = d.obs || '';
    const isNew  = obsText.includes('NOVO');
    const isParc = !!d.parcelas;
    const isVariavel = d.recorrencia === 'variavel';
    let parcCol  = '';

    if (isParc) {
      const p         = d.parcelas;
      const isFinanc  = p.tipo === 'financiamento';
      const restantes = p.total - p.pagas;
      const pct       = Math.round((p.pagas / p.total) * 100);
      const endDate   = calcEndDate(p.inicio, p.total);
      const saldo     = restantes * d.valor;
      const badgeCls  = isFinanc ? 'financ-badge' : 'parcela-badge';
      const icon      = isFinanc ? '🏦' : '📦';
      const accentColor   = isFinanc ? '#63b3ed' : '#f6ad55';
      const barStyle  = isFinanc
        ? 'background:linear-gradient(90deg,#4299e1,#63b3ed)'
        : 'background:linear-gradient(90deg,#f6ad55,#ed8936)';

      parcCol = `
        <div class="parcela-progress">
          <div class="prog-label">
            <span><span class="${badgeCls}">${icon} ${p.pagas}/${p.total} parcelas</span></span>
            <span>${pct}%</span>
          </div>
          <div class="prog-bar-wrap">
            <div class="prog-bar-fill" style="width:${pct}%;${barStyle}"></div>
          </div>
          <div class="parcela-end-date">
            ⏳ Término: <strong style="color:${accentColor}">${endDate}</strong>
            · Saldo: <strong style="color:#fc8181">${fmt(saldo)}</strong>
          </div>
        </div>`;
    } else {
      parcCol = `<span style="color:#718096;font-size:0.85rem">${escapeHtml(obsText.replace(' — NOVO', ''))}</span>`;
    }

    const rowClass = isParc
      ? (d.parcelas.tipo === 'financiamento' ? 'row-financ' : 'row-parcela')
      : (isVariavel ? 'row-recorrente-variavel' : '');

    const tipoBadge = isParc
      ? ''
      : isVariavel
        ? ' <span class="badge badge-yellow" style="font-size:0.72rem;margin-left:6px">📈 Variavel</span>'
        : '';

    tbody.innerHTML += `
      <tr class="${rowClass}">
        <td><span class="badge ${isNew ? 'badge-green' : 'badge-blue'}">${escapeHtml(d.cat)}</span></td>
        <td>${escapeHtml(d.desc)}${tipoBadge}${isNew ? ' <span style="font-size:0.75rem;color:#68d391">✨ Novo</span>' : ''}</td>
        <td><strong>${fmt(d.valor)}</strong><br><span style="font-size:0.75rem;color:#718096">/mês</span></td>
        <td>${parcCol}</td>
        <td style="text-align:right">
          <button
            type="button"
            class="btn-inline-danger"
            data-despesa-id="${d.id ?? ''}">
            Remover
          </button>
        </td>
      </tr>`;
  });

  tbody.innerHTML += `
    <tr class="total-row">
      <td colspan="2"><strong>TOTAL FIXO / MÊS</strong></td>
      <td><strong>${fmt(total)}</strong></td>
      <td></td>
      <td></td>
    </tr>`;

  bindDespesaForm();
  bindRemoveButtons();
}

function bindDespesaForm() {
  const form = document.getElementById('despesaForm');
  if (!form) return;

  form.onsubmit = async event => {
    event.preventDefault();

    const catInput = document.getElementById('despesaCategoria');
    const descInput = document.getElementById('despesaDescricao');
    const valorInput = document.getElementById('despesaValor');
    const obsInput = document.getElementById('despesaObs');

    const cat = catInput.value.trim();
    const desc = descInput.value.trim();
    const valor = Number(valorInput.value);
    const obs = obsInput.value.trim() || 'Mensal — cadastrado manualmente';

    if (!cat || !desc || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('despesaFormFeedback', 'Preencha categoria, descricao e um valor maior que zero.', 'error');
      return;
    }

    await addItem('despesas_fixas', { cat, desc, nome: desc, valor, obs, recorrencia: 'fixa' });

    form.reset();
    setFeedback('despesaFormFeedback', 'Despesa fixa adicionada com sucesso.', 'success');
    await window.refreshDashboard?.();
  };
}

function bindRemoveButtons() {
  document.querySelectorAll('[data-despesa-id]').forEach(button => {
    button.onclick = async () => {
      const rawId = button.getAttribute('data-despesa-id');
      if (!rawId) return;
      const id = parseStoreKey(rawId);
      const desc = button.closest('tr')?.children?.[1]?.textContent?.trim() || 'esta despesa';
      const ok = confirm(`Remover ${desc}?`);
      if (!ok) return;

      await deleteItem('despesas_fixas', id);
      setFeedback('despesaFormFeedback', 'Despesa fixa removida com sucesso.', 'success');
      await window.refreshDashboard?.();
    };
  });
}

function parseStoreKey(value) {
  if (value === null || value === undefined || value === '') return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function setFeedback(elementId, message, type) {
  const feedback = document.getElementById(elementId);
  if (!feedback) return;

  feedback.textContent = message || '';
  feedback.className = `inline-form-feedback${type ? ` is-${type}` : ''}`;
}
