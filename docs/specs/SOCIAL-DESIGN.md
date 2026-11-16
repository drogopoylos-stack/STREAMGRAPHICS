# Social posts and stories: design spec (HLL + SUPERCUP 2026)

Status: design ready for implementation, 2026-11-16. Owner: UI and style lead.
Prototypes (pixel reference, real SUPERCUP data from `/api/state`): `jobs/proto/social/*.html`, rendered PNGs in `jobs/proto/social/shots/`.
Re-render all PNGs: `node jobs/proto/social/render.mjs [filter]` (serves the folder on :4688, proxies `/media`, `/brand`, `/overlay` read-only from :4610). Data snapshot: `python jobs/proto/social/prep-data.py` (reads `state.json`, `data-bracket.json`, `data/db.json`).

This replaces the current `social-schedule`, `social-versus`, `social-roster` scenes (`public/overlay/js/scenes/social-*.js`, `public/overlay/css/social.css`). Those have small logos, large empty areas, a meander border (not an HLL motif) and one 9:16 size only.

---

## 0. Index of deliverables

| # | Type | Prototype | PNGs (shots/) |
|---|---|---|---|
| A | Match day / schedule (1-6 matches) | `01-matchday.html` | `01-matchday-{hll,sc}-{post,story}.png`, `-sc-post-6`, `-sc-story-6`, `-hll-post-1`, `-sc-post-bgoff` (transparent) |
| B | Match poster (versus), optional player cut-outs | `02-poster.html` | `02-poster-{hll,sc}-{post,story}.png`, `-hll-story-players`, `-sc-post-players`, `-hll-post-bgoff` |
| C | Result / final score | `03-result.html` | `03-result-{hll,sc}-{post,story}.png` |
| D | MVP / player spotlight | `04-mvp.html` | `04-mvp-{hll,sc}-{post,story}.png` |
| E | Roster reveal | `05-roster.html` | `05-roster-{hll,sc}-{post,story}.png` |
| F | Standings (round robin, up to 10) | `06-standings.html` | `06-standings-{hll,sc}-{post,story}.png`, `-sc-post-10` |
| G | Bracket progress (compact) | `07-bracket.html` | `07-bracket-{hll,sc}-{post,story}.png` |
| H | Story only: Live now / Next match countdown | `08-live.html` | `08-live-{hll,sc}-story.png`, `08-next-{hll,sc}-story.png` |
| - | Stress test: long Greek names, 4 fonts | `09-stress.html` | `09-stress-sc-post-{play,sofia,anton,graduate}.png`, `09-stress-hll-story.png` |
| - | Font comparison on the poster | `02-poster.html?font=` | `10-font-{play,sofia,anton,graduate}-poster-hll-post.png` |
| - | Safe zones + grid overlay | `11-safezones.html` | `11-safezones-story.png`, `11-safezones-post.png` |
| - | System sheet (palettes, fonts, scale, components) | `12-system.html` | `12-system-sheet.png` (2160x1350) |
| - | Motion styles, static PNG frame | `01-matchday.html?motion=` | `13-motion-{drift,rays,embers}-sc-story.png`, `13-motion-embers-hll-post.png` |

Prototype query params: `family=hll|sc`, `format=post|story`, `font=sofia|play|anton|graduate`, `bg=0` (background off, transparent PNG), `motion=drift|rays|embers`, plus per type `n=` (matches / rows), `players=1`, `mode=next`.

Shared prototype code to port: `jobs/proto/social/social.css` (tokens, stage, components), `social.js` (helpers: Greek caps, dates, laurel/arcs SVG, fit, distress filter), `fonts.css` (composite font faces).

---

## 1. Two families, one system

Both families share the grid, the type system, every component and every layout. Only tokens, the brand mark and copy differ.

| | HLL (league) | SUPERCUP 2026 (event) |
|---|---|---|
| Mood | 2027 hll.gr: black stage, antique gold, light rays, laurels, Spartan crest | Same stage in navy; gold for headlines and the centre panel, light blue for secondary info |
| Brand mark | HLL crest (white hoplite, from hll.gr), `assets/crest-white.png` | Type-only lockup "SUPER**CUP**" + light-blue band "HLL ... 2026" + V chevron (no image) |
| Mark on the gold panel | Crest as a mask in ink `#0b0b09` | Lockup in navy (`.sc-mark.on-gold`) |
| Event line | `WINTER SPLIT 2027` (mock; editable) | `SUPERCUP 2026` (`settings.leagueName`) |
| Hashtag in footer | `#HLLWinter2027` (mock) | `#HLLSuperCup` |
| Rim light on cut-outs | gold both sides | gold side A, light blue side B |

Implementation: one class on the scene root, `fam-hll` or `fam-event`. HLL tokens are fixed. Event tokens come from the tournament theme so the next event can reuse the family: `--ink = theme.primary`, `--gold = theme.accent`, `--acc2 = theme.accent2` (SUPERCUP: `#0a1828`, `#d6a44c`, `#8bbaec`). Highlights and shadows derive from them (see token table). New setting: `settings.socialFamily = 'hll' | 'event'`, default `event` for any tournament that is not `tr_hll`, exposed in Graphics designer > Assets.

### 1.1 Tokens

| Token | HLL | SUPERCUP 2026 | Use |
|---|---|---|---|
| `--ink` | `#0b0b09` | `#0a1828` | page base, text on gold |
| `--ink-2` | `#16150f` | `#0f2238` | second dark |
| `--panel` | `rgba(18,17,12,.86)` | `rgba(9,23,40,.86)` | chamfered boxes |
| `--gold-hi` / `--gold` / `--gold-lo` | `#f8e6a8` / `#d4ad55` / `#8a6f36` | `#f6dc9c` / `#d6a44c` / `#7f5f27` | gold gradient 180deg hi 0% -> gold 48% -> lo 100% (`.gold-text`) |
| `--acc2` | `#efe7cc` (champagne) | `#8bbaec` (light blue) | secondary info only: kickers (dates), round names, "SUBS", LIVE kicker |
| `--text` | `#f7f3e4` | `#ffffff` | headlines, tags, nicks |
| `--muted` | text at 62% | `rgba(222,234,250,.66)` | full team names, labels, column heads |
| `--on-gold` | `#0b0b09` | `#0a1828` | everything printed on the gold panel |
| rays light | `255,224,158` | `170,210,255` | stage rays and `--bga-light` |

