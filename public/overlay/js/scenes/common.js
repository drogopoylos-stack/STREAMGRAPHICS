// Helpers shared by several scenes.
import { h, leagueLogo, sponsorStrip, boText } from '../ui.js';
import { dayLabel } from '../core.js';

export const LANES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];

/**
 * Starting five = first player of each lane role (captain preferred); missing lanes are filled by
 * role-less players. Everyone else (second players of a lane, role-less, coaches) is the bench,
 * players first and coaches last.
 */
export function splitRoster(players = []) {
  const used = new Set();
  const starters = [];
  for (const role of LANES) {
    const cands = players.filter((p) => p.role === role && !used.has(p.id));
    const pick = cands.find((p) => p.captain) || cands[0];
    if (pick) { starters.push(pick); used.add(pick.id); }
  }
  for (const p of players) {
    if (starters.length >= 5) break;
    if (!used.has(p.id) && !p.role) { starters.push(p); used.add(p.id); }
  }
  const bench = players.filter((p) => !used.has(p.id))
    .sort((a, b) => (a.role === 'Coach') - (b.role === 'Coach'));
  return { starters, bench };
}

/** League kicker text: "Hellenic Legends League · Season 1". */
export function leagueLine(league) {
  return [league?.name || 'Hellenic Legends League', league?.season].filter(Boolean).join('  ·  ');
}

/** Standard header used by schedule / bracket / sponsors: league logo, kicker, title, subtitle, right slot. */
export function sceneHeader({ league, kicker, title, sub, subLang, right }) {
  return h('header', { class: 'hdr' },
    leagueLogo(league, 'hdr-logo', { in: 'scale', d: 150 }),
    h('div', { class: 'hdr-text' },
      h('div', { class: 'kicker hdr-kicker', in: 'left', d: 260 }, kicker ?? leagueLine(league)),
      h('div', { class: 'fit display hdr-title', in: 'left', d: 330 }, title),
      sub ? h('div', { class: 'fit hdr-sub', lang: subLang || null, in: 'left', d: 420 }, sub) : null),
    right ? h('div', { class: 'hdr-right', in: 'fade', d: 500 }, right) : null);
}

export function sponsorsFor(data, opts) {
  return sponsorStrip(data.sponsors, opts);
}

/** "BO5", "Σάββατο 12 Σεπτεμβρίου", "18:00" — the non-empty bits of a match's when-line. */
export function whenBits(m, dateOpts) {
  return [boText(m?.bestOf), dayLabel(m?.date, dateOpts), m?.time || ''].filter(Boolean);
}

/** Inline list with gold diamond separators. */
export function dotted(bits, cls = '') {
  const out = [];
  bits.forEach((b, i) => {
    if (i) out.push(h('i', { class: 'sep' }));
    out.push(typeof b === 'string' ? h('span', {}, b) : b);
  });
  return h('div', { class: `dotted ${cls}`, lang: 'el' }, out);
}
