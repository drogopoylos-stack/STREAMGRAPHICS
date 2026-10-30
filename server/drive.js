// Google Drive folder import.
// 1) With an API key: Drive API v3 (folder must be shared "Anyone with the link").
// 2) Without a key: the public "embeddedfolderview" page (same share setting).
// A private folder cannot be read by either way → use Google Drive for desktop + a local folder import.
import * as cheerio from 'cheerio';
import { IMAGE_EXT } from './util.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const MAX_DEPTH = 4;

const PRIVATE_MSG =
  'This Google Drive folder is private. In Google Drive: right-click the folder → Share → General access → "Anyone with the link" (Viewer). ' +
  'Or install Google Drive for desktop and import the local folder path instead.';

/** Folder id from a Drive URL or a bare id. */
export function folderId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{10,})$/);
  if (!m) throw Object.assign(new Error('Not a Google Drive folder link'), { status: 400 });
  return m[1];
}

async function listWithKey(id, key) {
  const files = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(key)}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) {
      if (r.status === 404 || r.status === 403) throw new Error(`${PRIVATE_MSG} (Google: ${j.error?.message ?? r.status})`);
      throw new Error(`Drive API: ${j.error?.message ?? r.status}`);
    }
    for (const f of j.files ?? []) files.push({ id: f.id, name: f.name, folder: f.mimeType === 'application/vnd.google-apps.folder' });
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return files;
}

async function listEmbedded(id) {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  const html = await r.text();
  const $ = cheerio.load(html);
  const entries = $('.flip-entry');
  if (!entries.length) {
    if (/accounts\.google\.com|Sign in|document-root/.test(html) || r.url.includes('accounts.google.com')) throw new Error(PRIVATE_MSG);
    return []; // empty public folder
  }
  return entries.map((_, el) => {
    const $el = $(el);
    const fid = ($el.attr('id') ?? '').replace(/^entry-/, '');
    const href = $el.find('a').attr('href') ?? '';
    return { id: fid, name: $el.find('.flip-entry-title').text().trim(), folder: href.includes('/folders/') };
  }).get();
}

async function download(id, key) {
  const urls = key
    ? [`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${encodeURIComponent(key)}`]
    : [`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, `https://drive.google.com/uc?export=download&id=${id}`];
  let last = '';
  for (const url of urls) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const type = r.headers.get('content-type') ?? '';
    if (r.ok && !type.includes('text/html')) return Buffer.from(await r.arrayBuffer());
    last = `HTTP ${r.status} ${type}`;
  }
  throw new Error(`download failed (${last}). ${PRIVATE_MSG}`);
}

/**
 * Recursive list of the image files in a Drive folder.
 * Each item: { name, folders: [folder names from the root], read: () => Buffer }.
 */
export async function listDriveFolder(input, apiKey = '', log = () => {}) {
  const root = folderId(input);
  const out = [];
  const walk = async (id, folders, depth) => {
    const entries = apiKey ? await listWithKey(id, apiKey) : await listEmbedded(id);
    log(`Folder ${folders.join(' / ') || '(root)'}: ${entries.length} entries`);
    for (const e of entries) {
      if (e.folder) {
        if (depth < MAX_DEPTH) await walk(e.id, [...folders, e.name], depth + 1);
      } else if (IMAGE_EXT.test(e.name)) {
        out.push({ name: e.name, folders, driveId: e.id, read: () => download(e.id, apiKey) });
      }
    }
  };
  await walk(root, [], 0);
  return out;
}
