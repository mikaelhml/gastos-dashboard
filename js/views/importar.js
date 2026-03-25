/**
 * importar.js — Aba Importar (Fase 2)
 *
 * Responsabilidades:
 *   - Renderizar zona de drag & drop para PDFs Nubank Conta
 *   - Mostrar barra de progresso durante importação
 *   - Exibir log de resultados (sucesso, duplicata, erro)
 *   - Mostrar cards de status da base
 *   - Botão "Limpar base importada"
 */

import { getStoreCounts, clearAllImported } from '../db.js';
import { detectarLayoutProfile }            from '../parsers/layout-profiles.js';
import { escapeHtml }                       from '../utils/dom.js';
import { exportConfig, importConfig }       from '../utils/config-io.js';

// ── Estado do módulo ──────────────────────────────────────────────────────────

let _importando = false;
let _dropZoneBound = false;
let _configBound = false;

// ── Inicialização ─────────────────────────────────────────────────────────────

/**
 * Inicializa a aba Importar: atualiza status e vincula eventos de drag & drop.
 * Chamada pelo app.js na inicialização.
 */
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
}

// ── Status da base ────────────────────────────────────────────────────────────

async function refreshStatus() {
  const counts = await getStoreCounts();
  const grid   = document.getElementById('dbStatusGrid');
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
    </div>`;
}

function _bindConfigSection() {
  const exportButton = document.getElementById('configExportBtn');
  const importButton = document.getElementById('configImportBtn');
  const fileInput = document.getElementById('configFileInput');
  const resultEl = document.getElementById('configIoResult');

  if (!exportButton || !importButton || !fileInput || !resultEl) return;

  exportButton.addEventListener('click', async () => {
    resultEl.innerHTML = '';
    await exportConfig();
    _renderConfigResult('success', 'Configuração exportada com sucesso. Guarde o JSON como backup ou para migração.');
  });

  importButton.addEventListener('click', () => {
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

// ── Drag & Drop ───────────────────────────────────────────────────────────────

function _bindDropZone() {
  const zone  = document.getElementById('dropZone');
  const input = document.getElementById('pdfFileInput');
  const button = document.getElementById('dropZoneButton');
  if (!zone || !input || !button) return;

  // Clique na zona → abre o seletor de arquivo
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

  // Drag over — destaca zona
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  // Drop — processa arquivos
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length > 0) _processarArquivos(files);
  });

  // Input file — processa arquivos selecionados
  input.addEventListener('change', () => {
    const files = [...input.files];
    if (files.length > 0) _processarArquivos(files);
    input.value = ''; // reset para permitir reimportação do mesmo arquivo
  });
}

// ── Processamento de arquivos ─────────────────────────────────────────────────

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

  // Atualiza status da base
  await refreshStatus();
  await window.refreshDashboard?.();
  _importando = false;
  setImportingState(false);
  setImportSummary(
    importados > 0
      ? `${importados} arquivo(s) importado(s) com sucesso. O dashboard já foi atualizado.`
      : 'Nenhum arquivo novo foi importado.',
    importados > 0 ? 'success' : '',
  );
}

/** @returns {boolean} true se importado com sucesso */
async function _importarUmArquivo(file) {
  const progressId = `prog_${Date.now()}`;
  const logEl      = document.getElementById('importLog');

  // Adiciona card de progresso
  if (logEl) {
    logEl.insertAdjacentHTML('beforeend', `
      <div class="import-result-card" id="${progressId}">
        <div class="irc-header">
          <span class="irc-icon">⏳</span>
          <span class="irc-nome">${escapeHtml(file.name)}</span>
          <span class="badge badge-blue" id="${progressId}_tipo">Detectando tipo…</span>
          <span class="irc-status" style="color:#a0aec0">Processando…</span>
        </div>
        <div class="import-progress-wrap">
          <div class="import-progress-bar" id="${progressId}_bar" style="width:5%"></div>
        </div>
        <div class="irc-detail" id="${progressId}_detail" style="color:#718096;font-size:0.83rem;margin-top:8px">
          Lendo arquivo…
        </div>
      </div>`);
  }

  const setProgress = (pct, msg) => {
    const bar    = document.getElementById(`${progressId}_bar`);
    const detail = document.getElementById(`${progressId}_detail`);
    if (bar)    bar.style.width    = `${pct}%`;
    if (detail) detail.textContent = msg || '';
  };

  const setResultado = (icone, status, cor, detalhe) => {
    const card   = document.getElementById(progressId);
    const iconEl = card?.querySelector('.irc-icon');
    const stEl   = card?.querySelector('.irc-status');
    const dtEl   = card?.querySelector('.irc-detail');
    const pWrap  = card?.querySelector('.import-progress-wrap');
    if (iconEl) iconEl.textContent = icone;
    if (stEl)   { stEl.textContent = status; stEl.style.color = cor; }
    if (dtEl)   { dtEl.textContent = detalhe; dtEl.style.color = '#a0aec0'; }
    if (pWrap)  pWrap.style.display = 'none';
  };

  try {
    const profile = await detectarLayoutProfile(file);
    const tipo = profile?.id || null;
    const tipoLabel = profile?.label || null;
    const tipoEl = document.getElementById(`${progressId}_tipo`);
    if (tipoEl) {
      tipoEl.textContent = tipoLabel || 'Tipo não reconhecido';
      tipoEl.className = `badge ${profile?.badgeClass || 'badge-gray'}`;
    }

    if (!profile) {
      setResultado('❌', 'Tipo não reconhecido', '#fc8181',
        'Não foi possível identificar o layout do PDF. Adicione um novo perfil de layout para esse emissor/modelo.');
      return false;
    }

    setProgress(5, `Calculando hash (${tipoLabel})…`);

    const resultado = await profile.importer(file, pct => {
      const msgs = {
        5:   `Calculando hash (${tipoLabel})…`,
        10:  'Verificando duplicatas…',
        20:  tipo === 'nubank-conta' ? 'Extraindo período do arquivo…' : 'Identificando cabeçalho do layout…',
        30:  'Carregando PDF.js…',
        65:  'Processando estrutura do PDF…',
        75:  tipo === 'nubank-conta' ? 'Parseando transações…' : 'Parseando lançamentos…',
        85:  'Salvando no banco local…',
        100: 'Concluído!',
      };
      setProgress(pct, msgs[pct] || `Processando… ${pct}%`);
    });

    if (resultado.duplicata) {
      setResultado('⚠️', `${tipoLabel} duplicado`, '#f6e05e',
        'Este PDF já foi importado anteriormente. Nenhum dado foi adicionado.');
      return false;
    }

    if (resultado.erro) {
      setResultado('❌', `Erro ao parsear ${tipoLabel}`, '#fc8181',
        resultado.erro + (resultado.debug
          ? ' Amostra do texto extraído foi impressa no console (F12 → Console).'
          : ''));
      return false;
    }

    setResultado(
      '✅',
      `${tipoLabel} · ${resultado.importado} item(ns) importado(s)`,
      '#68d391',
      `Período: ${resultado.mes} — dados salvos com sucesso.`,
    );
    return true;

  } catch (err) {
    setResultado('❌', 'Erro', '#fc8181', err.message || 'Erro desconhecido.');
    console.error('[importar]', err);
    return false;
  }
}

// ── Limpar base ───────────────────────────────────────────────────────────────

/**
 * Apaga todos os dados importados, mantendo assinaturas e despesas_fixas.
 * Exposta ao window em app.js.
 */
export async function clearBase() {
  const ok = confirm(
    '⚠️ Apagar todos os dados importados?\n\n' +
    'Serão removidos:\n' +
    '  • Todas as transações do extrato\n' +
    '  • Todos os lançamentos de fatura\n' +
    '  • Registro de PDFs importados\n\n' +
    'Serão MANTIDOS:\n' +
    '  • Assinaturas\n' +
    '  • Despesas fixas',
  );
  if (!ok) return;

  await clearAllImported();
  location.reload();
}

function _renderConfigResult(type, message) {
  const resultEl = document.getElementById('configIoResult');
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
