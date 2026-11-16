// Social · Announcement (texts only). SUPER CUP style (spec 5.5): every text is a design slot with the
// reference post as default; URL params kicker / headline / date (YYYY-MM-DD) / time / info preset them.
// Classic style keeps a simple fallback.
import { h, fit } from '../ui.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxRoot, sxHeader, sxMain, sxFooter, sxDate } from './social-common.js';

const DEFAULTS = { kicker: 'OPEN', headline: 'QUALIFIER', date: '2026-10-31', time: '11:00', info: 'TWO TEAMS QUALIFY FOR THE MAIN BRACKET' };

function supercup(data, ctx) {
  const p = ctx.params || {};
  const text = (key) => String(p[key] || DEFAULTS[key]).toUpperCase();
  const d = sxDate(p.date) || sxDate(DEFAULTS.date);
  return sxRoot(data, ctx, 'sx-announce', {},
    sxHeader(data, { size: 'compact' }),
    sxMain(ctx, h('div', { class: 'sx-ann' },
      h('div', { class: 'sx-ann-kick' }, h('span', { class: 'sx-ann-kick-t' }, text('kicker'))),
      h('div', { class: 'sx-display fit' }, text('headline')),
      h('i', { class: 'sx-ann-rule' }),
      h('div', { class: 'sx-ann-date' }, h('span', { class: 'sx-ann-day' }, String(d.day)), h('span', { class: 'sx-ann-month' }, d.month)),
      h('div', { class: 'sx-ann-tline' }, h('span', { class: 'sx-ann-dow' }, d.dowLong), h('span', { class: 'sx-ann-time' }, text('time'))),
      h('div', { class: 'sx-ann-info fit' }, text('info')))),
    sxFooter(data));
}

export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercup(data, ctx);
    return h('div', { class: 'social social-announce' },
      ...socialBase(data, ctx), socialHeader(data, 'ANNOUNCEMENT', data.social?.title || 'SUPER CUP'),
      h('div', { class: 'so-announce' },
        fit('so-announce-title', data.title || data.league?.name || ''),
        fit('so-announce-kicker', data.kicker || '')),
      socialFooter(data));
  },
};
