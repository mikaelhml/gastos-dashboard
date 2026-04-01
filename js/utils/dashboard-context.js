const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function buildCardBillSummaries(lancamentos = []) {
  const groups = new Map();

  for (const item of lancamentos) {
    if (!item || item.source === 'conta' || item.contextoDerivado) continue;

    const fatura = String(item?.fatura || item?.mes || '').trim();
    if (!fatura) continue;

    if (!groups.has(fatura)) {
      groups.set(fatura, {
        fatura,
        total: 0,
        quantidade: 0,
        parcelados: 0,
        categorias: new Set(),
      });
    }

    const group = groups.get(fatura);
    const valor = Number(item?.valor);
    group.total += Number.isFinite(valor) ? valor : 0;
    group.quantidade += 1;
    if (item?.parcela) group.parcelados += 1;
    if (item?.cat) group.categorias.add(String(item.cat));
  }

  return [...groups.values()]
    .map(item => ({
      ...item,
      categorias: [...item.categorias].sort(),
      media: item.quantidade > 0 ? item.total / item.quantidade : 0,
    }))
    .sort((a, b) => compareMonthLabel(b.fatura, a.fatura));
}

export function buildRegistratoContextRows(registratoResumos = [], targetMonths = [], tableType = 'extrato') {
  const resumoMap = new Map();
  for (const resumo of registratoResumos || []) {
    const key = String(resumo?.mesLabel || monthRefToLabel(resumo?.mesRef) || '').trim();
    if (key) resumoMap.set(key, resumo);
  }

  return [...new Set((targetMonths || []).map(item => String(item || '').trim()).filter(Boolean))]
    .map(label => buildContextRowFromResumo(resumoMap.get(label), label, tableType))
    .filter(Boolean)
    .sort((a, b) => compareMonthLabel(b.fatura || b.mes || '', a.fatura || a.mes || ''));
}

function buildContextRowFromResumo(resumo, label, tableType) {
  if (!resumo) return null;

  const mesRef = String(resumo?.mesRef || '').trim();
  const exposure = calcRegistratoExposureNoLimit(resumo);
  const mm = mesRef.slice(0, 2) || '01';
  const yyyy = mesRef.slice(3, 7) || '2000';
  const hasData = exposure > 0 || Number(resumo?.totalOperacoes || 0) > 0;
  const semRegistros = Boolean(resumo?.semRegistros);

  return {
    id: `registrato:${tableType}:${mesRef || label}`,
    source: 'registrato',
    tipo: 'contexto',
    contextoDerivado: true,
    fatura: label,
    mes: label,
    mesRef,
    data: `01/${mm}/${yyyy}`,
    desc: semRegistros
      ? 'Registrato SCR · Competência sem operações de crédito'
      : 'Registrato SCR · Contexto de crédito do período',
    cat: 'Contexto SCR',
    canal: 'outro',
    valor: exposure,
    registratoResumo: {
      emDia: Number(resumo?.emDia || 0),
      vencida: Number(resumo?.vencida || 0),
      outrosCompromissos: Number(resumo?.outrosCompromissos || 0),
      totalOperacoes: Number(resumo?.totalOperacoes || 0),
      semRegistros,
      hasData,
    },
  };
}

export function calcRegistratoExposureNoLimit(item) {
  return Number(item?.emDia || 0) + Number(item?.vencida || 0) + Number(item?.outrosCompromissos || 0);
}

function monthRefToLabel(mesRef) {
  const [mes, ano] = String(mesRef || '').split('/');
  const index = Number(mes) - 1;
  if (index < 0 || index >= MESES.length || !ano) return '';
  return `${MESES[index]}/${ano}`;
}

function compareMonthLabel(a, b) {
  return monthLabelToSort(a) - monthLabelToSort(b);
}

function monthLabelToSort(value) {
  const [mes, ano] = String(value || '').split('/');
  const mesIndex = MESES.indexOf(mes);
  return (Number(ano || 0) * 100) + (mesIndex >= 0 ? mesIndex + 1 : 0);
}
