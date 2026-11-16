// Review: change images and icons in the graphics editor (public/overlay/js/editor-images.js,
// layout-editor.js, control designer.js, shared/overlay graphic-design.js, the SUPER CUP social markup).
// Covers: XSS / custom-image URL allowlist, the preview postMessage channel, presets saved with a custom
// header mark (older presets), undo/redo of image changes, upload error surfacing, and classic scenes
// outside edit mode. DOM-free checks plus one disposable HTTP server (never port 4610).
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { imageKind, imageLabel, changeLabel, IMAGE_KINDS } from '../public/overlay/js/editor-images.js';
import { normalizeDesign, BUILTIN_DESIGNS, DESIGN_IMAGES, EMPTY_DESIGN } from '../public/shared/graphic-design.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ICON_URL = '/media/design-icons/icon_a1.png';

// ---------------------------------------------------------------- 1. custom image URLs (XSS allowlist)

test('review: a custom image URL must be a same-origin design-icons PNG', () => {
  const bad = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'https://evil.test/a.png',
    'http://evil.test/a.png',
    '//evil.test/a.png',
    '/media/design-icons/../../db.json',
    '/media/design-icons/a.png?x=1',
    '/media/design-icons/a.png" onerror="alert(1)',
    'file:///etc/passwd',
    5,
    null,
  ];
  for (const url of bad) {
    assert.throws(() => normalizeDesign({ assets: { customImages: { lettermark: url } } }), /Invalid custom image/, String(url));
  }
  const ok = normalizeDesign({ assets: { customImages: { lettermark: ICON_URL } } });
  assert.deepEqual(ok.assets.customImages, { lettermark: ICON_URL });
});

test('review: the design icons route only ever returns a PNG path', () => {
  assert.ok(read('server/backgrounds.js').includes("filename = `${newId('icon')}.png`"));
  assert.ok(read('public/shared/graphic-design.js').includes('CUSTOM_ICON_URL = /^\\/media\\/design-icons\\/[\\w-]+\\.png$/'));
});

// ---------------------------------------------------------------- 2. XSS: nothing upload-shaped reaches HTML

