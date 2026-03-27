import { fmt } from '../utils/formatters.js';
import { enriquecerCanal, getCanalMeta, inferirCanal, listarCanais } from '../utils/transaction-tags.js';

let _transacoes = [];
let _chartCategorias = null;
let _chartBarrasCategorias = null;
let _chartCanais = null;

/**
 * Inicializa a aba Extrato Conta com os dados carregados.
 * @param {Array} transacoes
 * @param {Array} extratoSummary  (inclui entrada apenasHistorico)
 */
export function initExtrato(transacoes, extratoSummary) {
  // Filtra somente meses com dados reais (exclui entrada de histórico puro)
  _transacoes = transacoes.map(t => enriquecerCanal({ ...t, source: 'conta' }));
  const summaryReal = extratoSummary.filter(m => !m.apenasHistorico);

  buildExtratoSummaryBar(_transacoes, summaryReal);
  buildExtratoCharts(_transacoes, summaryReal);
  buildExtratoFixosTable(_transacoes, summaryReal);
  renderExtrato(_transacoes);
}

function buildExtratoSummaryBar(transacoes, summaryReal) {
  const totalEntradas = transacoes.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
  const totalSaidas   = transacoes.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);

  document.getElementById('extratoTotalEntradas').textContent = fmt(totalEntradas);
  document.getElementById('extratoTotalSaidas').textContent   = fmt(totalSaidas);

  // Saldo final = saldoFinal do último mês com dados reais
  const ultimo = summaryReal[summaryReal.length - 1];
  document.getElementById('extratoSaldoFinal').textContent = ultimo ? fmt(ultimo.saldoFinal) : '—';

  // Atualiza summary bar com período dinâmico
  const mesesStr = summaryReal.map(m => m.mes).join(' · ');
  const periodoEl = document.getElementById('extratoPeriodo');
  if (periodoEl) periodoEl.textContent = mesesStr || '—';

  // Popula filtro de categorias dinamicamente
  const cats = [...new Set(transacoes.map(t => t.cat))].sort();
  const sel  = document.getElementById('extratoFilterCat');
  sel.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => sel.innerHTML += `<option value="${c}">${c}</option>`);

  const canais = listarCanais(transacoes);
  const selCanal = document.getElementById('extratoFilterCanal');
  if (selCanal) {
    selCanal.innerHTML = '<option value="">Todos os canais</option>';
    canais.forEach(canal => {
      const meta = getCanalMeta(canal);
      selCanal.innerHTML += `<option value="${meta.id}">${meta.icon} ${meta.label}</option>`;
    });
  }

  // Popula filtro de meses dinamicamente
  const meses   = [...new Set(transacoes.map(t => t.mes))].sort();
  const selMes  = document.getElementById('extratoFilterMes');
  selMes.innerHTML = '<option value="">Todos os meses</option>';
  meses.forEach(m => selMes.innerHTML += `<option value="${m}">${m}</option>`);
}

function buildExtratoCharts(transacoes, summaryReal) {
  if (_chartCategorias)       { _chartCategorias.destroy();       _chartCategorias       = null; }
  if (_chartBarrasCategorias) { _chartBarrasCategorias.destroy(); _chartBarrasCategorias = null; }
  if (_chartCanais)           { _chartCanais.destroy();           _chartCanais           = null; }

  const saidas    = transacoes.filter(t => t.tipo === 'saida');
  const catTotals = {};
  saidas.forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + t.valor; });
  const cats   = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const colors = ['#fc8181','#63b3ed','#68d391','#f6e05e','#b794f4','#f6ad55','#76e4f7','#fbb6ce','#a0aec0','#4fd1c5'];
  const doughnutLabels = cats.length ? cats : ['Sem dados'];
  const doughnutData   = cats.length ? cats.map(c => catTotals[c]) : [1];

  // Doughnut — breakdown por categoria
  _chartCategorias = new Chart(document.getElementById('chartExtratoCats'), {
    type: 'doughnut',
    data: {
      labels: doughnutLabels,
      datasets: [{ data: doughnutData, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 10 } } } },
      cutout: '60%',
    },
  });

  // Stacked bar — saídas por mês e categoria
  const meses    = summaryReal.map(m => m.mes);
  const datasets = cats.map((cat, i) => ({
    label: cat,
    data:  meses.map(m =>
      saidas.filter(t => t.mes === m && t.cat === cat).reduce((s, t) => s + t.valor, 0)
    ),
    backgroundColor: colors[i % colors.length],
    borderRadius: 4,
  }));

  _chartBarrasCategorias = new Chart(document.getElementById('chartExtratoBarCats'), {
    type: 'bar',
    data: { labels: meses, datasets },
    options: {
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 10 } } } },
      scales: {
        x: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
        y: { stacked: true, ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
      },
    },
  });

  const canalCanvas = document.getElementById('chartExtratoCanal');
  if (canalCanvas) {
    const canais = listarCanais(saidas);
    const canalColors = {
      pix: '#4fd1c5',
      transferencia: '#b794f4',
      cartao: '#7f9cf5',
      boleto: '#f6e05e',
      debito: '#63b3ed',
      outro: '#a0aec0',
    };
    const canalDatasets = canais.map(canal => {
      const meta = getCanalMeta(canal);
      return {
        label: `${meta.icon} ${meta.label}`,
        data: meses.map(m =>
          saidas
            .filter(t => t.mes === m && (t.canal || inferirCanal(t)) === canal)
            .reduce((s, t) => s + t.valor, 0)
        ),
        backgroundColor: canalColors[canal] || '#a0aec0',
        borderRadius: 4,
      };
    });

    _chartCanais = new Chart(canalCanvas, {
      type: 'bar',
      data: { labels: meses, datasets: canalDatasets },
      options: {
        plugins: { legend: { labels: { color: '#a0aec0', font: { size: 10 } } } },
        scales: {
          x: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: '#2d3748' } },
          y: { stacked: true, ticks: { color: '#a0aec0', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2d3748' } },
        },
      },
    });
  }
}

