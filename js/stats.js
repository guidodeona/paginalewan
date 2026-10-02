/*
 * Capa de estadisticas de articulos: vistas, tiempo de lectura y ranking.
 *
 * Persistencia: tabla article_views en Supabase (compartida entre todos los
 * visitantes; ver seccion 10 de supabase/schema.sql). localStorage se sigue
 * usando para no recontar la misma nota dentro de 30 minutos, y como
 * respaldo si Supabase no responde (en ese caso el numero es solo el de
 * este navegador, como antes).
 */
(() => {
  'use strict';

  const VIEWS_KEY = 'activemos-views';
  const LAST_SEEN_KEY = 'activemos-views-lastseen';
  const DEBOUNCE_MS = 30 * 60 * 1000; // no recontar la misma nota dentro de 30 min

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/stats\.js.*$/, '') : '';

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch (e) { return {}; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* localStorage no disponible */ }
  }

  function client() {
    return window.ActivemosAuth && window.ActivemosAuth.isConfigured() ? window.ActivemosAuth.getClient() : null;
  }

  // supabase-js reintenta varias veces si falla la red (~10 s en total). Para
  // no dejar el ranking cargando tanto tiempo, despues de 3 s se usa el
  // respaldo local.
  const TIMEOUT_MS = 3000;
  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error('timeout') }), TIMEOUT_MS)),
    ]);
  }

  function getLocalViews(articleId) {
    return readStore(VIEWS_KEY)[articleId] || 0;
  }

  async function getViews(articleId) {
    const c = client();
    if (c) {
      const { data, error } = await withTimeout(c.from('article_views').select('views').eq('article_id', articleId).maybeSingle());
      if (!error) return data ? Number(data.views) : 0;
    }
    return getLocalViews(articleId);
  }

  async function recordView(articleId) {
    const lastSeen = readStore(LAST_SEEN_KEY);
    const now = Date.now();
    if (lastSeen[articleId] && now - lastSeen[articleId] < DEBOUNCE_MS) {
      return getViews(articleId);
    }
    lastSeen[articleId] = now;
    writeStore(LAST_SEEN_KEY, lastSeen);
    const store = readStore(VIEWS_KEY);
    store[articleId] = (store[articleId] || 0) + 1;
    writeStore(VIEWS_KEY, store);

    const c = client();
    if (c) {
      const { data, error } = await withTimeout(c.rpc('record_article_view', { p_article_id: articleId }));
      if (!error) return Number(data) || 0;
    }
    return store[articleId];
  }

  async function getAllViews() {
    const c = client();
    if (c) {
      const { data, error } = await withTimeout(c.from('article_views').select('article_id, views'));
      if (!error) {
        const views = {};
        (data || []).forEach((row) => { views[row.article_id] = Number(row.views); });
        return views;
      }
    }
    return readStore(VIEWS_KEY);
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

  function formatViews(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return String(n);
  }

  function pluralize(n, word) {
    return n === 1 ? word : word + 's';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  const ICON_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  async function renderArticleMeta() {
    const mount = document.querySelector('[data-article-id]');
    if (!mount) return;
    const articleId = mount.getAttribute('data-article-id');
    const readingMinutes = mount.getAttribute('data-reading-minutes') || '—';
    const views = await recordView(articleId);
    const metaExtra = mount.querySelector('.article-meta-extra');
    if (!metaExtra) return;
    metaExtra.innerHTML =
      `<span class="meta-chip">${ICON_CLOCK}${readingMinutes} min de lectura</span>` +
      `<span class="meta-chip" data-views-chip>${ICON_EYE}${formatViews(views)} ${pluralize(views, 'vista')}</span>`;
  }

  function renderTrendingSkeleton(mounts) {
    const skeletonItem = '<li class="trending-item trending-item--skeleton"><span class="skeleton skeleton-avatar"></span><span class="skeleton-text-block"><span class="skeleton skeleton-line skeleton-line--title"></span><span class="skeleton skeleton-line skeleton-line--sub"></span></span></li>';
    mounts.forEach((mount) => { mount.innerHTML = skeletonItem.repeat(3); });
  }

  async function renderTrending() {
    const mounts = document.querySelectorAll('[data-trending-list]');
    if (!mounts.length) return;
    renderTrendingSkeleton(mounts);
    const [articles, views] = await Promise.all([loadArticles(), getAllViews()]);
    const ranked = articles
      .map((a) => ({ ...a, views: views[a.id] || 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    mounts.forEach((mount) => {
      if (!ranked.length) {
        mount.innerHTML = '<li class="trending-empty">Todavía no hay suficientes lecturas para armar un ranking.</li>';
        return;
      }
      mount.innerHTML = ranked.map((a, i) => `
        <li class="trending-item">
          <span class="trending-rank">${i + 1}</span>
          <a href="${BASE_PATH}${a.url}" class="trending-link">
            <span class="trending-title">${escapeHtml(a.title)}</span>
            <span class="trending-meta">${formatViews(a.views)} ${pluralize(a.views, 'vista')} · ${a.readingMinutes} min de lectura</span>
          </a>
        </li>
      `).join('');
    });
  }

  renderArticleMeta();
  renderTrending();

  window.ActivemosStats = { getViews, recordView, getAllViews, loadArticles };
})();