test('review: upload names and config URLs are never interpolated into HTML', () => {
  for (const rel of ['public/overlay/js/editor-images.js', 'public/overlay/js/scenes/social-common.js', 'public/overlay/js/scenes/social-versus.js', 'public/overlay/js/scenes/waiting.js']) {
    const src = read(rel);
    assert.ok(!/\bhtml\s*:/.test(src), `${rel} passes an html prop`);
    assert.ok(!/innerHTML|insertAdjacentHTML/.test(src), `${rel} writes innerHTML`);
  }
  // The only innerHTML write in the overlay applier is the static icon set; images go in as a property.
  const overlay = read('public/overlay/js/graphic-design.js');
  const writes = [...overlay.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(writes, ['set.icons[slot]']);
  assert.match(overlay, /img\.src = url/);
  assert.ok(!/setAttribute\(\s*'src'/.test(overlay));
  // The designer's only html prop is the static icon markup, and it never uses a file name.
  const designer = read('public/control/js/sections/designer.js');
  const htmlProps = [...designer.matchAll(/html:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
  assert.ok(htmlProps.length >= 1);
  for (const value of htmlProps) assert.match(value, /iconSvg\(/);
  assert.ok(!/file\.name|originalname/.test(designer));
});

test('review: the icon markup comes from the static sets only', async () => {
  const { iconSvg, ICON_SETS } = await import('../public/shared/icon-sets.js');
  assert.ok(ICON_SETS.length >= 2);
  const svg = iconSvg('classic', 'Top');
  assert.match(svg, /^<svg /);
  assert.ok(!/<script|onload|javascript:/i.test(svg));
});

// ---------------------------------------------------------------- 3. preview postMessage channel

test('review: the preview channel checks origin and source and pinpoints its targetOrigin', () => {
  const designer = read('public/control/js/sections/designer.js');
  assert.match(designer, /event\.origin !== location\.origin/);
  assert.match(designer, /event\.source !== frame\.contentWindow/);
  assert.match(designer, /postMessage\(\{[^}]*\},\s*location\.origin\)/);
  assert.ok(!/postMessage\([^;]*,\s*['"]\*['"]\s*\)/.test(designer), 'targetOrigin must not be *');
  const page = read('public/overlay/js/scene-page.js');
  assert.match(page, /event\.source !== parent \|\| event\.origin !== location\.origin/);
  assert.match(page, /parent\.postMessage\(\{[^}]*\},\s*location\.origin\)/);
});

test('review: unknown message types and layout actions are ignored, not acted on', () => {
  const designer = read('public/control/js/sections/designer.js');
  for (const type of ['graphic-layout', 'graphic-design-ready', 'graphic-design-rendered', 'graphic-design-error']) {
    assert.ok(designer.includes(`'${type}'`), type);
  }
  assert.ok(!/default:\s*\n\s*throw/.test(designer));
  const page = read('public/overlay/js/scene-page.js');
  assert.match(page, /if \(event\.data\?\.type !== 'graphic-design-preview'\) return;/);
});

// ---------------------------------------------------------------- 4. presets and the custom header mark

test('review: an older preset with no custom header mark keeps its exact shape', () => {
  for (const preset of BUILTIN_DESIGNS) {
    const config = normalizeDesign(preset.config);
    assert.deepEqual(config, preset.config);
    assert.equal('customImages' in config.assets, false);
  }
  // An image slot of a later version is dropped silently: a newer preset still loads.
  const future = normalizeDesign({ assets: { customImages: { future: ICON_URL } } });
  assert.equal('customImages' in future.assets, false);
  assert.throws(() => normalizeDesign({ assets: { customImages: [] } }), /Custom images must be an object/);
});

test('review: a design saved with a custom header mark survives a save/load round trip', () => {
  const saved = normalizeDesign({ assets: { customImages: { lettermark: ICON_URL, hllLogo: ICON_URL } } });
  const reloaded = normalizeDesign(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reloaded, saved);
  assert.deepEqual(reloaded.assets.customImages, { lettermark: ICON_URL, hllLogo: ICON_URL });
  // Loading an older preset replaces the whole config: the previous mark cannot leak in.
  const replaced = normalizeDesign(BUILTIN_DESIGNS.find((p) => p.id === 'original').config);
  assert.equal('customImages' in replaced.assets, false);
  assert.deepEqual(DESIGN_IMAGES.map((d) => d.id), ['lettermark', 'hllLogo']);
});

test('review: the applier swaps only img[data-image-slot] and only when the design has that image', () => {
  const overlay = read('public/overlay/js/graphic-design.js');
  const swap = overlay.slice(overlay.indexOf('img[data-image-slot]') - 160, overlay.indexOf('img[data-image-slot]') + 220);
  assert.match(swap, /config\.assets\.customImages\?\.\[img\.dataset\.imageSlot\]/);
  assert.match(swap, /if \(url\) img\.src = url;/);
  assert.match(overlay, /if \(!config\) return root;/);
  assert.equal('customImages' in EMPTY_DESIGN.assets, false);
});

// ---------------------------------------------------------------- 5. undo/redo of image changes

test('review: design-image changes are one history step; record uploads are not part of the draft', () => {
  const designer = read('public/control/js/sections/designer.js');
  // A design image (header mark, HLL logo) mutates the draft and records history -> undoable.
  assert.ok(designer.includes('[slot]: url }; changed('), 'design image upload must call changed()');
  // The event logo is tournament data (settings.socialLogo): saved right away and NOT undoable.
  const eventLogo = designer.slice(designer.indexOf('async function uploadEventLogo'), designer.indexOf('function eventLogoDialog'));
  assert.ok(!/changed\(/.test(eventLogo), 'event logo must not enter the design history');
  assert.match(eventLogo, /api\.brandUpload\('league-logo', file\)/);
  // Record images refresh the preview through the server, without touching the draft.
  assert.match(designer, /await store\.load\(\); queuePreview\(\)/);
  // Loading a preset clears history and resets the checkpoint.
  assert.match(designer, /history = \{ past: \[\], future: \[\] \}; checkpoint = structuredClone\(config\)/);
  // One undo entry carries a full cloned config, so a restored mark set is exact.
  assert.match(designer, /config = structuredClone\(entry\.config\); checkpoint = structuredClone\(config\)/);
});

// ---------------------------------------------------------------- 6. upload errors

test('review: imageKind/change labels cover every kind the designer can open', () => {
  for (const kind of IMAGE_KINDS) assert.ok(changeLabel(kind), kind);
  assert.equal(changeLabel('icon'), 'Change icon…');
  assert.equal(changeLabel('mark'), 'Change image…');
  assert.equal(imageLabel('mark', 'hllLogo'), 'HLL logo');
  assert.equal(imageKind({ dataset: {}, classList: { contains: () => false } }), null);
});

// ---------------------------------------------------------------- 7. classic scenes outside edit mode

test('review: no stylesheet targets the editor-only image attributes', () => {
  const files = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.css')) files.push(full); } };
  walk(path.join(ROOT, 'public'));
  const offenders = files.filter((file) => /\[data-image/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.relative(ROOT, f)), []);
});

test('review: the new attributes are inert on their own', () => {
  // The added markup only ever sets data-image / data-image-slot / data-ref next to existing nodes.
  const common = read('public/overlay/js/scenes/social-common.js');
  assert.match(common, /'data-image': 'event'/);
  assert.match(common, /'data-image': 'mark', 'data-image-slot': 'lettermark'/);
  assert.match(common, /'data-image': 'sponsor'/);
  // imageKind still resolves the older stream classes when no attribute is present.
  const older = (classes) => ({ dataset: {}, classList: { contains: (c) => classes.includes(c) } });
  assert.equal(imageKind(older(['tlogo'])), 'team');
  assert.equal(imageKind(older(['pphoto'])), 'player');
  assert.equal(imageKind({ dataset: { image: 'future' }, classList: { contains: () => false } }), null);
});

// ---------------------------------------------------------------- disposable HTTP server for uploads

let child, base, folder, logs = '';

before(async () => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-editor-images-review-'));
  fs.writeFileSync(path.join(folder, 'db.json'), JSON.stringify({
    settings: { leagueName: 'Review League', leagueShort: 'REV', timezone: 'Europe/Athens' },
    teams: [], players: [], sponsors: [], matches: [],
    live: { visible: false, scene: 'schedule', params: {}, rev: 1 },
  }));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), HLL_DATA_DIR: folder, HLL_OUTPUT_DIR: path.join(folder, 'output'), HLL_TEST: '1' },
  });
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${base}/api/state`)).ok) return; } catch { /* starting */ }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server did not start:\n${logs}`);
});

after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

const upload = async (url, body, filename, type = 'application/octet-stream', extra = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  form.append('file', new Blob([body], { type }), filename);
  const response = await fetch(base + url, { method: 'POST', body: form });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, type: response.headers.get('content-type'), data };
};

