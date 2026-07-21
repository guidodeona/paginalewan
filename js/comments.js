/*
 * Sistema de comentarios respaldado por Supabase (Postgres + RLS).
 *
 * A diferencia de la version anterior (localStorage), acá la autorización
 * real vive en el servidor: este archivo solo llama a las funciones RPC
 * definidas en supabase/schema.sql (create_comment, edit_comment,
 * delete_comment, toggle_like) y muestra/oculta botones según el rol que
 * YA vino confirmado desde la base de datos vía window.ActivemosAuth. Nada
 * de lo que pasa acá decide permisos: como mucho, los refleja.
 */
(() => {
  'use strict';

  const MAX_DEPTH = 3;

  function client() {
    return window.ActivemosAuth && window.ActivemosAuth.getClient();
  }

  function timeAgo(iso) {
    const ts = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `hace ${days} d`;
    return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const AVATAR_PALETTE = ['celeste', 'rosa', 'naranja'];
  function avatarColorClass(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  }
  function initials(name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join('').toUpperCase();
  }

  function countDescendants(comments, parentId) {
    const children = comments.filter((c) => c.parent_id === parentId);
    return children.reduce((sum, c) => sum + 1 + countDescendants(comments, c.id), 0);
  }

  // --- Carga de datos ------------------------------------------------------
  async function loadComments(articleId) {
    const { data: comments, error } = await client()
      .from('comments')
      .select('id, parent_id, author_id, body, created_at, updated_at, is_deleted, profiles!comments_author_id_fkey(display_name, role, avatar_type, avatar_preset_id, avatar_url)')
      .eq('article_id', articleId)
      .order('created_at', { ascending: true });
    if (error) { console.error(error); return { comments: [], likesByComment: new Map(), likedByMe: new Set() }; }

    const ids = comments.map((c) => c.id);
    let likesByComment = new Map();
    let likedByMe = new Set();
    if (ids.length) {
      const { data: likes } = await client().from('comment_likes').select('comment_id, user_id').in('comment_id', ids);
      const me = window.ActivemosAuth.getUser();
      (likes || []).forEach((like) => {
        likesByComment.set(like.comment_id, (likesByComment.get(like.comment_id) || 0) + 1);
        if (me && like.user_id === me.id) likedByMe.add(like.comment_id);
      });
    }
    return { comments, likesByComment, likedByMe };
  }

  // --- Render ----------------------------------------------------------------
  function buildAvatar(name, profile) {
    if (profile && profile.avatar_type === 'custom' && profile.avatar_url) {
      const img = document.createElement('img');
      img.className = 'comment-avatar comment-avatar--photo';
      img.src = profile.avatar_url;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      return img;
    }
    if (profile && window.getAvatarPreset) {
      const preset = window.getAvatarPreset(profile.avatar_preset_id || 'avatar-1');
      const avatar = document.createElement('div');
      avatar.className = 'comment-avatar comment-avatar--preset';
      avatar.innerHTML = preset.svg;
      avatar.setAttribute('aria-hidden', 'true');
      return avatar;
    }
    const avatar = document.createElement('div');
    avatar.className = `comment-avatar comment-avatar--${avatarColorClass(name)}`;
    avatar.textContent = initials(name);
    avatar.setAttribute('aria-hidden', 'true');
    return avatar;
  }

  function canModify(comment) {
    const user = window.ActivemosAuth.getUser();
    const profile = window.ActivemosAuth.getProfile();
    if (!user) return false;
    return comment.author_id === user.id || (profile && profile.role === 'admin');
  }

  function buildCommentNode(comment, state, depth, articleId, section) {
    const { comments, likesByComment, likedByMe } = state;
    const li = document.createElement('li');
    li.className = 'comment-item';

    const wrap = document.createElement('div');
    wrap.className = 'comment-card';

    const authorName = comment.is_deleted ? 'Comentario eliminado' : (comment.profiles ? comment.profiles.display_name : 'Usuarie');
    const isAdminAuthor = !comment.is_deleted && comment.profiles && comment.profiles.role === 'admin';

    const head = document.createElement('div');
    head.className = 'comment-head';
    head.appendChild(buildAvatar(authorName, comment.is_deleted ? null : comment.profiles));

    const headText = document.createElement('div');
    const nameRow = document.createElement('span');
    nameRow.className = 'comment-name';
    nameRow.textContent = authorName;
    if (isAdminAuthor) {
      const badge = document.createElement('span');
      badge.className = 'comment-admin-badge';
      badge.textContent = 'Admin';
      nameRow.appendChild(badge);
    }
    const dateEl = document.createElement('span');
    dateEl.className = 'comment-date';
    dateEl.textContent = timeAgo(comment.created_at) + (comment.updated_at ? ' · editado' : '');
    headText.appendChild(nameRow);
    headText.appendChild(dateEl);
    head.appendChild(headText);
    wrap.appendChild(head);

    const body = document.createElement('p');
    body.className = 'comment-text';
    body.textContent = comment.is_deleted ? '[Este comentario fue eliminado]' : comment.body;
    if (comment.is_deleted) body.classList.add('comment-text--deleted');
    wrap.appendChild(body);

    if (!comment.is_deleted) {
      const actions = document.createElement('div');
      actions.className = 'comment-actions';

      const likeBtn = document.createElement('button');
      likeBtn.type = 'button';
      likeBtn.className = 'comment-like';
      const isLiked = likedByMe.has(comment.id);
      const likeCount = likesByComment.get(comment.id) || 0;
      likeBtn.setAttribute('aria-pressed', String(isLiked));
      likeBtn.classList.toggle('is-liked', isLiked);
      likeBtn.innerHTML = `<svg width="15" height="14" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 20.5S2.5 14.9 2.5 8.3C2.5 4.8 5.2 2 8.5 2c2 0 3.4 1 3.5 1.1C12.1 3 13.5 2 15.5 2c3.3 0 6 2.8 6 6.3 0 6.6-9.5 12.2-9.5 12.2z" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"/></svg><span data-like-count>${likeCount}</span>`;
      likeBtn.addEventListener('click', async () => {
        if (!window.ActivemosAuth.getUser()) { window.ActivemosAuth.openLoginModal(); return; }
        const { error } = await client().rpc('toggle_like', { p_comment_id: comment.id });
        if (!error) refresh(articleId, section);
      });
      actions.appendChild(likeBtn);

      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'comment-reply-btn';
      replyBtn.textContent = 'Responder';
      replyBtn.addEventListener('click', () => {
        if (!window.ActivemosAuth.getUser()) { window.ActivemosAuth.openLoginModal(); return; }
        toggleReplyForm(li, comment.id, articleId, section);
      });
      actions.appendChild(replyBtn);

      if (canModify(comment)) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'comment-edit-btn';
        editBtn.textContent = 'Editar';
        editBtn.addEventListener('click', () => toggleEditForm(li, body, comment, articleId, section));
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'comment-delete-btn';
        deleteBtn.textContent = 'Eliminar';
        deleteBtn.addEventListener('click', async () => {
          if (!window.confirm('¿Eliminar este comentario?')) return;
          const { error } = await client().rpc('delete_comment', { p_comment_id: comment.id });
          if (!error) refresh(articleId, section);
        });
        actions.appendChild(deleteBtn);
      }

      const childCount = countDescendants(comments, comment.id);
      if (childCount > 0) {
        const countEl = document.createElement('span');
        countEl.className = 'comment-reply-count';
        countEl.textContent = childCount === 1 ? '1 respuesta' : `${childCount} respuestas`;
        actions.appendChild(countEl);
      }

      wrap.appendChild(actions);
    }

    li.appendChild(wrap);

    const replySlot = document.createElement('div');
    replySlot.className = 'comment-reply-slot';
    li.appendChild(replySlot);

    const children = comments
      .filter((c) => c.parent_id === comment.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (children.length) {
      const childList = document.createElement('ol');
      childList.className = 'comments-list comments-list--nested';
      children.forEach((child) => {
        childList.appendChild(buildCommentNode(child, state, depth + 1, articleId, section));
      });
      li.appendChild(childList);
    }

    return li;
  }

  function toggleEditForm(li, bodyEl, comment, articleId, section) {
    const wrap = li.querySelector(':scope > .comment-card');
    const existing = wrap.querySelector('.comment-edit-form');
    if (existing) { existing.remove(); bodyEl.hidden = false; return; }
    bodyEl.hidden = true;
    const form = document.createElement('form');
    form.className = 'comment-form comment-edit-form';
    form.innerHTML = `
      <div class="comment-form-row"><textarea name="text" maxlength="500" rows="2" required>${comment.body.replace(/</g, '&lt;')}</textarea></div>
      <div class="comment-form-actions">
        <p class="comment-form-feedback" role="status" aria-live="polite"></p>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    `;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = form.querySelector('.comment-form-feedback');
      const text = form.querySelector('textarea').value.trim();
      if (text.length < 3 || text.length > 500) { feedback.textContent = 'El comentario tiene que tener entre 3 y 500 caracteres.'; return; }
      const { error } = await client().rpc('edit_comment', { p_comment_id: comment.id, p_body: text });
      if (error) { feedback.textContent = 'No se pudo guardar. Volvé a intentar.'; return; }
      refresh(articleId, section);
    });
    bodyEl.insertAdjacentElement('afterend', form);
    form.querySelector('textarea').focus();
  }

  function toggleReplyForm(li, parentId, articleId, section) {
    const slot = li.querySelector(':scope > .comment-reply-slot');
    const existing = slot.querySelector('.comment-form');
    if (existing) { existing.remove(); return; }
    const form = buildNewCommentForm(articleId, section, parentId, 'Responder');
    slot.appendChild(form);
    form.querySelector('textarea').focus();
  }

  function buildNewCommentForm(articleId, section, parentId, submitLabel) {
    const form = document.createElement('form');
    form.className = 'comment-form' + (parentId ? ' comment-form--reply' : '');
    form.innerHTML = `
      <div class="comment-form-row"><textarea name="text" placeholder="${parentId ? 'Escribí tu respuesta...' : 'Sumá tu comentario...'}" maxlength="500" rows="${parentId ? 2 : 3}" required></textarea></div>
      <div class="comment-form-actions">
        <p class="comment-form-feedback" role="status" aria-live="polite"></p>
        <button type="submit" class="btn ${parentId ? 'btn-outline-pink' : 'btn-primary'}">${submitLabel}</button>
      </div>
    `;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = form.querySelector('.comment-form-feedback');
      const text = form.querySelector('textarea').value.trim();
      if (text.length < 3 || text.length > 500) { feedback.textContent = 'El comentario tiene que tener entre 3 y 500 caracteres.'; return; }
      const { error } = await client().rpc('create_comment', { p_article_id: articleId, p_parent_id: parentId || null, p_body: text });
      if (error) { feedback.textContent = 'No se pudo publicar. Volvé a intentar.'; return; }
      refresh(articleId, section);
    });
    return form;
  }

  function renderLoginPrompt(mount) {
    mount.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'comment-login-prompt';
    box.innerHTML = '<p>Iniciá sesión para dejar tu comentario.</p>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = 'Ingresar';
    btn.addEventListener('click', () => window.ActivemosAuth.openLoginModal());
    box.appendChild(btn);
    mount.appendChild(box);
  }

  function renderUnavailable(section) {
    section.innerHTML = '<p class="media-empty">Los comentarios están temporalmente deshabilitados.</p>';
  }

  async function refresh(articleId, section) {
    const list = section.querySelector('[data-comments-list]');
    const countEl = section.querySelector('[data-comments-count]');
    const sortSelect = section.querySelector('[data-comments-sort]');
    const formMount = section.querySelector('[data-comment-form-mount]');

    if (window.ActivemosAuth.getUser()) {
      formMount.innerHTML = '';
      formMount.appendChild(buildNewCommentForm(articleId, section, null, 'Comentar'));
    } else {
      renderLoginPrompt(formMount);
    }

    const state = await loadComments(articleId);
    countEl.textContent = String(state.comments.filter((c) => !c.is_deleted).length);

    const sortMode = sortSelect ? sortSelect.value : 'newest';
    const topLevel = state.comments.filter((c) => !c.parent_id);
    topLevel.sort((a, b) => {
      if (sortMode === 'liked') {
        const diff = (state.likesByComment.get(b.id) || 0) - (state.likesByComment.get(a.id) || 0);
        if (diff !== 0) return diff;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    list.innerHTML = '';
    if (!topLevel.length) {
      list.innerHTML = '<li class="comments-empty">Todavía no hay comentarios. ¡Sé la primera persona en opinar!</li>';
      return;
    }
    topLevel.forEach((comment) => {
      list.appendChild(buildCommentNode(comment, state, 0, articleId, section));
    });
  }

  function init() {
    document.querySelectorAll('[data-comments-article]').forEach((section) => {
      const articleId = section.getAttribute('data-comments-article');

      if (!window.ActivemosAuth || !window.ActivemosAuth.isConfigured()) {
        renderUnavailable(section);
        return;
      }

      const sortSelect = section.querySelector('[data-comments-sort]');
      if (sortSelect) sortSelect.addEventListener('change', () => refresh(articleId, section));

      window.ActivemosAuth.onChange(() => refresh(articleId, section));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
