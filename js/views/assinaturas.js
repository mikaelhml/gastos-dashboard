import { fmt } from '../utils/formatters.js';
import { addItem, deleteItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';

// Category → accent color mapping for sub-card top border
const CAT_ACCENT = {
  Entretenimento: '#b794f4',
  Música:         '#fc8181',
  Streaming:      '#63b3ed',
  Nuvem:          '#76e4f7',
  Educação:       '#f6e05e',
  Games:          '#68d391',
  Trabalho:       '#f6ad55',
  Produtividade:  '#f6ad55',
  Telecom:        '#a0aec0',
  Saúde:          '#68d391',
  Financeiro:     '#63b3ed',
};

function getRenewalBadge() {
  const today = new Date();
  const next1st = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysUntil = Math.ceil((next1st - today) / (1000 * 60 * 60 * 24));
  if (daysUntil <= 7) {
    return `<span class="renewal-badge-urgent">🔔 Renova em ${daysUntil} dia${daysUntil !== 1 ? 's' : ''}</span>`;
  }
  if (daysUntil <= 30) {
    return `<span class="renewal-badge-soon">🔔 Renova em ${daysUntil} dias</span>`;
  }
  return '';
}

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

  const renewalBadge = getRenewalBadge();

  // Grid de cards
  const grid = document.getElementById('subGrid');
  grid.innerHTML = '';
  if (assinaturas.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <strong>Nenhuma assinatura cadastrada</strong>
        Use o formulário acima ou converta um lançamento em assinatura.
      </div>`;
  } else {
    assinaturas.forEach(a => {
      const accent = CAT_ACCENT[a.cat] || '#63b3ed';
      grid.innerHTML += `
        <div class="sub-card" style="--sub-accent:${accent}">
          <div class="sub-card-top">
            <div class="sub-icon">${escapeHtml(a.icon || '✨')}</div>
            <div class="sub-info">
              <div class="sub-name">${escapeHtml(a.nome)}</div>
              <div class="sub-cat"><span class="badge badge-blue" style="font-size:0.7rem">${escapeHtml(a.cat)}</span></div>
            </div>
            <button
              type="button"
              class="btn-inline-danger"
              style="align-self:flex-start"
              data-assinatura-id="${a.id ?? ''}">
              ✕
            </button>
          </div>
          <div class="sub-card-bottom">
            <div>
              <div class="sub-value">${fmt(a.valor)}<span style="font-size:0.78rem;font-weight:400;color:#718096">/mês</span></div>
              <div class="sub-anual">${fmt(a.valor * 12)}/ano</div>
            </div>
            ${renewalBadge}
          </div>
        </div>`;
    });
  }

  // Notas / observações
  const notes  = document.getElementById('subNotes');
  notes.innerHTML = '';
  const colors = { anual: '#f6e05e', monitorar: '#63b3ed', cancelado: '#718096', pontual: '#a0aec0' };
  const labels = { anual: 'ANUAL',   monitorar: 'MONITORAR', cancelado: 'CANCELADO', pontual: 'PONTUAL' };
  if (observacoes.length === 0) {
    notes.innerHTML = `
      <div class="empty-state">
        <strong>Sem observações por enquanto</strong>
        Itens pontuais ou anuais podem aparecer aqui quando forem cadastrados.
      </div>`;
  } else {
    observacoes.forEach(o => {
      notes.innerHTML += `
        <div class="note-card">
          ${escapeHtml(o.icon)} <strong>${escapeHtml(o.nome)}</strong>
          <span class="badge" style="margin-left:8px;background:#2d3748;color:${colors[o.tipo]}">${labels[o.tipo]}</span>
          <br><span style="color:#a0aec0;font-size:0.85rem">${escapeHtml(o.detalhe)}</span>
        </div>`;
    });
  }

  bindAssinaturaForm();
  bindRemoveButtons();
}

function bindAssinaturaForm() {
  const form = document.getElementById('assinaturaForm');
  if (!form) return;

  form.onsubmit = async event => {
    event.preventDefault();

    const iconInput  = document.getElementById('assinaturaIcon');
    const nomeInput  = document.getElementById('assinaturaNome');
    const catInput   = document.getElementById('assinaturaCategoria');
    const valorInput = document.getElementById('assinaturaValor');

    const icon  = iconInput.value || '✨';
    const nome  = nomeInput.value.trim();
    const cat   = catInput.value.trim();
    const valor = Number(valorInput.value);

    if (!nome || !cat || !Number.isFinite(valor) || valor <= 0) {
      setFeedback('assinaturaFormFeedback', 'Preencha nome, categoria e um valor maior que zero.', 'error');
      return;
    }

    await addItem('assinaturas', { icon, nome, cat, valor });

    form.reset();
    iconInput.value = '✨';
    window.syncEmojiPicker?.('assinaturaIconPicker', 'assinaturaIconPreview', '✨');
    setFeedback('assinaturaFormFeedback', 'Assinatura adicionada com sucesso.', 'success');
    await window.refreshDashboard?.();
  };
}

function bindRemoveButtons() {
  document.querySelectorAll('[data-assinatura-id]').forEach(button => {
    button.onclick = async () => {
      const rawId = button.getAttribute('data-assinatura-id');
      if (!rawId) return;
      const id   = parseStoreKey(rawId);
      const nome = button.closest('.sub-card')?.querySelector('.sub-name')?.textContent?.trim() || 'esta assinatura';
      const ok   = confirm(`Remover ${nome}?`);
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
  if (type === 'success') {
    window.clearTimeout(setFeedback._timer);
    setFeedback._timer = window.setTimeout(() => {
      feedback.textContent = '';
      feedback.className = 'inline-form-feedback';
    }, 3500);
  }
}

/**
 * Renderiza a aba Assinaturas.
 * @param {Array} assinaturas
 * @param {Array} observacoes
 */
