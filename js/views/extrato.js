import { fmt } from '../utils/formatters.js';
import { escapeHtml } from '../utils/dom.js';
import { enriquecerCanal, getCanalMeta, inferirCanal, listarCanais } from '../utils/transaction-tags.js';
import { buildEmptyStateViewModels } from '../utils/empty-states.js';
import { buildAliasLookup, buildDisplayNameMeta } from '../utils/display-names.js';

let _transacoes = [];
let _chartCategorias = null;
let _chartBarrasCategorias = null;
let _chartCanais = null;
let _transactionAliasLookup = new Map();

/**
 * Inicializa a aba Extrato Conta com os dados carregados.
 * @param {Array} transacoes
 * @param {Array} extratoSummary  (inclui entrada apenasHistorico)
 */
export function initExtrato(transacoes, extratoSummary, context = {}) {
  // Filtra somente meses com dados reais (exclui entrada de histórico puro)
  const transacoesConta = transacoes.map(t => enriquecerCanal({ ...t, source: 'conta' }));
  const contextRows = (context.registratoContextRows || []).map(item => ({ ...item }));
  _transactionAliasLookup = buildAliasLookup(context.transactionAliases || []);
  _transacoes = [...transacoesConta, ...contextRows].sort(compareExtratoItems);
  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);
  const emptyStates = buildEmptyStateViewModels({
    importedTransactionCount: transacoesConta.length,
    importedSummaryCount: summaryReal.length,
    manualSubscriptionCount: Number(context.manualSubscriptionCount || 0),
    manualFixedExpenseCount: Number(context.manualFixedExpenseCount || 0),
  });

  if (emptyStates.statement.shouldRender) {
    destroyExtratoCharts();
    toggleExtratoSections(false);
    renderExtratoEmptyState(emptyStates.statement);
    const count = document.getElementById('extratoCount');
    if (count) count.innerHTML = '';
    return;
  }

  toggleExtratoSections(true);
  renderExtratoEmptyState(null);

  buildExtratoSummaryBar(transacoesConta, summaryReal);
  buildExtratoCharts(transacoesConta, summaryReal);
  buildExtratoFixosTable(transacoesConta, summaryReal);
  buildExtratoContextPanel(context.cardBillSummaries || [], context.registratoInsights || null, contextRows);
  renderExtrato(_transacoes);
}

function destroyExtratoCharts() {
  if (_chartCategorias) {
    _chartCategorias.destroy();
    _chartCategorias = null;
  }
  if (_chartBarrasCategorias) {
    _chartBarrasCategorias.destroy();
    _chartBarrasCategorias = null;
  }
  if (_chartCanais) {
    _chartCanais.destroy();
    _chartCanais = null;
  }
}

function toggleExtratoSections(visible) {
  const display = visible ? '' : 'none';
  [
    'extratoSummaryBar',
    'extratoContextPanel',
    'extratoChartsPrimary',
    'extratoChartsSecondary',
    'extratoFixosTitle',
    'extratoFixosWrap',
    'extratoMovimentosTitle',
    'extratoFilters',
    'extratoTableWrap',
    'extratoCount',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  });
}

