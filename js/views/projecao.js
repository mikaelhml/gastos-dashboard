import { fmt } from '../utils/formatters.js';
import { putItem } from '../db.js';
import { escapeHtml } from '../utils/dom.js';
import { buildProjectionSchedule } from '../utils/projection-model.js';
import { buildAutomaticProjectionInputs } from '../utils/projection-auto.js';
import {
  buildProjectionSimulatorConfigRecord,
  normalizeProjectionSimulatorConfig,
  normalizeProjectionSimulatorInputs,
} from '../utils/projection-simulator-config.js';

let _chartSaldo  = null;
let _chartBarras = null;
let _chartPizza  = null;

let _despesasFixas = [];
let _fixoMensal = { itens: {}, total: 0 };
let _historico  = [];
let _saldoAtual = 0;
let _ultimoMes  = 'Fev/2026';
let _registratoInsights = null;
let _scrProjectionModel = createEmptyScrModel();
let _parcelamentoSummary = createEmptyParcelamentoSummary();
let _financialAnalysis = null;
let _autoProjection = { inputs: { salario: 0, rendaExtra: 0, itau: 0, outros: 0, meses: 6 }, notes: [], diagnostics: {} };
let _persistedSimulatorConfig = null;
let _projectionInputsBound = false;
let _projectionPersistTimer = null;
let _lastPersistedProjectionSignature = '';

function createEmptyScrModel() {
  return {
    commitments: [],
    totals: {
      includedMonthlyTotal: 0,
      conflictMonthlyTotal: 0,
      contextualCount: 0,
      includedCount: 0,
      conflictCount: 0,
    },
  };
}

function createEmptyParcelamentoSummary() {
  return {
    financiamentos: { ativos: 0, totalMensal: 0, saldoDevedor: 0, proximoTermino: '—' },
    cartaoParcelado: { ativos: 0, totalMensal: 0, saldoRestante: 0, proximoTermino: '—' },
  };
}

