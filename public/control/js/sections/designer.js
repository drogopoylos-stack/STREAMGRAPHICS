import { h, setKids, debounce } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { btn, busy, toast, toastError, panel, field, ctlSelect, ctlSegmented, ctlText, ctlNumber, ctlToggle, ctlRange, ctlColor, confirmDialog, openDrawer, closeDrawer } from '../ui.js';
import { DESIGN_FONTS, FONT_ROLES, EMPTY_DESIGN, FRAME_STYLES, BOX_STYLES, TEXT_TOKENS, LAYOUT_LIMITS, screenSlots, normalizeDesign, BG_MOTIONS, BG_SPEEDS, BG_INTENSITIES, resolveBackground, expandDesignText, DESIGN_IMAGES } from '../../../shared/graphic-design.js';
import { IMAGE_KINDS, changeLabel } from '../../../overlay/js/editor-images.js';
import { SCENE_DEFINITIONS, sceneDefinition, dimensionsFor } from '../../../shared/scenes.js';
import { ICON_SETS, ICON_SLOTS, iconSvg } from '../../../shared/icon-sets.js';

import * as teams from './teams.js';
import * as players from './players.js';
import * as matches from './matches.js';
import * as sponsors from './sponsors.js';
import { openManager } from '../tournaments.js';
import { plate } from '../../../overlay/js/ui.js';
import { backgroundPanel as tournamentBackgroundPanel } from '../background-panel.js';

export const id = 'designer';
const STORAGE = 'hll-graphics-designer-draft-v1';
const TABS = ['fonts', 'text', 'layout', 'icons', 'background', 'assets', 'presets'];
let els, library, config, selectedId, presetName, baseline, tab = 'fonts', scene = 'waiting', params = {}, format = 'story', focusSlot = '', previewData, frameReady = false, previewSeq = 0;
const isSocial = (id) => sceneDefinition(id)?.group === 'social';
// HLL Social: the designer shows the social posts and stories only.
const socialEdition = () => store.access?.edition === 'social';
const screens = () => socialEdition() ? SCENE_DEFINITIONS.filter(s => isSocial(s.id)) : SCENE_DEFINITIONS;
let layoutElements = [], layoutSelection = null, history = { past: [], future: [] }, checkpoint, playMotion = false, textEditing = false, pendingAction = null, toolbarTimer, popover = null, pointerDown = false, previewBusy = false, lastCoalesce = { name: '', at: 0 };
const fontOptions = (label = 'Original font') => [{ value: '', label }, ...DESIGN_FONTS.map(f => ({ value: f.id, label: f.name }))];
const fontCss = value => DESIGN_FONTS.find(f => f.id === value)?.css || '"Fira Sans Extra Condensed",sans-serif';
const snapshot = () => JSON.stringify([config, presetName]);
export const isDirty = () => !!els && snapshot() !== baseline;
function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ config, selectedId, presetName, baseline, scene, tab })); } catch { /* Draft stays in memory if storage is unavailable. */ }
}
function record(label = 'Design', coalesce = '') {
  coalesce = coalesce ? `${scene}:${coalesce}` : '';
  const now = Date.now();
  if (!(coalesce && lastCoalesce.name === coalesce && now - lastCoalesce.at < 800)) {
    history.past.push({ label, scene, config: structuredClone(checkpoint || config) });
    if (history.past.length > 100) history.past.shift();
  }
  history.future = []; lastCoalesce = { name: coalesce, at: now };
}
function changed(label = 'Design', coalesce = '') {
  if (JSON.stringify(checkpoint) !== JSON.stringify(config)) record(label, coalesce);
  checkpoint = structuredClone(config);
  previewSeq++;
  if (previewData) previewData.graphicDesign = structuredClone(config);
  persist(); paintStatus(); paintQuick(); queuePreview();
}
function finishEdit(action) { if (textEditing) { pendingAction = action; sendLayout('text-save'); } else action(); }
function selectTab(key) { finishEdit(() => { closePopover(); tab = key; playMotion = key === 'background' && !reducedMotion(); persist(); paintTab(); sendPreview(); }); }
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const queuePreview = debounce(() => void refreshPreview(), 220);

