// Icon styles of the Graphics designer. Every set draws every slot on a 24×24 grid in currentColor,
// so an icon takes the colour of its place in the graphic and stays sharp at any size.
export const ICON_SLOTS = [
  { id: 'Top', label: 'Top', hint: 'Role of a player' },
  { id: 'Jungle', label: 'Jungle', hint: 'Role of a player' },
  { id: 'Mid', label: 'Mid', hint: 'Role of a player' },
  { id: 'Bot', label: 'Bot', hint: 'Role of a player' },
  { id: 'Support', label: 'Support', hint: 'Role of a player' },
  { id: 'Coach', label: 'Coach', hint: 'Role of a coach' },
  { id: 'Player', label: 'Player', hint: 'A player with no role' },
  { id: 'Team', label: 'Unknown team', hint: 'TBD and "Winner of" places in brackets and schedules' },
  { id: 'Emblem', label: 'Tournament emblem', hint: 'Shows until the tournament has its own logo' },
];

const QUESTION = 'M9.2 9.2C9.2 7.6 10.5 6.6 12.1 6.6 13.8 6.6 15 7.7 15 9.2 15 10.5 14.2 11.1 13.4 11.7 12.8 12.2 12.7 12.5 12.7 13.4H11C11 12 11.4 11.3 12.3 10.6 12.9 10.1 13.2 9.8 13.2 9.2 13.2 8.6 12.7 8.2 12.1 8.2 11.4 8.2 11 8.7 10.9 9.4ZM11 14.6H12.8V16.4H11Z';

/** Leaves along two arcs: the wreath of the Hoplite coach. */
function wreath() {
  const leaves = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const angle = (150 - i * 24) * (Math.PI / 180);
      const x = 12 + side * 8.6 * Math.sin(angle);
      const y = 12.6 - 8.6 * Math.cos(angle);
      const turn = side * ((150 - i * 24) - 90 + 24);
      leaves.push(`<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="1.25" ry="2.7" transform="rotate(${turn.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`);
    }
  }
  return `${leaves.join('')}<path d="M9.6 21.8 12 20.2 14.4 21.8 12 23.2Z"/>`;
}

const HEX = 'M12 1 21.5 6.5V17.5L12 23 2.5 17.5V6.5Z';
const hex = (glyph) => `<path fill-rule="evenodd" d="${HEX}${glyph}"/>`;
const chevrons = (flip) => {
  const up = 'M12 5.6 17.6 11.2 15.7 13.1 12 9.4 8.3 13.1 6.4 11.2ZM12 11 17.6 16.6 15.7 18.5 12 14.8 8.3 18.5 6.4 16.6Z';
  const down = 'M12 18.4 6.4 12.8 8.3 10.9 12 14.6 15.7 10.9 17.6 12.8ZM12 13 6.4 7.4 8.3 5.5 12 9.2 15.7 5.5 17.6 7.4Z';
  return flip ? down : up;
};

