/**
 * IndexedDB project storage
 */
window.MPS = window.MPS || {};

MPS.storage = (() => {
  const DB_NAME = 'MiniPhotoStudio';
  const DB_VER = 1;
  const STORE = 'projects';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
    return dbPromise;
  }

  async function saveProject(project) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      project.updatedAt = Date.now();
      if (!project.createdAt) project.createdAt = project.updatedAt;
      if (!project.id) project.id = MPS.utils.generateId();
      const req = store.put(project);
      req.onsuccess = () => resolve(project);
      req.onerror = () => reject(req.error);
    });
  }

  async function getProject(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function listProjects() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('updatedAt').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteProject(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Theme preference in localStorage (small)
  function getTheme() {
    return localStorage.getItem('mps_theme') || 'neon-glass';
  }
  function setTheme(name) {
    localStorage.setItem('mps_theme', name);
  }
  function getReduceMotion() {
    return localStorage.getItem('mps_reduce_motion') === '1';
  }
  function setReduceMotion(v) {
    localStorage.setItem('mps_reduce_motion', v ? '1' : '0');
  }

  return { saveProject, getProject, listProjects, deleteProject, getTheme, setTheme, getReduceMotion, setReduceMotion };
})();
