/*
 * Pagina general de "Abramos debate": todos los articulos sin filtrar por
 * tema (a diferencia de tematicas/*.html + categoria.js, que muestran solo
 * una categoria), mas una busqueda en vivo por titulo o tema. Reutiliza el
 * mismo componente de tarjeta (.card) que ya usan categoria.js e index.html.
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/abramos-debate\.js.*$/, '') : '';

  // Saca tildes/diacriticos y pasa a minusculas, asi buscar "politica" o
  // "soberania" (sin tilde) encuentra "Política"/"Soberanía" igual.
  function normalize(str) {
    return str.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

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
    const mount = document.querySelector('[data-debate-list]');
    const countEl = document.querySelector('[data-results-count]');
    const searchToggle = document.querySelector('[data-search-toggle]');
    const searchInput = document.querySelector('[data-search-input]');
    if (!mount) return;

    const articles = await loadArticles();

    function render(list) {
      mount.innerHTML = '';
      if (!list.length) {
        mount.innerHTML = '<p class="media-empty">No encontramos artículos que coincidan con tu búsqueda.</p>';
        if (countEl) countEl.textContent = '';
        return;
      }
      list.forEach((article) => mount.appendChild(buildCard(article)));
      observeReveal(mount);
      if (countEl) {
        countEl.textContent = list.length === articles.length
          ? `${articles.length} artículo${articles.length === 1 ? '' : 's'}`
          : `${list.length} de ${articles.length} artículos`;
      }
    }

    render(articles);

    if (searchToggle && searchInput) {
      searchToggle.addEventListener('click', () => {
        const isOpen = searchInput.hidden;
        searchInput.hidden = !isOpen;
        searchToggle.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) searchInput.focus();
        else { searchInput.value = ''; render(articles); }
      });

      searchInput.addEventListener('input', () => {
        const q = normalize(searchInput.value);
        if (!q) { render(articles); return; }
        const filtered = articles.filter((a) =>
          normalize(a.title).includes(q) || normalize(a.category).includes(q)
        );
        render(filtered);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
