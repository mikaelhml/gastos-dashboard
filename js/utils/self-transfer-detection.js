import { inferirCanal } from './transaction-tags.js';

const SELF_TRANSFER_HINTS = [
  /\bconta\s+invest(?:imento|imentos)?\b/i,
  /\bminha\s+conta\b/i,
  /\bentre\s+contas\b/i,
  /\bmesma\s+titularidade\b/i,
  /\baplica(?:cao|ção)\b/i,
  /\bresgate\b/i,
  /\bguardadinho\b/i,
  /\bcaixinha\b/i,
  /\bpoupan[çc]a\b/i,
  /\bconta\s+corrente\b/i,
];

const NON_SELF_COUNTERPARTY_HINTS = [
  /\bcliente\b/i,
  /\bmercado\b/i,
  /\bshop\b/i,
  /\bpay\b/i,
  /\bltda\b/i,
  /\bsa\b/i,
  /\beireli\b/i,
  /\bmei\b/i,
  /\bservi[çc]os?\b/i,
  /\btecnologia\b/i,
  /\bgestao\b/i,
  /\bempresa\b/i,
  /\bfreela\b/i,
];

export function normalizeOwnTransfers(transactions = []) {
  return (transactions || []).map(item => {
    if (!isOwnTransferLike(item)) return { ...item };
    return {
      ...item,
      cat: 'Transferência própria',
      ownTransferDetected: true,
    };
  });
}

export function isOwnTransferLike(item = {}) {
  const desc = String(item?.desc || '').trim();
  if (!desc) return false;

  const normalizedDesc = normalizeText(desc);
  const canal = inferirCanal(item);
  const category = String(item?.cat || '').trim();

  if (category === 'Fatura Crédito') return false;
  if (category === 'Transferência própria') return true;
  if (NON_SELF_COUNTERPARTY_HINTS.some(pattern => pattern.test(normalizedDesc))) return false;

  if (SELF_TRANSFER_HINTS.some(pattern => pattern.test(normalizedDesc))) {
    return canal === 'pix' || canal === 'transferencia' || canal === 'outro';
  }

  if (category === 'Investimentos' && (canal === 'pix' || canal === 'transferencia')) {
    return true;
  }

  if ((canal === 'pix' || canal === 'transferencia') && /\b(transf(?:erencia)?|ted|doc)\b/i.test(normalizedDesc)) {
    return /\b(conta|invest|aplica|resgate|guardadinho|caixinha|poupanca)\b/i.test(normalizedDesc);
  }

  return false;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