const frame = '<rect x="3" y="3" width="18" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".42"/>';
const lane = (d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d, width = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

export const ICON_SETS = [
  {
    id: 'classic',
    name: 'Classic',
    hint: 'The icons that the graphics use now.',
    icons: {
      Top: '<path d="M3 3h14.5l-4 4H7v6.5l-4 4z"/><path d="M10 10h4v4h-4z"/><path d="M21 6.5V21H6.5l2.5-2.5h9.5V9z" opacity=".38"/>',
      Jungle: '<path d="M5.2 2.8c3.4 3.6 4.9 7.9 4.6 13.2L12 21.3l2.2-5.3c-.3-5.3 1.2-9.6 4.6-13.2-2.6 1.8-4.6 4.6-6 8.3C11.4 7.4 9 4.6 5.2 2.8z"/><path d="M3.2 8.6c2 1.6 3.3 3.6 3.9 6.1l1.5 1.6c-.1-3.2-2.1-6.2-5.4-7.7zM20.8 8.6c-2 1.6-3.3 3.6-3.9 6.1l-1.5 1.6c.1-3.2 2.1-6.2 5.4-7.7z" opacity=".55"/>',
      Mid: '<path d="M16.5 3H21v4.5L7.5 21H3v-4.5z"/><path d="M3 3h9l-3 3H6v3l-3 3zM21 21h-9l3-3h3v-3l3-3z" opacity=".38"/>',
      Bot: '<path d="M21 21H6.5l4-4H17v-6.5l4-4z"/><path d="M10 10h4v4h-4z"/><path d="M3 17.5V3h14.5L15 5.5H5.5V15z" opacity=".38"/>',
      Support: '<path d="M12 2.5l2.6 3.2L12 9.6 9.4 5.7z"/><path d="M1.8 6.8h6.6l2.2 3.2-2.4 3.4H5.6l1.5-2.6z"/><path d="M22.2 6.8h-6.6l-2.2 3.2 2.4 3.4h2.6l-1.5-2.6z"/><path d="M10.3 11.6h3.4l-.5 8.4L12 21.6 10.8 20z"/>',
      Coach: '<path d="M12 3.2a7.6 7.6 0 0 0-7.6 7.6v3.6a2.6 2.6 0 0 0 2.6 2.6h1.4v-6.8H6.3v-.4a5.7 5.7 0 0 1 11.4 0v.4h-2.1V17h.6c-.7 1.4-2 2.2-3.8 2.4v-.9H10v3h2.4c3.2 0 5.6-1.6 6.6-4.5a2.6 2.6 0 0 0 1.6-2.4v-3.8A8.6 8.6 0 0 0 12 3.2z"/>',
      Player: '<circle cx="12" cy="7.6" r="4.2"/><path d="M3.8 21c.6-4.6 3.9-7.6 8.2-7.6s7.6 3 8.2 7.6z"/>',
      Team: '<path d="M12 1.2 20.6 3.8V11.4C20.6 16.7 17 20.8 12 22.8 7 20.8 3.4 16.7 3.4 11.4V3.8Z"/><text x="12" y="14.6" text-anchor="middle" font-family="Fira Sans Extra Condensed, Arial, sans-serif" font-weight="900" font-size="7.6" fill="#0d1117">TBD</text>',
      Emblem: line('M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0zM7.5 5.6H5v2.6a3.8 3.8 0 0 0 3.8 3.8M16.5 5.6H19v2.6a3.8 3.8 0 0 1-3.8 3.8M12 14v4M8.5 19.5h7', 1.6),
    },
  },
  {
    id: 'hoplite',
    name: 'Hoplite',
    hint: 'Greek warrior gear: helmet, axe, lightning, bow and shield.',
    icons: {
      Top: '<path d="M4 7.2C5 3.2 8.5 1.4 12 1.4S19 3.2 20 7.2C18 4.8 15.4 3.8 12 3.8S6 4.8 4 7.2Z"/><path d="M12 5.4C7.4 5.4 4.4 8.6 4.4 13.1V19.4L9 22.4V17L7 14.4H10.6L11 15V22.6H13V15L13.4 14.4H17L15 17V22.4L19.6 19.4V13.1C19.6 8.6 16.6 5.4 12 5.4Z"/>',
      Jungle: '<path d="M11.2 1.6H12.8V22.4H11.2Z"/><path d="M10.4 6.6C7.2 7.2 4.8 5.8 3.2 3.2 1.7 5.8 1 8.8 1 11.2S1.7 16.6 3.2 19.2C4.8 16.6 7.2 15.2 10.4 15.8Z"/><path d="M13.6 6.6C16.8 7.2 19.2 5.8 20.8 3.2 22.3 5.8 23 8.8 23 11.2S22.3 16.6 20.8 19.2C19.2 16.6 16.8 15.2 13.6 15.8Z"/>',
      Mid: '<path d="M14.4 1 4.8 13.8H10.8L8.6 23 19.4 9.6H13.2L16.2 1Z"/>',
      Bot: `${line('M5.4 2.8C13.6 3.2 20.8 10.4 21.2 18.6', 2.2)}${line('M5.4 2.8 21.2 18.6', 0.9)}${line('M3.2 20.8 16.6 7.4', 1.9)}<path d="M20.6 3.4 19 9.6 14.4 5Z"/>${line('M5.6 18.4 2.4 18M5.6 18.4 6 21.6', 1.5)}`,
      Support: '<path fill-rule="evenodd" d="M12 1.6A10.4 10.4 0 1 0 12 22.4 10.4 10.4 0 0 0 12 1.6ZM12 3.8A8.2 8.2 0 1 1 12 20.2 8.2 8.2 0 0 1 12 3.8Z"/><path d="M12 6.2 17.2 17.4H14.6L12 11.6 9.4 17.4H6.8Z"/>',
      Coach: wreath(),
      Player: '<path d="M12 1.2 15.4 8 12.9 9.8V22.8H11.1V9.8L8.6 8Z"/>',
      Team: `<path fill-rule="evenodd" d="M12 1.6A10.4 10.4 0 1 0 12 22.4 10.4 10.4 0 0 0 12 1.6Z${QUESTION}"/>`,
      Emblem: '<path d="M12 2 22.6 8.6H1.4Z"/><path d="M2.6 9.8H21.4V11.4H2.6Z"/><path d="M4 12.4H6.2V18.6H4ZM8.6 12.4H10.8V18.6H8.6ZM13.2 12.4H15.4V18.6H13.2ZM17.8 12.4H20V18.6H17.8Z"/><path d="M2.6 19.6H21.4V22H2.6Z"/>',
    },
  },
  {
    id: 'lanes',
    name: 'Lane map',
    hint: 'A small map of the game: the bold line shows the place of the player.',
    icons: {
      Top: `${frame}${lane('M4.6 19.4V7.4A2.8 2.8 0 0 1 7.4 4.6H19.4')}<circle cx="6.8" cy="6.8" r="2.3"/>`,
      Jungle: `${frame}${line('M5 19 19 5', 1.4)}<path d="M9 5.6 12.4 11.2H5.6Z"/><path d="M9 8.2 11.6 12.8H6.4Z"/><path d="M15 11.2 18.4 16.8H11.6Z"/><path d="M15 13.8 17.6 18.4H12.4Z"/>`,
      Mid: `${frame}${lane('M5.4 18.6 18.6 5.4')}<circle cx="12" cy="12" r="3"/>`,
      Bot: `${frame}${lane('M4.6 19.4H16.6A2.8 2.8 0 0 0 19.4 16.6V4.6')}<circle cx="17.2" cy="17.2" r="2.3"/>`,
      Support: `${frame}${lane('M4.6 19.4H16.6A2.8 2.8 0 0 0 19.4 16.6V4.6')}<path d="M10.6 6.4H13V9H15.6V11.4H13V14H10.6V11.4H8V9H10.6Z"/>`,
      Coach: `${frame}${line('M6.6 6.6 10 10M10 6.6 6.6 10', 1.9)}<circle cx="15.8" cy="15.8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.9"/>${line('M13.2 7.4C15.6 7.4 17 8.8 17 11.2M15.4 10 17 11.6 18.6 10', 1.5)}`,
      Player: `${frame}<circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
      Team: `<rect x="3" y="3" width="18" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 2.6"/><path fill-rule="evenodd" d="${QUESTION}"/>`,
      Emblem: `${frame}<path d="M12 5.4 13.9 10 18.8 10.4 15 13.6 16.2 18.4 12 15.8 7.8 18.4 9 13.6 5.2 10.4 10.1 10Z"/>`,
    },
  },
  {
    id: 'hex',
    name: 'Hex badge',
    hint: 'Solid esports badges with a sharp symbol. Strong at small sizes.',
    icons: {
      Top: hex(chevrons(false)),
      Jungle: hex('M7.3 5.8 9.5 5.8 9.1 13.4 7.6 18.2 6.9 12.6ZM11 5.2 13.2 5.2 12.6 14 11.2 19.4 10.5 13.2ZM14.7 5.8 16.9 5.8 15.9 13.4 14.4 18.2 14.1 12.6Z'),
      Mid: hex('M12 5.6 18.4 12 12 18.4 5.6 12ZM12 9.2 9.2 12 12 14.8 14.8 12Z'),
      Bot: hex(chevrons(true)),
      Support: hex('M10 5.8H14V10H18.2V14H14V18.2H10V14H5.8V10H10Z'),
      Coach: hex('M12 5.2 13.9 9.9 19 10.3 15.1 13.6 16.3 18.6 12 15.9 7.7 18.6 8.9 13.6 5 10.3 10.1 9.9Z'),
      Player: hex('M12 5.6A3.2 3.2 0 1 1 12 12 3.2 3.2 0 0 1 12 5.6ZM6.2 18.6C6.5 15 9 13.2 12 13.2S17.5 15 17.8 18.6Z'),
      Team: hex(QUESTION),
      Emblem: hex('M6 17.4V8.2L9.4 11.2 12 6 14.6 11.2 18 8.2V17.4Z'),
    },
  },
];

export const ICON_SET_IDS = ICON_SETS.map((set) => set.id);
export const iconSet = (id) => ICON_SETS.find((set) => set.id === id) || ICON_SETS[0];
export const iconSvg = (setId, slot, attrs = '') => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" ${attrs}>${iconSet(setId).icons[slot]}</svg>`;
