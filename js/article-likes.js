/*
 * Likes de articulos. Mismo patron de seguridad que los likes de
 * comentarios: el conteo y el estado "¿ya di like?" se leen de la base de
 * datos real, y el toggle pasa por la funcion toggle_article_like()
 * (supabase/schema.sql), que valida la sesion y evita duplicados con un
 * indice unico (user_id + article_id) del lado del servidor. El frontend
 * nunca decide si un like es valido, solo refleja lo que el servidor
 * confirma.
 */
(() => {
  'use strict';

  function client() {
    return window.ActivemosAuth && window.ActivemosAuth.getClient();
  }

  async function refreshLikeState(mount, articleId) {
    const countEl = mount.querySelector('[data-like-count]');
    const btn = mount.querySelector('.article-like-btn');
    const user = window.ActivemosAuth.getUser();

    const { count } = await client().from('article_likes').select('id', { count: 'exact', head: true }).eq('article_id', articleId);
    countEl.textContent = String(count || 0);

    if (user) {
      const { data } = await client().from('article_likes').select('id').eq('article_id', articleId).eq('user_id', user.id).maybeSingle();
      btn.setAttribute('aria-pressed', String(Boolean(data)));
      btn.classList.toggle('is-liked', Boolean(data));
    } else {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-liked');
    }
  }

  const pendingMounts = new WeakSet();

  async function handleLikeClick(mount, articleId) {
    if (!window.ActivemosAuth.getUser()) {
      window.ActivemosAuth.openLoginModal();
      return;
    }
    // Evita disparar un segundo toggle mientras el anterior todavia esta en
    // vuelo (doble clic / doble tap): el índice único del lado del servidor
    // ya lo hace seguro, pero sin esto el segundo pedido pisaría al primero
    // sin necesidad.
    if (pendingMounts.has(mount)) return;
    pendingMounts.add(mount);
    const btn = mount.querySelector('.article-like-btn');
    const countEl = mount.querySelector('[data-like-count]');
    try {
      const { data, error } = await client().rpc('toggle_article_like', { p_article_id: articleId });
      if (error) return;
      const result = Array.isArray(data) ? data[0] : data;
      countEl.textContent = String(result.likes_count);
      btn.setAttribute('aria-pressed', String(result.liked));
      btn.classList.toggle('is-liked', result.liked);
      if (result.liked) {
        btn.classList.remove('like-pulse');
        // eslint-disable-next-line no-unused-expressions
        btn.offsetWidth; // fuerza reflow para poder re-disparar la animacion en clics seguidos
        btn.classList.add('like-pulse');
      }
    } finally {
      pendingMounts.delete(mount);
    }
  }

  function init() {
    document.querySelectorAll('[data-article-like]').forEach((mount) => {
      const articleId = mount.getAttribute('data-article-like');
      const btn = mount.querySelector('.article-like-btn');
      btn.addEventListener('click', () => handleLikeClick(mount, articleId));

      if (!window.ActivemosAuth || !window.ActivemosAuth.isConfigured()) return;
      window.ActivemosAuth.onChange(() => refreshLikeState(mount, articleId));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
