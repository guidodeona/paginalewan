/*
 * Carrusel de "Quienes lo hacen posible": autoplay continuo hacia la
 * izquierda, la tarjeta que llega exactamente al centro es la unica que
 * recibe el zoom, y ese cambio de tamano corre en simultaneo con el
 * deslizamiento (no como un salto al final del movimiento).
 *
 * El HTML solo trae las 6 tarjetas reales. Este script clona ese set una
 * vez antes y una vez despues (18 tarjetas en total) para que, sin importar
 * en cual de las 6 reales estemos centrados, siempre haya un set entero de
 * "relleno" a cada lado — asi nunca se ve un hueco al costado ni un salto
 * al llegar al final y volver a arrancar.
 *
 * No hay flechas ni botones: el unico control manual es el swipe en
 * pantallas tactiles.
 */
(() => {
  'use strict';

  function initTeamCarousel() {
    const viewport = document.querySelector('.team-carousel');
    const track = document.querySelector('.team-carousel-track');
    if (!viewport || !track) return;

    const originals = Array.from(track.children);
    const oneSet = originals.length;
    if (!oneSet) return;

    function cloneSet() {
      return originals.map((card) => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('[data-photo-slot]').forEach((el) => el.removeAttribute('data-photo-slot'));
        return clone;
      });
    }

    // insertBefore(clone, firstChild) invierte el orden si se hace en un
    // loop directo, asi que recorremos el set al reves para que el bloque
    // "de antes" quede en el mismo orden que las tarjetas reales.
    cloneSet().reverse().forEach((clone) => track.insertBefore(clone, track.firstChild));
    cloneSet().forEach((clone) => track.appendChild(clone));

    const cards = Array.from(track.children);
    const HOLD_MS = 2500; // tiempo entre movimientos automaticos
    const TRANSITION_MS = 450; // igual que la transition de .team-card en el CSS
    const RESUME_AFTER_MS = 3000; // reanuda el autoplay a los pocos segundos de un swipe

    let index = oneSet; // arranca centrado en la primera tarjeta real
    let paused = false;
    let autoTimer = null;
    let resumeTimer = null;

    // Lee el gap real del CSS en vez de asumir un valor fijo: el gap cambia
    // por breakpoint (tablet/mobile), y si no coincide exactamente el
    // centrado de la tarjeta activa queda corrido unos pixeles.
    function currentGapPx() {
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      return gap;
    }
    function stepWidth() {
      return cards[0].getBoundingClientRect().width + currentGapPx();
    }
    function centerOffset() {
      const viewportWidth = viewport.getBoundingClientRect().width;
      const cardWidth = cards[0].getBoundingClientRect().width;
      return (viewportWidth - cardWidth) / 2;
    }
    function moveTo(i, animate) {
      track.style.transition = animate ? `transform ${TRANSITION_MS}ms ease-in-out` : 'none';
      track.style.transform = `translateX(${centerOffset() - i * stepWidth()}px)`;
    }
    function setActive(i) {
      cards.forEach((c) => c.classList.remove('is-active'));
      if (cards[i]) cards[i].classList.add('is-active');
    }
    function scheduleAuto(delay) {
      clearTimeout(autoTimer);
      autoTimer = window.setTimeout(autoAdvance, delay);
    }

    // El deslizamiento del track y el cambio de tamano de la tarjeta
    // (agrandar la que entra al centro, achicar la que lo abandona) arrancan
    // juntos aca mismo, asi las dos transiciones CSS corren en simultaneo.
    function goTo(target, onSettled) {
      moveTo(target, true);
      setActive(target);
      window.setTimeout(() => {
        if (target >= oneSet * 2) {
          index = target - oneSet;
          moveTo(index, false);
          setActive(index);
        } else if (target < oneSet) {
          index = target + oneSet;
          moveTo(index, false);
          setActive(index);
        } else {
          index = target;
        }
        if (onSettled) onSettled();
      }, TRANSITION_MS + 40);
    }

    function autoAdvance() {
      if (paused) { scheduleAuto(300); return; }
      goTo(index + 1, () => scheduleAuto(HOLD_MS));
    }

    function manualStep(direction) {
      paused = true;
      clearTimeout(resumeTimer);
      clearTimeout(autoTimer);
      goTo(index + direction, () => {
        resumeTimer = window.setTimeout(() => {
          paused = false;
          scheduleAuto(HOLD_MS);
        }, RESUME_AFTER_MS);
      });
    }

    moveTo(index, false);
    setActive(index);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      scheduleAuto(HOLD_MS);
    }

    viewport.addEventListener('mouseenter', () => { paused = true; });
    viewport.addEventListener('mouseleave', () => {
      clearTimeout(resumeTimer);
      paused = false;
      scheduleAuto(HOLD_MS);
    });

    // Swipe en mobile/touch
    let touchStartX = null;
    viewport.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    viewport.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      const SWIPE_THRESHOLD = 40;
      if (dx > SWIPE_THRESHOLD) manualStep(-1);
      else if (dx < -SWIPE_THRESHOLD) manualStep(1);
    }, { passive: true });

    window.addEventListener('resize', () => moveTo(index, false));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeamCarousel);
  } else {
    initTeamCarousel();
  }
})();
