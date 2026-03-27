import { fmt } from '../utils/formatters.js';
import { escapeHtml } from '../utils/dom.js';

export function buildRegistrato(registratoResumos = [], registratoSnapshots = [], registratoSuggestions = [], registratoInsights = null) {
  const root = document.getElementById('registratoRoot');
  if (!root) return;

  const monthHistory = registratoResumos.slice().sort(compareByMesRef);
  const latest = registratoInsights?.latest || monthHistory.at(-1) || null;

  if (!latest) {
    root.innerHTML = `
      <div class="empty-state">
        <strong>Nenhum dado do Registrato importado ainda</strong>
        Importe um PDF do SCR na aba <code>📥 Importar</code> para visualizar histórico mensal, instituições detectadas e sugestões derivadas.
        <div style="margin-top:14px">
          <button type="button" class="btn-primary" onclick="switchTab(null, 'importar')">Ir para Importar</button>
        </div>
      </div>`;
    return;
  }

  const instituicoes = buildInstitutionSummary(registratoSnapshots);
  const latestMonthSnapshots = registratoSnapshots
    .filter(item => item?.mesRef === latest.mesRef)
    .sort((a, b) => calcExposure(b) - calcExposure(a));
  const latestOperations = latestMonthSnapshots
    .flatMap(snapshot => (snapshot.operacoes || []).map(operacao => ({ snapshot, operacao })))
    .sort((a, b) => calcExposure(b.operacao) - calcExposure(a.operacao))
    .slice(0, 12);

  const totalInstituicoes = instituicoes.length;
  const totalOperacoes = monthHistory.reduce((sum, item) => sum + Number(item?.totalOperacoes || 0), 0);
  const periodo = `${monthHistory[0]?.mesRef || latest.mesRef} - ${monthHistory.at(-1)?.mesRef || latest.mesRef}`;

  root.innerHTML = `
    <div class="summary-bar">
      <div class="sb-item"><span class="sb-label">Período:</span><span class="sb-value">${escapeHtml(periodo)}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Meses importados:</span><span class="sb-value">${monthHistory.length}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Instituições detectadas:</span><span class="sb-value">${totalInstituicoes || '—'}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Sugestões pendentes:</span><span class="sb-value">${registratoSuggestions.length}</span></div>
      <div class="divider"></div>
      <div class="sb-item"><span class="sb-label">Última competência:</span><span class="sb-value">${escapeHtml(latest.mesLabel || latest.mesRef)}</span></div>
    </div>

    <div class="cards">
      ${renderCard('Exposição total no SCR', fmt(calcExposure(latest)), 'Em dia + vencida + outros compromissos', '#63b3ed')}
      ${renderCard('Dívida vencida', fmt(Number(latest?.vencida || 0)), 'Pede atenção imediata', '#fc8181')}
      ${renderCard('Limites de crédito', fmt(Number(latest?.limite || 0)), 'Limites reportados no mês mais recente', '#f6ad55')}
      ${renderCard('Crédito a liberar', fmt(Number(latest?.creditoALiberar || 0)), 'Valores ainda não totalmente desembolsados', '#76e4f7')}
      ${renderCard('Coobrigações', fmt(Number(latest?.coobrigacoes || 0)), 'Compromissos indiretos informados no SCR', '#b794f4')}
      ${renderCard('Operações mapeadas', String(totalOperacoes), 'Soma das operações detectadas nos meses importados', '#68d391')}
    </div>

    <div class="chart-grid" style="margin-bottom:24px">
      <div class="chart-box">
        <h3>Histórico mensal de exposição</h3>
        ${renderMonthlyBars(monthHistory)}
      </div>
      <div class="chart-box">
        <h3>Exposição por instituição (último registro conhecido)</h3>
        ${renderInstitutionBars(instituicoes)}
      </div>
    </div>

    <div class="section-title">💡 Sugestões pendentes do Registrato</div>
    ${renderSuggestionsSummary(registratoSuggestions)}

    <div class="section-title">🏦 Instituições detectadas</div>
    <div class="table-wrap" style="margin-bottom:24px">
      <table>
        <thead>
          <tr>
            <th>Instituição</th>
            <th style="text-align:right">Última exposição</th>
            <th style="text-align:right">Vencida</th>
            <th style="text-align:right">Meses</th>
            <th style="text-align:right">Operações</th>
          </tr>
        </thead>
        <tbody>${renderInstitutionsTable(instituicoes)}</tbody>
      </table>
    </div>

    <div class="section-title">🗓️ Histórico mensal do SCR</div>
    <div class="table-wrap" style="margin-bottom:24px">
      <table>
        <thead>
          <tr>
            <th>Mês</th>
            <th style="text-align:right">Em dia</th>
            <th style="text-align:right">Vencida</th>
            <th style="text-align:right">Outros compromissos</th>
            <th style="text-align:right">Limite</th>
            <th style="text-align:right">Instituições</th>
            <th style="text-align:right">Operações</th>
          </tr>
        </thead>
        <tbody>${renderMonthTable(monthHistory)}</tbody>
      </table>
    </div>

    <div class="section-title">🔎 Operações detalhadas do último mês</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Instituição</th>
            <th>Categoria</th>
            <th>Subtipo</th>
            <th style="text-align:right">Em dia</th>
            <th style="text-align:right">Vencida</th>
            <th style="text-align:right">Outros</th>
          </tr>
        </thead>
        <tbody>${renderOperationsTable(latestOperations, latestMonthSnapshots)}</tbody>
      </table>
    </div>`;
}

