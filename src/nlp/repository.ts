import { validateDocument, type AnalysisDocument } from './contract';
const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const r = indexedDB.open('sanno', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('documents', { keyPath: 'hash' });
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
});
export async function readAnalysis(hash: string): Promise<AnalysisDocument | null> {
  const db = await open();
  try {
    const data = await new Promise<{ doc: unknown } | undefined>((resolve, reject) => { const r = db.transaction('documents').objectStore('documents').get(hash); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    return data ? await validateDocument(data.doc, hash) : null;
  } catch { return null; } finally { db.close(); }
}
export async function saveAnalysis(doc: AnalysisDocument): Promise<void> {
  await validateDocument(doc);
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
    if (bytes > 100 * 1024 * 1024) { tx.abort(); return; }
    const read = store.getAll();
    read.onsuccess = () => {
      const rows = read.result.filter(row => row.hash !== doc.source.trackHash).sort((a, b) => a.updated - b.updated);
      let total = bytes + rows.reduce((sum, row) => sum + (row.bytes ?? new TextEncoder().encode(JSON.stringify(row.doc)).length), 0);
      for (const row of rows) { if (total <= 100 * 1024 * 1024) break; store.delete(row.hash); total -= row.bytes ?? new TextEncoder().encode(JSON.stringify(row.doc)).length; }
      store.put({ hash: doc.source.trackHash, doc, updated: Date.now(), bytes });
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

export async function listAnalyses(): Promise<{ hash: string; doc: AnalysisDocument; updated: number }[]> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const r = db.transaction('documents').objectStore('documents').getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  }); } finally { db.close(); }
}
