import { openDB, getAll, clearStore, bulkAdd, addItem } from '../db.js';

const CONFIG_VERSION = 1;

export async function exportConfig() {
  await openDB();

  const [assinaturas, despesasFixas] = await Promise.all([
    getAll('assinaturas'),
    getAll('despesas_fixas'),
  ]);

  const payload = {
    versao: CONFIG_VERSION,
    exportadoEm: new Date().toISOString(),
    assinaturas: assinaturas.map(normalizeAssinatura),
    despesas_fixas: despesasFixas.map(normalizeDespesa),
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json;charset=utf-8' },
  );

  const dateStamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gastos-config-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function importConfig(file) {
  try {
    await openDB();

    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    validateConfig(parsed);

    const replace = confirm(
      'OK = substituir suas assinaturas e despesas fixas atuais.\n' +
      'Cancelar = mesclar apenas itens que ainda nao existem.',
    );
    const modo = replace ? 'substituir' : 'mesclar';

    const assinaturas = parsed.assinaturas.map(normalizeAssinatura);
    const despesasFixas = parsed.despesas_fixas.map(normalizeDespesa);

    if (modo === 'substituir') {
      await clearStore('assinaturas');
      await clearStore('despesas_fixas');
      await bulkAdd('assinaturas', assinaturas);
      await bulkAdd('despesas_fixas', despesasFixas);
      return {
        importados: assinaturas.length + despesasFixas.length,
        modo,
      };
    }

    const [atuaisAssinaturas, atuaisDespesas] = await Promise.all([
      getAll('assinaturas'),
      getAll('despesas_fixas'),
    ]);

    const nomesExistentes = new Set(
      atuaisAssinaturas.map(item => normalizeKey(item.nome)),
    );
    const descsExistentes = new Set(
      atuaisDespesas.map(item => normalizeKey(item.desc)),
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

    return { importados, modo };
  } catch (error) {
    return {
      importados: 0,
      modo: null,
      erro: error instanceof Error ? error.message : 'Falha ao importar configuracao.',
    };
  }
}

function validateConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON invalido.');
  }

  if (parsed.versao !== CONFIG_VERSION) {
    throw new Error(`Versao de configuracao nao suportada: ${parsed.versao ?? 'ausente'}.`);
  }

  if (!Array.isArray(parsed.assinaturas) || !Array.isArray(parsed.despesas_fixas)) {
    throw new Error('Estrutura invalida: assinaturas e despesas_fixas devem ser listas.');
  }
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
  const desc = String(item.desc ?? '').trim();
  const valor = Number(item.valor);
  const obs = String(item.obs ?? 'Mensal — importado de configuracao').trim() || 'Mensal — importado de configuracao';

  if (!cat || !desc || !Number.isFinite(valor) || valor <= 0) {
    throw new Error(`Despesa fixa invalida: ${desc || '(sem descricao)'}.`);
  }

  return { cat, desc, valor, obs };
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}
