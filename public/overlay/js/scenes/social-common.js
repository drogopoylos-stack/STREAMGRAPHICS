import { h, fit, plate, leagueLogo, sponsorStrip } from '../ui.js';

export function socialHeader(data, category, title) {
  return h('header', { class: 'so-header' },
    h('div', { class: 'so-mast' }, leagueLogo(data.league, 'so-league-logo'), h('div', { class: 'so-brand' }, fit('so-league-name', data.league.name), h('div', { class: 'so-season' }, data.league.season)), h('span', { class: 'so-category' }, category)),
    h('div', { class: 'so-eyebrow' }, 'THE STAGE IS SET'),
    h('h1', { class: 'so-title' }, title));
}

export function socialBase(data, ctx) {
  if (!ctx.bg) return [];
  return [plate(data.theme, 'social', ctx), h('div', { class: 'so-shade' }), h('div', { class: 'so-grid', 'aria-hidden': 'true' })];
}

export function socialFooter(data, page = '') {
  return h('footer', { class: 'so-footer' }, h('div', { class: 'so-footer-line' }),
    h('div', { class: 'so-footer-row' }, h('span', {}, data.league.short), h('span', { class: 'so-footer-caption' }, page || 'EVERY GAME. EVERY MOMENT.')),
    sponsorStrip(data.sponsors, { max: 3, label: '', cls: 'so-sponsors' }));
}
