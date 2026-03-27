import { fmt, calcEndDate } from '../utils/formatters.js';
import { addItem, deleteItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';
import { acceptRegistratoSuggestion, dismissRegistratoSuggestion } from '../utils/registrato-suggestions.js';

/**
 * Renderiza a aba Despesas Fixas.
 * @param {Array} despesasFixas
 * @param {Array} registratoSuggestions
 */
export function buildDespesasFixas(despesasFixas, registratoSuggestions = []) {
  const total = despesasFixas.reduce((s, d) => s + d.valor, 0);

  document.getElementById('fixedTotalBar').textContent = fmt(total);
  document.getElementById('fixedAnualBar').textContent = fmt(total * 12);
  renderRegistratoSuggestions(registratoSuggestions);

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

function renderRegistratoSuggestions(suggestions) {
  const container = document.getElementById('registratoSuggestions');
  if (!container) return;

  if (!suggestions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Nenhuma sugestão encontrada ainda</strong>
        Quando houver cruzamento confiável entre Registrato e recorrência nas transações, os candidatos vão aparecer aqui.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="sub-grid">
      ${suggestions.map(item => {
        const accent = getSuggestionAccent(item.tipo, item.confianca);
        const tipoLabel = getTipoLabel(item.tipo);
        const confLabel = item.confianca ? item.confianca.toUpperCase() : 'BAIXA';
        const hintParcela = item.hintParcelas
          ? `<span class="badge badge-yellow">${escapeHtml(item.hintParcelas.label)} · início ${escapeHtml(item.hintParcelas.inicio || 'n/d')}</span>`
          : '';
        const meses = item.meses.slice(-4).map(mes => `<span class="badge badge-gray">${escapeHtml(mes)}</span>`).join('');
        return `
          <div class="sub-card registrato-suggestion-card" style="--sub-accent:${accent}">
            <div class="sub-card-top">
              <div class="sub-icon">${item.tipo === 'financiamento' ? '🏦' : item.tipo === 'parcelamento' ? '📦' : '📋'}</div>
              <div class="sub-info">
                <div class="sub-name">${escapeHtml(item.nome)}</div>
                <div class="sub-cat">
                  <span class="badge badge-blue" style="font-size:0.7rem">${escapeHtml(item.cat)}</span>
                  <span class="badge ${getConfidenceBadge(item.confianca)}" style="font-size:0.7rem;margin-left:6px">${escapeHtml(confLabel)}</span>
                </div>
              </div>
            </div>
            <div class="sub-card-bottom">
              <div>
                <div class="sub-value">${fmt(item.valor)}<span style="font-size:0.78rem;font-weight:400;color:#718096">/mês</span></div>
                <div class="sub-anual">${escapeHtml(tipoLabel)} · ${escapeHtml(item.origem || 'Motor de sugestões')}</div>
              </div>
            </div>
            <div class="assinatura-suggestion-evidence">
              <div class="assinatura-suggestion-label">Justificativa</div>
              <div style="font-size:0.85rem;color:#cbd5e0;line-height:1.5">${escapeHtml(item.justificativa || '')}</div>
              ${item.observacaoRisco ? `<div style="font-size:0.8rem;color:#f6ad55;line-height:1.5">${escapeHtml(item.observacaoRisco)}</div>` : ''}
              <div class="helper-badges">
                ${item.institutionLabel ? `<span class="badge badge-purple">${escapeHtml(item.institutionLabel)}</span>` : ''}
                ${hintParcela}
                ${meses}
              </div>
            </div>
            <div class="assinatura-suggestion-actions">
              <button type="button" class="btn-inline-secondary" data-registrato-action="accept" data-registrato-key="${escapeHtml(item.key)}">
                Aceitar
              </button>
              <button type="button" class="btn-inline-danger" data-registrato-action="dismiss" data-registrato-key="${escapeHtml(item.key)}">
                Dispensar
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  bindRegistratoSuggestionButtons(suggestions);
}

function getSuggestionAccent(tipo, confianca) {
  if (tipo === 'financiamento') return confianca === 'alta' ? '#63b3ed' : '#90cdf4';
  if (tipo === 'parcelamento') return confianca === 'alta' ? '#f6ad55' : '#fbd38d';
  return confianca === 'alta' ? '#68d391' : '#9ae6b4';
}

function getTipoLabel(tipo) {
  if (tipo === 'financiamento') return 'Financiamento sugerido';
  if (tipo === 'parcelamento') return 'Parcelamento sugerido';
  return 'Despesa fixa sugerida';
}

function getConfidenceBadge(confianca) {
  if (confianca === 'alta') return 'badge-green';
  if (confianca === 'media') return 'badge-yellow';
  return 'badge-gray';
}

function bindRegistratoSuggestionButtons(suggestions) {
  const byKey = new Map(suggestions.map(item => [item.key, item]));
  document.querySelectorAll('[data-registrato-action]').forEach(button => {
    button.onclick = async () => {
      const action = button.getAttribute('data-registrato-action');
      const key = button.getAttribute('data-registrato-key');
      const suggestion = byKey.get(key);
      if (!suggestion) return;

      try {
        if (action === 'accept') {
          await acceptRegistratoSuggestion(suggestion);
          setFeedback('registratoSuggestionsFeedback', `Sugestão "${suggestion.nome}" aceita e convertida em despesa fixa.`, 'success');
        } else {
          await dismissRegistratoSuggestion(suggestion);
          setFeedback('registratoSuggestionsFeedback', `Sugestão "${suggestion.nome}" dispensada.`, 'success');
        }
        await window.refreshDashboard?.();
      } catch (error) {
        setFeedback('registratoSuggestionsFeedback', error instanceof Error ? error.message : 'Falha ao processar sugestão do Registrato.', 'error');
      }
    };
  });
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