function parseNumberInput(id, fallback = 0) {
  const value = parseFloat(document.getElementById(id)?.value ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function parseMonthCount() {
  const value = parseInt(document.getElementById('pMeses')?.value ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : 6;
}

function setNumberInputValue(id, value) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = String(roundMoney(value));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function computeFixoMensal(despesasFixas) {
  const itens = {};
  despesasFixas.forEach(d => {
    const valor = Number(d?.valor || 0);
    if (Number.isFinite(valor) && valor > 0) itens[d.desc] = valor;
  });
  return { itens, total: Object.values(itens).reduce((s, v) => s + v, 0) };
}

function computeHistorico(extratoSummary) {
  return extratoSummary.map(m => ({ mes: m.mes, saldo: m.saldoFinal }));
}

export function initProjecao(despesasFixas, extratoSummary, registratoInsights = null, options = {}) {
  _despesasFixas = Array.isArray(despesasFixas) ? despesasFixas : [];
  _fixoMensal = computeFixoMensal(_despesasFixas);
  _historico  = computeHistorico(extratoSummary);
  _registratoInsights = registratoInsights;
  _scrProjectionModel = options?.scrProjectionModel || createEmptyScrModel();
  _parcelamentoSummary = options?.parcelamentoSummary || createEmptyParcelamentoSummary();
  _financialAnalysis = options?.financialAnalysis || null;
  _autoProjection = options?.automaticProjection || buildAutomaticProjectionInputs({
    extratoTransacoes: options?.extratoTransacoes || [],
    extratoSummary,
    cardBillSummaries: options?.cardBillSummaries || [],
    recurringCommitments: options?.recurringCommitments || _despesasFixas,
  });
  _persistedSimulatorConfig = options?.persistedSimulatorConfig
    ? normalizeProjectionSimulatorConfig(options.persistedSimulatorConfig, _autoProjection.inputs)
    : null;
  _lastPersistedProjectionSignature = '';

  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);
  const ultimo = summaryReal[summaryReal.length - 1];
  _saldoAtual = ultimo ? ultimo.saldoFinal : 0;
  _ultimoMes  = ultimo ? ultimo.mes : 'Fev/2026';

  applyProjectionInputs();
  _lastPersistedProjectionSignature = getProjectionInputsSignature(readProjectionFormInputs());
  bindProjectionInputPersistence();
  renderFinancialAnalysisPanel();
  renderScrProjectionPanel();
  renderAutomaticProjectionPanel();
  buildCenarios();
  recalcularProjecao();
}

function getIncludedCommitments() {
  return (_scrProjectionModel?.commitments || []).filter(item => item?.status === 'included');
}

function calcProjecao(salario, rendaExtra, itau, outros, nMeses) {
  const schedule = buildProjectionSchedule({
    despesasFixas: _despesasFixas,
    includedCommitments: getIncludedCommitments(),
    startMonthLabel: _ultimoMes,
    nMeses,
  });

  let saldo = _saldoAtual;
  return schedule.map(item => {
    const entradas = salario + rendaExtra;
    const fixo = item.fixoProgramado;
    const scrIncluido = item.scrIncluido;
    const totalSaidas = fixo + scrIncluido + itau + outros;
    const resultado = entradas - totalSaidas;
    saldo += resultado;
    return {
      mes: item.mes,
      entradas,
      salario,
      rendaExtra,
      fixoBase: item.fixoBase,
      fixo,
      scrIncluido,
      itau,
      outros,
      totalSaidas,
      resultado,
      saldo,
    };
  });
}

function buildCenarios() {
  const base = getCurrentProjectionInputs();
  const cenarios = [
    {
      id: 'otimista',
      sal: roundMoney((base.salario + base.rendaExtra) * 1.06),
      rendaExtra: roundMoney(base.rendaExtra * 1.1),
      itau: roundMoney(base.itau * 0.92),
      outros: roundMoney(base.outros * 0.9),
    },
    {
      id: 'realista',
      sal: base.salario,
      rendaExtra: base.rendaExtra,
      itau: base.itau,
      outros: base.outros,
    },
    {
      id: 'pessimista',
      sal: roundMoney(base.salario * 0.92),
      rendaExtra: roundMoney(base.rendaExtra * 0.65),
      itau: roundMoney(base.itau * 1.08),
      outros: roundMoney(base.outros * 1.12),
    },
  ];

  cenarios.forEach(c => {
    const rows = calcProjecao(c.sal, c.rendaExtra, c.itau, c.outros, 24);
    const firstRow = rows[0] || { resultado: 0 };
    const idCap = c.id.charAt(0).toUpperCase() + c.id.slice(1);

    document.getElementById('sc' + idCap + 'Val').textContent =
      `${firstRow.resultado >= 0 ? '+' : ''}${fmt(firstRow.resultado)}/mês`;

    if (firstRow.resultado >= 0) {
      document.getElementById('sc' + idCap + 'Time').textContent =
        `✅ Mês 1 cresce ${fmt(firstRow.resultado)} com SCR e parcelas programadas`;
    } else {
      const zeraRow = rows.find(r => r.saldo <= 0);
      document.getElementById('sc' + idCap + 'Time').textContent =
        zeraRow ? `🔴 Saldo zera em ${zeraRow.mes}` : `⚠️ Saldo negativo em 24+ meses`;
    }
  });

  const equilibrioRows = calcProjecao(0, 0, base.itau, base.outros, 1);
  const equilibrio = equilibrioRows[0] || { fixo: _fixoMensal.total, scrIncluido: 0 };
  const peq = equilibrio.fixo + equilibrio.scrIncluido + base.itau + base.outros;
  document.getElementById('scEquilibrioVal').textContent = `${fmt(peq)}/mês`;
  document.getElementById('scEquilibrioSub').textContent =
    `Mês 1: Fixos ${fmt(equilibrio.fixo)} + SCR incluído ${fmt(equilibrio.scrIncluido)} + Cartão ${fmt(base.itau)} + Outros ${fmt(base.outros)}`;
}

export function recalcularProjecao() {
  persistProjectionInputs({ immediate: true });

  const salario = parseNumberInput('pSalario', 0);
  const rendaExtra = parseNumberInput('pRendaExtra', 0);
  const itau = parseNumberInput('pItau', 0);
  const outros = parseNumberInput('pOutros', 0);
  const nMeses = parseMonthCount();

  const rows = calcProjecao(salario, rendaExtra, itau, outros, nMeses);
  const firstRow = rows[0] || { resultado: 0, fixo: _fixoMensal.total, scrIncluido: 0 };
  const resultMes = firstRow.resultado;
  const commitmentTotals = _scrProjectionModel?.totals || createEmptyScrModel().totals;

  const el = document.getElementById('pResultadoMensal');
  const statusColor = resultMes >= 0 ? '#68d391' : '#fc8181';
  el.innerHTML = `
    Resultado do próximo mês:
    <strong style="color:${statusColor}">${resultMes >= 0 ? '+' : ''}${escapeHtml(fmt(resultMes))}</strong>
    <span style="color:#90cdf4">· Fixos ${escapeHtml(fmt(firstRow.fixo))}</span>
    <span style="color:#f6ad55">· Cartão ${escapeHtml(fmt(itau))}</span>
    <span style="color:#76e4f7">· Outros ${escapeHtml(fmt(outros))}</span>
    ${firstRow.scrIncluido > 0
      ? `<span style="color:#b794f4">· Compromissos extras ${escapeHtml(fmt(firstRow.scrIncluido))}</span>`
      : ''}
    ${commitmentTotals.contextualCount > 0 || commitmentTotals.conflictCount > 0
      ? `<span style="color:#a0aec0">· ${commitmentTotals.contextualCount} leitura(s) contextuais e ${commitmentTotals.conflictCount} conflito(s) fora do cálculo</span>`
      : ''}`;

  buildCenarios();
  renderScrProjectionPanel();
  renderFinancialAnalysisPanel();
  renderAutomaticProjectionPanel();
  renderProjecaoTable(rows);
  updateProjecaoCharts(rows, itau, outros);
  renderAlerta(rows, resultMes);
}

function renderFinancialAnalysisPanel() {
  const panel = document.getElementById('projecaoAnalysisPanel');
  if (!panel) return;

  if (!_financialAnalysis) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    return;
  }

  const budget = _financialAnalysis.budget || {};
  const debt = _financialAnalysis.debt || {};
  const bullets = (_financialAnalysis.narrative?.bullets || []).slice(0, 3);
  const accent = resolveAnalysisToneColor(budget?.status?.tone);

  panel.innerHTML = `
    <div class="helper-panel-header">
      <div>
        <h3>📌 Leitura-base antes da simulação</h3>
        <p>${escapeHtml(budget?.status?.note || 'Use esta leitura como referência e depois ajuste os parâmetros para testar cenários.')}</p>
      </div>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:${accent};font-size:0.82rem;font-weight:700">${escapeHtml(budget?.status?.label || 'Sem base suficiente')}</span>
    </div>
    <div class="cards" style="margin-top:12px">
      <div class="card" style="--accent:${resolveAnalysisToneColor('info')}">
        <div class="label">Renda estimada/mês</div>
        <div class="value" style="color:${resolveAnalysisToneColor('info')}">${escapeHtml(fmt(budget?.estimatedIncome || 0))}</div>
        <div class="sub">Entradas recorrentes detectadas no histórico</div>
      </div>
      <div class="card" style="--accent:${resolveAnalysisToneColor(budget?.status?.tone)}">
        <div class="label">Comprometimento base</div>
        <div class="value" style="color:${resolveAnalysisToneColor(budget?.status?.tone)}">${escapeHtml(fmt(budget?.recurringWithCredit || 0))}</div>
        <div class="sub">${Math.round((budget?.commitmentRatio || 0) * 100)}% da renda antes dos variáveis</div>
      </div>
      <div class="card" style="--accent:${resolveAnalysisToneColor(budget?.freeBudgetEstimate >= 0 ? 'healthy' : 'critical')}">
        <div class="label">Saldo livre estimado</div>
        <div class="value" style="color:${resolveAnalysisToneColor(budget?.freeBudgetEstimate >= 0 ? 'healthy' : 'critical')}">${escapeHtml(fmt(budget?.freeBudgetEstimate || 0))}</div>
        <div class="sub">Cenário base antes de editar os parâmetros</div>
      </div>
      <div class="card" style="--accent:${resolveAnalysisToneColor(debt?.overdue > 0 ? 'critical' : 'neutral')}">
        <div class="label">Exposição no SCR</div>
        <div class="value" style="color:${resolveAnalysisToneColor(debt?.overdue > 0 ? 'critical' : 'neutral')}">${escapeHtml(fmt(debt?.totalExposure || 0))}</div>
        <div class="sub">${debt?.overdue > 0 ? 'Inclui dívida vencida' : 'Saldo consolidado em crédito'}</div>
      </div>
    </div>
    ${bullets.length ? `
      <div class="info-panel" style="margin-top:16px;margin-bottom:0">
        <div class="info-panel-title">Leituras que ajudam a calibrar a simulação</div>
        <div class="info-panel-body">
          <ul style="margin:10px 0 0 18px;padding:0;display:grid;gap:6px">
            ${bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      </div>
    ` : ''}`;
  panel.style.display = '';
}

function resolveAnalysisToneColor(tone) {
  if (tone === 'healthy') return '#68d391';
  if (tone === 'critical') return '#fc8181';
  if (tone === 'attention') return '#f6ad55';
  if (tone === 'info') return '#76e4f7';
  return '#a0aec0';
}

function applyProjectionInputs() {
  const inputs = resolveProjectionFormInputs();
  setNumberInputValue('pSalario', inputs.salario || 0);
  setNumberInputValue('pRendaExtra', inputs.rendaExtra || 0);
  setNumberInputValue('pItau', inputs.itau || 0);
  setNumberInputValue('pOutros', inputs.outros || 0);
  const monthSelect = document.getElementById('pMeses');
  if (monthSelect && String(inputs.meses || 6) !== monthSelect.value) {
    monthSelect.value = String(inputs.meses || 6);
  }
}

function resolveProjectionFormInputs() {
  return normalizeProjectionSimulatorInputs(_persistedSimulatorConfig, _autoProjection?.inputs || {});
}

function getCurrentProjectionInputs() {
  const formReady = ['pSalario', 'pRendaExtra', 'pItau', 'pOutros', 'pMeses']
    .every(id => document.getElementById(id));

  return formReady
    ? readProjectionFormInputs()
    : resolveProjectionFormInputs();
}

function bindProjectionInputPersistence() {
  if (_projectionInputsBound) return;

  const inputIds = ['pSalario', 'pRendaExtra', 'pItau', 'pOutros', 'pMeses'];
  inputIds.forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('input', () => persistProjectionInputs());
    element.addEventListener('change', () => persistProjectionInputs({ immediate: true }));
  });

  _projectionInputsBound = true;
}

