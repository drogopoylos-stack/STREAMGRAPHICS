// Scene registry + mount pipeline shared by scene.html and live.html.
import { themeVars, loadFonts, fitAll, imagesReady, sleep } from './core.js';
import { h } from './ui.js';
import roster from './scenes/roster.js';
import versus from './scenes/versus.js';
import simpleVs from './scenes/simple-vs.js';
import schedule from './scenes/schedule.js';
import matchup from './scenes/matchup.js';
import bracket from './scenes/bracket.js';
import waiting from './scenes/waiting.js';
import format from './scenes/format.js';
import sponsors from './scenes/sponsors.js';
import socialSchedule from './scenes/social-schedule.js';
import socialVersus from './scenes/social-versus.js';
import socialRoster from './scenes/social-lineups.js';
import socialResult from './scenes/social-result.js';
import socialAnnounce from './scenes/social-announce.js';
import socialBracket from './scenes/social-bracket.js';
import socialLive from './scenes/social-live.js';
import standings from './scenes/standings.js';
import { dimensionsFor } from '../../shared/scenes.js';
import { applyGraphicDesign } from './graphic-design.js';
import { applyLayouts } from './graphic-layout.js';
import { resolveBackground } from '../../shared/graphic-design.js';

export const SCENES = { roster, versus, 'simple-vs': simpleVs, schedule, matchup, bracket, format, waiting, sponsors, 'social-schedule': socialSchedule, 'social-versus': socialVersus, 'social-roster': socialRoster, 'social-result': socialResult, 'social-announce': socialAnnounce, 'social-bracket': socialBracket, 'social-live': socialLive, standings };

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
  const bg = resolveBackground(data.graphicDesign, name);
  c.bg = ctx.bg ?? bg.show;
  c.bgMotion = c.bg ? (ctx.motion ?? bg.motion) : 'none';
  c.bgSpeed = bg.speed; c.bgIntensity = bg.intensity; c.bgForce = !!ctx.motion;
  const theme = { ...data.theme };
  for (const key of ['accent', 'accent2']) if (data.graphicDesign?.assets?.[key]) theme[key] = data.graphicDesign.assets[key];
  const styledData = { ...data, theme };
  const el = applyGraphicDesign(decorate(mod.render(styledData, c), name, styledData, c), styledData);
  const size = dimensionsFor(name, c.params);
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
  applyLayouts(el);
  // Fallback content (monograms) may have replaced failed images: fit again after the swap.
  fitAll(el);
  if (ctx.static && waits.length) await Promise.race([Promise.all(waits), sleep(8000)]);
  return el;
}

export function reveal(el) {
  el.style.visibility = '';
}