function renderExtratoEmptyState(model) {
  const host = document.getElementById('extratoEmptyState');
  if (!host) return;

  if (!model?.shouldRender) {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }

  host.innerHTML = buildGuidedEmptyMarkup(model, 'Extrato local');
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

function buildExtratoSummaryBar(transacoes, summaryReal) {
  const totalEntradas = transacoes.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
  const totalSaidas   = transacoes.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);

  document.getElementById('extratoTotalEntradas').textContent = fmt(totalEntradas);
  document.getElementById('extratoTotalSaidas').textContent   = fmt(totalSaidas);

  // Saldo final = saldoFinal do último mês com dados reais
  const ultimo = summaryReal[summaryReal.length - 1];
  document.getElementById('extratoSaldoFinal').textContent = ultimo ? fmt(ultimo.saldoFinal) : '—';

  // Atualiza summary bar com período dinâmico
  const mesesStr = summaryReal.map(m => m.mes).join(' · ');
  const periodoEl = document.getElementById('extratoPeriodo');
  if (periodoEl) periodoEl.textContent = mesesStr || '—';

  // Popula filtro de categorias dinamicamente
  const cats = [...new Set(transacoes.map(t => t.cat))].sort();
  const sel  = document.getElementById('extratoFilterCat');
  sel.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => sel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);

  const canais = listarCanais(transacoes);
  const selCanal = document.getElementById('extratoFilterCanal');
  if (selCanal) {
    selCanal.innerHTML = '<option value="">Todos os canais</option>';
    canais.forEach(canal => {
      const meta = getCanalMeta(canal);
      selCanal.innerHTML += `<option value="${meta.id}">${meta.icon} ${meta.label}</option>`;
    });
  }

  // Popula filtro de meses dinamicamente
  const meses   = [...new Set(transacoes.map(t => t.mes))].sort();
  const selMes  = document.getElementById('extratoFilterMes');
  selMes.innerHTML = '<option value="">Todos os meses</option>';
  meses.forEach(m => selMes.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`);
}

function buildExtratoCharts(transacoes, summaryReal) {
  if (_chartCategorias)       { _chartCategorias.destroy();       _chartCategorias       = null; }
  if (_chartBarrasCategorias) { _chartBarrasCategorias.destroy(); _chartBarrasCategorias = null; }
  if (_chartCanais)           { _chartCanais.destroy();           _chartCanais           = null; }

  const saidas    = transacoes.filter(t => t.tipo === 'saida');
  const catTotals = {};
  saidas.forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + t.valor; });
  const cats   = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const colors = ['#fc8181','#63b3ed','#68d391','#f6e05e','#b794f4','#f6ad55','#76e4f7','#fbb6ce','#a0aec0','#4fd1c5'];
  const doughnutLabels = cats.length ? cats : ['Sem dados'];
  const doughnutData   = cats.length ? cats.map(c => catTotals[c]) : [1];

  // Doughnut — breakdown por categoria
  _chartCategorias = new Chart(document.getElementById('chartExtratoCats'), {
    type: 'doughnut',
    data: {
      labels: doughnutLabels,
      datasets: [{ data: doughnutData, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 10 } } } },
      cutout: '60%',
    },
  });

  // Stacked bar — saídas por mês e categoria
  const meses    = summaryReal.map(m => m.mes);
  const datasets = cats.map((cat, i) => ({
    label: cat,
    data:  meses.map(m =>
      saidas.filter(t => t.mes === m && t.cat === cat).reduce((s, t) => s + t.valor, 0)
    ),
    backgroundColor: colors[i % colors.length],
    borderRadius: 4,
  }));

  _chartBarrasCategorias = new Chart(document.getElementById('chartExtratoBarCats'), {
    type: 'bar',
    data: { labels: meses, datasets },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 10 } } } },
      scales: {
        x: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
        y: { stacked: true, ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  const canalCanvas = document.getElementById('chartExtratoCanal');
  if (canalCanvas) {
    const canais = listarCanais(saidas);
    const canalColors = {
      pix: '#4fd1c5',
      transferencia: '#b794f4',
      cartao: '#7f9cf5',
      boleto: '#f6e05e',
      debito: '#63b3ed',
      outro: '#a0aec0',
    };
    const canalDatasets = canais.map(canal => {
      const meta = getCanalMeta(canal);
      return {
        label: `${meta.icon} ${meta.label}`,
        data: meses.map(m =>
          saidas
            .filter(t => t.mes === m && (t.canal || inferirCanal(t)) === canal)
            .reduce((s, t) => s + t.valor, 0)
        ),
        backgroundColor: canalColors[canal] || '#a0aec0',
        borderRadius: 4,
      };
    });

    _chartCanais = new Chart(canalCanvas, {
      type: 'bar',
      data: { labels: meses, datasets: canalDatasets },
      options: {
        plugins: { legend: { labels: { color: '#a0aec0', font: { size: 10 } } } },
        scales: {
          x: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
          y: { stacked: true, ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
        },
      },
    });
  }
}

function buildExtratoFixosTable(transacoes, summaryReal) {
  const meses = summaryReal.map(m => m.mes);
  const tbody = document.getElementById('extratoFixosTable');
  tbody.innerHTML = '';

  const recorrentes = detectarDespesasRecorrentes(transacoes, meses);

  if (recorrentes.length === 0) {
    const colspan = 3 + meses.length;
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;color:#718096;padding:20px">Nenhuma despesa fixa recorrente detectada ainda.</td></tr>`;
    return;
  }

  recorrentes.forEach(({ desc, cat, valoresPorMes, media }) => {
    const displayName = buildDisplayNameMeta(desc, { maxLength: 34, aliases: _transactionAliasLookup });
    const vals = meses.map(m => valoresPorMes.get(m) || 0);
    const cells  = vals.map(v =>
      `<td style="text-align:right;color:${v > 0 ? '#fc8181' : '#718096'}">${v > 0 ? fmt(v) : '—'}</td>`
    ).join('');

    tbody.innerHTML += `
      <tr>
        <td><span class="badge badge-blue" style="font-size:0.72rem">${cat || '—'}</span></td>
        <td><span class="display-name display-name--compact" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</span></td>
        ${cells}
        <td style="text-align:right;font-weight:700;color:#f6ad55">${media > 0 ? fmt(media) : '—'}</td>
      </tr>`;
  });
}

