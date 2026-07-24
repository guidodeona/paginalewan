(function () {
  var track = document.querySelector('.team-carousel-track');
  if (!track) return;
  var infos = Array.prototype.slice.call(track.querySelectorAll('.team-card-info'));
  if (!infos.length) return;

  function equalizeHeights() {
    infos.forEach(function (el) { el.style.minHeight = ''; });
    var maxHeight = infos.reduce(function (max, el) {
      return Math.max(max, el.getBoundingClientRect().height);
    }, 0);
    infos.forEach(function (el) { el.style.minHeight = maxHeight + 'px'; });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(equalizeHeights, 150);
  });

  window.addEventListener('load', equalizeHeights);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(equalizeHeights);
  }
  equalizeHeights();
})();