function renderCard(label, value, sub, accent) {
  return `
    <div class="card" style="--accent:${accent}">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      <div class="sub">${escapeHtml(sub)}</div>
    </div>`;
}

function renderMonthlyBars(monthHistory) {
  if (!monthHistory.length) {
    return `<div class="empty-state" style="padding:20px">Sem histórico mensal consolidado.</div>`;
  }

  const max = Math.max(...monthHistory.map(calcExposure), 1);
  return `
    <div class="registrato-mini-list">
      ${monthHistory.slice(-12).map(item => {
        const exposure = calcExposure(item);
        const width = Math.max((exposure / max) * 100, exposure > 0 ? 6 : 0);
        return `
          <div class="registrato-mini-item">
            <div class="registrato-mini-row">
              <span class="registrato-mini-label">${escapeHtml(item.mesLabel || item.mesRef)}</span>
              <strong>${escapeHtml(fmt(exposure))}</strong>
            </div>
            <div class="registrato-mini-bar"><div class="registrato-mini-fill" style="width:${width}%;background:#63b3ed"></div></div>
            <div class="registrato-mini-meta">
              <span>Vencida ${escapeHtml(fmt(Number(item?.vencida || 0)))}</span>
              <span>Limite ${escapeHtml(fmt(Number(item?.limite || 0)))}</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderInstitutionBars(instituicoes) {
  if (!instituicoes.length) {
    return `
      <div class="empty-state" style="padding:20px">
        <strong>Sem detalhamento por instituição</strong>
        O PDF foi importado, mas este layout ainda está vindo de forma mais consolidada.
      </div>`;
  }

  const top = instituicoes.slice(0, 8);
  const max = Math.max(...top.map(item => item.latestExposure), 1);
  return `
    <div class="registrato-mini-list">
      ${top.map(item => {
        const width = Math.max((item.latestExposure / max) * 100, item.latestExposure > 0 ? 6 : 0);
        return `
          <div class="registrato-mini-item">
            <div class="registrato-mini-row">
              <span class="registrato-mini-label">${escapeHtml(item.instituicao)}</span>
              <strong>${escapeHtml(fmt(item.latestExposure))}</strong>
            </div>
            <div class="registrato-mini-bar"><div class="registrato-mini-fill" style="width:${width}%;background:#f6ad55"></div></div>
            <div class="registrato-mini-meta">
              <span>${item.meses.length} mes(es)</span>
              <span>${item.totalOperacoes} operação(ões)</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderSuggestionsSummary(suggestions) {
  if (!suggestions.length) {
    return `
      <div class="empty-state" style="margin-bottom:24px">
        <strong>Nenhuma sugestão pendente</strong>
        O motor do Registrato não encontrou novos candidatos ou eles já foram resolvidos.
      </div>`;
  }

  return `
    <div class="helper-panel" style="margin-bottom:24px">
      <div class="helper-panel-header">
        <div>
          <h3>Fila de revisão</h3>
          <p>As ações de aceitar ou dispensar continuam centralizadas na aba <code>📋 Despesas & Parcelas</code>.</p>
        </div>
        <button type="button" class="btn-inline-secondary" onclick="switchTab(null, 'despesas')">Abrir sugestões</button>
      </div>
      <div class="sub-grid">
        ${suggestions.slice(0, 6).map(item => `
          <div class="sub-card registrato-suggestion-card" style="--sub-accent:${resolveSuggestionColor(item.tipo)}">
            <div class="sub-card-top">
              <div class="sub-icon">${resolveSuggestionIcon(item.tipo)}</div>
              <div class="sub-info">
                <div class="sub-name">${escapeHtml(item.nome)}</div>
                <div class="sub-cat">${escapeHtml(item.cat || 'Financeiro')}</div>
              </div>
              <div class="sub-value">${escapeHtml(fmt(item.valor))}</div>
            </div>
            <div class="assinatura-suggestion-evidence">
              <div style="font-size:0.82rem;color:#a0aec0;line-height:1.6">${escapeHtml(item.justificativa || '')}</div>
              <div class="helper-badges">
                <span class="badge ${confidenceBadge(item.confianca)}">${escapeHtml(item.confianca || 'baixa')}</span>
                <span class="badge badge-blue">${escapeHtml(item.origem || 'Registrato')}</span>
                ${item.institutionLabel ? `<span class="badge badge-purple">${escapeHtml(item.institutionLabel)}</span>` : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderInstitutionsTable(instituicoes) {
  if (!instituicoes.length) {
    return `<tr><td colspan="5" style="color:#718096">Sem granularidade suficiente por instituição neste PDF.</td></tr>`;
  }

  return instituicoes.map(item => `
    <tr>
      <td>${escapeHtml(item.instituicao)}</td>
      <td style="text-align:right">${escapeHtml(fmt(item.latestExposure))}</td>
      <td style="text-align:right">${escapeHtml(fmt(item.latestVencida))}</td>
      <td style="text-align:right">${item.meses.length}</td>
      <td style="text-align:right">${item.totalOperacoes}</td>
    </tr>`).join('');
}

function renderMonthTable(monthHistory) {
  return monthHistory
    .slice()
    .reverse()
    .map(item => `
      <tr>
        <td>${escapeHtml(item.mesLabel || item.mesRef)}</td>
        <td style="text-align:right">${escapeHtml(fmt(Number(item?.emDia || 0)))}</td>
        <td style="text-align:right">${escapeHtml(fmt(Number(item?.vencida || 0)))}</td>
        <td style="text-align:right">${escapeHtml(fmt(Number(item?.outrosCompromissos || 0)))}</td>
        <td style="text-align:right">${escapeHtml(fmt(Number(item?.limite || 0)))}</td>
        <td style="text-align:right">${Number(item?.totalInstituicoes || 0)}</td>
        <td style="text-align:right">${Number(item?.totalOperacoes || 0)}</td>
      </tr>`)
    .join('');
}

function renderOperationsTable(latestOperations, latestMonthSnapshots) {
  if (!latestMonthSnapshots.length) {
    return `<tr><td colspan="6" style="color:#718096">Nenhum snapshot do mês mais recente foi encontrado.</td></tr>`;
  }

  if (!latestOperations.length) {
    return `<tr><td colspan="6" style="color:#718096">O mês mais recente foi importado de forma consolidada, sem operações detalhadas por instituição.</td></tr>`;
  }

  return latestOperations.map(({ snapshot, operacao }) => `
    <tr>
      <td>${escapeHtml(snapshot.instituicao || '—')}</td>
      <td>${escapeHtml(operacao.categoria || '—')}</td>
      <td>${escapeHtml(operacao.subtipo || '—')}</td>
      <td style="text-align:right">${escapeHtml(fmt(Number(operacao?.emDia || 0)))}</td>
      <td style="text-align:right">${escapeHtml(fmt(Number(operacao?.vencida || 0)))}</td>
      <td style="text-align:right">${escapeHtml(fmt(Number(operacao?.outrosCompromissos || 0)))}</td>
    </tr>`).join('');
}

function buildInstitutionSummary(snapshots) {
  const groups = new Map();

  for (const snapshot of snapshots || []) {
    const instituicao = String(snapshot?.instituicao || '').trim();
    if (!instituicao || instituicao === 'CONSOLIDADO SCR') continue;

    if (!groups.has(instituicao)) {
      groups.set(instituicao, {
        instituicao,
        meses: new Set(),
        totalOperacoes: 0,
        latestMesRef: '',
        latestExposure: 0,
        latestVencida: 0,
      });
    }

    const group = groups.get(instituicao);
    const mesRef = String(snapshot?.mesRef || '');
    const exposure = calcExposure(snapshot);

    if (mesRef) group.meses.add(mesRef);
    group.totalOperacoes += Number(snapshot?.totalOperacoes || 0);

    if (!group.latestMesRef || compareMesRef(snapshot, { mesRef: group.latestMesRef }) > 0) {
      group.latestMesRef = mesRef;
      group.latestExposure = exposure;
      group.latestVencida = Number(snapshot?.vencida || 0);
    }
  }

  return [...groups.values()]
    .map(item => ({ ...item, meses: [...item.meses].sort(compareByMesRefValue) }))
    .sort((a, b) => b.latestExposure - a.latestExposure);
}

function calcExposure(item) {
  return Number(item?.emDia || 0) + Number(item?.vencida || 0) + Number(item?.outrosCompromissos || 0);
}

function compareByMesRef(a, b) {
  return compareByMesRefValue(a?.mesRef || '', b?.mesRef || '');
}

function compareByMesRefValue(a, b) {
  return mesRefToSort(a) - mesRefToSort(b);
}

function compareMesRef(a, b) {
  return compareByMesRefValue(a?.mesRef || '', b?.mesRef || '');
}

function mesRefToSort(value) {
  const [mes, ano] = String(value || '').split('/');
  return (Number(ano || 0) * 100) + Number(mes || 0);
}

function resolveSuggestionIcon(tipo) {
  if (tipo === 'financiamento') return '🏦';
  if (tipo === 'parcelamento') return '📦';
  return '📋';
}

function resolveSuggestionColor(tipo) {
  if (tipo === 'financiamento') return '#63b3ed';
  if (tipo === 'parcelamento') return '#f6ad55';
  return '#68d391';
}

function confidenceBadge(value) {
  if (value === 'alta') return 'badge-green';
  if (value === 'media') return 'badge-yellow';
  return 'badge-gray';
}
