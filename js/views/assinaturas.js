import { fmt } from '../utils/formatters.js';
import { addItem, deleteItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';

/**
 * Renderiza a aba Assinaturas.
 * @param {Array} assinaturas
 * @param {Array} observacoes
 */
export function buildAssinaturas(assinaturas, observacoes) {
  const total = assinaturas.reduce((s, a) => s + a.valor, 0);

  document.getElementById('subTotalBar').textContent = fmt(total);
  document.getElementById('subAnualBar').textContent = fmt(total * 12);
  document.getElementById('subCount').textContent    = assinaturas.length;

  // Grid de cards
  const grid = document.getElementById('subGrid');
  grid.innerHTML = '';
  assinaturas.forEach(a => {
    grid.innerHTML += `
      <div class="sub-card">
        <div class="sub-card-content">
          <div class="sub-icon">${escapeHtml(a.icon || '✨')}</div>
          <div class="sub-info">
            <div class="sub-name">${escapeHtml(a.nome)}</div>
            <div class="sub-cat">${escapeHtml(a.cat)}</div>
          </div>
          <div class="sub-value">${fmt(a.valor)}</div>
        </div>
        <div class="sub-card-actions">
          <button
            type="button"
            class="btn-inline-danger"
            data-assinatura-id="${a.id ?? ''}">
            Remover
          </button>
        </div>
      </div>`;
  });

  // Notas / observações
  const notes  = document.getElementById('subNotes');
  notes.innerHTML = '';
  const colors = { anual: '#f6e05e', monitorar: '#63b3ed', cancelado: '#718096', pontual: '#a0aec0' };
  const labels = { anual: 'ANUAL',   monitorar: 'MONITORAR', cancelado: 'CANCELADO', pontual: 'PONTUAL' };
  observacoes.forEach(o => {
    notes.innerHTML += `
      <div class="note-card">
        ${escapeHtml(o.icon)} <strong>${escapeHtml(o.nome)}</strong>
        <span class="badge" style="margin-left:8px;background:#2d3748;color:${colors[o.tipo]}">${labels[o.tipo]}</span>
        <br><span style="color:#a0aec0;font-size:0.85rem">${escapeHtml(o.detalhe)}</span>
      </div>`;
  });

  bindAssinaturaForm();
  bindRemoveButtons();
}

function bindAssinaturaForm() {
  const form = document.getElementById('assinaturaForm');
  if (!form) return;

  form.onsubmit = async event => {
    event.preventDefault();

    const iconInput = document.getElementById('assinaturaIcon');
    const nomeInput = document.getElementById('assinaturaNome');
    const catInput = document.getElementById('assinaturaCategoria');
    const valorInput = document.getElementById('assinaturaValor');

    const icon = iconInput.value || '✨';
    const nome = nomeInput.value.trim();
    const cat = catInput.value.trim();
    const valor = Number(valorInput.value);

    if (!nome || !cat || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('assinaturaFormFeedback', 'Preencha nome, categoria e um valor maior que zero.', 'error');
      return;
    }

    await addItem('assinaturas', { icon, nome, cat, valor });

    form.reset();
    iconInput.value = '✨';
    setFeedback('assinaturaFormFeedback', 'Assinatura adicionada com sucesso.', 'success');
    await window.refreshDashboard?.();
  };
}

function bindRemoveButtons() {
  document.querySelectorAll('[data-assinatura-id]').forEach(button => {
    button.onclick = async () => {
      const rawId = button.getAttribute('data-assinatura-id');
      if (!rawId) return;
      const id = parseStoreKey(rawId);
      const nome = button.closest('.sub-card')?.querySelector('.sub-name')?.textContent?.trim() || 'esta assinatura';
      const ok = confirm(`Remover ${nome}?`);
      if (!ok) return;

      await deleteItem('assinaturas', id);
      setFeedback('assinaturaFormFeedback', 'Assinatura removida com sucesso.', 'success');
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