Never: red/coral (2026 season), acid yellow `#f1e55b`, a third accent colour, rounded corners, glassmorphism, the meander. Team colours appear only as soft glows behind logos and as a 20% wash at row ends; grey/white/black team colours (spread < 40 or max < 70) get no wash.

### 1.2 Brand marks

- HLL crest: white recolour of `jobs/research/ig/samples/hllgr-crest.png` (600x730, aspect 0.822). Ship as `public/brand/hll-crest-white.png` (copy of `jobs/proto/social/assets/crest-white.png`). Do not use `/brand/hll-logo.png` here (it has a tile background and red accents). On the gold panel use it as a CSS mask (`.crest-mask`, `background: var(--on-gold)`).
- SUPERCUP lockup (`scMark(u)`, scale `u`, `u=1` is the header size, 128 px tall): word in headline font Sofia Sans Extra Condensed 84u px, line-height .82, "SUPER" in `--text`, "CUP" in the gold gradient, 2u px gap; band 7u px below, 30u px tall, `--acc2` fill, ink text Play 700 17u px, tracking .16em, "HLL" left, "2026" right, 9u px side padding; V chevron 40u x 14u centred under the band. The word in the lockup is always Sofia (it is a logo, it does not follow the font switch). Editable text slots: `lockupA` ("SUPER"), `lockupB` ("CUP"), `bandL` ("HLL"), `bandR` ("2026").
- Placement: header top-left (both families, 128 px tall); inside the gold centre panel (poster/result: crest 140/150 px, lockup u=.92/1.0). Never over a face, never smaller than 90 px tall, never on a photo without a panel behind it.

---

## 2. Canvas, grid, safe zones

| | Post (feed 4:5) | Story (9:16) |
|---|---|---|
| Size | 1080 x 1350 | 1080 x 1920 |
| Outer margin x | 64 | 64 |
| Content width | 952 (x 64..1016) | 952 |
| Columns | 12 x 57.33 + 11 gutters x 24 | same |
| Spacing unit | 8 (all gaps are multiples of 2, mostly 8/12/16/24) | same |
| Safe area y | 48 (header top) .. 1294 (footer bottom) | 250 .. 1580 |
| Unsafe | profile grid shows 4:5 posts cropped to 3:4: x < 34 and x > 1046 are cut in the grid; keep text inside 64..1016 | top 0..250 (progress bar, account) and bottom 1580..1920 (reply bar, stickers): decoration only, no text, no logos, no faces |
| Header | top 48, height 128 | top 266, height 128 |
| Title block top | 226 | 444 |
| Content zone (default) | 496..1190 | 744..1446 |
| Footer box | 1216..1294 (bottom = H - 56) | 1490..1568 (bottom = H - 352) |

The story bleed bands carry: the top light source and rays, the top-left laurel (220 px at 20,20), the bottom-right laurel (220 px at right 20, bottom 30), the floor glow, outline numerals. See `shots/11-safezones-story.png` and `11-safezones-post.png`.

---

## 3. Type system

Font roles (Graphics designer > Fonts):

| Role | Default | Use |
|---|---|---|
| Headline (switchable, 4 options) | Sofia Sans Extra Condensed 900 | page headlines, team tags, nicks, VS, scores, times, stat values, numerals |
| Label | Play 700 (hll.gr web font), tracked caps | kickers, category chip, event line, column heads, footer URL and hashtag, BO chips |
| Body | Fira Sans Condensed 600 (already shipped) | full team names in rows, notes |
| Numbers | = Headline | scores, times |

### 3.1 Headline font switch

Each option is one composite `@font-face` family: the Latin file plus a Greek-capable partner limited to `U+0370-03FF`, all declared with `font-weight: 100 900` so a one-weight file is never faux-bolded (`font-synthesis: none`). Copy `jobs/proto/social/fonts.css` and point the URLs at the @fontsource files.

| Option id | Family stack | Latin | Greek | `--hs` (size factor) | tracking | line-height |
|---|---|---|---|---|---|---|
| `sofia` (DEFAULT) | `'SD Sofia'` | Sofia Sans Extra Condensed 900 | same | 1.00 | .004em | .86 |
| `play` | `'SD Play'` | Play 700 | same | .80 | -.012em | .90 |
| `anton` | `'SD Anton'` | Anton 400 | Sofia Sans Extra Condensed 900 | .80 | .008em | .90 |
| `graduate` | `'SD Graduate'` | Graduate 400 | Roboto Slab 900 | .70 | -.01em | .95, plus `-webkit-text-stroke: .02em` on D1/D2/H1 (Graduate has only a light weight) |

Every headline size below is multiplied by `--hs` and every headline is fitted to its box, so a wide font cannot overflow. Why Sofia as default: punchiest in Latin and Greek with one coherent design, fits long Greek names (see `10-font-*` and `09-stress-*`). Play is the closest to hll.gr; Graduate reads light and is the weakest for posters.

Install (the font list for coders):
- `@fontsource-variable/sofia-sans-extra-condensed` (or static `@fontsource/sofia-sans-extra-condensed` 700/800/900) - headline default + Greek partner of Anton - latin, latin-ext, greek
- `@fontsource/play` (400, 700) - label role + headline option - latin, latin-ext, greek
- `@fontsource/anton` (400) - headline option - latin, latin-ext
- `@fontsource/graduate` (400) - headline option - latin
- `@fontsource-variable/roboto-slab` (900) - Greek partner of Graduate - greek (+ latin-ext)
- already installed: `@fontsource/fira-sans-condensed` (body). Serve only latin, latin-ext, greek woff2. The PNG renderer must `await document.fonts.ready` before the screenshot.

