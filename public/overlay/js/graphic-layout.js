// Per-screen element layout: the override of the Layout tab applied to scene nodes.
// transform carries the move + scale, so the original flow of the scene never changes. A width or
// height override keeps the old footprint with negative margins, so neighbours stay where they are.
import { screenElements } from '../../shared/graphic-design.js';

const SAVED_PROPS = ['transform', 'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 'flex', 'box-sizing', 'margin-right', 'margin-bottom', 'display'];
const SIZE_PROPS = SAVED_PROPS.filter((prop) => prop !== 'transform' && prop !== 'display');

/** The override of one node: its own "id#index" entry, else the entry of its group. */
export const effectiveLayout = (map, id, index) => map?.[`${id}#${index}`] ?? map?.[id] ?? null;

/** Mark the catalogued nodes of a new scene and give each one its override (no layout pass here). */
export function tagLayoutElements(root, data) {
  const map = data.graphicDesign?.layouts?.[data.scene];
  for (const def of screenElements(data.scene)) {
    let index = 0;
    for (const node of root.querySelectorAll(def.selector)) {
      if (node.dataset.designEl) continue;
      node.dataset.designEl = def.id;
      node.dataset.designElIndex = String(index);
      node.__layout = effectiveLayout(map, def.id, index);
      index++;
    }
  }
}

export function clearNodeLayout(node) {
  if (!node.__layoutState) return;
  for (const [prop, value] of Object.entries(node.__layoutState.saved)) {
    if (value) node.style.setProperty(prop, value); else node.style.removeProperty(prop);
  }
  node.__layoutState = null;
  node.__layoutTransform = '';
}

function captureState(node) {
  const css = getComputedStyle(node);
  node.__layoutState = {
    saved: Object.fromEntries(SAVED_PROPS.map((prop) => [prop, node.style.getPropertyValue(prop)])),
    base: css.transform === 'none' ? '' : css.transform,
    inline: css.display === 'inline',
    w: node.offsetWidth,
    h: node.offsetHeight,
    marginRight: parseFloat(css.marginRight) || 0,
    marginBottom: parseFloat(css.marginBottom) || 0,
  };
}

/** Apply one override to a node that is in the document (it needs layout to measure). */
export function applyNodeLayout(node, value) {
  const { x = 0, y = 0, s = 1, w = 0, h = 0 } = value || {};
  if (!x && !y && s === 1 && !w && !h) { clearNodeLayout(node); return; }
  if (!node.__layoutState) captureState(node);
  const state = node.__layoutState;
  const { style } = node;
  if (state.inline) style.display = 'inline-block';
  const parts = [];
  if (x || y) parts.push(`translate(${x}px, ${y}px)`);
  if (s !== 1) parts.push(`scale(${s})`);
  if (state.base) parts.push(state.base);
  node.__layoutTransform = parts.join(' ');
  if (node.__layoutTransform) style.transform = node.__layoutTransform; else style.removeProperty('transform');
  if (w || h) {
    const width = w || state.w;
    const height = h || state.h;
    Object.assign(style, {
      boxSizing: 'border-box', flex: '0 0 auto', width: `${width}px`, height: `${height}px`, maxWidth: 'none', maxHeight: 'none', minWidth: '0', minHeight: '0',
      marginRight: `${state.marginRight + state.w - width}px`, marginBottom: `${state.marginBottom + state.h - height}px`,
    });
  } else {
    for (const prop of SIZE_PROPS) {
      if (state.saved[prop]) style.setProperty(prop, state.saved[prop]); else style.removeProperty(prop);
    }
  }
}

/** Layout pass of a new scene (document order: a parent gets its size before its children measure). */
export function applyLayouts(root) {
  for (const node of root.querySelectorAll('[data-design-el]')) if (node.__layout) applyNodeLayout(node, node.__layout);
}