function persistProjectionInputs({ immediate = false } = {}) {
  if (_projectionPersistTimer) {
    window.clearTimeout(_projectionPersistTimer);
    _projectionPersistTimer = null;
  }

  const save = async () => {
    try {
      const payload = buildProjectionSimulatorConfigRecord(readProjectionFormInputs(), _autoProjection?.inputs || {});
      const signature = getProjectionInputsSignature(payload);
      if (signature === _lastPersistedProjectionSignature) return;

      await putItem('projecao_parametros', payload);
      _persistedSimulatorConfig = payload;
      _lastPersistedProjectionSignature = signature;
    } catch (error) {
      console.error('[Projecao] Falha ao persistir parametros do simulador:', error);
    }
  };

  if (immediate) {
    void save();
    return;
  }

  _projectionPersistTimer = window.setTimeout(() => { void save(); }, 300);
}

function readProjectionFormInputs() {
  return {
    salario: parseNumberInput('pSalario', 0),
    rendaExtra: parseNumberInput('pRendaExtra', 0),
    itau: parseNumberInput('pItau', 0),
    outros: parseNumberInput('pOutros', 0),
    meses: parseMonthCount(),
  };
}

function getProjectionInputsSignature(inputs) {
  const normalized = normalizeProjectionSimulatorInputs(inputs);
  return JSON.stringify(normalized);
}

