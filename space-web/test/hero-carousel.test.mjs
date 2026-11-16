import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeroCarousel, mountHeroCarousel } from '../public/hero-carousel.js';

function fixture(options = {}) {
  let now = 0, sequence = 0, state;
  const pending = new Map(), selections = [];
  const carousel = createHeroCarousel({
    ...options,
    onSelect: (view, reason) => selections.push({ view, reason }),
    onState: (value) => { state = value; },
    setTimer: (callback, delay) => { pending.set(++sequence, { callback, at: now + delay }); return sequence; },
    clearTimer: (id) => pending.delete(id),
  });
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const next = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; pending.delete(next[0]); next[1].callback();
    }
    now = end;
  }
  return { carousel, advance, pending, selections, state: () => state };
}

test('hero carousel starts on portrait and loops through both shapes every seven seconds', () => {
  const f = fixture();
  assert.equal(f.state().view, 'portrait');
  f.advance(6999); assert.equal(f.selections.length, 0);
  f.advance(14001);
  assert.deepEqual(f.selections.map((s) => s.view), ['knot', 'sphere', 'portrait']);
  assert.ok(f.selections.every((s) => s.reason === 'auto'));
  assert.equal(f.pending.size, 1);
});

test('manual selection resets a full interval and continues from the selected view', () => {
  const f = fixture();
  f.advance(6000); f.carousel.select('sphere');
  f.advance(6999); assert.equal(f.state().view, 'sphere');
  f.advance(1); assert.equal(f.state().view, 'portrait');
  assert.equal(f.selections[0].reason, 'manual');
  f.carousel.select('unknown'); assert.equal(f.pending.size, 1);
  assert.equal(f.state().view, 'portrait');
});

test('overlapping hover, focus and pointer pauses must all clear before resuming', () => {
  const f = fixture();
  f.advance(6000);
  for (const reason of ['hover', 'focus', 'pointer']) f.carousel.pause(reason, true);
  f.advance(50000); assert.equal(f.selections.length, 0);
  f.carousel.pause('hover', false); f.carousel.pause('pointer', false);
  assert.equal(f.pending.size, 0);
  f.carousel.pause('focus', false);
  f.advance(6999); assert.equal(f.selections.length, 0);
  f.advance(1); assert.equal(f.state().view, 'knot');
});

test('hidden and offscreen slides stay still and resume without catching up', () => {
  const f = fixture();
  f.carousel.pause('hidden', true); f.carousel.pause('offscreen', true);
  f.advance(120000); f.carousel.pause('hidden', false);
  assert.equal(f.state().running, false);
  f.carousel.pause('offscreen', false); f.advance(7000);
  assert.deepEqual(f.selections, [{ view: 'knot', reason: 'auto' }]);
  // Duplicate visibility events must not postpone the next slide.
  f.advance(6000); f.carousel.pause('hidden', false); f.advance(1000);
  assert.equal(f.state().view, 'sphere');
});

test('explicit pause survives transient pauses; reduced-motion initial state allows manual selection', () => {
  const f = fixture({ playing: false });
  f.advance(50000); assert.equal(f.pending.size, 0);
  f.carousel.select('knot'); assert.equal(f.state().view, 'knot');
  f.carousel.pause('focus', true); f.carousel.pause('focus', false);
  assert.equal(f.state().playing, false);
  f.carousel.setPlaying(true); f.advance(7000); assert.equal(f.state().view, 'sphere');
  f.carousel.setPlaying(false); f.advance(50000); assert.equal(f.state().view, 'sphere');
});

test('destroy clears timers and prevents late selections or restarts', () => {
  const f = fixture();
  f.carousel.destroy(); f.carousel.select('sphere'); f.carousel.setPlaying(true);
  f.carousel.pause('hidden', false); f.advance(50000);
  assert.equal(f.pending.size, 0); assert.equal(f.selections.length, 0);
});

function mounted(t, { reduced = false } = {}) {
  class Element extends EventTarget {
    dataset = {}; attributes = {};
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const stage = new Element(), toggle = new Element(), motion = new EventTarget();
  const buttons = ['portrait', 'knot', 'sphere'].map((view) => {
    const button = new Element(); button.dataset.heroView = view; return button;
  });
  const win = new EventTarget(), doc = new EventTarget();
  doc.hidden = false; motion.matches = reduced;
  stage.querySelector = () => toggle;
  stage.querySelectorAll = () => buttons;
  stage.contains = (element) => buttons.includes(element) || element === toggle;
  let intersection;
  const replacements = { window: win, document: doc,
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} },
  };
  for (const [key, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const selected = [];
  const carousel = mountHeroCarousel(stage, { reducedMotion: motion, selectView: (view) => selected.push(view) });
  t.after(() => carousel.destroy());
  const emit = (target, name, data = {}) => target.dispatchEvent(Object.assign(new Event(name), data));
  return { stage, toggle, buttons, win, doc, motion, selected, emit,
    visible: (value) => intersection([{ isIntersecting: value }]), tick: (ms = 7000) => t.mock.timers.tick(ms) };
}

test('mounted carousel pauses for hover, document visibility, and offscreen without losing its slide', (t) => {
  const f = mounted(t);
  assert.equal(f.stage.dataset.heroAutoplay, 'paused');
  f.visible(true); f.tick(); assert.deepEqual(f.selected, ['knot']);
  f.emit(f.stage, 'pointerenter', { pointerType: 'mouse' });
  f.doc.hidden = true; f.emit(f.doc, 'visibilitychange');
  f.emit(f.stage, 'pointerleave'); f.tick(20000);
  assert.equal(f.selected.length, 1);
  f.doc.hidden = false; f.emit(f.doc, 'visibilitychange'); f.tick();
  assert.deepEqual(f.selected, ['knot', 'sphere']);
  f.visible(false); f.tick(20000); assert.equal(f.selected.length, 2);
});

test('mounted pause/play controls resume even with focus on Play; manual views remain usable', (t) => {
  const f = mounted(t); f.visible(true);
  f.emit(f.stage, 'focusin'); f.emit(f.toggle, 'click');
  assert.equal(f.stage.dataset.heroAutoplay, 'stopped');
  assert.equal(f.toggle.attributes['aria-label'], '开始自动轮播');
  f.emit(f.buttons[2], 'click'); f.tick(20000);
  assert.deepEqual(f.selected, ['sphere']);
  f.emit(f.toggle, 'click'); f.tick();
  assert.deepEqual(f.selected, ['sphere', 'portrait']);
  assert.equal(f.toggle.attributes['aria-label'], '暂停自动轮播');
});

test('mounted touch interaction releases on cancel and reduced motion stops autoplay', (t) => {
  const f = mounted(t, { reduced: true }); f.visible(true);
  f.tick(20000); assert.equal(f.selected.length, 0);
  f.emit(f.toggle, 'click');
  f.emit(f.stage, 'pointerdown', { pointerId: 1, pointerType: 'touch' });
  f.emit(f.stage, 'pointerdown', { pointerId: 2, pointerType: 'touch' });
  f.emit(f.win, 'pointerup', { pointerId: 1 }); f.tick(20000);
  assert.equal(f.selected.length, 0);
  f.emit(f.win, 'pointercancel', { pointerId: 2 }); f.tick();
  assert.deepEqual(f.selected, ['knot']);
  f.emit(f.motion, 'change', { matches: true }); f.tick(20000);
  assert.equal(f.stage.dataset.heroAutoplay, 'stopped');
  assert.equal(f.selected.length, 1);
});
