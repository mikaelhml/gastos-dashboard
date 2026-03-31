import { fmt, calcEndDate } from '../utils/formatters.js';
import { buildAliasLookup, buildDisplayNameMeta } from '../utils/display-names.js';
import { escapeHtml } from '../utils/dom.js';

function buildCardContent(d, cardClass, badgeClass, accentColor, progressGradient, aliases) {
  const p         = d.parcelas;
  const displayName = buildDisplayNameMeta(d.desc, { maxLength: 28, aliases });
  const restantes = p.total - p.pagas;
  const pct       = Math.round((p.pagas / p.total) * 100);
  const endDate   = calcEndDate(p.inicio, p.total);
  const saldo     = restantes * d.valor;
  const inicioDate = new Date(...p.inicio.split('-').map((v, i) => i === 1 ? v - 1 : +v), 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

  return `
    <div class="${cardClass}">
      <div class="pc-header">
        <div>
          <div class="pc-title" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</div>
          <div class="pc-cat">${d.cat} · ${p.label || ''}</div>
        </div>
        <div style="text-align:right">
          <div class="pc-valor">${fmt(d.valor)}</div>
          <div class="pc-sub">/mês</div>
        </div>
      </div>
      <div class="pc-prog">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span class="${badgeClass}">${p.tipo === 'financiamento' ? '🏦' : '📦'} Parcela ${p.pagas} de ${p.total}</span>
          <span style="font-size:0.8rem;color:${accentColor};font-weight:700">${pct}% pago</span>
        </div>
        <div class="pc-prog-bar-wrap">
          <div class="pc-prog-bar-fill" style="width:${pct}%;background:${progressGradient}"></div>
        </div>
      </div>
      <div class="pc-details">
        <div class="pc-detail-item">
          <span class="pc-detail-label">Restantes</span>
          <span class="pc-detail-value" style="color:${accentColor}">${restantes} parcelas</span>
        </div>
        <div class="pc-detail-item">
          <span class="pc-detail-label">Saldo devedor</span>
          <span class="pc-detail-value" style="color:#fc8181">${fmt(saldo)}</span>
        </div>
        <div class="pc-detail-item">
          <span class="pc-detail-label">Início</span>
          <span class="pc-detail-value">${inicioDate}</span>
        </div>
        <div class="pc-detail-item">
          <span class="pc-detail-label">Término previsto</span>
          <span class="pc-detail-value" style="color:#68d391">⏳ ${endDate}</span>
        </div>
      </div>
    </div>`;
}

/**
 * Renderiza a aba Parcelamentos.
 * @param {Array} despesasFixas
 * @param {Array} lancamentos
 */
export function buildParcelamentos(despesasFixas, lancamentos, transactionAliases = []) {
  const aliasLookup = buildAliasLookup(transactionAliases);
  const todos          = despesasFixas.filter(d => d.parcelas);
  const financiamentos = todos.filter(d => d.parcelas.tipo === 'financiamento');

  // ── FINANCIAMENTOS (azul) ──────────────────────────────────────────────────
  const financGrid   = document.getElementById('financGrid');
  financGrid.innerHTML = '';
  let financTotalMes = 0, financSaldo = 0;
  const financEndDates = [];

  financiamentos.forEach(d => {
    const p = d.parcelas;
    financTotalMes += d.valor;
    financSaldo    += (p.total - p.pagas) * d.valor;
    const [anoI, mesI] = p.inicio.split('-').map(Number);
    financEndDates.push(new Date(anoI, mesI - 1 + p.total, 1).getTime());
    financGrid.innerHTML += buildCardContent(
      d, 'financ-card', 'financ-badge', '#63b3ed', 'linear-gradient(90deg,#4299e1,#63b3ed)', aliasLookup
    );
  });

  document.getElementById('financTotalBar').textContent = fmt(financTotalMes);
  document.getElementById('financSaldoBar').textContent = fmt(financSaldo);
  if (financEndDates.length) {
    const avg = new Date(financEndDates.reduce((a, b) => a + b, 0) / financEndDates.length);
    document.getElementById('financMedioBar').textContent =
      avg.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  // ── PARCELAMENTOS DO CARTÃO (laranja) ─────────────────────────────────────
  const parcGrid   = document.getElementById('parcGrid');
  parcGrid.innerHTML = '';
  const parcLancs  = lancamentos.filter(l => l.parcela);
  const grupos     = {};
  parcLancs.forEach(l => {
    if (!grupos[l.desc]) grupos[l.desc] = [];
    grupos[l.desc].push(l);
  });

  let parcTotalMes = 0, parcSaldo = 0;
  const parcEndDates = [];
  let parcAtivos = 0;

  Object.entries(grupos).forEach(([desc, items]) => {
    const displayName = buildDisplayNameMeta(desc, { maxLength: 28, stripInstallmentSuffix: true, aliases: aliasLookup });
    items.sort((a, b) => {
      const [pa] = a.parcela.split('/').map(Number);
      const [pb] = b.parcela.split('/').map(Number);
      return pb - pa;
    });
    const latest       = items[0];
    const [atual, total] = latest.parcela.split('/').map(Number);
    const restantes    = total - atual;
    const pct          = Math.round((atual / total) * 100);
    const valorParcela = latest.valor;
    const saldo        = restantes * valorParcela;
    const totalCompraLabel = Number.isFinite(latest.totalCompra) ? fmt(latest.totalCompra) : '—';
    if (restantes <= 0) {
      return;
    }

    parcAtivos++;
    parcTotalMes      += valorParcela;
    parcSaldo         += saldo;

    // Estima término baseado no mês mais recente das faturas
    const todasFaturas = [...new Set(lancamentos.map(l => l.fatura))].sort();
    const ultimaFatura = todasFaturas[todasFaturas.length - 1] || 'Mar/2026';
    const mesesNomes   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const [mStr, aStr] = ultimaFatura.split('/');
    const mIdx         = mesesNomes.indexOf(mStr);
    let endM = mIdx + restantes;
    let endA = parseInt(aStr);
    while (endM >= 12) { endM -= 12; endA++; }
    const endDateStr = new Date(endA, endM, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    parcEndDates.push(new Date(endA, endM, 1).getTime());

    parcGrid.innerHTML += `
      <div class="parc-card">
        <div class="pc-header">
          <div>
            <div class="pc-title" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</div>
            <div class="pc-cat">Cartão de crédito · Compra parcelada</div>
          </div>
          <div style="text-align:right">
            <div class="pc-valor">${fmt(valorParcela)}</div>
            <div class="pc-sub">/mês</div>
          </div>
        </div>
        <div class="pc-prog">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span class="parcela-badge">📦 Parcela ${atual} de ${total}</span>
            <span style="font-size:0.8rem;color:#f6ad55;font-weight:700">${pct}% pago</span>
          </div>
          <div class="pc-prog-bar-wrap">
            <div class="pc-prog-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="pc-details">
          <div class="pc-detail-item">
            <span class="pc-detail-label">Restantes</span>
            <span class="pc-detail-value" style="color:#f6ad55">${restantes} parcelas</span>
          </div>
          <div class="pc-detail-item">
            <span class="pc-detail-label">Saldo restante</span>
            <span class="pc-detail-value" style="color:#fc8181">${fmt(saldo)}</span>
          </div>
          <div class="pc-detail-item">
            <span class="pc-detail-label">Total da compra</span>
            <span class="pc-detail-value">${totalCompraLabel}</span>
          </div>
          <div class="pc-detail-item">
            <span class="pc-detail-label">Última parcela</span>
            <span class="pc-detail-value" style="color:#68d391">⏳ ${endDateStr}</span>
          </div>
        </div>
      </div>`;
  });

  if (parcAtivos === 0) {
    parcGrid.innerHTML = `<div style="color:#718096;font-size:0.9rem;padding:12px 0">Nenhum parcelamento do cartão identificado.</div>`;
  }

  document.getElementById('parcTotalBar').textContent = fmt(parcTotalMes);
  document.getElementById('parcSaldoBar').textContent = fmt(parcSaldo);
  if (parcEndDates.length) {
    const avg = new Date(parcEndDates.reduce((a, b) => a + b, 0) / parcEndDates.length);
    document.getElementById('parcMedioBar').textContent =
      avg.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } else {
    document.getElementById('parcMedioBar').textContent = '—';
  }

  // ── TABELA DE LANÇAMENTOS PARCELADOS ──────────────────────────────────────
  const tbody = document.getElementById('parcLancTable');
  if (parcLancs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#718096;padding:20px">Nenhum parcelamento identificado nas faturas</td></tr>`;
    return;
  }

  const gruposOrdenados = {};
  parcLancs.forEach(l => {
    if (!gruposOrdenados[l.desc]) gruposOrdenados[l.desc] = [];
    gruposOrdenados[l.desc].push(l);
  });

  let i = 1;
  Object.entries(gruposOrdenados).forEach(([, items]) => {
    items.sort((a, b) => {
      const [pa] = a.parcela.split('/').map(Number);
      const [pb] = b.parcela.split('/').map(Number);
      return pa - pb;
    });
    items.forEach(l => {
      const displayName = buildDisplayNameMeta(l.desc, { maxLength: 36, stripInstallmentSuffix: true, aliases: aliasLookup });
      const [atual, total] = l.parcela.split('/').map(Number);
      const pct      = Math.round((atual / total) * 100);
      const restantes = total - atual;
      const totalCompraLabel = Number.isFinite(l.totalCompra) ? fmt(l.totalCompra) : '—';
      tbody.innerHTML += `
        <tr class="row-parcela">
          <td style="color:#718096">${i++}</td>
          <td>${l.data}</td>
          <td><span class="badge badge-blue">${l.fatura}</span></td>
          <td><span class="display-name display-name--compact" title="${escapeHtml(displayName.raw)}">${escapeHtml(displayName.short)}</span></td>
          <td>
            <div style="display:flex;flex-direction:column;gap:3px">
              <span class="parcela-badge">📦 ${l.parcela}</span>
              <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
                <div class="prog-bar-wrap" style="width:80px">
                  <div style="width:${pct}%;height:4px;background:linear-gradient(90deg,#f6ad55,#ed8936);border-radius:99px"></div>
                </div>
                <span style="font-size:0.72rem;color:#718096">${restantes} rest.</span>
              </div>
            </div>
          </td>
          <td style="text-align:right;font-weight:600;color:#f6ad55">${fmt(l.valor)}</td>
          <td style="text-align:right;color:#718096;font-size:0.85rem">${totalCompraLabel}</td>
        </tr>`;
    });
  });
}
