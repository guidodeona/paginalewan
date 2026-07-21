/*
 * Pagina de destino del link de "recuperar contrasena" que manda Supabase
 * por mail. El cliente de Supabase detecta automaticamente la sesion de
 * recuperacion a partir del link (token en la URL); si no hay sesion valida
 * (link vencido, reusado, o alguien entro directo sin pasar por el mail),
 * se muestra un mensaje en vez del formulario.
 */
(() => {
  'use strict';

  const cfg = window.SUPABASE_CONFIG;
  const configured = Boolean(cfg && cfg.url && !cfg.url.includes('YOUR-PROJECT-REF'));

  async function init() {
    const formSection = document.querySelector('[data-reset-form-section]');
    const invalidSection = document.querySelector('[data-reset-invalid-section]');
    const successSection = document.querySelector('[data-reset-success-section]');

    if (!configured) {
      formSection.hidden = true;
      invalidSection.hidden = false;
      return;
    }

    const client = window.supabase.createClient(cfg.url, cfg.anonKey);

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      formSection.hidden = true;
      invalidSection.hidden = false;
      return;
    }

    const form = document.querySelector('[data-reset-form]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = document.querySelector('[data-reset-feedback]');
      feedback.textContent = '';
      const password = form.password.value;
      const confirmPassword = form.confirmPassword.value;

      if (password.length < 8) {
        feedback.textContent = 'La contraseña tiene que tener al menos 8 caracteres.';
        return;
      }
      if (password !== confirmPassword) {
        feedback.textContent = 'Las contraseñas no coinciden.';
        return;
      }

      const { error } = await client.auth.updateUser({ password });
      if (error) {
        feedback.textContent = 'No se pudo actualizar la contraseña. Pedí un nuevo link e intentá de nuevo.';
        return;
      }

      formSection.hidden = true;
      successSection.hidden = false;
      await client.auth.signOut();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