function detectarDespesasRecorrentes(transacoes, meses) {
  const saidas = transacoes.filter(t => t.tipo === 'saida' && t.desc);
  const agrupado = new Map();

  saidas.forEach(t => {
    const key = t.desc.trim();
    if (!agrupado.has(key)) {
      agrupado.set(key, {
        desc: key,
        cat: t.cat || '—',
        valoresPorMes: new Map(),
      });
    }

    const item = agrupado.get(key);
    const atual = item.valoresPorMes.get(t.mes) || 0;
    item.valoresPorMes.set(t.mes, atual + t.valor);
  });

  return [...agrupado.values()]
    .filter(item => item.valoresPorMes.size >= 2)
    .map(item => {
      const total = [...item.valoresPorMes.values()].reduce((s, v) => s + v, 0);
      return {
        ...item,
        media: total / (meses.length || item.valoresPorMes.size || 1),
      };
    })
    .sort((a, b) => b.media - a.media);
}

function renderExtrato(data) {
  const tbody = document.getElementById('extratoTable');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#718096;padding:20px">Nenhuma movimentação importada.</td></tr>';
  } else {
    data.forEach((t, i) => {
      const displayName = buildDisplayNameMeta(t.desc, {
        maxLength: t.contextoDerivado ? 54 : 42,
        aliases: _transactionAliasLookup,
        transactionContext: {
          channel: t.canal || inferirCanal(t),
          direction: t.tipo === 'entrada' ? 'entrada' : 'saida',
        },
      });
      if (t.contextoDerivado) {
        const resumo = t.registratoResumo || {};
        const detalhamento = resumo.semRegistros
          ? 'Sem operações de crédito nesta competência.'
          : `Em dia ${fmt(Number(resumo.emDia || 0))} · Vencida ${fmt(Number(resumo.vencida || 0))} · Outros ${fmt(Number(resumo.outrosCompromissos || 0))}`;

        tbody.innerHTML += `
          <tr class="row-contexto-scr">
            <td data-label="#" style="color:#718096">${i + 1}</td>
            <td data-label="Data">${escapeHtml(t.data)}</td>
            <td data-label="Mês"><span class="badge badge-purple">${escapeHtml(t.mes || '—')}</span></td>
            <td data-label="Descrição">
              <div class="display-name display-name--table" style="font-weight:600;color:#b794f4" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</div>
              <div style="font-size:0.78rem;color:#718096;margin-top:4px">${escapeHtml(detalhamento)}</div>
            </td>
            <td data-label="Categoria"><div class="cell-badges"><span class="badge badge-purple">🏛️ ${escapeHtml(t.cat || 'Contexto SCR')}</span></div></td>
            <td data-label="Valor" style="text-align:right;font-weight:600;color:#b794f4">${resumo.semRegistros ? '—' : fmt(Number(t.valor || 0))}</td>
          </tr>`;
        return;
      }

      const isEntrada = t.tipo === 'entrada';
      const color = isEntrada ? '#68d391' : '#fc8181';
      const sign  = isEntrada ? '+' : '-';
      const bancoLabel = t.banco === 'nubank' ? 'Nubank' : t.banco === 'itau' ? 'Itaú' : null;
      const bancoClass = t.banco === 'nubank' ? 'badge-purple' : 'badge-yellow';
      const bancoBadge = bancoLabel ? `<span class="badge ${bancoClass}" style="font-size:0.7rem">${bancoLabel}</span>` : '';
      const canalMeta = getCanalMeta(t.canal || inferirCanal(t));
      const canalBadge = `<span class="badge ${canalMeta.badgeClass}">${canalMeta.icon} ${canalMeta.label}</span>`;
      tbody.innerHTML += `
        <tr>
          <td data-label="#" style="color:#718096">${i + 1}</td>
          <td data-label="Data">${escapeHtml(t.data)}</td>
          <td data-label="Mês"><span class="badge badge-blue">${escapeHtml(t.mes)}</span> ${bancoBadge}</td>
          <td data-label="Descrição"><span class="display-name display-name--table" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</span></td>
          <td data-label="Categoria"><div class="cell-badges"><span class="badge ${isEntrada ? 'badge-green' : 'badge-red'}">${escapeHtml(t.cat)}</span>${canalBadge}</div></td>
          <td data-label="Valor" style="text-align:right;font-weight:600;color:${color}">${sign} ${fmt(t.valor)}</td>
        </tr>`;
    });
  }

  const reais = data.filter(t => !t.contextoDerivado);
  const contextos = data.filter(t => t.contextoDerivado).length;
  const totalE = reais.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
  const totalS = reais.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);
  document.getElementById('extratoCount').innerHTML =
    `${reais.length} movimentaç${reais.length === 1 ? 'ão' : 'ões'} reais` +
    `${contextos ? ` &nbsp;·&nbsp; <span style="color:#b794f4">🏛️ ${contextos} linha(s) SCR</span>` : ''} · ` +
    `<span style="color:#68d391">▲ Entradas: ${fmt(totalE)}</span> &nbsp;·&nbsp; ` +
    `<span style="color:#fc8181">▼ Saídas: ${fmt(totalS)}</span>`;
}

