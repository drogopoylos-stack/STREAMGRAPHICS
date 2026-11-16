// Layout tab of the Graphics designer: runs inside the preview iframe (scene.html?designer=1) only.
// Click an element to select it, drag to move, corners scale, sides change the width / height.
// The parent page holds the design draft; this module reports every change with postMessage.
import { screenElements, screenSlots, expandDesignText, TEXT_TOKENS, cleanLayout, LAYOUT_LIMITS } from '../../shared/graphic-design.js';
import { effectiveLayout, applyNodeLayout, clearNodeLayout } from './graphic-layout.js';
import { fitAll, fitText } from './core.js';
import { IMAGE_SELECTOR, imageKind, imageLabel, pickTarget } from './editor-images.js';

const SNAP = 6;
const CLICK_SLOP = 3;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const clampOffset = (n) => clamp(n, -LAYOUT_LIMITS.offset, LAYOUT_LIMITS.offset);

function div(cls, parent) {
  const el = document.createElement('div');
  el.className = cls;
  parent?.append(el);
  return el;
}

export function createLayoutEditor(post) {
  let root = null;
  let scene = '';
  let map = {};
  let enabled = false;
  let selection = null; // { id, index, only }
  let viewScale = 1;
  let drag = null;
  let hover = null, hoverImage = null;
  // pointImage: the image under the last click when the click kept a larger selected element (for "Change image…").
  let data = {}, target = null, pointImage = null, background = false, editing = null, fitFrame = 0;
  let lastPress = { at: -Infinity, x: 0, y: 0 };

  const overlay = div('le-overlay');
  overlay.hidden = true;
  document.body.append(overlay);

  const defOf = (id) => screenElements(scene).find((e) => e.id === id);
  const shown = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const nodesOf = (id) => [...root.querySelectorAll(`[data-design-el="${CSS.escape(id)}"]`)].filter(shown);
  const indexOf = (node) => Number(node.dataset.designElIndex);
  const primary = () => (selection && root ? nodesOf(selection.id).find((n) => indexOf(n) === selection.index) ?? null : null);
  const keyOf = () => (selection.only ? `${selection.id}#${selection.index}` : selection.id);
  const valueOf = () => ({ ...(effectiveLayout(map, selection.id, selection.index) || {}) });
  /** The nodes that follow the selection: one node, or every node of the group without its own entry. */
  const linked = () => (selection.only ? [primary()].filter(Boolean) : nodesOf(selection.id).filter((n) => !(`${selection.id}#${indexOf(n)}` in map)));
  /** Scene px per local px of the node's parent (more than 1 when a parent element is scaled up). */
  function localScale(node) {
    const parent = node.parentElement;
    return parent?.offsetWidth ? parent.getBoundingClientRect().width / parent.offsetWidth : 1;
  }

  function refit(node) {
    if (node.classList.contains('fit')) fitText(node);
    fitAll(node);
  }

  function setValue(value, resized = false) {
    const clean = cleanLayout(value);
    map[keyOf()] = clean;
    for (const node of linked()) {
      node.__layout = clean;
      applyNodeLayout(node, clean);
      if (resized) refit(node);
    }
    draw();
  }

  /** After a parent change or an undo: every override again, from the original layout. */
  function reapplyAll() {
    const nodes = [...root.querySelectorAll('[data-design-el]')];
    nodes.forEach(clearNodeLayout);
    for (const node of nodes) {
      node.__layout = effectiveLayout(map, node.dataset.designEl, indexOf(node));
      if (node.__layout) applyNodeLayout(node, node.__layout);
    }
    fitAll(root);
    draw();
  }

  function commit(coalesce = '', kind = 'move') {
    post('changed', { layouts: structuredClone(map), coalesce, kind });
    announce();
  }

  function selectionInfo() {
    const node = target?.isConnected ? target : primary();
    if (background) return { id: 'background', label: 'Background', kind: 'background', rect: { x: 0, y: 0, w: root.offsetWidth, h: root.offsetHeight } };
    if (!node) return null;
    const meta = describe(node);
    const def = defOf(selection?.id);
    const parentNode = (primary() || node).parentElement?.closest('[data-design-el]');
    return {
      ...selection, ...meta,
      label: meta.kind === 'team' && /Team [AB]/.test(def?.label) ? def.label.replace('crest', 'logo') : meta.label || def?.label || 'Element',
      fixed: !!def?.fixed,
      count: selection ? nodesOf(selection.id).length : 1,
      value: selection ? valueOf() : {},
      width: node.offsetWidth,
      height: node.offsetHeight,
      parent: parentNode && root.contains(parentNode) ? { id: parentNode.dataset.designEl, index: indexOf(parentNode) } : null,
      image: pointImage?.isConnected && pointImage !== node ? describe(pointImage) : null,
    };
  }
  const announce = () => post('selected', { selection: selectionInfo() });

  function select(id, index) {
    target = null; pointImage = null; background = id === 'background';
    selection = id && !background ? { id, index, only: `${id}#${index}` in map } : null;
    if (selection && !primary()) selection = null;
    draw();
    announce();
  }

  function listElements() {
    const seen = new Map();
    for (const node of root.querySelectorAll('[data-design-el]')) {
      if (!shown(node)) continue;
      const id = node.dataset.designEl;
      if (seen.has(id)) { seen.get(id).count++; continue; }
      let depth = 0;
      for (let p = node.parentElement?.closest('[data-design-el]'); p; p = p.parentElement?.closest('[data-design-el]')) depth++;
      seen.set(id, { id, label: defOf(id).label, count: 1, depth });
    }
    post('elements', { elements: [...seen.values()] });
  }

  /** The image, text or element that a double-click at (x, y) acts on (see editor-images.js pickTarget). */
  function actionableAt(x, y) {
    const stack = document.elementsFromPoint(x, y).filter(el => !overlay.contains(el) && root.contains(el));
    return pickTarget(stack, { image: el => el.closest(IMAGE_SELECTOR), slot: el => el.closest('[data-design-slot]'), item: el => el.closest('[data-design-el]'), contains: (a, b) => a.contains(b) });
  }
  const imageAt = (x, y) => { const node = actionableAt(x, y); return imageKind(node) ? node : null; };
  function describe(node) {
    const image = node.closest(IMAGE_SELECTOR), imgKind = imageKind(image);
    const icon = imgKind === 'icon' ? image.dataset.iconSlot : undefined;
    const imageSlot = imgKind === 'mark' ? image.dataset.imageSlot || '' : undefined;
    const slot = !icon && node.closest('[data-design-slot]')?.dataset.designSlot;
    const def = screenSlots(scene).find(s => s.id === slot);
    const kind = imgKind || (def ? def.editable ? 'text' : 'data' : 'container');
    // A record image only takes a reference of its own kind (a TBD logo inside a match must not open the match).
    const near = node.closest('[data-ref]')?.dataset.ref || '';
    const ref = ['team', 'player', 'sponsor'].includes(kind) ? (near.startsWith(`${kind}:`) ? near : '') : near;
    const r = node.getBoundingClientRect();
    return { slot, icon, imageSlot, kind, hideSlot: icon ? node.closest('[data-design-slot]')?.dataset.designSlot : null, editable: !!def?.editable, label: imgKind ? imageLabel(imgKind, icon || imageSlot) : def?.label,
      ref, text: node.textContent.trim(), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  }
  function activate(node) {
    if (editing) return;
    if (!node) { select('background'); post('open', { selection: selectionInfo() }); return; }
    const el = node.closest('[data-design-el]');
    if (el) select(el.dataset.designEl, indexOf(el));
    target = node; background = false;
    const meta = describe(node);
    if (meta.kind === 'text') startEdit(node.closest('[data-design-slot]'), meta.slot);
    else if (meta.kind !== 'container') post('open', { selection: { ...selectionInfo(), ...meta } });
    announce();
  }
  function editTag(message = '') {
    if (!editing) return;
    draw();
    const box = div('le-box te-box', overlay); placeBox(box, editing.node.getBoundingClientRect());
    const linked = [...root.querySelectorAll('[data-design-slot]')].filter(n => n !== editing.node && n.dataset.designSlot === editing.slot);
    for (const n of linked) placeBox(div('le-box is-linked', overlay), n.getBoundingClientRect());
    const tag = div('le-tag', box);
    const clipped = editing.node.classList.contains('fit-clip');
    box.classList.toggle('te-warning', !!message || clipped);
    tag.textContent = message || (clipped ? 'Too long \u00b7 the end will be cut' : `Editing \u00b7 ${editing.def.label}${linked.length ? ` \u00b7 Changes ${linked.length + 1} places` : ''}`);
    if (message) post('text-error', { message });
  }
  function startEdit(node, slot) {
    const def = screenSlots(scene).find(s => s.id === slot);
    if (!def?.editable || !node) return;
    const children = [...node.childNodes], own = children.filter(n => n.nodeType === Node.TEXT_NODE);
    const displayed = own.map(n => n.textContent).join('').trim();
    const field = data.graphicDesign?.screens?.[scene]?.[slot];
    const initial = field?.text || (def.example && expandDesignText(def.example, data) === displayed ? def.example : displayed);
    const span = document.createElement('span'); span.className = 'te-edit'; span.contentEditable = 'plaintext-only';
    span.setAttribute('role', 'textbox'); span.setAttribute('aria-label', `${def.label} text`); span.setAttribute('aria-describedby', 'te-hint'); span.spellcheck = false; span.textContent = initial;
    let hint = document.getElementById('te-hint');
    if (!hint) { hint = div('te-hint', document.body); hint.id = 'te-hint'; hint.textContent = 'Enter to save, Escape to cancel'; }
    if (own.length) own[0].before(span); else node.prepend(span);
    own.forEach(n => n.remove()); node.classList.add('te-editing');
    const bubble = parseFloat(getComputedStyle(node).fontSize) * viewScale < 12;
    editing = { node, slot, def, span, children, initial, own, bubble, linked: new Map() };
    span.addEventListener('input', inputEdit);
    span.addEventListener('paste', e => { e.preventDefault(); insertText(e.clipboardData.getData('text/plain')); });
    span.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
      if (e.key === 'Enter') { e.preventDefault(); if (!e.shiftKey) endEdit(true); }
      if (e.key === 'Tab') {
        e.preventDefault(); nextEdit(e.shiftKey);
      }
    });
    if (!bubble) { span.focus(); const range = document.createRange(); range.selectNodeContents(span); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
    editTag();
    post('text-editing', { slot, editing: true, label: def.label, text: initial, bubble, selection: { ...selectionInfo(), ...describe(node) } });
  }
  function inputEdit() {
    if (!editing) return;
    const text = editing.span.textContent.replace(/[\r\n]+/g, ' ');
    if (text.length > 500) post('notice', { message: 'Text shortened to 500 characters.' });
    if (editing.span.textContent !== text.slice(0, 500)) editing.span.textContent = text.slice(0, 500);
    cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(() => {
      if (!editing) return;
      for (const node of root.querySelectorAll('[data-design-slot]')) if (node !== editing.node && node.dataset.designSlot === editing.slot) {
        const own = [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE);
        if (!editing.linked.has(node)) editing.linked.set(node, [...node.childNodes]);
        own.forEach(n => n.remove()); node.prepend(document.createTextNode(editing.span.textContent)); refit(node);
      }
      refit(editing.node); editTag();
    });
  }
  function insertText(text, start, end) {
    if (!editing) return;
    const span = editing.span, sel = getSelection();
    const range = sel.rangeCount && span.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    text = text.replace(/[\r\n]+/g, ' ');
    if (Number.isInteger(start)) span.textContent = span.textContent.slice(0, start) + text + span.textContent.slice(end ?? start);
    else if (range) { range.deleteContents(); const n = document.createTextNode(text); range.insertNode(n); range.setStartAfter(n); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    else span.append(document.createTextNode(text));
    inputEdit();
    if (editing.bubble) post('text-editing', { slot: editing.slot, label: editing.def.label, editing: true, bubble: true, text: span.textContent, caret: Number.isInteger(start) ? start + text.length : span.textContent.length, selection: { ...selectionInfo(), ...describe(editing.node) } });
    else span.focus({ preventScroll: true });
  }
  function endEdit(save) {
    if (!editing) return true;
    const edit = editing, text = edit.span.textContent.replace(/[\r\n]+/g, ' ').slice(0, 500);
    const unknown = [...text.matchAll(/\{(\w+)\}/g)].find(m => !TEXT_TOKENS.includes(m[1]));
    if (save && unknown) { editTag(`Unknown token {${unknown[1]}}. Use Insert token.`); return false; }
    cancelAnimationFrame(fitFrame);
    edit.node.replaceChildren(...edit.children); edit.node.classList.remove('te-editing');
    for (const [node, children] of edit.linked) { node.replaceChildren(...children); refit(node); }
    if (save && text !== edit.initial) {
      data.graphicDesign.screens[scene] ||= {};
      data.graphicDesign.screens[scene][edit.slot] = { enabled: true, text: '', font: '', size: 0, ...data.graphicDesign.screens[scene][edit.slot], text };
      for (const node of root.querySelectorAll('[data-design-slot]')) if (node.dataset.designSlot === edit.slot) {
        const own = [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE); own.forEach(n => n.remove());
        node.prepend(document.createTextNode(text ? expandDesignText(text, data) : node.dataset.designOriginal || ''));
        refit(node);
      }
      post('text-commit', { slot: edit.slot, text });
    }
    editing = null; refit(edit.node); draw();
    post('text-editing', { slot: edit.slot, editing: false, saved: save, label: edit.def.label });
    document.dispatchEvent(new CustomEvent('graphic-text-ended', { detail: save && text !== edit.initial ? { slot: edit.slot, field: data.graphicDesign.screens[scene][edit.slot] } : null }));
    return true;
  }
  function nextEdit(back = false) {
    if (!editing) return;
    const nodes = [...root.querySelectorAll('[data-design-slot]')].filter(n => shown(n) && screenSlots(scene).find(s => s.id === n.dataset.designSlot)?.editable);
    const i = nodes.indexOf(editing.node), next = nodes[(i + (back ? nodes.length - 1 : 1)) % nodes.length];
    if (endEdit(true) && next) activate(next);
  }

  // ---------- overlay ----------

  function placeBox(box, r) {
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  function draw(guides = []) {
    overlay.replaceChildren();
    overlay.style.setProperty('--le-px', `${1 / viewScale}px`);
    root?.style.setProperty('--le-px', `${1 / viewScale}px`);
    overlay.hidden = !enabled;
    if (!enabled || !root) return;
    if (hoverImage?.isConnected && !editing) {
      // An image says how to change it: outline + "Double-click to change".
      const box = div('le-box is-hover is-image', overlay);
      placeBox(box, hoverImage.getBoundingClientRect());
      div('le-tag le-hint', box).textContent = 'Double-click to change';
    } else if (hover && hover.isConnected && (!selection || hover.dataset.designEl !== selection.id)) placeBox(div('le-box is-hover', overlay), hover.getBoundingClientRect());
    const main = primary();
    if (main && !editing) {
      for (const node of linked()) if (node !== main) placeBox(div('le-box is-linked', overlay), node.getBoundingClientRect());
      const box = div('le-box is-selected', overlay);
      placeBox(box, main.getBoundingClientRect());
      const def = defOf(selection.id);
      for (const handle of def.fixed ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const el = div(`le-h le-h-${handle}`, box);
        el.dataset.h = handle;
      }
      const tag = div('le-tag', box);
      tag.textContent = def.label;
      // The image that the toolbar's "Change image…" acts on, when it is smaller than the selected element.
      const image = [target, pointImage].find(n => n?.isConnected && n !== main && imageKind(n));
      if (image && image !== hoverImage) placeBox(div('le-box is-target', overlay), image.getBoundingClientRect());
    }
    for (const g of guides) {
      const line = div(`le-guide le-guide-${g.axis}`, overlay);
      line.style[g.axis === 'x' ? 'left' : 'top'] = `${g.at}px`;
    }
  }

  // ---------- pointer ----------

  /** Catalogued nodes under a point: the top one first, then its catalogued parents, then lower nodes. */
  function chainAt(x, y) {
    const out = [];
    for (const el of document.elementsFromPoint(x, y)) {
      if (overlay.contains(el) || !root.contains(el)) continue;
      for (let node = el.closest('[data-design-el]'); node && root.contains(node); node = node.parentElement?.closest('[data-design-el]')) {
        if (!out.includes(node)) out.push(node);
      }
    }
    return out;
  }

  function snapTargets(main) {
    const r = root.getBoundingClientRect();
    const xs = [r.left, r.left + r.width / 2, r.right];
    const ys = [r.top, r.top + r.height / 2, r.bottom];
    const skip = new Set(linked());
    for (const node of root.querySelectorAll('[data-design-el]')) {
      if (skip.has(node) || node.contains(main) || main.contains(node) || !shown(node)) continue;
      const n = node.getBoundingClientRect();
      xs.push(n.left, n.left + n.width / 2, n.right);
      ys.push(n.top, n.top + n.height / 2, n.bottom);
    }
    return { xs, ys };
  }

  function snapAxis(edges, targets) {
    let best = null;
    for (const edge of edges) for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= SNAP / viewScale && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target };
    }
    return best;
  }

  function startDrag(e, mode, handle = '') {
    const main = primary();
    if (!main) return;
    const value = valueOf();
    drag = {
      mode, handle, moved: false, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId,
      value, rect: main.getBoundingClientRect(), factor: localScale(main),
      width: value.w || main.offsetWidth, height: value.h || main.offsetHeight,
      targets: mode === 'move' ? snapTargets(main) : null,
    };
    document.documentElement.setPointerCapture(e.pointerId);
  }

  function moveTo(dx, dy, e) {
    const { rect, targets, value, factor } = drag;
    const guides = [];
    if (!e.altKey) {
      const sx = snapAxis([rect.left + dx, rect.left + rect.width / 2 + dx, rect.right + dx], targets.xs);
      const sy = snapAxis([rect.top + dy, rect.top + rect.height / 2 + dy, rect.bottom + dy], targets.ys);
      if (sx) { dx += sx.delta; guides.push({ axis: 'x', at: sx.at }); }
      if (sy) { dy += sy.delta; guides.push({ axis: 'y', at: sy.at }); }
    }
    setValue({ ...value, x: clampOffset((value.x || 0) + dx / factor), y: clampOffset((value.y || 0) + dy / factor) });
    if (guides.length) draw(guides);
  }

  function resizeTo(dx, dy) {
    const { rect, handle, value, factor, width, height } = drag;
    const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    const anchorX = hx > 0 ? rect.left : hx < 0 ? rect.right : rect.left + rect.width / 2;
    const anchorY = hy > 0 ? rect.top : hy < 0 ? rect.bottom : rect.top + rect.height / 2;
    const next = { ...value };
    const scale = value.s || 1;
    if (hx && hy) {
      const ratio = Math.max((rect.width + hx * dx) / rect.width, (rect.height + hy * dy) / rect.height);
      next.s = clamp(scale * ratio, LAYOUT_LIMITS.minScale, LAYOUT_LIMITS.maxScale);
    } else if (hx) {
      next.w = clamp(width + (hx * dx) / (factor * scale), Math.max(20, LAYOUT_LIMITS.minSize), LAYOUT_LIMITS.maxSize);
    } else {
      next.h = clamp(height + (hy * dy) / (factor * scale), Math.max(20, LAYOUT_LIMITS.minSize), LAYOUT_LIMITS.maxSize);
    }
    setValue(next, !(hx && hy));
    // Hold the opposite edge or corner still, for any anchor that the original layout uses.
    const r = primary().getBoundingClientRect();
    const nowX = hx > 0 ? r.left : hx < 0 ? r.right : r.left + r.width / 2;
    const nowY = hy > 0 ? r.top : hy < 0 ? r.bottom : r.top + r.height / 2;
    setValue({ ...next, x: clampOffset((next.x || 0) + (anchorX - nowX) / factor), y: clampOffset((next.y || 0) + (anchorY - nowY) / factor) });
  }

  function onDown(e) {
    if (!enabled || e.button !== 0 || !root || e.target.closest?.('.te-edit')) return;
    if (editing && !endEdit(true)) { e.preventDefault(); return; }
    const repeat = e.timeStamp - lastPress.at < 500 && Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) * viewScale < CLICK_SLOP;
    lastPress = { at: e.timeStamp, x: e.clientX, y: e.clientY };
    if (e.detail > 1 || repeat) return;
    e.preventDefault();
    focus(); post('pointer', { down: true });
    const handle = e.target.closest?.('.le-h');
    if (handle && selection) { startDrag(e, 'resize', handle.dataset.h); return; }
    const chain = chainAt(e.clientX, e.clientY);
    if (!chain.length) { select('background'); return; }
    const hit = chain.find(n => n.dataset.designEl === selection?.id && indexOf(n) === selection.index) || chain[0];
    select(hit.dataset.designEl, indexOf(hit));
    const pick = actionableAt(e.clientX, e.clientY);
    target = hit === chain[0] ? pick || hit : hit;
    pointImage = pick !== target && imageKind(pick) ? pick : null;
    draw(); announce(); startDrag(e, 'move');
  }

  function onMove(e) {
    if (!enabled || editing) return;
    if (!drag) {
      const top = root ? chainAt(e.clientX, e.clientY)[0] ?? null : null;
      const image = root ? imageAt(e.clientX, e.clientY) : null;
      if (top !== hover || image !== hoverImage) { hover = top; hoverImage = image; draw(); }
      return;
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) * viewScale < CLICK_SLOP) return;
    drag.moved = true;
    if (drag.mode === 'move') moveTo(dx, dy, e); else resizeTo(dx, dy);
    post('live', { selection: selectionInfo() });
  }

  function onUp(e) {
    post('pointer', { down: false });
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { moved, mode } = drag;
    drag = null;
    if (moved) {
      if (mode === 'resize' && Object.keys(map).length > 1) reapplyAll();
      draw();
      commit('', mode);
    }
    announce();
  }

  function onKey(e) {
    if (!enabled || editing || e.target.closest?.('.te-edit')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); post('toolbar-focus'); return; }
    if (e.ctrlKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); const nodes = [...root.querySelectorAll('[data-design-el]')].filter(shown), i = nodes.indexOf(primary());
      const n = nodes[(i + (e.key === 'ArrowDown' ? 1 : nodes.length - 1)) % nodes.length];
      if (n) select(n.dataset.designEl, indexOf(n)); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); post('history', { direction: e.shiftKey ? 'redo' : 'undo' }); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); post('history', { direction: 'redo' }); return; }
    if (e.key === 'Escape') { e.preventDefault(); const p = selectionInfo()?.parent; select(p?.id, p?.index); return; }
    if (!selection) return;
    if (['Enter', 'F2'].includes(e.key)) { e.preventDefault(); activate(target || primary()); return; }
    if (['Delete', 'Backspace'].includes(e.key) && selectionInfo()?.slot) { e.preventDefault(); post('hide', { slot: selectionInfo().slot }); return; }
    const step = e.shiftKey ? 10 : 1;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!move) return;
    e.preventDefault();
    const value = valueOf();
    setValue({ ...value, x: clampOffset((value.x || 0) + move[0]), y: clampOffset((value.y || 0) + move[1]) });
    commit('nudge');
  }

  addEventListener('dblclick', e => { if (!enabled || e.target.closest?.('.te-edit')) return; e.preventDefault(); activate(actionableAt(e.clientX, e.clientY)); });
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', onUp, true);
  addEventListener('keydown', onKey);
  document.addEventListener('pointerleave', () => { if (!drag && (hover || hoverImage)) { hover = null; hoverImage = null; draw(); } });

  return {
    /** A new render of the preview. */
    attach(next, nextData) {
      const previous = target ? describe(target) : null;
      data = nextData;
      root = next;
      scene = data.scene;
      map = structuredClone(data.graphicDesign?.layouts?.[scene] || {});
      hover = null; hoverImage = null;
      root.classList.toggle('le-editing', enabled);
      listElements();
      if (selection) {
        select(selection.id, selection.index);
        const main = primary();
        const images = { team: '[data-image="team"],.tlogo', player: '[data-image="player"],.pphoto', league: '[data-image="league"],.league-logo', sponsor: '[data-image="sponsor"],.spons-item,.sp-tile', event: '[data-image="event"]', mark: `[data-image-slot="${CSS.escape(previous?.imageSlot || '')}"]` };
        const selector = previous?.icon ? `[data-icon-slot="${CSS.escape(previous.icon)}"]` : images[previous?.kind] || (previous?.slot ? `[data-design-slot="${CSS.escape(previous.slot)}"]` : null);
        if (selector && main) { target = main.matches(selector) ? main : main.querySelector(selector); announce(); }
      } else { draw(); if (background) announce(); }
    },
    get editing() { return !!editing; },
    /** Messages of the parent page: { action, ... }. */
    handle(msg) {
      switch (msg.action) {
        case 'edit': activate(target || primary()); break;
        case 'text-save': endEdit(true); break;
        case 'text-cancel': endEdit(false); break;
        case 'text-next': nextEdit(!!msg.back); break;
        case 'text-input': if (editing) { editing.span.textContent = msg.text; inputEdit(); } break;
        case 'text-insert': insertText(msg.text, msg.start, msg.end); break;
        case 'parent': { const p = selectionInfo()?.parent; select(p?.id, p?.index); break; }
        case 'select-slot': { const n = root?.querySelector(`[data-design-slot="${CSS.escape(msg.slot)}"]`); const el = n?.closest('[data-design-el]'); if (el) { select(el.dataset.designEl, indexOf(el)); target = n; announce(); } break; }
        case 'mode':
          enabled = !!msg.enabled;
          viewScale = msg.viewScale || viewScale;
          root?.classList.toggle('le-editing', enabled);
          draw();
          break;
        case 'select':
          if (root) select(msg.id ?? null, msg.index ?? 0);
          break;
        case 'update': {
          if (!selection || background) break;
          const next = { ...valueOf(), ...msg.patch };
          setValue(next, 'w' in msg.patch || 'h' in msg.patch);
          reapplyAll();
          commit('', 'w' in msg.patch || 'h' in msg.patch || 's' in msg.patch ? 'resize' : 'move');
          break;
        }
        case 'scope':
          if (!selection || background) break;
          if (msg.only) map[`${selection.id}#${selection.index}`] = valueOf();
          else delete map[`${selection.id}#${selection.index}`];
          selection.only = !!msg.only;
          reapplyAll();
          commit();
          break;
        case 'reset':
          if (!selection || background) break;
          if (selection.only) delete map[keyOf()];
          else for (const key of Object.keys(map)) if (key === selection.id || key.startsWith(`${selection.id}#`)) delete map[key];
          selection.only = false;
          reapplyAll();
          commit();
          break;
        case 'set':
          map = structuredClone(msg.layouts || {});
          if (root) { reapplyAll(); if (selection) select(selection.id, selection.index); }
          break;
        default:
      }
    },
  };
}
