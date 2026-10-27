function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("farmrelay-accounts", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("drafts", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveDraft(userId, report) {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put({
        ...report,
        userId,
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function getDrafts(userId) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("drafts").objectStore("drafts").getAll();
      req.onsuccess = () =>
        resolve(
          req.result
            .filter((r) => r.userId === userId)
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function removeDraft(id) {
  const db = await open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function reportPayload(r) {
  return {
    clientId: r.id,
    crop: r.crop,
    community: r.community,
    symptom: r.symptom,
    onset: r.onset,
    description: r.description,
    affected: r.affected || "",
    audioLanguage: r.audioLanguage,
    photoDataUrl: r.photoDataUrl || undefined,
    audioDataUrl: r.audioDataUrl || undefined,
    photoWidth: r.photoWidth,
    photoHeight: r.photoHeight,
  };
}
