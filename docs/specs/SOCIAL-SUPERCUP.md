# Social posts and stories: HLL 2027 SUPER CUP (league style, refined)

Status: design ready for implementation, 2026-11-16. Owner: UI and style lead.
Scope: the SUPERCUP family of social graphics. It replaces the SUPERCUP ("sc" / event family) look in `docs/specs/SOCIAL-DESIGN.md`; the HLL family there is unchanged. Everything here follows the league designer's real SUPERCUP posts (`jobs/proto/social-sc/assets/ref-*.png`): same palette, arena photo, gold condensed caps, VS rows, gold role column and Twitch footer, with the weak points fixed.

- Prototypes (pixel reference, real SUPERCUP data from `/api/state`): `jobs/proto/social-sc/*.html` + `sc.css` + `sc.js`.
- Rendered PNGs: `jobs/proto/social-sc/shots/`. Re-render: `node jobs/proto/social-sc/render.mjs [filter]` (serves the folder on :4689, proxies `GET /media/*` and `/overlay/*` read-only from :4610).
- Data snapshot: `curl -s http://localhost:4610/api/state -o jobs/proto/social-sc/state.json`, then `node jobs/proto/social-sc/tools/prep-data.mjs` (writes `data.js`).
- Derived assets: `node jobs/proto/social-sc/tools/prep-assets.mjs` (cut candidate logos, white crest, trimmed team logos + `tools/logo-metrics.json`).
- Review aids: `tools/compare.mjs` (reference next to the new post), `tools/contact.mjs` (contact sheets), `tools/measure.mjs` (block boxes used in section 5).

---

## 0. Deliverables

| # | Type | Prototype | PNGs in `shots/` |
|---|---|---|---|
| 1 | Match day / round schedule (1-4 matches) | `01-matchday.html` | `01-matchday-post.png`, `01-matchday-story.png`; `-post-round1` (first round, results shown), `-post-2` (2 matches), `-post-bgoff` (transparent), `-post-markgold` (crest with gold keyline, alternative) |
| 1b | Header logo candidates in context | `01-matchday.html?logo=v1-crest\|v2-trophy\|v3-strike` | `01-matchday-{post,story}-logo-v1-crest.png`, `-logo-v2-trophy`, `-logo-v3-strike` |
| 2 | Match poster | `02-poster.html` | `02-poster-post.png`, `02-poster-story.png`, `02-poster-post-nocast.png` |
| 3 | Result | `03-result.html` | `03-result-post.png`, `03-result-story.png`, `03-result-story-logo-v2-trophy.png` |
| 4 | Team roster | `04-roster.html` | `04-roster-post.png` (WLG), `04-roster-story.png`, `04-roster-post-tpx.png` |
| 5 | Qualifier / event announcement | `05-announce.html` | `05-announce-post.png`, `05-announce-story.png` |
| 6 | Bracket progress, Road to Top 4 | `06-bracket.html` | `06-bracket-post.png`, `06-bracket-story.png` |
| 7 | LIVE NOW (story only) | `07-live.html` | `07-live-story.png`, `07-live-story-logo-v1-crest.png` |
| - | Motion styles (frozen frame) | `?motion=embers\|rays\|drift` | `08-motion-embers-story.png`, `08-motion-rays-post.png`, `08-motion-drift-post.png` |
| - | Checks | | `_safezones-{post,story,poster-story}.png`, `_greek-matchday-post.png` (Greek glyphs), `_fonts.png` (font choice), `_compare-{matchday,roster,qualifier}.png` (reference vs new), `_overview-{post,story,logos}.png` |

Query params of every prototype: `format=post|story`, `logo=type|v1-crest|v2-trophy|v3-strike`, `bg=0` (background off), `motion=drift|rays|embers` + `level=subtle|normal|strong`, `guides=1` (safe zones), `lang=el` (Greek labels check), `mark=white|white-gold`. Per type: `round=opening|qualifying`, `n=1..4`, `results=1`, `match=<id>`, `team=<id>`, `sub=<nick>`, `title=`, `kicker=`, `headline=`, `date=`, `time=`, `info=`, `band=`.