function renderAutomaticProjectionPanel() {
  const panel = document.getElementById('projecaoAutoPanel');
  if (!panel) return;

  const inputs = _autoProjection?.inputs || {};
  const notes = _autoProjection?.notes || [];
  const diagnostics = _autoProjection?.diagnostics || {};

  panel.innerHTML = `
    <div class="helper-panel-header">
      <div>
        <h3>Leitura automática dos seus dados</h3>
        <p>A projeção já nasce preenchida com estimativas baseadas no extrato, nas faturas importadas e nos compromissos recorrentes cadastrados. Você só ajusta se quiser simular outro cenário.</p>
      </div>
      <span class="badge badge-blue">${diagnostics.monthsAnalyzed || 0} mês(es) analisados</span>
    </div>
    <div class="cards" style="margin-top:12px">
      ${notes.map(item => `
        <div class="card" style="--accent:${resolveAutoEstimateAccent(item.id)}">
          <div class="label">${escapeHtml(item.label)}</div>
          <div class="value">${escapeHtml(fmt(item.value || 0))}</div>
          <div class="sub">${escapeHtml(item.note || '')}</div>
        </div>
      `).join('')}
    </div>
    <div class="info-panel" style="margin-top:16px;margin-bottom:0">
      <div class="info-panel-title">Parâmetros aplicados automaticamente</div>
      <div class="info-panel-body">
        Salário recorrente ${escapeHtml(fmt(inputs.salario || 0))} · Renda extra ${escapeHtml(fmt(inputs.rendaExtra || 0))} ·
        Cartão ${escapeHtml(fmt(inputs.itau || 0))} · Outros ${escapeHtml(fmt(inputs.outros || 0))}.
      </div>
    </div>`;
}

