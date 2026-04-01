import { fmt } from '../utils/formatters.js';
import { escapeHtml } from '../utils/dom.js';

const EMPTY_STATUS = {
  tone: 'neutral',
  label: 'Sem base suficiente',
  note: 'Importe histórico suficiente para consolidar orçamento, fluxo e endividamento.',
};

export function buildAnalysisSurfaceViewModel(financialAnalysis = null, options = {}) {
  const budget = financialAnalysis?.budget || {};
  const debt = financialAnalysis?.debt || {};
  const spending = financialAnalysis?.spending || {};
  const cashflow = financialAnalysis?.cashflow || {};
  const automaticProjection = options?.automaticProjection || {};
  const scrProjectionModel = options?.scrProjectionModel || {};
  const scrTotals = scrProjectionModel?.totals || {};

  return {
    status: budget?.status || EMPTY_STATUS,
    narrative: financialAnalysis?.narrative || {},
    highlights: (financialAnalysis?.highlights || []).slice(0, 4),
    summaryCards: (financialAnalysis?.summaryCards || []).slice(0, 6),
    budget,
    debt,
    spending,
    cashflow,
    topCategories: (spending?.topCategories || []).slice(0, 5),
    movers: (spending?.movers || []).slice(0, 3),
    recentMonths: (cashflow?.months || []).slice(-4),
    simulation: {
      inputs: automaticProjection?.inputs || {},
      notes: (automaticProjection?.notes || []).slice(0, 4),
      diagnostics: automaticProjection?.diagnostics || {},
      includedCount: Number(scrTotals?.includedCount || 0),
      contextualCount: Number(scrTotals?.contextualCount || 0),
      conflictCount: Number(scrTotals?.conflictCount || 0),
      conflictMonthlyTotal: Number(scrTotals?.conflictMonthlyTotal || 0),
    },
    hasUsefulData: Boolean(
      (financialAnalysis?.summaryCards || []).length ||
      (spending?.topCategories || []).length ||
      (cashflow?.months || []).length ||
      (financialAnalysis?.highlights || []).length
    ),
  };
}

export function buildAnaliseFinanceira(financialAnalysis = null, options = {}) {
  const host = document.getElementById('analiseFinanceiraRoot');
  if (!host) return;

  const viewModel = buildAnalysisSurfaceViewModel(financialAnalysis, options);
  host.innerHTML = renderAnalysisSurface(viewModel);
}

