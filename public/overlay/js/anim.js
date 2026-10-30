// Entrance / exit choreography with the Web Animations API (no libraries).
// Elements opt in with data-in="<type>" data-d="<delay ms>" [data-dur="<ms>"].
// Keyframes only animate opacity / transform / filter / clip-path so they stay on the compositor.
// Rule: never put data-in on an element that has its own CSS transform (wrap it instead).

const EASE_OUT = 'cubic-bezier(.16,.84,.24,1)';
const EASE_BACK = 'cubic-bezier(.2,1.25,.35,1)';

const KF = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  plate: [{ opacity: 0, transform: 'scale(1.07)' }, { opacity: 1, transform: 'scale(1)' }],
  up: [{ opacity: 0, transform: 'translate3d(0,46px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
  down: [{ opacity: 0, transform: 'translate3d(0,-40px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
  left: [{ opacity: 0, transform: 'translate3d(-90px,0,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
  right: [{ opacity: 0, transform: 'translate3d(90px,0,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
  rise: [
    { opacity: 0, transform: 'translate3d(0,80px,0)', filter: 'brightness(.15)' },
    { opacity: 1, transform: 'translate3d(0,0,0)', filter: 'brightness(1)' },
  ],
  scale: [
    { opacity: 0, transform: 'scale(.55)', filter: 'brightness(2.8)' },
    { opacity: 1, transform: 'scale(1.06)', filter: 'brightness(1.7)', offset: 0.55 },
    { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
  ],
  pop: [
    { opacity: 0, transform: 'scale(1.9)', filter: 'brightness(2.5) blur(6px)' },
    { opacity: 1, transform: 'scale(.96)', filter: 'brightness(1.4) blur(0px)', offset: 0.6 },
    { opacity: 1, transform: 'scale(1)', filter: 'brightness(1) blur(0px)' },
  ],
  wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
  wipel: [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)' }],
  wipec: [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
  wipev: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }],
  growx: [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
  flash: [
    { opacity: 0 },
    { opacity: 1, offset: 0.25 },
    { opacity: 0 },
  ],
};

const EASING = { scale: EASE_BACK, pop: EASE_OUT };
const DUR = { plate: 900, fade: 500, scale: 650, pop: 700, wipe: 650, wipel: 650, wipec: 650, wipev: 600, growx: 700, rise: 750, flash: 700 };

/** Play every [data-in] animation under root. Resolves when all have finished. */
export function animateIn(root) {
  const anims = [];
  for (const el of root.querySelectorAll('[data-in]')) {
    const type = el.dataset.in;
    const kf = KF[type] || KF.fade;
    const a = el.animate(kf, {
      duration: Number(el.dataset.dur) || DUR[type] || 600,
      delay: Number(el.dataset.d) || 0,
      easing: EASING[type] || EASE_OUT,
      fill: type === 'flash' ? 'both' : 'backwards',
    });
    anims.push(a.finished.catch(() => null));
  }
  return Promise.all(anims);
}

const OUT = {
  left: 'translate3d(-50px,0,0)', right: 'translate3d(50px,0,0)', up: 'translate3d(0,30px,0)', rise: 'translate3d(0,40px,0)',
  down: 'translate3d(0,-30px,0)', scale: 'scale(.85)', pop: 'scale(.85)', plate: 'scale(1.03)',
};

/** Quick exit (~0.5 s): top-level groups slip away with a short stagger while the whole scene fades. */
export function animateOut(root) {
  if (!root?.isConnected) return Promise.resolve();
  root.getAnimations({ subtree: true }).forEach((a) => a.finish?.());
  const groups = [...root.querySelectorAll('[data-in]')].filter((el) => !el.parentElement.closest('[data-in]') || el.parentElement.closest('[data-in]') === root);
  groups.forEach((el, i) => {
    const to = OUT[el.dataset.in];
    if (!to) return;
    el.animate([{ transform: 'none' }, { transform: to }], {
      duration: 380, delay: Math.min(i * 22, 120), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards',
    });
  });
  const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'cubic-bezier(.45,0,.8,.5)', fill: 'forwards' });
  return a.finished.catch(() => null);
}
