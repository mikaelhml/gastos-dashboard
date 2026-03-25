/**
 * Formata valor monetário para o padrão brasileiro: R$ X.XXX,XX
 */
export const fmt = v => {
  if (!Number.isFinite(v)) return '—';
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/**
 * Calcula a data de término dado o mês de início (YYYY-MM) e o total de meses.
 * Retorna string formatada: "jan. 2027"
 */
export function calcEndDate(inicio, totalMeses) {
  const [ano, mes] = inicio.split('-').map(Number);
  const endDate = new Date(ano, mes - 1 + totalMeses, 1);
  return endDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

/**
 * Retorna o nome do mês anterior ao primeiro da lista de extratos.
 * Usado para montar o histórico de saldo no gráfico de projeção.
 * @param {string} mesPrimeiro - ex: "Dez/2025"
 * @returns {string} - ex: "Nov/2025"
 */
export function mesAnterior(mesPrimeiro) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const [mesStr, anoStr] = mesPrimeiro.split('/');
  const idx = meses.indexOf(mesStr);
  if (idx === 0) return `Dez/${parseInt(anoStr) - 1}`;
  return `${meses[idx - 1]}/${anoStr}`;
}

/**
 * Gera array de N meses a partir do mês seguinte ao último da lista de extratos.
 * @param {string} ultimoMes - ex: "Fev/2026"
 * @param {number} n - quantidade de meses a gerar
 */
export function gerarMesesFuturos(ultimoMes, n) {
  const mesesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const [mesStr, anoStr] = ultimoMes.split('/');
  let idx = mesesNomes.indexOf(mesStr);
  let ano = parseInt(anoStr);
  const result = [];
  for (let i = 0; i < n; i++) {
    idx++;
    if (idx === 12) { idx = 0; ano++; }
    result.push(`${mesesNomes[idx]}/${ano}`);
  }
  return result;
}
