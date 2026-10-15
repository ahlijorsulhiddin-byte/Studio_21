/**
 * PHOTO EDITOR — real canvas processing, filters, export
 */
window.MPS = window.MPS || {};

MPS.PhotoEditor = (() => {
  const FILTERS = [
    { id: 'original', name: 'Original', css: 'none' },
    { id: 'grayscale', name: 'Grayscale', css: 'grayscale(1)' },
    { id: 'bw', name: 'B&W', css: 'grayscale(1) contrast(1.2)' },
    { id: 'vintage', name: 'Vintage', css: 'sepia(0.45) contrast(1.1) brightness(0.95)' },
    { id: 'sepia', name: 'Sepia', css: 'sepia(0.8)' },
    { id: 'cyberpunk', name: 'Cyberpunk', css: 'hue-rotate(280deg) saturate(1.8) contrast(1.15)' },
    { id: 'cinema', name: 'Cinema', css: 'contrast(1.15) saturate(0.85) brightness(0.95)' },
    { id: 'warm', name: 'Warm', css: 'sepia(0.25) saturate(1.2)' },
    { id: 'cool', name: 'Cool', css: 'hue-rotate(180deg) saturate(0.9) brightness(1.05)' },
    { id: 'dreamy', name: 'Dreamy', css: 'brightness(1.08) contrast(0.9) saturate(1.15) blur(0.3px)' },
    { id: 'gaming', name: 'Gaming', css: 'saturate(1.6) contrast(1.2) brightness(1.05)' },
    { id: 'soft', name: 'Soft Colors', css: 'saturate(0.7) brightness(1.1) contrast(0.95)' }
  ];

  let state = {
    image: null,
    originalDataURL: null,
    objectURL: null,
    width: 0,
    height: 0,
    adjustments: {
      brightness: 0, contrast: 0, saturate: 0, temp: 0, hue: 0,
      sharpen: 0, blur: 0, vignette: 0
    },
    filter: 'original',
    filterIntensity: 100,
    rotation: 0,
    flipH: false,
    flipV: false,
    texts: [],
    stickers: [],
    emojiSize: 56,
    compareMode: false,
    comparePos: 0.5,
    cropMode: false,
    cropRatio: 'free',
    cropRect: null, // {x,y,w,h} in canvas coords
    projectName: 'Новый фотопроект'
  };

  let history = new MPS.History(30);
  let canvas, ctx, overlay, overlayCtx;
  let renderPending = false;

  function init() {
    canvas = document.getElementById('photo-canvas');
    overlay = document.getElementById('photo-overlay');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    overlayCtx = overlay.getContext('2d');

    buildFilterThumbs();
    bindUI();
    updateUI();
  }

  function buildFilterThumbs() {
    const grid = document.getElementById('photo-filters-grid');
    if (!grid) return;
    grid.innerHTML = '';
    FILTERS.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'filter-thumb' + (f.id === state.filter ? ' active' : '');
      btn.dataset.filter = f.id;
      btn.title = f.name;
      btn.innerHTML = `<span>${f.name}</span>`;
      btn.addEventListener('click', () => {
        state.filter = f.id;
        grid.querySelectorAll('.filter-thumb').forEach(b => b.classList.toggle('active', b.dataset.filter === f.id));
        pushHistory();
        render();
      });
      grid.appendChild(btn);
    });
  }

  function bindUI() {
    const $ = MPS.utils.$;
    const on = MPS.utils.on;

    const openFile = () => $('#photo-file-input')?.click();
    on($('#photo-upload-btn'), 'click', openFile);
    on($('#photo-upload-btn-side'), 'click', openFile);
    on($('#photo-replace-btn'), 'click', openFile);
    on($('#photo-start-crop'), 'click', startCropMode);
    MPS.utils.$$('.crop-ratio').forEach(btn => {
      on(btn, 'click', () => {
        MPS.utils.$$('.crop-ratio').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.cropRatio = btn.dataset.ratio || 'free';
        if (state.cropMode) initDefaultCropRect();
        drawCropOverlay();
      });
    });
    on($('#photo-apply-crop'), 'click', applyCrop);
    on($('#photo-reset-crop'), 'click', resetCrop);
    on($('#photo-file-input'), 'change', (e) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      e.target.value = '';
    });
    on($('#photo-clear-btn'), 'click', clearImage);

    // Drag & drop
    const area = $('#photo-canvas-area');
    on(area, 'dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
    on(area, 'dragleave', () => area.classList.remove('drag-over'));
    on(area, 'drop', (e) => {
      e.preventDefault();
      area.classList.remove('drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) loadFile(file);
      else MPS.toast('Поддерживаются только изображения', 'error');
    });

    // Adjustments
    const adjMap = {
      'adj-brightness': 'brightness', 'adj-contrast': 'contrast', 'adj-saturate': 'saturate',
      'adj-temp': 'temp', 'adj-hue': 'hue', 'adj-sharpen': 'sharpen',
      'adj-blur': 'blur', 'adj-vignette': 'vignette'
    };
    Object.entries(adjMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      on(el, 'input', () => {
        state.adjustments[key] = parseFloat(el.value);
        const valEl = document.getElementById('val-' + key);
        if (valEl) valEl.textContent = el.value;
        scheduleRender();
      });
      on(el, 'change', () => pushHistory());
    });

    on($('#filter-intensity'), 'input', (e) => {
      state.filterIntensity = parseInt(e.target.value, 10);
      const v = document.getElementById('val-filter-intensity');
      if (v) v.textContent = state.filterIntensity;
      scheduleRender();
    });
    on($('#filter-intensity'), 'change', () => pushHistory());

    on($('#photo-magic-enhance'), 'click', magicEnhance);
    on($('#photo-reset-adj'), 'click', () => {
      Object.keys(state.adjustments).forEach(k => state.adjustments[k] = 0);
      syncAdjSliders();
      pushHistory();
      render();
    });

    // Transform
    on($('#photo-rotate-left'), 'click', () => { state.rotation = (state.rotation - 90 + 360) % 360; pushHistory(); render(); });
    on($('#photo-rotate-right'), 'click', () => { state.rotation = (state.rotation + 90) % 360; pushHistory(); render(); });
    on($('#photo-flip-h'), 'click', () => { state.flipH = !state.flipH; pushHistory(); render(); });
    on($('#photo-flip-v'), 'click', () => { state.flipV = !state.flipV; pushHistory(); render(); });
    on($('#photo-reset-transform'), 'click', () => {
      state.rotation = 0; state.flipH = false; state.flipV = false;
      pushHistory(); render();
    });

    // Text
    on($('#photo-add-text'), 'click', addText);
    on($('#photo-new-project'), 'click', newProject);
    on($('#photo-emoji-size'), 'input', (e) => {
      state.emojiSize = parseInt(e.target.value, 10);
      const v = document.getElementById('val-photo-emoji-size');
      if (v) v.textContent = state.emojiSize;
      // resize all stickers or last one - resize all for simplicity when slider moves after select
      if (state.stickers && state.stickers.length) {
        state.stickers.forEach(s => { s.size = state.emojiSize; });
        render();
      }
    });
    // GIF panel
    on($('#photo-gif-upload-btn'), 'click', () => $('#photo-gif-file-input')?.click());
    on($('#photo-gif-file-input'), 'change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!f.type.includes('gif') && !f.name.toLowerCase().endsWith('.gif')) {
        MPS.toast('Выберите файл GIF', 'error');
        return;
      }
      try {
        await loadFile(f);
        MPS.toast('GIF загружен (первый кадр для правок; экспорт анимации — кнопка GIF)', 'success');
      } catch (err) {
        MPS.toast('Ошибка GIF', 'error');
      }
    });
    on($('#gif-frames'), 'input', (e) => {
      const el = document.getElementById('val-gif-frames');
      if (el) el.textContent = e.target.value;
    });
    on($('#gif-delay'), 'input', (e) => {
      const el = document.getElementById('val-gif-delay');
      if (el) el.textContent = e.target.value;
    });
    on($('#photo-gif-preview'), 'click', previewGif);
    on($('#photo-gif-export'), 'click', exportGif);
    MPS.utils.$$('#photo-stickers .sticker-btn').forEach(btn => {
      on(btn, 'click', () => {
        if (!state.image) { MPS.toast('Сначала загрузите фото', 'error'); return; }
        state.stickers.push({
          id: MPS.utils.generateId(),
          emoji: btn.dataset.emoji,
          x: 0.5 + (Math.random() - 0.5) * 0.4,
          y: 0.5 + (Math.random() - 0.5) * 0.4,
          size: state.emojiSize || 56
        });
        pushHistory();
        render();
        renderTextLayers();
        MPS.toast('Стикер добавлен', 'success');
      });
    });

    // Compare
    on($('#photo-toggle-compare'), 'click', toggleCompare);
    const slider = $('#photo-compare-slider');
    if (slider) {
      let dragging = false;
      on(slider, 'mousedown', (e) => { dragging = true; e.preventDefault(); });
      on(window, 'mousemove', (e) => {
        if (!dragging || !state.compareMode) return;
        const wrap = $('#photo-canvas-wrap');
        const rect = wrap.getBoundingClientRect();
        state.comparePos = MPS.utils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
        slider.style.left = (state.comparePos * 100) + '%';
        render();
      });
      on(window, 'mouseup', () => { dragging = false; });
    }


    // Drag stickers on canvas
    let stickerDrag = null;
    on(canvas, 'mousedown', (e) => {
      if (!state.stickers || !state.stickers.length || state.cropMode) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      for (let i = state.stickers.length - 1; i >= 0; i--) {
        const st = state.stickers[i];
        const r = (st.size / Math.max(canvas.width, 1)) * 0.8;
        const dx = nx - st.x, dy = ny - st.y;
        if (dx * dx + dy * dy < r * r) {
          stickerDrag = { id: st.id, ox: st.x, oy: st.y, mx: nx, my: ny };
          e.preventDefault();
          break;
        }
      }
    });
    on(window, 'mousemove', (e) => {
      if (!stickerDrag) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const st = state.stickers.find(s => s.id === stickerDrag.id);
      if (st) {
        st.x = MPS.utils.clamp(stickerDrag.ox + (nx - stickerDrag.mx), 0.02, 0.98);
        st.y = MPS.utils.clamp(stickerDrag.oy + (ny - stickerDrag.my), 0.02, 0.98);
        render();
      }
    });
    on(window, 'mouseup', () => {
      if (stickerDrag) {
        stickerDrag = null;
        pushHistory();
      }
    });

    // Tools (bottom bar)
    function selectTool(tool) {
      MPS.utils.$$('#photo-bottom-bar .tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      MPS.utils.$$('#photo-right .panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('photo-panel-' + tool);
      if (panel) panel.classList.add('active');
      if (tool === 'crop') {
        // ready for crop
      } else if (state.cropMode) {
        endCropMode(false);
      }
    }
    MPS.utils.$$('#photo-bottom-bar .tool-btn').forEach(btn => {
      on(btn, 'click', () => selectTool(btn.dataset.tool));
    });

    on($('#photo-undo'), 'click', undo);
    on($('#photo-redo'), 'click', redo);
    on($('#photo-save'), 'click', saveProject);
    on($('#photo-export-btn'), 'click', () => openExportModal());
    on($('#photo-project-name'), 'change', (e) => { state.projectName = e.target.value; });
  }

  async function loadFile(file) {
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i) && !file.type.startsWith('image/')) {
      MPS.toast('Неподдерживаемый формат. Используйте PNG, JPG или WebP', 'error');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      MPS.toast('Файл слишком большой (макс. ~40 МБ)', 'error');
      return;
    }
    try {
      MPS.utils.revoke(state.objectURL);
      state.objectURL = URL.createObjectURL(file);
      const img = await MPS.utils.loadImage(state.objectURL);
      state.image = img;
      state.width = img.naturalWidth;
      state.height = img.naturalHeight;
      state.originalDataURL = null; // keep original via image
      // reset edits
      state.adjustments = { brightness: 0, contrast: 0, saturate: 0, temp: 0, hue: 0, sharpen: 0, blur: 0, vignette: 0 };
      state.filter = 'original';
      state.filterIntensity = 100;
      state.rotation = 0;
      state.flipH = false;
      state.flipV = false;
      state.texts = [];
      state.stickers = [];
      state.compareMode = false;
      syncAdjSliders();
      document.getElementById('photo-placeholder')?.classList.add('hidden');
      document.getElementById('photo-replace-btn').disabled = false;
      document.getElementById('photo-clear-btn').disabled = false;
      history.clear();
      pushHistory();
      render();
      updateStatus();
      MPS.toast('Изображение загружено', 'success');
    } catch (err) {
      MPS.toast(err.message || 'Ошибка загрузки', 'error');
    }
  }

  function clearImage() {
    MPS.utils.revoke(state.objectURL);
    state.image = null;
    state.objectURL = null;
    canvas.width = 0; canvas.height = 0;
    document.getElementById('photo-placeholder')?.classList.remove('hidden');
    document.getElementById('photo-replace-btn').disabled = true;
    document.getElementById('photo-clear-btn').disabled = true;
    history.clear();
    updateUI();
    updateStatus();
  }

  function getCssFilter() {
    const a = state.adjustments;
    const parts = [];
    // brightness: -100..100 → 0..2
    parts.push(`brightness(${1 + a.brightness / 100})`);
    parts.push(`contrast(${1 + a.contrast / 100})`);
    parts.push(`saturate(${1 + a.saturate / 100})`);
    parts.push(`hue-rotate(${a.hue}deg)`);
    if (a.blur > 0) parts.push(`blur(${a.blur}px)`);
    // temperature approximation via sepia + hue
    if (a.temp > 0) parts.push(`sepia(${a.temp / 200})`);
    if (a.temp < 0) parts.push(`hue-rotate(${a.temp * 0.3}deg)`);

    const f = FILTERS.find(x => x.id === state.filter);
    if (f && f.id !== 'original' && state.filterIntensity > 0) {
      // intensity: blend is hard with pure CSS; we apply full filter and approximate intensity by mixing later if needed
      parts.push(f.css);
    }
    return parts.join(' ');
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }

  function render() {
    if (!state.image) return;
    const img = state.image;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const rot = state.rotation;
    if (rot === 90 || rot === 270) { const t = w; w = h; h = t; }

    // Limit display size for performance
    const maxSide = 1600;
    let scale = 1;
    if (Math.max(w, h) > maxSide) scale = maxSide / Math.max(w, h);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);

    canvas.width = dw;
    canvas.height = dh;
    overlay.width = dw;
    overlay.height = dh;

    ctx.save();
    ctx.clearRect(0, 0, dw, dh);
    ctx.translate(dw / 2, dh / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    ctx.filter = getCssFilter();
    const iw = (rot === 90 || rot === 270) ? dh : dw;
    const ih = (rot === 90 || rot === 270) ? dw : dh;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.filter = 'none';
    ctx.restore();

    // Vignette
    if (state.adjustments.vignette > 0) {
      const g = ctx.createRadialGradient(dw / 2, dh / 2, Math.min(dw, dh) * 0.3, dw / 2, dh / 2, Math.max(dw, dh) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${state.adjustments.vignette / 100})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, dw, dh);
    }

    // Sharpen approximation via convolution (light)
    if (state.adjustments.sharpen > 10) {
      // skip heavy for realtime; applied on export if needed
    }

    // Texts + stickers
    overlayCtx.clearRect(0, 0, dw, dh);
    state.texts.forEach(t => {
      overlayCtx.save();
      overlayCtx.font = `bold ${t.size}px Inter, sans-serif`;
      overlayCtx.fillStyle = t.color;
      overlayCtx.strokeStyle = '#000';
      overlayCtx.lineWidth = Math.max(2, t.size / 16);
      overlayCtx.textAlign = 'center';
      overlayCtx.strokeText(t.text, t.x * dw, t.y * dh);
      overlayCtx.fillText(t.text, t.x * dw, t.y * dh);
      overlayCtx.restore();
    });
    (state.stickers || []).forEach(st => {
      overlayCtx.save();
      overlayCtx.font = `${st.size}px serif`;
      overlayCtx.textAlign = 'center';
      overlayCtx.textBaseline = 'middle';
      overlayCtx.fillText(st.emoji, st.x * dw, st.y * dh);
      overlayCtx.restore();
    });

    // Compare mode: draw original on left
    if (state.compareMode && state.image) {
      const split = state.comparePos * dw;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, split, dh);
      ctx.clip();
      ctx.translate(dw / 2, dh / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
      ctx.filter = 'none';
      const iw2 = (rot === 90 || rot === 270) ? dh : dw;
      const ih2 = (rot === 90 || rot === 270) ? dw : dh;
      ctx.drawImage(img, -iw2 / 2, -ih2 / 2, iw2, ih2);
      ctx.restore();
    }

    updateUI();
  }

  function syncAdjSliders() {
    const a = state.adjustments;
    const map = {
      brightness: a.brightness, contrast: a.contrast, saturate: a.saturate,
      temp: a.temp, hue: a.hue, sharpen: a.sharpen, blur: a.blur, vignette: a.vignette
    };
    Object.entries(map).forEach(([k, v]) => {
      const el = document.getElementById('adj-' + k);
      if (el) el.value = v;
      const val = document.getElementById('val-' + k);
      if (val) val.textContent = v;
    });
    const fi = document.getElementById('filter-intensity');
    if (fi) fi.value = state.filterIntensity;
    const viv = document.getElementById('val-filter-intensity');
    if (viv) viv.textContent = state.filterIntensity;
  }

  function magicEnhance() {
    if (!state.image) { MPS.toast('Сначала загрузите изображение', 'error'); return; }
    state.adjustments.brightness = 8;
    state.adjustments.contrast = 12;
    state.adjustments.saturate = 10;
    state.adjustments.sharpen = 20;
    state.adjustments.vignette = 15;
    syncAdjSliders();
    pushHistory();
    render();
    MPS.toast('Magic Enhance применён', 'success');
  }

  function addText() {
    const input = document.getElementById('photo-text-input');
    const text = (input?.value || '').trim();
    if (!text) { MPS.toast('Введите текст', 'error'); return; }
    const size = parseInt(document.getElementById('photo-text-size')?.value || 48, 10);
    const color = document.getElementById('photo-text-color')?.value || '#ffffff';
    state.texts.push({ id: MPS.utils.generateId(), text, size, color, x: 0.5, y: 0.5 });
    if (input) input.value = '';
    pushHistory();
    render();
    renderTextLayers();
    MPS.toast('Текст добавлен', 'success');
  }

  function renderTextLayers() {
    const list = document.getElementById('photo-text-layers');
    if (!list) return;
    const textItems = state.texts.map(t => `
      <div class="layer-item" data-id="${t.id}" data-kind="text">
        <span class="layer-name">${t.text.slice(0, 24)}</span>
        <button class="icon-btn" data-action="del" title="Удалить"><i data-lucide="trash-2"></i></button>
      </div>
    `).join('');
    const stickerItems = (state.stickers || []).map(s => `
      <div class="layer-item" data-id="${s.id}" data-kind="sticker">
        <span class="layer-name">${s.emoji} стикер</span>
        <button class="icon-btn" data-action="del" title="Удалить"><i data-lucide="trash-2"></i></button>
      </div>
    `).join('');
    list.innerHTML = textItems + stickerItems;
    if (window.lucide) lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });
    list.querySelectorAll('[data-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.layer-item');
        const id = item.dataset.id;
        const kind = item.dataset.kind;
        if (kind === 'sticker') state.stickers = (state.stickers || []).filter(t => t.id !== id);
        else state.texts = state.texts.filter(t => t.id !== id);
        pushHistory();
        render();
        renderTextLayers();
      });
    });
  }

  function toggleCompare() {
    if (!state.image) return;
    state.compareMode = !state.compareMode;
    const slider = document.getElementById('photo-compare-slider');
    const btn = document.getElementById('photo-toggle-compare');
    if (state.compareMode) {
      slider?.classList.remove('hidden');
      if (btn) btn.textContent = 'Выключить сравнение';
    } else {
      slider?.classList.add('hidden');
      if (btn) btn.textContent = 'Включить сравнение';
    }
    render();
  }

  function getStateSnapshot() {
    return {
      adjustments: { ...state.adjustments },
      filter: state.filter,
      filterIntensity: state.filterIntensity,
      rotation: state.rotation,
      flipH: state.flipH,
      flipV: state.flipV,
      texts: JSON.parse(JSON.stringify(state.texts)),
      stickers: JSON.parse(JSON.stringify(state.stickers || []))
    };
  }

  function applySnapshot(s) {
    if (!s) return;
    state.adjustments = { ...s.adjustments };
    state.filter = s.filter;
    state.filterIntensity = s.filterIntensity;
    state.rotation = s.rotation;
    state.flipH = s.flipH;
    state.flipV = s.flipV;
    state.texts = s.texts || [];
    state.stickers = s.stickers || [];
    syncAdjSliders();
    render();
    renderTextLayers();
  }

  function pushHistory() {
    history.push(getStateSnapshot());
    updateUI();
  }

  function undo() {
    const s = history.undo();
    if (s) { applySnapshot(s); MPS.toast('Отменено', 'info'); }
    updateUI();
  }

  function redo() {
    const s = history.redo();
    if (s) { applySnapshot(s); MPS.toast('Повторено', 'info'); }
    updateUI();
  }

  function updateUI() {
    const undoBtn = document.getElementById('photo-undo');
    const redoBtn = document.getElementById('photo-redo');
    if (undoBtn) undoBtn.disabled = !history.canUndo();
    if (redoBtn) redoBtn.disabled = !history.canRedo();
  }

  function updateStatus() {
    const el = document.getElementById('photo-status');
    if (!el) return;
    if (!state.image) { el.textContent = ''; return; }
    el.textContent = `${state.width} × ${state.height} px`;
  }

  /** High-quality export canvas (full resolution) */
  function buildExportCanvas() {
    if (!state.image) return null;
    const img = state.image;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const rot = state.rotation;
    if (rot === 90 || rot === 270) { const t = w; w = h; h = t; }

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const c = off.getContext('2d');
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate((rot * Math.PI) / 180);
    c.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    c.filter = getCssFilter();
    const iw = (rot === 90 || rot === 270) ? h : w;
    const ih = (rot === 90 || rot === 270) ? w : h;
    c.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    c.filter = 'none';
    c.restore();

    if (state.adjustments.vignette > 0) {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${state.adjustments.vignette / 100})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }

    state.texts.forEach(t => {
      c.save();
      c.font = `bold ${t.size * (w / Math.max(canvas.width, 1))}px Inter, sans-serif`;
      c.fillStyle = t.color;
      c.strokeStyle = '#000';
      c.lineWidth = 4;
      c.textAlign = 'center';
      c.strokeText(t.text, t.x * w, t.y * h);
      c.fillText(t.text, t.x * w, t.y * h);
      c.restore();
    });
    (state.stickers || []).forEach(st => {
      c.save();
      const sc = w / Math.max(canvas.width, 1);
      c.font = `${st.size * sc}px serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(st.emoji, st.x * w, st.y * h);
      c.restore();
    });

    return off;
  }

  function openExportModal() {
    if (!state.image) { MPS.toast('Нет изображения для экспорта', 'error'); return; }
    const modal = document.getElementById('export-modal');
    modal?.classList.remove('hidden');
    const dims = document.getElementById('export-dims');
    let w = state.width, h = state.height;
    if (state.rotation === 90 || state.rotation === 270) { const t = w; w = h; h = t; }
    if (dims) dims.textContent = `${w} × ${h} px`;
    modal.dataset.editor = 'photo';
  }

  async function doExport(format, quality) {
    const off = buildExportCanvas();
    if (!off) return;
    return new Promise((resolve) => {
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const q = format === 'jpeg' ? quality / 100 : undefined;
      off.toBlob((blob) => {
        if (!blob) { MPS.toast('Ошибка экспорта', 'error'); resolve(null); return; }
        const name = (state.projectName || 'photo').replace(/[^\w\u0400-\u04FF\-]+/g, '_') + '.' + (format === 'jpeg' ? 'jpg' : 'png');
        MPS.utils.downloadBlob(blob, name);
        MPS.toast('Файл скачан в папку «Загрузки»', 'success');
        resolve(blob);
      }, mime, q);
    });
  }

  async function saveProject() {
    if (!state.image) { MPS.toast('Нечего сохранять', 'error'); return; }
    try {
      const off = buildExportCanvas();
      // Full result for reopen+edit (PNG). Thumbnail smaller for list.
      let resultDataURL;
      let thumb;
      try {
        resultDataURL = off.toDataURL('image/png');
        // limit size ~8MB for IndexedDB comfort
        if (resultDataURL.length > 8e6) {
          resultDataURL = off.toDataURL('image/jpeg', 0.92);
        }
        const thumbCv = document.createElement('canvas');
        const maxT = 320;
        const s = Math.min(1, maxT / Math.max(off.width, off.height));
        thumbCv.width = Math.max(1, Math.round(off.width * s));
        thumbCv.height = Math.max(1, Math.round(off.height * s));
        thumbCv.getContext('2d').drawImage(off, 0, 0, thumbCv.width, thumbCv.height);
        thumb = thumbCv.toDataURL('image/jpeg', 0.75);
      } catch (err) {
        resultDataURL = off.toDataURL('image/jpeg', 0.88);
        thumb = resultDataURL;
      }
      const project = {
        id: state.projectId || MPS.utils.generateId(),
        type: 'photo',
        name: state.projectName || 'Photo project',
        thumbnail: thumb,
        data: {
          // Baked result — open as new base image (edits already applied)
          resultDataURL: resultDataURL,
          width: off.width,
          height: off.height,
          baked: true,
          hasMedia: true
        },
        updatedAt: Date.now()
      };
      state.projectId = project.id;
      await MPS.storage.saveProject(project);
      try { window.dispatchEvent(new CustomEvent('mps:project-saved')); } catch(_){}
      MPS.toast('Проект в «Сохранённых». Студия очищена — откройте из списка, чтобы править дальше.', 'success');
      newProject(true);
    } catch (e) {
      console.error(e);
      MPS.toast('Ошибка сохранения: ' + (e.message || e), 'error');
    }
  }

  function getState() { return state; }


  function startCropMode() {
    if (!state.image) { MPS.toast('Сначала загрузите изображение', 'error'); return; }
    state.cropMode = true;
    const cropCv = document.getElementById('photo-crop-canvas');
    if (!cropCv) return;
    cropCv.width = canvas.width;
    cropCv.height = canvas.height;
    cropCv.classList.remove('hidden');
    initDefaultCropRect();
    drawCropOverlay();
    document.getElementById('photo-apply-crop').disabled = false;
    bindCropDrag();
    MPS.toast('Нарисуйте область или сдвиньте рамку, затем «Применить обрезку»', 'info');
  }

  function initDefaultCropRect() {
    const w = canvas.width, h = canvas.height;
    let rw = w * 0.7, rh = h * 0.7;
    const ratio = state.cropRatio;
    if (ratio === '1:1') { const s = Math.min(rw, rh); rw = s; rh = s; }
    else if (ratio === '4:5') { rh = rw * 5 / 4; if (rh > h * 0.9) { rh = h * 0.9; rw = rh * 4 / 5; } }
    else if (ratio === '16:9') { rh = rw * 9 / 16; if (rh > h * 0.9) { rh = h * 0.9; rw = rh * 16 / 9; } }
    else if (ratio === '9:16') { rw = rh * 9 / 16; if (rw > w * 0.9) { rw = w * 0.9; rh = rw * 16 / 9; } }
    state.cropRect = { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
  }

  function drawCropOverlay() {
    const cropCv = document.getElementById('photo-crop-canvas');
    if (!cropCv || !state.cropRect) return;
    const c = cropCv.getContext('2d');
    const { x, y, w, h } = state.cropRect;
    c.clearRect(0, 0, cropCv.width, cropCv.height);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, cropCv.width, cropCv.height);
    c.clearRect(x, y, w, h);
    c.strokeStyle = '#21C8F6';
    c.lineWidth = 2;
    c.strokeRect(x, y, w, h);
    // handles
    const hs = 8;
    c.fillStyle = '#21C8F6';
    [[x,y],[x+w,y],[x,y+h],[x+w,y+h],[x+w/2,y],[x+w/2,y+h],[x,y+h/2],[x+w,y+h/2]].forEach(([hx,hy]) => {
      c.fillRect(hx - hs/2, hy - hs/2, hs, hs);
    });
  }

  let cropDrag = null;
  function bindCropDrag() {
    const cropCv = document.getElementById('photo-crop-canvas');
    if (!cropCv || cropCv._cropBound) return;
    cropCv._cropBound = true;
    cropCv.addEventListener('mousedown', (e) => {
      if (!state.cropMode || !state.cropRect) return;
      const rect = cropCv.getBoundingClientRect();
      const scaleX = cropCv.width / rect.width;
      const scaleY = cropCv.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      const r = state.cropRect;
      cropDrag = { mx, my, ox: r.x, oy: r.y, ow: r.w, oh: r.h, mode: 'move' };
      // corner resize
      const tol = 14;
      if (Math.abs(mx - r.x) < tol && Math.abs(my - r.y) < tol) cropDrag.mode = 'nw';
      else if (Math.abs(mx - (r.x+r.w)) < tol && Math.abs(my - r.y) < tol) cropDrag.mode = 'ne';
      else if (Math.abs(mx - r.x) < tol && Math.abs(my - (r.y+r.h)) < tol) cropDrag.mode = 'sw';
      else if (Math.abs(mx - (r.x+r.w)) < tol && Math.abs(my - (r.y+r.h)) < tol) cropDrag.mode = 'se';
    });
    window.addEventListener('mousemove', (e) => {
      if (!cropDrag || !state.cropMode) return;
      const cropCv = document.getElementById('photo-crop-canvas');
      const rect = cropCv.getBoundingClientRect();
      const scaleX = cropCv.width / rect.width;
      const scaleY = cropCv.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      const dx = mx - cropDrag.mx;
      const dy = my - cropDrag.my;
      let { ox, oy, ow, oh } = cropDrag;
      let x = ox, y = oy, w = ow, h = oh;
      if (cropDrag.mode === 'move') { x = ox + dx; y = oy + dy; }
      else if (cropDrag.mode === 'se') { w = Math.max(20, ow + dx); h = Math.max(20, oh + dy); }
      else if (cropDrag.mode === 'nw') { x = ox + dx; y = oy + dy; w = Math.max(20, ow - dx); h = Math.max(20, oh - dy); }
      else if (cropDrag.mode === 'ne') { y = oy + dy; w = Math.max(20, ow + dx); h = Math.max(20, oh - dy); }
      else if (cropDrag.mode === 'sw') { x = ox + dx; w = Math.max(20, ow - dx); h = Math.max(20, oh + dy); }
      // aspect lock
      const ratio = state.cropRatio;
      if (ratio !== 'free' && cropDrag.mode !== 'move') {
        const map = { '1:1': 1, '4:5': 4/5, '16:9': 16/9, '9:16': 9/16 };
        const ar = map[ratio];
        if (ar) { h = w / ar; }
      }
      x = Math.max(0, Math.min(x, cropCv.width - 20));
      y = Math.max(0, Math.min(y, cropCv.height - 20));
      w = Math.min(w, cropCv.width - x);
      h = Math.min(h, cropCv.height - y);
      state.cropRect = { x, y, w, h };
      drawCropOverlay();
    });
    window.addEventListener('mouseup', () => { cropDrag = null; });
  }

  function applyCrop() {
    if (!state.image || !state.cropRect) return;
    // Render current full image to offscreen then crop
    const full = buildExportCanvas();
    if (!full) return;
    const scaleX = full.width / canvas.width;
    const scaleY = full.height / canvas.height;
    const r = state.cropRect;
    const sx = Math.round(r.x * scaleX);
    const sy = Math.round(r.y * scaleY);
    const sw = Math.round(r.w * scaleX);
    const sh = Math.round(r.h * scaleY);
    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, sw);
    cropped.height = Math.max(1, sh);
    cropped.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataURL = cropped.toDataURL('image/png');
    MPS.utils.loadImage(dataURL).then(img => {
      MPS.utils.revoke(state.objectURL);
      state.objectURL = null;
      state.image = img;
      state.width = img.naturalWidth;
      state.height = img.naturalHeight;
      // reset transforms after bake
      state.rotation = 0;
      state.flipH = false;
      state.flipV = false;
      state.adjustments = { brightness: 0, contrast: 0, saturate: 0, temp: 0, hue: 0, sharpen: 0, blur: 0, vignette: 0 };
      state.filter = 'original';
      state.texts = [];
      syncAdjSliders();
      endCropMode(true);
      pushHistory();
      render();
      updateStatus();
      MPS.toast('Сцена вырезана', 'success');
    });
  }

  function resetCrop() {
    endCropMode(false);
    MPS.toast('Обрезка сброшена', 'info');
  }

  function endCropMode() {
    state.cropMode = false;
    state.cropRect = null;
    const cropCv = document.getElementById('photo-crop-canvas');
    if (cropCv) {
      cropCv.classList.add('hidden');
      const c = cropCv.getContext('2d');
      c.clearRect(0, 0, cropCv.width, cropCv.height);
    }
    const btn = document.getElementById('photo-apply-crop');
    if (btn) btn.disabled = true;
  }


  function newProject(silent) {
    MPS.utils.revoke(state.objectURL);
    state.image = null;
    state.objectURL = null;
    state.projectId = null;
    state.projectName = 'New photo project';
    state.texts = [];
    state.stickers = [];
    state.adjustments = { brightness: 0, contrast: 0, saturate: 0, temp: 0, hue: 0, sharpen: 0, blur: 0, vignette: 0 };
    state.filter = 'original';
    state.rotation = 0;
    state.flipH = false;
    state.flipV = false;
    state.cropMode = false;
    history.clear();
    const nameInput = document.getElementById('photo-project-name');
    if (nameInput) nameInput.value = state.projectName;
    document.getElementById('photo-placeholder')?.classList.remove('hidden');
    document.getElementById('photo-replace-btn') && (document.getElementById('photo-replace-btn').disabled = true);
    document.getElementById('photo-clear-btn') && (document.getElementById('photo-clear-btn').disabled = true);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    syncAdjSliders();
    renderTextLayers();
    updateUI();
    updateStatus();
    MPS.toast('Новый проект. Сохранённые проекты остались в списке', 'info');
  }


  function buildFrameCanvas(frameIndex, totalFrames, effect) {
    const base = buildExportCanvas();
    if (!base) return null;
    const off = document.createElement('canvas');
    off.width = base.width;
    off.height = base.height;
    const c = off.getContext('2d');
    const t = totalFrames <= 1 ? 0 : frameIndex / (totalFrames - 1);
    c.save();
    if (effect === 'zoom') {
      const s = 1 + 0.12 * Math.sin(t * Math.PI * 2);
      c.translate(off.width/2, off.height/2);
      c.scale(s, s);
      c.drawImage(base, -off.width/2, -off.height/2);
    } else if (effect === 'pulse') {
      const b = 1 + 0.15 * Math.sin(t * Math.PI * 2);
      c.filter = 'brightness(' + b + ')';
      c.drawImage(base, 0, 0);
    } else if (effect === 'shake') {
      const dx = Math.sin(t * Math.PI * 8) * (off.width * 0.01);
      const dy = Math.cos(t * Math.PI * 6) * (off.height * 0.01);
      c.drawImage(base, dx, dy);
    } else if (effect === 'fade') {
      c.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      c.drawImage(base, 0, 0);
    } else {
      c.drawImage(base, 0, 0);
    }
    c.restore();
    return off;
  }

  function previewGif() {
    if (!state.image) { MPS.toast('Сначала загрузите изображение или GIF', 'error'); return; }
    const frames = parseInt(document.getElementById('gif-frames')?.value || 8, 10);
    const delay = parseInt(document.getElementById('gif-delay')?.value || 120, 10);
    const effect = document.getElementById('gif-effect')?.value || 'pulse';
    const status = document.getElementById('gif-status');
    if (status) status.textContent = 'Предпросмотр…';
    let i = 0;
    const tick = () => {
      const fr = buildFrameCanvas(i % frames, frames, effect);
      if (fr && canvas) {
        // show on main canvas scaled
        const maxSide = 1600;
        let w = fr.width, h = fr.height;
        let scale = 1;
        if (Math.max(w,h) > maxSide) scale = maxSide / Math.max(w,h);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.drawImage(fr, 0, 0, canvas.width, canvas.height);
      }
      i++;
      if (i < frames * 2) setTimeout(tick, delay);
      else if (status) status.textContent = 'Предпросмотр готов';
    };
    tick();
  }

  function exportGif() {
    if (!state.image) { MPS.toast('Сначала загрузите изображение', 'error'); return; }
    if (typeof GIF === 'undefined') {
      MPS.toast('Библиотека GIF не загрузилась (нужен интернет для CDN)', 'error');
      return;
    }
    const frames = parseInt(document.getElementById('gif-frames')?.value || 8, 10);
    const delay = parseInt(document.getElementById('gif-delay')?.value || 120, 10);
    const effect = document.getElementById('gif-effect')?.value || 'pulse';
    const status = document.getElementById('gif-status');
    if (status) status.textContent = 'Сборка GIF…';

    const first = buildFrameCanvas(0, frames, effect);
    if (!first) return;

    // Scale down for performance if huge
    let tw = first.width, th = first.height;
    const maxW = 640;
    if (tw > maxW) {
      const s = maxW / tw;
      tw = Math.round(tw * s);
      th = Math.round(th * s);
    }

    const gif = new GIF({
      workers: 2,
      quality: 12,
      width: tw,
      height: th,
      workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    });

    for (let i = 0; i < frames; i++) {
      const fr = buildFrameCanvas(i, frames, effect);
      const scaled = document.createElement('canvas');
      scaled.width = tw;
      scaled.height = th;
      scaled.getContext('2d').drawImage(fr, 0, 0, tw, th);
      gif.addFrame(scaled, { delay: delay, copy: true });
    }

    gif.on('finished', function(blob) {
      const name = (state.projectName || 'mystudio').replace(/[^\w\-]+/g, '_') + '.gif';
      MPS.utils.downloadBlob(blob, name);
      if (status) status.textContent = 'GIF сохранён';
      MPS.toast('GIF экспортирован', 'success');
    });
    gif.on('progress', function(p) {
      if (status) status.textContent = 'GIF: ' + Math.round(p * 100) + '%';
    });
    gif.render();
  }



  async function loadSavedProject(project) {
    if (!project) return;
    state.projectId = project.id;
    state.projectName = project.name || 'Photo project';
    const ni = document.getElementById('photo-project-name');
    if (ni) ni.value = state.projectName;

    const d = project.data || {};
    const src = d.resultDataURL || project.thumbnail;
    if (!src) {
      MPS.toast('В проекте нет изображения', 'error');
      return;
    }
    try {
      const img = await MPS.utils.loadImage(src);
      state.image = img;
      state.width = img.naturalWidth;
      state.height = img.naturalHeight;
      // Baked result — clean slate for further edits
      state.adjustments = { brightness: 0, contrast: 0, saturate: 0, temp: 0, hue: 0, sharpen: 0, blur: 0, vignette: 0 };
      state.filter = 'original';
      state.filterIntensity = 100;
      state.rotation = 0;
      state.flipH = false;
      state.flipV = false;
      state.texts = [];
      state.stickers = [];
      state.compareMode = false;
      state.cropMode = false;
      syncAdjSliders();
      document.getElementById('photo-placeholder')?.classList.add('hidden');
      const rb = document.getElementById('photo-replace-btn');
      const cb = document.getElementById('photo-clear-btn');
      if (rb) rb.disabled = false;
      if (cb) cb.disabled = false;
      history.clear();
      pushHistory();
      render();
      renderTextLayers();
      updateUI();
      updateStatus();
      MPS.toast('Проект открыт — можно смотреть и менять дальше', 'success');
    } catch (e) {
      console.error(e);
      MPS.toast('Не удалось открыть изображение проекта', 'error');
    }
  }

  return { init, loadFile, doExport, saveProject, undo, redo, getState, openExportModal, magicEnhance, newProject, loadSavedProject };

})();
