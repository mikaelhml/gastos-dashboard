import { getStoreCounts, getAll, clearAllImported, clearAllData } from '../db.js';
import { detectarLayoutProfile } from '../parsers/layout-profiles.js';
import { escapeHtml } from '../utils/dom.js';
import { exportConfig, importConfig } from '../utils/config-io.js';
import { buildEmptyStateViewModels } from '../utils/empty-states.js';
import { buildPrivacyAuditModel } from '../utils/privacy-audit.js';
import {
  applyFullBackupRestore,
  exportFullBackup,
  readFullBackup,
} from '../utils/full-backup-io.js';
import {
  buildImportResultViewModel,
  buildWarningsViewModel,
} from '../utils/import-feedback.js';

let _importando = false;
let _dropZoneBound = false;
let _configBound = false;
let _backupBound = false;
let _privacyAuditBound = false;

export async function buildImportar() {
  await refreshStatus();

  if (!_dropZoneBound) {
    _bindDropZone();
    _dropZoneBound = true;
  }

  if (!_configBound) {
    _bindConfigSection();
    _configBound = true;
  }

  if (!_backupBound) {
    _bindFullBackupSection();
    _backupBound = true;
  }

  if (!_privacyAuditBound) {
    _bindPrivacyAudit();
    _privacyAuditBound = true;
  }
}

function openFilePicker(fileInput) {
  if (!fileInput) return;

  fileInput.value = '';

  if (typeof fileInput.showPicker === 'function') {
    try {
      fileInput.showPicker();
      return;
    } catch {
      // Fallback para browsers que expõem showPicker mas bloqueiam a chamada.
    }
  }

  fileInput.focus({ preventScroll: true });
  fileInput.click();
}

