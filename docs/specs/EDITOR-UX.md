# Graphics designer: easier editing, in-place images, background on/off and motion

Status: spec, ready to build · Owner: UI/style lead · Applies to `public/control/js/sections/designer.js`, `public/control/css/designer.css`, `public/overlay/js/{scene-page,layout-editor,graphic-design,render,ui,anim,live-page,core}.js`, `public/shared/graphic-design.js`, `public/overlay/css/{graphic-design,bg-anim}.css`, `public/overlay/{scene,live}.html`.

The user's request: *"change a text by double-clicking, quick and easy, as well as the images like icons; use or not use the background in my final graphics; backgrounds in an animation loop with 3 different styles."*

Nothing here depends on where the app runs (local Node, Cloudflare, desktop exporter). Every new setting lives in the design config, which travels with presets and applied designs.

---

## 0. Decisions at a glance

| # | Decision |
|---|---|
| D1 | The preview is **interactive on every tab**, not only on Layout. Click selects, drag moves, double-click edits. |
| D2 | **Double-click an editable text** to edit it inline in the graphic (WYSIWYG, auto-fit while typing). Enter saves, Esc cancels, clicking away saves. |
| D3 | Text too small to read at preview scale (under 12 screen px) opens a **text bubble** (a normal-size input next to the element) instead of inline editing. The graphic still updates live. |
| D4 | **Double-click data text** (team/player names, scores, dates, times, roles) opens a **"This comes from your tournament" popover**, with a button that opens that team, player or match record in a drawer over the designer. It never turns data into fixed text. |
| D5 | A **floating toolbar** appears above the selected element. Its buttons depend on the element type: text, data text, icon, logo, photo, container or background. |
| D6 | **Icons are replaced in place** with an icon picker. It offers the 4 styles for *this icon only* (new `assets.iconPicks`), the style for all icons, or an upload. |
| D7 | **Logos and photos are tournament data.** The popover replaces them on the record right away and says so clearly. They are not part of the draft. |
| D8 | **Background = design setting.** It has a global default plus per-screen overrides: `show`, `motion` (`none`, `drift`, `rays`, `embers`), `speed` and `intensity`. |
| D9 | `bg=0` in a URL always wins (no plate). `bg=1` forces the plate on. With no `bg` in the URL, the design decides. A `motion=` URL flag overrides the motion. |
| D10 | Motion phase comes from the **wall clock** (`Date.now() % loop`). Re-renders, scene swaps and several OBS sources all show the same frame, with no restart. |
| D11 | PNG export (`static=1`), `.is-static` and reduced motion show a **designed frozen frame**. Drift looks exactly like today's plate; Rays and Embers freeze at a still that looks good. |
| D12 | One **designer history** (undo/redo) covers text, layout, icons and background. It replaces the layout-only stacks. |
| D13 | **Must fix:** `anim.js animateOut()` calls `finish()` on infinite animations, which throws. With motion on, the scene swap in live.html breaks. See section 3.8. |

---

## 1. Interaction model in the preview (all tabs)

### 1.1 Gestures

| Gesture | On | Result |
|---|---|---|
| Hover | any catalogued element | thin teal outline (existing `.le-box.is-hover`) |
| Click | element | select it. Shows the selection box, handles and **floating toolbar** |
| Click | empty plate area | select **Background** (no handles, background toolbar) |
| Drag | selected or unselected element | move (existing snapping; Alt turns guides off) |
| Drag handle | selection | resize / scale (existing) |
| Double-click | see 1.2 | edit / replace / go deeper |
| Enter or F2 | selection is an editable text | start inline edit |
| Esc | while editing | cancel the edit |
| Esc | selection, not editing | select the **parent** element; if there is none, deselect |
| Arrow keys / Shift | selection | nudge 1 / 10 px (existing) |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z | anywhere in designer or preview | designer history (D12) |
| Delete / Backspace | selection with a text slot | **hide on this screen** (sets `enabled: false`; undoable) |

**Breaking change.** Remove "click a selected element again to select the larger element around it" (`cycleTo` in `layout-editor.js onDown/onUp`). The second click of every double-click would trigger it. Parent selection moves to **Esc**, the toolbar button **Select parent**, and the existing **Select parent** button in the Layout panel. Update the Layout tab hints and `docs/GRAPHICS-DESIGNER.md`.

`layout-editor.js` must ignore the `pointerdown` that belongs to a double-click. Use the native `dblclick` event for the edit and keep `pointerdown` for select/drag. `CLICK_SLOP` already prevents a micro-drag.

### 1.2 Double-click hit resolution

On `dblclick` at (x, y), walk `document.elementsFromPoint(x, y)` (skip `.le-overlay`). The first rule that matches wins:

1. The deepest node with `[data-design-slot]` whose slot is `editable` → **inline text edit** (section 2).
2. The deepest node with `[data-design-slot]` that is not editable → **data popover** (section 2.6).
3. An image: `[data-icon-slot]` (role icons, unknown-team shield, emblem), `.tlogo` (team logo), `.pphoto` (player photo), `.league-logo`, `.spons-item`/`.sp-tile` → **image popover** (section 3).
4. A catalogued element (`[data-design-el]`) deeper than the current selection → **select it** ("go deeper").
5. Nothing (plate) → **Background** toolbar with the Motion menu open.

### 1.3 Floating toolbar placement

