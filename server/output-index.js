// The graphic type of each PNG in an output folder. New renders are recorded in a small index file;
// older files get their type from the name that the program gave them.
import fs from 'node:fs';
import path from 'node:path';
export { guessScene } from '../public/shared/output-types.js';

const INDEX = '.render-index.json';
export function readIndex(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, INDEX), 'utf8')); } catch { return {}; }
}

export function recordRender(dir, name, scene, params = {}) {
  const index = readIndex(dir);
  index[name] = { scene, params, at: Date.now() };
  // Forget files that are no longer in the folder, so the index stays small.
  for (const key of Object.keys(index)) if (!fs.existsSync(path.join(dir, key))) delete index[key];
  try { fs.writeFileSync(path.join(dir, INDEX), JSON.stringify(index)); } catch { /* the PNG is still valid */ }
}
