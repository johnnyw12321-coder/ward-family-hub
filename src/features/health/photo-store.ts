/**
 * Progress photos live only on this device, in IndexedDB — they're never
 * uploaded. Photos are kept per person, so two people sharing a phone each
 * see only their own. Browser only.
 */
export type ProgressPhoto = { id: string; userId: string; onDate: string; createdAt: number; blob: Blob };

const DB = "ward-health";
const STORE = "progress-photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("userId", "userId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listPhotos(userId: string): Promise<ProgressPhoto[]> {
  const rows = await run<ProgressPhoto[]>("readonly", (s) => s.index("userId").getAll(userId));
  return rows.sort((a, b) => a.onDate.localeCompare(b.onDate) || a.createdAt - b.createdAt);
}

export async function addPhoto(photo: ProgressPhoto): Promise<void> {
  await run("readwrite", (s) => s.put(photo));
}

export async function deletePhoto(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

export async function deleteAllPhotos(userId: string): Promise<void> {
  for (const p of await listPhotos(userId)) await deletePhoto(p.id);
}
