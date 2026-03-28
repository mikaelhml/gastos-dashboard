import { categorizar } from './categorizer.js';

const FALLBACK_CATEGORY = 'Outros';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceScope(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'cartao' || normalized === 'conta' ? normalized : 'all';
}

function normalizeDirectionScope(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'entrada' || normalized === 'saida' ? normalized : 'all';
}

function matchesScope(expected, actual) {
  return expected === 'all' || expected === actual;
}

function buildMemoryKey(descriptionNorm, sourceScope, directionScope) {
  return `${descriptionNorm}|${sourceScope}|${directionScope}`;
}

function normalizeMemory(memory = {}) {
  const descriptionNorm = normalizeText(memory.descriptionNorm ?? memory.desc);
  const sourceScope = normalizeSourceScope(memory.sourceScope ?? memory.source);
  const directionScope = normalizeDirectionScope(memory.directionScope ?? memory.direction);

  return {
    ...memory,
    key: buildMemoryKey(descriptionNorm, sourceScope, directionScope),
    descriptionNorm,
    sourceScope,
    directionScope,
    category: normalizeCategoryText(memory.category) || FALLBACK_CATEGORY,
    enabled: memory.enabled !== false,
  };
}

function normalizeRule(rule = {}) {
  return {
    ...rule,
    pattern: String(rule.pattern ?? ''),
    patternNorm: normalizeText(rule.pattern),
    category: normalizeCategoryText(rule.category) || FALLBACK_CATEGORY,
    sourceScope: normalizeSourceScope(rule.sourceScope),
    directionScope: normalizeDirectionScope(rule.directionScope),
    enabled: rule.enabled !== false,
  };
}

export function normalizeCategoryText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function sortCategorizationRules(rules = []) {
  return (rules || [])
    .map((rule, index) => ({
      ...rule,
      __index: index,
      __priority: Number.isFinite(Number(rule?.priority))
        ? Number(rule.priority)
        : Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => left.__priority - right.__priority || left.__index - right.__index)
    .map(({ __index, __priority, ...rule }, index) => ({
      ...rule,
      priority: index + 1,
    }));
}

export function buildCategoryMemoryRecord({
  desc,
  source,
  direction,
  category,
  learnedFrom,
  enabled = true,
} = {}) {
  const descriptionNorm = normalizeText(desc);
  const sourceScope = normalizeSourceScope(source);
  const directionScope = normalizeDirectionScope(direction);

  return {
    key: buildMemoryKey(descriptionNorm, sourceScope, directionScope),
    descriptionNorm,
    sourceScope,
    directionScope,
    category: normalizeCategoryText(category) || FALLBACK_CATEGORY,
    enabled: enabled !== false,
    learnedFrom: learnedFrom ? String(learnedFrom) : undefined,
  };
}

export function buildCategorizationRuntime({
  rules = [],
  memories = [],
  fallbackCategorizer = categorizar,
} = {}) {
  const normalizedRules = sortCategorizationRules(rules).map(normalizeRule);
  const normalizedMemories = (memories || [])
    .map(normalizeMemory)
    .filter(memory => memory.descriptionNorm);

  return {
    rules: normalizedRules,
    memories: normalizedMemories,
    memoryByKey: Object.fromEntries(normalizedMemories.map(memory => [memory.key, memory])),
    fallbackCategorizer,
  };
}

export function categorizeImportedItem(item = {}, runtime = {}, options = {}) {
  const description = String(item?.desc ?? item?.description ?? '');
  const descriptionNorm = normalizeText(description);
  const sourceScope = normalizeSourceScope(options.source ?? item?.source ?? item?.origem);
  const directionScope = normalizeDirectionScope(options.direction ?? item?.direction ?? item?.tipo);
  const memoryKey = buildMemoryKey(descriptionNorm, sourceScope, directionScope);
  const memoryMatch = runtime?.memoryByKey?.[memoryKey];

  if (memoryMatch?.enabled !== false && memoryMatch?.category) {
    return {
      cat: memoryMatch.category,
      category: memoryMatch.category,
      cat_origem: 'memoria',
      cat_regra_id: null,
    };
  }

  for (const rule of runtime?.rules || []) {
    if (!rule?.enabled || !rule?.patternNorm) continue;
    if (!matchesScope(rule.sourceScope, sourceScope)) continue;
    if (!matchesScope(rule.directionScope, directionScope)) continue;
    if (!descriptionNorm.includes(rule.patternNorm)) continue;

    return {
      cat: rule.category,
      category: rule.category,
      cat_origem: 'regra',
      cat_regra_id: rule.id ?? null,
    };
  }

  const defaultCategory = normalizeCategoryText((runtime?.fallbackCategorizer || categorizar)(description));
  if (defaultCategory && defaultCategory !== FALLBACK_CATEGORY) {
    return {
      cat: defaultCategory,
      category: defaultCategory,
      cat_origem: 'padrao',
      cat_regra_id: null,
    };
  }

  return {
    cat: FALLBACK_CATEGORY,
    category: FALLBACK_CATEGORY,
    cat_origem: 'fallback',
    cat_regra_id: null,
  };
}

export function applyCategorizationToImportedRows(rows = [], runtime = {}, options = {}) {
  return (rows || []).map((row, index) => {
    const source = typeof options.source === 'function' ? options.source(row, index) : options.source;
    const direction = typeof options.direction === 'function' ? options.direction(row, index) : options.direction;
    const categorized = categorizeImportedItem(row, runtime, { source, direction });

    return {
      ...row,
      cat: categorized.cat,
      cat_origem: categorized.cat_origem,
      cat_regra_id: categorized.cat_regra_id,
    };
  });
}

export function buildRecategorizedRowPatches(rows = [], runtime = {}, options = {}) {
  const recategorizedRows = applyCategorizationToImportedRows(rows, runtime, options);

  return recategorizedRows.filter((row, index) => {
    const previousRow = rows[index] || {};
    return previousRow.cat !== row.cat
      || (previousRow.cat_origem ?? null) !== (row.cat_origem ?? null)
      || (previousRow.cat_regra_id ?? null) !== (row.cat_regra_id ?? null);
  });
}
