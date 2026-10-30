// scene.html — one fixed scene from the query string; re-renders in place on SSE `state` events.
import { readFlags, mountStage, fetchSceneData, subscribe, markReady, sleep } from './core.js';
import { buildScene, errorScene, prepare, reveal } from './render.js';
import { animateIn } from './anim.js';

const flags = readFlags();
const stage = mountStage();
if (flags.static) document.body.classList.add('is-static');

const ctx = { scene: flags.scene, params: flags.params, bg: flags.bg, static: flags.static };
let current = null;
let lastJson = null;
let seq = 0;

async function show(animate) {
  const my = ++seq;
  let el;
  let waits = [];
  let json;
  try {
    if (!flags.scene && !flags.data) throw new Error('No scene in the URL. Use ?scene=roster&team=<id> (see docs/CONTRACT.md).');
    const data = await fetchSceneData(flags.scene, flags.params, flags);
    json = JSON.stringify(data);
    if (current && json === lastJson) return;
    ({ el, waits } = buildScene(data, ctx));
  } catch (e) {
    console.error('[overlay]', e);
    json = `error:${e.message}`;
    if (current && json === lastJson) return;
    el = errorScene(e.message, ctx);
  }
  await prepare(stage, el, waits, ctx, { imageTimeout: flags.static ? 0 : 4000 });
  if (my !== seq) { el.remove(); return; }
  current?.remove();
  current = el;
  lastJson = json;
  reveal(el);
  if (animate && !flags.static) animateIn(el);
}

if (flags.static) {
  // PNG renderer: final frame at once, then signal readiness (with a failsafe so the renderer never hangs).
  const failsafe = sleep(17000);
  await Promise.race([show(false), failsafe]);
  markReady();
} else {
  await show(true);
  let pending = null;
  subscribe({
    onState: () => {
      // Coalesce bursts of state events.
      clearTimeout(pending);
      pending = setTimeout(() => show(false), 120);
    },
  });
}