function renderScrProjectionPanel() {
  const panel = document.getElementById('projecaoScrPanel');
  const summaryEl = document.getElementById('projecaoScrSummary');
  const commitmentsEl = document.getElementById('projecaoScrCommitments');
  const trackerEl = document.getElementById('projecaoTrackerImpact');
  if (!panel || !summaryEl || !commitmentsEl || !trackerEl) return;

  const commitments = _scrProjectionModel?.commitments || [];
  const totals = _scrProjectionModel?.totals || createEmptyScrModel().totals;
  const projectionInputs = getCurrentProjectionInputs();
  const topCategories = _autoProjection?.diagnostics?.topVariableCategories || [];
  const totalCommitments = Number(_fixoMensal?.total || 0) + Number(totals.includedMonthlyTotal || 0);
  const saldoMensalBase = (projectionInputs.salario + projectionInputs.rendaExtra) - (totalCommitments + projectionInputs.itau + projectionInputs.outros);

  summaryEl.innerHTML = `
    <div class="summary-bar" style="margin-top:8px">
      <div class="sb-item"><span class="sb-label">Base fixa do mês:</span><span class="sb-value" style="color:#90cdf4">${escapeHtml(fmt(totalCommitments))}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Cartão médio:</span><span class="sb-value" style="color:#fc8181">${escapeHtml(fmt(projectionInputs.itau || 0))}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Gastos variáveis:</span><span class="sb-value" style="color:#f6ad55">${escapeHtml(fmt(projectionInputs.outros || 0))}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Resultado base:</span><span class="sb-value" style="color:${saldoMensalBase >= 0 ? '#68d391' : '#fc8181'}">${saldoMensalBase >= 0 ? '+' : ''}${escapeHtml(fmt(saldoMensalBase))}</span></div>
    </div>`;

  commitmentsEl.innerHTML = commitments.length
    ? commitments.map(renderCommitmentCard).join('')
    : `
      <div class="surface-panel" style="padding:16px">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <div>
            <strong style="color:#e2e8f0">O SCR não alterou a matemática da projeção</strong>
            <div style="margin-top:8px;color:#a0aec0;font-size:0.9rem">
              Com os dados atuais, não apareceu nenhum compromisso extra forte o bastante para entrar no cálculo.
            </div>
          </div>
          <div class="helper-badges">
            ${topCategories.map(item => `<span class="badge badge-yellow">${escapeHtml(item.cat)} · ${escapeHtml(fmt(item.total))}</span>`).join('')}
          </div>
        </div>
        <div style="margin-top:12px;color:#718096;font-size:0.82rem">
          Categorias acima ajudam a entender o que mais pressiona sua saída variável recente.
        </div>
      </div>`;

  trackerEl.innerHTML = `
    <div class="helper-panel-header">
      <div>
        <h3>📦 O que pesa todo mês</h3>
        <p>Resumo direto dos gastos recorrentes, financiamentos e parcelas que pressionam sua projeção.</p>
      </div>
      <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'despesas')">Abrir Despesas & Parcelas</button>
    </div>
    <div class="cards" style="margin-top:12px">
      <div class="card" style="--accent:#7cc7ff">
        <div class="label">📌 Gastos recorrentes</div>
        <div class="value">${escapeHtml(fmt(_fixoMensal.total || 0))}</div>
        <div class="sub">Total mensal de despesas já cadastradas e assinaturas ativas.</div>
        <div class="sub" style="margin-top:6px;color:#90cdf4">${_despesasFixas.length} item(ns) programado(s)</div>
      </div>
      <div class="card" style="--accent:#63b3ed">
        <div class="label">🏦 Financiamentos ativos</div>
        <div class="value">${_parcelamentoSummary.financiamentos.ativos}</div>
        <div class="sub">${escapeHtml(fmt(_parcelamentoSummary.financiamentos.totalMensal))}/mês · saldo restante ${escapeHtml(fmt(_parcelamentoSummary.financiamentos.saldoDevedor))}</div>
        <div class="sub" style="margin-top:6px;color:#90cdf4">Próximo término: ${escapeHtml(_parcelamentoSummary.financiamentos.proximoTermino || '—')}</div>
      </div>
      <div class="card" style="--accent:#f6ad55">
        <div class="label">💳 Parcelas no cartão</div>
        <div class="value">${_parcelamentoSummary.cartaoParcelado.ativos}</div>
        <div class="sub">${escapeHtml(fmt(_parcelamentoSummary.cartaoParcelado.totalMensal))}/mês · saldo restante ${escapeHtml(fmt(_parcelamentoSummary.cartaoParcelado.saldoRestante))}</div>
        <div class="sub" style="margin-top:6px;color:#fbd38d">Próximo término: ${escapeHtml(_parcelamentoSummary.cartaoParcelado.proximoTermino || '—')}</div>
      </div>
      <div class="card" style="--accent:#b794f4">
        <div class="label">🏛️ Compromissos extras</div>
        <div class="value">${escapeHtml(fmt(totals.includedMonthlyTotal || 0))}</div>
        <div class="sub">${totals.includedCount || 0} item(ns) entraram automaticamente no cálculo.</div>
        <div class="sub" style="margin-top:6px;color:#d6bcfa">${totals.conflictCount} conflito(s) · ${totals.contextualCount} só para contexto</div>
      </div>
    </div>`;
}

