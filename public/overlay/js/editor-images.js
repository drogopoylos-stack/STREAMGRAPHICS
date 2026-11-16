// Images that the Graphics designer can change in the preview (docs/specs/EDITOR-UX.md §1.2, §3).
// Scene markup marks an image with data-image="team|player|league|sponsor|event|mark" (+ data-ref, or data-image-slot
// for a design image); role icons, the unknown-team shield and the emblem carry data-icon-slot. The class names are
// the older stream markup, kept so every scene works without new attributes.
// Pure functions (no DOM globals) so Node tests can run them with small fake nodes.

export const IMAGE_SELECTOR = '[data-icon-slot],[data-image],.tlogo,.pphoto,.league-logo,.spons-item,.sp-tile';
export const IMAGE_KINDS = ['icon', 'team', 'player', 'league', 'sponsor', 'event', 'mark'];
const CLASS_KINDS = [['tlogo', 'team'], ['pphoto', 'player'], ['league-logo', 'league'], ['spons-item', 'sponsor'], ['sp-tile', 'sponsor']];
const LABELS = { team: 'Team logo', player: 'Player photo', league: 'Tournament logo', sponsor: 'Sponsor logo', event: 'Event logo', mark: 'Header mark' };
const MARK_LABELS = { lettermark: 'Header mark', hllLogo: 'HLL logo' };

/** The kind of a replaceable image node, or null: data-icon-slot → icon, data-image → its value, else the older class names. */
export function imageKind(node) {
  if (!node) return null;
  if (node.dataset?.iconSlot) return 'icon';
  const kind = node.dataset?.image;
  if (IMAGE_KINDS.includes(kind)) return kind;
  return CLASS_KINDS.find(([cls]) => node.classList?.contains(cls))?.[1] ?? null;
}

/** The name of an image in the toolbar and the picker. */
export function imageLabel(kind, slot = '') {
  if (kind === 'icon') return slot === 'Team' ? 'Unknown team icon' : slot === 'Emblem' ? 'Tournament emblem' : `${slot} icon`;
  if (kind === 'mark') return MARK_LABELS[slot] || LABELS.mark;
  return LABELS[kind] || 'Image';
}

/** The wording of the toolbar button and the hover hint for an image kind. */
export const changeLabel = (kind) => (kind === 'icon' ? 'Change icon…' : 'Change image…');

/**
 * What a click at a point means. `stack` is document.elementsFromPoint() from the top; the accessors return the image,
 * text slot or catalogued element that a node belongs to (or null). The first image or text slot wins. A plain node of an
 * element (a shine, shade or ink layer on top of a photo) does not hide the images and texts inside that same element:
 * the search goes on below it, and only the element itself is returned when nothing of it is found.
 */
export function pickTarget(stack, { image, slot, item, contains }) {
  let fallback = null;
  for (const el of stack) {
    const hit = image(el) || slot(el);
    if (hit) {
      if (!fallback || contains(fallback, hit)) return hit;
      continue;
    }
    if (!fallback) fallback = item(el);
  }
  return fallback;
}
