import { getStoreCounts, clearAllImported, clearAllData } from '../db.js';
import { detectarLayoutProfile } from '../parsers/layout-profiles.js';
import { escapeHtml } from '../utils/dom.js';
import { exportConfig, importConfig } from '../utils/config-io.js';
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
}

async function refreshStatus() {
  const counts = await getStoreCounts();
  const grid = document.getElementById('dbStatusGrid');
  if (!grid) return;

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
    fileInput.value = '';
    fileInput.click();
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
    fileInput.value = '';
    fileInput.click();
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
    if (!_importando) input.click();
  });

  button.addEventListener('click', event => {
    event.stopPropagation();
    if (!_importando) input.click();
  });

  zone.addEventListener('keydown', event => {
    if (_importando) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
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
    '  • Despesas fixas',
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
    '  • Orcamentos\n\n' +
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
