// Scene registry + mount pipeline shared by scene.html and live.html.
import { themeVars, loadFonts, fitAll, imagesReady, sleep } from './core.js';
import { h } from './ui.js';
import roster from './scenes/roster.js';
import versus from './scenes/versus.js';
import simpleVs from './scenes/simple-vs.js';
import schedule from './scenes/schedule.js';
import matchup from './scenes/matchup.js';
import bracket from './scenes/bracket.js';
import sponsors from './scenes/sponsors.js';
import socialSchedule from './scenes/social-schedule.js';
import socialVersus from './scenes/social-versus.js';
import { dimensionsFor } from '../../shared/scenes.js';

export const SCENES = { roster, versus, 'simple-vs': simpleVs, schedule, matchup, bracket, sponsors, 'social-schedule': socialSchedule, 'social-versus': socialVersus };

function decorate(el, name, data, ctx) {
  el.classList.add('scene', `s-${name}`, `mode-${ctx.mode}`);
  if (!ctx.bg) el.classList.add('bg-off');
  if (ctx.static) el.classList.add('is-static');
  el.dataset.preset = data?.theme?.preset || 'sparta';
  for (const [k, v] of Object.entries(themeVars(data?.theme))) el.style.setProperty(k, v);
  return el;
}

/** Build the DOM for one scene. ctx = { scene, params, bg, static }. */
export function buildScene(data, ctx) {
  const name = data?.scene || ctx.scene;
  const mod = SCENES[name];
  if (!mod) throw new Error(`unknown scene "${name}"`);
  const c = { ...ctx, scene: name, mode: data.mode === 'simple' ? 'simple' : 'full', waits: [] };
  const el = decorate(mod.render(data, c), name, data, c);
  const size = dimensionsFor(name);
  el.style.width = `${size.width}px`;
  el.style.height = `${size.height}px`;
  if (ctx.viewport && (ctx.viewport.width !== size.width || ctx.viewport.height !== size.height)) {
    const scale = Math.min(ctx.viewport.width / size.width, ctx.viewport.height / size.height);
    const wrapper = h('div', { class: 'scene scene-letterbox' });
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate(${(ctx.viewport.width - size.width * scale) / 2}px, ${(ctx.viewport.height - size.height * scale) / 2}px) scale(${scale})`;
    wrapper.append(el);
    return { el: wrapper, waits: c.waits };
  }
  return { el, waits: c.waits };
}

/** A small operator-facing card (scene.html only) when data cannot be loaded. */
export function errorScene(message, ctx) {
  const el = h('div', {},
    h('div', { class: 'err-card', in: 'up' },
      h('div', { class: 'err-k' }, 'HLL graphics'),
      h('div', { class: 'err-t' }, 'Scene unavailable'),
      h('div', { class: 'err-m' }, message)));
  return decorate(el, 'error', null, { ...ctx, mode: 'full' });
}

/**
 * Insert a scene hidden, load fonts, auto-fit text, wait for images, then return it ready to show.
 * opts.imageTimeout caps the image wait (live use); static mode waits for everything (+ scene waits).
 */
export async function prepare(stage, el, waits, ctx, opts = {}) {
  el.style.visibility = 'hidden';
  stage.append(el);
  await loadFonts();
  fitAll(el);
  const imgs = imagesReady(el);
  await (opts.imageTimeout ? Promise.race([imgs, sleep(opts.imageTimeout)]) : imgs);
  // Fallback content (monograms) may have replaced failed images: fit again after the swap.
  fitAll(el);
  if (ctx.static && waits.length) await Promise.race([Promise.all(waits), sleep(8000)]);
  return el;
}

export function reveal(el) {
  el.style.visibility = '';
}
