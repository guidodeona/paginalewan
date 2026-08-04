/*
 * Tarjetas de articulos en la seccion "Abramos debate" del inicio. Se arman
 * en vivo desde data/articles.json ordenadas por publishDate (mas nuevo
 * primero) y se muestran las 2 mas recientes, asi no hay que editar el
 * HTML a mano cada vez que se publica un articulo nuevo.
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/home-articles\.js.*$/, '') : '';
  const MAX_CARDS = 2;

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
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
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

  function observeReveal(mount) {
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

  async function init() {
    const mount = document.querySelector('[data-home-articles]');
    if (!mount) return;

    const articles = await loadArticles();
    const sorted = articles.slice().sort((a, b) => b.publishDate.localeCompare(a.publishDate));
    const latest = sorted.slice(0, MAX_CARDS);

    mount.innerHTML = '';
    latest.forEach((article) => mount.appendChild(buildCard(article)));
    observeReveal(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