### 3.2 Scale (px on the 1080 canvas, before `--hs`)

| Token | Size / line-height | Font | Where |
|---|---|---|---|
| D1 | 240-300 / .80 | headline | VS (300 post), score (230), MVP ghost (700) |
| D2 | 150-196 / .86 | headline | page headline (matchday 168 post, 196 story; others 150 post, 168-176 story), poster tags 150 |
| H1 | 112-132 / .86 | headline | feature tags, big times, team name headline |
| H2 | 72-100 / .86 | headline | row tags, row times, stat values 80 |
| H3 | 48-56 / .9 | headline | compact tags, nicks in cards (56), bracket tags |
| Kicker | 28 / 1, tracking .26em, caps | label | Greek date above the headline, `--acc2` |
| Label | 18-22 / 1, tracking .18-.24em, caps | label | category chip, column heads, BO chips |
| Body | 26 / 1.2 | body | sub line, full names (22 in rows) |
| Minimum | 22 for any text the reader must read; 18 only for auto-shrunk full names and secondary labels inside dense components | | |

Casing: all headlines and tags in caps. Greek in caps WITHOUT tonos (dialytika kept): use `caps()` from `social.js` (`normalize('NFD')`, remove U+0301/0300/0342, `toUpperCase()`), or `text-transform: uppercase` with `lang="el"`. Greek dates: `ΣΑΒΒΑΤΟ 21 ΝΟΕΜΒΡΙΟΥ` (long), `ΣΑΒ 21/11` (short), `21.11` (on the panel). The current `dayLabel()` returns sentence case with accents; convert on the client.

Headline pattern: two words, the second in the gold gradient (`MATCH` + `DAY 4`, `ROAD TO` + `TOP 4`, `WE ARE` + `LIVE`, `SPLIT 3` + `TABLE`). Kicker above in `--acc2` (Greek), sub line below in `--muted` body caps.

### 3.3 Fitting long names and Greek text (rules, proven in `09-stress-*`)

1. Team tags (3-6 chars, Latin or Greek): one line, never wrap; shrink to fit the box (`fit()`), no minimum because the box is sized for 6 chars at >= 60% size.
2. Headline team names (roster): up to 2 lines at the nominal size (`data-lines=2`), shrink until 2 lines fit; example `ΑΘΛΗΤΙΚΟΣ ΣΥΛΛΟΓΟΣ ΗΛΕΚΤΡΟΝΙΚΩΝ ΑΘΛΗΜΑΤΩΝ ΘΕΣΣΑΛΟΝΙΚΗΣ` lands on 2 lines.
3. Full names under tags (rows, poster band): max 2 lines, shrink from 22-24 to min 18, then clamp with an ellipsis (`-webkit-line-clamp: 2`).
4. Nicks in cards/stats: one line, shrink (`MPAKALOGATAKI` fits a 180 px card at about 70%).
5. Missing logo: dashed light-blue shield tile with the first 3 letters of the tag (never the full name).
6. Fit implementation note: with tight line-heights, glyph overflow makes `scrollHeight` exceed `lines x line-height` by ~.15em; test against `(lines + .35) x line-height`, and read unitless `line-height` as `value x font-size` (see `fitAll()` in `social.js`). The app's `fit()` must support `data-lines` and `data-min`.

---

## 4. Shared components

| Component | Spec | Class (prototype) |
|---|---|---|
| Stage (background plate) | 3 radial gradients: top light source (56% x 30% at 50% -6%, rays light 40%/34%), floor glow (80% x 18% at 50% 104%, gold 30%/26%), body (130% x 70% at 50% 38%: HLL `#1d1a12 -> #0e0d0a 52% -> #050504`; SC `#143056 -> #0a1828 50% -> #040b15`); static conic rays from (50%, -60 px) 2600x2000, masked radially, opacity .9; grain (SVG fractal noise .85, 3 octaves) at 7% screen; vignette shade. | `.plate .plate-img`, `::before` rays, `::after` grain, `.plate-shade` |
| Arcs | thin gold quadratic curves past TL and BR corners, 2 px + 1 px parallel at 50%, gradient fading to 0 at both ends | `arcs()` |
| Laurel | SVG sprig, 9 leaf pairs along a curve + tip, gold gradient (lo -> gold -> hi); corners in stories only (220 px); as a wreath (ink, 104 px, mirrored pair, -26 px overlap) around the winner tag | `laurel()` |
| Outline numeral | headline font, `color: transparent`, `-webkit-text-stroke: 2px rgba(gold,.16)`; e.g. matchday "04" | `.sd-numeral` |
| Header | brand mark left; right: category chip (label 22, gold text, 1.5 px gold border, padding 11/16) + event line (label 20, tracking .2em, muted) 12 px below | `header()` |
| Footer | 1.5 px gold hairline (fades 0 -> 75% at 18% -> 75% at 82% -> 0); twitch glyph 30x32 gold + `twitch.tv/HellenicLegends` (label 26, tracking .04em) left; hashtag (label 24, gold) right; bottom-aligned, 6 px bottom padding | `footer()` |
| Chamfered box | corners cut top-left and bottom-right (`--c` 14-26 px); 1.5 px border gradient 135deg (gold 95% -> 22% -> 22% -> 95%); fill `--panel` (+ optional team washes) | `.cham` (two clip-path pseudo layers so the diagonal edge also has a border) |
| Gold centre panel | THE signature: vertical gold plate (180deg `#f3d895 -> gold 34% -> #c39443 72% -> #a77a34`) with a subtle brushed noise (multiply 22%), bottom cut into a V (64 px deep on posters, 20 px in rows, 12 px in compact rows). Everything on it is `--on-gold`. | `.gpanel` |
| VS | headline font, `--on-gold`, distressed by the SVG filter `#sd-distress` (displacement 9 px + speckle + horizontal scuffs) | `.vs` |
| Chips | 40 px tall, label 20, tracking .18em: `gold` (gold fill, ink text), `line` (gold border), `blue` (acc2 border); LIVE pill 52 px | `.chip` |
| Cut-out photo | `object-fit: contain`, bottom-anchored; `filter: saturate(.86) contrast(1.06) drop-shadow(0 0 1.5px rim) drop-shadow(0 0 16px rim 55%)`; bottom fade mask (72% -> 98%); never mirrored (jersey text) | `.cutout` |
| Team glow | radial (closest-side) team colour 42% -> 12% at 55% -> 0, box = logo + 240 px (+320 for a winner) | `.logo-glow` |
| Sticker dock (story) | empty 640x108 area with gold corner brackets (34 px, 3 px) and a label above; reserved for the Instagram link / countdown sticker | `.dock` |