---

## 1. What stays, what got better

Kept from the reference (identity): dark blue arena photo with blue stage beams and gold diagonal light streaks in the corners; solid gold corner wedges; white HLL mark over gold `2027` and a very tall gold condensed `SUPER CUP`; white round title; navy match bars with gold edge and a thick gold bottom line, logos left/right, big white italic VS with gold; date and time above the VS; roster table with gold role column and royal-blue player column, team logo large and faded behind, `Sub:` line; `twitch.tv/HellenicLegends` with the Twitch glyph at the bottom; the halftone-dot gold glow inside the bars.

Fixed:
| Reference weakness | Now |
|---|---|
| Tags ~20 px tall at 1080 (unreadable on a phone) | Tags 58-74 px, white, condensed 800 |
| Logos of random size, half outside the bar, clashing with the gold lines | Logo wells: equal square plates at both bar ends, logos trimmed and scaled to equal optical size (4.3) |
| VS drawn small and flat | Angular custom VS (SVG, 4.6), white face over gold extrusion, 80-108 px tall |
| `12/11 18:00` stacked in 15 px text | Meta tab on top of each bar: `THU 12/11 \| 18:00 \| cast badge`, 30-34 px |
| `w/ cast` / `no cast` as tiny text outside the bar | Cast badge: gold pill with mic icon (`W/ CAST`) or outlined muted pill with crossed mic (`NO CAST`) |
| Diagonal hairlines crossing tables and rows | Streaks only in the photo corners + two hairline pairs in the empty corners; nothing crosses content |
| No sponsor slot | One partner line above the footer: `POWERED BY` + GAMEATHLON (the only sponsor) |
| Ad-hoc margins | 64 px side margins on both formats, fixed top/bottom insets, story safe zones 250/340 |
| No hierarchy below the round title | Kicker line (round name, best-of) in tracked small caps |

---

## 2. Tokens

