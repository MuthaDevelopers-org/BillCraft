/**
 * Motion for the bill journey, built on the Web Animations API.
 *
 * Every helper is decoration: callers change the data and the text first, so a tap
 * never waits for an animation. Only transform and opacity are animated. When the
 * user asks for reduced motion, the helpers skip the animation and finish at once.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // overshoots a little, then settles
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const DOT_COLOURS = ['#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'];

const nothing = () => {};

export function reducedMotion() {
  return REDUCED.matches || typeof Element.prototype.animate !== 'function';
}

/** A quick bounce, for badges, counts and chips */
export function pop(el, scale = 1.25) {
  if (!el || reducedMotion()) return;
  el.animate([
    { transform: 'scale(1)' },
    { transform: `scale(${scale})` },
    { transform: 'scale(1)' }
  ], { duration: 300, easing: SPRING });
}

/** A gentle hop to draw the eye, for example when Next becomes available */
export function nudge(el) {
  if (!el || reducedMotion()) return;
  el.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-6px) scale(1.04)' },
    { transform: 'translateY(0)' }
  ], { duration: 400, easing: SPRING });
}

/** Shrinks an element away, then calls `done` (at once with reduced motion) */
export function shrink(el, done = nothing) {
  if (!el || reducedMotion()) {
    done();
    return;
  }
  el.animate([
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(0)', opacity: 0 }
  ], { duration: 200, easing: EASE_OUT }).finished.then(done, done);
}

const counters = new WeakMap();

/** Counts the number shown in `el` to `to`, writing each step with `format` */
export function countTo(el, to, format) {
  if (!el) return;
  const state = counters.get(el) || { shown: to, frame: 0 };
  counters.set(el, state);
  cancelAnimationFrame(state.frame);

  const from = state.shown;
  if (reducedMotion() || from === to) {
    state.shown = to;
    el.textContent = format(to);
    return;
  }

  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / 400);
    state.shown = t < 1 ? from + (to - from) * (1 - (1 - t) ** 3) : to;
    el.textContent = format(state.shown);
    if (t < 1) state.frame = requestAnimationFrame(step);
  };
  state.frame = requestAnimationFrame(step);
}

/**
 * A bubble showing `label` flies along an arc from one element into another, then
 * `land` runs. Nothing flies when the target is off screen.
 */
export function flyTo(from, to, label, layer, land = nothing) {
  if (!from || !to || !layer || reducedMotion()) {
    land();
    return;
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!b.width || b.bottom < 0 || b.top > window.innerHeight) {
    land();
    return;
  }

  const bubble = document.createElement('span');
  bubble.className = 'fly-bubble';
  bubble.style.left = `${a.left + a.width / 2}px`;
  bubble.style.top = `${a.top + a.height / 2}px`;
  const inner = document.createElement('span');
  inner.className = 'fly-bubble-inner';
  inner.textContent = label;
  bubble.appendChild(inner);
  layer.appendChild(bubble);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const finish = () => {
    bubble.remove();
    land();
  };
  // X moves evenly while Y first lifts, then falls: together they draw an arc
  bubble.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }],
    { duration: 450, easing: 'linear' });
  inner.animate([
    { transform: 'translate(-50%, -50%) translateY(0) scale(1)', opacity: 1 },
    { transform: `translate(-50%, -50%) translateY(${dy}px) scale(0.6)`, opacity: 0.35 }
  ], { duration: 450, easing: 'cubic-bezier(0.35, -0.6, 0.7, 1)' }).finished.then(finish, finish);
}

/** A new element settles into place */
export function enter(el) {
  if (!el || reducedMotion()) return;
  el.animate([
    { opacity: 0, transform: 'translateY(14px) scale(0.96)' },
    { opacity: 1, transform: 'none' }
  ], { duration: 350, easing: SPRING });
}

const followingSiblings = node => {
  const list = [];
  for (let next = node?.nextElementSibling; next; next = next.nextElementSibling) list.push(next);
  return list;
};

/**
 * Fades an element out and removes it. What came after it, in its list and below
 * the list, slides up into the space with transforms instead of jumping.
 */
export function exit(el) {
  if (!el) return;
  el.dataset.leaving = 'true';
  if (reducedMotion()) {
    el.remove();
    return;
  }
  el.style.pointerEvents = 'none';
  const done = () => {
    const followers = [...followingSiblings(el), ...followingSiblings(el.parentElement)];
    const before = followers.map(node => node.getBoundingClientRect().top);
    el.remove();
    followers.forEach((node, i) => {
      const shift = before[i] - node.getBoundingClientRect().top;
      if (shift) node.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: 300, easing: SPRING });
    });
  };
  el.animate([
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(0.92)' }
  ], { duration: 200, easing: EASE_OUT }).finished.then(done, done);
}

/** Panels that just appeared slide in from the side they come from (+1 forward, -1 back) */
export function slideIn(els, direction) {
  if (!direction || reducedMotion()) return;
  const offset = 48 * direction * (document.documentElement.dir === 'rtl' ? -1 : 1);
  els.forEach(el => el.animate([
    { opacity: 0, transform: `translateX(${offset}px)` },
    { opacity: 1, transform: 'none' }
  ], { duration: 350, easing: SPRING }));
}

/** A small burst of coloured dots from the middle of `el` */
export function celebrate(el, layer) {
  if (!el || !layer || reducedMotion()) return;
  const box = el.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement('span');
    dot.className = 'burst-dot';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.background = DOT_COLOURS[i % DOT_COLOURS.length];
    layer.appendChild(dot);
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
    const distance = 46 + Math.random() * 34;
    const dx = Math.cos(angle) * distance - 4; // the dot is 8px, so -4 centres it
    const dy = Math.sin(angle) * distance - 22;
    const remove = () => dot.remove();
    dot.animate([
      { transform: 'translate(-4px, -4px) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 }
    ], { duration: 700, easing: EASE_OUT }).finished.then(remove, remove);
  }
}
