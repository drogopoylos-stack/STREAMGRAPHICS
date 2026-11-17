// scene.html — one fixed scene from the query string; re-renders in place on SSE `state` events.
import { readFlags, mountStage, fetchSceneData, subscribe, markReady, sleep } from './core.js';
import { buildScene, errorScene, prepare, reveal } from './render.js';
import { animateIn } from './anim.js';
import { dimensionsFor } from '../../shared/scenes.js';

const flags = readFlags();
const stage = mountStage(dimensionsFor(flags.scene, flags.params));
if (flags.static) document.body.classList.add('is-static');

const ctx = { scene: flags.scene, params: flags.params, bg: flags.bg, motion: flags.motion, static: flags.static };
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

if (flags.designer && parent !== window) {
  let previewSeq = 0;
  const { createLayoutEditor } = await import('./layout-editor.js');
  const editor = createLayoutEditor((action, body) => parent.postMessage({ type: 'graphic-layout', action, ...body }, location.origin));
  let pendingPreview = null;
  document.addEventListener('graphic-text-ended', event => {
    if (!pendingPreview) return;
    const message = pendingPreview; pendingPreview = null;
    if (event.detail) {
      message.data.graphicDesign.screens[flags.scene] ||= {};
      message.data.graphicDesign.screens[flags.scene][event.detail.slot] = event.detail.field;
    }
    dispatchEvent(new MessageEvent('message', { source: parent, origin: location.origin, data: message }));
  });
  addEventListener('message', async event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === 'graphic-layout') { editor.handle(event.data); return; }
    if (event.data?.type !== 'graphic-design-preview') return;
    if (editor.editing) { pendingPreview = event.data; return; }
    const my = ++previewSeq;
    let next;
    try {
      const data = event.data.data;
      if (data?.scene !== flags.scene) return;
      const previewCtx = { ...ctx, static: !event.data.motion };
      document.body.classList.toggle('is-static', previewCtx.static);
      const built = buildScene(data, previewCtx); next = built.el;
      await prepare(stage, next, built.waits, previewCtx, { imageTimeout: 2500 });
      if (editor.editing) { pendingPreview = event.data; next.remove(); return; }
      if (my !== previewSeq) { next.remove(); return; }
      current?.remove(); current = next; reveal(next);
      for (const node of next.querySelectorAll('[data-design-slot]')) if (node.dataset.designSlot === event.data.focus) node.classList.add('design-preview-focus');
      editor.attach(next, data);
      markReady();
      parent.postMessage({ type: 'graphic-design-rendered' }, location.origin);
    } catch (error) { next?.remove(); parent.postMessage({ type: 'graphic-design-error', message: error.message }, location.origin); }
  });
  parent.postMessage({ type: 'graphic-design-ready' }, location.origin);
} else if (flags.capture) {
  // Video export (server/video.js): build the scene with its entrance animation, then hold every
  // animation at its first frame. The exporter moves them with __seek(ms) and takes one frame each step.
  await show(true);
  const anims = document.getAnimations();
  for (const a of anims) a.pause();
  const start = anims.map(a => Number(a.currentTime) || 0);
  window.__introMs = Math.max(0, ...anims.map(a => a.effect?.getComputedTiming().endTime).filter(Number.isFinite));
  window.__seek = ms => anims.forEach((a, i) => { a.currentTime = start[i] + ms; });
  markReady();
} else if (flags.static) {
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
  if (flags.scene === 'waiting') setInterval(() => show(false), 60000);
}
