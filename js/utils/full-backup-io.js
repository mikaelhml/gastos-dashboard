import {
  DB_NAME,
  FULL_BACKUP_OPTIONAL_EMPTY_STORE_NAMES,
  FULL_BACKUP_STORE_NAMES,
  getAllStoresSnapshot,
  openDB,
  replaceAllStoresFromBackup,
} from '../db.js';

export const FULL_BACKUP_VERSION = 1;
const FULL_BACKUP_TYPE = 'gastos-dashboard-full-backup';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
}

export function normalizeFullBackupStoresForRestore(
  payloadStores,
  {
    requiredStoreNames = FULL_BACKUP_STORE_NAMES,
    optionalEmptyStoreNames = [],
  } = {},
) {
  ensureObject(payloadStores, 'Backup invalido: stores ausentes.');

  const optionalNames = new Set(optionalEmptyStoreNames);
  const normalizedStores = {};

  for (const storeName of requiredStoreNames) {
    const value = payloadStores[storeName];

    if (value === undefined && optionalNames.has(storeName)) {
      normalizedStores[storeName] = [];
      continue;
    }

    if (!Array.isArray(value)) {
      throw new Error(`Backup invalido: store "${storeName}" ausente ou malformada.`);
    }

    normalizedStores[storeName] = cloneValue(value);
  }

  return normalizedStores;
}

function getStoreRecordCount(stores = {}) {
  return FULL_BACKUP_STORE_NAMES.reduce((total, storeName) => total + (stores[storeName]?.length || 0), 0);
}

export function buildFullBackupPayload({
  stores,
  exportadoEm = new Date().toISOString(),
  dbName = DB_NAME,
} = {}) {
  ensureObject(stores, 'Backup invalido: stores ausentes.');

  const normalizedStores = {};
  for (const storeName of FULL_BACKUP_STORE_NAMES) {
    if (!Array.isArray(stores[storeName])) {
      throw new Error(`Backup invalido: store "${storeName}" ausente ou malformada.`);
    }
    normalizedStores[storeName] = cloneValue(stores[storeName]);
  }

  return {
    versao: FULL_BACKUP_VERSION,
    tipo: FULL_BACKUP_TYPE,
    exportadoEm,
    dbName,
    stores: normalizedStores,
  };
}

export function validateFullBackupPayload(payload) {
  ensureObject(payload, 'JSON invalido.');

  if (payload.versao !== FULL_BACKUP_VERSION) {
    throw new Error(`Versao de backup nao suportada: ${payload.versao ?? 'ausente'}.`);
  }

  if (payload.tipo !== FULL_BACKUP_TYPE) {
    throw new Error('Tipo de backup invalido.');
  }

  if (typeof payload.exportadoEm !== 'string' || !payload.exportadoEm.trim()) {
    throw new Error('Backup invalido: exportadoEm ausente.');
  }

  if (typeof payload.dbName !== 'string' || !payload.dbName.trim()) {
    throw new Error('Backup invalido: dbName ausente.');
  }

  ensureObject(payload.stores, 'Backup invalido: stores ausentes.');

  const stores = normalizeFullBackupStoresForRestore(payload.stores, {
    requiredStoreNames: FULL_BACKUP_STORE_NAMES,
    optionalEmptyStoreNames: FULL_BACKUP_OPTIONAL_EMPTY_STORE_NAMES,
  });

  return {
    versao: FULL_BACKUP_VERSION,
    tipo: FULL_BACKUP_TYPE,
    exportadoEm: payload.exportadoEm,
    dbName: payload.dbName,
    stores,
  };
}

export function summarizeFullBackupPayload(payload) {
  const normalized = validateFullBackupPayload(payload);
  const totalRegistros = getStoreRecordCount(normalized.stores);

  return {
    stores: FULL_BACKUP_STORE_NAMES.length,
    totalRegistros,
    storeNames: [...FULL_BACKUP_STORE_NAMES],
    exportadoEm: normalized.exportadoEm,
    dbName: normalized.dbName,
  };
}

export async function exportFullBackup() {
  await openDB();
  const stores = await getAllStoresSnapshot();
  const payload = buildFullBackupPayload({ stores });
  const resumo = summarizeFullBackupPayload(payload);

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json;charset=utf-8' },
  );

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `gastos-backup-completo-${dateStamp}.json`;
  downloadJsonBlob(blob, fileName);

  return {
    nomeArquivo: fileName,
    stores: resumo.stores,
    totalRegistros: resumo.totalRegistros,
  };
}

export async function readFullBackup(file) {
  const rawText = await readTextFile(file);
  const parsed = JSON.parse(rawText);
  const payload = validateFullBackupPayload(parsed);
  const resumo = summarizeFullBackupPayload(payload);

  return {
    payload,
    resumo,
    stores: resumo.stores,
    totalRegistros: resumo.totalRegistros,
  };
}

export async function applyFullBackupRestore(payload) {
  const normalized = validateFullBackupPayload(payload);
  await openDB();
  await replaceAllStoresFromBackup(normalized.stores);

  const resumo = summarizeFullBackupPayload(normalized);
  return {
    stores: resumo.stores,
    totalRegistros: resumo.totalRegistros,
  };
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
  }, 0);
}
