/*
 * Version vigente de los Terminos y Condiciones. Referenciada tanto por la
 * pagina /terminos-y-condiciones.html como por el registro (js/auth.js) para
 * decidir si hay que pedir una nueva aceptacion. Si el dia de mañana cambian
 * los terminos, alcanza con subir este numero: cualquier cuenta cuyo
 * profiles.terms_version no coincida va a tener que volver a aceptarlos.
 */
window.TERMS_VERSION = '2026-07-21.1';
window.TERMS_UPDATED_AT = '21 de julio de 2026';

(() => {
  function paint() {
    const v = document.querySelector('[data-terms-version]');
    const u = document.querySelector('[data-terms-updated]');
    if (v) v.textContent = window.TERMS_VERSION;
    if (u) u.textContent = window.TERMS_UPDATED_AT;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint);
  } else {
    paint();
  }
})();