* It is rendered in the **control panel page**, not inside the scaled iframe, so it is always full size and its inputs behave normally. The iframe sends the selection rectangle in scene pixels with every `selected` and `live` message (`rect: {x, y, w, h}`). The parent converts it with `canvasRect + rect × viewScale`.
* Position: centred above the selection box with an 8 px gap. If there is less than 44 px above (inside the canvas), it flips below. It is clamped 8 px inside the preview canvas horizontally.
* Hidden while dragging or resizing, and while the pointer button is down. It returns 120 ms after `pointerup`. Hidden while the preview re-renders and placed again after `graphic-design-rendered`.
* Visual: 36 px tall pill, `#15171c` background, 1 px `var(--line)` border, 8 px radius, `0 6px 20px rgba(0,0,0,.45)`. Icon buttons are 32×32 with a tooltip and `aria-label`. The first item is a label chip (gold, 12 px, uppercase) naming the element, e.g. `MAIN MESSAGE` or `TEAM A LOGO`.
* `role="toolbar"` with `aria-label` "<element> tools". Roving tabindex, Left/Right moves between buttons, Esc returns focus to the preview.
* Keyboard path: Ctrl+. (period) moves focus from the preview to the toolbar.

### 1.4 Toolbar contents per element type

| Element | Toolbar (left → right) |
|---|---|
| Editable text (slot.editable) | `MAIN MESSAGE` · **Edit text** (pencil) · **Insert token ▾** · **Automatic text** (↺, only when overridden) · **Font & size…** · **Hide** (eye-off) · **Select parent** |
| Data text (not editable) | `TEAM NAMES` · **Where does this come from?** (opens the data popover) · **Font & size…** · **Hide** · **Select parent** |
| Role icon / unknown-team shield / emblem | `TOP ICON` · **Replace icon…** (opens picker) · **Theme colour** toggle · **Hide** (only if the slot of its row allows it, otherwise omitted) · **Select parent** |
| Team logo | `TEAM A LOGO` · **Replace logo…** · **Edit team…** · **Select parent** |
| Player photo | `PLAYER PHOTO` · **Replace photo…** · **Edit player…** · **Select parent** |
| League / tournament logo | `TOURNAMENT LOGO` · **Replace logo…** · **Select parent** |
| Sponsor logo | `SPONSOR` · **Edit sponsor…** · **Select parent** |
| Container (row, card, block) | `MATCH ROW` · **Only this one** toggle (when count > 1) · **Reset position** · **Select parent** |
| Background | `BACKGROUND` · **Show on this screen** toggle · **Motion ▾** (None · Drift · Rays · Embers) · **Change image…** · **Background settings** (opens the Background tab) |

"Font & size…" switches the left panel to the Text tab, scrolled to that slot's card, and focuses the size field.

---

## 2. Inline text editing

### 2.1 Which nodes

A node is inline-editable when it carries `data-design-slot=<id>` (set by `applyGraphicDesign`) and `screenSlots(scene).find(s => s.id === id).editable === true`. Examples on *Starting soon*: Tournament name, Main message, Caption, Today's matches label, No-matches message. Data slots (`teams`, `players`, `roles`, `scores`, `times`, `date`, `meta`, `stage` where `editable:false`, …) are never inline-editable (section 2.6).

### 2.2 Start of an edit

1. On double-click, or Enter/F2 on a selected editable slot, the iframe:
   * hides the resize handles and the floating toolbar's position stays above the box;
   * wraps the node's **own text nodes** in `<span class="te-edit" contenteditable="plaintext-only" role="textbox" aria-label="<slot label> text" spellcheck="false">` placed where the first text node was. Child elements (date labels, icons) stay outside the span, untouched and non-editable;
   * adds `.te-editing` to the node and selects all text in the span.
2. Initial content of the span:
   * `field.text` when the slot already has an override. Shown **raw, with tokens**, e.g. `{tournament} · FINALS`;
   * otherwise, when `expandDesignText(slot.example, data) === displayedText`, the **example template** (keeps the automatic link, e.g. `{tournament}`);
   * otherwise the displayed text.
3. The parent page sets the preview status line (`role="status"`): **"Editing Main message · Enter to save · Esc to cancel"**.

### 2.3 Edit visuals

* Outline: 2 screen px solid `#47e7dd` at offset 6 screen px (use `--le-px` like the layout overlay), plus a soft `0 0 0 9999px rgba(0,0,0,.18)` dim on the rest of the graphic so the edited text stands out.
* `caret-color: #47e7dd`. Selection highlight `rgba(71,231,221,.35)`.
* While editing, `.te-editing` and `.te-edit` get `overflow: visible !important; text-overflow: clip !important;` so the caret is never clipped by `.fit`.
* Linked nodes (same slot shown more than once, e.g. both lineup headings): dashed teal outline. The tag reads **"Changes 2 places"**.
* Tag above the box (existing `.le-tag` style): **"Editing · Main message"**.
* Too long: when `fitText` reaches its minimum and adds `.fit-clip`, the outline turns amber `#f2c230` and the tag reads **"Too long · the end will be cut"**. Saving is still allowed.

### 2.4 Typing, auto-fit, tokens

* On every `input` event (throttled to one animation frame), call `fitText(node)` when the node has `.fit`, then `fitAll(node)`. The text keeps the size it will really have on air.
* Single line: **Enter saves**. Shift+Enter does nothing. Pasted text is plain. Newlines become spaces. More than 500 characters is cut to 500, with the toast **"Text shortened to 500 characters."**
* Tokens are typed as plain text, `{tournament}`. The toolbar **Insert token ▾** menu inserts at the caret:

  | Menu label | Token |
  |---|---|
  | Tournament name | `{tournament}` |
  | Short name | `{short}` |
  | Season | `{season}` |
  | Date | `{date}` |
  | Match stage | `{stage}` |
  | Team | `{team}` |
  | Team A | `{teamA}` |
  | Team B | `{teamB}` |

  A token that resolves to an empty string for the current screen data is shown disabled, with the tooltip **"Not available on this screen."**
* While editing, tokens stay raw (`{tournament}`). They are expanded on save.
* An unknown token (`{foo}`) on save keeps the edit open. The tag turns amber: **"Unknown token {foo}. Use Insert token."** This matches `normalizeDesign`, which would reject the preset.

### 2.5 Saving, cancelling, storage

