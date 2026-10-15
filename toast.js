window.MPS = window.MPS || {};

MPS.toast = (message, type = 'info', duration = 3200) => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = '0.2s';
    setTimeout(() => el.remove(), 220);
  }, duration);
};