function buildExtratoContextPanel(cardBillSummaries, registratoInsights, contextRows) {
  const panel = document.getElementById('extratoContextPanel');
  if (!panel) return;

  const ultimaFatura = cardBillSummaries[0] || null;
  const totalCartao = cardBillSummaries.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const linhasScr = contextRows.length;

  if (!ultimaFatura && !registratoInsights && !linhasScr) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.style.display = '';
  panel.innerHTML = `
    <div class="helper-panel-header">
      <div>
        <h3>Conta + Cartão + Registrato no mesmo contexto</h3>
        <p>O fluxo da conta continua limpo. Cartão e SCR entram aqui e na tabela apenas como leitura derivada, sem contaminar saldo nem duplicar transações.</p>
      </div>
    </div>
    <div class="helper-badges">
      ${ultimaFatura ? `<span class="badge badge-red">💳 Última fatura ${escapeHtml(ultimaFatura.fatura)} · ${escapeHtml(fmt(ultimaFatura.total))}</span>` : ''}
      ${Number(totalCartao) > 0 ? `<span class="badge badge-blue">🧾 Total importado em cartão · ${escapeHtml(fmt(totalCartao))}</span>` : ''}
      ${registratoInsights ? `<span class="badge badge-purple">🏛️ SCR sem limites · ${escapeHtml(fmt(registratoInsights.exposicaoTotal || 0))}</span>` : ''}
      ${linhasScr ? `<span class="badge badge-purple">🔎 ${linhasScr} linha(s) derivada(s) do SCR no período do extrato</span>` : ''}
    </div>
  `;
}

function compareExtratoItems(a, b) {
  return parseExtratoDateTs(b?.data) - parseExtratoDateTs(a?.data);
}

function parseExtratoDateTs(data) {
  const parts = String(data ?? '').split('/').map(Number);
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts;
  return new Date(yyyy, mm - 1, dd).getTime();
}

export function filterExtrato() {
  const q    = document.getElementById('extratoSearch').value.toLowerCase();
  const mes  = document.getElementById('extratoFilterMes').value;
  const tipo = document.getElementById('extratoFilterTipo').value;
  const cat  = document.getElementById('extratoFilterCat').value;
  const canal = document.getElementById('extratoFilterCanal').value;
  const filtered = _transacoes.filter(t =>
    (!q    || t.desc.toLowerCase().includes(q)) &&
    (!mes  || t.mes  === mes) &&
    (!tipo || t.tipo === tipo) &&
    (!cat  || t.cat  === cat) &&
    (!canal || (t.canal || inferirCanal(t)) === canal)
  );
  renderExtrato(filtered);
}

export function clearExtratoFilters() {
  document.getElementById('extratoSearch').value = '';
  document.getElementById('extratoFilterMes').value = '';
  document.getElementById('extratoFilterTipo').value = '';
  document.getElementById('extratoFilterCat').value = '';
  document.getElementById('extratoFilterCanal').value = '';
  filterExtrato();
}
