// REST client. Every error becomes an ApiError carrying the server's { error } message.
import { t } from './strings.js';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(t('common.networkError'));
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && data.error) || (typeof data === 'string' && data.length < 200 && data) || `${res.status} ${res.statusText}`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),

  /** Multipart image upload for a team / player / sponsor. Returns the updated entity. */
  upload(kind, id, file) {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('id', id);
    fd.append('file', file, file.name);
    return request('POST', '/api/assets/upload', fd);
  },

  /** League logo or custom background. slot = 'bg' | 'league-logo'. Returns Settings. */
  brandUpload(slot, file) {
    const fd = new FormData();
    fd.append('slot', slot);
    fd.append('file', file, file.name);
    return request('POST', '/api/brand/upload', fd);
  },
};
