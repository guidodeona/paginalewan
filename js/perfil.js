/*
 * Pagina de perfil: datos publicos (profiles), datos privados
 * (profile_private, jamas expuestos a otros usuarios) y redes sociales
 * (profile_social_links, visibilidad real via RLS por fila). El gate de
 * "iniciá sesión" es solo UX: la proteccion real de que cada quien edite
 * unicamente su propio perfil vive en las policies de supabase/schema.sql
 * (auth.uid() = id), no en este archivo.
 */
(() => {
  'use strict';

  const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'facebook'];
  const CROP_SIZE = 280;
  const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
  const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  function client() {
    return window.ActivemosAuth && window.ActivemosAuth.getClient();
  }

  function showGate(message, showLoginBtn) {
    const gate = document.querySelector('[data-profile-gate]');
    const panel = document.querySelector('[data-profile-panel]');
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

  function renderAvatarPreview(profile) {
    const img = document.querySelector('[data-profile-avatar-img]');
    const svgMount = document.querySelector('[data-profile-avatar-svg]');
    if (profile.avatar_type === 'custom' && profile.avatar_url) {
      img.src = profile.avatar_url;
      img.hidden = false;
      svgMount.hidden = true;
      svgMount.innerHTML = '';
    } else {
      const preset = window.getAvatarPreset(profile.avatar_preset_id || 'avatar-1');
      svgMount.innerHTML = preset.svg;
      svgMount.hidden = false;
      img.hidden = true;
      img.removeAttribute('src');
    }
  }

  function renderAvatarPresetGrid(profile) {
    const grid = document.querySelector('[data-avatar-presets-panel]');
    grid.innerHTML = '';
    window.AVATAR_PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-preset-btn';
      btn.setAttribute('aria-label', preset.label);
      btn.setAttribute('aria-pressed', String(profile.avatar_type !== 'custom' && profile.avatar_preset_id === preset.id));
      btn.innerHTML = preset.svg;
      btn.addEventListener('click', () => selectPresetAvatar(preset.id));
      grid.appendChild(btn);
    });
  }

  async function selectPresetAvatar(presetId) {
    const feedback = document.querySelector('[data-avatar-feedback]');
    const user = window.ActivemosAuth.getUser();
    const { error } = await client().from('profiles')
      .update({ avatar_type: 'preset', avatar_preset_id: presetId })
      .eq('id', user.id);
    if (error) { feedback.textContent = 'No se pudo actualizar el avatar.'; return; }
    feedback.textContent = 'Avatar actualizado.';
    await loadAndRenderProfile();
  }

  // --- Recorte de foto con canvas -------------------------------------------
  let cropState = null;

  function initCropInteractions(canvas) {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging || !cropState) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      cropState.offsetX += dx;
      cropState.offsetY += dy;
      clampOffset();
      drawCrop();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
      canvas.addEventListener(ev, () => { dragging = false; });
    });
  }

  function clampOffset() {
    const { drawWidth, drawHeight } = cropState;
    cropState.offsetX = Math.min(0, Math.max(CROP_SIZE - drawWidth, cropState.offsetX));
    cropState.offsetY = Math.min(0, Math.max(CROP_SIZE - drawHeight, cropState.offsetY));
  }

  function drawCrop() {
    const canvas = document.querySelector('[data-crop-canvas]');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(cropState.img, cropState.offsetX, cropState.offsetY, cropState.drawWidth, cropState.drawHeight);
  }

  function setZoom(zoomMultiplier) {
    const { img, baseScale } = cropState;
    const prevW = cropState.drawWidth;
    const prevH = cropState.drawHeight;
    const centerX = cropState.offsetX - prevW / 2 + CROP_SIZE / 2;
    const centerY = cropState.offsetY - prevH / 2 + CROP_SIZE / 2;

    const scale = baseScale * zoomMultiplier;
    cropState.drawWidth = img.width * scale;
    cropState.drawHeight = img.height * scale;
    cropState.offsetX = centerX + cropState.drawWidth / 2 - CROP_SIZE / 2;
    cropState.offsetY = centerY + cropState.drawHeight / 2 - CROP_SIZE / 2;
    clampOffset();
    drawCrop();
  }

  function loadImageForCrop(file) {
    const feedback = document.querySelector('[data-avatar-feedback]');
    feedback.textContent = '';

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      feedback.textContent = 'Formato no permitido. Usá JPG, PNG o WEBP.';
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      feedback.textContent = 'La imagen pesa demasiado (máximo 3 MB).';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const baseScale = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
        cropState = { img, baseScale, drawWidth: img.width * baseScale, drawHeight: img.height * baseScale, offsetX: 0, offsetY: 0 };
        cropState.offsetX = (CROP_SIZE - cropState.drawWidth) / 2;
        cropState.offsetY = (CROP_SIZE - cropState.drawHeight) / 2;
        document.querySelector('[data-crop-zoom]').value = '1';
        document.querySelector('[data-crop-wrap]').hidden = false;
        drawCrop();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function saveCroppedAvatar() {
    const feedback = document.querySelector('[data-avatar-feedback]');
    const canvas = document.querySelector('[data-crop-canvas]');
    const user = window.ActivemosAuth.getUser();
    feedback.textContent = 'Subiendo...';

    canvas.toBlob(async (blob) => {
      if (!blob) { feedback.textContent = 'No se pudo procesar la imagen.'; return; }
      const path = `${user.id}/avatar-${Date.now()}.png`;
      const { error: uploadError } = await client().storage.from('avatars').upload(path, blob, {
        contentType: 'image/png',
        upsert: false,
      });
      if (uploadError) { feedback.textContent = 'No se pudo subir la foto. Volvé a intentar.'; return; }

      const { data: publicUrlData } = client().storage.from('avatars').getPublicUrl(path);
      const { error: updateError } = await client().from('profiles')
        .update({ avatar_type: 'custom', avatar_url: publicUrlData.publicUrl })
        .eq('id', user.id);
      if (updateError) { feedback.textContent = 'La foto se subió pero no se pudo guardar en tu perfil.'; return; }

      feedback.textContent = '¡Listo! Foto de perfil actualizada.';
      document.querySelector('[data-crop-wrap]').hidden = true;
      document.querySelector('[data-avatar-file-input]').value = '';
      cropState = null;
      await loadAndRenderProfile();
    }, 'image/png', 0.92);
  }

  async function removeCustomAvatar() {
    const feedback = document.querySelector('[data-avatar-feedback]');
    const user = window.ActivemosAuth.getUser();
    const { error } = await client().from('profiles')
      .update({ avatar_type: 'preset', avatar_url: null })
      .eq('id', user.id);
    if (error) { feedback.textContent = 'No se pudo quitar la foto.'; return; }
    feedback.textContent = 'Listo, volviste a un avatar prediseñado.';
    await loadAndRenderProfile();
  }

  function initAvatarTabs() {
    const tabs = Array.from(document.querySelectorAll('[data-avatar-tab]'));
    const panels = {
      presets: document.querySelector('[data-avatar-presets-panel]'),
      upload: document.querySelector('[data-avatar-upload-panel]'),
    };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
        panels.presets.hidden = tab.dataset.avatarTab !== 'presets';
        panels.upload.hidden = tab.dataset.avatarTab !== 'upload';
      });
    });
  }

  // --- Redes sociales --------------------------------------------------------
  function renderSocialLinks(links) {
    const list = document.querySelector('[data-social-list]');
    list.innerHTML = '';
    SOCIAL_PLATFORMS.forEach((platform) => {
      const existing = links.find((l) => l.platform === platform);
      const row = document.createElement('div');
      row.className = 'social-link-row';
      row.innerHTML = `
        <span class="social-link-platform">${platform}</span>
        <input type="url" name="social_${platform}" placeholder="https://" value="${existing ? existing.url.replace(/"/g, '&quot;') : ''}">
        <label><input type="checkbox" name="social_${platform}_public" ${!existing || existing.is_public ? 'checked' : ''}> Público</label>
      `;
      list.appendChild(row);
    });
  }

  async function loadSocialLinks(userId) {
    const { data } = await client().from('profile_social_links').select('platform, url, is_public').eq('profile_id', userId);
    return data || [];
  }

  async function saveSocialLinks(form, userId) {
    for (const platform of SOCIAL_PLATFORMS) {
      const url = form.querySelector(`[name="social_${platform}"]`).value.trim();
      if (url && !/^https:\/\//i.test(url)) {
        throw new Error(`El link de ${platform} tiene que empezar con https://`);
      }
    }
    await Promise.all(SOCIAL_PLATFORMS.map((platform) => {
      const url = form.querySelector(`[name="social_${platform}"]`).value.trim();
      const isPublic = form.querySelector(`[name="social_${platform}_public"]`).checked;
      if (!url) {
        return client().from('profile_social_links').delete().eq('profile_id', userId).eq('platform', platform);
      }
      return client().from('profile_social_links').upsert(
        { profile_id: userId, platform, url, is_public: isPublic, updated_at: new Date().toISOString() },
        { onConflict: 'profile_id,platform' }
      );
    }));
  }

  // --- Formulario principal ---------------------------------------------------
  function fillForm(form, profile, privateData) {
    form.firstName.value = profile.first_name || '';
    form.lastName.value = profile.last_name || '';
    form.username.value = profile.username || '';
    form.bio.value = profile.bio || '';
    form.location.value = profile.location || '';
    form.province.value = profile.province || '';
    form.educationLevel.value = profile.education_level || '';
    form.educationInstitution.value = profile.education_institution || '';
    form.educationField.value = profile.education_field || '';
    form.communicationConsent.checked = Boolean(profile.communication_consent);
    form.phone.value = (privateData && privateData.phone) || '';
    form.birthDate.value = (privateData && privateData.birth_date) || '';
  }

  async function loadAndRenderProfile() {
    const user = window.ActivemosAuth.getUser();
    const { data: profile } = await client().from('profiles').select('*').eq('id', user.id).single();
    const { data: privateData } = await client().from('profile_private').select('phone, birth_date').eq('id', user.id).maybeSingle();
    const links = await loadSocialLinks(user.id);

    renderAvatarPreview(profile);
    renderAvatarPresetGrid(profile);
    renderSocialLinks(links);
    fillForm(document.querySelector('[data-profile-form]'), profile, privateData);
  }

  function translateSaveError(error) {
    if (error && error.code === '23505') return 'Ese nombre de usuario ya está en uso. Probá con otro.';
    return 'No se pudieron guardar los cambios. Revisá los datos e intentá de nuevo.';
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const feedback = document.querySelector('[data-profile-feedback]');
    const submitBtn = form.querySelector('button[type="submit"]');
    feedback.textContent = '';
    const user = window.ActivemosAuth.getUser();

    const username = form.username.value.trim();
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      feedback.textContent = 'El nombre de usuario tiene que tener 3 a 20 caracteres: letras, números o guion bajo.';
      return;
    }
    const phone = form.phone.value.trim();
    if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) {
      feedback.textContent = 'El teléfono no tiene un formato válido.';
      return;
    }
    const birthDate = form.birthDate.value;
    if (birthDate && new Date(birthDate) > new Date()) {
      feedback.textContent = 'La fecha de nacimiento no puede ser futura.';
      return;
    }

    submitBtn.disabled = true;
    feedback.textContent = 'Guardando...';

    try {
      const [profileRes, privateRes, consentRes, socialRes] = await Promise.all([
        client().from('profiles').update({
          first_name: form.firstName.value.trim() || null,
          last_name: form.lastName.value.trim() || null,
          username: username || null,
          bio: form.bio.value.trim() || null,
          location: form.location.value.trim() || null,
          province: form.province.value.trim() || null,
          education_level: form.educationLevel.value || null,
          education_institution: form.educationInstitution.value.trim() || null,
          education_field: form.educationField.value.trim() || null,
        }).eq('id', user.id),
        client().from('profile_private').upsert({
          id: user.id,
          phone: phone || null,
          birth_date: birthDate || null,
          updated_at: new Date().toISOString(),
        }),
        client().rpc('set_communication_consent', { p_consent: form.communicationConsent.checked }),
        saveSocialLinks(form, user.id).then(() => ({ error: null })).catch((err) => ({ error: err })),
      ]);

      if (profileRes.error) { feedback.textContent = translateSaveError(profileRes.error); return; }
      if (privateRes.error) { feedback.textContent = 'No se pudieron guardar tus datos privados.'; return; }
      if (consentRes.error) { feedback.textContent = 'No se pudo guardar tu preferencia de comunicaciones.'; return; }
      if (socialRes.error) { feedback.textContent = socialRes.error.message; return; }

      feedback.textContent = '¡Listo! Tus cambios se guardaron.';
    } finally {
      submitBtn.disabled = false;
    }
  }

  let loadedForUserId = null;

  async function evaluateAccess() {
    const user = window.ActivemosAuth.getUser();
    if (!user) {
      loadedForUserId = null;
      showGate('Iniciá sesión para ver y editar tu perfil.', true);
      return;
    }
    // onChange también dispara con eventos como refresco de token: si ya
    // cargamos el perfil de este mismo usuario, no volvemos a pisar el
    // formulario mientras lo está editando.
    if (loadedForUserId === user.id) return;

    showGate('Cargando tu perfil...', false);
    await loadAndRenderProfile();
    loadedForUserId = user.id;
    document.querySelector('[data-profile-gate]').hidden = true;
    document.querySelector('[data-profile-panel]').hidden = false;
  }

  function init() {
    if (!window.ActivemosAuth || !window.ActivemosAuth.isConfigured()) {
      showGate('El perfil no está disponible todavía.', false);
      return;
    }

    initAvatarTabs();
    initCropInteractions(document.querySelector('[data-crop-canvas]'));

    document.querySelector('[data-avatar-file-input]').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) loadImageForCrop(file);
    });
    document.querySelector('[data-crop-zoom]').addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
    document.querySelector('[data-crop-save]').addEventListener('click', saveCroppedAvatar);
    document.querySelector('[data-crop-cancel]').addEventListener('click', () => {
      document.querySelector('[data-crop-wrap]').hidden = true;
      document.querySelector('[data-avatar-file-input]').value = '';
      cropState = null;
    });
    document.querySelector('[data-avatar-remove]').addEventListener('click', removeCustomAvatar);
    document.querySelector('[data-profile-form]').addEventListener('submit', handleFormSubmit);

    window.ActivemosAuth.onChange(() => evaluateAccess());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
