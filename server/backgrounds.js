import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ASSETS, newId } from './util.js';

export async function saveBackground(buffer, name, tournamentId) {
  const id = newId('bg');
  let output;
  try {
    output = await sharp(buffer, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(3840, 3840, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  } catch { throw Object.assign(new Error('Choose a valid PNG, JPEG, WebP or other supported image, up to 40 megapixels'), { status: 400 }); }
  const dir = path.join(ASSETS, 'backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${tournamentId}-${id}.png`;
  fs.writeFileSync(path.join(dir, filename), output.data);
  return { id, name: String(name || 'Background').slice(0, 120), url: `/media/backgrounds/${filename}`, width: output.info.width, height: output.info.height };
}

/** A custom icon of the Graphics designer: always a fitted PNG, so an uploaded SVG never runs as a page. */
export async function saveDesignIcon(buffer) {
  let output;
  try {
    output = await sharp(buffer, { limitInputPixels: 40_000_000, animated: false, density: 300 }).rotate().resize(256, 256, { fit: 'inside' }).png().toBuffer();
  } catch { throw Object.assign(new Error('Choose a valid PNG, SVG, WebP or JPEG image'), { status: 400 }); }
  const dir = path.join(ASSETS, 'design-icons');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${newId('icon')}.png`;
  fs.writeFileSync(path.join(dir, filename), output);
  return { url: `/media/design-icons/${filename}` };
}
