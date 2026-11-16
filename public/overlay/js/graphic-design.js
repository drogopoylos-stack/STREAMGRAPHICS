import { DESIGN_FONTS, screenSlots, expandDesignText } from '../../shared/graphic-design.js';
import { tagLayoutElements } from './graphic-layout.js';
import { iconSet } from '../../shared/icon-sets.js';

const EMBLEM_DEFAULT = '/brand/tournament.svg';

/** The chosen icon set, then the custom icons. The Classic set with no custom icons changes nothing. */
function applyIcons(root, assets, theme) {
  const custom = assets.customIcons || {};
  for (const node of root.querySelectorAll('[data-icon-slot]')) {
    const slot = node.dataset.iconSlot;
    const set = iconSet(assets.iconPicks?.[slot] || assets.icons);
    if (slot === 'Emblem' && node.tagName === 'IMG') {
      if (custom[slot]) node.src = custom[slot];
      else if (set.id !== 'classic') node.src = emblemUrl(set, theme);
      continue;
    }
    if (custom[slot]) { node.replaceWith(customIcon(node, custom[slot], assets.iconTint)); continue; }
    if (set.id === 'classic' && !assets.iconPicks?.[slot] && assets.icons === 'classic') continue;
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'currentColor');
    node.innerHTML = set.icons[slot];
    if (slot === 'Team') node.style.color = 'var(--accent2)';
  }
  for (const img of root.querySelectorAll(`img[src="${EMBLEM_DEFAULT}"]`)) {
    const set = iconSet(assets.iconPicks?.Emblem || assets.icons);
    if (custom.Emblem) img.src = custom.Emblem;
    else if (set.id !== 'classic') img.src = emblemUrl(set, theme);
  }
}

function customIcon(node, url, tint) {
  const cls = node.getAttribute('class') || '';
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.draggable = false;
  img.dataset.iconSlot = node.dataset.iconSlot;
  if (!tint) { img.className = cls; return img; }
  // The image is the mask of the theme colour; the hidden <img> lets the render wait for the file.
  const box = document.createElement('span');
  box.className = `${cls} design-icon-tint`;
  box.dataset.iconSlot = node.dataset.iconSlot;
  box.style.setProperty('--design-icon', `url("${url}")`);
  if (node.dataset.iconSlot === 'Team') box.style.color = 'var(--accent2)';
  img.style.display = 'none';
  box.append(img);
  return box;
}

function emblemUrl(set, theme = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="${theme.primary || '#142235'}"/><g transform="translate(13 13) scale(2.25)" fill="currentColor" style="color:${theme.accent || '#d6a44c'}">${set.icons.Emblem}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function applyGraphicDesign(root, data) {
  const config = data.graphicDesign;
  const definitions = screenSlots(data.scene);
  for (const slot of definitions) {
    const nodes = new Set([...root.querySelectorAll(slot.selector), ...root.querySelectorAll(`[data-design-slot="${slot.id}"]`)]);
    const field = config?.screens?.[data.scene]?.[slot.id];
    for (const node of nodes) {
      node.dataset.designOriginal = [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('');
      node.dataset.designSlot = slot.id;
      node.dataset.designRole = slot.role;
      if (!config) continue;
      if (field?.enabled === false) { node.hidden = true; node.style.display = 'none'; node.setAttribute('aria-hidden', 'true'); }
      if (slot.editable && field?.text) {
        const text = expandDesignText(field.text, data);
        // Preserve nested date labels, icons and decorative children.
        for (const child of [...node.childNodes]) if (child.nodeType === Node.TEXT_NODE) child.remove();
        node.prepend(document.createTextNode(text));
        if (!node.querySelector('div,section,article')) node.classList.add('fit');
      }
      const font = DESIGN_FONTS.find(f => f.id === (field?.font || config.fonts?.[slot.role]));
      if (font) node.style.setProperty('font-family', font.css, 'important');
      if (field?.size) { node.dataset.designSize = '1'; node.style.setProperty('--design-size', `${field.size}px`); }
    }
  }
  if (!config) return root;
  applyIcons(root, config.assets, data.theme);
  tagLayoutElements(root, data);
  root.classList.add('has-graphic-design');
  const font = role => DESIGN_FONTS.find(f => f.id === config.fonts?.[role])?.css;
  // Headlines and names often share legacy CSS variables. Use the semantic slot
  // bindings above so changing one role does not change another role's original font.
  if (font('numbers')) root.style.setProperty('--f-num', font('numbers'));
  root.dataset.designFrame = config.assets.frame;
  root.dataset.designBoxes = config.assets.boxes;
  root.style.setProperty('--design-radius', `${config.assets.radius}px`);
  root.style.setProperty('--design-opacity', config.assets.opacity / 100);
  if (!['original', 'none'].includes(config.assets.frame)) {
    const frame = document.createElement('div'); frame.className = 'design-frame'; frame.setAttribute('aria-hidden', 'true'); root.append(frame);
  }
  return root;
}
