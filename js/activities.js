/*
 * Agenda de Charlas y Actividades: carga data/activities.json, arma los
 * filtros de fecha/categoria/modalidad de forma dinamica (a partir de los
 * valores que existan en los datos, no hardcodeados) y renderiza las tarjetas.
 *
 * Igual que en stats.js, loadActivities() es el unico punto que hay que
 * reemplazar por una llamada a una API real cuando exista backend.
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const BASE_PATH = scriptEl ? scriptEl.src.replace(/js\/activities\.js.*$/, '') : '';

  const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  const ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  const ICON_PIN = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const ICON_PERSON = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.5-4 4.5-6 7.5-6s6 2 7.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  async function loadActivities() {
    try {
      const res = await fetch(BASE_PATH + 'data/activities.json');
      if (!res.ok) throw new Error('no data');
      const json = await res.json();
      return json.activities || [];
    } catch (e) {
      return [];
    }
  }

  function parseDate(iso) {
    return new Date(iso + 'T00:00:00');
  }

  function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatFullDate(iso, time) {
    const d = parseDate(iso);
    const weekday = WEEKDAYS[d.getDay()];
    const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
    return time ? `${label} · ${time}` : label;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function populateFilterOptions(section, activities) {
    const categories = Array.from(new Set(activities.map((a) => a.category))).sort();
    const modalities = Array.from(new Set(activities.map((a) => a.modality))).sort();

    const categorySelect = section.querySelector('[data-filter="category"]');
    const modalitySelect = section.querySelector('[data-filter="modality"]');

    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    });
    modalities.forEach((mod) => {
      const opt = document.createElement('option');
      opt.value = mod;
      opt.textContent = mod;
      modalitySelect.appendChild(opt);
    });
  }

  function buildCard(activity) {
    const d = parseDate(activity.date);
    const card = document.createElement('article');
    card.className = 'activity-card-full reveal';

    const thumb = document.createElement('div');
    thumb.className = 'activity-card-thumb';
    thumb.innerHTML = `
      <img src="${BASE_PATH}${activity.image}" alt="" loading="lazy">
      <div class="activity-date"><span class="day">${String(d.getDate()).padStart(2, '0')}</span><span class="month">${MONTHS_SHORT[d.getMonth()]}</span></div>
      <span class="activity-card-modality">${escapeHtml(activity.modality)}</span>
    `;
    card.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'activity-card-body';

    const category = document.createElement('p');
    category.className = 'activity-card-category';
    category.textContent = activity.category;
    body.appendChild(category);

    const title = document.createElement('h3');
    title.textContent = activity.title;
    body.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = activity.description;
    body.appendChild(desc);

    const meta = document.createElement('div');
    meta.className = 'activity-card-meta';
    meta.innerHTML = `
      <span>${ICON_CLOCK}${escapeHtml(formatFullDate(activity.date, activity.time))}</span>
      <span>${ICON_PIN}${escapeHtml(activity.location)}</span>
      <span>${ICON_PERSON}${escapeHtml(activity.organizer)}</span>
    `;
    body.appendChild(meta);

    const link = document.createElement('a');
    link.className = 'btn btn-outline-pink';
    link.href = activity.infoUrl || '#';
    if (activity.infoUrl) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    link.innerHTML = 'Más información <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h11.5M8 1l4.5 4L8 9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    body.appendChild(link);

    card.appendChild(body);
    return card;
  }

  function applyFilters(section, activities) {
    const timeFilter = section.querySelector('[data-filter="time"]').value;
    const categoryFilter = section.querySelector('[data-filter="category"]').value;
    const modalityFilter = section.querySelector('[data-filter="modality"]').value;
    const today = todayStart();

    return activities.filter((a) => {
      const d = parseDate(a.date);
      if (timeFilter === 'upcoming' && d < today) return false;
      if (timeFilter === 'past' && d >= today) return false;
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (modalityFilter !== 'all' && a.modality !== modalityFilter) return false;
      return true;
    }).sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }

  function renderList(section, activities) {
    const list = section.querySelector('[data-activities-list]');
    const filtered = applyFilters(section, activities);
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<p class="activities-empty">No hay actividades que coincidan con estos filtros por ahora.</p>';
      return;
    }
    filtered.forEach((activity) => list.appendChild(buildCard(activity)));

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
      list.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    } else {
      list.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    }
  }

  function renderSkeleton(section) {
    const list = section.querySelector('[data-activities-list]');
    list.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
  }

  async function init() {
    const section = document.querySelector('[data-activities-list]')?.closest('section');
    if (!section) return;
    renderSkeleton(section);
    const activities = await loadActivities();
    populateFilterOptions(section, activities);
    section.querySelectorAll('[data-filter]').forEach((select) => {
      select.addEventListener('change', () => renderList(section, activities));
    });
    renderList(section, activities);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
