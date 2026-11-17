// Video export of a scene (MP4, H.264): the same page as the PNG export, with its animations.
// scene.html?capture=1 holds every animation; each frame moves them to an exact time and takes a
// screenshot, so the video is smooth even on a slow PC. ffmpeg encodes the frames.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import * as store from './db.js';
import { ROOT } from './util.js';
import { dimensionsFor, sceneDefinition } from '../public/shared/scenes.js';
import { sceneData } from './scenes.js';
import { recordRender } from './output-index.js';
import { renderBrowser, safeName } from './render.js';

// The ffmpeg build of the ffmpeg-static project (GPL, with libx264), downloaded on first use to models/.
const FFMPEG_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz';
const FFMPEG_LOCAL = path.join(ROOT, 'models', 'ffmpeg.exe');
let ffmpegPromise = null;
let port = 4610;
export function setVideoPort(p) { port = p; }

const works = exe => { try { return spawnSync(exe, ['-hide_banner', '-version'], { windowsHide: true, timeout: 15000 }).status === 0; } catch { return false; } };

/** ffmpeg: HLL_FFMPEG, then models/ffmpeg.exe, then ffmpeg on the PATH, else download it once. */
export function ffmpegPath(job) {
  ffmpegPromise ??= (async () => {
    for (const exe of [process.env.HLL_FFMPEG, FFMPEG_LOCAL, 'ffmpeg']) if (exe && (exe === 'ffmpeg' || fs.existsSync(exe)) && works(exe)) return exe;
    if (process.platform !== 'win32') throw new Error('Install ffmpeg to export videos.');
    job?.progress(0.02, 'Downloading the video encoder (30 MB, one time)…');
    const response = await fetch(FFMPEG_URL, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok) throw new Error(`Could not download the video encoder (${response.status}). Check the internet connection.`);
    const exe = zlib.gunzipSync(Buffer.from(await response.arrayBuffer()));
    fs.mkdirSync(path.dirname(FFMPEG_LOCAL), { recursive: true });
    fs.writeFileSync(`${FFMPEG_LOCAL}.tmp`, exe);
    fs.renameSync(`${FFMPEG_LOCAL}.tmp`, FFMPEG_LOCAL);
    if (!works(FFMPEG_LOCAL)) { fs.rmSync(FFMPEG_LOCAL, { force: true }); throw new Error('The video encoder does not start on this PC.'); }
    return FFMPEG_LOCAL;
  })().catch(error => { ffmpegPromise = null; throw error; });
  return ffmpegPromise;
}

/** Video length: 'auto' = the entrance animation plus three seconds to read it (4 to 15 s). */
export function videoSeconds(seconds, introMs) {
  if (seconds === 'auto' || seconds == null || seconds === '') return Math.min(15, Math.max(4, Math.ceil(introMs / 1000 + 3)));
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 2 || n > 30) throw Object.assign(new Error('Choose a video length from 2 to 30 seconds.'), { status: 400 });
  return n;
}

/** Render one scene to <outputDir>/<name>.mp4. Returns { file, url, name } like renderScene. */
export async function renderVideo(scene, params = {}, name, { seconds = 'auto', fps = 30 } = {}, job) {
  const definition = sceneDefinition(scene);
  if (!definition) throw Object.assign(new Error('Unknown graphic'), { status: 400 });
  if (definition.group === 'social' && params.format == null) params = { ...params, format: 'story' };
  sceneData(scene, params);
  videoSeconds(seconds, 0);
  const ffmpeg = await ffmpegPath(job);
  const { width, height } = dimensionsFor(scene, params);
  const outDir = store.get().settings.outputDir;
  fs.mkdirSync(outDir, { recursive: true });
  const qs = new URLSearchParams({ scene, capture: '1', ...Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) });
  const b = await renderBrowser();
  const pg = await b.newPage();
  const fileName = `${safeName(name ?? [scene, ...Object.values(params)].join('-'))}.mp4`;
  const file = path.join(outDir, fileName);
  const temp = path.join(outDir, `.${fileName}.part.mp4`);
  try {
    job?.progress(0.05, 'Preparing the graphic…');
    await pg.setViewport({ width, height, deviceScaleFactor: 1 });
    await pg.goto(`http://127.0.0.1:${port}/overlay/scene.html?${qs}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await pg.waitForFunction(() => document.body?.dataset.ready === '1', { timeout: 30000 });
    if (await pg.$('.s-error')) throw new Error('The graphic could not be rendered. Check its scene data.');
    const total = videoSeconds(seconds, await pg.evaluate(() => window.__introMs || 0));
    const frames = Math.round(total * fps);
    const encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', '-r', String(fps), '-f', 'mp4', temp], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let errors = '';
    encoder.stderr.on('data', d => { errors = (errors + d).slice(-2000); });
    const finished = new Promise((resolve, reject) => {
      encoder.on('error', reject);
      encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`The video encoder stopped (${code}). ${errors.trim()}`)));
    });
    finished.catch(() => {});
    for (let i = 0; i < frames; i++) {
      await pg.evaluate(ms => window.__seek(ms), (i * 1000) / fps);
      const frame = await pg.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
      if (!encoder.stdin.write(frame)) await new Promise(resolve => encoder.stdin.once('drain', resolve));
      if (i % 10 === 0) job?.progress(0.1 + 0.85 * (i / frames), `Frame ${i + 1} / ${frames}`);
    }
    encoder.stdin.end();
    await finished;
    fs.renameSync(temp, file);
    recordRender(outDir, fileName, scene, params);
    return { scene, width, height, name: fileName, file, video: true, seconds: total, url: `/output/${encodeURIComponent(fileName)}?v=${Date.now().toString(36)}` };
  } finally {
    fs.rmSync(temp, { force: true });
    await pg.close().catch(() => {});
  }
}