function buildExtratoFixosTable(transacoes, summaryReal) {
  const meses = summaryReal.map(m => m.mes);
  const tbody = document.getElementById('extratoFixosTable');
  tbody.innerHTML = '';

  const recorrentes = detectarDespesasRecorrentes(transacoes, meses);

  if (recorrentes.length === 0) {
    const colspan = 3 + meses.length;
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;color:#718096;padding:20px">Nenhuma despesa fixa recorrente detectada ainda.</td></tr>`;
    return;
  }

  recorrentes.forEach(({ desc, cat, valoresPorMes, media }) => {
    const vals = meses.map(m => valoresPorMes.get(m) || 0);
    const cells  = vals.map(v =>
      `<td style="text-align:right;color:${v > 0 ? '#fc8181' : '#718096'}">${v > 0 ? fmt(v) : '—'}</td>`
    ).join('');

    tbody.innerHTML += `
      <tr>
        <td><span class="badge badge-blue" style="font-size:0.72rem">${cat || '—'}</span></td>
        <td>${desc}</td>
        ${cells}
        <td style="text-align:right;font-weight:700;color:#f6ad55">${media > 0 ? fmt(media) : '—'}</td>
      </tr>`;
  });
}

function detectarDespesasRecorrentes(transacoes, meses) {
  const saidas = transacoes.filter(t => t.tipo === 'saida' && t.desc);
  const agrupado = new Map();

  saidas.forEach(t => {
    const key = t.desc.trim();
    if (!agrupado.has(key)) {
      agrupado.set(key, {
        desc: key,
        cat: t.cat || '—',
        valoresPorMes: new Map(),
      });
    }

    const item = agrupado.get(key);
    const atual = item.valoresPorMes.get(t.mes) || 0;
    item.valoresPorMes.set(t.mes, atual + t.valor);
  });

  return [...agrupado.values()]
    .filter(item => item.valoresPorMes.size >= 2)
    .map(item => {
      const total = [...item.valoresPorMes.values()].reduce((s, v) => s + v, 0);
      return {
        ...item,
        media: total / (meses.length || item.valoresPorMes.size || 1),
      };
    })
    .sort((a, b) => b.media - a.media);
}

function renderExtrato(data) {
  const tbody = document.getElementById('extratoTable');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#718096;padding:20px">Nenhuma movimentação importada.</td></tr>';
  } else {
    data.forEach((t, i) => {
      const isEntrada = t.tipo === 'entrada';
      const color = isEntrada ? '#68d391' : '#fc8181';
      const sign  = isEntrada ? '+' : '-';
      const bancoLabel = t.banco === 'nubank' ? 'Nubank' : t.banco === 'itau' ? 'Itaú' : null;
      const bancoClass = t.banco === 'nubank' ? 'badge-purple' : 'badge-yellow';
      const bancoBadge = bancoLabel ? `<span class="badge ${bancoClass}" style="font-size:0.7rem">${bancoLabel}</span>` : '';
      const canalMeta = getCanalMeta(t.canal || inferirCanal(t));
      const canalBadge = `<span class="badge ${canalMeta.badgeClass}">${canalMeta.icon} ${canalMeta.label}</span>`;
      tbody.innerHTML += `
        <tr>
          <td style="color:#718096">${i + 1}</td>
          <td>${t.data}</td>
          <td><span class="badge badge-blue">${t.mes}</span> ${bancoBadge}</td>
          <td>${t.desc}</td>
          <td><div class="cell-badges"><span class="badge ${isEntrada ? 'badge-green' : 'badge-red'}">${t.cat}</span>${canalBadge}</div></td>
          <td style="text-align:right;font-weight:600;color:${color}">${sign} ${fmt(t.valor)}</td>
        </tr>`;
    });
  }

  const totalE = data.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
  const totalS = data.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);
  document.getElementById('extratoCount').innerHTML =
    `${data.length} movimentaç${data.length === 1 ? 'ão' : 'ões'} · ` +
    `<span style="color:#68d391">▲ Entradas: ${fmt(totalE)}</span> &nbsp;·&nbsp; ` +
    `<span style="color:#fc8181">▼ Saídas: ${fmt(totalS)}</span>`;
}

export function filterExtrato() {
  const q    = document.getElementById('extratoSearch').value.toLowerCase();
  const mes  = document.getElementById('extratoFilterMes').value;
  const tipo = document.getElementById('extratoFilterTipo').value;
  const cat  = document.getElementById('extratoFilterCat').value;
  const canal = document.getElementById('extratoFilterCanal').value;
  const filtered = _transacoes.filter(t =>
    (!q    || t.desc.toLowerCase().includes(q)) &&
    (!mes  || t.mes  === mes) &&
    (!tipo || t.tipo === tipo) &&
    (!cat  || t.cat  === cat) &&
    (!canal || (t.canal || inferirCanal(t)) === canal)
  );
  renderExtrato(filtered);
}

export function clearExtratoFilters() {
  document.getElementById('extratoSearch').value = '';
  document.getElementById('extratoFilterMes').value = '';
  document.getElementById('extratoFilterTipo').value = '';
  document.getElementById('extratoFilterCat').value = '';
  document.getElementById('extratoFilterCanal').value = '';
  filterExtrato();
}
