import { openDB, getAll, clearStore, bulkAdd, addItem, putItem } from '../db.js';
import {
  buildProjectionSimulatorConfigRecord,
  serializeProjectionSimulatorConfig,
} from './projection-simulator-config.js';

const CONFIG_VERSION = 1;

export async function exportConfig() {
  await openDB();

  const [assinaturas, despesasFixas, projecaoParametros] = await Promise.all([
    getAll('assinaturas'),
    getAll('despesas_fixas'),
    getAll('projecao_parametros'),
  ]);

  const payload = buildConfigPayload({
    assinaturas,
    despesasFixas,
    projectionSimulatorConfig: projecaoParametros[0] || null,
  });

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json;charset=utf-8' },
  );

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `gastos-config-${dateStamp}.json`;
  downloadJsonBlob(blob, fileName);
  return { nomeArquivo: fileName };
}

export async function importConfig(file) {
  try {
    await openDB();

    const rawText = await readTextFile(file);
    const normalized = normalizeConfigPayload(JSON.parse(rawText));

    const replace = confirm(
      'OK = substituir assinaturas, despesas fixas e, quando existir no arquivo, os parametros salvos da projecao.\n' +
      'Cancelar = mesclar apenas itens que ainda nao existem.',
    );
    const modo = replace ? 'substituir' : 'mesclar';

    const {
      assinaturas,
      despesas_fixas: despesasFixas,
      projecao_simulador: projecaoSimulador,
      hasProjectionSimulator,
    } = normalized;

    if (modo === 'substituir') {
      await clearStore('assinaturas');
      await clearStore('despesas_fixas');
      await bulkAdd('assinaturas', assinaturas);
      await bulkAdd('despesas_fixas', despesasFixas);
      if (hasProjectionSimulator) {
        await clearStore('projecao_parametros');
        if (projecaoSimulador) {
          await putItem('projecao_parametros', projecaoSimulador);
        }
      }
      return {
        importados: assinaturas.length + despesasFixas.length + (projecaoSimulador ? 1 : 0),
        modo,
      };
    }

    const [atuaisAssinaturas, atuaisDespesas, atuaisProjecaoParametros] = await Promise.all([
      getAll('assinaturas'),
      getAll('despesas_fixas'),
      getAll('projecao_parametros'),
    ]);

    const nomesExistentes = new Set(
      atuaisAssinaturas.map(item => normalizeKey(item.nome)),
    );
    const descsExistentes = new Set(
      atuaisDespesas.map(item => normalizeKey(item.desc ?? item.nome)),
    );

    let importados = 0;

    for (const assinatura of assinaturas) {
      const key = normalizeKey(assinatura.nome);
      if (key && !nomesExistentes.has(key)) {
        await addItem('assinaturas', assinatura);
        nomesExistentes.add(key);
        importados++;
      }
    }

    for (const despesa of despesasFixas) {
      const key = normalizeKey(despesa.desc);
      if (key && !descsExistentes.has(key)) {
        await addItem('despesas_fixas', despesa);
        descsExistentes.add(key);
        importados++;
      }
    }

    const projecaoSimuladorMesclada = mergeProjectionSimulatorConfig(
      atuaisProjecaoParametros[0] || null,
      hasProjectionSimulator ? projecaoSimulador : undefined,
    );

    if (hasProjectionSimulator && projecaoSimuladorMesclada && !atuaisProjecaoParametros[0]) {
      await putItem('projecao_parametros', projecaoSimuladorMesclada);
      importados++;
    }

    return { importados, modo };
  } catch (error) {
    return {
      importados: 0,
      modo: null,
      erro: error instanceof Error ? error.message : 'Falha ao importar configuracao.',
    };
  }
}

export function buildConfigPayload({
  assinaturas = [],
  despesasFixas = [],
  projectionSimulatorConfig = null,
  exportadoEm = new Date().toISOString(),
} = {}) {
  return {
    versao: CONFIG_VERSION,
    exportadoEm,
    assinaturas: assinaturas.map(normalizeAssinatura),
    despesas_fixas: despesasFixas.map(normalizeDespesa),
    projecao_simulador: serializeProjectionSimulatorConfig(projectionSimulatorConfig),
  };
}

