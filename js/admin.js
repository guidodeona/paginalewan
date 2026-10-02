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
  let reportsByComment = new Map();
  let subscribers = [];
  let articleTitles = new Map();
  let panelReady = false;

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
      .select('id, article_id, parent_id, author_id, body, created_at, updated_at, is_deleted, is_reported, profiles!comments_author_id_fkey(display_name)')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data;
  }

  // Motivos de cada reporte (RLS: solo las admins ven los de otres). Si la
  // tabla todavia no existe, el panel funciona igual sin esa informacion.
  async function loadReports() {
    const map = new Map();
    const { data, error } = await client().from('comment_reports').select('comment_id, reason, created_at').order('created_at');
    if (error) return map;
    (data || []).forEach((r) => {
      if (!map.has(r.comment_id)) map.set(r.comment_id, []);
      map.get(r.comment_id).push(r);
    });
    return map;
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
      if (statusFilter === 'reported' && (c.is_deleted || !c.is_reported)) return false;
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
      const reports = reportsByComment.get(c.id) || [];
      const reasons = reports.filter((r) => r.reason);
      if (c.is_reported && reasons.length) {
        const ul = document.createElement('ul');
        ul.className = 'admin-report-reasons';
        reasons.forEach((r) => {
          const li = document.createElement('li');
          li.textContent = `Motivo del reporte: ${r.reason}`;
          ul.appendChild(li);
        });
        tdBody.appendChild(ul);
      }
      tr.appendChild(tdBody);

      const tdDate = document.createElement('td');
      tdDate.textContent = formatDate(c.created_at);
      tr.appendChild(tdDate);

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'admin-status-badge' + (c.is_deleted ? ' admin-status-badge--deleted' : '');
      badge.textContent = c.is_deleted ? 'Eliminado' : 'Activo';
      tdStatus.appendChild(badge);
      if (c.is_reported && !c.is_deleted) {
        const reported = document.createElement('span');
        reported.className = 'admin-status-badge admin-status-badge--reported';
        reported.textContent = reports.length > 1 ? `Reportado (${reports.length})` : 'Reportado';
        tdStatus.appendChild(reported);
      }
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

        if (c.is_reported) {
          const dismissBtn = document.createElement('button');
          dismissBtn.type = 'button';
          dismissBtn.className = 'comment-edit-btn';
          dismissBtn.textContent = 'Descartar reporte';
          dismissBtn.addEventListener('click', () => dismissReports(c, panel));
          tdActions.appendChild(dismissBtn);
        }
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

  async function dismissReports(comment, panel) {
    if (!window.confirm('¿Descartar los reportes de este comentario? El comentario queda publicado.')) return;
    const { error } = await client().rpc('dismiss_comment_reports', { p_comment_id: comment.id });
    if (error) { window.alert('No se pudo descartar: ' + error.message); return; }
    await reload(panel);
  }

  async function reload(panel) {
    [allComments, reportsByComment] = await Promise.all([loadAllComments(), loadReports()]);
    updateReportedOptionLabel(panel);
    renderTable(panel);
  }

  function updateReportedOptionLabel(panel) {
    const option = panel.querySelector('[data-admin-filter-status] option[value="reported"]');
    if (!option) return;
    const count = allComments.filter((c) => c.is_reported && !c.is_deleted).length;
    option.textContent = count ? `Reportados (${count})` : 'Reportados';
  }

  // --- Newsletter -------------------------------------------------------------
  async function loadSubscribers() {
    const { data, error } = await client().from('newsletter_subscribers').select('id, email, created_at').order('created_at', { ascending: false });
    if (error) return null;
    return data || [];
  }

  function renderSubscribers() {
    const tbody = document.querySelector('[data-newsletter-rows]');
    const countEl = document.querySelector('[data-newsletter-count]');
    const exportBtn = document.querySelector('[data-newsletter-export]');
    tbody.innerHTML = '';

    if (subscribers === null) {
      countEl.textContent = 'No se pudieron cargar las suscripciones (¿falta correr la última versión de supabase/schema.sql?).';
      exportBtn.disabled = true;
      return;
    }
    countEl.textContent = subscribers.length === 1 ? '1 persona suscripta' : `${subscribers.length} personas suscriptas`;
    exportBtn.disabled = !subscribers.length;

    if (!subscribers.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="admin-table-empty">Todavía no hay suscripciones.</td></tr>';
      return;
    }
    subscribers.forEach((sub) => {
      const tr = document.createElement('tr');
      const tdEmail = document.createElement('td');
      tdEmail.textContent = sub.email;
      tr.appendChild(tdEmail);
      const tdDate = document.createElement('td');
      tdDate.textContent = formatDate(sub.created_at);
      tr.appendChild(tdDate);
      const tdActions = document.createElement('td');
      tdActions.className = 'admin-table-actions';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'comment-delete-btn';
      delBtn.textContent = 'Dar de baja';
      delBtn.addEventListener('click', () => removeSubscriber(sub));
      tdActions.appendChild(delBtn);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  async function removeSubscriber(sub) {
    if (!window.confirm(`¿Dar de baja a ${sub.email}? Se borra de la lista.`)) return;
    const { error } = await client().from('newsletter_subscribers').delete().eq('id', sub.id);
    if (error) { window.alert('No se pudo dar de baja: ' + error.message); return; }
    subscribers = await loadSubscribers();
    renderSubscribers();
  }

  function exportSubscribersCsv() {
    if (!subscribers || !subscribers.length) return;
    // Comillas dobles escapadas y prefijo ' ante =, +, - o @ para que Excel
    // no interprete un mail armado a proposito como una formula.
    const cell = (v) => {
      let str = String(v);
      if (/^[=+\-@]/.test(str)) str = "'" + str;
      return `"${str.replace(/"/g, '""')}"`;
    };
    const rows = [['email', 'fecha_suscripcion'], ...subscribers.map((sub) => [sub.email, sub.created_at])];
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-activemos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- Pestañas -----------------------------------------------------------------
  function initTabs(panel) {
    const tabs = Array.from(panel.querySelectorAll('[data-admin-tab]'));
    function activate(tab) {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
      });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        activate(next);
        next.focus();
      });
    });
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

    // onChange tambien dispara al refrescar el token: los listeners y el
    // filtro de articulos se arman una sola vez.
    if (panelReady) return;
    panelReady = true;

    await loadArticleTitles();
    await reload(panel);
    populateArticleFilter(panel);
    renderTable(panel);
    subscribers = await loadSubscribers();
    renderSubscribers();

    initTabs(panel);
    panel.querySelector('[data-admin-search]').addEventListener('input', () => renderTable(panel));
    panel.querySelector('[data-admin-filter-article]').addEventListener('change', () => renderTable(panel));
    panel.querySelector('[data-admin-filter-status]').addEventListener('change', () => renderTable(panel));
    panel.querySelector('[data-newsletter-export]').addEventListener('click', exportSubscribersCsv);
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
