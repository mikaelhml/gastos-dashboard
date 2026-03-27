import { fmt } from '../utils/formatters.js';
import { addItem, deleteItem, putItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';

const CAT_ACCENT = {
  Entretenimento: '#b794f4',
  Música: '#fc8181',
  Streaming: '#63b3ed',
  Nuvem: '#76e4f7',
  Educação: '#f6e05e',
  Games: '#68d391',
  Trabalho: '#f6ad55',
  Produtividade: '#f6ad55',
  Telecom: '#a0aec0',
  Saúde: '#68d391',
  Financeiro: '#63b3ed',
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

export function buildAssinaturas(assinaturas, observacoes, lancamentos = [], extratoTransacoes = [], sugestoesDispensa = []) {
  const total = assinaturas.reduce((s, a) => s + toMoney(a.valor), 0);

  document.getElementById('subTotalBar').textContent = fmt(total);
  document.getElementById('subAnualBar').textContent = fmt(total * 12);
  document.getElementById('subCount').textContent = assinaturas.length;

  const renewalBadge = getRenewalBadge();
  renderSuggestions(assinaturas, lancamentos, extratoTransacoes, sugestoesDispensa);

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
              <div class="sub-value">${fmt(toMoney(a.valor))}<span style="font-size:0.78rem;font-weight:400;color:#718096">/mês</span></div>
              <div class="sub-anual">${fmt(toMoney(a.valor) * 12)}/ano</div>
            </div>
            ${renewalBadge}
          </div>
        </div>`;
    });
  }

  const notes = document.getElementById('subNotes');
  notes.innerHTML = '';
  const colors = { anual: '#f6e05e', monitorar: '#63b3ed', cancelado: '#718096', pontual: '#a0aec0' };
  const labels = { anual: 'ANUAL', monitorar: 'MONITORAR', cancelado: 'CANCELADO', pontual: 'PONTUAL' };
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

function renderSuggestions(assinaturas, lancamentos, extratoTransacoes, sugestoesDispensa) {
  const container = document.getElementById('assinaturaSuggestions');
  if (!container) return;

  const dismissals = new Set(
    (sugestoesDispensa || [])
      .map(item => String(item?.key ?? '').trim())
      .filter(Boolean),
  );
  const existingNames = new Set(
    (assinaturas || [])
      .map(item => normalizeText(item?.nome))
      .filter(Boolean),
  );
  const suggestions = detectarSugestoes(lancamentos, extratoTransacoes, dismissals, existingNames);

  if (suggestions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Nenhuma sugestão no momento</strong>
        Quando o mesmo lançamento aparecer em 2 meses ou mais com o mesmo valor, ele vai surgir aqui.
      </div>`;
    bindSuggestionButtons([]);
    return;
  }

  container.innerHTML = `
    <div class="sub-grid">
      ${suggestions.map(suggestion => {
        const accent = CAT_ACCENT[suggestion.cat] || '#4fd1c5';
        const exemplos = suggestion.items
          .slice(0, 3)
          .map(item => `<span class="badge badge-gray">${escapeHtml(item.fatura || item.mes || item.data)}</span>`)
          .join('');
        return `
          <div class="sub-card assinatura-suggestion-card" style="--sub-accent:${accent}">
            <div class="sub-card-top">
              <div class="sub-icon">💡</div>
              <div class="sub-info">
                <div class="sub-name">${escapeHtml(suggestion.nome)}</div>
                <div class="sub-cat">
                  <span class="badge badge-blue" style="font-size:0.7rem">${escapeHtml(suggestion.cat)}</span>
                  <span class="badge badge-green" style="font-size:0.7rem;margin-left:6px">${suggestion.months.length} meses</span>
                </div>
              </div>
            </div>
            <div class="sub-card-bottom">
              <div>
                <div class="sub-value">${fmt(suggestion.valor)}<span style="font-size:0.78rem;font-weight:400;color:#718096">/mês</span></div>
                <div class="sub-anual">${escapeHtml(suggestion.months.join(' · '))}</div>
              </div>
            </div>
            <div class="assinatura-suggestion-evidence">
              <div class="assinatura-suggestion-label">Lançamentos encontrados</div>
              <div class="helper-badges">${exemplos}</div>
            </div>
            <div class="assinatura-suggestion-actions">
              <button type="button" class="btn-inline-secondary" data-suggestion-action="accept" data-suggestion-key="${escapeHtml(suggestion.key)}">
                Sim, virar assinatura
              </button>
              <button type="button" class="btn-inline-danger" data-suggestion-action="dismiss" data-suggestion-key="${escapeHtml(suggestion.key)}">
                Não mostrar
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  bindSuggestionButtons(suggestions);
}

function detectarSugestoes(lancamentos, extratoTransacoes, dismissals, existingNames) {
  const merged = [
    ...(lancamentos || []).map(item => ({ ...item, source: 'cartao' })),
    ...(extratoTransacoes || []).map(item => ({ ...item, source: 'conta' })),
  ];
  const groups = new Map();

  merged.forEach(item => {
    const valor = toMoney(item?.valor);
    const desc = String(item?.desc ?? '').trim();
    const mes = String(item?.fatura ?? item?.mes ?? '').trim();
    if (!desc || !mes || valor <= 0) return;
    if (item?.parcela) return;
    if (item?.tipo_classificado) return;
    if (item?.tipo === 'entrada') return;

    const normalizedDesc = normalizeText(desc);
    if (!normalizedDesc || normalizedDesc.length < 3) return;
    const nameKey = normalizeText(item?.classificado_nome ?? desc);
    if (existingNames.has(nameKey) || existingNames.has(normalizedDesc)) return;

    const key = `${normalizedDesc}|${valor.toFixed(2)}`;
    if (dismissals.has(key)) return;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        nome: toTitleCase(desc),
        cat: String(item?.cat ?? 'Outros').trim() || 'Outros',
        valor,
        monthsMap: new Map(),
        items: [],
      });
    }

    const group = groups.get(key);
    if (!group.monthsMap.has(mes)) {
      group.monthsMap.set(mes, {
        id: item?.id,
        source: item?.source,
        desc,
        fatura: mes,
        valor,
        cat: String(item?.cat ?? group.cat).trim() || group.cat,
        raw: item,
      });
    }
  });

  return [...groups.values()]
    .map(group => {
      const items = [...group.monthsMap.values()].sort((a, b) => sortMonthLabel(a.fatura) - sortMonthLabel(b.fatura));
      return {
        key: group.key,
        nome: group.nome,
        cat: group.cat,
        valor: group.valor,
        months: items.map(item => item.fatura),
        items,
      };
    })
    .filter(group => group.months.length >= 2)
    .sort((a, b) => {
      if (b.months.length !== a.months.length) return b.months.length - a.months.length;
      return b.valor - a.valor;
    });
}