---

## 5. Per type

Coordinates are absolute px (x from the left, y from the top) on the 1080-wide canvas. "Post / Story" columns give both. Every type has the standard header and footer (section 2) unless stated.

### A. Match day / schedule (1-6 matches) - `social-schedule`

Layout (`01-matchday-*`):

| Element | Post | Story |
|---|---|---|
| Category chip | `MATCH DAY` (`SCHEDULE` when the matches span several days) | same |
| Kicker | y 226, `ΣΑΒΒΑΤΟ 21 ΝΟΕΜΒΡΙΟΥ` (multi-day: `ΠΑΡ 06/11 — ΚΥΡ 15/11`) | y 444 |
| Headline | 18 below kicker, 168 px: `MATCH` + gold `DAY 4` (multi-day: `THE` + `WEEK`) | 196 px |
| Sub | 18 below, body 26 caps muted: `{EVENT} · {ROUND NAME}` | same |
| Rows zone | y 496..1190, rows centred vertically | y 744..1446 |
| Numeral | `04` outline, 700 px, right -70, top 96 | 820 px, right -40, top 1450 (bleed) |

Density by match count:

| n | Mode | Row height | Gap | Logo | Tag | Centre plate | Time |
|---|---|---|---|---|---|---|---|
| 1 | L feature | min(560, zone) | - | 290, stacked above tag | 132 | 230 wide, `VS` + time + BO | 120 |
| 2-3 | M | min(300, (zone - 24(n-1))/n) | 24 | 152 | 100 (box 176 wide) + full name 22 (2 lines) | 196 wide | 84 |
| 4-6 | S | min(132 post / 150 story, (zone - 14(n-1))/n) | 14 | .66 x row | .5 x row (box 170), no full name | 210 wide, V 12 px | .42 x row; one meta line `ΠΑΡ 06/11 · BO3` |

Row: chamfered box (c 26, S 18), sides inset 26 (S 18), logo-text gap 22 (S 18); team A left-aligned, B mirrored. Centre gold plate full row height: `VS` label 20, time in headline, `BO3` label 18 (+ `· NO CAST` when `streamWithCast === false`). Finished match: score instead of time (winner digit full ink, loser 45% ink, dash 55%), loser logo grayscale 45% opacity, loser tag muted, label `FINAL`. Live match: label `● LIVE`.
More than 6 matches: paginate (6 per page, like today), page `n/m` goes into the event line.

Data: `matches[]` with `teamA/teamB` objects, `time`, `bestOf`, `status`, `scoreA/B`, `date`, `streamWithCast` - all exist. NEW: `round` (bracket round name containing the match, from bracket definitions) and `matchday` number (parse `Day (\d+)` from `stage`, or a new field); both optional (fallback: headline `MATCH DAY`, sub without round).

Editable text (designer slots): `kicker` (default `{date}`), `headline1` (`MATCH`), `headline2` (`DAY {matchday}`), `sub` (`{tournament} · {round}`), `category` (`MATCH DAY`), `event` (`{tournament}`), `hashtag`, `vsLabel` (`VS`), `finalLabel` (`FINAL`). Data: names, tags, times, scores (visibility + font only).

### B. Match poster (versus) - `social-versus`

Layout (`02-poster-*`):

| Element | Post | Story |
|---|---|---|
| Gold panel | x 390, w 300, y 0..1020 (V tip at 1020, shoulders 956) | x 376, w 328, y 0..1270 |
| Logos | 700x700 at y 220; A at x -232, B at x 612 (cropped by the frame edge and by the panel) | 900x900 at y 380; A x -330, B x 510 |
| Team glow | logo box + 120 px each side | same |
| Panel: brand mark | top 50 (crest 140 / lockup .92) | top 268 (crest 150 / lockup 1.0) |
| Panel: kicker (round) | top 254, width pw - 48, fit, label 21 | top 470 |
| Panel: VS | top 312, 300 x hs, distressed | top 540 |
| Panel: BO chip | top 580 (`BEST OF 3`, 2 px ink border) | top 800 |
| Panel: day + date | top 670: `ΣΑΒΒΑΤΟ` label 22 + `21.11` 64 x hs | top 880 |
| Panel: time | top 790, 120 x hs | top 990 |
| Tag band | y 1030: tag 150 x hs, box w 306 (A x 64, B right-aligned to 1016), full name label 24 (2 lines) 10 below | y 1288, box w 292 |
| Footer | standard | standard |

