/*
 * Avatares prediseñados (ilustraciones genéricas, sin relación con personas
 * reales). Registro compartido: lo usa la pagina de perfil (para elegir
 * avatar) y cualquier lugar que muestre el avatar de un usuario con
 * avatar_type='preset' (comentarios, panel admin). Cada preset apunta a una
 * imagen en assets/images/avatares/; la ruta se resuelve en tiempo de uso
 * con el BASE_PATH de cada pagina (ver buildAvatarImg en este mismo archivo).
 */
window.AVATAR_PRESETS = [
  { id: 'avatar-1', label: 'Persona con pelo rosa', image: 'assets/images/avatares/persona-1.webp' },
  { id: 'avatar-2', label: 'Persona con pelo rizado y pañuelo', image: 'assets/images/avatares/persona-2.webp' },
  { id: 'avatar-3', label: 'Persona con gorra', image: 'assets/images/avatares/persona-3.webp' },
  { id: 'avatar-4', label: 'Persona haciendo seña de paz', image: 'assets/images/avatares/persona-4.webp' },
  { id: 'avatar-5', label: 'Persona con anteojos', image: 'assets/images/avatares/persona-5.webp' },
  { id: 'avatar-6', label: 'Persona con pelo ondulado', image: 'assets/images/avatares/persona-6.webp' },
  { id: 'avatar-7', label: 'Perro', image: 'assets/images/avatares/perro.webp' },
  { id: 'avatar-8', label: 'Gato', image: 'assets/images/avatares/gato.webp' },
  { id: 'avatar-9', label: 'Capibara', image: 'assets/images/avatares/capibara.webp' },
  { id: 'avatar-10', label: 'Oso hormiguero', image: 'assets/images/avatares/oso-hormiguero.webp' },
  { id: 'avatar-11', label: 'Búho', image: 'assets/images/avatares/buho.webp' },
  { id: 'avatar-12', label: 'Llama', image: 'assets/images/avatares/llama.webp' },
  { id: 'avatar-13', label: 'Pingüino', image: 'assets/images/avatares/pinguino.webp' },
  { id: 'avatar-14', label: 'Vaca', image: 'assets/images/avatares/vaca.webp' },
  { id: 'avatar-15', label: 'Zorro', image: 'assets/images/avatares/zorro.webp' },
  { id: 'avatar-16', label: 'Tortuga', image: 'assets/images/avatares/tortuga.webp' },
  { id: 'avatar-17', label: 'Delfín', image: 'assets/images/avatares/delfin.webp' },
  { id: 'avatar-18', label: 'Panda', image: 'assets/images/avatares/panda.webp' },
];

window.getAvatarPreset = function getAvatarPreset(id) {
  return window.AVATAR_PRESETS.find((a) => a.id === id) || window.AVATAR_PRESETS[0];
};

// BASE_PATH-aware <img> para un preset, reutilizable desde cualquier pagina
// (raiz o subcarpeta como articulos/, tematicas/).
window.buildAvatarPresetImg = function buildAvatarPresetImg(preset, basePath) {
  const img = document.createElement('img');
  img.src = (basePath || '') + preset.image;
  img.alt = '';
  img.loading = 'lazy';
  return img;
};
