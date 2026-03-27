const CANAL_META = {
  pix: {
    id: 'pix',
    label: 'PIX',
    icon: '💠',
    badgeClass: 'badge-canal-pix',
    order: 1,
  },
  transferencia: {
    id: 'transferencia',
    label: 'Transferência',
    icon: '↔️',
    badgeClass: 'badge-canal-transferencia',
    order: 2,
  },
  cartao: {
    id: 'cartao',
    label: 'Cartão',
    icon: '💳',
    badgeClass: 'badge-canal-cartao',
    order: 3,
  },
  boleto: {
    id: 'boleto',
    label: 'Boleto',
    icon: '🧾',
    badgeClass: 'badge-canal-boleto',
    order: 4,
  },
  debito: {
    id: 'debito',
    label: 'Débito',
    icon: '🏧',
    badgeClass: 'badge-canal-debito',
    order: 5,
  },
  outro: {
    id: 'outro',
    label: 'Outro',
    icon: '•',
    badgeClass: 'badge-gray',
    order: 99,
  },
};

const PIX_PATTERNS = [
  /\bPIX\b/,
  /CHAVE PIX/,
  /PELO PIX/,
];

const TRANSFERENCIA_PATTERNS = [
  /\bTRANSFERENCIA\b/,
  /\bTRANSF\b/,
  /\bTED\b/,
  /\bDOC\b/,
];

const BOLETO_PATTERNS = [
  /\bBOLETO\b/,
  /PAG(?:AMENTO|TO)\s+DE\s+BOLETO/,
  /PAG(?:AMENTO|TO)\s+BOLETO/,
];

const DEBITO_PATTERNS = [
  /\bDEBITO\b/,
  /COMPRA\s+NO\s+DEBITO/,
  /COMPRA\s+DEBITO/,
];

function normalizarTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function sortCanalIds(a, b) {
  const orderA = CANAL_META[a]?.order ?? 999;
  const orderB = CANAL_META[b]?.order ?? 999;
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b, 'pt-BR');
}

export function getCanalMeta(canal) {
  return CANAL_META[canal] || CANAL_META.outro;
}

export function inferirCanal(item = {}) {
  const explicit = String(item.canal ?? '').trim().toLowerCase();
  if (explicit && CANAL_META[explicit]) {
    return explicit;
  }

  const source = String(item.source ?? '').trim().toLowerCase();
  if (source === 'cartao') {
    return 'cartao';
  }

  const desc = normalizarTexto(item.desc);

  if (PIX_PATTERNS.some(pattern => pattern.test(desc))) {
    return 'pix';
  }

  if (TRANSFERENCIA_PATTERNS.some(pattern => pattern.test(desc))) {
    return 'transferencia';
  }

  if (BOLETO_PATTERNS.some(pattern => pattern.test(desc))) {
    return 'boleto';
  }

  if (DEBITO_PATTERNS.some(pattern => pattern.test(desc))) {
    return 'debito';
  }

  return 'outro';
}

export function listarCanais(items = []) {
  return [...new Set(items.map(item => inferirCanal(item)).filter(Boolean))].sort(sortCanalIds);
}

export function enriquecerCanal(item = {}, fallback = {}) {
  const merged = { ...fallback, ...item };
  return {
    ...merged,
    canal: inferirCanal(merged),
  };
}
