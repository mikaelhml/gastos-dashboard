/**
 * db.js — Wrapper assíncrono para IndexedDB
 * Base de dados: "gastos_db_public"
 *
 * Stores:
 *   assinaturas       keyPath: id (auto)
 *   observacoes       keyPath: id (auto)
 *   despesas_fixas    keyPath: id (auto)
 *   lancamentos       keyPath: id (auto)
 *   extrato_transacoes keyPath: id (auto)
 *   extrato_summary   keyPath: mes (string único por mês)
 *   pdfs_importados   keyPath: hash
 */

export const DB_NAME = 'gastos_db_public';
const DB_VERSION = 5;

const STORE_DEFS = [
  { name: 'assinaturas',          keyPath: 'id',   autoIncrement: true  },
  { name: 'observacoes',          keyPath: 'id',   autoIncrement: true  },
  { name: 'despesas_fixas',       keyPath: 'id',   autoIncrement: true  },
  { name: 'lancamentos',          keyPath: 'id',   autoIncrement: true  },
  { name: 'extrato_transacoes',   keyPath: 'id',   autoIncrement: true  },
  { name: 'extrato_summary',      keyPath: 'mes',  autoIncrement: false },
  { name: 'pdfs_importados',      keyPath: 'hash', autoIncrement: false },
  { name: 'orcamentos',           keyPath: 'cat',  autoIncrement: false },
  { name: 'assinatura_sugestoes_dispensa', keyPath: 'key', autoIncrement: false },
  { name: 'registrato_sugestoes_dispensa', keyPath: 'key', autoIncrement: false },
  { name: 'registrato_scr_snapshot', keyPath: 'id', autoIncrement: false },
  { name: 'registrato_scr_resumo_mensal', keyPath: 'mesRef', autoIncrement: false },
];

export const FULL_BACKUP_STORE_NAMES = STORE_DEFS.map(store => store.name);

let _db = null;

// ── Abertura / criação do banco ───────────────────────────────────────────────

export function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      STORE_DEFS.forEach(s => {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, {
            keyPath: s.keyPath,
            autoIncrement: s.autoIncrement,
          });
        }
      });
    };

    req.onsuccess = e => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = e => reject(e.target.error);
  });
}

// ── Operações básicas ─────────────────────────────────────────────────────────

export function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export function count(storeName) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export function addItem(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).add(item);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export function putItem(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(item);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export function deleteItem(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

export function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// Insere múltiplos itens em uma única transação (performance)
export function bulkAdd(storeName, items) {
  return new Promise((resolve, reject) => {
    if (!items || items.length === 0) { resolve(); return; }
    const tx    = _db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.add(item));
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Popula cada store com os dados de seed apenas se estiver vazia.
 * @param {Object} seedData - { storeName: [items...] }
 */
export async function seedIfEmpty(seedData) {
  for (const [storeName, items] of Object.entries(seedData)) {
    const n = await count(storeName);
    if (n === 0 && items.length > 0) {
      await bulkAdd(storeName, items);
    }
  }
}

// ── Limpar base importada ─────────────────────────────────────────────────────

/**
 * Apaga todos os dados importados (extratos, lançamentos, PDFs).
 * Mantém assinaturas e despesas_fixas intactas.
 */
export async function clearAllImported() {
  await clearStore('extrato_transacoes');
  await clearStore('extrato_summary');
  await clearStore('lancamentos');
  await clearStore('pdfs_importados');
  await clearStore('assinatura_sugestoes_dispensa');
  await clearStore('registrato_sugestoes_dispensa');
  await clearStore('registrato_scr_snapshot');
  await clearStore('registrato_scr_resumo_mensal');
}

export async function clearAllData() {
  await clearStore('extrato_transacoes');
  await clearStore('extrato_summary');
  await clearStore('lancamentos');
  await clearStore('pdfs_importados');
  await clearStore('assinaturas');
  await clearStore('despesas_fixas');
  await clearStore('observacoes');
  await clearStore('orcamentos');
  await clearStore('assinatura_sugestoes_dispensa');
  await clearStore('registrato_sugestoes_dispensa');
  await clearStore('registrato_scr_snapshot');
  await clearStore('registrato_scr_resumo_mensal');
}

// ── Contagens para status ─────────────────────────────────────────────────────

export async function getStoreCounts() {
  const [assinaturas, despesas, lancamentos, transacoes, pdfs, registratoMeses] = await Promise.all([
    count('assinaturas'),
    count('despesas_fixas'),
    count('lancamentos'),
    count('extrato_transacoes'),
    count('pdfs_importados'),
    count('registrato_scr_resumo_mensal'),
  ]);
  return { assinaturas, despesas, lancamentos, transacoes, pdfs, registratoMeses };
}

export async function getAllStoresSnapshot(storeNames = FULL_BACKUP_STORE_NAMES) {
  await openDB();

  const entries = await Promise.all(
    storeNames.map(async storeName => [storeName, await getAll(storeName)]),
  );

  return Object.fromEntries(entries);
}

export async function replaceAllStoresFromBackup(storeMap) {
  await openDB();

  if (!storeMap || typeof storeMap !== 'object') {
    throw new Error('Backup invalido: stores ausentes.');
  }

  for (const storeName of FULL_BACKUP_STORE_NAMES) {
    if (!Array.isArray(storeMap[storeName])) {
      throw new Error(`Backup invalido: store "${storeName}" ausente ou malformada.`);
    }
  }

  return new Promise((resolve, reject) => {
    const tx = _db.transaction(FULL_BACKUP_STORE_NAMES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = event => reject(event.target.error);
    tx.onabort = event => reject(event.target.error || new Error('Falha ao restaurar o backup completo.'));

    try {
      for (const storeName of FULL_BACKUP_STORE_NAMES) {
        const store = tx.objectStore(storeName);
        store.clear();
        for (const item of storeMap[storeName]) {
          store.add(item);
        }
      }
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