export function normalizeConfigPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON invalido.');
  }

  if (parsed.versao !== CONFIG_VERSION) {
    throw new Error(`Versao de configuracao nao suportada: ${parsed.versao ?? 'ausente'}.`);
  }

  if (!Array.isArray(parsed.assinaturas) || !Array.isArray(parsed.despesas_fixas)) {
    throw new Error('Estrutura invalida: assinaturas e despesas_fixas devem ser listas.');
  }

  const hasProjectionSimulator = Object.prototype.hasOwnProperty.call(parsed, 'projecao_simulador');
  const projectionSimulator = hasProjectionSimulator
    ? normalizeProjectionSimulatorImport(parsed.projecao_simulador)
    : undefined;

  return {
    versao: CONFIG_VERSION,
    exportadoEm: String(parsed.exportadoEm ?? ''),
    assinaturas: parsed.assinaturas.map(normalizeAssinatura),
    despesas_fixas: parsed.despesas_fixas.map(normalizeDespesa),
    projecao_simulador: projectionSimulator,
    hasProjectionSimulator,
  };
}

export function mergeProjectionSimulatorConfig(currentConfig, importedConfig) {
  return currentConfig || importedConfig || null;
}

function normalizeAssinatura(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Assinatura invalida no JSON.');
  }

  const nome = String(item.nome ?? '').trim();
  const cat = String(item.cat ?? '').trim();
  const valor = Number(item.valor);
  const icon = String(item.icon ?? '✨').trim() || '✨';

  if (!nome || !cat || !Number.isFinite(valor) || valor <= 0) {
    throw new Error(`Assinatura invalida: ${nome || '(sem nome)'}.`);
  }

  return { icon, nome, cat, valor };
}

function normalizeDespesa(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Despesa fixa invalida no JSON.');
  }

  const cat = String(item.cat ?? '').trim();
  const desc = String(item.desc ?? item.nome ?? '').trim();
  const valor = Number(item.valor);
  const obs = String(item.obs ?? 'Mensal — importado de configuracao').trim() || 'Mensal — importado de configuracao';
  const recorrencia = String(item.recorrencia ?? 'fixa').trim() || 'fixa';
  const parcelas = item.parcelas && typeof item.parcelas === 'object'
    ? normalizeParcelas(item.parcelas)
    : (
        item.tipo && Number.isInteger(Number(item.pagas)) && Number.isInteger(Number(item.total)) && item.inicio
          ? normalizeParcelas({
              tipo: item.tipo,
              pagas: Number(item.pagas),
              total: Number(item.total),
              inicio: item.inicio,
            })
          : null
      );

  if (!cat || !desc || !Number.isFinite(valor) || valor <= 0) {
    throw new Error(`Despesa fixa invalida: ${desc || '(sem descricao)'}.`);
  }

  return { cat, desc, nome: desc, valor, obs, recorrencia, ...(parcelas ? { parcelas } : {}) };
}

function normalizeParcelas(item) {
  const tipo = String(item.tipo ?? '').trim();
  const pagas = Number(item.pagas);
  const total = Number(item.total);
  const inicio = String(item.inicio ?? '').trim();

  if (
    !['parcelamento', 'financiamento'].includes(tipo) ||
    !Number.isInteger(pagas) ||
    !Number.isInteger(total) ||
    pagas < 1 ||
    total < pagas ||
    !/^\d{4}-\d{2}$/.test(inicio)
  ) {
    throw new Error('Parcelamento/financiamento invalido na despesa fixa.');
  }

  return {
    tipo,
    label: tipo === 'financiamento' ? 'Financiamento' : 'Parcelamento',
    pagas,
    total,
    inicio,
  };
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function normalizeProjectionSimulatorImport(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Configuracao invalida: projecao_simulador deve ser um objeto ou null.');
  }
  return buildProjectionSimulatorConfigRecord(value, {});
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const text = String(event.target?.result ?? '');
      resolve(text.replace(/^\uFEFF/, ''));
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo JSON.'));
    reader.readAsText(file, 'utf-8');
  });
}

function downloadJsonBlob(blob, fileName) {
  const nav = window.navigator;
  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
