/**
 * VIDEO EDITOR — multi-clip timeline (CapCut-like basics), auto-subs, export
 */
window.MPS = window.MPS || {};

MPS.VideoEditor = (() => {
  const FILTERS = [
    { id: 'original', name: 'Original', css: 'none' },
    { id: 'grayscale', name: 'Grayscale', css: 'grayscale(1)' },
    { id: 'vintage', name: 'Vintage', css: 'sepia(0.4) contrast(1.1)' },
    { id: 'sepia', name: 'Sepia', css: 'sepia(0.8)' },
    { id: 'cyberpunk', name: 'Cyberpunk', css: 'hue-rotate(280deg) saturate(1.7)' },
    { id: 'cinema', name: 'Cinema', css: 'contrast(1.15) saturate(0.85)' },
    { id: 'blur', name: 'Blur', css: 'blur(3px)' },
    { id: 'warm', name: 'Warm', css: 'sepia(0.25) saturate(1.2)' },
    { id: 'cool', name: 'Cool', css: 'hue-rotate(180deg) saturate(0.9)' }
  ];

  const COLORS = ['#7657FF', '#21C8F6', '#FF4FC8', '#5EEAD4', '#F59E0B', '#EF4444', '#A78BFA'];

  let state = {
    clips: [],
    activeClipId: null,
    filter: 'original',
    filterIntensity: 100,
    speed: 1,
    texts: [],
    projectName: 'Новый видеопроект',
    projectId: null,
    mutedOriginal: false,
    pxPerSec: 48,
    timelineTime: 0
  };

  let videoEl, canvas, ctx;
  let isPlaying = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let replaceMode = false;

  function init() {
    videoEl = document.getElementById('video-preview');
    canvas = document.getElementById('video-canvas');
    if (!videoEl) return;
    ctx = canvas.getContext('2d');
    buildFilters();
    bindUI();
    renderTimeline();
  }

  function buildFilters() {
    const grid = document.getElementById('video-filters-grid');
    if (!grid) return;
    grid.innerHTML = '';
    FILTERS.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'filter-thumb' + (f.id === 'original' ? ' active' : '');
      btn.dataset.filter = f.id;
      btn.innerHTML = '<span>' + f.name + '</span>';
      btn.addEventListener('click', () => {
        state.filter = f.id;
        grid.querySelectorAll('.filter-thumb').forEach(b => b.classList.toggle('active', b.dataset.filter === f.id));
        applyPreviewFilter();
      });
      grid.appendChild(btn);
    });
  }

  function totalDuration() {
    return state.clips.reduce((s, c) => s + Math.max(0, c.trimEnd - c.trimStart), 0);
  }

  function activeClip() {
    return state.clips.find(c => c.id === state.activeClipId) || state.clips[0] || null;
  }

  function seqAt(t) {
    let acc = 0;
    for (let i = 0; i < state.clips.length; i++) {
      const c = state.clips[i];
      const len = Math.max(0.01, c.trimEnd - c.trimStart);
      if (t < acc + len) {
        return { clip: c, localTime: c.trimStart + (t - acc), index: i, clipStartSeq: acc, clipLen: len };
      }
      acc += len;
    }
    const last = state.clips[state.clips.length - 1];
    if (!last) return null;
    const len = Math.max(0.01, last.trimEnd - last.trimStart);
    return { clip: last, localTime: last.trimEnd, index: state.clips.length - 1, clipStartSeq: acc - len, clipLen: len };
  }

  function bindUI() {
    const $ = MPS.utils.$;
    const on = MPS.utils.on;

    const openFiles = (replace) => {
      replaceMode = !!replace;
      const inp = $('#video-file-input');
      if (inp) {
        inp.multiple = !replace;
        inp.click();
      }
    };
    on($('#video-upload-btn'), 'click', () => openFiles(false));
    on($('#video-upload-btn-side'), 'click', () => openFiles(false));
    on($('#video-replace-btn'), 'click', () => openFiles(true));
    on($('#video-new-project'), 'click', newProject);

    on($('#video-file-input'), 'change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      if (replaceMode) {
        state.clips.forEach(c => MPS.utils.revoke(c.url));
        state.clips = [];
        state.activeClipId = null;
      }
      for (const f of files) {
        if (!f.type.startsWith('video/')) continue;
        await addClipFromFile(f);
      }
      document.getElementById('video-placeholder')?.classList.add('hidden');
      const rb = document.getElementById('video-replace-btn');
      if (rb) rb.disabled = state.clips.length === 0;
      renderTimeline();
      if (state.clips.length) {
        await showClipAtSeq(0);
        MPS.toast('Клипов на timeline: ' + state.clips.length, 'success');
      }
    });

    on($('#video-play-pause'), 'click', togglePlay);
    on($('#video-mute'), 'click', () => {
      videoEl.muted = !videoEl.muted;
      updateMuteIcon();
    });
    on($('#video-volume'), 'input', (e) => { videoEl.volume = parseFloat(e.target.value); });
    on($('#video-seek'), 'input', (e) => {
      const tot = totalDuration();
      if (!tot) return;
      seekSeq((parseFloat(e.target.value) / 100) * tot);
    });

    on(videoEl, 'timeupdate', onVideoTimeUpdate);
    on(videoEl, 'ended', onClipEnded);

    on($('#video-speed'), 'input', (e) => {
      state.speed = parseFloat(e.target.value);
      videoEl.playbackRate = state.speed;
      const v = document.getElementById('val-speed');
      if (v) v.textContent = state.speed.toFixed(2) + '×';
    });

    on($('#vfilter-intensity'), 'input', (e) => {
      state.filterIntensity = parseInt(e.target.value, 10);
      const el = document.getElementById('val-vfilter-intensity');
      if (el) el.textContent = state.filterIntensity;
      applyPreviewFilter();
    });

    on($('#apply-trim'), 'click', applyTrim);
    on($('#tl-split'), 'click', splitAtPlayhead);
    on($('#tl-delete'), 'click', deleteActiveScene);
    on($('#tl-zoom-in'), 'click', () => { state.pxPerSec = Math.min(160, state.pxPerSec + 12); renderTimeline(); });
    on($('#tl-zoom-out'), 'click', () => { state.pxPerSec = Math.max(20, state.pxPerSec - 12); renderTimeline(); });

    on($('#video-add-text'), 'click', addText);
    on($('#video-auto-subs'), 'click', autoSubtitles);

    on($('#mute-original'), 'change', (e) => {
      state.mutedOriginal = e.target.checked;
      videoEl.muted = state.mutedOriginal;
      updateMuteIcon();
    });
    on($('#orig-volume'), 'input', (e) => {
      if (!state.mutedOriginal) videoEl.volume = parseFloat(e.target.value);
    });
    on($('#audio-upload-btn'), 'click', () => $('#audio-file-input')?.click());
    on($('#audio-file-input'), 'change', (e) => {
      if (e.target.files && e.target.files[0]) MPS.toast('Аудио отмечено (полная дорожка ограничена в браузере)', 'info');
      e.target.value = '';
    });

    function selectVideoTool(tool) {
      MPS.utils.$$('#video-bottom-bar .tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      MPS.utils.$$('#video-right .panel').forEach(p => p.classList.remove('active'));
      const map = { clip: 'video-panel-clip', filters: 'video-panel-filters', text: 'video-panel-text', audio: 'video-panel-audio' };
      const panel = document.getElementById(map[tool]);
      if (panel) panel.classList.add('active');
    }
    MPS.utils.$$('#video-bottom-bar .tool-btn').forEach(btn => {
      on(btn, 'click', () => selectVideoTool(btn.dataset.tool));
    });

    on($('#video-save'), 'click', saveProject);
    on($('#video-export-btn'), 'click', startExport);
    on($('#video-project-name'), 'change', (e) => { state.projectName = e.target.value; });


    // Draggable playhead (pink line)
    (function bindPlayheadDrag() {
      const ph = document.getElementById('playhead');
      const scroll = document.getElementById('timeline-scroll');
      const timeline = document.getElementById('timeline');
      if (!ph || !scroll || !timeline) return;
      let dragging = false;
      const hit = document.createElement('div');
      hit.className = 'playhead-hit';
      hit.title = 'Перетащите playhead';
      ph.appendChild(hit);
      ph.style.pointerEvents = 'auto';
      const onDown = (e) => {
        dragging = true;
        e.preventDefault();
        e.stopPropagation();
      };
      hit.addEventListener('mousedown', onDown);
      ph.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = timeline.getBoundingClientRect();
        const x = e.clientX - rect.left + (scroll.scrollLeft || 0);
        const t = Math.max(0, Math.min(totalDuration(), x / state.pxPerSec));
        seekSeq(t);
      });
      window.addEventListener('mouseup', () => { dragging = false; });
    })();

    const scroll = document.getElementById('timeline-scroll');
    on(scroll, 'click', (e) => {
      if (e.target.closest('.tl-clip')) return;
      const timeline = document.getElementById('timeline');
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const x = e.clientX - rect.left + (scroll.scrollLeft || 0);
      const t = Math.max(0, x / state.pxPerSec);
      seekSeq(Math.min(t, totalDuration()));
    });
  }

  function loadVideoMeta(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve({ duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => reject(new Error('read fail'));
      v.src = url;
    });
  }

  async function addClipFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const meta = await loadVideoMeta(url);
      const clip = {
        id: MPS.utils.generateId(),
        name: (file.name.replace(/\.[^.]+$/, '') || 'Клип').slice(0, 24),
        url: url,
        duration: meta.duration,
        trimStart: 0,
        trimEnd: meta.duration,
        color: COLORS[state.clips.length % COLORS.length],
        width: meta.width,
        height: meta.height
      };
      state.clips.push(clip);
      state.activeClipId = clip.id;
      return clip;
    } catch (e) {
      MPS.utils.revoke(url);
      MPS.toast('Ошибка файла: ' + file.name, 'error');
      return null;
    }
  }

  async function showClipAtSeq(t) {
    const info = seqAt(t);
    if (!info) return;
    state.timelineTime = t;
    state.activeClipId = info.clip.id;
    if (videoEl.getAttribute('src') !== info.clip.url && videoEl.src !== info.clip.url) {
      videoEl.src = info.clip.url;
      await new Promise(function(r) { videoEl.onloadeddata = r; videoEl.load(); });
    }
    try { videoEl.currentTime = info.localTime; } catch (_) {}
    videoEl.playbackRate = state.speed;
    applyPreviewFilter();
    syncTrimInputs();
    updateInfo();
    updatePlayhead();
    updateTimeDisplay();
    highlightActiveClip();
  }

  async function seekSeq(t) {
    const tot = totalDuration();
    t = MPS.utils.clamp(t, 0, Math.max(0, tot - 0.01));
    await showClipAtSeq(t);
    const seek = document.getElementById('video-seek');
    if (seek && tot) seek.value = (t / tot) * 100;
  }

  function onVideoTimeUpdate() {
    if (!isPlaying) return;
    const info = seqAt(state.timelineTime);
    if (!info) return;
    const local = videoEl.currentTime;
    const t = info.clipStartSeq + (local - info.clip.trimStart);
    state.timelineTime = Math.max(0, t);
    updatePlayhead();
    updateTimeDisplay();
    const tot = totalDuration();
    const seek = document.getElementById('video-seek');
    if (seek && tot) seek.value = (state.timelineTime / tot) * 100;
  }

  async function onClipEnded() {
    if (!isPlaying) return;
    const info = seqAt(state.timelineTime);
    if (!info) { stopPlay(); return; }
    const nextT = info.clipStartSeq + info.clipLen;
    if (nextT >= totalDuration() - 0.05) { stopPlay(); return; }
    await showClipAtSeq(nextT + 0.01);
    try { await videoEl.play(); } catch (_) { stopPlay(); }
  }

  async function togglePlay() {
    if (!state.clips.length) return;
    if (isPlaying) { videoEl.pause(); stopPlay(); return; }
    isPlaying = true;
    updatePlayIcon();
    const info = seqAt(state.timelineTime);
    if (!info) { stopPlay(); return; }
    if (!videoEl.src || videoEl.src.indexOf(info.clip.url) === -1) {
      videoEl.src = info.clip.url;
      await new Promise(function(r) { videoEl.onloadeddata = r; videoEl.load(); });
    }
    videoEl.currentTime = Math.max(info.clip.trimStart, Math.min(info.localTime, info.clip.trimEnd - 0.05));
    videoEl.playbackRate = state.speed;
    try {
      await videoEl.play();
      const watch = function() {
        if (!isPlaying) return;
        const inf = seqAt(state.timelineTime);
        if (!inf) return;
        if (videoEl.currentTime >= inf.clip.trimEnd - 0.08) {
          onClipEnded();
          return;
        }
        state.timelineTime = inf.clipStartSeq + (videoEl.currentTime - inf.clip.trimStart);
        updatePlayhead();
        updateTimeDisplay();
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    } catch (e) {
      stopPlay();
      MPS.toast('Не удалось воспроизвести', 'error');
    }
  }

  function stopPlay() {
    isPlaying = false;
    videoEl.pause();
    updatePlayIcon();
  }

  function updatePlayIcon() {
    const btn = document.getElementById('video-play-pause');
    if (!btn) return;
    btn.innerHTML = isPlaying ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }

  function updateMuteIcon() {
    const btn = document.getElementById('video-mute');
    if (!btn) return;
    btn.innerHTML = videoEl.muted ? '<i data-lucide="volume-x"></i>' : '<i data-lucide="volume-2"></i>';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }

  function applyPreviewFilter() {
    const f = FILTERS.find(x => x.id === state.filter);
    videoEl.style.filter = f ? f.css : 'none';
  }

  function syncTrimInputs() {
    const c = activeClip();
    if (!c) return;
    const a = document.getElementById('trim-start');
    const b = document.getElementById('trim-end');
    if (a) a.value = c.trimStart.toFixed(2);
    if (b) b.value = c.trimEnd.toFixed(2);
  }

  function applyTrim() {
    const c = activeClip();
    if (!c) { MPS.toast('Нет активной сцены', 'error'); return; }
    let start = parseFloat(document.getElementById('trim-start').value) || 0;
    let end = parseFloat(document.getElementById('trim-end').value) || c.duration;
    start = Math.max(0, Math.min(start, c.duration - 0.1));
    end = Math.max(start + 0.1, Math.min(end, c.duration));
    c.trimStart = start;
    c.trimEnd = end;
    renderTimeline();
    seekSeq(state.timelineTime);
    MPS.toast('Сцена обрезана: ' + start.toFixed(1) + '–' + end.toFixed(1) + ' с', 'success');
  }

  function splitAtPlayhead() {
    const info = seqAt(state.timelineTime);
    if (!info) { MPS.toast('Нет клипов', 'error'); return; }
    const c = info.clip;
    const local = info.localTime;
    if (local <= c.trimStart + 0.15 || local >= c.trimEnd - 0.15) {
      MPS.toast('Поставьте playhead внутрь сцены', 'info');
      return;
    }
    const second = {
      id: MPS.utils.generateId(),
      name: c.name + ' 2',
      url: c.url,
      duration: c.duration,
      trimStart: local,
      trimEnd: c.trimEnd,
      color: COLORS[state.clips.length % COLORS.length],
      width: c.width,
      height: c.height,
      sharedUrl: true
    };
    c.trimEnd = local;
    const idx = state.clips.findIndex(x => x.id === c.id);
    state.clips.splice(idx + 1, 0, second);
    state.activeClipId = second.id;
    renderTimeline();
    syncTrimInputs();
    MPS.toast('Сцена разрезана', 'success');
  }

  function deleteActiveScene() {
    if (!state.clips.length) return;
    const id = state.activeClipId || state.clips[0].id;
    const idx = state.clips.findIndex(c => c.id === id);
    if (idx < 0) return;
    const removed = state.clips.splice(idx, 1)[0];
    const stillUsed = state.clips.some(c => c.url === removed.url);
    if (!stillUsed) MPS.utils.revoke(removed.url);
    state.activeClipId = state.clips[Math.min(idx, state.clips.length - 1)] ? state.clips[Math.min(idx, state.clips.length - 1)].id : null;
    renderTimeline();
    if (state.clips.length) {
      seekSeq(0);
    } else {
      videoEl.removeAttribute('src');
      videoEl.load();
      document.getElementById('video-placeholder')?.classList.remove('hidden');
      const rb = document.getElementById('video-replace-btn');
      if (rb) rb.disabled = true;
      updateInfo();
    }
    MPS.toast('Сцена удалена', 'info');
  }

  function renderTimeline() {
    const track = document.getElementById('video-track');
    const timeline = document.getElementById('timeline');
    const ruler = document.getElementById('timeline-ruler');
    if (!track || !timeline) return;

    const tot = totalDuration();
    const width = Math.max(720, Math.ceil(Math.max(tot, 10) * state.pxPerSec) + 48);
    timeline.style.width = width + 'px';
    timeline.style.minWidth = width + 'px';

    if (ruler) {
      ruler.innerHTML = '';
      const step = state.pxPerSec >= 60 ? 1 : state.pxPerSec >= 36 ? 2 : 5;
      for (let t = 0; t <= tot + 0.01; t += step) {
        const mark = document.createElement('div');
        mark.className = 'ruler-mark';
        mark.style.left = (t * state.pxPerSec) + 'px';
        mark.innerHTML = '<span>' + MPS.utils.formatTime(t) + '</span>';
        ruler.appendChild(mark);
      }
    }

    track.innerHTML = '';
    let acc = 0;
    state.clips.forEach(function(c) {
      const len = Math.max(0.05, c.trimEnd - c.trimStart);
      const el = document.createElement('div');
      el.className = 'tl-clip' + (c.id === state.activeClipId ? ' active' : '');
      el.dataset.id = c.id;
      el.style.left = (acc * state.pxPerSec) + 'px';
      el.style.width = Math.max(28, len * state.pxPerSec) + 'px';
      el.style.background = 'linear-gradient(135deg, ' + c.color + 'cc, ' + c.color + '88)';
      el.innerHTML = '<span class="tl-clip-label">' + c.name + '</span><span class="tl-clip-dur">' + len.toFixed(1) + 's</span>';
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        state.activeClipId = c.id;
        seekSeq(acc + 0.01);
        highlightActiveClip();
        syncTrimInputs();
      });
      track.appendChild(el);
      acc += len;
    });

    const totalEl = document.getElementById('timeline-total');
    if (totalEl) totalEl.textContent = 'Всего: ' + MPS.utils.formatTime(tot);
    updatePlayhead();
  }

  function highlightActiveClip() {
    document.querySelectorAll('.tl-clip').forEach(function(el) {
      el.classList.toggle('active', el.dataset.id === state.activeClipId);
    });
  }

  function updatePlayhead() {
    const ph = document.getElementById('playhead');
    if (!ph) return;
    ph.style.left = (state.timelineTime * state.pxPerSec) + 'px';
  }

  function updateTimeDisplay() {
    const el = document.getElementById('video-time');
    if (el) el.textContent = MPS.utils.formatTime(state.timelineTime) + ' / ' + MPS.utils.formatTime(totalDuration());
  }

  function updateInfo() {
    const info = document.getElementById('video-info');
    if (!info) return;
    const c = activeClip();
    if (!c) {
      info.textContent = 'Нет видео — можно выбрать несколько файлов сразу';
      return;
    }
    info.textContent = c.name + ' · ' + (c.width || '?') + '×' + (c.height || '?') + ' · сцена ' + (c.trimEnd - c.trimStart).toFixed(1) + 'с · клипов: ' + state.clips.length;
  }

  function addText() {
    const text = ((document.getElementById('video-text-input') || {}).value || '').trim();
    if (!text) { MPS.toast('Введите текст', 'error'); return; }
    const size = parseInt((document.getElementById('video-text-size') || {}).value || 36, 10);
    const color = (document.getElementById('video-text-color') || {}).value || '#fff';
    const start = parseFloat((document.getElementById('video-text-start') || {}).value || 0);
    const end = parseFloat((document.getElementById('video-text-end') || {}).value || Math.min(5, totalDuration() || 5));
    state.texts.push({ id: MPS.utils.generateId(), text: text, size: size, color: color, start: start, end: end, x: 0.5, y: 0.85, isSub: true });
    document.getElementById('video-text-input').value = '';
    renderTextLayers();
    MPS.toast('Субтитр добавлен', 'success');
  }

  function autoSubtitles() {
    const tot = totalDuration();
    if (!tot) { MPS.toast('Сначала добавьте видео', 'error'); return; }
    const bulk = ((document.getElementById('video-auto-subs-text') || {}).value || '').trim();
    if (bulk) {
      const lines = bulk.split(/\n+/).map(function(s) { return s.trim(); }).filter(Boolean);
      const slice = tot / lines.length;
      state.texts = state.texts.filter(function(t) { return !t.auto; });
      lines.forEach(function(line, i) {
        state.texts.push({
          id: MPS.utils.generateId(),
          text: line,
          size: 32,
          color: '#ffffff',
          start: i * slice,
          end: Math.min(tot, (i + 1) * slice - 0.05),
          x: 0.5,
          y: 0.88,
          isSub: true,
          auto: true
        });
      });
      renderTextLayers();
      MPS.toast('Автосубтитры: ' + lines.length + ' фраз', 'success');
      return;
    }
    const slots = Math.max(3, Math.min(12, Math.ceil(tot / 4)));
    const slice = tot / slots;
    state.texts = state.texts.filter(function(t) { return !t.auto; });
    for (let i = 0; i < slots; i++) {
      state.texts.push({
        id: MPS.utils.generateId(),
        text: 'Субтитр ' + (i + 1),
        size: 32,
        color: '#ffffff',
        start: i * slice,
        end: Math.min(tot, (i + 1) * slice - 0.05),
        x: 0.5,
        y: 0.88,
        isSub: true,
        auto: true
      });
    }
    renderTextLayers();
    MPS.toast('Шаблоны субтитров по времени. Вставьте текст в поле выше для своих фраз.', 'info');
  }

  function renderTextLayers() {
    const list = document.getElementById('video-text-layers');
    if (!list) return;
    list.innerHTML = state.texts.map(function(t) {
      return '<div class="layer-item" data-id="' + t.id + '"><span class="layer-name">' + t.text.slice(0, 22) + ' (' + t.start.toFixed(1) + '–' + t.end.toFixed(1) + 'с)</span><button class="icon-btn" data-action="del"><i data-lucide="trash-2"></i></button></div>';
    }).join('');
    if (window.lucide) lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });
    list.querySelectorAll('[data-action="del"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const id = btn.closest('.layer-item').dataset.id;
        state.texts = state.texts.filter(function(t) { return t.id !== id; });
        renderTextLayers();
      });
    });
  }

  function startExport() {
    if (!state.clips.length) { MPS.toast('Сначала добавьте видео', 'error'); return; }
    if (!window.MediaRecorder) { MPS.toast('MediaRecorder не поддерживается', 'error'); return; }
    const modal = document.getElementById('export-modal');
    modal.classList.remove('hidden');
    modal.dataset.editor = 'video';
    document.getElementById('export-format').innerHTML = '<option value="webm">WebM</option>';
    document.getElementById('export-quality-group')?.classList.add('hidden');
    const c = activeClip();
    document.getElementById('export-dims').textContent = c ? ((c.width || 1280) + '×' + (c.height || 720)) : '—';
  }

  async function doExport() {
    const progressWrap = document.getElementById('export-progress-wrap');
    const progress = document.getElementById('export-progress');
    const status = document.getElementById('export-status');
    progressWrap?.classList.remove('hidden');
    if (status) status.textContent = 'Склейка и запись…';
    if (progress) progress.style.width = '3%';

    try {
      const first = state.clips[0];
      const w = first.width || 1280;
      const h = first.height || 720;
      canvas.width = w;
      canvas.height = h;
      const stream = canvas.captureStream(30);
      try {
        const vStream = videoEl.captureStream ? videoEl.captureStream() : (videoEl.mozCaptureStream ? videoEl.mozCaptureStream() : null);
        if (vStream && !state.mutedOriginal) {
          const at = vStream.getAudioTracks()[0];
          if (at) stream.addTrack(at);
        }
      } catch (_) {}

      recordedChunks = [];
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      mediaRecorder.ondataavailable = function(e) { if (e.data.size) recordedChunks.push(e.data); };

      const done = new Promise(function(resolve) {
        mediaRecorder.onstop = function() {
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          const name = (state.projectName || 'video').replace(/[^\w\u0400-\u04FF\-]+/g, '_') + '.webm';
          MPS.utils.downloadBlob(blob, name);
          MPS.toast('Видео скачано в «Загрузки» (WebM)', 'success');
          progressWrap?.classList.add('hidden');
          document.getElementById('export-modal')?.classList.add('hidden');
          canvas.classList.add('hidden');
          videoEl.style.display = '';
          resolve();
        };
      });

      mediaRecorder.start(100);
      canvas.classList.remove('hidden');
      videoEl.style.display = 'none';
      const tot = totalDuration();
      let seqT = 0;
      videoEl.playbackRate = state.speed;

      for (let i = 0; i < state.clips.length; i++) {
        const clip = state.clips[i];
        videoEl.src = clip.url;
        await new Promise(function(r) { videoEl.onloadeddata = r; videoEl.load(); });
        videoEl.currentTime = clip.trimStart;
        await videoEl.play().catch(function() {});

        await new Promise(function(resolve) {
          const draw = function() {
            if (videoEl.currentTime >= clip.trimEnd - 0.04 || videoEl.ended) {
              videoEl.pause();
              resolve();
              return;
            }
            ctx.save();
            const f = FILTERS.find(function(x) { return x.id === state.filter; });
            ctx.filter = f ? f.css : 'none';
            ctx.drawImage(videoEl, 0, 0, w, h);
            ctx.filter = 'none';
            const globalT = seqT + (videoEl.currentTime - clip.trimStart);
            state.texts.forEach(function(tx) {
              if (globalT >= tx.start && globalT <= tx.end) {
                ctx.font = 'bold ' + tx.size + 'px Inter, sans-serif';
                ctx.fillStyle = tx.color;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 4;
                ctx.textAlign = 'center';
                ctx.lineJoin = 'round';
                ctx.strokeText(tx.text, tx.x * w, tx.y * h);
                ctx.fillText(tx.text, tx.x * w, tx.y * h);
              }
            });
            ctx.restore();
            if (progress) progress.style.width = Math.min(95, (globalT / tot) * 100) + '%';
            requestAnimationFrame(draw);
          };
          requestAnimationFrame(draw);
        });
        seqT += (clip.trimEnd - clip.trimStart);
      }

      mediaRecorder.stop();
      await done;
    } catch (err) {
      console.error(err);
      MPS.toast('Ошибка экспорта: ' + (err.message || err), 'error');
      progressWrap?.classList.add('hidden');
    }
  }

  async function saveProject() {
    if (!state.clips.length) { MPS.toast('Нечего сохранять', 'error'); return; }
    try {
      if (!state.projectId) state.projectId = MPS.utils.generateId();
      const project = {
        id: state.projectId,
        type: 'video',
        name: state.projectName || 'Видеопроект',
        thumbnail: null,
        data: {
          clipsMeta: state.clips.map(function(c) {
            return { name: c.name, duration: c.duration, trimStart: c.trimStart, trimEnd: c.trimEnd };
          }),
          filter: state.filter,
          speed: state.speed,
          texts: state.texts,
          hasMedia: true
        },
        updatedAt: Date.now()
      };
      await MPS.storage.saveProject(project);
      try { window.dispatchEvent(new CustomEvent('mps:project-saved')); } catch (_) {}
      MPS.toast('Проект в «Сохранённых». Студия очищена.', 'success');
      newProject(true);
    } catch (e) {
      MPS.toast('Ошибка сохранения', 'error');
    }
  }

  function newProject(silent) {
    stopPlay();
    const seen = {};
    state.clips.forEach(function(c) {
      if (!seen[c.url]) {
        MPS.utils.revoke(c.url);
        seen[c.url] = true;
      }
    });
    state.clips = [];
    state.activeClipId = null;
    state.texts = [];
    state.filter = 'original';
    state.speed = 1;
    state.timelineTime = 0;
    state.projectId = null;
    state.projectName = 'New video project';
    const nameInput = document.getElementById('video-project-name');
    if (nameInput) nameInput.value = state.projectName;
    videoEl.removeAttribute('src');
    videoEl.load();
    document.getElementById('video-placeholder')?.classList.remove('hidden');
    const rb = document.getElementById('video-replace-btn');
    if (rb) rb.disabled = true;
    renderTimeline();
    renderTextLayers();
    updateInfo();
    updateTimeDisplay();
    if (!silent) MPS.toast('Новая студия. Открыть — из «Сохранённых проектов»', 'info');
  }

  return { init: init, doExport: doExport, saveProject: saveProject, newProject: newProject };
})();
