// Bracket page for other websites: one HTML file that reads the public Google Sheet in the browser.
// It needs no server: the tournament structure, team names and logos are inside the page, the
// results come from the sheet every 30 seconds. The rules match server/bracket.js.
(() => {
  const DATA = JSON.parse(document.getElementById('bracket-data').textContent);
  const query = new URLSearchParams(location.search);
  const REFRESH = 30000;
  const matches = structuredClone(DATA.matches);
  const byCode = new Map(Object.values(matches).map((m) => [m.code, m.id]));
  let current = DATA.brackets.some((b) => b.id === query.get('bracket')) ? query.get('bracket') : DATA.brackets[0]?.id;
  let updated = null;
  let failed = false;

  if (query.get('bg') === '0') document.documentElement.classList.add('no-bg');

  // ---------- data ----------

  /** RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes. */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some((v) => v.trim())) rows.push(row);
    return rows;
  }

  const teamKey = (value) => {
    const text = String(value || '').trim();
    if (DATA.teams[text]) return text;
    return Object.keys(DATA.teams).find((tag) => DATA.teams[tag].name === text) || null;
  };
  const score = (value) => (/^\d+$/.test(String(value).trim()) ? Number(value) : null);
  const source = (value) => {
    const found = /^([WL]):(.+)$/.exec(String(value || '').trim());
    return found && byCode.has(found[2]) ? { id: byCode.get(found[2]), outcome: found[1] === 'W' ? 'winner' : 'loser' } : null;
  };

  function applySheet(csv) {
    const rows = parseCsv(csv.replace(/^﻿/, ''));
    const header = (rows.shift() || []).map((h) => h.trim());
    const col = (row, name) => (header.includes(name) ? (row[header.indexOf(name)] ?? '').trim() : undefined);
    if (!header.includes('id') || !header.includes('score_a')) throw new Error('Unexpected sheet columns');
    for (const row of rows) {
      const m = matches[col(row, 'id')];
      if (!m) continue;
      m.date = col(row, 'date') || null;
      m.time = col(row, 'time') || null;
      m.sa = score(col(row, 'score_a'));
      m.sb = score(col(row, 'score_b'));
      const status = col(row, 'status');
      m.status = ['scheduled', 'live', 'done'].includes(status) ? status : 'scheduled';
      m.bestOf = Number(col(row, 'best_of')) || null;
      for (const side of ['a', 'b']) {
        const src = source(col(row, `source_${side}`));
        const key = side === 'a' ? 'srcA' : 'srcB';
        if (src) { m[key] = src; continue; }
        // A fixed bracket path stays; a seeded place follows the team tag of the sheet.
        if (m[key] && !m.openingDraw) continue;
        m[key] = null;
        m[side] = teamKey(col(row, `team_${side}`));
      }
    }
  }

  /** Teams, winner and status of every match, from the sources (same rule as the program). */
  function resolveAll() {
    const out = new Map();
    const visiting = new Set();
    const resolve = (id) => {
      if (out.has(id)) return out.get(id);
      const m = matches[id];
      if (!m || visiting.has(id)) return null;
      visiting.add(id);
      const r = { ...m, labelA: '', labelB: '' };
      for (const [side, key] of [['a', 'srcA'], ['b', 'srcB']]) {
        const src = m[key];
        if (!src) continue;
        const parent = resolve(src.id);
        r[side] = (src.outcome === 'loser' ? parent?.loser : parent?.winner) ?? null;
        r[side === 'a' ? 'labelA' : 'labelB'] = `${src.outcome === 'loser' ? 'Loser' : 'Winner'} ${matches[src.id]?.code || 'TBD'}`;
      }
      const needed = Math.ceil((Number(r.bestOf) || 1) / 2);
      const decisive = r.sa != null && r.sb != null && r.sa !== r.sb && Math.max(r.sa, r.sb) >= needed && r.a && r.b;
      r.winner = decisive && (r.status === 'done' || Number(r.bestOf) > 0) ? (r.sa > r.sb ? r.a : r.b) : null;
      r.loser = r.winner ? (r.winner === r.a ? r.b : r.a) : null;
      if (r.winner) r.status = 'done';
      visiting.delete(id);
      out.set(id, r);
      return r;
    };
    for (const id of Object.keys(matches)) resolve(id);
    return out;
  }

  // ---------- view ----------

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function logo(tag) {
    const team = DATA.teams[tag];
    const box = el('span', 'eb-logo');
    if (team?.logo) {
      const img = el('img');
      img.src = team.logo;
      img.alt = '';
      box.append(img);
    } else box.append(el('span', 'eb-logo-tbd', '?'));
    return box;
  }

  function when(m) {
    const date = m.date ? `${m.date.slice(8, 10)}/${m.date.slice(5, 7)}` : 'Date TBD';
    return [date, m.time || 'Time TBD', m.bestOf ? `BO${m.bestOf}` : ''].filter(Boolean).join(' · ');
  }

  function teamRow(m, side) {
    const tag = m[side];
    const label = side === 'a' ? m.labelA : m.labelB;
    const own = side === 'a' ? m.sa : m.sb;
    const row = el('div', 'eb-team');
    if (m.winner && tag) row.classList.add(m.winner === tag ? 'is-winner' : 'is-loser');
    const name = tag ? DATA.teams[tag]?.name || tag : label || 'TBD';
    if (!tag) row.classList.add('is-tbd');
    row.append(logo(tag), el('span', 'eb-name', name), el('b', 'eb-score', own ?? '–'));
    return row;
  }

  function matchCard(m) {
    const card = el('article', `eb-match is-${m.status}`);
    const meta = el('div', 'eb-meta');
    meta.append(el('b', 'eb-code', m.code), el('span', 'eb-when', when(m)));
    if (m.status === 'live') meta.append(el('span', 'eb-live', 'LIVE'));
    card.append(meta, teamRow(m, 'a'), teamRow(m, 'b'));
    if (m.label) card.append(el('div', 'eb-label', m.label));
    return card;
  }

  function render() {
    const resolved = resolveAll();
    const bracket = DATA.brackets.find((b) => b.id === current) || DATA.brackets[0];
    document.getElementById('eb-title').textContent = bracket.title || bracket.name;
    document.getElementById('eb-sub').textContent = bracket.subtitle || '';
    const tabs = document.getElementById('eb-tabs');
    tabs.replaceChildren(...(DATA.brackets.length > 1 && query.get('tabs') !== '0' ? DATA.brackets.map((b) => {
      const button = el('button', 'eb-tab', b.name);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(b.id === bracket.id));
      button.addEventListener('click', () => { current = b.id; render(); });
      return button;
    }) : []));
    const columns = bracket.rounds.map((round, index) => {
      const column = el('section', 'eb-round');
      column.append(el('h2', 'eb-round-name', `${String(index + 1).padStart(2, '0')} · ${round.name}`));
      const list = el('div', 'eb-list');
      list.append(...round.matches.map((id) => resolved.get(id)).filter(Boolean).map(matchCard));
      column.append(list);
      return column;
    });
    if (bracket.qualifications?.length) {
      const column = el('section', 'eb-round eb-qualified');
      column.append(el('h2', 'eb-round-name', `${String(columns.length + 1).padStart(2, '0')} · ${bracket.qualifications[0].name}`));
      const list = el('div', 'eb-list');
      for (const q of bracket.qualifications) {
        const parent = resolved.get(q.source.id);
        const tag = q.source.outcome === 'loser' ? parent?.loser : parent?.winner;
        const card = el('article', 'eb-match eb-advance');
        const row = el('div', `eb-team ${tag ? 'is-winner' : 'is-tbd'}`);
        row.append(logo(tag), el('span', 'eb-name', tag ? DATA.teams[tag]?.name || tag : `Winner ${parent?.code || 'TBD'}`));
        card.append(row);
        list.append(card);
      }
      column.append(list);
      columns.push(column);
    }
    const grid = document.getElementById('eb-grid');
    grid.style.setProperty('--cols', columns.length);
    grid.replaceChildren(...columns);
    const champion = bracket.championMatchId ? resolved.get(bracket.championMatchId)?.winner : null;
    const banner = document.getElementById('eb-champion');
    banner.hidden = !champion;
    if (champion) banner.replaceChildren(logo(champion), el('span', '', `Champions · ${DATA.teams[champion]?.name || champion}`));
    const time = updated ? updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    document.getElementById('eb-status').textContent = failed
      ? 'Results could not be loaded now. Showing the last known results.'
      : `${bracket.footer || ''}${time ? ` · Updated ${time}` : ''} · Times: ${DATA.timezoneLabel}`;
    sendHeight();
  }

  function sendHeight() {
    if (parent === window) return;
    parent.postMessage({ type: 'bracket-embed-height', id: query.get('frame') || '', height: Math.ceil(document.documentElement.getBoundingClientRect().height) }, '*');
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const response = await fetch(`${DATA.csvUrl}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      applySheet(await response.text());
      updated = new Date();
      failed = false;
    } catch {
      failed = true;
    }
    render();
  }

  document.getElementById('eb-league').textContent = DATA.league;
  const brand = document.getElementById('eb-brand');
  if (DATA.logo) brand.src = DATA.logo; else brand.remove();
  render();
  refresh();
  setInterval(refresh, REFRESH);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  addEventListener('resize', sendHeight);
  new ResizeObserver(sendHeight).observe(document.documentElement);
})();