function renderCommitmentCard(item) {
  const badge = resolveCommitmentBadge(item.status);
  const reason = resolveCommitmentReason(item.motivoStatus);
  const monthlyImpact = item.status === 'included' ? fmt(item.projectionImpactMonthly || 0) : 'Fora do cálculo';
  const evidencias = item.mesesEvidencia?.length ? item.mesesEvidencia.join(' · ') : 'Sem meses cruzados';

  return `
    <div class="surface-panel" style="border:1px solid ${badge.border};padding:16px">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <strong>${escapeHtml(item.nome || 'Compromisso SCR')}</strong>
            <span class="badge ${badge.className}">${badge.label}</span>
            <span class="badge badge-purple">${escapeHtml(item.institutionLabel || 'Registrato')}</span>
          </div>
          <div style="margin-top:8px;color:#a0aec0;font-size:0.9rem">
            ${escapeHtml(item.signalLabel || item.tipo || 'Sem rótulo')} · ${escapeHtml(item.origem || 'Registrato')}
          </div>
          <div style="margin-top:8px;color:#718096;font-size:0.82rem">
            ${escapeHtml(reason)} · Evidência em ${escapeHtml(evidencias)}
          </div>
          ${item.conflictWith ? `<div style="margin-top:8px;color:#fc8181;font-size:0.82rem">Conflita com: ${escapeHtml(item.conflictWith.desc || item.conflictWith.nome || 'item manual')}</div>` : ''}
        </div>
        <div style="text-align:right;min-width:150px">
          <div style="color:#fff;font-weight:700">${escapeHtml(fmt(item.valorMensal || 0))}/mês</div>
          <div style="margin-top:6px;font-size:0.82rem;color:${item.status === 'included' ? '#b794f4' : '#a0aec0'}">${escapeHtml(monthlyImpact)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'registrato')">Ver origem no Registrato</button>
        <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'despesas')">Revisar em Despesas & Parcelas</button>
      </div>
    </div>`;
}

function renderProjecaoTable(rows) {
  const tbody = document.getElementById('projecaoTable');
  if (!tbody) return;

  tbody.innerHTML = '';
  rows.forEach(r => {
    const cor = r.resultado >= 0 ? '#68d391' : '#fc8181';
    const saldoCor = r.saldo >= 2000 ? '#68d391' : r.saldo >= 0 ? '#f6e05e' : '#fc8181';
    const saldoIcon = r.saldo >= 5000 ? '🟢' : r.saldo >= 0 ? '🟡' : '🔴';
    tbody.innerHTML += `
      <tr>
        <td><span class="badge badge-blue">${escapeHtml(r.mes)}</span></td>
        <td style="text-align:right;color:#68d391">+${escapeHtml(fmt(r.salario))}</td>
        <td style="text-align:right;color:${r.rendaExtra > 0 ? '#76e4f7' : '#718096'}">${r.rendaExtra > 0 ? '+' + escapeHtml(fmt(r.rendaExtra)) : '—'}</td>
        <td style="text-align:right;color:#a0aec0">${escapeHtml(fmt(r.fixo))}</td>
        <td style="text-align:right;color:#b794f4">${r.scrIncluido > 0 ? escapeHtml(fmt(r.scrIncluido)) : '—'}</td>
        <td style="text-align:right;color:#fc8181">${escapeHtml(fmt(r.itau))}</td>
        <td style="text-align:right;color:#f6ad55">${escapeHtml(fmt(r.outros))}</td>
        <td style="text-align:right;font-weight:600;color:#fc8181">${escapeHtml(fmt(r.totalSaidas))}</td>
        <td style="text-align:right;font-weight:700;color:${cor}">${r.resultado >= 0 ? '+' : ''}${escapeHtml(fmt(r.resultado))}</td>
        <td style="text-align:right;font-weight:700;color:${saldoCor}">${saldoIcon} ${escapeHtml(fmt(r.saldo))}</td>
      </tr>`;
  });

  const totalRes = rows.reduce((s, r) => s + r.resultado, 0);
  const saldoFinal = rows[rows.length - 1]?.saldo ?? 0;
  tbody.innerHTML += `
    <tr class="total-row">
      <td colspan="8"><strong>ACUMULADO ${rows.length} MESES</strong></td>
      <td style="text-align:right"><strong style="color:${totalRes >= 0 ? '#68d391' : '#fc8181'}">${totalRes >= 0 ? '+' : ''}${escapeHtml(fmt(totalRes))}</strong></td>
      <td style="text-align:right"><strong style="color:${saldoFinal >= 0 ? '#68d391' : '#fc8181'}">${escapeHtml(fmt(saldoFinal))}</strong></td>
    </tr>`;
}

