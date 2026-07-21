/*
 * 6 avatares prediseñados, 100% originales (creados para este sitio, sin
 * relacion con personajes de terceros). Registro compartido: lo usa la
 * pagina de perfil (para elegir avatar) y cualquier lugar que muestre el
 * avatar de un usuario con avatar_type='preset' (comentarios, panel admin).
 */
window.AVATAR_PRESETS = [
  {
    id: 'avatar-1',
    label: 'Debate',
    svg: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#00B7EB"/>
      <path d="M20 78c2-16 12-24 28-24s26 8 28 24" fill="#1B3A47"/>
      <circle cx="48" cy="42" r="22" fill="#F2C29B"/>
      <path d="M26 38c0-14 10-22 22-22s22 8 22 22c-6-4-14-6-22-6s-16 2-22 6z" fill="#3A2317"/>
      <rect x="30" y="42" width="14" height="10" rx="5" fill="none" stroke="#1B3A47" stroke-width="3"/>
      <rect x="52" y="42" width="14" height="10" rx="5" fill="none" stroke="#1B3A47" stroke-width="3"/>
      <line x1="44" y1="46" x2="52" y2="46" stroke="#1B3A47" stroke-width="3"/>
      <path d="M40 58q8 6 16 0" fill="none" stroke="#8a4a2e" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'avatar-2',
    label: 'Arte',
    svg: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#ED25B2"/>
      <path d="M20 80c1-17 12-26 28-26s27 9 28 26" fill="#5A2E1E"/>
      <circle cx="48" cy="44" r="22" fill="#C98A5B"/>
      <path d="M24 40c-4-16 8-28 24-28s26 12 24 26c-4-10-10-6-14-14-4 8-14 10-20 10-4 0-10-2-14 6z" fill="#2B160E"/>
      <path d="M66 20c6 2 8 8 6 14" fill="none" stroke="#00B7EB" stroke-width="4" stroke-linecap="round"/>
      <circle cx="39" cy="44" r="3.2" fill="#1B3A47"/>
      <circle cx="57" cy="44" r="3.2" fill="#1B3A47"/>
      <path d="M39 58q9 7 18 0" fill="none" stroke="#7a3d20" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'avatar-3',
    label: 'Deporte',
    svg: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#EA5E1F"/>
      <path d="M19 79c2-16 13-25 29-25s27 9 29 25" fill="#F4F2E9"/>
      <circle cx="48" cy="43" r="22" fill="#8a4a2e"/>
      <path d="M65 50c6 2 8 10 4 16-3-8-6-11-10-12z" fill="#2B160E"/>
      <rect x="24" y="24" width="48" height="9" rx="4.5" fill="#1B3A47"/>
      <circle cx="39" cy="45" r="3.2" fill="#1B3A47"/>
      <circle cx="57" cy="45" r="3.2" fill="#1B3A47"/>
      <path d="M38 57q10 8 20 0" fill="none" stroke="#1B3A47" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'avatar-4',
    label: 'Naturaleza',
    svg: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#006B8A"/>
      <path d="M20 79c2-16 12-25 28-25s26 9 28 25" fill="#3A2317"/>
      <circle cx="48" cy="44" r="22" fill="#F2C29B"/>
      <path d="M27 36c-2-12 8-20 21-20s23 8 21 20c-7-6-14-8-21-8s-14 2-21 8z" fill="#4a2f1c"/>
      <circle cx="34" cy="26" r="6" fill="#ED25B2"/>
      <circle cx="34" cy="26" r="2.4" fill="#F4F2E9"/>
      <circle cx="39" cy="45" r="3.2" fill="#1B3A47"/>
      <circle cx="57" cy="45" r="3.2" fill="#1B3A47"/>
      <path d="M39 58q9 6 18 0" fill="none" stroke="#8a4a2e" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'avatar-5',
    label: 'Música',
    svg: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#B21C86"/>
      <path d="M19 79c2-16 13-25 29-25s27 9 29 25" fill="#1B3A47"/>
      <circle cx="48" cy="43" r="22" fill="#C98A5B"/>
      <path d="M26 40c0-13 10-21 22-21s22 8 22 21c-4-6-8-4-8 2v4h-6v-8c-2-4-6-6-8-6s-6 2-8 6v8h-6v-4c0-6-4-8-8-2z" fill="#241209"/>
      <path d="M22 40c-6 0-9 5-9 10s3 9 8 9" fill="none" stroke="#1B3A47" stroke-width="5" stroke-linecap="round"/>
      <path d="M74 40c6 0 9 5 9 10s-3 9-8 9" fill="none" stroke="#1B3A47" stroke-width="5" stroke-linecap="round"/>
      <circle cx="20" cy="60" r="7" fill="#1B3A47"/>
      <circle cx="76" cy="60" r="7" fill="#1B3A47"/>
      <circle cx="39" cy="45" r="3.2" fill="#1B3A47"/>
      <circle cx="57" cy="45" r="3.2" fill="#1B3A47"/>
      <path d="M39 58q9 6 18 0" fill="none" stroke="#7a4a2e" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'avatar-6',
    label: 'Lectura',
    svg: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#1B3A47"/>
      <path d="M20 79c2-16 12-25 28-25s26 9 28 25" fill="#F4F2E9"/>
      <circle cx="48" cy="44" r="22" fill="#8a4a2e"/>
      <path d="M25 34c8-14 38-14 46 0-3 6-8 2-23 2s-20 4-23-2z" fill="#EA5E1F"/>
      <circle cx="39" cy="46" r="3.2" fill="#1B3A47"/>
      <circle cx="57" cy="46" r="3.2" fill="#1B3A47"/>
      <path d="M39 59q9 6 18 0" fill="none" stroke="#5a2e1a" stroke-width="3" stroke-linecap="round"/>
      <rect x="32" y="68" width="32" height="15" rx="2" fill="#F4F2E9"/>
      <line x1="48" y1="68" x2="48" y2="83" stroke="#00B7EB" stroke-width="2"/>
      <line x1="36" y1="73" x2="44" y2="73" stroke="#1B3A47" stroke-width="2"/>
      <line x1="36" y1="78" x2="44" y2="78" stroke="#1B3A47" stroke-width="2"/>
      <line x1="52" y1="73" x2="60" y2="73" stroke="#1B3A47" stroke-width="2"/>
      <line x1="52" y1="78" x2="60" y2="78" stroke="#1B3A47" stroke-width="2"/>
    </svg>`,
  },
];

window.getAvatarPreset = function getAvatarPreset(id) {
  return window.AVATAR_PRESETS.find((a) => a.id === id) || window.AVATAR_PRESETS[0];
};
