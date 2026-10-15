/**
 * MINI PHOTO STUDIO — Main application controller
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ─── Navigation ───────────────────────────────────────────────
  function showView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + name);
    if (view) view.classList.add('active');

    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));

    // Update URL hash without reload
    if (location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }
    if (name === 'home' || name === 'projects') {
      try { refreshProjects(); } catch (_) {}
    }
  }

  function bindNavigation() {
    // Nav buttons & logo & tool cards
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      e.preventDefault();
      const view = btn.dataset.view;
      if (view) showView(view);
    });

    $('#start-editing-btn')?.addEventListener('click', () => showView('photo'));

    // Home beauty theme chips
    document.querySelectorAll('#home-theme-picks .beauty-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.theme;
        applyTheme(t);
        document.querySelectorAll('#home-theme-picks .beauty-chip').forEach(b => b.classList.toggle('active', b === btn));
        const sel = document.getElementById('theme-select');
        if (sel) sel.value = t;
      });
    });
    document.getElementById('home-settings-btn')?.addEventListener('click', () => {
      document.getElementById('settings-modal')?.classList.remove('hidden');
      if (window.lucide) try { lucide.createIcons(); } catch(_){}
    });


    // Hash routing on load
    const hash = (location.hash || '#home').slice(1);
    if (['home', 'photo', 'video', 'avatar', 'projects'].includes(hash)) {
      showView(hash);
    }
  }

  // ─── Themes ───────────────────────────────────────────────────
  function applyTheme(name) {
    document.body.className = document.body.className
      .replace(/theme-[\w-]+/g, '')
      .trim();
    document.body.classList.add('theme-' + name);
    MPS.storage.setTheme(name);
    const sel = $('#theme-select');
    if (sel) sel.value = name;
  }

  function bindTheme() {
    const saved = MPS.storage.getTheme();
    applyTheme(saved);

    $('#theme-toggle')?.addEventListener('click', () => {
      const themes = ['neon-glass', 'midnight-purple', 'arctic-blue', 'minimal-dark', 'light'];
      const cur = themes.find(t => document.body.classList.contains('theme-' + t)) || 'neon-glass';
      const next = themes[(themes.indexOf(cur) + 1) % themes.length];
      applyTheme(next);
      MPS.toast('Тема: ' + next, 'info');
    });

    $('#theme-select')?.addEventListener('change', (e) => applyTheme(e.target.value));

    // Reduce motion
    if (MPS.storage.getReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduce-motion');
      const cb = $('#reduce-motion');
      if (cb) cb.checked = true;
    }
    $('#reduce-motion')?.addEventListener('change', (e) => {
      document.body.classList.toggle('reduce-motion', e.target.checked);
      MPS.storage.setReduceMotion(e.target.checked);
    });
  }

  // ─── Modals ───────────────────────────────────────────────────
  function bindModals() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.modal-close') || e.target.classList.contains('modal-backdrop')) {
        e.target.closest('.modal')?.classList.add('hidden');
      }
    });

    $('#settings-btn')?.addEventListener('click', () => {
      $('#settings-modal')?.classList.remove('hidden');
    });

    // Export confirm
    $('#export-confirm')?.addEventListener('click', async () => {
      const modal = $('#export-modal');
      const editor = modal?.dataset.editor;
      const format = $('#export-format')?.value || 'png';
      const quality = parseInt($('#export-quality')?.value || 92, 10);
      const btn = $('#export-confirm');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Скачивание…'; }
      try {
        if (editor === 'photo') {
          await MPS.PhotoEditor.doExport(format, quality);
          modal?.classList.add('hidden');
        } else if (editor === 'avatar') {
          await MPS.AvatarEditor.doExport(format, quality);
          modal?.classList.add('hidden');
        } else if (editor === 'video') {
          await MPS.VideoEditor.doExport();
        } else {
          MPS.toast('Откройте редактор и нажмите «Скачать файл»', 'info');
        }
      } catch (e) {
        console.error(e);
        MPS.toast('Не удалось скачать: ' + (e.message || e), 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="download"></i> Скачать файл';
          if (window.lucide) try { lucide.createIcons({ nodes: [btn] }); } catch(_){}
        }
      }
    });

    $('#export-format')?.addEventListener('change', (e) => {
      const qg = $('#export-quality-group');
      if (qg) qg.classList.toggle('hidden', e.target.value !== 'jpeg');
    });
    $('#export-quality')?.addEventListener('input', (e) => {
      const v = $('#val-export-quality');
      if (v) v.textContent = e.target.value;
    });
  }

  // ─── Command Palette (Ctrl+K) ─────────────────────────────────
  const COMMANDS = [
    { id: 'home', label: 'Главная', keys: '', action: () => showView('home') },
    { id: 'photo', label: 'Открыть фоторедактор', keys: '', action: () => showView('photo') },
    { id: 'video', label: 'Открыть видеоредактор', keys: '', action: () => showView('video') },
    { id: 'avatar', label: 'Открыть редактор аватарок', keys: '', action: () => showView('avatar') },
    { id: 'projects', label: 'Мои проекты', keys: '', action: () => showView('projects') },
    { id: 'upload-photo', label: 'Загрузить фотографию', keys: '', action: () => { showView('photo'); setTimeout(() => $('#photo-file-input')?.click(), 100); } },
    { id: 'upload-video', label: 'Загрузить видео', keys: '', action: () => { showView('video'); setTimeout(() => $('#video-file-input')?.click(), 100); } },
    { id: 'save', label: 'Сохранить проект', keys: 'Ctrl+S', action: () => triggerSave() },
    { id: 'undo', label: 'Отменить', keys: 'Ctrl+Z', action: () => MPS.PhotoEditor?.undo?.() },
    { id: 'redo', label: 'Повторить', keys: 'Ctrl+Y', action: () => MPS.PhotoEditor?.redo?.() },
    { id: 'export', label: 'Экспортировать', keys: '', action: () => triggerExport() },
    { id: 'theme', label: 'Переключить тему', keys: 'Ctrl+T', action: () => $('#theme-toggle')?.click() },
    { id: 'magic', label: 'Magic Enhance (фото)', keys: '', action: () => { showView('photo'); setTimeout(() => MPS.PhotoEditor?.magicEnhance?.(), 100); } },
  ];

  let cmdSelected = 0;

  function openCommandPalette() {
    const palette = $('#command-palette');
    if (!palette) return;
    palette.classList.remove('hidden');
    const input = $('#command-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    renderCommands('');
  }

  function closeCommandPalette() {
    $('#command-palette')?.classList.add('hidden');
  }

  function renderCommands(query) {
    const list = $('#command-list');
    if (!list) return;
    const q = query.toLowerCase().trim();
    const filtered = COMMANDS.filter(c => !q || c.label.toLowerCase().includes(q) || c.id.includes(q));
    cmdSelected = 0;
    list.innerHTML = filtered.map((c, i) => `
      <li class="command-item${i === 0 ? ' selected' : ''}" data-id="${c.id}" role="option">
        <span>${c.label}</span>
        ${c.keys ? `<kbd>${c.keys}</kbd>` : ''}
      </li>
    `).join('');

    list.querySelectorAll('.command-item').forEach(item => {
      item.addEventListener('click', () => {
        const cmd = COMMANDS.find(c => c.id === item.dataset.id);
        if (cmd) { cmd.action(); closeCommandPalette(); }
      });
    });
  }

  function bindCommandPalette() {
    $('#command-input')?.addEventListener('input', (e) => renderCommands(e.target.value));
    $('#command-input')?.addEventListener('keydown', (e) => {
      const items = $$('#command-list .command-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdSelected = Math.min(cmdSelected + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('selected', i === cmdSelected));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdSelected = Math.max(cmdSelected - 1, 0);
        items.forEach((it, i) => it.classList.toggle('selected', i === cmdSelected));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = items[cmdSelected];
        if (sel) {
          const cmd = COMMANDS.find(c => c.id === sel.dataset.id);
          if (cmd) { cmd.action(); closeCommandPalette(); }
        }
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    });
    $('.command-palette-backdrop')?.addEventListener('click', closeCommandPalette);
  }

  function triggerSave() {
    const active = $('.view.active')?.id;
    const p = (active === 'view-photo') ? MPS.PhotoEditor?.saveProject?.()
      : (active === 'view-video') ? MPS.VideoEditor?.saveProject?.()
      : (active === 'view-avatar') ? MPS.AvatarEditor?.saveProject?.()
      : null;
    if (p && typeof p.then === 'function') p.then(() => refreshProjects()).catch(() => {});
    else if (!p) MPS.toast('Откройте редактор для сохранения', 'info');
    else setTimeout(refreshProjects, 300);
  }

  function triggerExport() {
    const active = $('.view.active')?.id;
    if (active === 'view-photo') $('#photo-export-btn')?.click();
    else if (active === 'view-video') $('#video-export-btn')?.click();
    else if (active === 'view-avatar') $('#avatar-export-btn')?.click();
  }

  // ─── Global keyboard shortcuts ────────────────────────────────
  function bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't intercept when typing in inputs
      const tag = e.target.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

      if (MPS.utils.modKey(e) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (e.key === 'Escape') {
        closeCommandPalette();
        $$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
        return;
      }
      if (isInput) return;

      if (MPS.utils.modKey(e) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        triggerSave();
      }
      if (MPS.utils.modKey(e) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        MPS.PhotoEditor?.undo?.();
      }
      if (MPS.utils.modKey(e) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        MPS.PhotoEditor?.redo?.();
      }
      if (MPS.utils.modKey(e) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        $('#theme-toggle')?.click();
      }
    });
  }

  // ─── Projects list ────────────────────────────────────────────
  async function refreshProjects() {
    try {
      const list = await MPS.storage.listProjects();
      const homeEl = $('#home-projects');
      const pageEl = $('#projects-list');

      const render = (container) => {
        if (!container) return;
        if (!list.length) {
          container.innerHTML = `
            <div class="empty-card">
              <i data-lucide="folder-open"></i>
              <p>Проектов пока нет</p>
              <p class="hint">Создайте проект в любом редакторе и нажмите «Сохранить»</p>
            </div>`;
          if (window.lucide) lucide.createIcons({ nodes: container.querySelectorAll('[data-lucide]') });
          return;
        }
        container.innerHTML = list.map(p => {
          const date = new Date(p.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          const typeLabel = { photo: 'Фото', video: 'Видео', avatar: 'Аватар' }[p.type] || p.type;
          return `
            <div class="project-card" data-id="${p.id}" data-type="${p.type}">
              ${p.thumbnail ? `<img src="${p.thumbnail}" alt="" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />` : ''}
              <h4>${escapeHtml(p.name)}</h4>
              <div class="meta">${typeLabel} · ${date}</div>
              <div class="actions">
                <button class="btn btn-sm btn-primary open-project-btn">Открыть и править</button>
                <button class="btn btn-sm btn-ghost danger-btn delete-project-btn" title="Удалить"><i data-lucide="trash-2"></i></button>
              </div>
            </div>`;
        }).join('');
        if (window.lucide) lucide.createIcons({ nodes: container.querySelectorAll('[data-lucide]') });

        container.querySelectorAll('.open-project-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.project-card');
            openProject(card.dataset.id, card.dataset.type);
          });
        });
        container.querySelectorAll('.delete-project-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const card = btn.closest('.project-card');
            if (confirm('Удалить проект?')) {
              await MPS.storage.deleteProject(card.dataset.id);
              MPS.toast('Проект удалён', 'info');
              refreshProjects();
            }
          });
        });
      };

      render(homeEl);
      render(pageEl);
    } catch (err) {
      console.error('Projects load error', err);
    }
  }

  async function openProject(id, type) {
    const map = { photo: 'photo', video: 'video', avatar: 'avatar' };
    const view = map[type] || 'home';
    showView(view);
    try {
      const project = await MPS.storage.getProject(id);
      if (!project) {
        MPS.toast('Проект не найден', 'error');
        return;
      }
      if (type === 'photo' && MPS.PhotoEditor?.loadSavedProject) {
        await MPS.PhotoEditor.loadSavedProject(project);
      } else if (type === 'avatar' && MPS.AvatarEditor?.loadSavedProject) {
        await MPS.AvatarEditor.loadSavedProject(project);
      } else if (type === 'video') {
        showView('video');
        MPS.toast('Видео-проект: настройки восстановлены частично. Добавьте исходные файлы снова.', 'info');
        const ni = document.getElementById('video-project-name');
        if (ni && project.name) ni.value = project.name;
      } else {
        MPS.toast('Проект открыт из «Сохранённых»', 'success');
      }
    } catch (e) {
      console.error(e);
      MPS.toast('Не удалось открыть проект', 'error');
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  // ─── Cursor glow ──────────────────────────────────────────────
  function bindCursorGlow() {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);
    let visible = false;
    document.addEventListener('mousemove', (e) => {
      if (document.body.classList.contains('reduce-motion')) return;
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
      if (!visible) { glow.classList.add('visible'); visible = true; }
    });
    document.addEventListener('mouseleave', () => {
      glow.classList.remove('visible');
      visible = false;
    });
  }


  function applyStyleSettings() {
    const root = document.documentElement;
    const radius = localStorage.getItem('mps_radius') || '12';
    const glass = localStorage.getItem('mps_glass') || '75';
    const fontScale = localStorage.getItem('mps_font_scale') || '100';
    const accent = localStorage.getItem('mps_accent') || 'default';
    root.style.setProperty('--radius', radius + 'px');
    root.style.setProperty('--radius-sm', Math.max(4, parseInt(radius,10) - 4) + 'px');
    root.style.setProperty('--radius-lg', (parseInt(radius,10) + 4) + 'px');
    const g = parseInt(glass, 10) / 100;
    // glass opacity via body data attr for CSS
    document.body.dataset.glass = glass;
    document.body.dataset.fontScale = fontScale;
    document.body.style.fontSize = (parseInt(fontScale, 10) / 100 * 16) + 'px';
    if (accent === 'pink') {
      root.style.setProperty('--electric-purple', '#FF4FC8');
      root.style.setProperty('--accent', '#FF4FC8');
    } else if (accent === 'cyan') {
      root.style.setProperty('--electric-purple', '#21C8F6');
      root.style.setProperty('--accent', '#21C8F6');
    } else if (accent === 'green') {
      root.style.setProperty('--electric-purple', '#34D399');
      root.style.setProperty('--accent', '#34D399');
    } else {
      root.style.setProperty('--electric-purple', '#7657FF');
      root.style.setProperty('--accent', '#7657FF');
    }
    // sync UI
    const r = document.getElementById('style-radius');
    if (r) r.value = radius;
    const rv = document.getElementById('val-style-radius');
    if (rv) rv.textContent = radius + 'px';
    const gl = document.getElementById('style-glass');
    if (gl) gl.value = glass;
    const gv = document.getElementById('val-style-glass');
    if (gv) gv.textContent = glass + '%';
    const fs = document.getElementById('style-font');
    if (fs) fs.value = fontScale;
    const fv = document.getElementById('val-style-font');
    if (fv) fv.textContent = fontScale + '%';
    const ac = document.getElementById('style-accent');
    if (ac) ac.value = accent;
  }

  function bindStyleSettings() {
    applyStyleSettings();
    const on = (id, key, valEl) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        localStorage.setItem(key, el.value);
        if (valEl) {
          const v = document.getElementById(valEl);
          if (v) v.textContent = el.value + (valEl.includes('radius') ? 'px' : '%');
        }
        applyStyleSettings();
      });
      el.addEventListener('change', () => {
        localStorage.setItem(key, el.value);
        applyStyleSettings();
      });
    };
    on('style-radius', 'mps_radius', 'val-style-radius');
    on('style-glass', 'mps_glass', 'val-style-glass');
    on('style-font', 'mps_font_scale', 'val-style-font');
    const ac = document.getElementById('style-accent');
    if (ac) ac.addEventListener('change', () => {
      localStorage.setItem('mps_accent', ac.value);
      applyStyleSettings();
    });
  }

  // ─── Init ─────────────────────────────────────────────────────
  function init() {
    bindNavigation();
    bindTheme();
    bindModals();
    bindCommandPalette();
    bindShortcuts();
    bindCursorGlow();
    bindStyleSettings();

    // Editors
    try { MPS.PhotoEditor?.init(); } catch (e) { console.error('Photo init', e); }
    try { MPS.VideoEditor?.init(); } catch (e) { console.error('Video init', e); }
    try { MPS.AvatarEditor?.init(); } catch (e) { console.error('Avatar init', e); }

    // Icons
    if (window.lucide) {
      lucide.createIcons();
    }

    refreshProjects();
    window.addEventListener('mps:project-saved', () => refreshProjects());

    // New project button
    $('#new-project-btn')?.addEventListener('click', () => showView('photo'));

    console.log('%cMy Studio ready', 'color:#21C8F6;font-weight:bold');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
