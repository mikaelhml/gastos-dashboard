import { buildImportQuality } from './import-integrity.js';

function toWarningLevel(level) {
  return level === 'warning' ? 'warning' : 'info';
}

function getQualityTone(score) {
  if (score >= 90) return 'is-high';
  if (score >= 75) return 'is-medium';
  return 'is-low';
}

export function buildImportResultViewModel({
  tipoLabel,
  resultado,
  unitLabel = 'item',
}) {
  if (resultado?.erro) {
    return {
      tone: 'error',
      icon: '❌',
      color: '#fc8181',
      statusText: `Erro ao parsear ${tipoLabel}`,
      qualityLabel: '',
      qualityTone: '',
    };
  }

  if (resultado?.duplicata) {
    return {
      tone: 'warning',
      icon: '⚠️',
      color: '#f6e05e',
      statusText: `${tipoLabel} duplicado`,
      qualityLabel: '',
      qualityTone: '',
    };
  }

  const warningCount = Array.isArray(resultado?.warnings) ? resultado.warnings.length : 0;
  const quality = resultado?.quality || buildImportQuality({
    importedCount: Number(resultado?.importado) || 0,
    warningCount,
    unitLabel,
  });

  return {
    tone: 'success',
    icon: '✅',
    color: '#68d391',
    statusText: `${tipoLabel} · ${Number(resultado?.importado) || 0} item(ns) importado(s)`,
    qualityLabel: quality.label,
    qualityTone: getQualityTone(quality.score),
  };
}

export function buildWarningsViewModel(warnings = [], maxVisible = 3) {
  const normalizedWarnings = Array.isArray(warnings)
    ? warnings
      .filter(item => item && item.message)
      .map(item => {
        const level = toWarningLevel(item.level);
        return {
          code: item.code || '',
          level,
          levelLabel: level === 'warning' ? 'Aviso' : 'Info',
          message: String(item.message),
          sample: item.sample ? String(item.sample) : '',
        };
      })
    : [];

  if (normalizedWarnings.length === 0) {
    return {
      hasWarnings: false,
      summaryLabel: 'Sem avisos',
      emptyLabel: 'Sem avisos',
      items: [],
      overflowCount: 0,
    };
  }

  const items = normalizedWarnings.slice(0, maxVisible);
  return {
    hasWarnings: true,
    summaryLabel: normalizedWarnings.length === 1
      ? '1 aviso de importacao'
      : `${normalizedWarnings.length} avisos de importacao`,
    emptyLabel: 'Sem avisos',
    items,
    overflowCount: Math.max(0, normalizedWarnings.length - items.length),
  };
}
