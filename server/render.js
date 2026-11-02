// PNG export of a scene: our own headless Edge/Chrome (puppeteer-core), 1920×1080, transparent background.
// The browser is started on first use and closed by its handle on exit — never by process name.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import * as store from './db.js';
import { dimensionsFor } from '../public/shared/scenes.js';
import { sceneData } from './scenes.js';

const CANDIDATES = [
  process.env.HLL_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

let browserPromise = null;
let port = 4610;
export function setPort(p) { port = p; }

function browser() {
  browserPromise ??= (async () => {
    const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
    if (!executablePath) throw new Error('No Chrome or Edge found. Set HLL_BROWSER to the browser .exe path.');
    const b = await puppeteer.launch({
      executablePath, headless: true,
      args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    });
    b.on('disconnected', () => { browserPromise = null; });
    return b;
  })().catch((e) => { browserPromise = null; throw e; });
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  try { await (await browserPromise).close(); } catch { /* already gone */ }
  browserPromise = null;
}

function safeName(s) {
  return String(s).replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'graphic';
}

/** Render one scene to <outputDir>/<name>.png. Returns { file, url, name }. */
export async function renderScene(scene, params = {}, name) {
  sceneData(scene, params);
  const { width, height } = dimensionsFor(scene);
  const outDir = store.get().settings.outputDir;
  fs.mkdirSync(outDir, { recursive: true });
  const qs = new URLSearchParams({ scene, static: '1', ...Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) });
  const url = `http://127.0.0.1:${port}/overlay/scene.html?${qs}`;
  const b = await browser();
  const pg = await b.newPage();
  try {
    await pg.setViewport({ width, height, deviceScaleFactor: 1 });
    await pg.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await pg.waitForFunction(() => document.body?.dataset.ready === '1', { timeout: 20000 });
    if (await pg.$('.s-error')) throw new Error('The graphic could not be rendered. Check its scene data.');
    const fileName = `${safeName(name ?? [scene, ...Object.values(params)].join('-'))}.png`;
    const file = path.join(outDir, fileName);
    await pg.screenshot({ path: file, omitBackground: true, type: 'png' });
    return { scene, width, height, name: fileName, file, url: `/output/${encodeURIComponent(fileName)}?v=${Date.now().toString(36)}` };
  } finally {
    await pg.close().catch(() => {});
  }
}

/** The standard set: schedules, next match, every roster, every feature. */
export async function renderAll(job, nextMatchId) {
  const db = store.get();
  const list = [
    ['schedule', { day: 'today' }, 'schedule-today'],
    ['schedule', { day: 'tomorrow' }, 'schedule-tomorrow'],
  ];
  if (nextMatchId) {
    list.push(['versus', { match: nextMatchId }, 'versus-next'], ['simple-vs', { match: nextMatchId }, 'simple-vs-next']);
  }
  for (const t of db.teams.filter((x) => !x.hidden)) list.push(['roster', { team: t.id }, `roster-${t.tag || t.id}`]);
  for (const f of db.features) list.push(['matchup', { feature: f.id }, `matchup-${f.id}`]);
  if (db.sponsors.some((s) => s.logo)) list.push(['sponsors', {}, 'sponsors']);
  const out = [];
  let i = 0;
  for (const [scene, params, name] of list) {
    job?.progress(i++ / list.length, `Render ${name}`);
    try { out.push(await renderScene(scene, params, name)); } catch (e) { job?.log(`${name}: ${e.message}`); }
  }
  return out;
}