function updateProjecaoCharts(rows, itau, outros) {
  if (_chartSaldo)  { _chartSaldo.destroy();  _chartSaldo  = null; }
  if (_chartBarras) { _chartBarras.destroy(); _chartBarras = null; }
  if (_chartPizza)  { _chartPizza.destroy();  _chartPizza  = null; }

  const nMeses = rows.length;

  const cenOtim = calcProjecao(10000, 0, 2500, 800, nMeses);
  const cenReal = calcProjecao(7000, 0, 1800, 1000, nMeses);
  const cenPessim = calcProjecao(5000, 0, 2500, 1800, nMeses);

  const labHist = _historico.map(h => h.mes);
  const labFut = rows.map(r => r.mes);
  const allLabels = labHist.length ? [...labHist, ...labFut] : labFut;
  const nHist = _historico.length;
  const hasHistorico = nHist > 0;
  const ultimoSaldoHistorico = hasHistorico ? _historico[nHist - 1].saldo : _saldoAtual;
  const prefixLength = Math.max(nHist - 1, 0);

  const histData = hasHistorico
    ? [..._historico.map(h => h.saldo), ...Array(nMeses).fill(null)]
    : Array(nMeses).fill(null);
  const otimData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...cenOtim.map(r => r.saldo)]
    : cenOtim.map(r => r.saldo);
  const realData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...cenReal.map(r => r.saldo)]
    : cenReal.map(r => r.saldo);
  const pessData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...cenPessim.map(r => r.saldo)]
    : cenPessim.map(r => r.saldo);
  const customData = hasHistorico
    ? [...Array(prefixLength).fill(null), ultimoSaldoHistorico, ...rows.map(r => r.saldo)]
    : rows.map(r => r.saldo);

  _chartSaldo = new Chart(document.getElementById('chartProjecaoSaldo'), {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        { label: 'Histórico Real', data: histData, borderColor: '#63b3ed', backgroundColor: 'rgba(99,179,237,0.1)', tension: 0.3, fill: true, pointRadius: 5, borderWidth: 2 },
        { label: '🌟 Otimista', data: otimData, borderColor: '#68d391', borderDash: [6, 3], tension: 0.3, fill: false, pointRadius: 3, borderWidth: 2 },
        { label: '⚖️ Realista', data: realData, borderColor: '#f6e05e', borderDash: [6, 3], tension: 0.3, fill: false, pointRadius: 3, borderWidth: 2 },
        { label: '⚠️ Pessimista', data: pessData, borderColor: '#fc8181', borderDash: [6, 3], tension: 0.3, fill: false, pointRadius: 3, borderWidth: 2 },
        { label: '⚙️ Configurado', data: customData, borderColor: '#b794f4', tension: 0.3, fill: false, pointRadius: 4, borderWidth: 2.5 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#a0aec0', font: { size: 10 } }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(1) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  _chartBarras = new Chart(document.getElementById('chartProjecaoBarras'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.mes),
      datasets: [
        { label: 'Entradas', data: rows.map(r => r.entradas), backgroundColor: '#48bb78', borderRadius: 5 },
        { label: 'Total Saídas', data: rows.map(r => r.totalSaidas), backgroundColor: '#fc8181', borderRadius: 5 },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { ticks: { color: '#a0aec0', font: { size: 10 } }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  const firstMonth = rows[0]?.mes || '';
  const currentFixoItens = Object.entries(buildCurrentFixedComposition(firstMonth));
  const currentScr = rows[0]?.scrIncluido || 0;
  const pizzaLabels = [...currentFixoItens.map(([k]) => k), 'SCR incluído', 'Fatura Itaú', 'Outros variáveis'];
  const pizzaData = [...currentFixoItens.map(([, v]) => v), currentScr, itau, outros];
  const pizzaColors = ['#63b3ed','#68d391','#f6e05e','#b794f4','#fc8181','#f6ad55','#76e4f7','#fbb6ce','#a0aec0','#4fd1c5','#805ad5','#f6ad55'];

  _chartPizza = new Chart(document.getElementById('chartProjecaoPizza'), {
    type: 'doughnut',
    data: { labels: pizzaLabels, datasets: [{ data: pizzaData, backgroundColor: pizzaColors, borderWidth: 0 }] },
    options: {
      plugins: { legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 9.5 } } } },
      cutout: '55%',
    },
  });
}

function renderAlerta(rows, resultMes) {
  const el = document.getElementById('projecaoAlerta');
  if (!el) return;

  const zeraEm = rows.find(r => r.saldo <= 0);
  if (zeraEm) {
    el.innerHTML = `
      <div style="background:#4a1515;border:1px solid #fc8181;border-radius:10px;padding:14px 18px;font-size:0.9rem;color:#fc8181">
        🚨 <strong>Atenção:</strong> Com os parâmetros atuais, o saldo chegará a zero em <strong>${escapeHtml(zeraEm.mes)}</strong>.
        Seria necessário reduzir as saídas em <strong>${escapeHtml(fmt(Math.abs(resultMes)))}/mês</strong> ou aumentar a renda para atingir equilíbrio.
      </div>`;
  } else if (resultMes < 500) {
    el.innerHTML = `
      <div style="background:#3d2a00;border:1px solid #f6ad55;border-radius:10px;padding:14px 18px;font-size:0.9rem;color:#f6ad55">
        ⚠️ <strong>Margem baixa:</strong> O resultado do próximo mês é de apenas <strong>${escapeHtml(fmt(resultMes))}/mês</strong>. Qualquer despesa inesperada pode comprometer o saldo.
      </div>`;
  } else {
    el.innerHTML = `
      <div style="background:#1c4532;border:1px solid #68d391;border-radius:10px;padding:14px 18px;font-size:0.9rem;color:#68d391">
        ✅ <strong>Saldo estável:</strong> Com resultado de <strong>+${escapeHtml(fmt(resultMes))}/mês</strong>, o saldo tende a crescer nos próximos meses.
      </div>`;
  }

  if (_registratoInsights?.latest) {
    const latestLabel = _registratoInsights.latest.mesLabel || _registratoInsights.latest.mesRef;
    const totals = _scrProjectionModel?.totals || createEmptyScrModel().totals;
    el.innerHTML += `
      <div style="margin-top:12px;background:#1a2e4a;border:1px solid #2c5282;border-radius:10px;padding:14px 18px;font-size:0.88rem;color:#90cdf4">
        🏛️ <strong>Contexto do SCR (${escapeHtml(latestLabel)}):</strong>
        exposição ${escapeHtml(fmt(_registratoInsights.exposicaoTotal))} · vencida ${escapeHtml(fmt(_registratoInsights.dividaVencida))} · limite ${escapeHtml(fmt(_registratoInsights.limiteCredito))}.
        Na projeção, só entra automaticamente o bucket <strong>SCR incluído</strong>; hoje ele soma ${escapeHtml(fmt(totals.includedMonthlyTotal || 0))}/mês, com ${totals.conflictCount} conflito(s) e ${totals.contextualCount} item(ns) contextuais fora da matemática.
      </div>`;
  }
}

function buildCurrentFixedComposition(monthLabel) {
  const composition = {};
  for (const item of _despesasFixas) {
    const value = Number(item?.valor || 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (item?.parcelas && !isScheduledForMonth(item.parcelas, monthLabel)) continue;
    composition[item.desc] = value;
  }
  return composition;
}

function isScheduledForMonth(parcelas, monthLabel) {
  if (!parcelas || !parcelas.inicio || !parcelas.total) return false;
  const [ano, mes] = String(parcelas.inicio).split('-').map(Number);
  const [targetMesLabel, targetAnoLabel] = String(monthLabel || '').split('/');
  const targetMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].indexOf(targetMesLabel);
  const targetAno = Number(targetAnoLabel);
  if (mes < 1 || mes > 12 || targetMes < 0 || !ano || !targetAno) return false;

  const paid = Number(parcelas.pagas || 0);
  const total = Number(parcelas.total || 0);
  const diff = (targetAno - ano) * 12 + (targetMes - (mes - 1));
  const installmentNumber = diff + 1;
  if (installmentNumber < 1 || installmentNumber > total) return false;
  return installmentNumber > paid;
}

function resolveCommitmentBadge(status) {
  if (status === 'included') return { className: 'badge-purple', label: 'Incluído', border: '#805ad5' };
  if (status === 'conflict') return { className: 'badge-red', label: 'Conflito', border: '#fc8181' };
  return { className: 'badge-gray', label: 'Contextual', border: '#4a5568' };
}

function resolveCommitmentReason(reason) {
  if (reason === 'manual-conflict') return 'Conflito com item manual já cadastrado';
  if (reason === 'card-bucket-risk') return 'Risco de duplicar a fatura manual do cartão';
  if (reason === 'aggregated-only') return 'Sinal agregado do SCR sem vínculo confiável';
  if (reason === 'multiple-candidates') return 'Mais de um candidato plausível nas transações';
  if (reason === 'dismissed') return 'Item já revisado e dispensado antes';
  if (reason === 'matched-account-recurring') return 'Recorrência forte encontrada na conta';
  return 'Evidência ainda insuficiente para entrar no cálculo';
}

function resolveAutoEstimateAccent(id) {
  if (id === 'salario') return '#68d391';
  if (id === 'rendaExtra') return '#76e4f7';
  if (id === 'itau') return '#fc8181';
  return '#f6ad55';
}
