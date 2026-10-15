/**
 * MINI PHOTO STUDIO — Utility helpers
 */
window.MPS = window.MPS || {};

MPS.utils = {
  $(sel, root = document) {
    return root.querySelector(sel);
  },
  $$(sel, root = document) {
    return [...root.querySelectorAll(sel)];
  },
  on(el, ev, fn, opts) {
    if (!el) return;
    el.addEventListener(ev, fn, opts);
  },
  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  },
  formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
  downloadBlob(blob, filename) {
    if (!blob) return false;
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_) {}
        a.remove();
      }, 1500);
      return true;
    } catch (e) {
      console.error(e);
      // fallback open
      try {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        return true;
      } catch (e2) {
        return false;
      }
    }
  },
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      img.src = src;
    });
  },
  fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Ошибка чтения файла'));
      r.readAsDataURL(file);
    });
  },
  revoke(url) {
    if (url && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
  },
  debounce(fn, ms = 100) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },
  isMac() {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  },
  modKey(e) {
    return this.isMac() ? e.metaKey : e.ctrlKey;
  },
  generateId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
  /** Apply CSS-like filter string to canvas image data (for export) */
  applyFilterToCanvas(ctx, w, h, filterStr) {
    // For complex filters we re-render; simple path uses offscreen + drawImage with filter
  },
  createGradientLogo() {
    // already in HTML
  }
};