export function mount(root) {
  library = structuredClone(store.state.designLibrary);
  const selected = library.presets.find(p => p.id === (store.state.settings.graphicDesign?.presetId || library.defaultPresetId)) || library.presets[0];
  config = normalizeDesign(selected.config); selectedId = selected.id; presetName = selected.name; baseline = snapshot();
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE));
    if (draft?.config) { config = normalizeDesign(draft.config); selectedId = draft.selectedId; presetName = String(draft.presetName || 'My broadcast').slice(0, 80); baseline = draft.baseline || snapshot(); if (sceneDefinition(draft.scene)) scene = draft.scene; if (TABS.includes(draft.tab)) tab = draft.tab; }
  } catch { /* Ignore an obsolete draft schema. */ }
  if (socialEdition() && !isSocial(scene)) scene = screens()[0].id;
  checkpoint = structuredClone(config); history = { past: [], future: [] }; playMotion = tab === 'background' && !reducedMotion();
  const sceneSelect = ctlSelect({ options: screens().map(s => ({ value: s.id, label: s.label })), value: scene });
  sceneSelect.el.setAttribute('aria-label', 'Preview screen');
  sceneSelect.el.addEventListener('change', () => finishEdit(() => { closePopover(); scene = sceneSelect.get(); focusSlot = ''; format = 'story'; params = {}; clearLayoutState(); setTargetOptions(); frameReady = false; previewData = null; navigateFrame(); paintTab(); persist(); queuePreview(); }));
  const target = ctlSelect(); target.el.setAttribute('aria-label', 'Preview data');
  target.el.addEventListener('change', () => finishEdit(() => { params = targetParams(target.get()); queuePreview(); }));
  const formatPick = ctlSegmented({ options: [{ value: 'story', label: 'Story 1080×1920' }, { value: 'post', label: 'Post 1080×1350' }], value: format, size: 'sm' });
  formatPick.el.setAttribute('aria-label', 'Social format');
  formatPick.el.addEventListener('change', () => finishEdit(() => { format = formatPick.get() || 'story'; params = targetParams(els.target.get()); queuePreview(); }));
  const tabs = h('div.design-tabs', { role: 'tablist', 'aria-label': 'Designer panels' });
  const buttons = TABS.map(key => h('button.design-tab', { type: 'button', role: 'tab', id: `design-tab-${key}`, 'aria-controls': 'design-controls', onclick: () => selectTab(key) }, key[0].toUpperCase() + key.slice(1)));
  tabs.append(...buttons);
  tabs.addEventListener('keydown', e => {
    if (textEditing) return;
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault(); const index = buttons.indexOf(document.activeElement); const count = buttons.length, next = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : (index + (e.key === 'ArrowRight' ? 1 : count - 1)) % count; buttons[next].focus(); buttons[next].click();
  });
  const controls = h('div.design-controls', { id: 'design-controls', role: 'tabpanel' });
  const status = h('span.design-status', { role: 'status' });
  const applied = h('p.field-hint');
  const apply = btn('Apply to current tournament', { kind: 'primary', onclick: () => finishEdit(() => busy(apply, async () => {
    try { await api.put('/api/design/apply', { config, presetId: selectedId, revision: store.state.settings.graphicDesign?.revision || 0 }); await store.load(); paintStatus(); toast('Design applied. Live graphics and new PNG exports use this design.', 'ok'); } catch (e) { toastError(e); }
  })) });
  const saveAs = btn('Save as preset', { onclick: () => finishEdit(() => { selectTab('presets'); els.controls.querySelector('input')?.focus(); }) });
  const reset = btn('Reset draft', { onclick: () => finishEdit(async () => { if (isDirty() && !await confirmDialog({ title: 'Reset this draft?', body: 'Saved presets and applied graphics stay available.', ok: 'Reset draft', danger: false })) return; loadPreset('original', true); }) });
  const frame = h('iframe.design-preview-frame', { title: 'Graphics design preview', scrolling: 'no' });
  const canvas = h('div.design-preview-canvas.checker', frame);
  const previewStatus = h('p.field-hint', { role: 'status' }, 'Loading preview…');
  const quick = h('div.design-quick');
  const toolbar = h('div.design-toolbar', { role: 'toolbar', hidden: true });
  const tip = h('p.design-preview-tip', 'Double-click a text to edit it. Double-click an image or icon to change it.');
  const previewPanel = h('aside.design-preview-panel', panel('Live preview', quick, tip, canvas, toolbar, previewStatus,
    h('p.field-hint', 'Click to select \u00b7 Drag to move \u00b7 Esc selects the parent')));
  const designLayout = h('div.design-layout', controls, previewPanel);
  root.append(h('header.section-head', h('div.section-titles', h('h1.section-title', 'Graphics designer'), h('p.section-sub', 'One editor and preset library for every tournament.')), h('span.design-scope', 'GLOBAL LIBRARY')),
    h('div.design-action-bar', h('div', status, applied), h('div.design-actions', reset, saveAs, apply)), tabs,
    designLayout);
  els = { root, controls, buttons, status, applied, apply, sceneSelect, target, formatPick, canvas, frame, previewStatus, designLayout, quick, toolbar, slotRows: new Map() };
  new ResizeObserver(fitPreview).observe(canvas);
  addEventListener('scroll', placeTools, true); addEventListener('resize', placeTools);
  root.addEventListener('keydown', e => {
    if (e.target.closest('[contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase())) { e.preventDefault(); stepLayout(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo'); }
  });
  document.addEventListener('pointerdown', e => {
    if (toolbar.contains(e.target) || popover?.contains(e.target)) return;
    if (textEditing) sendLayout('text-save'); else closePopover();
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { if (reducedMotion()) playMotion = false; paintQuick(); sendPreview(); });
  ensureMotionCss(); paintQuick();
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'graphic-layout') { onLayoutMessage(event.data); return; }
    if (event.data?.type === 'graphic-design-ready') { frameReady = true; sendLayoutMode(); sendPreview(); }
    if (event.data?.type === 'graphic-design-rendered') { previewBusy = false; paintCurrentTexts(); paintToolbar(); if (!textEditing) els.previewStatus.textContent = previewData?.previewSample ? 'Sample teams and players · preview only' : 'Using selected tournament data · preview only'; }
    if (event.data?.type === 'graphic-design-error') els.previewStatus.textContent = event.data.message;
  });
  setTargetOptions(); navigateFrame(); paintTab(); paintStatus(); void refreshPreview();
}
function targetParams(value) {
  const definition = sceneDefinition(scene);
  const out = isSocial(scene) ? { format: definition.storyOnly ? 'story' : format } : {};
  if (definition.target === 'match') return { ...out, ...(value ? { match: value } : {}) };
  if (definition.target === 'team') return { ...out, ...(value ? { team: value } : {}) };
  if (definition.target === 'feature') return { ...out, ...(value ? { feature: value } : {}) };
  if (definition.target === 'day') return { ...out, day: value || 'today' };
  if (scene === 'bracket') return { ...out, ...(value ? { bracket: value } : {}) };
  return out;
}
function setTargetOptions() {
  const state = store.state, definition = sceneDefinition(scene);
  let options = [{ value: '', label: 'Selected tournament' }];
  if (definition.target === 'match') options = state.matches.map(m => ({ value: m.id, label: `${m.date || 'TBD'} · ${store.team(m.teamA)?.tag || m.teamALabel || 'TBD'} vs ${store.team(m.teamB)?.tag || m.teamBLabel || 'TBD'}` }));
  if (definition.target === 'team') options = state.teams.map(t => ({ value: t.id, label: t.name }));
  if (definition.target === 'feature') options = state.features.map(f => ({ value: f.id, label: f.title || 'Player matchup' }));
  if (definition.target === 'day') options = [{ value: 'all', label: 'Full tournament schedule' }, { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, ...[...new Set(state.matches.map(m => m.date).filter(Boolean))].sort().map(d => ({ value: d, label: d }))];
  if (scene === 'bracket') options = (state.settings.brackets || []).map(b => ({ value: b.id, label: b.name || b.id }));
  if (!options.length) options = [{ value: '', label: 'Sample data / empty state' }];
  els.target.setOptions(options); els.target.set(options[0].value);
  if (els.formatPick) els.formatPick.set(sceneDefinition(scene)?.storyOnly ? 'story' : format);
  params = targetParams(options[0].value);
}
function navigateFrame() { els.frame.src = `/overlay/scene.html?${new URLSearchParams({ scene, designer: '1', static: '1' })}`; fitPreview(); }
function fitPreview() {
  if (!els) return;
  const size = dimensionsFor(scene, params), width = els.canvas.clientWidth;
  els.canvas.style.aspectRatio = `${size.width} / ${size.height}`;
  els.canvas.classList.toggle('is-portrait', size.height > size.width);
  Object.assign(els.frame.style, { width: `${size.width}px`, height: `${size.height}px`, transform: `scale(${width / size.width})` });
  sendLayoutMode(); placeTools();
}
async function refreshPreview() {
  if (!els) return;
  const sequence = ++previewSeq;
  els.previewStatus.textContent = 'Updating preview…';
  try {
    const data = await api.post('/api/design/preview', { scene, params, config });
    if (sequence !== previewSeq) return;
    previewData = data; sendPreview();
  } catch (e) { if (sequence === previewSeq) els.previewStatus.textContent = e.message; }
}
function sendPreview() {
  if (!frameReady || previewData?.scene !== scene) return;
  previewBusy = true; els.toolbar.hidden = true;
  els.frame.contentWindow.postMessage({ type: 'graphic-design-preview', data: previewData, focus: focusSlot, motion: playMotion && !reducedMotion() }, location.origin);
}
function paintStatus() {
  if (!els) return;
  els.status.textContent = `${isDirty() ? 'Draft changes' : 'Saved design'} · ${presetName}`;
  const current = store.state.settings.graphicDesign;
  els.applied.textContent = `${store.state.settings.leagueName}: ${current?.name || 'Original broadcast'} · Presets are shared; applying affects this tournament.`;
}
function paintTab() {
  if (!els) return;
  els.buttons.forEach(button => { const selected = button.id === `design-tab-${tab}`; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
  els.controls.setAttribute('aria-labelledby', `design-tab-${tab}`);
  els.designLayout.classList.add('is-layout');
  els.slotRows.clear();
  setKids(els.controls, tab === 'fonts' ? fontsPanel() : tab === 'text' ? textPanel() : tab === 'layout' ? layoutPanel() : tab === 'icons' ? iconsPanel() : tab === 'background' ? backgroundPanel() : tab === 'assets' ? assetsPanel() : presetsPanel());
  paintCurrentTexts();
  paintQuick();
  fitPreview();
}
// ---------- Layout tab: the drag and resize work runs in the preview (overlay/js/layout-editor.js) ----------
function sendLayout(action, body = {}) {
  if (frameReady) els.frame.contentWindow.postMessage({ type: 'graphic-layout', action, ...body }, location.origin);
}
function sendLayoutMode() {
  if (!els) return;
  const width = dimensionsFor(scene, params).width;
  sendLayout('mode', { enabled: true, viewScale: els.canvas.clientWidth / width || 1 });
}
function clearLayoutState() { layoutElements = []; layoutSelection = null; if (els) els.toolbar.hidden = true; }
const currentLayouts = () => config.layouts?.[scene] || {};
function storeLayouts(layouts, label = `Move · ${layoutSelection?.label || 'Element'}`, coalesce = '') {
  config.layouts ||= {};
  if (Object.keys(layouts).length) config.layouts[scene] = layouts; else delete config.layouts[scene];
  // Later preview refreshes must not bring back the old positions.
  if (previewData?.graphicDesign) previewData.graphicDesign.layouts = structuredClone(config.layouts);
  changed(label, coalesce);
}
function onLayoutMessage(message) {
  if (message.action === 'open') { layoutSelection = message.selection; openSelection(); }
  if (message.action === 'hide') hideSlot(message.slot);
  if (message.action === 'toolbar-focus') els.toolbar.querySelector('button')?.focus();
  if (message.action === 'pointer') { clearTimeout(toolbarTimer); pointerDown = true; els.toolbar.hidden = true; if (!message.down) toolbarTimer = setTimeout(() => { pointerDown = false; paintToolbar(); }, 120); }
  if (message.action === 'text-commit') {
    const def = screenSlots(scene).find(s => s.id === message.slot);
    const prev = config.screens[scene]?.[message.slot] || {};
    config.screens[scene] ||= {};
    config.screens[scene][message.slot] = { enabled: prev.enabled ?? true, text: message.text, font: prev.font || '', size: prev.size || 0 };
    changed(`Edit text \u00b7 ${def.label}`);
    if (tab === 'text') paintTab();
  }
  if (message.action === 'text-editing') {
    textEditing = message.editing;
    els.previewStatus.textContent = textEditing ? `Editing ${message.label} \u00b7 Enter to save \u00b7 Esc to cancel` : message.saved ? `Saved: ${message.label}` : 'Cancelled';
    if (textEditing && message.bubble) textBubble(message);
    if (!textEditing) { closePopover(); paintToolbar(); const next = pendingAction; pendingAction = null; next?.(); }
  }
  if (message.action === 'text-error') { els.previewStatus.textContent = message.message; pendingAction = null; }
  if (message.action === 'notice') toast(message.message);

  if (message.action === 'elements') { layoutElements = message.elements; paintLayoutList(); }
  if (message.action === 'selected' || message.action === 'live') { layoutSelection = message.selection; if (layoutSelection?.slot) focusSlot = layoutSelection.slot; paintLayoutSelection(); paintToolbar(); if (message.action === 'selected') { linkTextCard(); paintLayoutList(); } }
  if (message.action === 'history') stepLayout(message.direction);
  if (message.action === 'changed') {
    const before = currentLayouts();
    if (JSON.stringify(before) === JSON.stringify(message.layouts)) return;
    // Arrow-key steps within a moment are one undo step.
    storeLayouts(message.layouts, `${message.kind === 'resize' ? 'Resize' : 'Move'} · ${layoutSelection?.label || 'Element'}`, message.coalesce || '');
    paintLayoutList();
  }
}
function stepLayout(direction) {
  finishEdit(() => {
    const [from, to] = direction === 'redo' ? [history.future, history.past] : [history.past, history.future];
    if (!from.length) return;
    const entry = from.pop(); to.push({ label: entry.label, scene: entry.scene, config: structuredClone(config) });
    config = structuredClone(entry.config); checkpoint = structuredClone(config);
    if (scene !== entry.scene) showScene(entry.scene);
    sendLayout('set', { layouts: currentLayouts() });
    if (previewData) previewData.graphicDesign = structuredClone(config);
    persist(); paintTab(); paintStatus(); paintQuick(); queuePreview();
    toast(`${direction === 'redo' ? 'Redone' : 'Undone'}: ${entry.label}`, 'ok', { timeout: 2000 });
  });
}

function layoutPanel() {
  const fields = {
    x: ctlNumber({ allowEmpty: true, min: -LAYOUT_LIMITS.offset, max: LAYOUT_LIMITS.offset, placeholder: '0' }),
    y: ctlNumber({ allowEmpty: true, min: -LAYOUT_LIMITS.offset, max: LAYOUT_LIMITS.offset, placeholder: '0' }),
    w: ctlNumber({ allowEmpty: true, min: LAYOUT_LIMITS.minSize, max: LAYOUT_LIMITS.maxSize, placeholder: 'Original' }),
    h: ctlNumber({ allowEmpty: true, min: LAYOUT_LIMITS.minSize, max: LAYOUT_LIMITS.maxSize, placeholder: 'Original' }),
    s: ctlNumber({ allowEmpty: true, min: LAYOUT_LIMITS.minScale * 100, max: LAYOUT_LIMITS.maxScale * 100, placeholder: '100' }),
  };
  const send = (key, get) => fields[key].el.addEventListener('change', () => {
    const raw = fields[key].get();
    const limit = { x: [-LAYOUT_LIMITS.offset, LAYOUT_LIMITS.offset], y: [-LAYOUT_LIMITS.offset, LAYOUT_LIMITS.offset], w: [LAYOUT_LIMITS.minSize, LAYOUT_LIMITS.maxSize], h: [LAYOUT_LIMITS.minSize, LAYOUT_LIMITS.maxSize], s: [LAYOUT_LIMITS.minScale, LAYOUT_LIMITS.maxScale] }[key];
    const value = raw == null ? 0 : Math.min(limit[1], Math.max(limit[0], get(raw)));
    sendLayout('update', { patch: { [key]: key === 's' && raw == null ? 1 : value } });
  });
  for (const key of ['x', 'y', 'w', 'h']) send(key, v => v);
  send('s', v => v / 100);
  const only = ctlToggle({ value: false, label: 'Only this one', hint: 'Off: all elements of this kind move together.' });
  only.el.addEventListener('change', () => sendLayout('scope', { only: only.get() }));
  const name = h('p.layout-selected-name');
  const empty = h('p.field-hint', 'Click an element in the preview, or choose one in the list below.');
  const scope = h('div.field', only.el);
  const parentButton = btn('Select parent', { size: 'sm', onclick: () => { if (layoutSelection?.parent) sendLayout('select', layoutSelection.parent); } });
  const resetButton = btn('Reset element', { size: 'sm', onclick: () => sendLayout('reset') });
  const sizeFields = [field('Width in pixels', fields.w), field('Height in pixels', fields.h)];
  const editor = h('div', name, scope,
    h('div.layout-fields', field('Move X in pixels', fields.x), field('Move Y in pixels', fields.y), ...sizeFields, field('Scale in percent', fields.s)),
    h('div.design-actions', { style: { marginTop: '12px' } }, parentButton, resetButton));
  const list = h('div.layout-list', { role: 'listbox', 'aria-label': 'Elements on this screen' });
  const undo = btn('Undo', { size: 'sm', onclick: () => stepLayout('undo') });
  const redo = btn('Redo', { size: 'sm', onclick: () => stepLayout('redo') });
  const resetAll = btn('Reset this screen', { size: 'sm', onclick: async () => {
    if (!Object.keys(currentLayouts()).length || !await confirmDialog({ title: 'Reset this screen?', body: 'All elements of this screen go back to the original place and size. Undo can restore them.', ok: 'Reset screen', danger: false })) return;
    storeLayouts({}, 'Reset screen'); sendLayout('set', { layouts: {} }); paintLayoutList();
  } });
  els.layout = { fields, only, name, empty, scope, editor, parentButton, sizeFields, list, undo, redo };
  const stack = h('div.design-stack',
    panel('Selected element', h('p.panel-sub', `${sceneDefinition(scene).label} · Each screen has its own layout.`), empty, editor),
    panel('Elements on this screen', h('div.design-actions', undo, redo, resetAll), list),
    panel('How to edit', h('ul.layout-hints', h('li', 'Drag an element to move it. Guides show the alignment. Hold Alt to turn them off.'), h('li', 'Drag a corner to scale. Drag a side to change the width or height.'), h('li', 'Double-click a text to edit it. Double-click an image or icon to change it. Esc selects the parent.'), h('li', 'Use the arrow keys for 1 px steps. Add Shift for 10 px.'), h('li', 'Ctrl+Z undoes a change. An element inside a card stays inside the edge of that card.'))));
  paintLayoutSelection(); paintLayoutList();
  return stack;
}
function paintLayoutSelection() {
  const ui = tab === 'layout' && els?.layout;
  if (!ui) return;
  const selection = layoutSelection?.id === 'background' ? null : layoutSelection;
  ui.empty.hidden = !!selection; ui.editor.hidden = !selection;
  if (!selection) return;
  ui.name.textContent = selection.count > 1 ? `${selection.label} · ${selection.index + 1} of ${selection.count}` : selection.label;
  ui.scope.hidden = selection.count < 2;
  ui.only.set(selection.only);
  ui.parentButton.disabled = !selection.parent;
  ui.sizeFields.forEach(row => { row.hidden = selection.fixed; });
  const show = (key, value) => { if (document.activeElement !== ui.fields[key].el) ui.fields[key].set(value); };
  show('x', selection.value.x || null); show('y', selection.value.y || null);
  show('w', selection.value.w ? selection.value.w : null); show('h', selection.value.h ? selection.value.h : null);
  ui.fields.w.el.placeholder = String(selection.width); ui.fields.h.el.placeholder = String(selection.height);
  show('s', selection.value.s ? Math.round(selection.value.s * 1000) / 10 : null);
}
function paintLayoutList() {
  const ui = tab === 'layout' && els?.layout;
  if (!ui) return;
  const layouts = currentLayouts();
  ui.undo.disabled = !history.past.length; ui.redo.disabled = !history.future.length;
  ui.undo.title = `Undo${history.past.length ? ': ' + history.past.at(-1).label : ''}`;
  ui.redo.title = `Redo${history.future.length ? ': ' + history.future.at(-1).label : ''}`;
  const changed = id => Object.keys(layouts).some(key => key === id || key.startsWith(`${id}#`));
  setKids(ui.list, layoutElements.length ? layoutElements.map(element => h('button.layout-item', {
    type: 'button', role: 'option', 'aria-selected': String(layoutSelection?.id === element.id), class: layoutSelection?.id === element.id ? 'is-selected' : '',
    style: { paddingLeft: `${9 + element.depth * 14}px` }, onclick: () => sendLayout('select', { id: element.id, index: layoutSelection?.id === element.id ? layoutSelection.index : 0 }),
  }, h('span', {}, element.label), h('span.layout-item-meta', element.count > 1 ? `×${element.count}` : null, changed(element.id) ? h('i.layout-item-dot', { title: 'Changed' }) : null))) : h('p.field-hint', 'Loading the elements of this screen…'));
}
function fontsPanel() {
  return h('div.design-stack', panel('Font roles', h('p.panel-sub', 'Choose fonts by purpose. Each card shows where that font appears across the screens. Original font preserves each layout’s typography.')),
    ...FONT_ROLES.map(role => {
      const select = ctlSelect({ options: fontOptions(), value: config.fonts[role.id] });
      const sample = h('div.design-font-example', { style: { fontFamily: fontCss(config.fonts[role.id]) } }, role.example);
      const greek = h('div.design-font-greek', { style: { fontFamily: fontCss(config.fonts[role.id]) } }, 'Ελληνικά · Αγώνες · Ομάδες 2026');
      select.el.setAttribute('aria-label', `${role.name} font`);
      select.el.addEventListener('change', () => { config.fonts[role.id] = select.get() || ''; sample.style.fontFamily = greek.style.fontFamily = fontCss(select.get()); changed(`Font \u00b7 ${role.name}`); });
      return panel(role.name, h('p.panel-sub', role.hint), sample, greek, field('Font family', select));
    }));
}
function textPanel() {
  const cards = screenSlots(scene).map(slot => {
    const value = config.screens[scene]?.[slot.id] || {};
    const enabled = ctlToggle({ value: value.enabled !== false, label: slot.label });
    const current = h('p.design-current-text');
    const input = slot.editable ? ctlText({ value: value.text || '', placeholder: slot.example || 'Automatic / original text', maxlength: 500 }) : null;
    const font = ctlSelect({ value: value.font || '', options: fontOptions('Use font role') });
    const size = ctlNumber({ value: value.size || null, allowEmpty: true, min: 10, max: 260, placeholder: 'Original' });
    const save = () => {
      config.screens[scene] ||= {};
      config.screens[scene][slot.id] = { enabled: enabled.get(), text: input?.get() || '', font: font.get() || '', size: size.get() || 0 };
      changed(`Edit text \u00b7 ${slot.label}`, `text:${slot.id}`);
    };
    const el = panel('', enabled.el, current, input ? field('Text · blank keeps automatic text', input) : h('p.field-hint', 'Names, scores and dates come from tournament data. Control their visibility and font here.'),
      h('div.design-field-pair', field('Font', font), field('Size in pixels', size)));
    el.dataset.slot = slot.id;
    el.addEventListener('input', save); el.addEventListener('change', save);
    el.addEventListener('focusin', () => { if (focusSlot !== slot.id) { focusSlot = slot.id; sendLayout('select-slot', { slot: slot.id }); } });
    els.slotRows.set(slot.id, { el, current, size });
    return el;
  });
  return h('div.design-stack', panel('Text & visibility', h('p.panel-sub', `${sceneDefinition(scene).label} · Switch the preview screen above to edit another category.`), h('p.field-hint', 'Reusable text tokens: ', TEXT_TOKENS.map(token => h('code.design-token', `{${token}}`)))), cards);
}
function paintCurrentTexts() {
  if (!els || !frameReady) return;
  const doc = els.frame.contentDocument;
  for (const [id, row] of els.slotRows) {
    const node = [...(doc?.querySelectorAll('[data-design-slot]') || [])].find(n => n.dataset.designSlot === id);
    row.current.textContent = node ? `Preview: ${node.textContent.trim().slice(0, 120) || '(empty)'}` : 'Not shown with the current data / layout. These choices are saved for later use.';
    row.el.classList.toggle('is-unavailable', !node);
  }
}
const iconGlyph = (setId, slot, title) => h('span.icon-glyph', { title, html: iconSvg(setId, slot) });
function showScene(id) {
  els.sceneSelect.set(id);
  els.sceneSelect.el.dispatchEvent(new Event('change', { bubbles: true }));
}
function iconsPanel() {
  const custom = config.assets.customIcons;
  const sets = h('div.icon-set-grid', { role: 'radiogroup', 'aria-label': 'Icon style' }, ICON_SETS.map(set => h('button.icon-set', {
    type: 'button', role: 'radio', 'aria-checked': String(config.assets.icons === set.id),
    onclick: () => { config.assets.icons = set.id; cleanIconPicks(); changed('Icon ? All icons'); paintTab(); },
  }, h('strong', {}, set.name), h('span.icon-set-hint', set.hint), h('div.icon-set-row', ICON_SLOTS.map(slot => iconGlyph(set.id, slot.id, slot.label))))));
  const see = h('div.icon-see', (socialEdition() ? ['social-roster', 'social-versus', 'social-bracket'] : ['roster', 'versus', 'bracket']).map(id => btn(`Show ${sceneDefinition(id).label}`, { size: 'sm', onclick: () => showScene(id) })));
  const tint = ctlToggle({ value: config.assets.iconTint, label: 'Use the theme colour', hint: 'For one-colour icons. Off keeps the colours of your files. The tournament emblem always keeps its colours.' });
  tint.el.addEventListener('change', () => { config.assets.iconTint = tint.get(); changed('Icon ? Theme colour'); });
  const rows = ICON_SLOTS.map(slot => {
    const input = h('input', { type: 'file', accept: 'image/png,image/svg+xml,image/webp,image/jpeg', hidden: true, 'aria-label': `Upload icon: ${slot.label}` });
    const upload = btn(custom[slot.id] ? 'Replace' : 'Upload', { size: 'sm', onclick: () => input.click() });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      busy(upload, async () => {
        try {
          const form = new FormData();
          form.append('file', file);
          const { url } = await api.post('/api/design/icons', form);
          config.assets.customIcons[slot.id] = url;
          changed(`Icon \u00b7 ${slot.label}`); paintTab();
        } catch (e) { toastError(e); }
      });
    });
    const remove = custom[slot.id] ? btn('Remove', { size: 'sm', onclick: () => { delete config.assets.customIcons[slot.id]; changed(`Icon \u00b7 ${slot.label}`); paintTab(); } }) : null;
    const preview = custom[slot.id] ? h('span.icon-glyph', h('img', { src: custom[slot.id], alt: '' })) : iconGlyph(config.assets.iconPicks?.[slot.id] || config.assets.icons, slot.id, slot.label);
    return h('div.icon-custom', h('span.icon-custom-preview', preview), h('div', h('div.icon-custom-name', slot.label), h('div.icon-custom-hint', custom[slot.id] ? `Your icon · ${slot.hint}` : slot.hint)), h('div.design-actions', input, upload, remove));
  });
  return h('div.design-stack',
    panel('Icon style', h('p.panel-sub', 'Choose the icons for all screens. Select a screen below to see the icons in the preview.'), see, sets),
    panel('Your own icons', h('p.panel-sub', 'Upload a PNG, SVG, WebP or JPEG for any icon. Your icon replaces that icon of the style above. Use a transparent background.'), h('div.field', tint.el), h('div.icon-custom-list', rows)));
}
function assetsPanel() {
  const cards = (key, values) => h('div.design-choice-grid', { role: 'radiogroup', 'aria-label': key === 'frame' ? 'Frame style' : 'Box style' }, values.map(value => {
    const b = h('button.design-asset-choice', { type: 'button', role: 'radio', 'aria-checked': String(config.assets[key] === value), dataset: { asset: value }, onclick: () => { config.assets[key] = value; changed('Design \u00b7 ' + key); paintTab(); } },
      h(`div.design-asset-sample.${key === 'frame' ? 'frame' : 'box'}-${value}`, h('span', {}, key === 'frame' ? 'HLL' : 'PHX  vs  VTX')), h('span', {}, value[0].toUpperCase() + value.slice(1)));
    return b;
  }));
  const radius = ctlRange({ min: 0, max: 36, step: 1, value: config.assets.radius, fmt: v => `${v}px` });
  const opacity = ctlRange({ min: 20, max: 100, step: 1, value: config.assets.opacity, fmt: v => `${v}%` });
  for (const [key, ctl] of [['radius', radius], ['opacity', opacity]]) ctl.el.addEventListener('input', () => { config.assets[key] = ctl.get(); changed('Design \u00b7 ' + key, 'range:' + key); });
  const color = key => {
    const use = ctlToggle({ value: !!config.assets[key], label: key === 'accent' ? 'Override primary accent' : 'Override highlight accent' });
    const picker = ctlColor({ value: config.assets[key] || store.state.settings.theme[key] });
    const update = () => { config.assets[key] = use.get() ? picker.get() : ''; changed(); };
    use.el.addEventListener('change', update); picker.el.addEventListener('input', update);
    return h('div.design-color', use.el, picker.el);
  };
  return h('div.design-stack', panel('Screen border', h('p.panel-sub', 'Frame overlays for landscape and portrait graphics. Decorative borders inside background images remain part of the image.'), cards('frame', FRAME_STYLES)),
    panel('Boxes & panels', h('p.panel-sub', 'Choose a finish for match rows, rosters, brackets, sponsor tiles and information boxes.'), cards('boxes', BOX_STYLES), field('Corner radius · custom box styles', radius), field('Fill opacity · glass / solid boxes', opacity)),
    panel('Accent colours', h('p.panel-sub', 'Keep tournament colours, or save accent overrides in this preset. Background images and motion: see the Background tab.'), color('accent'), color('accent2')));
}
function presetsPanel() {
  const name = ctlText({ value: presetName, maxlength: 80, placeholder: 'My broadcast style' });
  name.el.setAttribute('aria-label', 'Preset name');
  name.el.addEventListener('input', () => { presetName = name.get(); persist(); paintStatus(); });
  const selected = library.presets.find(p => p.id === selectedId);
  const saveButton = btn('Save new preset', { kind: 'primary', onclick: () => savePreset(false, saveButton) });
  const updateButton = btn('Update selected preset', { disabled: !selected || selected.builtin, onclick: () => savePreset(true, updateButton) });
  const reload = btn('Refresh library', { onclick: async () => { try { library = await api.get('/api/design/presets'); paintTab(); } catch (e) { toastError(e); } } });
  return h('div.design-stack', panel('Save this design for later', h('p.panel-sub', 'Presets include fonts, text, visibility, element layout, icons and frame / box choices for every screen category. Saving a preset does not change applied graphics.'), field('Preset name', name), h('div.design-actions', saveButton, updateButton)),
    panel('Shared preset library', h('p.panel-sub', 'Load any preset into this editor. Applied tournaments keep their own saved copy, even if the library preset changes or is deleted.'), reload,
      h('div.design-preset-list', library.presets.map(p => h('article.design-preset', { class: p.id === selectedId ? 'is-selected' : '' }, h('div', h('strong', {}, p.name), h('p.field-hint', p.builtin ? 'Built-in · save a copy to customize' : 'Your reusable preset'), p.id === library.defaultPresetId ? h('span.badge', {}, 'NEW TOURNAMENT DEFAULT') : null),
        h('div.design-actions', btn('Load', { size: 'sm', onclick: () => loadPreset(p.id) }),
          btn('Use for new tournaments', { size: 'sm', disabled: p.id === library.defaultPresetId, onclick: async () => { try { library = await api.put('/api/design/default', { presetId: p.id, revision: library.revision }); await store.load(); paintTab(); toast('Default saved for tournaments created from now on.', 'ok'); } catch (e) { toastError(e); } } }),
          !p.builtin ? btn('Delete', { size: 'sm', onclick: async () => { if (!await confirmDialog({ title: `Delete ${p.name}?`, body: 'Already applied tournament designs stay available.' })) return; try { library = await api.del(`/api/design/presets/${p.id}`, { revision: library.revision }); if (selectedId === p.id) { selectedId = null; persist(); } await store.load(); paintTab(); } catch (e) { toastError(e); } } }) : null))))));
}
async function savePreset(overwrite, button) {
  if (textEditing) { finishEdit(() => savePreset(overwrite, button)); return; }
  await busy(button, async () => {
    try {
      const body = { config, name: presetName, revision: library.revision };
      const result = overwrite ? await api.put(`/api/design/presets/${selectedId}`, body) : await api.post('/api/design/presets', body);
      library = result.library; selectedId = result.preset.id; config = normalizeDesign(result.preset.config); checkpoint = structuredClone(config); presetName = result.preset.name; baseline = snapshot(); persist(); await store.load(); paintTab(); paintStatus(); toast('Preset saved to the shared library.', 'ok');
    } catch (e) { toastError(e); }
  });
}
async function loadPreset(id, replace = false) {
  if (textEditing) { finishEdit(() => loadPreset(id, replace)); return; }
  const preset = library.presets.find(p => p.id === id);
  if (!preset) return;
  if (!replace && isDirty() && !await confirmDialog({ title: 'Replace this draft?', body: 'Your saved presets stay available.', ok: 'Load preset', danger: false })) return;
  config = normalizeDesign(preset.config); selectedId = preset.id; presetName = preset.name; baseline = snapshot(); focusSlot = ''; history = { past: [], future: [] }; checkpoint = structuredClone(config); persist(); paintTab(); paintStatus(); queuePreview();
}
export async function save() { if (els) finishEdit(() => { selectTab('presets'); els.controls.querySelector('input')?.focus(); }); }
export function update() { if (els) { paintStatus(); queuePreview(); } }

function cleanIconPicks() { for (const [slot, set] of Object.entries(config.assets.iconPicks)) if (set === config.assets.icons) delete config.assets.iconPicks[slot]; }
function ensureMotionCss() {
  if (!document.querySelector('link[data-designer-motion]')) document.head.append(h('link', { rel: 'stylesheet', href: '/overlay/css/bg-anim.css', 'data-designer-motion': '' }));
}
function setBackground(patch, global = false) {
  if (global) Object.assign(config.backgrounds.default, patch);
  else config.backgrounds.screens[scene] = { ...config.backgrounds.screens[scene], ...patch };
  config = normalizeDesign(config);
  changed(`Background · ${patch.motion || ('show' in patch ? patch.show ? 'On' : 'Off' : Object.values(patch)[0])}`);
  paintQuick(); if (tab === 'background') paintTab();
}
const titleCase = value => value[0].toUpperCase() + value.slice(1);
function paintQuick() {
  if (!els) return;
  const bg = resolveBackground(config, scene);
  const undo = btn('↶ Undo', { size: 'sm', disabled: !history.past.length, onclick: () => stepLayout('undo') });
  const redo = btn('↷ Redo', { size: 'sm', disabled: !history.future.length, onclick: () => stepLayout('redo') });
  undo.title = `Undo${history.past.length ? ': ' + history.past.at(-1).label : ''}`;
  redo.title = `Redo${history.future.length ? ': ' + history.future.at(-1).label : ''}`;
  const motion = ctlSelect({ value: bg.motion, options: BG_MOTIONS.map(value => ({ value, label: titleCase(value) })) });
  motion.el.setAttribute('aria-label', 'Motion on this screen');
  motion.el.addEventListener('change', () => finishEdit(() => setBackground({ motion: motion.get() })));
  const toggle = value => h('button.design-bg-toggle', { type: 'button', 'aria-pressed': String(bg.show === value), 'aria-label': `Background ${value ? 'On' : 'Off'}`, onclick: () => finishEdit(() => setBackground({ show: value })) }, value ? 'On' : 'Off');
  const play = btn(playMotion ? '❚❚ Pause motion' : '▶ Play motion', { size: 'sm', disabled: reducedMotion(), onclick: () => finishEdit(() => { playMotion = !playMotion; paintQuick(); sendPreview(); }) });
  play.title = reducedMotion() ? 'Motion is paused because your system has reduced motion on.' : 'Preview motion';
  setKids(els.quick, field('Screen', els.sceneSelect), field('Data', els.target), isSocial(scene) ? field('Format', els.formatPick) : null, h('div.design-actions', undo, redo),
    h('div.design-bg-switch', h('span', 'Background'), toggle(true), toggle(false)), field('Motion', motion), play,
    reducedMotion() ? h('span.field-hint', 'Motion is paused because your system has reduced motion on.') : null);
}
function backgroundPanel() {
  const bg = resolveBackground(config, scene), defaults = config.backgrounds.default;
  const descriptions = { none: 'Still image.', drift: 'A slow cinematic push across the image.', rays: 'Soft light rays from above that sway and breathe.', embers: 'Warm sparks rising from the floor.' };
  const controls = (value, global) => {
    const show = ctlToggle({ value: value.show, label: 'Show the background image' });
    show.el.addEventListener('change', () => setBackground({ show: show.get() }, global));
    const motions = h('div.design-motion-grid', { role: 'radiogroup', 'aria-label': global ? 'Motion for all screens' : 'Motion for this screen' }, BG_MOTIONS.map(motion => {
      const mini = h('span.design-motion-mini', h('span.design-motion-stage', plate(store.state.settings.theme, 'main', { bg: true, bgMotion: motion, bgSpeed: value.speed, bgIntensity: value.intensity })));
      return h('button.design-motion-card', { type: 'button', role: 'radio', 'aria-checked': String(value.motion === motion), onclick: () => setBackground({ motion }, global) }, mini, h('strong', titleCase(motion)), h('span.field-hint', descriptions[motion]));
    }));
    const select = (key, options) => {
      const ctl = ctlSelect({ value: value[key], options: options.map(v => ({ value: v, label: titleCase(v) })) });
      ctl.el.setAttribute('aria-label', `${titleCase(key)} for ${global ? 'all screens' : 'this screen'}`);
      ctl.el.addEventListener('change', () => setBackground({ [key]: ctl.get() }, global));
      return field(titleCase(key), ctl);
    };
    const levels = h('div.design-field-pair', select('speed', BG_SPEEDS), select('intensity', BG_INTENSITIES)); levels.hidden = value.motion === 'none';
    return h('div', show.el, h('p.field-hint', 'Off makes the graphic transparent, ready to place over gameplay or a camera. Any URL with bg=0 is always transparent.'), motions,
      h('p.field-hint', socialEdition() ? 'Motion plays in the MP4 video export and in the animation preview. PNG exports show a still frame.' : 'Motion plays in OBS and on live.html. PNG exports show a still frame.'), levels);
  };
  const custom = !!config.backgrounds.screens[scene];
  const mode = h('div.design-actions', ['Same as all screens', 'Custom for this screen'].map((label, i) => h('label.design-radio', h('input', { type: 'radio', name: 'background-scope', checked: custom === !!i, onchange: () => {
    if (i) config.backgrounds.screens[scene] = { ...bg }; else delete config.backgrounds.screens[scene];
    changed('Background · Screen override'); paintTab();
  } }), label)));
  const rows = screens().map(def => {
    const value = resolveBackground(config, def.id);
    return h('div.design-background-row', btn(def.label, { size: 'sm', onclick: () => showScene(def.id) }), h('span.field-hint', !value.show ? 'Off' : `${config.backgrounds.screens[def.id] ? 'Custom' : 'Default'} · ${titleCase(value.motion)}`),
      !value.show ? btn('Show', { size: 'sm', onclick: () => { config.backgrounds.screens[def.id] = { ...config.backgrounds.screens[def.id], show: true }; config = normalizeDesign(config); changed('Background · Show'); paintTab(); } }) : null);
  });
  return h('div.design-stack', panel('All screens', controls(defaults, true)), panel(`This screen · ${sceneDefinition(scene).label}`, mode, custom ? controls(bg, false) : null),
    panel('All screens at a glance', rows), panel('Images', h('p.panel-sub', 'The pictures behind the graphics belong to the tournament.'), btn('Change images…', { onclick: openBackgroundImages })));
}
async function openBackgroundImages() {
  closePopover(); const panel = tournamentBackgroundPanel();
  await openDrawer({ key: 'designer-backgrounds', title: 'Background images', subtitle: 'Saved to the tournament right away, not part of this design draft.', body: panel.el, onState: panel.update, onClose: queuePreview });
}
function linkTextCard() {
  for (const [id, row] of els.slotRows) row.el.classList.toggle('is-focused', id === focusSlot);
  if (tab === 'text' && focusSlot) els.slotRows.get(focusSlot)?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function hideSlot(slot = layoutSelection?.slot) {
  if (!slot) return;
  const def = screenSlots(scene).find(s => s.id === slot);
  config.screens[scene] ||= {};
  config.screens[scene][slot] = { text: '', font: '', size: 0, ...config.screens[scene][slot], enabled: false };
  changed(`Hide · ${def.label}`); closePopover(); if (tab === 'text') paintTab();
}
function fontAndSize() {
  const slot = layoutSelection?.slot;
  finishEdit(() => { selectTab('text'); focusSlot = slot; linkTextCard(); els.slotRows.get(slot)?.size.el.focus(); });
}
function placeTools() {
  if (!els || !layoutSelection?.rect) return;
  const canvas = els.canvas.getBoundingClientRect(), r = layoutSelection.rect, scale = els.canvas.clientWidth / dimensionsFor(scene, params).width;
  const place = (el, gap = 8) => {
    if (!el || el.hidden) return;
    el.style.maxWidth = `${Math.max(160, canvas.width - 16)}px`;
    if (el === popover) el.style.maxHeight = `${Math.max(160, Math.min(innerHeight * .8, canvas.height - 16))}px`;
    const width = el.offsetWidth, height = el.offsetHeight;
    const left = Math.max(canvas.left + 8, Math.min(canvas.right - width - 8, canvas.left + (r.x + r.w / 2) * scale - width / 2));
    let top = canvas.top + r.y * scale - height - gap;
    if (top < canvas.top + 8) top = canvas.top + (r.y + r.h) * scale + gap;
    top = Math.max(canvas.top + 8, Math.min(canvas.bottom - height - 8, top));
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, maxWidth: `${Math.max(160, canvas.width - 16)}px` });
  };
  place(els.toolbar); place(popover, 50);
}
function tool(label, glyph, action) { return h('button', { type: 'button', title: label, 'aria-label': label, onclick: action }, glyph); }
/** A toolbar button that shows its words: the main action of an image ("Change image…"). */
function textTool(label, action) { return h('button.design-tool-text', { type: 'button', onclick: action }, label); }
const isImage = kind => IMAGE_KINDS.includes(kind);
function paintToolbar() {
  if (!els) return;
  const s = layoutSelection, bar = els.toolbar;
  if (!s || pointerDown || previewBusy) { bar.hidden = true; return; }
  const buttons = [];
  // A click on an image inside a larger selected element keeps that element selected; it still offers the image.
  if (s.image && !isImage(s.kind)) buttons.push(textTool(changeLabel(s.image.kind), () => finishEdit(() => openSelection({ ...s, ...s.image, image: null }))));
  if (s.kind === 'text' || s.kind === 'data') {
    buttons.push(tool(s.editable ? 'Edit text' : 'Where does this come from?', s.editable ? '✎' : 'ⓘ', () => s.editable ? sendLayout('edit') : openSelection()));
    if (s.editable) {
      buttons.push(tool('Insert token', '{…}', tokenMenu));
      if (config.screens[scene]?.[s.slot]?.text) buttons.push(tool('Automatic text', '↺', () => finishEdit(() => { const value = config.screens[scene][s.slot]; value.text = ''; changed(`Edit text · ${s.label}`); })));
    }
    buttons.push(tool('Font & size…', 'Aa', fontAndSize), tool('Hide', '◌', () => finishEdit(() => hideSlot())));
  } else if (s.kind === 'icon') {
    const tint = tool('Theme colour', '◐', () => { config.assets.iconTint = !config.assets.iconTint; changed(`Icon · ${s.icon}`); }); tint.setAttribute('aria-pressed', String(config.assets.iconTint));
    buttons.push(textTool(changeLabel('icon'), () => openSelection()), tint);
    if (s.hideSlot) buttons.push(tool('Hide', '◌', () => hideSlot(s.hideSlot)));
  } else if (isImage(s.kind)) {
    buttons.push(textTool(changeLabel(s.kind), () => openSelection()));
    if (['team', 'player', 'sponsor'].includes(s.kind) && s.ref && !previewData?.previewSample) buttons.push(tool(`Edit ${s.kind}…`, '✎', () => editRecord(s.ref)));
  } else if (s.kind === 'background') {
    const bg = resolveBackground(config, scene);
    const show = tool('Show on this screen', bg.show ? 'On' : 'Off', () => setBackground({ show: !bg.show })); show.setAttribute('aria-pressed', String(bg.show));
    buttons.push(show, tool('Motion', '▶', motionMenu), tool('Change image…', '↥', openBackgroundImages), tool('Background settings', '⚙', () => selectTab('background')));
  } else {
    if (s.count > 1) { const scope = tool('Only this one', '①', () => sendLayout('scope', { only: !s.only })); scope.setAttribute('aria-pressed', String(!!s.only)); buttons.push(scope); }
    buttons.push(tool('Reset position', '↺', () => sendLayout('reset')));
  }
  if (s.parent) buttons.push(tool('Select parent', '↑', () => sendLayout('parent')));
  bar.setAttribute('aria-label', `${s.label} tools`);
  setKids(bar, h('span.design-tool-label', s.label), buttons);
  buttons.forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
  bar.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); els.frame.focus(); }
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const i = buttons.indexOf(document.activeElement), next = (i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length; buttons.forEach((b, j) => b.tabIndex = j === next ? 0 : -1); buttons[next].focus(); }
  };
  bar.hidden = false; placeTools();
}
function closePopover(refocus = false) { popover?.remove(); popover = null; if (refocus) els.frame.focus(); }
function dialog(title, ...content) {
  closePopover();
  const heading = h('h3', { id: 'design-pop-title' }, title);
  popover = h('div.design-popover', { role: 'dialog', 'aria-labelledby': heading.id }, h('header', heading, tool('Close', '×', () => { if (textEditing) sendLayout('text-cancel'); else closePopover(true); })), ...content);
  document.body.append(popover);
  popover.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (textEditing) sendLayout('text-cancel'); else closePopover(true); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target.matches('[role=radio]')) {
      e.preventDefault(); const choices = [...e.target.closest('[role=radiogroup]').querySelectorAll('[role=radio]')], i = choices.indexOf(e.target), next = choices[(i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : choices.length - 1)) % choices.length]; next.focus(); next.click();
    }
  });
  placeTools(); popover.querySelector('input,button,select')?.focus(); return popover;
}
function textBubble(message) {
  layoutSelection = message.selection;
  const input = h('input.input', { value: message.text, maxlength: 500, 'aria-label': `${message.label} text` });
  input.addEventListener('input', () => sendLayout('text-input', { text: input.value }));
  input.addEventListener('paste', e => {
    e.preventDefault(); const text = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
    const value = input.value.slice(0, input.selectionStart) + text + input.value.slice(input.selectionEnd);
    if (value.length > 500) toast('Text shortened to 500 characters.');
    input.value = value.slice(0, 500); sendLayout('text-input', { text: input.value });
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); if (!e.shiftKey) sendLayout('text-save'); }
    if (e.key === 'Tab') { e.preventDefault(); sendLayout('text-next', { back: e.shiftKey }); }
  });
  dialog(`Editing · ${message.label}`, input, h('p.field-hint', 'Enter to save · Esc to cancel')).dataset.bubble = 'true'; input.focus();
  if (message.caret != null) input.setSelectionRange(message.caret, message.caret); else input.select();
}
function tokenMenu() {
  const labels = ['Tournament name', 'Short name', 'Season', 'Date', 'Match stage', 'Team', 'Team A', 'Team B'];
  const wasEditing = textEditing;
  const bubble = popover?.querySelector('input');
  const range = bubble ? { start: bubble.selectionStart, end: bubble.selectionEnd } : {};
  dialog('Insert token', h('div.design-token-menu', TEXT_TOKENS.map((token, i) => {
    const available = !!expandDesignText(`{${token}}`, previewData || {});
    return h('button.btn.btn-sm', { type: 'button', disabled: !available, title: available ? `{${token}}` : 'Not available on this screen.', onclick: () => {
      closePopover(); if (!wasEditing) sendLayout('edit'); sendLayout('text-insert', { text: `{${token}}`, ...range });
    } }, labels[i]);
  })));
}
function motionMenu() { dialog('Motion', h('div.design-actions', BG_MOTIONS.map(motion => btn(titleCase(motion), { size: 'sm', onclick: () => { setBackground({ motion }); closePopover(); } })))); }
const immediateNote = () => h('p.field-hint', 'Saved to the tournament right away, not part of this design draft.');
async function editRecord(ref) {
  closePopover(); const [kind, ...parts] = (ref || '').split(':'), recordId = parts.join(':');
  const section = { team: teams, player: players, match: matches, sponsor: sponsors }[kind];
  if (section && recordId) await section.edit(recordId);
}
function uploadButton(label, action) {
  const input = h('input', { type: 'file', accept: 'image/png,image/svg+xml,image/webp,image/jpeg', hidden: true, 'aria-label': label });
  const button = btn(label, { size: 'sm', onclick: () => input.click() });
  input.addEventListener('change', () => { if (input.files[0]) busy(button, async () => { try { await action(input.files[0]); } catch (e) { toastError(e); } }); });
  return h('span.design-upload', input, button);
}
function iconPicker(slot) {
  const label = slot === 'Team' ? 'Unknown team icon' : slot === 'Emblem' ? 'Tournament emblem' : `${slot} icon`;
  const choices = (global = false) => h('div.design-icon-choices', { role: 'radiogroup', 'aria-label': global ? 'Style for all icons' : 'Only this icon' }, ICON_SETS.map(set => h('button.icon-set', {
    type: 'button', role: 'radio', 'aria-checked': String((global ? config.assets.icons : config.assets.iconPicks[slot] || config.assets.icons) === set.id), onclick: () => {
      if (global) { config.assets.icons = set.id; cleanIconPicks(); }
      else if (set.id === config.assets.icons) delete config.assets.iconPicks[slot]; else config.assets.iconPicks[slot] = set.id;
      changed(`Icon · ${slot}`); iconPicker(slot);
    },
  }, iconGlyph(set.id, slot, set.name), h('span', set.name))));
  const upload = uploadButton('Upload your own…', async file => { const form = new FormData(); form.append('file', file); const { url } = await api.post('/api/design/icons', form); config.assets.customIcons[slot] = url; changed(`Icon · ${slot}`); if (tab === 'icons') paintTab(); iconPicker(slot); });
  const tint = ctlToggle({ value: config.assets.iconTint, label: 'Use the theme colour for my icons' });
  tint.el.addEventListener('change', () => { config.assets.iconTint = tint.get(); changed(`Icon · ${slot}`); });
  const emblem = slot === 'Emblem' ? h('div', h('p.field-hint', 'Your tournament has no logo yet.'), uploadButton('Upload tournament logo…', async file => { await api.brandUpload('league-logo', file); await store.load(); queuePreview(); }), immediateNote()) : null;
  dialog(label, emblem, h('h4', 'Only this icon'), choices(), h('div.design-actions', upload, config.assets.customIcons[slot] ? btn('Remove my icon', { size: 'sm', onclick: () => { delete config.assets.customIcons[slot]; changed(`Icon · ${slot}`); iconPicker(slot); if (tab === 'icons') paintTab(); } }) : null),
    h('h4', 'Style for all icons'), choices(true), h('p.field-hint', 'Changes every icon on every screen.'), tint.el);
}
/** SUPER CUP social header logo (settings.socialLogo): one image for every social graphic of the tournament. */
async function uploadEventLogo(file) {
  // The brand upload stores the file as the tournament logo; the social header then uses the same file.
  const settings = await api.brandUpload('league-logo', file);
  await api.put('/api/settings', { socialLogo: settings.leagueLogo });
  await store.load(); queuePreview(); toast('Logo updated for this tournament.', 'ok'); closePopover();
}
function eventLogoDialog() {
  const typed = btn('Use the typed header', { size: 'sm', onclick: async () => {
    try { await api.put('/api/settings', { socialLogo: '' }); await store.load(); queuePreview(); closePopover(); toast('The social header shows the mark, the year and the title again.', 'ok'); } catch (e) { toastError(e); }
  } });
  dialog('Event logo', h('p', 'The logo at the top of every social graphic of this tournament.'),
    h('div.design-actions', uploadButton('Replace logo…', uploadEventLogo), typed),
    h('p.field-hint', 'The new file is also the tournament logo of the stream graphics.'), immediateNote());
}
/** A brand image of the style (HLL logo, header mark): replaced in this design only, like an icon. */
function designImagePicker(slot) {
  const def = DESIGN_IMAGES.find(d => d.id === slot);
  if (!def) return;
  const custom = config.assets.customImages?.[slot];
  const upload = uploadButton(custom ? 'Replace my image…' : 'Upload your own…', async file => {
    const form = new FormData(); form.append('file', file);
    const { url } = await api.post('/api/design/icons', form);
    config.assets.customImages = { ...config.assets.customImages, [slot]: url }; changed(`Image · ${def.label}`); designImagePicker(slot);
  });
  const original = custom ? btn('Use the original', { size: 'sm', onclick: () => {
    delete config.assets.customImages[slot]; if (!Object.keys(config.assets.customImages).length) delete config.assets.customImages;
    changed(`Image · ${def.label}`); designImagePicker(slot);
  } }) : null;
  const logo = slot === 'lettermark' ? [h('h4', 'One logo image instead'), h('p.field-hint', 'Replaces the mark, the year and the title of every social graphic.'), h('div.design-actions', uploadButton('Upload a logo…', uploadEventLogo)), immediateNote()] : [];
  dialog(def.label, h('p', def.hint), h('h4', 'Only this image'), h('div.design-actions', upload, original),
    h('p.field-hint', 'Part of this design: Apply to use it on live graphics. A transparent PNG or SVG works best.'), ...logo);
}
function openSelection(s = layoutSelection) {
  if (!s) return;
  if (s.kind === 'background') { motionMenu(); return; }
  if (s.kind === 'icon') { iconPicker(s.icon); return; }
  if (s.kind === 'text') { sendLayout('edit'); return; }
  if (s.kind === 'event') { eventLogoDialog(); return; }
  if (s.kind === 'mark') { designImagePicker(s.imageSlot); return; }
  const [refKind, ...parts] = (s.ref || '').split(':'), recordId = parts.join(':');
  const record = ({ team: store.team, player: store.player, match: store.match, sponsor: store.sponsor }[refKind])?.call(store, recordId);
  if (['team', 'player', 'league', 'sponsor'].includes(s.kind)) {
    if (previewData?.previewSample && s.kind !== 'league') {
      dialog(s.label, h('p', 'These are sample names for the preview. Add your teams and players to see them here.'), btn('Open Teams', { onclick: () => { closePopover(); location.hash = '#/teams'; } }), immediateNote()); return;
    }
    if (s.kind === 'team' && !recordId) {
      dialog('Unknown team', h('p', 'This place has no team yet. The team logo shows here when the match has its team.'),
        h('div.design-actions', btn('Open Matches', { size: 'sm', onclick: () => { closePopover(); location.hash = '#/matches'; } }), btn('Change the TBD icon…', { size: 'sm', onclick: () => iconPicker('Team') }))); return;
    }
    const kind = s.kind, label = kind === 'player' ? 'photo' : 'logo', name = record?.name || record?.nick;
    const body = { team: 'Logos belong to the team. A new logo shows on every graphic right away.', player: 'Photos belong to the player. The background is removed automatically.', league: 'Shown on every graphic of this tournament.', sponsor: 'Logos belong to the sponsor. A new logo shows on every graphic right away.' }[kind];
    const upload = kind !== 'league' && !recordId ? null : uploadButton(`Replace ${label}…`, async file => {
      const ok = kind === 'league' ? await api.brandUpload('league-logo', file) : kind === 'sponsor' ? await api.upload('sponsor', recordId, file) : await (kind === 'team' ? teams : players).upload(recordId, file);
      if (ok === false) return;
      await store.load(); queuePreview(); toast(`${titleCase(label)} updated${name ? ` for ${name}` : ''}.`, 'ok'); closePopover();
    });
    dialog(`${s.label}${name ? ` · ${name}` : ''}`, h('p', body), h('div.design-actions', upload, kind !== 'league' && recordId ? btn(`Edit ${kind}…`, { size: 'sm', onclick: () => editRecord(s.ref) }) : null), immediateNote()); return;
  }
  const slot = s.slot;
  let kind = ['teams'].includes(slot) ? 'team' : ['players', 'roles'].includes(slot) ? 'player' : ['sponsors'].includes(slot) || scene === 'sponsors' && slot === 'names' ? 'sponsor' : 'match';
  let title = { teams: 'Team name', players: 'Player name', roles: 'Player role', scores: 'Score', status: 'Score', records: 'Team record', record: 'Team record', sponsors: 'Sponsors' }[slot] || 'Match details';
  let body = { teams: 'Team names come from Teams. Change it there and every graphic updates.', players: 'Player names come from Players.', roles: 'Roles come from the player record. The icon can be changed here: double-click it.', scores: 'Scores come from the match result.', status: 'Scores come from the match result.', records: 'Wins and losses are counted from finished matches.', record: 'Wins and losses are counted from finished matches.', sponsors: 'Sponsors come from the Sponsors list.' }[slot] || 'Date, time, stage and best-of come from the match.';
  let section = `${kind}s`, ref = s.ref;
  if (kind === 'match' && refKind !== kind && previewData?.match?.id) ref = `match:${previewData.match.id}`;
  if (scene === 'bracket' && ['meta', 'rounds', 'legend'].includes(slot)) { title = 'Bracket'; body = 'Round names come from the tournament bracket.'; section = 'tournaments'; ref = ''; }
  if (['matches', 'bench', 'statistics', 'points', 'names', 'headlines'].includes(slot) && scene !== 'sponsors') { title = 'Data'; body = 'This list is built from your tournament data.'; section = ['bench'].includes(slot) ? 'players' : 'matches'; ref = ''; }
  if (['records', 'record'].includes(slot)) ref = '';
  const sample = previewData?.previewSample;
  if (sample) { body = 'These are sample names for the preview. Add your teams and players to see them here.'; section = 'teams'; ref = ''; }
  const name = record?.name || record?.nick;
  const canEdit = ref && ref.startsWith(kind + ':') && !sample;
  dialog(title, h('p.design-data-origin', 'This comes from your tournament'), h('p', body), btn(canEdit ? `Edit ${kind}${name ? ` "${name}"` : ''}…` : `Open ${titleCase(section)}`, { kind: 'primary', onclick: () => {
    closePopover(); if (canEdit) void editRecord(ref); else if (section === 'tournaments') void openManager(); else location.hash = `#/${section}`;
  } }), h('div.design-actions', btn('Font & size…', { size: 'sm', onclick: () => { closePopover(); fontAndSize(); } }), btn('Hide on this screen', { size: 'sm', onclick: () => hideSlot(slot) })),
    h('p.field-hint', 'Changes to tournament records are saved right away. They are not part of this design draft.'));
}
