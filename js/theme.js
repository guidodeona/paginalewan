(() => {
  'use strict';

  const STORAGE_KEY = 'activemos-theme';
  const root = document.documentElement;

  const currentTheme = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  const applyTheme = (theme) => {
    root.classList.add('theme-transitioning');
    root.setAttribute('data-theme', theme);
    window.setTimeout(() => root.classList.remove('theme-transitioning'), 350);
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
    });
  };

  const toggleTheme = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (err) { /* localStorage no disponible */ }
  };

  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
    btn.addEventListener('click', toggleTheme);
  });

  // Si el usuario nunca eligió manualmente, seguir la preferencia del sistema en vivo.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      let saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (err) { /* localStorage no disponible */ }
      if (!saved) applyTheme(event.matches ? 'dark' : 'light');
    });
  }
})();
