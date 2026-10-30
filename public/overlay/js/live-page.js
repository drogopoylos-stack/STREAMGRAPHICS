// live.html — one browser source for everything. Follows the Live object over SSE:
// visible → IN, scene/params change → OUT old + IN new, hidden → OUT (fully transparent).
// `state` events re-render the shown scene in place (no re-animation).
import { readFlags, mountStage, fetchSceneData, subscribe, markReady, sleep } from './core.js';
import { buildScene, prepare, reveal } from './render.js';
import { animateIn, animateOut } from './anim.js';

const flags = readFlags();
const stage = mountStage();
if (flags.static) document.body.classList.add('is-static');

let target = null; // latest Live object
let shown = null; // { key, el, json, scene, params }
let busy = false;
let dirty = false;

function effective(live) {
  const params = { ...(live?.params || {}) };
  const bg = flags.bg && String(params.bg ?? '1') !== '0';
  const mode = flags.mode || (params.mode === 'simple' || params.mode === 'full' ? params.mode : null);
  delete params.bg;
  delete params.static;
  return { params, bg, mode };
}

function keyOf(live) {
  if (!live?.visible || !live.scene) return null;
  const { params, bg, mode } = effective(live);
  const p = Object.entries(params).filter(([, v]) => v != null && v !== '').sort(([a], [b]) => a.localeCompare(b));
  return `${live.scene}?${new URLSearchParams(p)}&bg=${bg ? 1 : 0}&mode=${mode || ''}`;
}

/** Fetch + build + prepare (hidden) a scene. Never throws: on error returns an empty layer. */
async function build(live) {
  const { params, bg, mode } = effective(live);
  const ctx = { scene: live.scene, params, bg, static: flags.static };
  try {
    const data = await fetchSceneData(live.scene, params, { ...flags, mode, data: null });
    const { el, waits } = buildScene(data, ctx);
    await prepare(stage, el, waits, ctx, { imageTimeout: flags.static ? 0 : 2500 });
    return { el, json: JSON.stringify(data), live };
  } catch (e) {
    console.error('[overlay live]', e);
    const el = document.createElement('div');
    el.className = 'scene scene-empty';
    stage.append(el);
    return { el, json: `error:${e.message}`, live };
  }
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    for (let guard = 0; guard < 50; guard++) {
      const t = target;
      const key = keyOf(t);
      if (key !== (shown?.key ?? null)) {
        const old = shown;
        const [next] = await Promise.all([
          key ? build(t) : Promise.resolve(null),
          old && !flags.static ? animateOut(old.el) : Promise.resolve(),
        ]);
        old?.el.remove();
        shown = null;
        if (keyOf(target) !== key) { next?.el.remove(); continue; } // superseded while loading
        if (next) {
          reveal(next.el);
          if (!flags.static) animateIn(next.el);
          shown = { key, el: next.el, json: next.json };
        }
        dirty = false;
        continue;
      }
      if (dirty && shown) {
        dirty = false;
        const next = await build(target);
        if (keyOf(target) !== shown.key || next.json === shown.json) { next.el.remove(); continue; }
        shown.el.remove();
        reveal(next.el);
        shown = { ...shown, el: next.el, json: next.json };
        continue;
      }
      dirty = false;
      break;
    }
  } finally {
    busy = false;
  }
}

if (flags.static) {
  const failsafe = sleep(17000);
  const run = (async () => {
    const r = await fetch('/api/live', { cache: 'no-store' });
    target = await r.json();
    await pump();
  })().catch((e) => console.error('[overlay live]', e));
  await Promise.race([run, failsafe]);
  markReady();
} else {
  let pending = null;
  subscribe({
    onLive: (live) => { target = live; pump(); },
    onState: () => {
      clearTimeout(pending);
      pending = setTimeout(() => { dirty = true; pump(); }, 120);
    },
  });
}
