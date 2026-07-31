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

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function buildFeaturedCard(article) {
    const wrap = document.createElement('article');
    wrap.className = 'featured-card';

    const thumb = document.createElement('div');
    thumb.className = 'featured-card-thumb';
    const img = document.createElement('img');
    img.src = BASE_PATH + article.image;
    img.alt = '';
    img.loading = 'lazy';
    thumb.appendChild(img);
    const tag = document.createElement('span');
    tag.className = `card-tag card-tag--${article.categoryColor || 'pink'}`;
    tag.textContent = article.category;
    thumb.appendChild(tag);
    wrap.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'featured-card-body';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'featured-card-eyebrow';
    eyebrow.textContent = 'Artículo destacado';
    body.appendChild(eyebrow);
    const meta = document.createElement('p');
    meta.className = 'card-date';
    meta.textContent = `${formatDate(article.publishDate)} · ${article.readingMinutes} min de lectura`;
    body.appendChild(meta);
    const h2 = document.createElement('h2');
    h2.textContent = article.title;
    body.appendChild(h2);
    const excerpt = document.createElement('p');
    excerpt.className = 'featured-card-excerpt';
    excerpt.textContent = article.excerpt;
    body.appendChild(excerpt);

    if (article.authors && article.authors.length) {
      const authorsRow = document.createElement('div');
      authorsRow.className = 'featured-card-authors';
      const avatarColors = ['rosa', 'celeste', 'naranja'];
      article.authors.forEach((name, i) => {
        const av = document.createElement('span');
        av.className = `comment-avatar comment-avatar--${avatarColors[i % avatarColors.length]}`;
        av.textContent = initials(name);
        av.setAttribute('aria-hidden', 'true');
        authorsRow.appendChild(av);
      });
      const names = document.createElement('span');
      names.textContent = article.authors.join(' y ');
      authorsRow.appendChild(names);
      body.appendChild(authorsRow);
    }

    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = BASE_PATH + article.url;
    link.innerHTML = 'Leer artículo <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h11.5M8 1l4.5 4L8 9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    body.appendChild(link);
    wrap.appendChild(body);

    return wrap;
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

    if (article.authors && article.authors.length) {
      const authorsRow = document.createElement('div');
      authorsRow.className = 'card-authors';
      const avatarColors = ['rosa', 'celeste', 'naranja'];
      const av = document.createElement('span');
      av.className = `comment-avatar comment-avatar--${avatarColors[0]}`;
      av.textContent = initials(article.authors[0]);
      av.setAttribute('aria-hidden', 'true');
      authorsRow.appendChild(av);
      const names = document.createElement('span');
      names.textContent = article.authors.length > 1 ? `${article.authors[0]} y otro/a` : article.authors[0];
      authorsRow.appendChild(names);
      body.appendChild(authorsRow);
    }

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

  function initNewsletterForm() {
    const form = document.querySelector('[data-newsletter-form]');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.innerHTML = '<p class="debate-newsletter-feedback">¡Gracias! Todavía estamos conectando esta suscripción — mientras tanto, seguinos en Instagram para no perderte nada.</p>';
    });
  }

  async function init() {
    const mount = document.querySelector('[data-debate-list]');
    const featuredMount = document.querySelector('[data-featured-article]');
    const countEl = document.querySelector('[data-results-count]');
    const searchToggle = document.querySelector('[data-search-toggle]');
    const searchInput = document.querySelector('[data-search-input]');

    initNewsletterForm();

    if (!mount) return;

    const articles = await loadArticles();
    const featured = articles[0];
    const rest = articles.slice(1);

    if (featured && featuredMount) {
      featuredMount.appendChild(buildFeaturedCard(featured));
    }

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
        countEl.textContent = list.length === rest.length
          ? `${rest.length} artículo${rest.length === 1 ? '' : 's'}`
          : `${list.length} de ${rest.length} artículos`;
      }
    }

    render(rest);

    if (searchToggle && searchInput) {
      searchToggle.addEventListener('click', () => {
        const isOpen = searchInput.hidden;
        searchInput.hidden = !isOpen;
        searchToggle.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) searchInput.focus();
        else { searchInput.value = ''; render(rest); }
      });

      searchInput.addEventListener('input', () => {
        const q = normalize(searchInput.value);
        if (!q) { render(rest); return; }
        const filtered = rest.filter((a) =>
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
