(() => {
  'use strict';

  // Año dinámico en el footer
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Header: sombra al hacer scroll
  const header = document.getElementById('site-header');
  const onScroll = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 10);
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Menú móvil
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Dropdowns del menú (click/teclado, con soporte hover por CSS)
  document.querySelectorAll('.dropdown-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const parent = toggle.closest('.has-dropdown');
      const isOpen = parent.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));

      document.querySelectorAll('.has-dropdown.is-open').forEach((other) => {
        if (other !== parent) {
          other.classList.remove('is-open');
          other.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
        }
      });
    });
  });

  document.addEventListener('click', (event) => {
    document.querySelectorAll('.has-dropdown.is-open').forEach((parent) => {
      if (!parent.contains(event.target)) {
        parent.classList.remove('is-open');
        parent.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.has-dropdown.is-open').forEach((parent) => {
        parent.classList.remove('is-open');
        parent.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      });
      mainNav?.classList.remove('is-open');
      navToggle?.setAttribute('aria-expanded', 'false');
    }
  });

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // Newsletter (placeholder: sin backend real)
  const newsletterForm = document.getElementById('newsletterForm');
  const feedback = document.getElementById('newsletterFeedback');
  if (newsletterForm && feedback) {
    newsletterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = newsletterForm.querySelector('#newsletterEmail');
      if (email && email.checkValidity()) {
        feedback.textContent = '¡Gracias por sumarte! Pronto vas a recibir novedades.';
        newsletterForm.reset();
      } else {
        feedback.textContent = 'Ingresá un correo electrónico válido.';
      }
    });
  }
})();