Player cut-out variant (`players=1`): one star player per team (captain with photo, else first starter with photo; the user can pick per side, like today's `playerA/playerB`). Rule: both sides or neither (if one side has no cut-out, show logos only). Photo height 760 post / 940 story, width .8 x height, bottom at y 1010 / 1270; A left = panel x - width + 150, B left = panel x + panel w - 150 (both tuck under the panel); logos drop to 34% opacity behind them. Nick + role label (22, `--acc2`) at bottom - 44 above each tag. See `02-poster-hll-story-players.png`, `02-poster-sc-post-players.png`.

Data: exists in `social-versus` (`match`, `teamA/B`, `playerA/B` with `photo`, `dateLabel`). NEW: `round` (as A). The old `effect` (halftone/prism) and `rosterStyle=text` lineup variant are retired for this poster.

Editable: `kicker` (`{round}`), `vs` (`VS`), `bestOf` (`BEST OF {bo}`), `day`, `date`, `time` (data, font only), `category` n/a (no header on the poster; the mark sits in the panel), `hashtag`.

### C. Result / final score - `social-result` (NEW scene id; same data as `social-versus`)

Same skeleton as B (`03-result-*`), changes:

| Element | Post | Story |
|---|---|---|
| Loser logo | pushed 90 px further out, `grayscale(1) brightness(.8)`, opacity .2 | pushed 120 px |
| Winner | glow box logo + 320 px at 80% | same |
| Panel kicker | top 254: `ΤΕΛΙΚΟ ΑΠΟΤΕΛΕΣΜΑ` (fit) | top 470 |
| Score | top 318, 230 x hs, width pw - 36, fit; winner digit 100% ink, loser 38%, dash 55% | top 548 |
| Chip | top 520: `FINAL · BO3` | top 760 |
| Winner block | top 610: `WINNER` label 18 + wreath (two ink laurels 104 px, mirrored, -26 px overlap) around the winner tag (92 x hs, max pw - 150) | top 850 |
| Advance line | 14 px under the wreath: ink box, gold label 19 `ΠΡΟΚΡΙΣΗ ΣΤΟ TOP 4` | same |
| Tag band | winner tag solid; loser tag outline (2 px `--acc2` 45%, no fill) | same |

Data: as B + `winnerId` (exists). NEW: `advance` text: from `bracketTree().qualifications` where `source.matchId === match.id` (e.g. `ADVANCE TO TOP 4 · GSL` -> `ΠΡΟΚΡΙΣΗ ΣΤΟ TOP 4`), else from the next bracket match (`→ {round}`), else hidden.
Editable: `kicker` (`ΤΕΛΙΚΟ ΑΠΟΤΕΛΕΣΜΑ`), `final` (`FINAL · BO{bo}`), `winnerLabel` (`WINNER`), `advance` (auto or free text).

### D. MVP / player spotlight - `social-mvp` (NEW)

Layout (`04-mvp-*`):

| Element | Post | Story |
|---|---|---|
| Ghost word | `MVP` outline, 700 x hs, stroke 3 px gold 38%, at (24, 196) | at (30, 360) |
| Cut-out | h 1136, w 909, at x 300, y 214 (cropped right), fade 72% -> 98% | h 1100, w 880, at x 100, y 330, fade 58% -> 88% |
| Team glow | 1040 circle centred on the photo, 75% | same |
| Scrim | - | y 820..1920, ink 0 -> 82% at 45% -> 94% |
| Kicker | x 64, y 300, `PLAYER OF THE MATCH` (`--acc2`) | centred, y 1018 |
| Nick | y 346, 200 x hs, box w 600, fit, text-shadow | centred, y 1060, w 952 |
| Meta row | y 540: role icon 34 (gold) + role + diamond + team logo 44 + tag (label 26, tracking .16em) | centred, y 1250, + `2–0 NXM` |
| Match line | y 600: `WLG 2–0 NXM · BO3` (label 22, muted) | merged into meta |
| Stat bar | x 64, y 1040, 952 x 150, chamfer 24, ink 78% -> 92%; 4 equal cells with 1.5 px gold dividers; value 80 x hs gold, label 19 muted | y 1316 |

Stats (4 cells): `KDA`, `K / D / A`, `KILL PART.`, `CHAMPIONS` (1-2 champion icons 70 px with 2 px gold border). Category chip `MVP`, event line `{EVENT} · {ΚΥΡ 15/11}`.

Data: NEW scene params `match`, `player`. Player (`nick`, `role`, `photo`, team) exists. Stats exist in the data model (`match.stats[]`: per game kills/deaths/assists/champion, `statDefs` for KDA/KP) but SUPERCUP has `statsCount: 0`, so the prototype stats are MOCKED. Required: per-match aggregate for the player (sum K/D/A, KDA = (K+A)/max(1,D), KP from team kills, champions played via `championIcon()`), plus a manual override per cell in the designer when stats are missing. If the player has no cut-out: show the team logo 520 px in the photo position (no ghost photo frame) and keep the rest.
SUPERCUP players currently have no photos; the prototype borrows the HLL-tournament cut-out with the same nick (Tsiper). Decide whether to copy photos across tournaments (open question).

Editable: `kicker` (`PLAYER OF THE MATCH`), `ghost` (`MVP`), 4 x (`statValue`, `statLabel`), `category` (`MVP`).

### E. Roster reveal - `social-roster`

Layout (`05-roster-*`):

| Element | Post | Story |
|---|---|---|
| Team logo | 280 at (748, 166) + glow (box + 160) | none at top (logo is in the 6th tile) |
| Kicker | y 226, `{EVENT} · ROSTER` | y 430 |
| Team name | y 268, box w 660, 132 x hs, fit one line (2 lines for very long, rule 3.3-2) | y 470, w 952, 130 x hs |
| Starters | 5 cards in a row: y 470, h 600, w 180.8, gap 12 (x = 64 + i x 192.8) | 3 x 2 grid: tiles 300 x 404, gap 26, y 640 (rows at 640 and 1070); order Top Jungle Mid / Bot Support + team tile |
| Bench | y 1112: `SUBS` (label 20 gold) + names (label 26), then `COACH` + names, 34 px between groups | in the 6th tile: logo 170, `SUBS`, `COACH` (label 18 + 22) |

Card: chamfer 20, fill ink 55% -> 95%; cut-out height 1.02 x card height, width .8 x that, top 6, centred, mask 62% -> 92%; name plate at the bottom with a 46 px gradient lead-in (ink 0 -> 90% -> 96%): role icon 22 + role (label 18, `--acc2`), nick 56 x hs fit; 4 px gold bar at the bottom centre (22%..78%). No photo: team logo watermark (1.1 x card width, grayscale, 10%) + role icon 128 px gold centred in the photo area (real WLG roster in `05-roster-sc-*`: 1 photo, 4 without). If no subs and no coach: `STARTING FIVE · {EVENT}`.

Data: exists (`team`, `players` with `role`, `lineup`, `photo`; `splitRoster()` and `LANES` in `scenes/common.js`; coaches = role `Coach`).
Editable: `kicker` (`{tournament} · ROSTER`), `subsLabel` (`SUBS`), `coachLabel` (`COACH`), `category` (`ROSTER`).

### F. Standings (round robin, up to 10 teams) - `social-standings` (NEW)

Layout (`06-standings-*`; real data: HLL Split 3 regular season, 28 Bo2 results):

| Element | Post | Story |
|---|---|---|
| Kicker | y 226 `ΒΑΘΜΟΛΟΓΙΑ · 7Η ΑΓΩΝΙΣΤΙΚΗ` | y 444 |
| Headline | 150: `SPLIT 3` + gold `TABLE` | 176 |
| Table | y 476..1192 | y 726..1456 |
| Head row | 40 px, label 18, `#`, `TEAM`, `W`, `D`, `L`, `+/−`, gold `PTS` | same |
| Row height | `floor((bottom - top - 40 - 22 - gap x N) / N)`, gap 8 (N <= 8) or 6 | same |
| Note | 22 px under the table: `TOP 6 → PLAYOFFS · BO2: ΝΙΚΗ 3 · ΙΣΟΠΑΛΙΑ 1` | same |

Grid columns: 84 rank | 64 logo | 1fr team | 66 W | 66 D | 66 L | 86 +/- | 104 PTS. Sizes relative to the row height `rh`: rank .62 rh (outline 1.6 px gold; leader: gold block with a cut corner and ink number), logo .7 rh, tag .56 rh + full name label 19 muted (ellipsis), W/D/L .4 rh (Sofia 800, tabular), +/- .32 rh muted, PTS .62 rh gold gradient. Rows above the cut: gold border; below: light-blue faint border, fill 55%, logos 50% grayscale. Playoff cut line: a 22 px band after row `cut`: dashed 2 px gold, label `▲ PLAYOFFS ▲` (label 16 gold) after the rank column. 10 rows still fit (`06-standings-sc-post-10`, rows 2 and 10 mocked).

Data: NEW. Rows from finished matches of one stage: W/D/L, game wins/losses, points. `teamRecord()` only returns w/l/played; add draws, `gw`, `gl`, `pts` and a sort (pts, game diff, head to head, tag). Settings: `stage` filter, points (win/draw/loss, default 3/1/0), `cut` (default 6), tie-break order. SUPERCUP has no round robin, so `06-standings-sc-*` shows the SUPERCUP styling with HLL data.
Editable: `kicker`, `headline1`, `headline2`, `note`, `cutLabel` (`PLAYOFFS`), column labels.

### G. Bracket progress (compact) - `social-bracket` (NEW, from `bracketTree()`)

Layout (`07-bracket-*`, real SUPERCUP "Single Elimination · Top 4"): rounds are columns, paths are lanes.

| Element | Post | Story |
|---|---|---|
| Kicker / headline | y 226, `SINGLE ELIMINATION · 12 ΟΜΑΔΕΣ` / 150: `ROAD TO` + gold `TOP 4` | y 444 / 168 |
| Column heads | y 476 (label 20): round names; last column gold | y 732 |
| Columns | c1 x 64 w 316, c2 x 420 w 316, c3 x 776 w 240 (40 px wire lanes between) | same |
| Lanes | 4, gap 16, lane h = (1192 - 516 - 48) / 4 = 157 | gap 22, h about 165 |
| Match box | chamfer 14, two team lines (logo .7 lh, tag .5 lh, score right; loser 40% + grayscale logo; winner score gold) separated by a 1 px gold 22% rule; scheduled: `ΣΑΒ 21/11` / `18:00` label 20 right-aligned in `--acc2` | same |
| Slot (qualified) | gold-tinted chamfer, 2 px border: logo .52 lane + tag .34 lane + `QUALIFIED` (label 19, gold) | same |
| Slot (open) | light-blue dashed `?` tile + `WINNER` / `TP / AIM` (label 19, `--acc2`) | same |
| Wires | SVG: done = gold 3 px; pending = `--acc2` 45% 2 px dashed 6/6; elbow at c1 right + 20 px down to the qualifier's lower line | same |

Generic rule for other brackets: max 3 columns per image (post) and 4 lanes; larger brackets show the last 3 rounds, or one image per half. GSL groups: columns `OPENING`, `WINNERS / ELIMINATION`, `DECIDER`, same boxes.
Data: exists (`bracket` scene: `tree.rounds[].matches[]` with teams, `qualifications[]`, `champion`).
Editable: `kicker`, `headline1`, `headline2`, column titles (default = round names), `qualifiedLabel`, `winnerLabel`.

### H. Story only: Live now and Next match - `social-live` (NEW, `mode=live|next`)

Layout (`08-live-*`, `08-next-*`):

| Element | Live | Next |
|---|---|---|
| Header | category `LIVE` | `NEXT MATCH` |
| Kicker row | y 452: gold pill `● LIVE` (52 px, ink dot 16 px) + `ΖΩΝΤΑΝΑ ΤΩΡΑ` kicker | y 452: `ΣΑΒΒΑΤΟ 21 ΝΟΕΜΒΡΙΟΥ` |
| Headline | 26 below, 230 x hs: `WE ARE` + gold `LIVE` | `NEXT` + gold `MATCH` |
| Match card | y 760, x 64..1016: logos 300 at card x 25 and 627 (+ glow), tags 112 x hs at +316, names label 20 at +426, gold mini panel x 444 w 192 h 420 (V 64): `GAME 2` / `1–0` (110 x hs) / `BO3` | y 712: same, panel shows distressed `VS` (130 x hs) + `BO3` |
| Twitch | y 1262: glyph 64 px gold + URL label 50 px, centred | - |
| Sticker dock | 640 x 108 at (220, 1372), label `ΠΑΤΑ ΤΟ LINK` above (40 px inside), for the IG link sticker | - |
| Countdown | - | date line y 1206 (`ΣΑΒ 21/11 · 18:00 · ΖΩΝΤΑΝΑ ΣΤΟ TWITCH`, label 22 `--acc2`); 3 tiles 290 x 190, gap 24, at y 1252: number 140 x hs gold, label `ΜΕΡΕΣ / ΩΡΕΣ / ΛΕΠΤΑ` |
| Bottom | NEXT row y 1500, 952 x 76, chamfer 18: `NEXT` label, time 54 x hs, logo 48 + tag, `VS`, tag + logo, hashtag right (no footer) | standard footer |

The countdown is computed at export time (`now` in `settings.timezone` to the match start); the user can add the IG countdown sticker on top. Days < 1: show `ΩΡΕΣ / ΛΕΠΤΑ / —` or switch to `ΣΗΜΕΡΑ 18:00` (headline `TODAY`).
Data: `live` (exists), match with `status === 'live'` and scores (exist; game number = scoreA + scoreB + 1), `nextMatch` (exists), the following match (next by date/time).
Editable: `liveLabel` (`LIVE`), `liveKicker` (`ΖΩΝΤΑΝΑ ΤΩΡΑ`), `headline1/2`, `cta` (`ΠΑΤΑ ΤΟ LINK`), `nextLabel` (`NEXT`), countdown labels, `gameLabel` (`GAME {n}`).

---

## 6. Background on/off and motion

Structure per scene (keep the existing `plate()` DOM so `bg-anim.css` applies unchanged):

```
<div class="sd fam-hll|fam-event fmt-post|fmt-story" data-font="sofia">
  <div class="plate plate-social" [data-bga="drift|rays|embers"]>   <- background (stage or tournament image)
    <div class="plate-img"></div>  <div class="plate-shade"></div>  <div class="bga-fx"></div>
  </div>
  <div class="sd-orn"> arcs svg + laurels </div>                     <- decoration, part of the background
  <div class="sd-numeral">04</div>                                    <- decoration, part of the background
  <div class="sd-c"> header, panels, logos, glows, photos, text, footer </div>
</div>
```

- Background ON: plate = the family stage (section 4) or, if the tournament has a social background (`theme.socialBgImage`), that image with the family shade on top. Ornaments visible.
- Background OFF (`ctx.bg = false`): no plate, no arcs, no laurels, no numerals, no MVP ghost; transparent PNG (`omitBackground`, and `html`/`body` background transparent; the prototype had to clear `html` too). Kept: chamfered panels with their own fill, the gold panel, logos with team glows, cut-outs, text. Small labels on the user's own background are their responsibility; recommend a dark background. See `01-matchday-sc-post-bgoff.png`, `02-poster-hll-post-bgoff.png`.
- Motion (`bg-anim.css`, unchanged): `drift` (push on `.plate-img` + travelling light), `rays` (animated god rays; hide the static fan: `.plate[data-bga="rays"] > .plate-img::before { display: none }`), `embers` (sparks from the floor; the family sets `--bga-ember`). Only the plate animates; ornaments, panels and text never move. Use `data-framed` only for image plates with baked borders (not the CSS stage).
- Static PNG export (`static=1` / `.is-static`): every animation is `none`; the frame is the designed still (drift = plate at rest, rays = fan at rest, embers = sparks at loop time 0). See `13-motion-{drift,rays,embers}-sc-story.png`: the still differs only in the light, which is intended.
- Per type: poster/result/live keep rays centred on the gold panel (light source x = 50%); MVP prefers `embers` or `rays` (drift moves the stage behind a static photo, fine too); standings/bracket prefer `drift` at `subtle`.

---

## 7. Data summary for the coders

| Need | Exists today | New |
|---|---|---|
| Teams (tag, name, logo, colours), matches (date, time, bestOf, status, scores, winnerId, streamWithCast), players (nick, role, lineup, photo) | yes (`sceneData`) | - |
| Greek caps dates | `dayLabel()` (sentence case) | client `caps()` + short formats |
| Round name per match | in bracket definitions | add `round` to schedule/versus/result data |
| Match day number | in `stage` text only | parse or field |
| Advance line after a result | `bracketTree().qualifications` | `advance` in result data |
| Player stats per match | `match.stats[]`, `statDefs` | aggregate per player per match + manual override |
| Standings | `teamRecord()` (w/l only) | draws, game diff, points, cut, stage filter |
| Bracket | `bracketTree()` | reuse for `social-bracket` |
| Live / next | `live`, `nextMatch`, status `live` | following match, countdown at export |
| Format | scenes have a fixed size | `format=post|story` param, SCENES entries get `formats: { post: [1080,1350], story: [1080,1920] }` |
| Family | theme preset | `settings.socialFamily` |
| Crest asset | `/brand/hll-logo.png` (unsuitable) | `/brand/hll-crest-white.png` |

---

## 8. Acceptance criteria (all types)

1. Output sizes exact: post 1080 x 1350, story 1080 x 1920, PNG, sRGB; transparent PNG when background is off.
2. Layout matches the prototype PNG of the same type/family/format within 4 px for every element listed in section 5 (overlay test against `jobs/proto/social/shots/`).
3. Stories: no text, logo or face inside y < 250 or y > 1580; posts: all text inside x 64..1016.
4. No overflow and no clipped glyphs with: tags up to 6 chars (Greek or Latin), team names up to 60 chars, nicks up to 14 chars, all 4 headline fonts (`09-stress-*` must look like the prototype).
5. Greek in caps has no tonos; dates follow `ΣΑΒΒΑΤΟ 21 ΝΟΕΜΒΡΙΟΥ` / `ΣΑΒ 21/11`.
6. Readable text >= 22 px (18 px only for auto-shrunk full names, labels inside dense components).
7. Fonts are loaded before capture (`document.fonts.ready`); no fallback system font visible in Greek.
8. Switching family changes only tokens, mark and copy; switching the headline font changes no position.
9. Missing data degrades gracefully: no logo -> shield tile with 3 letters; no photo -> logo/role-icon card; missing stats -> designer values or the cell is hidden (3 cells stretch); TBD teams -> `TBD` + `WINNER 4-1` label.
10. Background off removes exactly: plate, arcs, laurels, numerals, MVP ghost. Motion styles animate only the plate; the static export equals the frozen frame.
11. Every editable slot listed per type appears in Graphics designer > Text with its default; blank keeps the default; tokens `{tournament} {short} {date} {stage} {team} {teamA} {teamB}` plus NEW `{round} {matchday} {score} {winner} {player}` work.
12. Each export offers the caption template (section 9) filled with the same data, with a Copy button.

---

## 9. Caption templates (copy next to each export)

League pattern: hook line in caps with emoji, 2-3 sentences of Greek hype (sentence case keeps accents), emoji info rows, Twitch line, a question, 4-7 hashtags. `{…}` are filled from the same scene data; `{HASHTAGS}` = family hashtags (`#HLL #HLLSuperCup #HellenicLegends #LeagueOfLegends #Esports` for SUPERCUP; `#HLL #HLLWinter2027 #HellenicLegends #GreekLeagueOfLegends #Esports` for HLL).

**A. Match day**
```
🔥 {TOURNAMENT} · MATCH DAY {matchday} 🔥

Η μάχη συνεχίζεται! {count} αγώνες, ένας στόχος: η πρόκριση. Ποιος θα γράψει ιστορία απόψε;

📅 {date} | {time}
🎮 {teamA1} 🆚 {teamB1}
🎮 {teamA2} 🆚 {teamB2}

📺 Catch the action LIVE! 👉 twitch.tv/HellenicLegends

Ποια ομάδα υποστηρίζεις; 👇
{HASHTAGS}
```

**B. Match poster**
```
⚔️ {teamA} 🆚 {teamB} ⚔️

{round}: δύο ομάδες, ένα εισιτήριο. Best of {bo}, χωρίς περιθώρια για λάθη.

📅 {date} | {time}
📺 Ζωντανά 👉 twitch.tv/HellenicLegends

Ποιος παίρνει τη νίκη; Γράψε το score σου 👇
{HASHTAGS}
```

**C. Result**
```
🏆 {WINNER} {scoreW}-{scoreL}! 🏆

Οι {winnerName} επικράτησαν των {loserName} και {advance_sentence}.

✅ {teamA} {scoreA} - {scoreB} {teamB}
➡️ Επόμενος σταθμός: {nextRound}

📺 Δείτε ξανά τη μάχη 👉 twitch.tv/HellenicLegends
{HASHTAGS}
```
(`advance_sentence` default: `κλείνουν θέση στο Top 4`; without a qualification: `κάνουν ακόμη ένα βήμα`.)

**D. MVP**
```
👑 MVP: {PLAYER} 👑

Ο {player} ({role}, {team}) ήταν ασταμάτητος απέναντι στους {opponent}!

⚔️ K/D/A {k}/{d}/{a} · KDA {kda}
🧙 {champions}

Συμφωνείς με την επιλογή; 👇
{HASHTAGS} #MVP
```

**E. Roster**
```
🛡️ ROSTER REVEAL · {TEAM} 🛡️

Αυτοί είναι οι πολεμιστές των {teamName} για το {tournament}!

⬆️ Top: {top}
🌲 Jungle: {jungle}
✨ Mid: {mid}
🏹 Bot: {bot}
🛡️ Support: {support}
🔄 Subs: {subs} · 🎧 Coach: {coach}

Πόσο ψηλά θα φτάσουν; 👇
{HASHTAGS}
```

**F. Standings**
```
📊 ΒΑΘΜΟΛΟΓΙΑ · {stage} 📊

Μετά την {matchday}η αγωνιστική, οι {leader} κρατούν την κορυφή με {pts1} βαθμούς!

🥇 {team1} · {pts1}
🥈 {team2} · {pts2}
🥉 {team3} · {pts3}

Η μάχη για το Top {cut} των playoffs συνεχίζεται 🔥
{HASHTAGS}
```

**G. Bracket**
```
🗺️ ROAD TO {TARGET} 🗺️

{qualifiedCount} ομάδες έχουν ήδη κλείσει θέση. Τα υπόλοιπα εισιτήρια κρίνονται {date}!

✅ {q1}
✅ {q2}
❓ {teamA} 🆚 {teamB} · {time}
❓ {teamA} 🆚 {teamB} · {time}

📺 twitch.tv/HellenicLegends
{HASHTAGS}
```

**H. Live / Next (stories have no caption; texts for stickers)**
- Link sticker text: `ΔΕΣ ΖΩΝΤΑΝΑ`, URL `https://twitch.tv/HellenicLegends`.
- Countdown sticker title: `{teamA} vs {teamB}`, end time = match start.
- Optional companion post caption: `📺 ΖΩΝΤΑΝΑ ΤΩΡΑ: {teamA} 🆚 {teamB} (Game {n}) 👉 twitch.tv/HellenicLegends {HASHTAGS}`

---

## 10. Open questions

1. Default headline font: Sofia Sans Extra Condensed (designer pick) or Play (hll.gr)?
2. HLL family: the real next HLL event name and hashtag (the mock uses `WINTER SPLIT 2027` / `#HLLWinter2027`).
3. Standings rules: points per Bo2 result (mock: 2-0 = 3, 1-1 = 1) and the playoff cut (mock: top 6).
4. SUPERCUP players have no photos: may the app reuse HLL-tournament cut-outs with the same nick (as the prototype does)?
5. MVP stats: imported per match, or typed in the designer?
6. Sponsors: none in SUPERCUP data. Proposed slot when present: a 56 px strip centred in the footer between the Twitch line and the hashtag (max 3 logos, 140 px each, full colour); confirm.
7. Is an official SUPERCUP emblem coming? The type lockup is designed to be replaced by an image in the same 128 px header slot.
