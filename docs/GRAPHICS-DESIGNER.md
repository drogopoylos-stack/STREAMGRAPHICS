# Shared Graphics designer

Open **Graphics designer** in the side menu. Its editor, built-in designs and custom preset library are shared by all tournaments. A preset contains fonts, text overrides, visibility, per-field font/size settings, element layout, icons and frame/box styles for all screen categories. Team, player, match and sponsor records remain tournament data.

## Panels

- **Fonts**: choose fonts for headlines, names/body, labels and scores/times. Each role has a sample, Greek sample and a description of where it applies. Fonts are served locally; no external font service is required. Each text field can override its role's font.
- **Text**: select a screen in the preview panel, then change its messages and captions, toggle visibility or set a font/size. Blank text keeps the automatic/original text. Names, dates, scores, roles and other data fields keep their automatic values, with visibility/font controls. Fields absent from the current layout or data are identified, and their settings are still saved for when those elements appear.
- **Layout**: move and resize the elements of the selected screen directly in the preview. Click an element to select it, or choose it in the list. Drag to move; guides show alignment with the screen and with other elements (hold Alt to turn them off). Corner handles scale with the same proportions. Side handles change the width or height, and text fits itself to the new box; logos and photos have corner handles only. Click a selected element again to select the larger element around it. Arrow keys move 1 px, Shift+arrow 10 px. Ctrl+Z / Ctrl+Y undo and redo. Elements that repeat (rows, cards, match boxes) move together; turn on **Only this one** to place one of them alone. Each screen has its own layout; other elements stay where they are.
- **Icons**: choose the icon style for all screens: **Classic** (the original icons), **Hoplite**, **Lane map** or **Hex badge**. A style covers the player roles, the coach, the unknown-team shield and the default tournament emblem. Under **Your own icons**, upload an image for any icon; it replaces that icon of the style and is saved as a 256 px PNG. **Use the theme colour** colours one-colour uploads with the tournament theme. A logo that a tournament has uploaded stays in place; the emblem icon only replaces the default trophy.
- **Assets**: choose a screen-frame overlay, glass/solid/outline boxes, corner radius, opacity and optional accent colour overrides. Background images remain tournament assets. Borders baked into a background image cannot be removed by changing an overlay frame.
- **Presets**: save new designs, update or delete custom presets, load designs, and choose the default for new tournaments. Built-in presets are read-only and can be used as starting points for new custom presets.

Reusable text tokens: `{tournament}`, `{short}`, `{season}`, `{date}`, `{stage}`, `{team}`, `{teamA}`, `{teamB}`. Text is rendered as plain text, including any angle brackets. Data names should be edited in the Teams/Players/Rosters panels rather than hard-coded into a shared preset.

## Preview and apply

Draft changes update only the designer preview. Select another screen, match, roster, bracket or schedule to check it. Missing teams/players use sample data for preview only; actual empty schedules show their empty-state message. Landscape and portrait previews use the same render pipeline as the live master URL and PNG exports.

**Save as preset** stores a reusable design. **Apply to current tournament** takes an independent copy of the current draft for that tournament. Changing or deleting the library preset later does not change applied copies. Apply again to use an updated preset. Original broadcast restores the existing screen styling and automatic copy.

The Add tournament dialog includes a **Graphics preset** selector, initially set to the shared default. Changing the library's default affects tournaments created afterward. Existing tournaments retain their applied design. Drafts are saved automatically in the browser and survive navigation, reloads and tournament switches.

After applying, live browser sources update over SSE. Newly exported PNGs use the applied design; previously exported PNGs are static files.

## Extension points

`public/shared/graphic-design.js` registers fonts and semantic text slots by scene. Slots describe a stable key, label, selector, font role and whether static text can be overridden. New screens can register these slots or add corresponding `data-design-slot` elements. Icon sets are in `public/shared/icon-sets.js`: every set draws every slot of `ICON_SLOTS` on a 24×24 grid in `currentColor`. `DESIGN_ELEMENTS` in `graphic-design.js` lists what the Layout tab can move: a stable id, a label, a selector and a `fixed` flag for elements that keep their proportions. A new screen adds its elements there. Overrides persist as `layouts[scene][id]` or, for one repeated element, `layouts[scene]["id#index"]`, with the values `{ x, y, s, w, h }`: move in pixels, scale, and width / height in pixels. The shared renderer applies the design before fonts load and text is fitted. Native brackets can be styled; the contents of third-party bracket embeds stay under that site's control.

Custom presets persist in the root database's `designLibrary`; applied copies persist in each tournament's `settings.graphicDesign`. Library and applied-design revisions prevent stale edits from silently overwriting newer changes. Design preview is read-only with respect to tournament records.
