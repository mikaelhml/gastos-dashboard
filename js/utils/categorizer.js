/**
 * categorizer.js — Categorização automática de transações por keywords.
 *
 * A ordem das regras importa: mais específicas primeiro.
 * Usa correspondência case-insensitive na descrição completa.
 */

const REGRAS = [
  // Salário — GS3 Tecnologia (empregador)
  { cat: 'Salário',        keywords: ['GS3', 'PAGAMENTO SAL', 'SAL ', 'SALARIO'] },

  // Alimentação — delivery e apps de comida
  { cat: 'Alimentação',    keywords: ['IFOOD', 'MERCADO IFOOD', 'RAPPI'] },

  // Transporte — apps de corrida e mobilidade
  { cat: 'Transporte',     keywords: ['UBER', 'UBER TRIP', '99APP', '99 APP', 'CABIFY'] },

  // Família — pessoas conhecidas pelo extrato real
  { cat: 'Família',        keywords: ['DANUZI', 'GERCINA', 'FRANCISCA RODRIGUES'] },

  // Rendimento — juros Nubank (NuConta) e poupança Itaú
  { cat: 'Rendimento',     keywords: ['RENDIMENTO', 'REND.', 'REND ', 'JUROS CREDIT', 'NUCONTA', 'REND CRED', 'JUROS POUP', 'REMUNER BASICA POUP'] },

  // Fatura de cartão de crédito (Nubank e Itaú — vários nomes: Azul, Uniclass, Infinite)
  { cat: 'Fatura Crédito', keywords: ['PGTO FAT', 'PAGTO FAT', 'PAGAMENTO FAT', 'FATURA', 'ITAU UNIBANC', 'ITAÚ', 'NUBANK FAT', 'NUBANK CRED', 'INT UNICLASS', 'INT AZUL', 'FATURAAZUL', 'FATURAITAU'] },

  // Transferências / movimentações entre contas
  { cat: 'Transferência',  keywords: ['PIX', 'TRANSFERENCIA', 'TRANSF ', 'TED ', ' DOC', 'DOC '] },

  // Moradia — CAIXA (financiamento), condomínio
  { cat: 'Moradia',        keywords: ['CAIXA ECONOMICA', 'CAIXA ECO', 'CEF ', ' CEF', 'CONDOMINIO', 'CONDOMINIOS', 'SINDICO'] },

  // Educação — FIES / Banco do Brasil
  { cat: 'Educação',       keywords: ['FIES', 'BCO DO BRASIL', 'BANCO DO BRASIL', 'BB CREDITO', 'BB CRED'] },

  // Utilidades — energia elétrica
  { cat: 'Utilidades',     keywords: ['NEOENERGIA', 'LIGHT ', 'CEMIG', 'COPEL', 'ENEL ', 'ELEKTRO', 'ENERGISA'] },

  // Telecom — internet e celular
  { cat: 'Telecom',        keywords: ['CONECT NET', 'CONECTNET', 'CLARO ', 'CLARO S', 'VIVO ', 'TIM ', 'OI ', 'NEXTEL'] },

  // Previdência privada
  { cat: 'Previdência',    keywords: ['BRASILIAPREV', 'PREVIDENCIA', 'PREV PRIV', 'ICATU', 'BRADESCOPREV'] },

  // Associações
  { cat: 'Associação',     keywords: ['AABR', 'ABRAPANGO', 'ASA*ABRAPANGO', 'SINDICATO', 'SINDIC'] },

  // Saúde — farmácias, clínicas, psiquiatria
  { cat: 'Saúde',          keywords: ['FARMAC', 'DROGARI', 'HOSPITAL', 'CLINICA', 'MEDICO', 'LABORAT', 'PSIQUIA', 'PSICOLOG', 'EMANACAN', 'ALEXANDRE PEIXOTO'] },

  // Investimentos — XP, resgates
  { cat: 'Investimentos',  keywords: ['XP INVEST', 'XP CORRET', 'CORRETORA', 'RESGATE XP', 'INVEST ', 'RICO ', 'GENIAL'] },
];

function normalizarTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Retorna a categoria para uma descrição de transação.
 * @param {string} desc - Descrição bruta da transação
 * @returns {string} Categoria (ex: 'Salário', 'Família', 'Outros')
 */
export function categorizar(desc) {
  const upper = normalizarTexto(desc);
  for (const regra of REGRAS) {
    if (regra.keywords.some(kw => upper.includes(normalizarTexto(kw)))) {
      return regra.cat;
    }
  }
  return 'Outros';
}
