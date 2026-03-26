/**
 * seed.js — Dados padrão que populam o IndexedDB na primeira abertura.
 *
 * A versão pública do dashboard deve iniciar zerada.
 * Nenhum dado pessoal ou financeiro é enviado no repositório.
 *
 * As stores abaixo começam vazias e são populadas pelo usuário via:
 *   - formulários inline (assinaturas e despesas fixas)
 *   - importação de PDFs
 *   - importação de configuração JSON
 */

export const SEED_ASSINATURAS = [];

export const SEED_OBSERVACOES = [];

export const SEED_DESPESAS_FIXAS = [];

export const SEED_LANCAMENTOS = [];

export const SEED_EXTRATO_SUMMARY = [];

export const SEED_EXTRATO_TRANSACOES = [];

export const SEED_DATA = {
  assinaturas: SEED_ASSINATURAS,
  observacoes: SEED_OBSERVACOES,
  despesas_fixas: SEED_DESPESAS_FIXAS,
  lancamentos: SEED_LANCAMENTOS,
  extrato_summary: SEED_EXTRATO_SUMMARY,
  extrato_transacoes: SEED_EXTRATO_TRANSACOES,
};