function bindSuggestionButtons(suggestions) {
  const byKey = new Map(suggestions.map(item => [item.key, item]));

  document.querySelectorAll('[data-suggestion-action]').forEach(button => {
    button.onclick = async () => {
      const action = button.getAttribute('data-suggestion-action');
      const key = button.getAttribute('data-suggestion-key');
      const suggestion = byKey.get(key);
      if (!suggestion) return;

      try {
        if (action === 'accept') {
          await acceptSuggestion(suggestion);
        } else {
          await dismissSuggestion(suggestion);
        }
        await window.refreshDashboard?.();
      } catch (error) {
        setFeedback('assinaturaSuggestionsFeedback', error instanceof Error ? error.message : 'Falha ao processar sugestão.', 'error');
      }
    };
  });
}

async function acceptSuggestion(suggestion) {
  await addItem('assinaturas', {
    icon: '✨',
    nome: suggestion.nome,
    cat: suggestion.cat,
    valor: suggestion.valor,
  });

  for (const item of suggestion.items) {
    const store = item.source === 'conta' ? 'extrato_transacoes' : 'lancamentos';
    await putItem(store, {
      ...item.raw,
      tipo_classificado: 'assinatura',
      classificado_nome: suggestion.nome,
    });
  }

  await putItem('assinatura_sugestoes_dispensa', { key: suggestion.key, motivo: 'accepted' });
  setFeedback('assinaturaSuggestionsFeedback', `Sugestão "${suggestion.nome}" convertida em assinatura.`, 'success');
}

async function dismissSuggestion(suggestion) {
  await putItem('assinatura_sugestoes_dispensa', {
    key: suggestion.key,
    nome: suggestion.nome,
    valor: suggestion.valor,
    motivo: 'dismissed',
  });
  setFeedback('assinaturaSuggestionsFeedback', `Sugestão "${suggestion.nome}" dispensada.`, 'success');
}

function bindAssinaturaForm() {
  const form = document.getElementById('assinaturaForm');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', async event => {
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
    window.syncEmojiPicker?.('assinaturaIconPicker', 'assinaturaIconPreview', '✨');
    setFeedback('assinaturaFormFeedback', 'Assinatura adicionada!', 'success');
    window.refreshDashboard?.();
  });
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
      window.refreshDashboard?.();
    };
  });
}

function parseStoreKey(value) {
  if (value === null || value === undefined || value === '') return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim();
}

function toTitleCase(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sortMonthLabel(value) {
  const order = { Jan: 0, Fev: 1, Mar: 2, Abr: 3, Mai: 4, Jun: 5, Jul: 6, Ago: 7, Set: 8, Out: 9, Nov: 10, Dez: 11 };
  const [month, year] = String(value ?? '').split('/');
  return (Number(year) || 0) * 12 + (order[month] ?? 0);
}

function toMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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
