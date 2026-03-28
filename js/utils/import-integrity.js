function stripAccents(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeImportText(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toMoneyCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'nan';
  return String(Math.round(amount * 100));
}

function pluralizeUnit(unitLabel, count) {
  if (count === 1) return unitLabel;

  if (unitLabel.endsWith('ao')) return `${unitLabel.slice(0, -2)}oes`;
  if (unitLabel.endsWith('ção')) return `${unitLabel.slice(0, -3)}ções`;
  if (unitLabel.endsWith('m')) return `${unitLabel.slice(0, -1)}ns`;
  if (unitLabel.endsWith('l')) return `${unitLabel}s`;
  if (unitLabel.endsWith('r')) return `${unitLabel}es`;
  return `${unitLabel}s`;
}

function normalizeParcela(value) {
  return normalizeImportText(value).replace(/\s+/g, '');
}

export function buildLancamentoFingerprint(item) {
  const parts = [
    normalizeImportText(item?.data),
    normalizeImportText(item?.desc),
    toMoneyCents(item?.valor),
    normalizeParcela(item?.parcela),
    toMoneyCents(item?.totalCompra),
    normalizeImportText(item?.canal || item?.banco),
  ];

  return parts.join('|');
}

export function dedupeImportedLancamentos(items = []) {
  const seen = new Set();
  const uniqueItems = [];
  let duplicateCount = 0;

  for (const item of items) {
    const fingerprint = item?.importFingerprint || buildLancamentoFingerprint(item);
    if (seen.has(fingerprint)) {
      duplicateCount++;
      continue;
    }

    seen.add(fingerprint);
    uniqueItems.push({
      ...item,
      importFingerprint: fingerprint,
    });
  }

  const warnings = duplicateCount > 0
    ? [{
        code: 'duplicate-import-rows',
        level: 'warning',
        message: duplicateCount === 1
          ? '1 linha duplicada foi descartada antes de salvar.'
          : `${duplicateCount} linhas duplicadas foram descartadas antes de salvar.`,
      }]
    : [];

  return { uniqueItems, warnings, duplicateCount };
}

export function planScopedReplacement({
  existingItems = [],
  incomingItems = [],
  sourceKey = '',
  periodKey = '',
}) {
  const normalizedPeriodKey = normalizeImportText(periodKey);
  const incomingFingerprints = new Set(
    incomingItems.map(item => item?.importFingerprint || buildLancamentoFingerprint(item)),
  );

  const deleteIds = [];
  const ambiguousLegacyItems = [];

  for (const item of existingItems) {
    const itemPeriod = normalizeImportText(item?.importPeriodKey || item?.fatura);
    if (!item?.id || !normalizedPeriodKey || itemPeriod !== normalizedPeriodKey) continue;

    if (item.importSource) {
      if (item.importSource === sourceKey) {
        deleteIds.push(item.id);
      }
      continue;
    }

    const fingerprint = item.importFingerprint || buildLancamentoFingerprint(item);
    if (incomingFingerprints.has(fingerprint)) {
      deleteIds.push(item.id);
      continue;
    }

    ambiguousLegacyItems.push(item);
  }

  const warnings = [];
  if (ambiguousLegacyItems.length > 0) {
    const sample = ambiguousLegacyItems
      .slice(0, 3)
      .map(item => item.desc || item.id)
      .filter(Boolean)
      .join(' | ');

    warnings.push({
      code: 'legacy-scope-ambiguity',
      level: 'warning',
      message: ambiguousLegacyItems.length === 1
        ? '1 lançamento antigo do mesmo período foi mantido por falta de origem confiável.'
        : `${ambiguousLegacyItems.length} lançamentos antigos do mesmo período foram mantidos por falta de origem confiável.`,
      ...(sample ? { sample } : {}),
    });
  }

  return {
    deleteIds,
    warnings,
    ambiguousCount: ambiguousLegacyItems.length,
  };
}

export function buildImportQuality({
  importedCount = 0,
  duplicateCount = 0,
  warningCount = 0,
  unitLabel = 'item',
}) {
  const totalPenalty = (Number(duplicateCount) * 4) + (Number(warningCount) * 2);
  const safeImportedCount = Number(importedCount) || 0;
  const score = safeImportedCount > 0
    ? Math.max(70, 100 - totalPenalty)
    : 0;
  const label = `${safeImportedCount} ${pluralizeUnit(unitLabel, safeImportedCount)} · confiança ${score}%`;

  return {
    score,
    label,
    unitLabel,
    importedCount: safeImportedCount,
    warningCount: Number(warningCount) || 0,
  };
}
