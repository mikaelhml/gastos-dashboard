export const PROJECTION_SIMULATOR_CONFIG_KEY = 'default';
export const PROJECTION_SIMULATOR_MONTH_OPTIONS = [6, 12, 24];

export function normalizeProjectionSimulatorConfig(rawConfig = null, fallbackInputs = {}) {
  const fallback = normalizeProjectionSimulatorInputFields(fallbackInputs, {
    salario: 0,
    rendaExtra: 0,
    itau: 0,
    outros: 0,
    meses: 6,
  });
  const normalized = normalizeProjectionSimulatorInputFields(rawConfig, fallback);

  return {
    key: PROJECTION_SIMULATOR_CONFIG_KEY,
    ...normalized,
  };
}

export function normalizeProjectionSimulatorInputs(rawInputs = null, fallbackInputs = {}) {
  return normalizeProjectionSimulatorInputFields(rawInputs, normalizeProjectionSimulatorInputFields(fallbackInputs, {
    salario: 0,
    rendaExtra: 0,
    itau: 0,
    outros: 0,
    meses: 6,
  }));
}

export function buildProjectionSimulatorConfigRecord(rawInputs = null, fallbackInputs = {}, updatedAt = new Date().toISOString()) {
  const normalized = normalizeProjectionSimulatorConfig(rawInputs, fallbackInputs);
  return {
    ...normalized,
    updatedAt,
  };
}

export function serializeProjectionSimulatorConfig(config = null) {
  if (!config || typeof config !== 'object') return null;

  return normalizeProjectionSimulatorInputFields(config, {
    salario: 0,
    rendaExtra: 0,
    itau: 0,
    outros: 0,
    meses: 6,
  });
}

function normalizeProjectionSimulatorInputFields(rawInputs = null, fallbackInputs = {}) {
  const raw = rawInputs && typeof rawInputs === 'object' ? rawInputs : {};
  const fallback = fallbackInputs && typeof fallbackInputs === 'object' ? fallbackInputs : {};
  return {
    salario: normalizeNonNegativeNumber(raw.salario, fallback.salario),
    rendaExtra: normalizeNonNegativeNumber(raw.rendaExtra, fallback.rendaExtra),
    itau: normalizeNonNegativeNumber(raw.itau, fallback.itau),
    outros: normalizeNonNegativeNumber(raw.outros, fallback.outros),
    meses: normalizeMonthCount(raw.meses, fallback.meses),
  };
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return Number(fallback || 0);
  return Math.round(parsed * 100) / 100;
}

function normalizeMonthCount(value, fallback = 6) {
  const parsed = Number(value);
  if (PROJECTION_SIMULATOR_MONTH_OPTIONS.includes(parsed)) return parsed;
  return PROJECTION_SIMULATOR_MONTH_OPTIONS.includes(Number(fallback)) ? Number(fallback) : 6;
}
