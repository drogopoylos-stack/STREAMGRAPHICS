// Player matchup: two big cut-outs on the crimson / gold sides, nick + team + top champions,
// and a centre panel of stat rows with two-sided bars (share of a+b, better side highlighted).
import { h, fit, plate, playerPhoto, teamLogo, crest, roleIcon, flagBadge, laurel, initials } from '../ui.js';
import { leagueLine } from './common.js';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function pctText(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

/** Server text, with thousands grouped for big integers ("24132" → "24,132"). */
function statText(text, value, fmt) {
  if (value == null) return '—';
  if (fmt === 'int' && Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US');
  return text ?? String(value);
}

function champ(c, d) {
  const box = h('div', { class: 'champ', in: 'scale', d, dur: 600 });
  const fallback = () => h('div', { class: 'champ-mono' }, initials(c.name, 2));
  if (c.icon) {
    const img = h('img', { src: c.icon, alt: c.name || '', draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
    box.append(img);
  } else {
    box.append(fallback());
  }
  box.append(h('span', { class: 'champ-g' }, `${c.games}G`));
  return box;
}

function playerSide(p, champs, key, simple) {
  const dir = key === 'a' ? 'left' : 'right';
  const team = p?.team;
  return [
    simple
      ? h('div', { class: `mu-art mu-art-${key}` }, crest(team, 'mu-crest', { in: 'scale', d: key === 'a' ? 300 : 380, dur: 800 }))
      : playerPhoto(p, `mu-photo mu-photo-${key}`, { in: 'rise', d: key === 'a' ? 260 : 340, dur: 950 }),
    h('div', { class: `mu-card mu-card-${key}`, in: dir, d: 620, dur: 700 },
      h('div', { class: 'mu-teamrow' },
        teamLogo(team, 'mu-tlogo'),
        h('span', { class: 'mu-team' }, team?.name || ''),
        flagBadge(p?.country, 'mu-flag')),
      fit('mu-nick display', p?.nick || '', { 'data-min': 44 }),
      p?.name ? fit('mu-name', p.name) : null,
      !simple && champs?.length
        ? h('div', { class: 'mu-champs' },
          h('div', { class: 'mu-champs-l' }, 'Top champions'),
          h('div', { class: 'mu-champs-row' }, champs.slice(0, 3).map((c, i) => champ(c, 820 + i * 80))))
        : null),
  ];
}

function statRow(r, i) {
  const a = num(r.a);
  const b = num(r.b);
  const total = (a ?? 0) + (b ?? 0);
  const sa = a != null && total > 0 ? Math.max(0, a) / total : 0;
  const sb = b != null && total > 0 ? Math.max(0, b) / total : 0;
  const w = r.winner === 'a' || r.winner === 'b' ? r.winner : '';
  const d = 760 + i * 55;
  return h('div', { class: `mrow ${w ? `win-${w}` : ''}`, in: 'fade', d },
    h('div', { class: 'mrow-top' },
      h('span', { class: 'mv mv-a' }, r.aDisplay),
      h('span', { class: 'ml' }, r.label),
      h('span', { class: 'mv mv-b' }, r.bDisplay)),
    h('div', { class: 'mbar' },
      h('div', { class: 'mbar-half mbar-a' }, h('i', { style: { width: `${(sa * 100).toFixed(1)}%` }, in: 'growx', d: d + 120, dur: 700 })),
      h('div', { class: 'mbar-half mbar-b' }, h('i', { style: { width: `${(sb * 100).toFixed(1)}%` }, in: 'growx', d: d + 120, dur: 700 }))));
}

export default {
  render(data, ctx) {
    const simple = ctx.mode === 'simple';
    const A = data.playerA || {};
    const B = data.playerB || {};
    const wa = num(data.winrateA);
    const wb = num(data.winrateB);
    const rows = [
      { label: 'Games', a: num(data.gamesA), b: num(data.gamesB), aDisplay: data.gamesA ?? '—', bDisplay: data.gamesB ?? '—', winner: '' },
      { label: 'Win Rate', a: wa, b: wb, aDisplay: pctText(wa), bDisplay: pctText(wb), winner: wa != null && wb != null && wa !== wb ? (wa > wb ? 'a' : 'b') : '' },
      ...(data.rows || []).map((r) => ({ ...r, aDisplay: statText(r.aText, num(r.a), r.fmt), bDisplay: statText(r.bText, num(r.b), r.fmt) })),
    ].slice(0, simple ? 6 : 10);
    const h2h = num(data.headToHead);
    const role = A.role && A.role === B.role ? A.role : '';

    return h('div', { class: `rows-${rows.length}` },
      plate(data.theme, 'versus', ctx),
      h('div', { class: 'mu-shade' }),
      ...playerSide(A, data.championsA, 'a', simple),
      ...playerSide(B, data.championsB, 'b', simple),
      h('header', { class: 'mu-head', in: 'down', d: 180 },
        h('div', { class: 'kicker mu-kicker' }, leagueLine(data.league)),
        h('div', { class: 'mu-title-row' },
          laurel('l', 'mu-laurel'),
          role ? roleIcon(role, 'role-ic mu-role') : null,
          fit('mu-title display', data.title || 'Player Matchup'),
          laurel('r', 'mu-laurel'))),
      h('div', { class: 'mu-panel glass ticks', in: 'up', d: 520, dur: 750 },
        h('div', { class: 'mu-panel-head' },
          h('span', { class: 'mu-ph mu-ph-a' }, A.nick || ''),
          h('span', { class: 'mu-ph-vs' }, 'VS'),
          h('span', { class: 'mu-ph mu-ph-b' }, B.nick || '')),
        h('div', { class: 'mu-rows' }, rows.map(statRow)),
        data.rows?.length ? null : h('div', { class: 'mu-nostats' }, 'Detailed stats will appear once match data is in.'),
        h('div', { class: 'mu-h2h' },
          h('span', { class: 'mu-h2h-l' }, 'Head-to-head'),
          h('span', { class: 'mu-h2h-v' }, h2h ? `${h2h} ${h2h === 1 ? 'game' : 'games'}` : 'First meeting'))));
  },
};