test('review: a non-image icon upload is refused with a friendly 400 JSON error', async () => {
  const r = await upload('/api/design/icons', 'not an image', 'notes.txt', 'text/plain');
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.type || '', /application\/json/);
  assert.match(String(r.data.error), /valid PNG, SVG, WebP or JPEG/i);
});

test('review: an SVG icon upload is stored as a PNG, so it can never run as a page', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><script>alert(1)</script><rect width="40" height="40" fill="#abc"/></svg>';
  const r = await upload('/api/design/icons', svg, 'icon.svg', 'image/svg+xml');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.url, /^\/media\/design-icons\/[\w-]+\.png$/);
  const served = await fetch(base + r.data.url);
  assert.equal(served.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await served.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('hex'), '89504e47');
  assert.ok(!bytes.includes('alert(1)'));
});

// --- defects ---------------------------------------------------------------------------------------

test('review: an oversized upload answers with a JSON error, not a 500 HTML page', async () => {
  const r = await upload('/api/design/icons', new Uint8Array(41 * 1024 * 1024), 'huge.png', 'image/png');
  assert.equal(r.status, 413, `status ${r.status}`);
  assert.match(r.type || '', /application\/json/);
  assert.ok(!/MulterError|File too large/.test(String(r.data)), 'the stack trace must not be returned');
});

test('review: the brand upload (event logo) must not store a client-chosen extension', async () => {
  const r = await upload('/api/brand/upload', '<!doctype html><script>document.title=1</script>', 'evil.html', 'text/html', { slot: 'league-logo' });
  // A file that is not an image is refused; it is never stored under its own extension.
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.error, /not an image/);
});
