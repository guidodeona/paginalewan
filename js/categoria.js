/*
 * Paginas de categoria de "Abramos debate" (Politica/Sociedad/Economia/
 * Juventudes). Un solo archivo para las 4 paginas: cada HTML solo declara
 * su categoria via [data-category-list], y este script filtra
 * data/articles.json por ese valor y arma las tarjetas. Agregar un articulo
 * nuevo a esa categoria en el futuro no requiere tocar ningun HTML ni JS,
 * solo sumar la entrada al JSON (mismo patron que stats.js/activities.js).
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/categoria\.js.*$/, '') : '';

  async function loadArticles() {
    try {
      const res = await fetch(BASE_PATH + 'data/articles.json');
      if (!res.ok) throw new Error('no data');
      const json = await res.json();
      return json.articles || [];
    } catch (e) {
      return [];
    }
  }

  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function buildCard(article) {
    const card = document.createElement('article');
    card.className = 'card reveal';

    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    const img = document.createElement('img');
    img.src = BASE_PATH + article.image;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 900;
    img.height = 600;
    thumb.appendChild(img);
    const tag = document.createElement('span');
    tag.className = `card-tag card-tag--${article.categoryColor || 'pink'}`;
    tag.textContent = article.category;
    thumb.appendChild(tag);
    card.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'card-body';
    const date = document.createElement('p');
    date.className = 'card-date';
    date.textContent = formatDate(article.publishDate);
    body.appendChild(date);
    const h3 = document.createElement('h3');
    h3.textContent = article.title;
    body.appendChild(h3);
    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt;
    body.appendChild(excerpt);
    const link = document.createElement('a');
    link.className = 'card-link';
    link.href = BASE_PATH + article.url;
    link.innerHTML = 'Leer más <svg width="12" height="9" viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h11.5M8 1l4.5 4L8 9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    body.appendChild(link);
    card.appendChild(body);

    return card;
  }

  function renderEmpty(mount, category) {
    mount.innerHTML = `<p class="media-empty">Todavía no publicamos artículos en <strong>${category}</strong>. Pronto vamos a sumar contenido acá.</p>`;
  }

  async function init() {
    const mount = document.querySelector('[data-category-list]');
    if (!mount) return;
    const category = mount.getAttribute('data-category-list');
    const countEl = document.querySelector('[data-category-count]');

    const articles = await loadArticles();
    const matches = articles.filter((a) => a.category === category);

    if (countEl) countEl.textContent = String(matches.length);

    if (!matches.length) {
      renderEmpty(mount, category);
      return;
    }

    mount.innerHTML = '';
    matches.forEach((article) => mount.appendChild(buildCard(article)));

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
      mount.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    } else {
      mount.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
