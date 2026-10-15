/**
 * AVATAR MAKER — layout like photo editor, emojis with drag
 */
window.MPS = window.MPS || {};

MPS.AvatarEditor = (() => {
  let state = {
    image: null,
    objectURL: null,
    shape: 'circle',
    exportSize: 256,
    scale: 1,
    rotate: 0,
    offsetX: 0,
    offsetY: 0,
    bgColor: '#151E32',
    transparent: false,
    border: 0,
    borderColor: '#7657FF',
    glow: 0,
    stickers: [],
    emojiSize: 48,
    projectId: null,
    projectName: 'Новая аватарка'
  };

  let canvas, ctx;
  let dragging = false; // image pan
  let stickerDrag = null;
  let lastX = 0, lastY = 0;

  function init() {
    canvas = document.getElementById('avatar-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = 480;
    canvas.height = 480;
    bindUI();
    render();
  }

  function bindUI() {
    const $ = MPS.utils.$;
    const on = MPS.utils.on;

    const openFile = () => $('#avatar-file-input')?.click();
    on($('#avatar-upload-btn'), 'click', openFile);
    on($('#avatar-upload-btn-side'), 'click', openFile);
    on($('#avatar-file-input'), 'change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        MPS.utils.revoke(state.objectURL);
        state.objectURL = URL.createObjectURL(f);
        state.image = await MPS.utils.loadImage(state.objectURL);
        state.scale = 1;
        state.rotate = 0;
        state.offsetX = 0;
        state.offsetY = 0;
        document.getElementById('avatar-placeholder')?.classList.add('hidden');
        syncSliders();
        render();
        MPS.toast('Фото загружено', 'success');
      } catch (err) {
        MPS.toast('Ошибка загрузки', 'error');
      }
      e.target.value = '';
    });

    MPS.utils.$$('.shape-btn').forEach(btn => {
      on(btn, 'click', () => {
        MPS.utils.$$('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.shape = btn.dataset.shape;
        render();
      });
    });

    MPS.utils.$$('.size-btn').forEach(btn => {
      on(btn, 'click', () => {
        MPS.utils.$$('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.exportSize = parseInt(btn.dataset.size, 10);
      });
    });

    on($('#avatar-scale'), 'input', (e) => {
      state.scale = parseFloat(e.target.value);
      document.getElementById('val-avatar-scale').textContent = state.scale.toFixed(2);
      render();
    });
    on($('#avatar-rotate'), 'input', (e) => {
      state.rotate = parseInt(e.target.value, 10);
      document.getElementById('val-avatar-rot').textContent = state.rotate + '°';
      render();
    });
    on($('#avatar-center'), 'click', () => {
      state.offsetX = 0; state.offsetY = 0; render();
    });
    on($('#avatar-reset-pos'), 'click', () => {
      state.scale = 1; state.rotate = 0; state.offsetX = 0; state.offsetY = 0;
      syncSliders(); render();
    });
    on($('#avatar-bg-color'), 'input', (e) => { state.bgColor = e.target.value; render(); });
    on($('#avatar-transparent'), 'change', (e) => { state.transparent = e.target.checked; render(); });
    on($('#avatar-border'), 'input', (e) => {
      state.border = parseInt(e.target.value, 10);
      document.getElementById('val-border').textContent = state.border;
      render();
    });
    on($('#avatar-border-color'), 'input', (e) => { state.borderColor = e.target.value; render(); });
    on($('#avatar-glow'), 'input', (e) => {
      state.glow = parseInt(e.target.value, 10);
      document.getElementById('val-glow').textContent = state.glow;
      render();
    });
    on($('#avatar-emoji-size'), 'input', (e) => {
      state.emojiSize = parseInt(e.target.value, 10);
      document.getElementById('val-avatar-emoji-size').textContent = state.emojiSize;
    });

    MPS.utils.$$('#avatar-stickers .sticker-btn').forEach(btn => {
      on(btn, 'click', () => {
        state.stickers.push({
          id: MPS.utils.generateId(),
          emoji: btn.dataset.emoji,
          x: 0.5 + (Math.random() - 0.5) * 0.35,
          y: 0.5 + (Math.random() - 0.5) * 0.35,
          size: state.emojiSize
        });
        render();
        renderEmojiLayers();
        MPS.toast('Эмодзи добавлен — перетащите на сцене', 'success');
      });
    });

    // Bottom tools
    function selectTool(tool) {
      MPS.utils.$$('#avatar-bottom-bar .tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      MPS.utils.$$('#avatar-right .panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('avatar-panel-' + tool);
      if (panel) panel.classList.add('active');
    }
    MPS.utils.$$('#avatar-bottom-bar .tool-btn').forEach(btn => {
      on(btn, 'click', () => selectTool(btn.dataset.tool));
    });

    // Pointer: sticker drag or image pan
    on(canvas, 'mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const hit = hitTestSticker(nx, ny);
      if (hit) {
        stickerDrag = { id: hit.id, ox: hit.x, oy: hit.y, mx: nx, my: ny };
        e.preventDefault();
        return;
      }
      if (!state.image) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    on(window, 'mousemove', (e) => {
      if (stickerDrag) {
        const rect = canvas.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const st = state.stickers.find(s => s.id === stickerDrag.id);
        if (st) {
          st.x = MPS.utils.clamp(stickerDrag.ox + (nx - stickerDrag.mx), 0.05, 0.95);
          st.y = MPS.utils.clamp(stickerDrag.oy + (ny - stickerDrag.my), 0.05, 0.95);
          render();
        }
        return;
      }
      if (!dragging) return;
      state.offsetX += (e.clientX - lastX);
      state.offsetY += (e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      render();
    });
    on(window, 'mouseup', () => {
      dragging = false;
      stickerDrag = null;
    });

    on($('#avatar-save'), 'click', saveProject);
    on($('#avatar-new-project'), 'click', newProject);
    on($('#avatar-export-btn'), 'click', () => {
      const modal = document.getElementById('export-modal');
      modal?.classList.remove('hidden');
      modal.dataset.editor = 'avatar';
      document.getElementById('export-format').innerHTML = '<option value="png">PNG</option><option value="jpeg">JPG</option>';
      document.getElementById('export-quality-group')?.classList.remove('hidden');
      document.getElementById('export-dims').textContent = `${state.exportSize} × ${state.exportSize}`;
    });
    on($('#avatar-project-name'), 'change', (e) => { state.projectName = e.target.value; });
  }

  function hitTestSticker(nx, ny) {
    const size = canvas.width || 480;
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const st = state.stickers[i];
      const r = (st.size / size) * 0.7;
      const dx = nx - st.x;
      const dy = ny - st.y;
      if (dx * dx + dy * dy < r * r) return st;
    }
    return null;
  }

  function syncSliders() {
    const s = document.getElementById('avatar-scale');
    if (s) s.value = state.scale;
    document.getElementById('val-avatar-scale').textContent = state.scale.toFixed(2);
    const r = document.getElementById('avatar-rotate');
    if (r) r.value = state.rotate;
    document.getElementById('val-avatar-rot').textContent = state.rotate + '°';
  }

  function clipShape(c, size, shape) {
    c.beginPath();
    if (shape === 'circle') {
      c.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    } else if (shape === 'rounded') {
      const rad = size * 0.2;
      if (c.roundRect) c.roundRect(0, 0, size, size, rad);
      else c.rect(0, 0, size, size);
    } else {
      c.rect(0, 0, size, size);
    }
    c.closePath();
    c.clip();
  }

  function render() {
    const size = 480;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    if (!state.transparent) {
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, size, size);
    }

    ctx.save();
    clipShape(ctx, size, state.shape);

    if (state.image) {
      const img = state.image;
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      const baseScale = size / minSide;
      const sc = baseScale * state.scale;
      const dw = img.naturalWidth * sc;
      const dh = img.naturalHeight * sc;
      ctx.translate(size / 2 + state.offsetX, size / 2 + state.offsetY);
      ctx.rotate((state.rotate * Math.PI) / 180);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();

    // Stickers on top (not clipped by shape - still inside canvas)
    state.stickers.forEach(st => {
      ctx.save();
      ctx.font = `${st.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.emoji, st.x * size, st.y * size);
      ctx.restore();
    });

    if (state.border > 0 || state.glow > 0) {
      ctx.save();
      if (state.glow > 0) {
        ctx.shadowColor = state.borderColor;
        ctx.shadowBlur = state.glow;
      }
      ctx.strokeStyle = state.borderColor;
      ctx.lineWidth = Math.max(1, state.border);
      ctx.beginPath();
      if (state.shape === 'circle') {
        ctx.arc(size / 2, size / 2, size / 2 - state.border / 2, 0, Math.PI * 2);
      } else if (state.shape === 'rounded') {
        const rad = size * 0.2;
        if (ctx.roundRect) ctx.roundRect(state.border / 2, state.border / 2, size - state.border, size - state.border, rad);
        else ctx.rect(state.border / 2, state.border / 2, size - state.border, size - state.border);
      } else {
        ctx.rect(state.border / 2, state.border / 2, size - state.border, size - state.border);
      }
      ctx.stroke();
      ctx.restore();
    }

    updateMiniPreviews();
  }

  function updateMiniPreviews() {
    const drawMini = (canvasEl, shape, s) => {
      if (!canvasEl) return;
      const c = canvasEl.getContext('2d');
      c.clearRect(0, 0, s, s);
      if (!state.transparent) {
        c.fillStyle = state.bgColor;
        c.fillRect(0, 0, s, s);
      }
      if (!state.image && !state.stickers.length) return;
      c.save();
      c.beginPath();
      if (shape === 'circle') c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      else c.rect(0, 0, s, s);
      c.clip();
      if (state.image) {
        const img = state.image;
        const minSide = Math.min(img.naturalWidth, img.naturalHeight);
        const sc = (s / minSide) * state.scale;
        const dw = img.naturalWidth * sc;
        const dh = img.naturalHeight * sc;
        c.translate(s / 2 + state.offsetX * (s / 480), s / 2 + state.offsetY * (s / 480));
        c.rotate((state.rotate * Math.PI) / 180);
        c.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      }
      c.restore();
      state.stickers.forEach(st => {
        c.font = `${Math.max(10, st.size * (s / 480))}px serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(st.emoji, st.x * s, st.y * s);
      });
    };
    drawMini(document.querySelector('#preview-square canvas'), 'square', 64);
    drawMini(document.querySelector('#preview-circle canvas'), 'circle', 64);
    drawMini(document.querySelector('#preview-small canvas'), state.shape, 32);
  }

  function renderEmojiLayers() {
    const list = document.getElementById('avatar-emoji-layers');
    if (!list) return;
    list.innerHTML = state.stickers.map(s => `
      <div class="layer-item" data-id="${s.id}">
        <span class="layer-name">${s.emoji}</span>
        <button class="icon-btn" data-action="del" title="Удалить"><i data-lucide="trash-2"></i></button>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });
    list.querySelectorAll('[data-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.layer-item').dataset.id;
        state.stickers = state.stickers.filter(s => s.id !== id);
        render();
        renderEmojiLayers();
      });
    });
  }

  function buildExportCanvas() {
    const size = state.exportSize;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const c = off.getContext('2d');

    if (!state.transparent) {
      c.fillStyle = state.bgColor;
      c.fillRect(0, 0, size, size);
    }

    c.save();
    c.beginPath();
    if (state.shape === 'circle') {
      c.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    } else if (state.shape === 'rounded') {
      const rad = size * 0.2;
      if (c.roundRect) c.roundRect(0, 0, size, size, rad);
      else c.rect(0, 0, size, size);
    } else {
      c.rect(0, 0, size, size);
    }
    c.clip();

    if (state.image) {
      const img = state.image;
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      const baseScale = size / minSide;
      const sc = baseScale * state.scale;
      const dw = img.naturalWidth * sc;
      const dh = img.naturalHeight * sc;
      const ox = state.offsetX * (size / 480);
      const oy = state.offsetY * (size / 480);
      c.translate(size / 2 + ox, size / 2 + oy);
      c.rotate((state.rotate * Math.PI) / 180);
      c.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    }
    c.restore();

    state.stickers.forEach(st => {
      c.save();
      c.font = `${st.size * (size / 480)}px serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(st.emoji, st.x * size, st.y * size);
      c.restore();
    });

    if (state.border > 0 || state.glow > 0) {
      c.save();
      if (state.glow > 0) {
        c.shadowColor = state.borderColor;
        c.shadowBlur = state.glow * (size / 480);
      }
      c.strokeStyle = state.borderColor;
      c.lineWidth = Math.max(1, state.border * (size / 480));
      c.beginPath();
      if (state.shape === 'circle') {
        c.arc(size / 2, size / 2, size / 2 - c.lineWidth / 2, 0, Math.PI * 2);
      } else {
        c.rect(c.lineWidth / 2, c.lineWidth / 2, size - c.lineWidth, size - c.lineWidth);
      }
      c.stroke();
      c.restore();
    }
    return off;
  }

  async function doExport(format, quality) {
    const off = buildExportCanvas();
    return new Promise(resolve => {
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      off.toBlob(blob => {
        if (!blob) { MPS.toast('Ошибка экспорта', 'error'); resolve(null); return; }
        const name = (state.projectName || 'avatar').replace(/[^\w\u0400-\u04FF\-]+/g, '_') + (format === 'jpeg' ? '.jpg' : '.png');
        MPS.utils.downloadBlob(blob, name);
        MPS.toast('Файл скачан в папку «Загрузки»', 'success');
        resolve(blob);
      }, mime, format === 'jpeg' ? quality / 100 : undefined);
    });
  }

  async function saveProject() {
    try {
      const off = buildExportCanvas();
      const thumb = off.toDataURL('image/png');
      if (!state.projectId) state.projectId = MPS.utils.generateId();
      const project = {
        id: state.projectId,
        type: 'avatar',
        name: state.projectName || 'Avatar',
        thumbnail: thumb,
        data: {
          resultDataURL: thumb,
          baked: true,
          shape: state.shape,
          exportSize: state.exportSize,
          scale: 1,
          rotate: 0,
          offsetX: 0,
          offsetY: 0,
          bgColor: state.bgColor,
          transparent: state.transparent,
          border: state.border,
          borderColor: state.borderColor,
          glow: state.glow,
          stickers: []
        },
        updatedAt: Date.now()
      };
      await MPS.storage.saveProject(project);
      try { window.dispatchEvent(new CustomEvent('mps:project-saved')); } catch (_) {}
      MPS.toast('Проект в «Сохранённых». Студия очищена.', 'success');
      newProject(true);
    } catch (e) {
      console.error(e);
      MPS.toast('Ошибка сохранения', 'error');
    }
  }

  function newProject(silent) {
    MPS.utils.revoke(state.objectURL);
    state.image = null;
    state.objectURL = null;
    state.projectId = null;
    state.projectName = 'New avatar';
    state.scale = 1;
    state.rotate = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    state.stickers = [];
    state.border = 0;
    state.glow = 0;
    state.transparent = false;
    state.bgColor = '#151E32';
    state.shape = 'circle';
    const ni = document.getElementById('avatar-project-name');
    if (ni) ni.value = state.projectName;
    document.getElementById('avatar-placeholder')?.classList.remove('hidden');
    MPS.utils.$$('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === 'circle'));
    syncSliders();
    render();
    renderEmojiLayers();
    if (!silent) MPS.toast('Новая студия. Открыть — из «Сохранённых проектов»', 'info');
  }

  async function loadSavedProject(project) {
    if (!project) return;
    state.projectId = project.id;
    state.projectName = project.name || 'Avatar';
    const ni = document.getElementById('avatar-project-name');
    if (ni) ni.value = state.projectName;
    const d = project.data || {};
    const src = d.resultDataURL || project.thumbnail;
    state.shape = d.shape || 'circle';
    state.exportSize = d.exportSize || 256;
    state.bgColor = d.bgColor || '#151E32';
    state.transparent = !!d.transparent;
    state.border = d.border || 0;
    state.borderColor = d.borderColor || '#7657FF';
    state.glow = d.glow || 0;
    // Baked image: reset pose so result looks correct
    state.scale = 1;
    state.rotate = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    state.stickers = [];
    if (!src) {
      MPS.toast('В проекте нет изображения', 'error');
      return;
    }
    try {
      state.image = await MPS.utils.loadImage(src);
      document.getElementById('avatar-placeholder')?.classList.add('hidden');
      MPS.utils.$$('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === state.shape));
      MPS.utils.$$('.size-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size, 10) === state.exportSize));
      const bc = document.getElementById('avatar-bg-color');
      if (bc) bc.value = state.bgColor;
      const br = document.getElementById('avatar-border');
      if (br) br.value = state.border;
      const gl = document.getElementById('avatar-glow');
      if (gl) gl.value = state.glow;
      document.getElementById('val-border') && (document.getElementById('val-border').textContent = state.border);
      document.getElementById('val-glow') && (document.getElementById('val-glow').textContent = state.glow);
      syncSliders();
      render();
      renderEmojiLayers();
      MPS.toast('Проект открыт — можно менять дальше', 'success');
    } catch (e) {
      console.error(e);
      MPS.toast('Не удалось открыть проект', 'error');
    }
  }

  return { init, doExport, saveProject, newProject, loadSavedProject };
})();
