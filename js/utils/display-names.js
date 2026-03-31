const LEADING_NOISE_PATTERNS = [
  /^(?:compra(?:\s+no)?\s+(?:cartao|cartão|debito|débito|credito|crédito)|pagamento(?:\s+efetuado)?|transf(?:erencia)?(?:\s+pix)?|pix(?:\s+(?:enviado|recebido))?|debito automatico|débito automático)\s+/iu,
];

const INLINE_NOISE_PATTERNS = [
  /\b(?:nsu|aut(?:orizacao|orização)?|doc|codigo|código|cod|ref|trx|id|seq|terminal)\b[:#-]?\s*[a-z0-9./-]{3,}\b/giu,
  /\b(?:cpf|cnpj)\b[:#-]?\s*[\d./-]{6,}\b/giu,
  /\b(?:cartao|cartão)\s+final\s+\d{4}\b/giu,
  /\b\d{8,}\b/gu,
];

export function buildDisplayNameMeta(value, options = {}) {
  const { maxLength = 42, stripInstallmentSuffix = false, aliases = null } = options;
  const raw = collapseWhitespace(value);
  if (!raw) {
    return { raw: '', friendly: '', short: '', changed: false };
  }

  const alias = resolveDisplayAlias(raw, { aliases, stripInstallmentSuffix });
  const cleaned = compactTransactionName(raw, { stripInstallmentSuffix });
  const friendly = toDisplayCase(alias || cleaned || raw);
  const short = truncateAtWordBoundary(friendly, maxLength);

  return {
    raw,
    friendly,
    short,
    changed: friendly !== raw || short !== raw,
  };
}

export function buildAliasLookup(records = []) {
  const lookup = new Map();
  (records || []).forEach(record => {
    const key = String(record?.key ?? '').trim();
    const alias = collapseWhitespace(record?.alias);
    if (!key || !alias) return;
    lookup.set(key, alias);
  });
  return lookup;
}

export function buildTransactionAliasKey(value, options = {}) {
  const { stripInstallmentSuffix = false } = options;
  const compact = compactTransactionName(value, { stripInstallmentSuffix });
  return normalizeAliasKey(compact || value);
}

export function compactTransactionName(value, options = {}) {
  const { stripInstallmentSuffix = false } = options;
  let result = collapseWhitespace(value);
  if (!result) return '';

  if (stripInstallmentSuffix) {
    result = result.replace(/\s+\d{1,2}\/\d{1,2}\s*$/u, '');
  }

  LEADING_NOISE_PATTERNS.forEach(pattern => {
    result = result.replace(pattern, '');
  });

  INLINE_NOISE_PATTERNS.forEach(pattern => {
    result = result.replace(pattern, ' ');
  });

  result = result
    .replace(/[|]+/g, ' ')
    .replace(/\s*[-_]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (result.split(' ').length > 6) {
    result = result
      .split(' ')
      .filter(part => !/^[a-z]{1,3}\d{2,}$/iu.test(part))
      .join(' ')
      .trim();
  }

  return result || collapseWhitespace(value);
}

function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDisplayAlias(value, options = {}) {
  const { aliases = null, stripInstallmentSuffix = false } = options;
  if (!aliases) return '';

  const lookup = aliases instanceof Map ? aliases : buildAliasLookup(aliases);
  const key = buildTransactionAliasKey(value, { stripInstallmentSuffix });
  return collapseWhitespace(lookup.get(key));
}

function toDisplayCase(value) {
  const text = collapseWhitespace(value);
  if (!text) return '';

  const letters = [...text].filter(char => /\p{L}/u.test(char));
  const upper = letters.filter(char => char === char.toLocaleUpperCase('pt-BR')).length;
  const lower = letters.filter(char => char === char.toLocaleLowerCase('pt-BR')).length;
  const shouldTitleCase = letters.length > 0 && (lower === 0 || upper / letters.length >= 0.72);

  if (!shouldTitleCase) return text;

  return text
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1))
    .join(' ');
}

function truncateAtWordBoundary(value, maxLength) {
  const text = collapseWhitespace(value);
  if (!text || text.length <= maxLength) return text;

  const slice = text.slice(0, Math.max(8, maxLength - 1));
  const boundary = slice.lastIndexOf(' ');
  const trimmed = (boundary >= Math.max(8, Math.floor(maxLength * 0.55)) ? slice.slice(0, boundary) : slice).trim();
  return `${trimmed}…`;
}

function normalizeAliasKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
