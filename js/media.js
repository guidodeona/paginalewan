/*
 * Pagina de Multimedia: pestañas accesibles (Videos/Podcast/Galeria/Recursos)
 * + datos cargados desde data/media.json. Cada lista usa un estado vacio
 * honesto en vez de contenido inventado, listo para poblarse el dia que
 * haya videos/episodios/recursos reales o un backend que los sirva.
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/media\.js.*$/, '') : '';

  const EMPTY_MESSAGES = {
    videos: 'Todavía no subimos videos propios a esta sección. Mientras tanto, mirá el canal completo en YouTube.',
    podcast: 'El podcast está en camino. Seguinos en Instagram para enterarte apenas lancemos el primer episodio.',
    resources: 'Todavía no hay materiales para descargar. Pronto vamos a sumar guías y documentos.',
  };

  async function loadMedia() {
    try {
      const res = await fetch(BASE_PATH + 'data/media.json');
      if (!res.ok) throw new Error('no data');
      return await res.json();
    } catch (e) {
      return { videos: [], podcast: [], gallery: [], resources: [] };
    }
  }

  function renderEmpty(list, key) {
    list.innerHTML = `<p class="media-empty">${EMPTY_MESSAGES[key] || 'Todavía no hay contenido acá.'}</p>`;
  }

  function renderGallery(list, items) {
    if (!items.length) { renderEmpty(list, 'gallery'); return; }
    list.innerHTML = '';
    items.forEach((item) => {
      const fig = document.createElement('button');
      fig.type = 'button';
      fig.className = 'media-gallery-item reveal';
      fig.innerHTML = `<img src="${BASE_PATH}${item.src}" alt="${item.alt.replace(/"/g, '&quot;')}" loading="lazy">`;
      fig.addEventListener('click', () => openLightbox(BASE_PATH + item.src, item.alt));
      list.appendChild(fig);
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
      list.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    } else {
      list.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    }
  }

  function openLightbox(src, alt) {
    const lightbox = document.querySelector('[data-lightbox]');
    const img = lightbox.querySelector('[data-lightbox-img]');
    img.src = src;
    img.alt = alt;
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    lightbox.querySelector('[data-lightbox-close]').focus();
  }

  function closeLightbox() {
    const lightbox = document.querySelector('[data-lightbox]');
    lightbox.hidden = true;
    lightbox.querySelector('[data-lightbox-img]').src = '';
    document.body.classList.remove('lightbox-open');
  }

  function initLightbox() {
    const lightbox = document.querySelector('[data-lightbox]');
    if (!lightbox) return;
    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  function initTabs() {
    const tabs = Array.from(document.querySelectorAll('.media-tab'));
    if (!tabs.length) return;

    function activate(tab) {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      tab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (e) => {
        let target = null;
        if (e.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') target = tabs[0];
        else if (e.key === 'End') target = tabs[tabs.length - 1];
        if (target) { e.preventDefault(); activate(target); }
      });
    });
  }

  function initHashTab() {
    const map = { recursos: 'tab-resources', videos: 'tab-videos', podcast: 'tab-podcast', galeria: 'tab-gallery' };
    function applyHash() {
      const id = map[window.location.hash.replace('#', '')];
      const tab = id && document.getElementById(id);
      if (tab) tab.click();
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
  }

  async function init() {
    initTabs();
    initLightbox();
    initHashTab();

    const galleryListEarly = document.querySelector('[data-media-list="gallery"]');
    if (galleryListEarly) {
      galleryListEarly.innerHTML = '<div class="skeleton media-gallery-item"></div>'.repeat(6);
    }

    const data = await loadMedia();

    const videoList = document.querySelector('[data-media-list="videos"]');
    if (videoList) renderEmpty(videoList, 'videos');

    const podcastList = document.querySelector('[data-media-list="podcast"]');
    if (podcastList) renderEmpty(podcastList, 'podcast');

    const galleryList = document.querySelector('[data-media-list="gallery"]');
    if (galleryList) renderGallery(galleryList, data.gallery || []);

    const resourcesList = document.querySelector('[data-media-list="resources"]');
    if (resourcesList) renderEmpty(resourcesList, 'resources');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
