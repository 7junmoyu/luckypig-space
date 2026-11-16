// One timer, restarted after every selection or pause. No background catch-up.
export function createHeroCarousel({ onSelect, onState = () => {}, playing = true,
  delay = 7000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const views = ['portrait', 'knot', 'sphere'];
  const blockers = new Set();
  let view = views[0], timer, disposed = false;
  function update() {
    clearTimer(timer);
    timer = undefined;
    if (disposed) return;
    const running = playing && blockers.size === 0;
    onState({ view, playing, running });
    if (running) timer = setTimer(() => select(views[(views.indexOf(view) + 1) % views.length], 'auto'), delay);
  }
  function select(next, reason = 'manual') {
    if (disposed || !views.includes(next)) return;
    view = next;
    onSelect(view, reason);
    update();
  }
  update();
  return {
    select,
    setPlaying(value) { if (!disposed) { playing = Boolean(value); update(); } },
    pause(reason, value) {
      if (disposed || blockers.has(reason) === Boolean(value)) return;
      if (value) blockers.add(reason); else blockers.delete(reason);
      update();
    },
    destroy() { disposed = true; clearTimer(timer); },
  };
}

export function mountHeroCarousel(stage, { selectView, reducedMotion }) {
  const toggle = stage.querySelector('[data-hero-autoplay]');
  const carousel = createHeroCarousel({
    playing: !reducedMotion.matches,
    onSelect: selectView,
    onState({ playing, running }) {
      toggle.textContent = playing ? '暂停' : '播放';
      toggle.setAttribute('aria-label', playing ? '暂停自动轮播' : '开始自动轮播');
      toggle.title = playing ? '暂停自动轮播' : '开始自动轮播';
      stage.dataset.heroAutoplay = playing ? (running ? 'running' : 'paused') : 'stopped';
    },
  });
  toggle.addEventListener('click', () => {
    const play = stage.dataset.heroAutoplay === 'stopped';
    // An explicit Play action should work while its button still has focus.
    if (play) { carousel.pause('hover', false); carousel.pause('focus', false); }
    carousel.setPlaying(play);
  });
  stage.querySelectorAll('[data-hero-view]').forEach((button) => {
    button.addEventListener('click', () => carousel.select(button.dataset.heroView));
  });
  stage.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') carousel.pause('hover', true); });
  stage.addEventListener('pointerleave', () => carousel.pause('hover', false));
  const pointers = new Set();
  stage.addEventListener('pointerdown', (event) => { pointers.add(event.pointerId); carousel.pause('pointer', true); });
  const releasePointer = (event) => { pointers.delete(event.pointerId); carousel.pause('pointer', pointers.size > 0); };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  stage.addEventListener('focusin', () => carousel.pause('focus', true));
  stage.addEventListener('focusout', (event) => { if (!stage.contains(event.relatedTarget)) carousel.pause('focus', false); });
  const updateVisibility = () => carousel.pause('hidden', document.hidden);
  document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();
  carousel.pause('offscreen', true);
  new IntersectionObserver(([entry]) => carousel.pause('offscreen', !entry.isIntersecting)).observe(stage);
  reducedMotion.addEventListener('change', (event) => { if (event.matches) carousel.setPlaying(false); });
  window.addEventListener('pagehide', () => carousel.pause('pagehide', true));
  window.addEventListener('pageshow', () => carousel.pause('pagehide', false));
  return carousel;
}