async function refreshStatus() {
  const [counts, pdfHistory, storageEstimate] = await Promise.all([
    getStoreCounts(),
    getAll('pdfs_importados'),
    getStorageEstimate(),
  ]);
  const grid = document.getElementById('dbStatusGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="db-status-card">
        <div class="ds-label">Transações</div>
        <div class="ds-count">${counts.transacoes}</div>
        <div class="ds-sub">Extrato conta</div>
      </div>
      <div class="db-status-card">
        <div class="ds-label">Lançamentos</div>
        <div class="ds-count">${counts.lancamentos}</div>
        <div class="ds-sub">Fatura cartão</div>
      </div>
      <div class="db-status-card">
        <div class="ds-label">Assinaturas</div>
        <div class="ds-count">${counts.assinaturas}</div>
        <div class="ds-sub">Recorrentes</div>
      </div>
      <div class="db-status-card">
        <div class="ds-label">Despesas Fixas</div>
        <div class="ds-count">${counts.despesas}</div>
        <div class="ds-sub">Mensais fixas</div>
      </div>
      <div class="db-status-card">
        <div class="ds-label">PDFs</div>
        <div class="ds-count">${counts.pdfs}</div>
        <div class="ds-sub">Arquivos importados</div>
      </div>
      <div class="db-status-card">
        <div class="ds-label">Registrato</div>
        <div class="ds-count">${counts.registratoMeses}</div>
        <div class="ds-sub">Meses SCR</div>
      </div>`;
  }

  renderImportFirstStep(buildEmptyStateViewModels({
    importedTransactionCount: Number(counts.transacoes || 0) + Number(counts.lancamentos || 0) + Number(counts.registratoMeses || 0) + Number(counts.pdfs || 0),
    manualSubscriptionCount: Number(counts.assinaturas || 0),
    manualFixedExpenseCount: Number(counts.despesas || 0),
  }).import);

  renderPrivacyAudit(buildPrivacyAuditModel({
    counts,
    pdfHistory,
    storageEstimate,
  }));
}

function renderImportFirstStep(model) {
  const host = document.getElementById('importarFirstStepState');
  if (!host) return;

  if (!model?.shouldRender) {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }

  host.innerHTML = `
    <div class="guided-empty-state guided-empty-state--compact">
      <div class="guided-empty-state-header">
        <div>
          <h3>${escapeHtml(model.title || '')}</h3>
          <p>${escapeHtml(model.body || '')}</p>
        </div>
        <div class="guided-empty-state-badge">Comece aqui</div>
      </div>
      <div class="guided-empty-state-actions">
        ${(model.actions || []).map(action => `
          <button
            type="button"
            class="${action.intent === 'importar' ? 'btn-primary' : 'btn-inline-secondary'}"
            data-import-first-step-intent="${escapeHtml(action.intent)}"
            data-import-first-step-tab="${escapeHtml(action.tab)}"
          >${escapeHtml(action.label)}</button>
        `).join('')}
      </div>
    </div>`;
  host.style.display = '';

  host.querySelectorAll('[data-import-first-step-intent]').forEach(button => {
    button.addEventListener('click', () => {
      const intent = button.getAttribute('data-import-first-step-intent');
      const tab = button.getAttribute('data-import-first-step-tab');

      if (intent === 'importar') {
        document.getElementById('dropZoneButton')?.click();
        return;
      }
      if (intent === 'restaurar-backup') {
        document.getElementById('fullBackupImportBtn')?.click();
        return;
      }
      if (tab) {
        window.switchTab?.(null, tab);
      }
    });
  });
}

function _bindConfigSection() {
  const exportButton = document.getElementById('configExportBtn');
  const importButton = document.getElementById('configImportBtn');
  const fileInput = document.getElementById('configFileInput');

  if (!exportButton || !importButton || !fileInput) return;

  exportButton.addEventListener('click', async () => {
    _renderConfigResult('', '');
    try {
      const resultado = await exportConfig();
      _renderConfigResult(
        'success',
        `Configuracao manual exportada com sucesso${resultado?.nomeArquivo ? ` (${resultado.nomeArquivo})` : ''}.`,
      );
    } catch (error) {
      _renderConfigResult('error', error instanceof Error ? error.message : 'Falha ao exportar configuracao.');
    }
  });

  importButton.addEventListener('click', () => {
    openFilePicker(fileInput);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const resultado = await importConfig(file);
    fileInput.value = '';

    if (resultado.erro) {
      _renderConfigResult('error', resultado.erro);
      return;
    }

    await refreshStatus();
    await window.refreshDashboard?.();

    _renderConfigResult(
      'success',
      `${resultado.importados} item(ns) importado(s) em modo ${resultado.modo}.`,
    );
  });
}

function _bindPrivacyAudit() {
  const dialog = document.getElementById('privacyAuditDialog');
  const openButton = document.getElementById('privacyAuditOpenBtn');
  const closeButton = document.getElementById('privacyAuditCloseBtn');

  if (!dialog || !openButton || !closeButton) return;

  const close = () => {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  };

  openButton.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') {
      if (dialog.open) return;
      dialog.showModal();
      return;
    }

    dialog.setAttribute('open', 'open');
  });

  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
}

function _bindFullBackupSection() {
  const exportButton = document.getElementById('fullBackupExportBtn');
  const importButton = document.getElementById('fullBackupImportBtn');
  const fileInput = document.getElementById('fullBackupFileInput');

  if (!exportButton || !importButton || !fileInput) return;

  exportButton.addEventListener('click', async () => {
    _renderFullBackupResult('', '');
    try {
      const resultado = await exportFullBackup();
      _renderFullBackupResult(
        'success',
        `Backup completo exportado com sucesso (${resultado.nomeArquivo}) com ${resultado.totalRegistros} registro(s) em ${resultado.stores} store(s).`,
      );
    } catch (error) {
      _renderFullBackupResult('error', error instanceof Error ? error.message : 'Falha ao exportar backup completo.');
    }
  });

  importButton.addEventListener('click', () => {
    openFilePicker(fileInput);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const preview = await readFullBackup(file);
      const { totalRegistros, stores } = preview.resumo;
      const ok = confirm(
        '⚠️ Restaurar backup completo?\n\n' +
        `Arquivo: ${file.name}\n` +
        `Stores: ${stores}\n` +
        `Registros: ${totalRegistros}\n\n` +
        'Essa acao substitui toda a base local atual.',
      );

      if (!ok) {
        _renderFullBackupResult('info', 'Restauracao cancelada antes de alterar a base local.');
        fileInput.value = '';
        return;
      }

      const resultado = await applyFullBackupRestore(preview.payload);
      await refreshStatus();
      await window.refreshDashboard?.();
      _renderFullBackupResult(
        'success',
        `Backup completo restaurado com sucesso. ${resultado.totalRegistros} registro(s) reaplicado(s) em ${resultado.stores} store(s).`,
      );
    } catch (error) {
      _renderFullBackupResult('error', error instanceof Error ? error.message : 'Falha ao restaurar backup completo.');
    } finally {
      fileInput.value = '';
    }
  });
}

function _bindDropZone() {
  const zone = document.getElementById('dropZone');
  const input = document.getElementById('pdfFileInput');
  const button = document.getElementById('dropZoneButton');
  if (!zone || !input || !button) return;

  zone.addEventListener('click', () => {
    if (!_importando) openFilePicker(input);
  });

  button.addEventListener('click', event => {
    event.stopPropagation();
    if (!_importando) openFilePicker(input);
  });

  zone.addEventListener('keydown', event => {
    if (_importando) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker(input);
    }
  });

  zone.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('drag-over');
    const files = [...event.dataTransfer.files].filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (files.length > 0) _processarArquivos(files);
  });

  input.addEventListener('change', () => {
    const files = [...input.files];
    if (files.length > 0) _processarArquivos(files);
    input.value = '';
  });
}

async function _processarArquivos(files) {
  if (_importando) return;

  _importando = true;
  setImportingState(true);

  const logEl = document.getElementById('importLog');
  if (logEl) logEl.innerHTML = '';
  setImportSummary(`Processando ${files.length} arquivo(s)...`, '');

  let importados = 0;
  for (const file of files) {
    const ok = await _importarUmArquivo(file);
    if (ok) importados++;
  }

  await refreshStatus();
  await window.refreshDashboard?.();

  _importando = false;
  setImportingState(false);
  setImportSummary(
    importados > 0
      ? `${importados} arquivo(s) importado(s) com sucesso. O dashboard ja foi atualizado.`
      : 'Nenhum arquivo novo foi importado.',
    importados > 0 ? 'success' : '',
  );
}

async function _importarUmArquivo(file) {
  const progressId = `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const logEl = document.getElementById('importLog');

  if (logEl) {
    logEl.insertAdjacentHTML('beforeend', `
      <div class="import-result-card" id="${progressId}">
        <div class="irc-header">
          <span class="irc-icon">⏳</span>
          <span class="irc-nome">${escapeHtml(file.name)}</span>
          <span class="badge badge-blue" id="${progressId}_tipo">Detectando tipo...</span>
          <span class="irc-status" style="color:#a0aec0">Processando...</span>
        </div>
        <div class="import-progress-wrap">
          <div class="import-progress-bar" id="${progressId}_bar" style="width:5%"></div>
        </div>
        <div class="irc-detail" id="${progressId}_detail" style="color:#718096;font-size:0.83rem;margin-top:8px">
          Lendo arquivo...
        </div>
        <div class="irc-meta" id="${progressId}_meta"></div>
        <div class="irc-warnings" id="${progressId}_warnings"></div>
      </div>`);
  }

  const setProgress = (pct, msg) => {
    const bar = document.getElementById(`${progressId}_bar`);
    const detail = document.getElementById(`${progressId}_detail`);
    if (bar) bar.style.width = `${pct}%`;
    if (detail) detail.textContent = msg || '';
  };

  const renderFinalCard = (viewModel, detailText, warningsModel) => {
    const card = document.getElementById(progressId);
    const iconEl = card?.querySelector('.irc-icon');
    const statusEl = card?.querySelector('.irc-status');
    const detailEl = card?.querySelector('.irc-detail');
    const progressWrap = card?.querySelector('.import-progress-wrap');
    const metaEl = document.getElementById(`${progressId}_meta`);
    const warningsEl = document.getElementById(`${progressId}_warnings`);

    if (iconEl) iconEl.textContent = viewModel.icon;
    if (statusEl) {
      statusEl.textContent = viewModel.statusText;
      statusEl.style.color = viewModel.color;
    }
    if (detailEl) {
      detailEl.textContent = detailText;
      detailEl.style.color = '#a0aec0';
    }
    if (progressWrap) progressWrap.style.display = 'none';

    if (metaEl) {
      metaEl.innerHTML = viewModel.qualityLabel
        ? `<span class="import-quality-badge ${viewModel.qualityTone}">${escapeHtml(viewModel.qualityLabel)}</span>`
        : '';
    }

    if (warningsEl) {
      warningsEl.innerHTML = renderWarningsMarkup(warningsModel);
    }
  };

  try {
    const profile = await detectarLayoutProfile(file);
    const tipo = profile?.id || null;
    const tipoLabel = profile?.label || null;
    const tipoEl = document.getElementById(`${progressId}_tipo`);

    if (tipoEl) {
      tipoEl.textContent = tipoLabel || 'Tipo nao reconhecido';
      tipoEl.className = `badge ${profile?.badgeClass || 'badge-gray'}`;
    }

    if (!profile) {
      renderFinalCard(
        buildImportResultViewModel({
          tipoLabel: 'PDF',
          resultado: { erro: 'Tipo nao reconhecido.' },
          unitLabel: 'item',
        }),
        'Nao foi possivel identificar o layout do PDF. Adicione um novo perfil para esse emissor/modelo.',
        buildWarningsViewModel([]),
      );
      return false;
    }

    setProgress(5, `Calculando hash (${tipoLabel})...`);

    const resultado = await profile.importer(file, pct => {
      const msgs = getProgressMessages(tipo, tipoLabel);
      setProgress(pct, msgs[pct] || `Processando... ${pct}%`);
    });

    const unitLabel = tipo === 'registrato-scr' ? 'registro' : 'transação';
    const viewModel = buildImportResultViewModel({
      tipoLabel,
      resultado,
      unitLabel,
    });

    renderFinalCard(
      viewModel,
      buildResultDetail(tipo, tipoLabel, resultado),
      buildWarningsViewModel(resultado.warnings || []),
    );

    return !resultado.duplicata && !resultado.erro;
  } catch (error) {
    renderFinalCard(
      buildImportResultViewModel({
        tipoLabel: 'Importacao',
        resultado: { erro: error instanceof Error ? error.message : 'Erro desconhecido.' },
        unitLabel: 'item',
      }),
      error instanceof Error ? error.message : 'Erro desconhecido.',
      buildWarningsViewModel([]),
    );
    console.error('[importar]', error);
    return false;
  }
}

function buildResultDetail(tipo, tipoLabel, resultado) {
  if (resultado.duplicata) {
    return 'Este PDF ja foi importado anteriormente. Nenhum dado foi adicionado.';
  }

  if (resultado.erro) {
    return resultado.erro + (resultado.debug
      ? ' Amostra do texto extraido foi impressa no console (F12 -> Console).'
      : '');
  }

  if (tipo === 'registrato-scr') {
    return `Periodo: ${resultado.mes} — ${resultado.paginas ?? '—'} pagina(s) lida(s) e ${resultado.snapshots ?? '—'} snapshot(s) consolidados.`;
  }

  return `${tipoLabel}: periodo ${resultado.mes} salvo com sucesso.`;
}

function renderWarningsMarkup(viewModel) {
  if (!viewModel.hasWarnings) {
    return `<div class="import-warning-empty">${escapeHtml(viewModel.emptyLabel)}</div>`;
  }

  const itemsHtml = viewModel.items
    .map(item => `
      <li class="import-warning-item">
        <span class="import-warning-level is-${item.level}">${escapeHtml(item.levelLabel)}</span>
        <div class="import-warning-copy">
          <div>${escapeHtml(item.message)}</div>
          ${item.sample ? `<div class="import-warning-sample">${escapeHtml(item.sample)}</div>` : ''}
        </div>
      </li>`)
    .join('');

  const overflowHtml = viewModel.overflowCount > 0
    ? `<div class="import-warning-overflow">+${viewModel.overflowCount} aviso(s) adicional(is)</div>`
    : '';

  return `
    <details class="import-warning-panel">
      <summary>${escapeHtml(viewModel.summaryLabel)}</summary>
      <ul class="import-warning-list">${itemsHtml}</ul>
      ${overflowHtml}
    </details>`;
}

function getProgressMessages(tipo, tipoLabel) {
  if (tipo === 'registrato-scr') {
    return {
      5: `Calculando hash (${tipoLabel})...`,
      10: 'Verificando duplicatas...',
      20: 'Lendo cabecalho do Registrato...',
      30: 'Carregando PDF.js...',
      55: 'Separando blocos mensais do SCR...',
      75: 'Persistindo snapshots do Registrato...',
      85: 'Registrando arquivo importado...',
      100: 'Concluido!',
    };
  }

  return {
    5: `Calculando hash (${tipoLabel})...`,
    10: 'Verificando duplicatas...',
    20: tipo === 'nubank-conta' ? 'Extraindo periodo do arquivo...' : 'Identificando cabecalho do layout...',
    30: 'Carregando PDF.js...',
    65: 'Processando estrutura do PDF...',
    75: tipo === 'nubank-conta' ? 'Parseando transacoes...' : 'Parseando lancamentos...',
    85: 'Salvando no banco local...',
    100: 'Concluido!',
  };
}

export async function clearBase() {
  const ok = confirm(
    '⚠️ Apagar todos os dados importados?\n\n' +
    'Serao removidos:\n' +
    '  • Todas as transacoes do extrato\n' +
    '  • Todos os lancamentos de fatura\n' +
    '  • Registro de PDFs importados\n\n' +
     'Serao MANTIDOS:\n' +
     '  • Assinaturas\n' +
     '  • Despesas fixas\n' +
     '  • Parametros salvos da projecao\n' +
     '  • Regras de categorizacao\n' +
     '  • Correcoes lembradas de categoria',
  );
  if (!ok) return;

  await clearAllImported();
  location.reload();
}

export async function clearAllDashboardData() {
  const ok = confirm(
    '⚠️ Apagar a base completa?\n\n' +
    'Serao removidos:\n' +
    '  • Todas as transacoes do extrato\n' +
    '  • Todos os lancamentos de fatura\n' +
    '  • Registro de PDFs importados\n' +
     '  • Assinaturas\n' +
     '  • Despesas fixas\n' +
     '  • Observacoes\n' +
     '  • Orcamentos\n' +
     '  • Parametros salvos da projecao\n' +
     '  • Regras de categorizacao\n' +
     '  • Correcoes lembradas de categoria\n\n' +
    'Essa acao nao pode ser desfeita.',
  );
  if (!ok) return;

  await clearAllData();
  location.reload();
}

function _renderConfigResult(type, message) {
  const resultEl = document.getElementById('configIoResult');
  if (!resultEl) return;

  resultEl.className = `inline-form-feedback${type ? ` is-${type}` : ''}`;
  resultEl.textContent = message;
}

function _renderFullBackupResult(type, message) {
  const resultEl = document.getElementById('fullBackupIoResult');
  if (!resultEl) return;

  resultEl.className = `inline-form-feedback${type ? ` is-${type}` : ''}`;
  resultEl.textContent = message;
}

function setImportingState(importando) {
  const zone = document.getElementById('dropZone');
  const button = document.getElementById('dropZoneButton');
  if (zone) {
    zone.classList.toggle('is-disabled', importando);
    zone.setAttribute('aria-busy', importando ? 'true' : 'false');
  }
  if (button) {
    button.disabled = importando;
    button.textContent = importando ? '⏳ Importando...' : '📂 Selecionar PDF';
  }
}

function setImportSummary(message, type) {
  const summary = document.getElementById('importSummary');
  if (!summary) return;
  summary.textContent = message || '';
  summary.className = `inline-form-feedback${type ? ` is-${type}` : ''}`;
}

async function getStorageEstimate() {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
      return null;
    }

    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

function renderPrivacyAudit(model) {
  const summaryEl = document.getElementById('privacyAuditSummary');
  const dialogBody = document.getElementById('privacyAuditDialogBody');
  if (!summaryEl || !dialogBody) return;

  const latestSource = [...model.importSources]
    .filter(source => source.lastImportIso)
    .sort((a, b) => Date.parse(b.lastImportIso) - Date.parse(a.lastImportIso))[0] || null;
  const sourcePreview = model.importSources
    .slice(0, 3)
    .map(source => `<li>${escapeHtml(source.label)} · ${escapeHtml(source.lastImportLabel)}</li>`)
    .join('');

  summaryEl.innerHTML = `
    <div class="privacy-audit-summary-grid">
      <div class="privacy-audit-stat">
        <div class="privacy-audit-stat-label">Registros locais</div>
        <div class="privacy-audit-stat-value">${model.totalLocalRecords}</div>
        <div class="privacy-audit-stat-sub">Somando stores exibidas nesta auditoria</div>
      </div>
      <div class="privacy-audit-stat">
        <div class="privacy-audit-stat-label">Armazenamento</div>
        <div class="privacy-audit-stat-value">${escapeHtml(model.storage.available ? 'Estimado' : 'Indisponível')}</div>
        <div class="privacy-audit-stat-sub">${escapeHtml(model.storage.summary)}</div>
      </div>
      <div class="privacy-audit-stat">
        <div class="privacy-audit-stat-label">Última origem auditada</div>
        <div class="privacy-audit-stat-value">${escapeHtml(latestSource?.label || 'Nenhum PDF ainda')}</div>
        <div class="privacy-audit-stat-sub">${escapeHtml(latestSource?.lastImportLabel || 'Importe um PDF para ver a linha do tempo local')}</div>
      </div>
    </div>
    <div class="privacy-audit-summary-note">
      ${escapeHtml(model.privacyCopy[0])}
    </div>
    <ul class="privacy-audit-mini-list">
      ${sourcePreview || '<li>Nenhum PDF financeiro importado ainda.</li>'}
    </ul>`;

  dialogBody.innerHTML = `
    <div class="modal-grid">
      ${model.counts.map(item => `
        <div class="privacy-audit-card">
          <div class="privacy-audit-card-label">${escapeHtml(item.label)}</div>
          <div class="privacy-audit-card-value">${item.count}</div>
          <div class="privacy-audit-card-sub">${escapeHtml(item.detail)}</div>
        </div>`).join('')}
    </div>

    <div class="privacy-audit-section">
      <div class="privacy-audit-section-title">Armazenamento no navegador</div>
      <div class="privacy-audit-section-body">
        <strong>${escapeHtml(model.storage.summary)}</strong><br>
        <span>${escapeHtml(model.storage.detail)}</span>
      </div>
    </div>

    <div class="privacy-audit-section">
      <div class="privacy-audit-section-title">Últimas importações por origem</div>
      <div class="privacy-audit-section-body">
        ${model.importSources.length
          ? `<ul class="privacy-audit-source-list">
              ${model.importSources.map(source => `
                <li class="privacy-audit-source-item">
                  <div>
                    <strong>${escapeHtml(source.label)}</strong>
                    <div class="privacy-audit-source-meta">${source.importCount} importação(ões) locais</div>
                  </div>
                  <span>${escapeHtml(source.lastImportLabel)}</span>
                </li>`).join('')}
            </ul>`
          : '<div class="privacy-audit-empty">Nenhum PDF financeiro importado ainda nesta base local.</div>'}
      </div>
    </div>

    <div class="privacy-audit-section">
      <div class="privacy-audit-section-title">O que é verdade hoje sobre privacidade</div>
      <div class="privacy-audit-section-body">
        <ul class="privacy-audit-copy-list">
          ${model.privacyCopy.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    </div>`;
}
