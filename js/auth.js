/*
 * Autenticacion (Supabase Auth) + estado de sesion/perfil compartido.
 *
 * Inyecta en el header de cada pagina un boton "Ingresar" (o el avatar del
 * usuario logueado) y un modal con login/registro. Expone window.ActivemosAuth
 * para que otros scripts (comments.js, admin.html) puedan leer la sesion
 * actual y reaccionar a cambios, sin cada uno reimplementar la conexion a
 * Supabase.
 *
 * Seguridad: el rol del usuario (admin/user) SIEMPRE se lee de la tabla
 * `profiles` en la base de datos (con RLS), nunca se decide ni se confia en
 * nada que viva solo en este archivo o en el navegador. Este script solo
 * MUESTRA lo que el servidor ya autorizó; la autorización real vive en
 * supabase/schema.sql (RLS + funciones RPC).
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/auth\.js.*$/, '') : '';

  const cfg = window.SUPABASE_CONFIG;
  const configured = Boolean(cfg && cfg.url && !cfg.url.includes('YOUR-PROJECT-REF'));

  if (!configured) {
    console.warn('[Activemos] Supabase todavía no está configurado (js/supabase-config.js). El login queda deshabilitado hasta completar esos valores.');
  }

  const client = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  let currentUser = null;
  let currentProfile = null;
  const listeners = [];

  function notify() {
    listeners.forEach((cb) => { try { cb({ user: currentUser, profile: currentProfile }); } catch (e) { /* no-op */ } });
  }

  async function refreshProfile() {
    if (!currentUser) { currentProfile = null; return; }
    const { data } = await client.from('profiles').select('id, display_name, role').eq('id', currentUser.id).single();
    currentProfile = data || null;
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

  // --- UI: trigger + modal ------------------------------------------------
  function buildUI() {
    const header = document.querySelector('.header-social');
    if (!header) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'auth-trigger';
    trigger.textContent = 'Ingresar';
    header.insertAdjacentElement('afterend', trigger);

    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <button type="button" class="auth-modal-close" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2l16 16M18 2L2 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <div class="auth-tabs" role="tablist">
          <button type="button" class="auth-tab" role="tab" data-auth-tab="login" aria-selected="true">Iniciar sesión</button>
          <button type="button" class="auth-tab" role="tab" data-auth-tab="signup" aria-selected="false">Crear cuenta</button>
        </div>
        <h2 id="authModalTitle" class="sr-only">Iniciar sesión o crear cuenta</h2>

        <form class="auth-form" data-auth-form="login">
          <div class="comment-form-row"><input type="email" name="email" placeholder="Tu email" required autocomplete="email"></div>
          <div class="comment-form-row"><input type="password" name="password" placeholder="Contraseña" required autocomplete="current-password"></div>
          <p class="comment-form-feedback" data-auth-feedback="login" role="status" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary">Iniciar sesión</button>
          <button type="button" class="auth-forgot-link" data-auth-forgot-trigger>¿Olvidaste tu contraseña?</button>
        </form>

        <form class="auth-form" data-auth-form="signup" hidden>
          <div class="comment-form-row"><input type="text" name="displayName" placeholder="Tu nombre" maxlength="40" required autocomplete="name"></div>
          <div class="comment-form-row"><input type="email" name="email" placeholder="Tu email" required autocomplete="email"></div>
          <div class="comment-form-row"><input type="password" name="password" placeholder="Contraseña (mínimo 8 caracteres)" minlength="8" required autocomplete="new-password"></div>
          <p class="comment-form-feedback" data-auth-feedback="signup" role="status" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary">Crear cuenta</button>
        </form>

        <form class="auth-form" data-auth-form="forgot" hidden>
          <p class="auth-forgot-desc">Ingresá tu email y te mandamos un link para elegir una contraseña nueva.</p>
          <div class="comment-form-row"><input type="email" name="email" placeholder="Tu email" required autocomplete="email"></div>
          <p class="comment-form-feedback" data-auth-feedback="forgot" role="status" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary">Enviar link de recuperación</button>
          <button type="button" class="auth-forgot-link" data-auth-back-trigger>← Volver a iniciar sesión</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const userMenu = document.createElement('div');
    userMenu.className = 'auth-user-menu';
    userMenu.hidden = true;
    userMenu.innerHTML = `
      <button type="button" class="auth-user-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="comment-avatar" data-auth-avatar aria-hidden="true"></span>
        <span data-auth-name></span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
      </button>
      <ul class="auth-user-dropdown">
        <li data-auth-role-badge class="auth-role-badge" hidden>Administradora</li>
        <li data-auth-admin-link hidden><a href="${BASE_PATH}admin.html">Panel de moderación</a></li>
        <li><button type="button" class="auth-signout">Cerrar sesión</button></li>
      </ul>
    `;
    header.insertAdjacentElement('afterend', userMenu);

    return { trigger, modal, userMenu };
  }

  function wireUI(ui) {
    if (!ui) return;
    const { trigger, modal, userMenu } = ui;

    const openModal = (tab) => {
      modal.hidden = false;
      switchTab(tab || 'login');
      modal.querySelector(`[data-auth-form]:not([hidden]) input`).focus();
    };
    const closeModal = () => { modal.hidden = true; };

    function switchTab(tab) {
      modal.querySelector('.auth-tabs').hidden = tab === 'forgot';
      modal.querySelectorAll('[data-auth-tab]').forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.authTab === tab));
      });
      modal.querySelectorAll('[data-auth-form]').forEach((form) => {
        form.hidden = form.dataset.authForm !== tab;
      });
    }

    trigger.addEventListener('click', () => openModal('login'));
    modal.querySelector('.auth-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
    modal.querySelectorAll('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.authTab));
    });
    modal.querySelector('[data-auth-forgot-trigger]').addEventListener('click', () => switchTab('forgot'));
    modal.querySelector('[data-auth-back-trigger]').addEventListener('click', () => switchTab('login'));

    modal.querySelector('[data-auth-form="login"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const feedback = modal.querySelector('[data-auth-feedback="login"]');
      feedback.textContent = '';
      const email = form.email.value.trim();
      const password = form.password.value;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) { feedback.textContent = translateAuthError(error); return; }
      closeModal();
      form.reset();
    });

    modal.querySelector('[data-auth-form="signup"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const feedback = modal.querySelector('[data-auth-feedback="signup"]');
      feedback.textContent = '';
      const displayName = form.displayName.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      if (displayName.length < 2) { feedback.textContent = 'El nombre tiene que tener al menos 2 caracteres.'; return; }
      const { error } = await client.auth.signUp({
        email, password,
        options: { data: { display_name: displayName } },
      });
      if (error) { feedback.textContent = translateAuthError(error); return; }
      feedback.textContent = '¡Listo! Si tu proyecto pide confirmación por email, revisá tu casilla antes de iniciar sesión.';
      form.reset();
    });

    modal.querySelector('[data-auth-form="forgot"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const feedback = modal.querySelector('[data-auth-feedback="forgot"]');
      feedback.textContent = '';
      const email = form.email.value.trim();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: BASE_PATH + 'restablecer-contrasena.html',
      });
      if (error) { feedback.textContent = translateAuthError(error); return; }
      feedback.textContent = 'Listo, revisá tu correo. El link para elegir una contraseña nueva vale por un tiempo limitado.';
      form.reset();
    });

    userMenu.querySelector('.auth-user-trigger').addEventListener('click', () => {
      const isOpen = userMenu.classList.toggle('is-open');
      userMenu.querySelector('.auth-user-trigger').setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!userMenu.contains(e.target)) {
        userMenu.classList.remove('is-open');
        userMenu.querySelector('.auth-user-trigger').setAttribute('aria-expanded', 'false');
      }
    });
    userMenu.querySelector('.auth-signout').addEventListener('click', async () => {
      await client.auth.signOut();
      userMenu.classList.remove('is-open');
    });

    listeners.push(({ user, profile }) => {
      trigger.hidden = Boolean(user);
      userMenu.hidden = !user;
      if (user && profile) {
        userMenu.querySelector('[data-auth-name]').textContent = profile.display_name;
        const avatar = userMenu.querySelector('[data-auth-avatar]');
        avatar.textContent = initials(profile.display_name);
        avatar.className = `comment-avatar comment-avatar--${avatarColorClass(profile.display_name)}`;
        userMenu.querySelector('[data-auth-role-badge]').hidden = profile.role !== 'admin';
        userMenu.querySelector('[data-auth-admin-link]').hidden = profile.role !== 'admin';
      }
    });
  }

  function translateAuthError(error) {
    const msg = (error && error.message) || '';
    if (error && error.status === 429) return 'Demasiados intentos. Esperá un momento y volvé a intentar.';
    if (/already registered/i.test(msg)) return 'Ese email ya tiene una cuenta. Probá iniciar sesión.';
    if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
    if (/password should be at least/i.test(msg)) return 'La contraseña es demasiado corta.';
    if (/rate limit/i.test(msg)) return 'Demasiados intentos. Esperá un momento y volvé a intentar.';
    return 'Algo salió mal. Volvé a intentar en un momento.';
  }

  async function init() {
    if (!configured) return;

    const ui = buildUI();
    wireUI(ui);

    const { data: { session } } = await client.auth.getSession();
    currentUser = session ? session.user : null;
    await refreshProfile();
    notify();

    client.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session ? session.user : null;
      await refreshProfile();
      notify();
      document.dispatchEvent(new CustomEvent('activemos:auth-changed', { detail: { user: currentUser, profile: currentProfile } }));
    });
  }

  window.ActivemosAuth = {
    getClient: () => client,
    isConfigured: () => configured,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    onChange: (cb) => { listeners.push(cb); if (configured) cb({ user: currentUser, profile: currentProfile }); },
    openLoginModal: () => document.querySelector('.auth-trigger')?.click(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
