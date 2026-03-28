/**
 * transaction-export.js — Exportação de transações reais como CSV
 *
 * Formato: UTF-8 BOM + delimitador ponto-e-vírgula + CRLF (compatível com Excel).
 * Nunca exporta linhas contextoDerivado (SCR/Registrato).
 */

const SEP  = ';';
const CRLF = '\r\n';

const HEADERS = [
  'data',
  'mes_ou_fatura',
  'origem',
  'canal',
  'descricao',
  'categoria',
  'tipo_movimento',
  'valor',
];

/**
 * Serializa um valor de célula para CSV: envolve em aspas duplas se necessário e
 * faz escape de aspas duplas internas (RFC 4180).
 */
function csvCell(value) {
  const str = String(value ?? '');
  if (str.includes(SEP) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Constrói uma string CSV a partir de uma lista de lançamentos/transações.
 *
 * @param {Array} rows — lançamentos já filtrados/ordenados (conforme estado atual da tela).
 *                       Linhas com `contextoDerivado === true` são ignoradas automaticamente.
 * @returns {string} CSV completo com BOM UTF-8.
 */
export function buildTransactionsCsv(rows) {
  const realRows = (rows || []).filter(r => !r.contextoDerivado);

  const lines = [
    HEADERS.join(SEP),
    ...realRows.map(r => [
      csvCell(r.data ?? ''),
      csvCell(r.fatura ?? r.mes ?? ''),
      csvCell(r.source ?? ''),
      csvCell(r.canal ?? ''),
      csvCell(r.desc ?? ''),
      csvCell(r.cat ?? ''),
      csvCell(r.tipo_classificado ?? r.tipo ?? ''),
      csvCell(r.valor != null ? String(Number(r.valor)) : ''),
    ].join(SEP)),
  ];

  return '\uFEFF' + lines.join(CRLF);
}

/**
 * Inicia o download do CSV no navegador reutilizando o padrão Blob + object URL
 * já usado no restante do projeto.
 *
 * @param {string} csvContent — saída de buildTransactionsCsv().
 * @param {string} [fileName] — nome do arquivo para download.
 */
export function downloadTransactionsCsv(csvContent, fileName = 'lancamentos.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