function renderAnalysisSurface(viewModel) {
  const statusClass = resolveToneBadgeClass(viewModel.status?.tone);

  return `
    <div class="helper-panel">
      <div class="helper-panel-header">
        <div>
          <h3>🧠 Central de análise financeira</h3>
          <p>${escapeHtml(viewModel.narrative?.headline || viewModel.status?.note || EMPTY_STATUS.note)}</p>
        </div>
        <div class="analysis-surface-actions">
          <span class="badge ${statusClass}">${escapeHtml(viewModel.status?.label || EMPTY_STATUS.label)}</span>
          <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'projecao')">Abrir Projeção</button>
          <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'registrato')">Abrir Registrato</button>
        </div>
      </div>
      ${viewModel.hasUsefulData
        ? `
          <div class="info-panel" style="margin-bottom:0">
            <div class="info-panel-title">Resumo executivo</div>
            <div class="info-panel-body">
              ${(viewModel.narrative?.bullets || []).length
                ? `<ul style="margin:0;padding-left:18px;display:grid;gap:6px">
                    ${(viewModel.narrative?.bullets || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                  </ul>`
                : escapeHtml(viewModel.status?.note || EMPTY_STATUS.note)}
            </div>
          </div>
        `
        : `
          <div class="info-panel info-panel-primary" style="margin-bottom:0">
            <div class="info-panel-title">Sem leitura consolidada ainda</div>
            <div class="info-panel-body">
              Importe PDFs da conta/fatura ou complete sua base recorrente para liberar orçamento, categorias, fluxo e leitura do simulador nesta aba.
            </div>
          </div>
        `}
    </div>

    <div class="cards">
      ${renderSummaryCards(viewModel.summaryCards)}
    </div>

    ${renderHighlights(viewModel.highlights)}

    <div class="section-title">💸 Orçamento base</div>
    <div class="split-panel">
      <div class="surface-panel">
        <div class="info-panel-title">Leitura mensal consolidada</div>
        <div class="summary-bar" style="margin-top:12px">
          <div class="sb-item"><span class="sb-label">Renda estimada</span><span class="sb-value" style="color:#76e4f7">${escapeHtml(fmt(viewModel.budget?.estimatedIncome || 0))}</span></div>
          <div class="divider"></div>
          <div class="sb-item"><span class="sb-label">Comprometido</span><span class="sb-value" style="color:${resolveToneColor(viewModel.status?.tone)}">${escapeHtml(fmt(viewModel.budget?.recurringWithCredit || 0))}</span></div>
          <div class="divider"></div>
          <div class="sb-item"><span class="sb-label">Variáveis</span><span class="sb-value" style="color:#f6ad55">${escapeHtml(fmt(viewModel.budget?.variableSpendEstimate || 0))}</span></div>
          <div class="divider"></div>
          <div class="sb-item"><span class="sb-label">Saldo livre</span><span class="sb-value" style="color:${resolveToneColor((viewModel.budget?.freeBudgetEstimate || 0) >= 0 ? 'healthy' : 'critical')}">${escapeHtml(formatSignedCurrency(viewModel.budget?.freeBudgetEstimate || 0))}</span></div>
        </div>
        <div class="analysis-metric-grid">
          ${renderMetric('Base recorrente', fmt(viewModel.budget?.recurringBase || 0), 'Fixos cadastrados + assinaturas recorrentes detectadas')}
          ${renderMetric('SCR incluído no mês', fmt(viewModel.budget?.includedCreditCommitments || 0), 'Compromissos extras fortes já considerados na leitura')}
          ${renderMetric('Orçamento configurado', viewModel.budget?.configuredBudgetTotal > 0 ? fmt(viewModel.budget.configuredBudgetTotal) : '—', viewModel.budget?.configuredBudgetTotal > 0 ? 'Soma dos limites/orçamentos cadastrados' : 'Nenhum orçamento mensal configurado')}
          ${renderMetric('Gap renda × orçamento', viewModel.budget?.configuredGap == null ? '—' : formatSignedCurrency(viewModel.budget.configuredGap), viewModel.budget?.configuredGap == null ? 'Disponível quando houver orçamento configurado' : 'Diferença entre renda estimada e orçamento configurado')}
        </div>
      </div>
      <div class="surface-panel">
        <div class="info-panel-title">Leitura de pressão orçamentária</div>
        <div class="analysis-metric-grid analysis-metric-grid--compact" style="margin-top:12px">
          ${renderMetric('Comprometimento', formatPercent(viewModel.budget?.commitmentRatio || 0), 'Antes dos gastos variáveis')}
          ${renderMetric('Pressão total', formatPercent(viewModel.budget?.pressureRatio || 0), 'Inclui variáveis e cartão médio')}
        </div>
        <div class="info-panel" style="margin-top:16px;margin-bottom:0">
          <div class="info-panel-title">Leitura do orçamento</div>
          <div class="info-panel-body">${escapeHtml(viewModel.status?.note || EMPTY_STATUS.note)}</div>
        </div>
      </div>
    </div>

    <div class="section-title">🧾 Gastos por categoria</div>
    <div class="split-panel">
      <div class="surface-panel">
        <div class="info-panel-title">Concentração da amostra</div>
        ${viewModel.topCategories.length
          ? `
            <div class="analysis-list" style="margin-top:14px">
              ${viewModel.topCategories.map(item => `
                <div class="analysis-list-item">
                  <div class="analysis-list-top">
                    <strong>${escapeHtml(item.cat || 'Outros')}</strong>
                    <span>${escapeHtml(fmt(item.total || 0))}</span>
                  </div>
                  <div class="analysis-list-note">${escapeHtml(formatPercent(item.share || 0))} do gasto categorizado</div>
                  <div class="progress-wrap" style="margin-top:10px">
                    <div class="progress-bar" style="width:${Math.max(4, Math.round((item.share || 0) * 100))}%;--color:${resolveCategoryBarColor(item.share || 0)}"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          `
          : renderInlineEmpty('Ainda não há gasto categorizado suficiente para destacar concentrações.')}
        ${viewModel.spending?.quality?.shouldWarn
          ? `
            <div class="info-panel" style="margin-top:16px;margin-bottom:0">
              <div class="info-panel-title">Qualidade da categorização</div>
              <div class="info-panel-body">${escapeHtml(viewModel.spending?.quality?.note || '')}</div>
            </div>
          `
          : ''}
      </div>
      <div class="surface-panel">
        <div class="info-panel-title">Movimentos recentes</div>
        ${viewModel.movers.length
          ? `
            <div class="analysis-list" style="margin-top:14px">
              ${viewModel.movers.map(item => `
                <div class="analysis-list-item">
                  <div class="analysis-list-top">
                    <strong>${escapeHtml(item.cat || 'Outros')}</strong>
                    <span style="color:${resolveDeltaColor(item.delta || 0)}">${escapeHtml(formatSignedCurrency(item.delta || 0))}</span>
                  </div>
                  <div class="analysis-list-note">
                    ${escapeHtml(buildMoverNote(item, viewModel.spending?.latestMonth, viewModel.spending?.previousMonth))}
                  </div>
                </div>
              `).join('')}
            </div>
          `
          : renderInlineEmpty('Importe ao menos dois meses categorizados para comparar variações por categoria.')}
      </div>
    </div>

    <div class="section-title">📈 Fluxo de caixa recente</div>
    <div class="surface-panel">
      <div class="summary-bar" style="margin-top:4px">
        <div class="sb-item"><span class="sb-label">Saldo atual</span><span class="sb-value" style="color:${resolveToneColor((viewModel.cashflow?.currentBalance || 0) >= 0 ? 'healthy' : 'critical')}">${escapeHtml(fmt(viewModel.cashflow?.currentBalance || 0))}</span></div>
        <div class="divider"></div>
        <div class="sb-item"><span class="sb-label">Média líquida</span><span class="sb-value" style="color:${resolveDeltaColor(viewModel.cashflow?.averageNet || 0)}">${escapeHtml(formatSignedCurrency(viewModel.cashflow?.averageNet || 0))}</span></div>
        <div class="divider"></div>
        <div class="sb-item"><span class="sb-label">Melhor mês</span><span class="sb-value">${escapeHtml(viewModel.cashflow?.best?.mes || '—')}</span></div>
        <div class="divider"></div>
        <div class="sb-item"><span class="sb-label">Pior mês</span><span class="sb-value">${escapeHtml(viewModel.cashflow?.worst?.mes || '—')}</span></div>
      </div>
      ${viewModel.recentMonths.length
        ? `
          <div class="analysis-list" style="margin-top:16px">
            ${viewModel.recentMonths.map(item => `
              <div class="analysis-list-item">
                <div class="analysis-list-top">
                  <strong>${escapeHtml(item.mes || '')}</strong>
                  <span style="color:${resolveDeltaColor(item.variacao || 0)}">${escapeHtml(formatSignedCurrency(item.variacao || 0))}</span>
                </div>
                <div class="analysis-list-note">
                  Entradas ${escapeHtml(fmt(item.entradas || 0))} · Saídas ${escapeHtml(fmt(item.saidas || 0))} · Saldo final ${escapeHtml(fmt(item.saldoFinal || 0))}
                </div>
              </div>
            `).join('')}
          </div>
        `
        : renderInlineEmpty('Sem extrato suficiente para consolidar fluxo de caixa recente.')}
    </div>

    <div class="section-title">🏛️ Endividamento / SCR</div>
    <div class="split-panel">
      <div class="surface-panel">
        <div class="cards" style="margin-bottom:0">
          ${renderSummaryCards([
            { label: 'Exposição total', value: viewModel.debt?.totalExposure || 0, tone: viewModel.debt?.overdue > 0 ? 'critical' : 'neutral', sub: 'Consolidado do SCR importado' },
            { label: 'Dívida vencida', value: viewModel.debt?.overdue || 0, tone: (viewModel.debt?.overdue || 0) > 0 ? 'critical' : 'healthy', sub: (viewModel.debt?.overdue || 0) > 0 ? 'Precisa de atenção prioritária' : 'Sem saldo vencido relevante' },
            { label: 'Em dia', value: viewModel.debt?.inGoodStanding || 0, tone: 'healthy', sub: 'Parte da exposição sem atraso' },
            { label: 'Limite de crédito', value: viewModel.debt?.creditLimit || 0, tone: 'info', sub: 'Limite consolidado informado no SCR' },
          ])}
        </div>
      </div>
      <div class="surface-panel">
        <div class="info-panel-title">Impacto do SCR na análise</div>
        <div class="analysis-list" style="margin-top:14px">
          <div class="analysis-list-item">
            <div class="analysis-list-top">
              <strong>Incluído no cálculo</strong>
              <span>${escapeHtml(fmt(viewModel.debt?.includedProjection || 0))}</span>
            </div>
            <div class="analysis-list-note">${escapeHtml(`${viewModel.simulation?.includedCount || 0} compromisso(s) forte(s) entram na leitura automática.`)}</div>
          </div>
          <div class="analysis-list-item">
            <div class="analysis-list-top">
              <strong>Somente contexto</strong>
              <span>${escapeHtml(String(viewModel.simulation?.contextualCount || 0))}</span>
            </div>
            <div class="analysis-list-note">Itens exibidos para contexto, sem entrar na matemática da projeção.</div>
          </div>
          <div class="analysis-list-item">
            <div class="analysis-list-top">
              <strong>Conflitos / duplicidade</strong>
              <span style="color:${resolveToneColor((viewModel.simulation?.conflictCount || 0) > 0 ? 'attention' : 'neutral')}">${escapeHtml(formatConflictSummary(viewModel.simulation))}</span>
            </div>
            <div class="analysis-list-note">
              ${(viewModel.simulation?.conflictMonthlyTotal || 0) > 0
                ? `Há ${escapeHtml(fmt(viewModel.simulation.conflictMonthlyTotal))} fora do cálculo por possível sobreposição com itens já cadastrados.`
                : 'Sem conflitos relevantes detectados na leitura atual.'}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">🔮 Leitura do simulador atual</div>
    <div class="helper-panel">
      <div class="helper-panel-header">
        <div>
          <h3>Simulador reaproveitado da aba Projeção</h3>
          <p>Os parâmetros abaixo já abastecem a projeção existente. Ajustes manuais continuam centralizados na aba Projeção para evitar duplicidade de lógica.</p>
        </div>
        <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'projecao')">Editar cenário completo</button>
      </div>
      ${viewModel.simulation?.notes?.length
        ? `<div class="cards" style="margin-bottom:16px">
            ${viewModel.simulation.notes.map(item => `
              <div class="card" style="--accent:${resolveAutoEstimateAccent(item.id)}">
                <div class="label">${escapeHtml(item.label || '')}</div>
                <div class="value">${escapeHtml(fmt(item.value || 0))}</div>
                <div class="sub">${escapeHtml(item.note || '')}</div>
              </div>
            `).join('')}
          </div>`
        : renderInlineEmpty('Sem leitura automática suficiente para preencher o simulador com segurança.')}
      <div class="info-panel" style="margin-bottom:0">
        <div class="info-panel-title">Parâmetros aplicados hoje</div>
        <div class="info-panel-body">
          Salário ${escapeHtml(fmt(viewModel.simulation?.inputs?.salario || 0))} ·
          Renda extra ${escapeHtml(fmt(viewModel.simulation?.inputs?.rendaExtra || 0))} ·
          Cartão ${escapeHtml(fmt(viewModel.simulation?.inputs?.itau || 0))} ·
          Variáveis ${escapeHtml(fmt(viewModel.simulation?.inputs?.outros || 0))} ·
          Horizonte ${escapeHtml(String(viewModel.simulation?.inputs?.meses || 6))} mês(es).
        </div>
      </div>
    </div>`;
}

function renderSummaryCards(cards = []) {
  if (!cards.length) {
    return `
      <div class="card" style="--accent:#718096">
        <div class="label">Sem indicadores ainda</div>
        <div class="value">—</div>
        <div class="sub">A nova aba acompanha a base compartilhada conforme os dados forem entrando.</div>
      </div>`;
  }

  return cards.map(card => `
    <div class="card" style="--accent:${resolveToneColor(card.tone)}">
      <div class="label">${escapeHtml(card.label || '')}</div>
      <div class="value" style="color:${resolveToneColor(card.tone)}">${escapeHtml(fmt(card.value || 0))}</div>
      <div class="sub">${escapeHtml(card.sub || '')}</div>
    </div>
  `).join('');
}

function renderHighlights(highlights = []) {
  if (!highlights.length) return '';

  return `
    <div class="surface-panel" style="margin-bottom:24px">
      <div class="info-panel-title">Sinais principais</div>
      <div class="analysis-list" style="margin-top:14px">
        ${highlights.map(item => `
          <div class="analysis-list-item">
            <div class="analysis-list-top">
              <strong style="color:${resolveToneColor(item.tone)}">${escapeHtml(item.title || '')}</strong>
            </div>
            <div class="analysis-list-note">${escapeHtml(item.message || '')}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderMetric(label, value, note) {
  return `
    <div class="analysis-metric">
      <div class="analysis-metric-label">${escapeHtml(label || '')}</div>
      <div class="analysis-metric-value">${escapeHtml(value || '—')}</div>
      <div class="analysis-metric-note">${escapeHtml(note || '')}</div>
    </div>`;
}

function renderInlineEmpty(message) {
  return `<div class="empty-state" style="margin-top:14px">${escapeHtml(message || '')}</div>`;
}

function buildMoverNote(item = {}, latestMonth = '', previousMonth = '') {
  if (item?.note) {
    const monthLabel = item?.status === 'new' ? latestMonth : previousMonth;
    return `${item.note}${monthLabel ? ` em ${monthLabel}` : ''}`;
  }

  if (!latestMonth || !previousMonth) {
    return 'Comparativo entre os últimos meses categorizados.';
  }

  return `${previousMonth} → ${latestMonth}`;
}

function resolveToneColor(tone) {
  if (tone === 'healthy') return '#68d391';
  if (tone === 'critical') return '#fc8181';
  if (tone === 'attention') return '#f6ad55';
  if (tone === 'info') return '#76e4f7';
  return '#a0aec0';
}

function resolveToneBadgeClass(tone) {
  if (tone === 'healthy') return 'badge-green';
  if (tone === 'critical') return 'badge-red';
  if (tone === 'attention') return 'badge-yellow';
  if (tone === 'info') return 'badge-blue';
  return 'badge-gray';
}

function resolveDeltaColor(value) {
  return Number(value || 0) >= 0 ? '#68d391' : '#fc8181';
}

function resolveCategoryBarColor(share) {
  if (share >= 0.3) return '#fc8181';
  if (share >= 0.2) return '#f6ad55';
  return '#63b3ed';
}

function resolveAutoEstimateAccent(id) {
  if (id === 'salario') return '#76e4f7';
  if (id === 'rendaExtra') return '#68d391';
  if (id === 'itau') return '#fc8181';
  if (id === 'outros') return '#f6ad55';
  return '#a0aec0';
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  if (amount > 0) return `+${fmt(amount)}`;
  return fmt(amount);
}

function formatConflictSummary(simulation = {}) {
  const count = Number(simulation?.conflictCount || 0);
  if (!count) return '0 conflito';
  return `${count} conflito${count > 1 ? 's' : ''}`;
}
