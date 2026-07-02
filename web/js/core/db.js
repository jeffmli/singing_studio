// web/js/core/db.js
// IndexedDB persistence for takes + sessions. Bodies copied verbatim from the
// legacy app.js — schema and behavior must stay identical so existing data survives.
const dbName = "singing-practice-recordings";
const dbVersion = 2;

export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("takes")) {
        db.createObjectStore("takes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeTake(take) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("takes", "readwrite");
    tx.objectStore("takes").put(take);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readTakes() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("takes", "readonly");
    const request = tx.objectStore("takes").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

export async function getTake(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("takes", "readonly");
    const request = tx.objectStore("takes").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTake(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("takes", "readwrite");
    tx.objectStore("takes").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function writeSession(session) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sessions", "readwrite");
    tx.objectStore("sessions").put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readSessions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sessions", "readonly");
    const request = tx.objectStore("sessions").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.endedAt - a.endedAt));
    request.onerror = () => reject(request.error);
  });
}
