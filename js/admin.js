/*
 * Panel de moderacion. Pensado como conveniencia de UI para la cuenta admin,
 * no como el mecanismo de seguridad en si: la lectura de comentarios ya es
 * publica (son contenido publico del sitio), y las acciones de moderar
 * (editar/eliminar comentarios ajenos) estan protegidas de verdad por las
 * funciones RPC en el servidor (supabase/schema.sql), que verifican
 * is_admin() sin importar lo que diga este archivo. Si alguien sin permisos
 * llega a esta pagina, el gate de abajo la esconde por UX, pero aunque no
 * existiera este archivo, esa persona seguiria sin poder borrar comentarios
 * de otres porque el servidor lo rechaza.
 */
(() => {
  'use strict';

  let allComments = [];
  let articleTitles = new Map();

  function client() {
    return window.ActivemosAuth && window.ActivemosAuth.getClient();
  }

  function scriptBasePath() {
    const el = document.currentScript;
    return el ? el.src.replace(/js\/admin\.js.*$/, '') : '';
  }

  async function loadArticleTitles() {
    try {
      const res = await fetch(scriptBasePath() + 'data/articles.json');
      const json = await res.json();
      (json.articles || []).forEach((a) => articleTitles.set(a.id, a.title));
    } catch (e) { /* no-op: se muestra el id crudo si esto falla */ }
  }

  async function loadAllComments() {
    const { data, error } = await client()
      .from('comments')
      .select('id, article_id, parent_id, author_id, body, created_at, updated_at, is_deleted, profiles!comments_author_id_fkey(display_name)')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data;
  }

  function populateArticleFilter(panel) {
    const select = panel.querySelector('[data-admin-filter-article]');
    const ids = Array.from(new Set(allComments.map((c) => c.article_id))).sort();
    ids.forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = articleTitles.get(id) || id;
      select.appendChild(opt);
    });
  }

  function applyFilters(panel) {
    const search = panel.querySelector('[data-admin-search]').value.trim().toLowerCase();
    const articleFilter = panel.querySelector('[data-admin-filter-article]').value;
    const statusFilter = panel.querySelector('[data-admin-filter-status]').value;

    return allComments.filter((c) => {
      if (statusFilter === 'active' && c.is_deleted) return false;
      if (statusFilter === 'deleted' && !c.is_deleted) return false;
      if (articleFilter !== 'all' && c.article_id !== articleFilter) return false;
      if (search) {
        const authorName = (c.profiles ? c.profiles.display_name : '').toLowerCase();
        const body = (c.body || '').toLowerCase();
        if (!authorName.includes(search) && !body.includes(search)) return false;
      }
      return true;
    });
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderTable(panel) {
    const tbody = panel.querySelector('[data-admin-rows]');
    const rows = applyFilters(panel);
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">No hay comentarios que coincidan con estos filtros.</td></tr>';
      return;
    }

    rows.forEach((c) => {
      const tr = document.createElement('tr');

      const tdAuthor = document.createElement('td');
      tdAuthor.textContent = c.profiles ? c.profiles.display_name : '(usuario eliminado)';
      tr.appendChild(tdAuthor);

      const tdArticle = document.createElement('td');
      tdArticle.textContent = articleTitles.get(c.article_id) || c.article_id;
      tr.appendChild(tdArticle);

      const tdBody = document.createElement('td');
      tdBody.className = 'admin-table-body-cell';
      tdBody.textContent = c.is_deleted ? '[eliminado]' : c.body;
      tr.appendChild(tdBody);

      const tdDate = document.createElement('td');
      tdDate.textContent = formatDate(c.created_at);
      tr.appendChild(tdDate);

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'admin-status-badge' + (c.is_deleted ? ' admin-status-badge--deleted' : '');
      badge.textContent = c.is_deleted ? 'Eliminado' : 'Activo';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      const tdActions = document.createElement('td');
      tdActions.className = 'admin-table-actions';
      if (!c.is_deleted) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'comment-edit-btn';
        editBtn.textContent = 'Editar';
        editBtn.addEventListener('click', () => editComment(c, panel));
        tdActions.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'comment-delete-btn';
        delBtn.textContent = 'Eliminar';
        delBtn.addEventListener('click', () => deleteComment(c, panel));
        tdActions.appendChild(delBtn);
      }
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  async function editComment(comment, panel) {
    const nextBody = window.prompt('Editar comentario:', comment.body);
    if (nextBody === null) return;
    const trimmed = nextBody.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      window.alert('El comentario tiene que tener entre 3 y 500 caracteres.');
      return;
    }
    const { error } = await client().rpc('edit_comment', { p_comment_id: comment.id, p_body: trimmed });
    if (error) { window.alert('No se pudo editar: ' + error.message); return; }
    await reload(panel);
  }

  async function deleteComment(comment, panel) {
    if (!window.confirm('¿Eliminar este comentario? Esta acción se puede revertir solo desde la base de datos.')) return;
    const { error } = await client().rpc('delete_comment', { p_comment_id: comment.id });
    if (error) { window.alert('No se pudo eliminar: ' + error.message); return; }
    await reload(panel);
  }

  async function reload(panel) {
    allComments = await loadAllComments();
    renderTable(panel);
  }

  function showGate(message, showLoginBtn) {
    const gate = document.querySelector('[data-admin-gate]');
    const panel = document.querySelector('[data-admin-panel]');
    panel.hidden = true;
    gate.hidden = false;
    gate.innerHTML = `<p class="media-empty">${message}</p>`;
    if (showLoginBtn) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = 'Ingresar';
      btn.addEventListener('click', () => window.ActivemosAuth.openLoginModal());
      gate.querySelector('.media-empty').insertAdjacentElement('afterend', btn);
    }
  }

  async function evaluateAccess() {
    const user = window.ActivemosAuth.getUser();
    const profile = window.ActivemosAuth.getProfile();

    if (!user) {
      showGate('Iniciá sesión con la cuenta administradora para ver este panel.', true);
      return;
    }
    if (!profile || profile.role !== 'admin') {
      showGate('Esta sección requiere permisos de administrador.', false);
      return;
    }

    document.querySelector('[data-admin-gate]').hidden = true;
    const panel = document.querySelector('[data-admin-panel]');
    panel.hidden = false;

    await loadArticleTitles();
    allComments = await loadAllComments();
    populateArticleFilter(panel);
    renderTable(panel);

    panel.querySelector('[data-admin-search]').addEventListener('input', () => renderTable(panel));
    panel.querySelector('[data-admin-filter-article]').addEventListener('change', () => renderTable(panel));
    panel.querySelector('[data-admin-filter-status]').addEventListener('change', () => renderTable(panel));
  }

  function init() {
    if (!window.ActivemosAuth || !window.ActivemosAuth.isConfigured()) {
      showGate('El panel de moderación no está disponible todavía.', false);
      return;
    }
    window.ActivemosAuth.onChange(() => evaluateAccess());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
