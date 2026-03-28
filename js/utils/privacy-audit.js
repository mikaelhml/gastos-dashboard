import { getLayoutProfileById } from '../parsers/layout-profiles.js';

const SOURCE_TYPE_ALIASES = new Map([
  ['registrato-scr', 'registrato-scr'],
  ['itau-fatura', 'itau-fatura'],
  ['fatura-itau', 'itau-fatura'],
  ['nubank-fatura', 'nubank-fatura'],
  ['fatura', 'nubank-fatura'],
  ['itau-conta', 'itau-conta'],
  ['nubank-conta', 'nubank-conta'],
]);

const UNKNOWN_SOURCE = {
  id: 'unknown-import',
  label: 'PDF importado (origem não identificada)',
};

const COUNT_LABELS = [
  { key: 'transacoes', label: 'Transações de conta', detail: 'Extrato conta' },
  { key: 'lancamentos', label: 'Lançamentos de cartão', detail: 'Faturas importadas' },
  { key: 'pdfs', label: 'PDFs importados', detail: 'Histórico local' },
  { key: 'registratoMeses', label: 'Meses de Registrato', detail: 'SCR consolidado' },
  { key: 'assinaturas', label: 'Assinaturas manuais', detail: 'Recorrentes locais' },
  { key: 'despesas', label: 'Despesas fixas', detail: 'Cadastros locais' },
];

export function normalizeImportedPdfSource(record = {}) {
  const explicitType = String(record?.tipo ?? '').trim();
  const canonicalId = SOURCE_TYPE_ALIASES.get(explicitType) || null;
  if (canonicalId) {
    const profile = getLayoutProfileById(canonicalId);
    return profile
      ? { id: profile.id, label: profile.label }
      : { id: canonicalId, label: canonicalId };
  }

  if (Number.isFinite(Number(record?.saldoAnchor))) {
    const profile = getLayoutProfileById('itau-conta');
    return {
      id: profile?.id || 'itau-conta',
      label: profile?.label || 'Extrato Itaú Conta',
    };
  }

  if (record?.saldoInicial !== undefined || record?.saldoFinal !== undefined) {
    const profile = getLayoutProfileById('nubank-conta');
    return {
      id: profile?.id || 'nubank-conta',
      label: profile?.label || 'Extrato Nubank Conta',
    };
  }

  return { ...UNKNOWN_SOURCE };
}

export function buildPrivacyAuditModel({
  counts = {},
  pdfHistory = [],
  storageEstimate = null,
} = {}) {
  const normalizedCounts = COUNT_LABELS.map(item => ({
    key: item.key,
    label: item.label,
    detail: item.detail,
    count: normalizeCount(counts?.[item.key]),
  }));

  const groupedSources = new Map();

  for (const entry of Array.isArray(pdfHistory) ? pdfHistory : []) {
    const source = normalizeImportedPdfSource(entry);
    const importIso = normalizeIsoDate(entry?.importadoEm);
    const current = groupedSources.get(source.id) || {
      id: source.id,
      label: source.label,
      importCount: 0,
      lastImportIso: null,
      lastImportLabel: 'Ainda sem data registrada',
    };

    current.importCount += 1;

    if (importIso && (!current.lastImportIso || Date.parse(importIso) > Date.parse(current.lastImportIso))) {
      current.lastImportIso = importIso;
      current.lastImportLabel = formatDateTime(importIso);
    }

    groupedSources.set(source.id, current);
  }

  const importSources = [...groupedSources.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  return {
    counts: normalizedCounts,
    totalLocalRecords: normalizedCounts.reduce((sum, item) => sum + item.count, 0),
    importSources,
    storage: buildStorageModel(storageEstimate),
    privacyCopy: [
      'Os PDFs e dados financeiros importados são processados e armazenados localmente no navegador e não são enviados para um backend do app.',
      'Esta auditoria consulta apenas contagens locais, o histórico de `pdfs_importados` e a estimativa de armazenamento exposta pelo próprio navegador.',
      'Ainda pode haver uso de rede para baixar bibliotecas estáticas como Chart.js e PDF.js via CDN; isso não envia o conteúdo financeiro importado para um backend.',
    ],
  };
}

function buildStorageModel(storageEstimate) {
  const usage = normalizeNumber(storageEstimate?.usage);
  const quota = normalizeNumber(storageEstimate?.quota);

  if (!Number.isFinite(usage) && !Number.isFinite(quota)) {
    return {
      available: false,
      usageBytes: null,
      quotaBytes: null,
      percent: null,
      summary: 'Estimativa de armazenamento indisponível neste navegador.',
      detail: 'O navegador atual não expôs dados de uso/quota via navigator.storage.estimate().',
    };
  }

  const percent = Number.isFinite(usage) && Number.isFinite(quota) && quota > 0
    ? Math.min(100, Math.max(0, (usage / quota) * 100))
    : null;

  const summary = Number.isFinite(usage) && Number.isFinite(quota) && quota > 0
    ? `${formatBytes(usage)} usados de ${formatBytes(quota)} (${percent.toFixed(1)}%)`
    : Number.isFinite(usage)
      ? `${formatBytes(usage)} usados (quota indisponível neste navegador)`
      : `Quota estimada de ${formatBytes(quota)} (uso indisponível neste navegador)`;

  return {
    available: true,
    usageBytes: Number.isFinite(usage) ? usage : null,
    quotaBytes: Number.isFinite(quota) ? quota : null,
    percent,
    summary,
    detail: 'Estimativa local informada pelo próprio navegador, sem consultar servidor do app.',
  };
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().replace('.000Z', 'Z');
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }

  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals).replace('.', ',')} ${units[unitIndex]}`;
}