### 2.1 Colour
| Token | Value | Use |
|---|---|---|
| `--gold` | `#fdc204` (sampled from the reference `SUPER CUP`, #fcc206) | headline, borders, time, winner |
| `--gold-hi` | `#ffe27a` | top of gold gradients |
| `--gold-deep` | `#e39a00` | bottom of gold gradients |
| `--navy-0` | `#030820` | page fallback |
| `--navy-1` / `--navy-2` | `#06123a` / `#0c2160` | bar ends / bar centre |
| `--royal` / `--royal-deep` | `#1534b4` / `#0b1f7a` | roster player column (reference `#0d248c`, lifted) |
| `--mute` | `#b9c6ee` | secondary text, kicker, NO CAST |
| text on gold | `#071640` | role names, chips, band, cast badge |
| live dot | `#ff2b3a` | LIVE NOW only |

Gold display text = `linear-gradient(180deg, #ffe27a 0%, #fdc204 38-45%, #fdc204 62-70%, #e39a00 100%)` clipped to text + `drop-shadow(0 4px 0 rgba(4,10,40,.55)) drop-shadow(0 10px 22px rgba(0,0,0,.45))`.

### 2.2 Fonts (install)
| Role | Family | Weights | Package (served by the existing `/fonts/:pkg` route) |
|---|---|---|---|
| Headline, tags, numbers, table | **Sofia Sans Extra Condensed** | 700, 800, 900 | `npm i @fontsource-variable/sofia-sans-extra-condensed` (family name `Sofia Sans Extra Condensed Variable`) |
| UI: kicker, labels, URL, cast badge | **Sofia Sans** | 700, 800 | `npm i @fontsource-variable/sofia-sans` (family `Sofia Sans Variable`) |

Why: the reference headline is a Bebas Neue style face. Bebas Neue, Oswald and League Gothic have no Greek. Sofia Sans Extra Condensed 800 matches Bebas proportions closely (`shots/_fonts.png`) and covers Greek and Cyrillic; Sofia Sans (normal width) is the same superfamily for small text. Greek check: `shots/_greek-matchday-post.png`.
Stacks: `--f-head: 'Sofia Sans Extra Condensed Variable', 'Sofia Sans Extra Condensed', 'Bebas Neue', sans-serif`; `--f-ui: 'Sofia Sans Variable', 'Sofia Sans', sans-serif`. Wait for `document.fonts.ready` before export.

### 2.3 Type scale (px, canvas 1080 wide)
| Element | Post | Story | Weight / tracking |
|---|---|---|---|
| `SUPER CUP` full / mid / compact | 150 / - / 104 | 184 / 150 / 130 | 800, line-height .86 |
| `2027` full / mid / compact | 60 / - / 50 | 74 / 60 / 62 | 800 |
| Round title | 58 | 70 (mid 60) | 800, .035em, gold rules 64x3 both sides, gap 22 |
| Kicker | 20 | 24 (mid 21) | UI 700, .22em, `--mute` |
| Row tag (n=4/3/2/1) | 60/64/68/72 | 62/68/74/78 | 800, .03em |
| Meta date / time | 30 / 34 | 30 / 34 | 700 .05em white (weekday `--mute`) / 800 gold |
| Big tag (poster, result) | 112, result 108 | 150 (poster), 132 (result) | 900 |
| Score (result) | 210 | 230 | 900 |
| QUALIFIER-type display | 250 | 262 | 900, gradient |
| Twitch URL | 34 | 40 (live CTA 50) | UI 800 |
| Sponsor label | 17 | 20 | UI 700, .3em, white 72% |

---

## 3. Canvas, grid, safe zones

- Post 1080 x 1350; story 1080 x 1920. PNG, sRGB, `deviceScaleFactor 1`.
- Content box: post `padding 46 64 40` (content x 64-1016, y 46-1310); story `padding 262 64 352` (y 262-1568). Story safe zones: nothing but background in y 0-250 and y 1580-1920 (`shots/_safezones-*.png`).
- Column: one centred column, width 952. Header block (top) / main (flex 1, vertically centred, margin 26 top and bottom) / footer (bottom).
- Footer is fixed to the bottom of the content box: sponsor line, 20 px (story 26) gap, Twitch pill. Post: sponsor y 1206, Twitch y 1248-1310. Story: sponsor y 1444, Twitch y 1496-1568.
- IG grid crop (3:4 from 4:5) cuts ~34 px per side: the 64 px margin covers it.

---

## 4. Components

### 4.1 Background plate + ornaments
DOM (the app's `plate()` structure, so `public/overlay/css/bg-anim.css` applies unchanged):
```
<div class="sc" data-format="post|story">
  <div class="sc-bg plate" [data-bga="drift|rays|embers" data-bga-level style="--bga-t;--bga-ember:253,194,4;--bga-light:255,226,150"]>
    <div class="plate-img photo"></div>    arena photo, cover
    <div class="plate-shade veil"></div>   legibility veil
    <div class="bga-fx"></div>             32 <i> for embers
  </div>
  <div class="sc-orn">  wedges + hairlines  </div>
  <div class="sc-in">  header / main / footer  </div>
</div>
```
- Photo: `assets/bg-post.png` (1080x1350) and `assets/bg-story.png` (1080x1920). Ship as brand plates (e.g. `/brand/sc-arena-post.png`, `/brand/sc-arena-story.png`); a tournament social background, if one is set, replaces the photo, the veil stays.
- Veil: `radial-gradient(ellipse 62% 46% at 50% 56%, rgba(3,8,32,.55), transparent)` + `linear-gradient(180deg, transparent 0, rgba(3,8,32,.25) 40%, rgba(3,8,32,.25) 75%, transparent)`.
- Corner wedges (the reference's solid gold corners, placed in the two corners without a photo streak): top-left `border-top 132px gold / border-right 112px transparent`; bottom-right mirrored; `drop-shadow(0 0 18px rgba(253,194,4,.55))`.
- Hairlines: 2 px, gold gradient `transparent -> rgba(255,214,90,.95) 45% -> transparent`, rotated -50 deg (the photo streak angle): (x -40, y 250, 380 long, 85%), (30, 300, 260, 50%), (840, H+40, 380, 85%), (900, H-10, 260, 50%).

### 4.2 Header: ONE swappable logo element
`header({ round, kicker, size: full|mid|compact })` contains `.sc-lock` (the logo element) + optional round title + kicker.
- `logo = type` (default, the reference header): HLL crest in white treatment (`assets/cut/hll-mark-white.png`, from `hll-logo.png`: the dark card keyed out, every remaining pixel white, detail lines left transparent; shadow `0 6px 14px rgba(0,0,0,.6)`) + `2027` + `SUPER CUP` set in type (2.3). Full/mid: stacked, centred. Compact: crest left, `2027` over `SUPER CUP` right, gap 22 (used by poster, result, announce, bracket, live, where the body needs the room).
- `logo = <candidate>`: one image replaces crest + 2027 + SUPER CUP. Heights: post full 300 / compact 190; story full 360 / mid 296 / compact 250. Files `assets/cut/logo-v1-crest.png`, `logo-v2-trophy.png`, `logo-v3-strike.png`: the navy square removed by flood fill from the border (colour distance <= 34 from the corner colour), soft edge 34-120 within 3 px of the removed area with colour decontamination, trimmed. Enclosed navy (shield interior, letter counters) stays opaque, so the marks stay legible on the photo. The same script handles Nano Banana variants.
- App: a single setting `socialLogo` (`type` | uploaded image); the round title and kicker never change with it.
- Sizes: full = matchday post, roster post; mid = story when the body is tall (matchday story with 4 rows, roster story); compact = the rest.
- Measured: matchday post `.sc-lock` 274,46 533x325, round y 387, kicker y 455; compact post lockup 300,46 480x132, round y 194, kicker y 262.

### 4.3 Team logo, equal optical size
1. Trim transparent padding (alpha > 0) once per logo (cache by file + `?v=`).
2. Metrics on the trimmed image: `aspect a = w/h`, `density d = ink / (w*h)` (ink = sum of alpha), `luminance` = mean of opaque pixels.
3. In a square box S: `h = S * sqrt(.55 / (a * sqrt(d)))`; if `h > S` then `h = S`; `w = a*h`; if `w > 1.15 S` then `w = 1.15 S, h = w/a`.
4. `luminance < .30` (NXM, VR, NGG): add `drop-shadow(0 0 1.5px rgba(255,255,255,.85)) drop-shadow(0 0 10px rgba(160,190,255,.55))` so dark marks read on navy. Others: `drop-shadow(0 6px 10px rgba(0,0,0,.6))`.
Values for the current teams: `jobs/proto/social-sc/tools/logo-metrics.json`.

### 4.4 Match row (match day)
```
.row
  .meta   tab centred on top of the bar: [WEEKDAY dd/m] | [HH:MM] | [cast badge]
  .bar    height B
    .plate      gold chamfered plate, navy fill, halftone + gold glow
    .side.a     [well][TAG]        .mid  VS or score        .side.b  [TAG][well]
```
| n matches | post: bar B / gap / tag / VS h | story: bar B / gap / tag / VS h |
|---|---|---|
| 4 | 108 / 22 / 60 / 80 | 112 / 26 / 62 / 84 |
| 3 | 120 / 36 / 64 / 88 | 128 / 46 / 68 / 94 |
| 2 | 132 / 52 / 68 / 96 | 142 / 70 / 74 / 104 |
| 1 | 140 / - / 72 / 100 | 156 / - / 78 / 108 |
- Row = meta 44 + bar B. Width 952 (x 64-1016).
- Bar plate: gold fill clipped `polygon(22px 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%, 0 22px)`; inner fill inset `2 2 7 2` (so 2 px gold edge, 7 px gold bottom line), `linear-gradient(90deg, rgba(5,13,44,.97), rgba(13,33,96,.96) 50%, rgba(5,13,44,.97))`. Texture layer (same inset): `radial-gradient(circle, rgba(255,206,40,.5) 1.3px, transparent 1.9px) 0 0/8px 8px` + `linear-gradient(180deg, transparent 30%, rgba(253,194,4,.26))`, masked `linear-gradient(180deg, transparent 18%, #000)`.
- Well: square `B+15`, top -10 (overflows the bar by 10 above, ends in the gold bottom line), flush with the bar ends; gold 2 px chamfered frame (18 px chamfer, mirrored on side B); fill `radial-gradient(circle at 50% 45%, #1b3a9c, #0b1c5a 55%, #050d2e)`; logo box `well - 26`.
- Tag: 26 px from the well, white, `text-shadow 0 3px 0 rgba(0,0,0,.35)`. Missing team: label from `teamALabel` (`Winner 1-1` -> `W 1-1`, `Draw TBD` -> `DRAW TBD`), well shows a dashed circle with `?`.
- Meta tab: height 44, padding 0 20/22, `linear-gradient(180deg, #0d2468, #071640)`, gold 2 px border without bottom, trapezoid `polygon(14px 0, calc(100% - 14px) 0, 100% 100%, 0 100%)`; separators 2x22 `rgba(185,198,238,.35)`.
- Score mode (`status = done` and results shown): VS replaced by `sa - sb` (900, 92 px, winner gold with glow, loser white 50%, dash 18x6); meta right part `FINAL`; loser tag white 50%, loser logo opacity .42.
- Measured (post, 4 rows): rows at y 505, 679, 853, 1027; bars x 64 w 952 h 108; wells 123 x 123.

### 4.5 Cast badge
Small (row meta, live): height 30, padding 0 12 0 10, radius 4, UI 800 17 px .12em, icon 18. Large (poster ticket): height 46, padding 0 20 0 16, 24 px, icon 26, radius 6.
- With cast: gold fill, `#071640` text, mic icon, `W/ CAST`.
- No cast: transparent, `--mute` text, inset 2 px `rgba(185,198,238,.5)`, crossed-mic icon, `NO CAST`.
- Unknown (`null`): no badge.

### 4.6 VS mark
Inline SVG, viewBox `0 0 250 112`, width = 2.25 x height. Letters drawn at 100 high, group `translate(30 5) skewX(-14)`:
`V: M0 0H32L52 62L72 0H104L68 100H36Z` and `S (translate 112 0): M14 0H96V24H28V38H82L96 52V86L82 100H0V76H68V62H14L0 48V14Z`.
Gold copy (`#fdc204`) offset (+7, +6) under the white copy.

### 4.7 Big logo plate (poster, result, live)
Square size P, chamfer `.1P` (top-left + bottom-right on side A, mirrored on side B); 3 px gold gradient frame `linear-gradient(160deg, #ffe27a, #fdc204 40%, #e39a00)`; fill `radial-gradient(circle at 50% 42%, #2348b8, #0e2470 48%, #050d2e)`; logo box `.74P`. States: `win` = glow `drop-shadow(0 0 26px rgba(253,194,4,.45))`; `lose` = frame `linear-gradient(160deg, #6b7aa8, #3a4a7e)`, darker fill, logo opacity .45.

### 4.8 Other parts
- Ticket (poster): full width, padding 22 10 24, `linear-gradient(180deg, rgba(14,38,110,.88), rgba(5,14,46,.9))`, 3 px gold top border, bottom corners chamfered 22. Three equal cells split by 2 px gold-fade rules: `WEEKDAY` label (UI 800 18/21 px .26em mute) + `21 NOVEMBER` (54/60 px 800 white) | `LIVE AT` + time (gold 900) | `BROADCAST` + large cast badge.
- Qualification band (result): height 84 (story 96), gold horizontal gradient, parallelogram (26 px slant), navy 900 text 52/58 px, navy chevrons both sides.
- Chip (`FINAL`, `FINAL RESULT`): gold, navy UI 800 .18em, parallelogram 10 px.
- Roster table: width 860 (story 900); grid `270 | 1fr` (story 290); row height 94 (story 104); 3 px gold outer border; role cells gold gradient with navy 800 46/50 px; name cells royal-blue gradient at ~74% alpha (so the faded logo shows through), white 800 58/62 px, 3 px gold separators between names, faint navy separators between roles. Faded team logo behind: 680 px (story 760), opacity .34. Sub row 22 px below: gold `SUB` chip + white names 42/46 px.
- Team identity (roster): logo 104 (story 124) + tag gold 900 104/120 px + full name UI 700 .14em mute.
- Bracket card: navy gradient, 4 px gold inset left edge, header strip (30/32 px, date left, `FINAL` or gold time right), two team lines 54/62 px (logo 38/42, tag 36/40, score 40/44; winner score gold, loser 42% white). Columns `318 | 60 | 318 | 60 | 196`. Wires: SVG, R1 right-middle -> R2 bottom line (the R1 winner enters as team B), R2 right-middle -> slot with arrow; solid gold 3 px when decided, dashed `rgba(185,198,238,.45)` when open. Slot: decided = gold frame 3 px + gold glow, logo 66/76 + gold tag; open = 2 px muted frame, `?` + `TP / AIM`.
- Sponsor line: `POWERED BY` (UI 700 17/20 px, .3em, white 72%) + `gameathlon.png` height 22/26. Nothing else (no Fanta, no divider).
- Twitch pill: padding 10 26 10 14 (story 12 30 12 16), radius 8, `rgba(3,8,32,.62)` + inset 2 px gold 55%; glyph 38x42 (story 44x48): gold outline shape, navy bubble, gold eyes; URL UI 800 34/40 px white.

---

## 5. Layouts (px, measured from the prototypes)

**1 Match day / round schedule** (`01-matchday`). Post: full header (lockup 46-371, round y 387, kicker y 455), rows from y 505 (4 rows, 174 px pitch), footer. Story: mid header (262-688), rows from y 715 (182 px pitch), footer. 1-3 matches: row sizes from 4.4, rows block centred in main. `round=opening` shows the played first round as a recap (scores, `FINAL`).

**2 Match poster** (`02-poster`). Post: compact header (lockup 300,46 480x132; round 194; kicker 262), duel at y 417: plates 330 at x 64 and x 686, VS 120 high centred on the plates, big tags 112 + full names 22 under the plates; ticket 64,943 952x139; footer. Story: compact header to y 562; diagonal duel 64,589 952x642: team A row (plate 262 left, tag 150 + name right of it), VS row 124 high with gold rules (250 long) both sides, team B row mirrored (plate right); ticket 64,1267 952x150.

**3 Result** (`03-result`). Post: compact header, kicker `<round> · FINAL RESULT`; duel at y 438: plates 300 (winner `win`, loser `lose`), centre `FINAL` chip + score 210; tags 108 (winner gold, loser 50%); band 64,928 952x84 `WLG ADVANCE TO TOP 4 · GSL`; line `SUN 15/11 · BEST OF 3`. Story: compact header (no kicker), `FINAL RESULT` chip y 593, scoreboard 64,663 952x526: two lines (plate 250, tag 132 + name, score 230 right-aligned 34 px inset), band y 1229 h 96, date line.

**4 Team roster** (`04-roster`). Post: full header 46-371, team identity 361,447 (logo 104, tag 104), table 110,590 860x476, sub row y 1088, footer. Story: mid header 262-577, identity y 627, table 90,799 900x526, sub y 1347.

**5 Announcement** (`05-announce`). Post: compact header; kicker `OPEN` (60 px, .3em, gold rules 90) y 374; display `QUALIFIER` 250 px y 448; 120x3 gold rule; date `31` white + `OCTOBER` gold 148 px; weekday 42 px + gold time box 56 px; info line UI 20 px .2em. Story: same at 68 / 262 / 170 / 50 / 66 / 23 px, block 79,575 922x720.

**6 Bracket progress** (`06-bracket`). Post: compact header, round `ROAD TO TOP 4`, kicker `SINGLE ELIMINATION · n OF 4 PLACES DECIDED`; column heads (30 px, gold underline 3 px; `TOP 4` gold) then 4 lanes from y 463, pitch 163 (card 139). Story: lanes from y 675, pitch 191 (card 157).

**7 LIVE NOW** (story) (`07-live`). Compact header 262-427; `LIVE NOW` 210 px (`LIVE` white, `NOW` gold gradient) with a red dot 58 (10 px halo + ring) at 119,551 802x176; context line `SECOND ROUND · BEST OF 3` y 757; duel 64,831: plates 290, VS 108 + small cast badge under it, tags 104; free band y ~1240-1350 for the IG link sticker; CTA `WATCH LIVE ON` (40 px, .3em) + large Twitch pill 178,1416 724x92 (URL 50 px, glyph 54x60, gold frame 3 px + glow); sponsor line y 1542.

---

## 6. Data (all from `/api/state`, active tournament SUPERCUP)

| Field | Source | Notes |
|---|---|---|
| Team tag / name / logo | `teams[].tag`, `.name`, `.logo` (`/media/teams/<id>.png`) | logo trimmed + optical metrics (4.3) |
| Match teams | `matches[].teamA/teamB`, fallback `teamALabel/teamBLabel` | `Winner 1-1` -> `W 1-1` |
| Date / time | `matches[].date` (ISO date), `.time` | `THU 12/11` (row), `SATURDAY` + `21 NOVEMBER` (poster/announce); weekday from the date, no timezone shift |
| Score / winner / status | `scoreA`, `scoreB`, `winnerId`, `status` | score mode when `status = done` |
| Best of | `bestOf` | kicker `· BEST OF 3` |
| Cast | `streamWithCast`; if not `false`, stage text `/no\s*cast/i` -> no cast | `true` = W/ CAST, `false` = NO CAST, `null` = no badge |
| Round | `settings.brackets[id=single].rounds[i]` | title `FIRST ROUND` / `SECOND ROUND` (ordinal by index, editable), kicker = round name without ` matches` (`OPENING ROUND`, `TOP 4 QUALIFYING`) |
| Qualification | `settings.brackets[].qualifications[]` (`source.matchId`, `outcome`, `name`) | band `<winner tag> ADVANCE TO TOP 4 · GSL` |
| Bracket lanes | round 2 matches; feeder = round-1 match whose `bracketCode` equals `teamBLabel` minus `Winner ` | slot = round-2 winner |
| Roster | `players[]` by `teamId`, `hidden` excluded, `lineup = starter` (max 5) ordered Top, Jungle, Mid, Bot, Support; subs = `lineup != starter` | role labels TOP / JUNGLE / MID / BOT / SUPPORT; names uppercase |
| Default match | `nextMatch` (poster, live) | result: the prototype uses `m_5bb09147` (WLG 2-0 NXM); app default = the latest `done` match, user can pick |
| Sponsor | the tournament sponsor list, filtered to GAMEATHLON (white logo) | `state.sponsors` is empty today: add GAMEATHLON |
| Event | editable texts (7) | `settings.leagueName` still says `SUPERCUP 2026` |

---

## 7. Editable texts (per graphic, with defaults)
- All: `eventYear` (`2027`), `eventTitle` (`SUPER CUP`), `socialLogo` (`type`), `sponsorLabel` (`POWERED BY`), `twitch` (`twitch.tv/HellenicLegends`), `castLabel` (`W/ CAST`), `noCastLabel` (`NO CAST`).
- Match day: `title` (`SECOND ROUND`), `kicker` (`TOP 4 QUALIFYING · BEST OF 3`), match selection (round or explicit list, max 4), `showResults`.
- Poster: `title`, `kicker`, labels `LIVE AT`, `BROADCAST`.
- Result: `title`, `kicker` (`... · FINAL RESULT`), `finalLabel` (`FINAL` / `FINAL RESULT`), `band` (auto from qualification, editable, empty hides it).
- Roster: team, `subs` (override), role labels.
- Announcement: `kicker` (`OPEN`), `headline` (`QUALIFIER`), `date`, `time`, `info` (`TWO TEAMS QUALIFY FOR THE MAIN BRACKET`).
- Bracket: `title` (`ROAD TO TOP 4`), `kicker`, column heads (`FIRST ROUND`, `SECOND ROUND`, `TOP 4`).
- Live: `liveLabel` (`LIVE`), `nowLabel` (`NOW`), `cta` (`WATCH LIVE ON`), match.
Greek: every label can be Greek (fonts cover it); keep text uppercase without accents (e.g. `ΠΡΩΤΟΣ ΓΥΡΟΣ`, `ΤΕΛΙΚΟ`, `ΠΑΡ 6/11`).

---

## 8. Background on/off and motion
- **Background ON** (default): plate (photo + veil) and ornaments (wedges, hairlines).
- **Background OFF** (`bg = false`): no plate, no ornaments; transparent PNG (`omitBackground`, and both `html` and `body` transparent; the prototype sets `html.bg-off`). Kept: bars, wells, meta tabs, plates, ticket, band, table, chips, text, footer pill (they carry their own fills). See `01-matchday-post-bgoff.png`.
- **Motion** (`bg-anim.css`, unchanged; only the plate moves, ornaments and content never move). SUPERCUP sets `--bga-ember: 253, 194, 4` (gold sparks) and `--bga-light: 255, 226, 150`.
  - `drift` (default for schedule, roster, bracket at `subtle`): slow push on the arena photo + travelling light.
  - `embers` (live, result): gold sparks rising from the crowd, matching the gold streaks; `08-motion-embers-story.png`.
  - `rays` (poster at `subtle`): breathing fan of light; the photo already has beams, so keep it subtle; `08-motion-rays-post.png`.
  - Static PNG export: animation `none`, the frame equals the designed still.
- Optional later for video exports (not in scope): rows slide in from the side with 80 ms stagger, VS scale 1.15 -> 1 punch, scores count up, hairlines draw on.

---

## 9. Acceptance criteria
1. Sizes exact: post 1080x1350, story 1080x1920, PNG sRGB; transparent PNG with background off.
2. Side margins 64 on every graphic; post content y 46-1310; story content inside y 262-1568 (no text or logo in y < 250 or y > 1580).
3. Header logo is one element: switching `socialLogo` changes only `.sc-lock`; round title, kicker and the rest of the layout keep their positions within the header block.
4. Candidate logos show no navy square and no dark fringe on the photo; enclosed navy areas stay filled.
5. Team tags in match rows >= 58 px; all logos in one graphic share the same box and the 4.3 sizing (no logo touches the well frame, dark logos have the halo).
6. Every match row shows weekday, date and time in the meta tab; cast state is a badge (gold W/ CAST, outlined NO CAST, none when unknown). `streamWithCast = false` or stage containing `No cast` gives NO CAST (SPAR vs VR, 1-2).
7. Played matches in score mode: winner score gold, loser score / tag / logo dimmed exactly as 4.4.
8. Roster: five starters in role order, gold role column, royal-blue names in white, faded logo visible through the name column, sub row only when subs exist.
9. Only GAMEATHLON appears as sponsor, once, above the footer; Twitch line on every graphic.
10. Fonts: Sofia Sans Extra Condensed + Sofia Sans from fontsource, export waits for `document.fonts.ready`; Greek renders without fallback glyphs.
11. Side by side with the prototype PNGs at 100%: element positions within 4 px, colours as in section 2.
12. Motion: only the plate animates; static export equals the frozen frame; ornaments hidden when the background is off.

---

## 10. Open questions
1. Header logo: type lockup (default) or one of `v1-crest`, `v2-trophy`, `v3-strike` (or a Nano Banana variant)? The lockup is one element, so the choice is one setting.
2. The reference header uses a white HLL lettermark with a gold keyline (not the spartan crest). We do not have that asset; the prototypes use the spartan crest in white from `hll-logo.png`. A clean file (SVG/PNG) of that lettermark would make the default header match the reference exactly.
3. Year: the tournament is named `SUPERCUP 2026` in the app, the posts say `2027`. Rename the tournament, or keep 2027 as an editable text only?
4. Round names: `FIRST ROUND` / `SECOND ROUND` (reference) for the bracket rounds `Opening Round` / `Top 4 qualifying`; what should the GSL and LAN stages be called on posts?
5. Substitutes: the API has none; the reference shows `Sub: Rabbit` (WLG) and `Sub: Heroic` (TPX), used here as samples. Add subs to the rosters?
6. Role label `SUPPORT` (chosen, clearer) or `SUP` (reference)?
7. Language of the posts: English like the reference, or Greek labels?