| Action | Result |
|---|---|
| Enter, Tab, click outside, change tab/screen | **save** |
| Tab / Shift+Tab | save, then start editing the next / previous editable slot in document order |
| Esc | cancel: restore the original text nodes and do not touch the config |
| Save with unchanged text | no config change, no history entry |
| Save with empty text | `text: ''` = back to the automatic/original text |
| Toolbar **Automatic text** | same as saving empty text |

Storage (parent page): `config.screens[scene][slotId] = { enabled: prev?.enabled ?? true, text, font: prev?.font ?? '', size: prev?.size ?? 0 }`. The shape is the same as the Text tab; `normalizeDesign` is unchanged.

Messages:
* iframe → parent: `{ type:'graphic-layout', action:'text-commit', slot, text }` and `{ action:'text-editing', slot, editing: true|false }` (the parent shows/hides the status line and disables the tab buttons' keyboard shortcuts while editing).
* After `text-commit`, the iframe immediately replaces the span with `expandDesignText(text, data)` so nothing flickers. The parent pushes a history entry, persists, refreshes the Text tab card if it is shown, and queues the normal re-preview.

### 2.6 Data text (not editable): the "comes from your tournament" popover

Double-click, or toolbar **Where does this come from?**, opens a popover anchored to the element (parent page; same placement rules as the toolbar; 320 px wide).

| Slot ids | Title | Body | Primary button | Opens |
|---|---|---|---|---|
| `teams` | Team name | "Team names come from Teams. Change it there and every graphic updates." | **Edit team "{name}"…** | `teams.edit(id)` drawer |
| `players` | Player name | "Player names come from Players." | **Edit player "{nick}"…** | `players.edit(id)` |
| `roles` | Player role | "Roles come from the player record. The icon can be changed here: double-click it." | **Edit player…** | `players.edit(id)` |
| `scores`, `status` | Score | "Scores come from the match result." | **Edit match…** | `matches.edit(id)` |
| `times`, `time`, `date`, `meta`, `bestOf`, `stage` (non-editable) | Match details | "Date, time, stage and best-of come from the match." | **Edit match…** | `matches.edit(id)` |
| `records`, `record` | Team record | "Wins and losses are counted from finished matches." | **Open Matches** | `#/matches` |
| `sponsors`, `names` (sponsors) | Sponsors | "Sponsors come from the Sponsors list." | **Edit sponsor…** / **Open Sponsors** | `sponsors.edit(id)` |
| `rounds`, `legend`, bracket `meta` | Bracket | "Round names come from the tournament bracket." | **Open Tournaments** | Tournaments drawer |
| `matches`, `bench`, `statistics`, `points`, `names`/`headlines` (format) | Data | "This list is built from your tournament data." | **Open {section}** | matching section |

Common to every data popover:
* Secondary buttons: **Font & size…** and **Hide on this screen**.
* Footnote (muted, 12 px): **"Changes to tournament records are saved right away. They are not part of this design draft."**
* If the preview uses sample data (`previewData.previewSample`), the body is **"These are sample names for the preview. Add your teams and players to see them here."**, the primary button is **Open Teams**, and record buttons are hidden.
* The drawers open **over the designer** (import `edit` from `sections/teams.js`, `players.js`, `matches.js`, `sponsors.js`). The designer draft is kept (it is in `localStorage`). When the drawer saves, `store.load()` runs and the designer calls `queuePreview()` (subscribe in `update()`).

**Record references in the DOM (required).** The popover finds the record with `node.closest('[data-ref]')`. Scene renderers must add `data-ref="team:<id>" | "player:<id>" | "match:<id>" | "sponsor:<id>"` to the element that represents one record. Use helpers so it is one line per place:

* `teamLogo()` / `crest()` in `ui.js`: `data-ref="team:<id>"` when `team.id` exists (not for placeholders).
* `playerPhoto()`: `data-ref="player:<id>"` when `p.id` exists.
* Match containers: `.srow`, `.wait-match`, `.nb-match`, `.so-fixture`, the `.vs-*` root of a versus scene, `.sv-band`, `.gsl-*` match boxes → `match:<id>`.
* Team blocks: `.vs-a`/`.vs-b`, `.sc-a`/`.sc-b`, `.so-team-a`/`-b`, `.so-versus-team`, `.tv-a`/`-b`, `.r-head`, `.tr-brand`, `.so-roster-brand` → `team:<id>`.
* Player rows/cards: `.pcard`, `.mcard`, `.tl-row`, `.so-lineup-row`, `.so-fighter-*`, `.mu-card-*` → `player:<id>`.
* Sponsors: `.spons-item`, `.sp-tile` → `sponsor:<id>`.

A `data-ref` attribute is harmless on air and in PNGs.

### 2.7 Coexistence with Layout selection and drag

* The pointer handlers in `layout-editor.js` return early when `e.target.closest('.te-edit')`, so the click places the caret and dragging selects text.
* A `pointerdown` outside the edited node first **saves**, then continues as a normal select/drag on that same press.
* Arrow keys, Delete and Ctrl+Z inside `.te-edit` are native text editing. They do not nudge, hide or undo the designer.
* A re-render arriving during an edit (another change, SSE) is **deferred** until the edit ends. The iframe queues the latest `graphic-design-preview` message and applies it after save or cancel.

### 2.8 Undo (designer history, D12)

Replace `layoutUndo/layoutRedo` in `designer.js` with one history:

```js
history = { past: [], future: [] }            // entries: { label, scene, config }  (config = structuredClone before the change)
record(label)  → past.push({ label, scene, config: structuredClone(config) }); future = []; cap 100
undo()         → future.push(current); config = past.pop().config; apply
redo()         → mirror
```

* Every mutation goes through `record(label)`. Labels: `Edit text · Main message`, `Hide · Caption`, `Move · Team A logo`, `Resize · Match row`, `Icon · Top`, `Background · Rays`, `Font · Headlines`.
* Coalescing: keep the existing 800 ms coalesce for arrow nudges and for range sliders.
* After undo/redo: send the layouts to the iframe (`set`) **and** re-preview (text/icon/background changes need a render). If the entry's `scene` is not the current screen, switch the preview to that screen first.
* Toast on undo: **"Undone: Edit text · Main message"** (2 s). The Undo/Redo buttons have the tooltips "Undo: <label>" / "Redo: <label>".
* History is cleared when a preset is loaded or **Reset draft** is used (the existing behaviour for layouts).

### 2.9 Accessibility

* The Text tab cards stay the full keyboard and screen-reader path. Double-click is a shortcut, not the only way.
* Keyboard-only path in the preview: Tab focuses the preview frame. **Ctrl+Up/Down** cycles the selection through the elements in document order (new). Enter/F2 edits, Ctrl+. focuses the toolbar.
* The edit span has `role="textbox"`, `aria-label`, `aria-describedby` pointing to a hidden hint "Enter to save, Escape to cancel".
* The parent preview status line announces: "Editing …", "Saved: Main message", "Cancelled".
* Popovers are `role="dialog"` with `aria-labelledby` set to the title. Focus moves into them, Esc closes them and returns focus to the preview.
* Minimum target size in toolbar/popover: 32×32 px. Contrast of teal-on-dark outline ≥ 3:1.

### 2.10 Acceptance criteria: text

1. On *Starting soon*, double-clicking **STARTING SOON** shows a caret inside the graphic, with all text selected and a teal outline. Typing `CHOOSE YOUR CHAMPION` shrinks the text to fit while typing. Enter saves. The Text tab card for *Main message* then shows `CHOOSE YOUR CHAMPION`.
2. Esc during an edit restores the previous text exactly. Undo is then disabled if nothing else changed.
3. Double-clicking the kicker `SUPERCUP 2026` (automatic) starts the edit with `{tournament}` · `{season}` when that template produces the displayed text. Saving without changes creates no history entry.
4. Insert token → Tournament name inserts `{tournament}` at the caret. On save the graphic shows the tournament name.
5. Typing `{foo}` and pressing Enter keeps the edit open with the amber message. Nothing is saved.
6. Clearing all text and pressing Enter shows the automatic text again. The config field has `text: ''`.
7. A drag right after a double-click edit (click outside, drag another element) saves the text and moves the other element. Each is one undo step.
8. Ctrl+Z after an edit restores the old text. Ctrl+Y redoes it. The toast names the change.
9. Double-clicking a team name opens the data popover, not an edit. **Edit team "…"** opens the team drawer. Renaming the team updates the preview after saving the drawer. The design draft is still dirty and unchanged.
10. With sample data, the data popover offers **Open Teams** and no record buttons.
11. A kicker that is 22 px on air (about 8 px in the preview) opens the text bubble instead of inline editing. Typing in the bubble updates the preview live.
12. Single click no longer selects the parent on a second click. Esc selects the parent.
13. All of the above work on every tab, not only Layout.

---

## 3. Replacing images in place

### 3.1 What counts as an image

| Kind | DOM today | Where the change is stored | Draft? |
|---|---|---|---|
| Role icons Top/Jungle/Mid/Bot/Support/Coach/Player | `svg[data-icon-slot]` (`roleIcon`) | design: `assets.iconPicks`, `assets.customIcons`, `assets.icons` | yes |
| Unknown-team shield | monogram `svg[data-icon-slot="Team"]` | design | yes |
| Tournament emblem (default trophy) | `img[src="/brand/tournament.svg"]` → **add `data-icon-slot="Emblem"`** in `leagueLogo()` when the default is used | design | yes |
| Tournament logo (uploaded) | `.league-logo img` | tournament: `settings.leagueLogo` via `api.brandUpload('league-logo', file)` | **no, immediate** |
| Team logo | `.tlogo img` / monogram | team record via `teams.upload(teamId, file)` | **no, immediate** |
| Player photo | `.pphoto img` / silhouette | player record via `players.upload(playerId, file)` | **no, immediate** |
| Sponsor logo | `.spons-item img`, `.sp-tile img` | sponsor record | **no** (opens the drawer) |
| Background image | `.plate-img` | tournament theme (`bgImage`, `versusBgImage`, `socialBgImage`) via the background panel | **no, immediate** |

### 3.2 Icon picker popover (role icons, shield, emblem)

Anchored to the icon. 340 px wide. Title: **"Top icon"** (slot label + "icon"; for Team: **"Unknown team icon"**; for Emblem: **"Tournament emblem"**).

```
┌ Top icon ─────────────────────────────── × ┐
│ ONLY THIS ICON                              │
│ [◩ Classic] [⛑ Hoplite] [▢ Lane map] [⬢ Hex]│   ← radiogroup, current = gold ring
│ [⤒ Upload your own…]  [Remove my icon]      │
│ ─────────────────────────────────────────── │
│ STYLE FOR ALL ICONS                         │
│ Classic · Hoplite · Lane map · Hex badge    │   ← segmented, current highlighted
│ ─────────────────────────────────────────── │
│ ☐ Use the theme colour for my icons         │
└─────────────────────────────────────────────┘
```

* **Only this icon** sets `assets.iconPicks[slot] = setId`. Choosing the style that equals `assets.icons` deletes the pick.
* **Upload your own…** opens a file input (`image/png,image/svg+xml,image/webp,image/jpeg`) → `POST /api/design/icons` (existing) → `assets.customIcons[slot] = url`. **Remove my icon** deletes it. An upload wins over a pick.
* **Style for all icons** sets `assets.icons`. Hint under it: **"Changes every icon on every screen."**
* **Use the theme colour** = `assets.iconTint` (existing).
* Emblem picker adds a first row: **"Your tournament has no logo yet. [Upload tournament logo…]"**. That upload goes through `api.brandUpload('league-logo', file)` with the immediate-change footnote.
* Keyboard: arrows move within each radiogroup, Enter/Space choose, Esc closes. Every choice is one history entry: `Icon · Top`.

**Data model addition** (`public/shared/graphic-design.js`):

```js
EMPTY_DESIGN.assets.iconPicks = {}                          // { [ICON_SLOTS id]: ICON_SET_IDS id }
normalizeDesign: if (assets.iconPicks !== undefined) {
  if (!object(assets.iconPicks)) fail('Icon picks must be an object');
  for (const [slot, set] of Object.entries(assets.iconPicks)) {
    if (!ICON_SLOTS.some(s => s.id === slot) || !ICON_SET_IDS.includes(set)) continue;   // forward-compatible: drop unknown
    if (set !== result.assets.icons) result.assets.iconPicks[slot] = set;
  }
}
```

`normalizeDesign` must process `assets.icons` **before** `iconPicks` so the "equal to global" check uses the final value.

`graphic-design.js applyIcons()` precedence per slot: `customIcons[slot]` → `iconPicks[slot]` → `assets.icons`. Remove the early `if (set.id === 'classic') continue;`, because a Classic pick inside a Hoplite design must draw the Classic glyph. Use `iconSet(pick).icons[slot]` for each slot. For the emblem, use the per-slot set too.

### 3.3 Team logo, player photo, tournament logo, sponsor

Popover (same frame as 2.6):

| Element | Title | Body | Buttons |
|---|---|---|---|
| Team logo | Team logo · {Team name} | "Logos belong to the team. A new logo shows on every graphic right away." | **Replace logo…** (file input → `teams.upload(id, file)` → toast "Logo updated for {team}.") · **Edit team…** |
| Team placeholder (TBD) | Unknown team | "This place has no team yet. Change its icon for all TBD places." | **Replace icon…** (icon picker for `Team`) |
| Player photo | Player photo · {nick} | "Photos belong to the player. The background is removed automatically." | **Replace photo…** (`players.upload`) · **Edit player…** |
| Tournament logo | Tournament logo | "Shown on every graphic of this tournament." | **Replace logo…** (`api.brandUpload('league-logo', file)`) |
| Sponsor | {Sponsor name} | "Sponsor logos come from Sponsors." | **Edit sponsor…** |

The footnote **"Saved to the tournament right away, not part of this design draft."** is always present. Uploads show a busy state on the button and refresh the preview when done (the background-removal job may finish later; the next SSE refresh shows the final image).

### 3.4 Acceptance criteria: images

1. On the versus screen with the Hoplite style, double-clicking the **Top** role icon opens the picker. Choosing **Classic** in *Only this icon* changes only the Top icons. Jungle/Mid/… stay Hoplite. The saved preset contains `assets.iconPicks: { Top: 'classic' }`.
2. Picking the same style as the global style removes the pick (no entry in `iconPicks`).
3. Upload in the picker replaces only that icon and appears in the Icons tab under *Your own icons*.
4. Double-clicking a team logo shows the team popover. **Replace logo…** uploads, the toast appears, and the preview shows the new logo. **Reset draft** does not bring back the old logo.
5. Double-clicking the TBD shield opens the icon picker for **Unknown team**.
6. A preset with `iconPicks: { Foo: 'hoplite' }` or `{ Top: 'unknown-set' }` loads without error and the bad entries are dropped.

---

## 4. Background: on/off and motion

### 4.1 Data model (design config)

```js
// public/shared/graphic-design.js
export const BG_MOTIONS = ['none', 'drift', 'rays', 'embers'];
export const BG_SPEEDS = ['slow', 'normal', 'fast'];
export const BG_INTENSITIES = ['subtle', 'normal', 'strong'];
export const BG_DEFAULT = { show: true, motion: 'none', speed: 'normal', intensity: 'normal' };

EMPTY_DESIGN.backgrounds = { default: { ...BG_DEFAULT }, screens: {} };
//   screens: { [sceneId]: Partial<BG_DEFAULT> }   only the keys that differ from the default are stored

export function resolveBackground(config, scene) {
  return { ...BG_DEFAULT, ...(config?.backgrounds?.default || {}), ...(config?.backgrounds?.screens?.[scene] || {}) };
}
```

**Normalize rules** (inside `normalizeDesign`; same failure style as the rest):

| Input | Rule |
|---|---|
| `raw.backgrounds` missing | defaults (`show: true`, `motion: 'none'`). Old presets look exactly as before |
| `backgrounds` not an object | fail `Background settings must be an object` |
| `default` / a screen entry not an object | fail `Background settings must be an object` |
| `show` present and not boolean | fail `Background visibility must be on or off` |
| `motion` / `speed` / `intensity` not a string | fail `Invalid background motion` |
| `motion` / `speed` / `intensity` string not in the list | **drop the key** (forward-compatible, like unknown layout elements) |
| unknown keys inside an entry | drop |
| screen id not in `SCENE_IDS` | **drop** (a preset from a newer version must load) |
| screen entry key equal to the resolved default value | drop the key. An empty screen entry is removed |

`BUILTIN_DESIGNS` keep `backgrounds` at the defaults.

### 4.2 URL flags and precedence

`core.js readFlags()`:

```js
bg:     q.get('bg') === '0' ? false : q.get('bg') === '1' ? true : null,     // null = the design decides
motion: BG_MOTIONS.includes(q.get('motion')) ? q.get('motion') : null,       // null = the design decides
```

Add `motion` to `RESERVED`.

| Source | Effect |
|---|---|
| `bg=0` (URL, or Live `params.bg = '0'`) | plate off, scene gets `.bg-off` (transparent, readable keying styles). **Always wins.** |
| `bg=1` | plate on even if the design says off |
| no `bg` | `resolveBackground(design, scene).show` |
| `motion=none` | no motion |
| `motion=drift\|rays\|embers` | that style. Also adds `.bga-force` so the motion plays even when the PC has reduced motion on (an explicit operator request) |
| no `motion` | `resolveBackground(...).motion` |

`live-page.js effective()`: `bg` becomes `flags.bg ?? (params.bg == null ? null : String(params.bg) !== '0')`, and motion is handled the same way. Both go into `keyOf()` (`&bg=…&motion=…`), so a change rebuilds the scene. `scene-page.js`: `ctx = { …, bg: flags.bg, motion: flags.motion }`.

`render.js buildScene()` resolves the background **before** `mod.render`, so `.bg-off` styling follows the design:

```js
const bgCfg = resolveBackground(data.graphicDesign, name);
c.bg = ctx.bg ?? bgCfg.show;                         // ctx.bg: true | false | null
c.bgMotion = c.bg ? (ctx.motion ?? bgCfg.motion) : 'none';
c.bgSpeed = bgCfg.speed; c.bgIntensity = bgCfg.intensity; c.bgForce = !!ctx.motion;
```

`decorate()` already reads `c.bg`. `ui.js plate()` and `social-common.js` already return nothing when `!ctx.bg`.

The help/OBS section (`sections/help.js`) gets a **Motion** select next to *Transparent (bg=0)*: `Design default · None · Drift · Rays · Embers`. It writes `motion=` into the copied URL. Copy: **"Motion: the design's choice, or force one for this browser source."**

### 4.3 How `bg-anim.css` is wired (exact)

1. **Link it** in `public/overlay/scene.html` and `public/overlay/live.html`, after `css/graphic-design.css`:
   `<link rel="stylesheet" href="css/bg-anim.css">`. (`master.html` serves `live.html`.)
2. **`ui.js plate(theme, kind, ctx, extra)`** builds, when `ctx.bg` is true:

```html
<div class="plate plate-{kind} {extra}" data-in="plate" …
     data-bga="drift|rays|embers"              ← only when ctx.bgMotion !== 'none'
     data-bga-level="subtle|normal|strong"     ← always with data-bga (= the intensity; Embers shows 16 / 24 / 32 sparks)
     data-framed                               ← only when the URL is a built-in brand plate with a border: kind main|social AND plateUrl() starts with "/brand/"
     class+="bga-force"                        ← only when ctx.bgForce
     style="--bga-t:-12.345s; --bga-time:1; --bga-k:1">
  <div class="plate-img" style="background-image:url(…)"></div>
  <div class="plate-shade"></div>
  <div class="bga-fx" aria-hidden="true"></div>                       ← drift, rays: empty
  <div class="bga-fx" aria-hidden="true"><i></i> × 32</div>           ← embers: exactly 32 empty <i>
</div>
```

   The reference implementation is `plate()` in `jobs/proto/bg-anim.html`. Copy its logic:

```js
const SPEED = { slow: 1.5, normal: 1, fast: .75 }, INTENSITY = { subtle: .6, normal: 1, strong: 1.35 };
const LOOP_MS = 48000;
const time = SPEED[ctx.bgSpeed] ?? 1;
el.style.setProperty('--bga-t', `${-((Date.now() % (LOOP_MS * time)) / 1000).toFixed(3)}s`);
el.style.setProperty('--bga-time', String(time));
el.style.setProperty('--bga-k', String(INTENSITY[ctx.bgIntensity] ?? 1));
el.dataset.bgaLevel = INTENSITY[ctx.bgIntensity] ? ctx.bgIntensity : 'normal';
```

   * No `.bga-fx` and no `data-bga` when motion is `none`. The plate is then byte-identical to today.
   * The `--bga-t` phase is computed **when the plate is built**. `prepare()` inserts it in the same task, so the phase error is a few ms.
   * Never animate `.plate` itself. `anim.js` owns its transform/opacity (`data-in="plate"`); bg-anim animates only `.plate-img` and `.bga-fx` children.
3. **Class/attribute names** that the CSS expects: `.plate[data-bga="drift"|"rays"|"embers"]`, `.plate[data-bga-level="subtle"|"normal"|"strong"]`, `.plate[data-framed]`, `.plate.bga-force`, `.plate > .bga-fx`, `.plate > .bga-fx > i` (embers: always 32; the CSS has an `nth-child(1…32)` table and hides sparks 25–32 at normal and 17–32 at subtle), and the custom properties `--bga-t`, `--bga-time`, `--bga-k`. The theme colour hook is `--bga-light` (rays/drift light, default warm white `255,234,200`) and `--bga-ember` (spark colour, default `255,158,72`). A theme may override them on the scene root.
4. **Static frame.** `overlay.css` already has `.is-static * { animation: none !important }`. `bg-anim.css` repeats it for its own selectors so it is safe on its own. With no animation every layer shows its base style, which is the designed still (4.5).
5. **Reduced motion.** `bg-anim.css` stops all bg animations under `@media (prefers-reduced-motion: reduce)` unless the plate has `.bga-force`. In OBS this follows the Windows setting *Animation effects*; the URL `motion=<style>` forces it (4.2).
6. **Designer preview.** The preview iframe runs `scene.html?designer=1&static=1`. To show motion:
   * the preview message gets `motion: true|false` (quick-actions bar **▶ Play motion**; default **on** while the Background tab is open, **off** elsewhere);
   * `scene-page.js` designer branch: `document.body.classList.toggle('is-static', !event.data.motion)` and `buildScene(data, { ...ctx, static: !event.data.motion })`. Never call `animateIn` in the designer.
   * In the control panel, reduced motion is honoured: the button shows **"Motion is paused because your system has reduced motion on."** and stays off.

### 4.4 The three styles (built: `public/overlay/css/bg-anim.css`)

| Style (UI name) | What you see | Layers | Periods (normal speed) |
|---|---|---|---|
| **Drift** · "Slow cinematic push" | The image slowly pushes in and pans diagonally, then eases back. A soft warm light travels across it. Built-in framed plates zoom only 1.6 %, so the baked border never leaves the canvas. Other images zoom 5 %. | `.plate-img` transform; `.bga-fx::before` glow | 24 s each way (48 s period), glow 48 s |
| **Rays** · "Light of Olympus" | A fan of soft god rays from above the top centre. It sways ±2.4° and breathes. A second, finer fan drifts the other way. Rays sit **under** the readability shade. | `.bga-fx::before` + `::after`, transform + opacity, radial mask | sway 48 s / 24 s periods, breathing 24 s / 16 s |
| **Embers** · "Arena sparks" | Sparks rise from the floor in three depths (far = tiny and dim, mid, near = large and soft): 16 (subtle), 24 (normal) or 32 (strong). Each sways twice and fades out by about 88 % of the height, so headers stay clean. Warm heat glow at the bottom. | `.bga-fx > i` (one animation each, single leaf layer), `.bga-fx::before` heat | rises 12 / 16 / 24 s, heat 16 s |

All periods divide the **48 s master loop**, so the wall-clock phase gives a seamless loop for any rebuild. Speed multiplies every duration: slow ×1.5, fast ×0.75. Only `transform` and `opacity` animate: no filters, no blur, no blend modes.

UI copy for the motion cards:
* None: **"Still image."**
* Drift: **"A slow cinematic push across the image."**
* Rays: **"Soft light rays from above that sway and breathe."**
* Embers: **"Warm sparks rising from the floor."**

Proof (`jobs/proto/shots/`):
* `{drift,rays,embers}-{0s,2s,5s}.jpg`: real-time captures at 1920×1080 with a mock schedule over them.
* `{style}-static.jpg`: the frozen frames.
* `grid.jpg`: every style on aegean-main, sparta-stage and aegean-versus.
* Seam check (`jobs/proto/shoot-bg.mjs`): the frame at loop time t and t + 48 s differs by **0** in every channel, for all three styles.

### 4.5 PNG export and the frozen frame

`static=1` (PNG export, desktop exporter) sets `body.is-static` and the scene's `.is-static`. All bg animations stop and the base styles render:

* **Drift**: the original plate, unscaled, plus a faint travelling glow at rest. The PNG is practically identical to today's export.
* **Rays**: the fan at rest (centred, mid brightness). The PNG gets the light rays.
* **Embers**: each spark frozen where it is at loop time 0 (the CSS stores this as `--p`/`--po`), so the PNG shows a natural scatter of sparks.

No extra wait is needed: the frozen frame is CSS only and the `ready` flag is unchanged.

### 4.6 live.html / OBS behaviour

* **Seamless loop.** The 48 s loop has no visible jump (identical frames, proven).
* **No restart on data refresh.** `live-page.js` rebuilds the scene on every `state` event and `scene-page.js` re-renders in place. The new plate takes the same wall-clock phase, so the background continues where it was. The waiting screen's 60 s refresh is seamless too.
* **Scene switch.** The old plate fades out and the new one fades in, both with the same phase, so the crossfade shows no jump.
* **Several sources** (two OBS browser sources, or the PNG preview and OBS) show the same frame at the same moment.
* **Cost.** Only `transform`/`opacity` animate: no layout and no paint per frame. Measured in headless Chrome 157 on the real GPU (RTX, D3D11), 1920×1080, with a forced ~120 fps frame clock, CPU of the whole browser process tree, median of 3 (`jobs/proto/exp/cpu-median.txt`, `cpu-count.txt`):

  | | still | Drift | Rays | Embers 16 | Embers 32 |
  |---|---|---|---|---|---|
  | % of one core @ ~120 fps | 1–2 | ≈ 2 (same as still) | ≈ 8 (noisy: 0.7–22) | ≈ 13 | ≈ 25 |

  Embers costs about 0.7 % of a core per spark at 120 fps, roughly half that at OBS's usual 60 fps. That is why intensity also sets the count: Normal (24) is about 9 % at 60 fps and Subtle (16) about 6 %. In the first version every spark had a separate sway animation, which cost 17.7 % of the main thread at 120 fps. Merging it into one animation per spark cut that to 7.7 %. Without a page frame clock (live.html has none) the main thread stays at 0.05–0.09 %. Acceptance check for coders: in OBS (Stats panel), switching a source from None to Embers/Normal raises OBS CPU by less than 3 % on the streaming PC, and *render lag* stays 0.
* **3.8 MUST FIX.** `anim.js animateOut()` runs `root.getAnimations({ subtree: true }).forEach(a => a.finish?.())`. On the infinite background animations `finish()` throws `InvalidStateError` (verified in Chrome 157). The rejection aborts `pump()` in `live-page.js` and the old scene stays on air. Change it to:

```js
for (const a of root.getAnimations({ subtree: true })) {
  if (a.effect?.getComputedTiming().endTime === Infinity) continue;   // background loops keep running during the exit
  a.finish();
}
```

### 4.7 Background UI in the designer

**New tab: Background** (between Icons and Assets). Left panel:

```
ALL SCREENS
  [●] Show the background image                     (toggle → backgrounds.default.show)
  Motion
  [ None ] [ Drift ] [ Rays ] [ Embers ]            (cards with a 160×90 looping mini preview; radiogroup)
  Speed      ( Slow | Normal | Fast )               (segmented; hidden when motion = None)
  Intensity  ( Subtle | Normal | Strong )

THIS SCREEN · Starting soon
  (•) Same as all screens   ( ) Custom for this screen
      [●] Show the background image
      Motion  ( None | Drift | Rays | Embers )

ALL SCREENS AT A GLANCE
  Starting soon       Default · Rays
  Schedule            Off                 [Show]
  Versus              Custom · Embers     [Show]
  …                   (click a row to preview that screen)

IMAGES
  The pictures behind the graphics belong to the tournament.  [Change images…]   (opens the background panel in a drawer)
```

* The mini previews are `bg-anim.html`-style plates scaled to 160×90 using the tournament's main plate. They play only while hovered or focused (and never with reduced motion), to keep the control panel light.
* Hint under Motion: **"Motion plays in OBS and on live.html. PNG exports show a still frame."**
* Hint under Show: **"Off makes the graphic transparent, ready to place over gameplay or a camera. Any URL with bg=0 is always transparent."**
* Quick-actions bar (above the preview, every tab): **Background** On/Off segmented for *this screen* plus a **Motion ▾** menu (writes the screen override, or clears it when equal to the default) and **▶ Play motion / ❚❚ Pause motion**.

### 4.8 Acceptance criteria: background

1. Old presets and applied designs without `backgrounds` render exactly as before (pixel diff 0 on the PNG of every scene).
2. Background tab → All screens → Show off → Apply. `scene.html?scene=schedule` has no `.plate` and has `.bg-off`. The PNG export is transparent outside the content.
3. Same, with `&bg=1` in the URL: the plate is shown.
4. Background on, motion Rays → `scene.html?scene=schedule&bg=0`: no plate, no motion.
5. Motion Rays on Schedule only (custom for this screen); others default None. Only the Schedule plate has `data-bga="rays"`.
6. In OBS / live.html with Rays on: change a match score. The scene re-renders and the rays do not jump or restart (record 10 s; the motion is continuous).
7. Switch the live scene from Schedule to Versus (both with motion). The crossfade has no jump and the exit animation runs (D13 fixed). The next scene appears.
8. PNG export with Embers: sparks are visible and frozen. Two exports in a row are identical. `data-ready` appears as fast as without motion.
9. With Windows *Animation effects* off, live.html shows the frozen frame. With `&motion=rays` the rays move.
10. Speed Slow makes every period 1.5× longer (the drift push takes 36 s each way). Intensity Subtle visibly reduces brightness and shows 16 sparks instead of 24; Strong shows 32.
11. Designer: the Background tab opens with motion playing in the preview. **❚❚ Pause motion** freezes it. Other tabs open paused.
12. A preset with `backgrounds: { default: { motion: 'lightning' }, screens: { future: { show: false } } }` loads. The unknown motion becomes `none` and the unknown screen is dropped. A preset with `show: 'yes'` is rejected with "Background visibility must be on or off".

---

## 5. Small layout simplifications of the designer (realistic scope)

1. **Interactive preview everywhere** (D1). The wide preview grid of the Layout tab (`.design-layout.is-layout`: 300–360 px controls + preview) becomes the layout of every tab. The preview is the main canvas.
2. **Quick-actions bar** above the preview (replaces the two selects in the panel header):
   `Screen ▾ · Data ▾ │ ↶ Undo  ↷ Redo │ Background (On|Off) · Motion ▾ · ▶ Play motion`
3. **Hint strip** under the preview, muted 12 px:
   **"Click to select · Drag to move · Double-click to edit text or replace an image · Esc selects the parent"**
4. **Text tab ↔ preview link.** Selecting a text element in the preview scrolls its card into view and highlights it (reuse `focusSlot`). Focusing a card selects the element in the preview.
5. **Tabs:** Fonts · Text · Layout · Icons · **Background** · Assets · Presets. A later phase can merge Text + Layout into one **Elements** inspector (selected element: text, font, size, visibility, position). Not in this scope.
6. Rename the Assets tab's *Accent colours* hint "Background images stay with the tournament" to **"Background images and motion: see the Background tab."**

### 5.1 Acceptance criteria: layout

1. On the Fonts tab, single-clicking the title in the preview selects it and shows the toolbar. Dragging moves it, and the change appears in the Layout tab list (dot marker).
2. The quick-actions bar's Undo undoes text, layout, icon and background changes in reverse order.
3. At 1280 px width the designer stacks (existing breakpoint) and the toolbar stays inside the preview canvas.

---

## 6. Build checklist for coders

- [ ] `shared/graphic-design.js`: `BG_*`, `EMPTY_DESIGN.backgrounds`, `assets.iconPicks`, normalize rules, `resolveBackground()`.
- [ ] `overlay/js/core.js`: tri-state `bg`, `motion` flag, `RESERVED`.
- [ ] `overlay/js/render.js`: resolve the background before render; `c.bg`, `c.bgMotion`, `c.bgSpeed`, `c.bgIntensity`, `c.bgForce`.
- [ ] `overlay/js/ui.js plate()`: `data-bga`, `data-framed`, `.bga-force`, CSS vars, `.bga-fx` (+32 `<i>` for embers). `leagueLogo()`: `data-icon-slot="Emblem"` on the default emblem. `teamLogo`/`crest`/`playerPhoto`: `data-ref`.
- [ ] Scene renderers: `data-ref` on match, team, player and sponsor containers (2.6).
- [ ] `overlay/js/anim.js`: skip infinite animations in `animateOut()` (**must**).
- [ ] `overlay/js/live-page.js`: `bg`/`motion` in `effective()` and `keyOf()`.
- [ ] `overlay/{scene,live}.html`: link `css/bg-anim.css`.
- [ ] `overlay/js/scene-page.js`: designer `motion` flag toggles `is-static`; defer previews while editing text.
- [ ] `overlay/js/layout-editor.js`: always enabled; `dblclick` routing; remove the click-again parent cycle; Esc = parent; `rect` in selection messages; inline text edit; ignore pointer events in `.te-edit`.
- [ ] `overlay/js/graphic-design.js`: icon precedence with `iconPicks`.
- [ ] `control/js/sections/designer.js`: floating toolbar and popovers (parent page), unified history, Background tab, quick-actions bar, `text-commit` handling, drawer integration (`teams/players/matches/sponsors.edit`).
- [ ] `control/css/designer.css`: toolbar, popover, Background tab, quick-actions bar.
- [ ] `sections/help.js`: Motion select for URLs.
- [ ] `docs/GRAPHICS-DESIGNER.md` and `docs/CONTRACT.md`: new gestures, `motion=` flag, `bg=1`, background settings.
- [ ] Tests: `normalizeDesign` (backgrounds, iconPicks), `resolveBackground`, `readFlags`, and a Puppeteer check of a scene with motion that verifies `animateOut()` resolves.
