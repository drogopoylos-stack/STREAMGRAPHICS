# HLL Broadcast Graphics — server ⇄ UI contract

Server: Node 20+, Express 5, ES modules. `npm start` → http://localhost:4610
No build step. Front-end is plain HTML + ES modules + CSS, served from `public/`.

## Static routes

| URL | Serves |
| --- | --- |
| `/` | `public/control/index.html` — the control panel (operator UI) |
| `/control/*` | `public/control/*` |
| `/overlay/*` | `public/overlay/*` — broadcast graphics (OBS / vMix browser sources) |
| `/media/*` | `data/assets/*` — processed images (`teams/<id>.png`, `players/<id>.png`, `sponsors/<id>.png`, `bg/*.png`) |
| `/output/*` | `output/*` — rendered PNG files |
| `/fonts/<pkg>/*` | `node_modules/@fontsource/<pkg>/*` and `node_modules/@fontsource-variable/<pkg>/*` (for example `/fonts/fira-sans-condensed/700.css`, `/fonts/commissioner/index.css`) |
| `/brand/*` | `public/brand/*` — static background plates and textures |

All image URLs in JSON are already absolute paths with a cache-buster, e.g. `/media/teams/t_ab12.png?v=1730290000`. `null` when missing.

## Data shapes (as returned by `GET /api/state`)

```js
Settings = {
  leagueName: "Hellenic Legends League", leagueShort: "HLL", season: "Season 1",
  timezone: "Europe/Athens",
  mode: "full" | "simple",            // simple = logos only, no player photos
  theme: { preset: "sparta"|"aegean", primary: "#141414", accent: "#c8102e", accent2: "#f2c230", text: "#ffffff", bgImage: null | "/media/custom-bg.jpg" },  // plates: /brand/<preset>-main.jpg, /brand/<preset>-versus.jpg, /brand/<preset>-stage.jpg; bgImage overrides -main
  bracketEmbed: "",                    // raw embed HTML (<iframe ...>) or a URL, pasted by the user
  outputDir: "G:\\HLLTEST\\output",
  logoSize: 512,                       // processed logo canvas (square)
  photo: { width: 800, height: 1000, framing: "upper" | "full", removeBg: true, harmonize: true, strength: 0.7, engine: "standard" | "photocraft" },
  statDefs: [ { key: "kills", label: "Kills", better: "high" | "low", fmt: "int" | "dec1" | "dec2" | "pct" } ],
  drive: { apiKey: "" },
  hllgr: { baseUrl: "https://hll.gr", cookie: "" },
  sponsorsOnGraphics: true
}
Team    = { id, name, tag, logo, colors: { primary, secondary }, source: "manual"|"hllgr", extId }
Player  = { id, teamId, nick, name, role: "Top"|"Jungle"|"Mid"|"Bot"|"Support"|"Coach"|"", photo, country: "gr"|null, captain: bool, source, extId }
Match   = { id, date: "YYYY-MM-DD", time: "HH:mm", teamA, teamB,   // team ids
            scoreA: number|null, scoreB: number|null, bestOf: 1|3|5, stage: "Week 3" ,
            status: "scheduled"|"live"|"done", source, extId,
            url: "https://hll.gr/game/…" | null, vod: "https://youtube…" | null,
            stats: [ { playerId, game: 1, champion: "Ahri"|null, teamId, win: bool|null, values: { [statKey]: number } } ] }  // one entry per player PER GAME
Sponsor = { id, name, logo, tier: "main"|"partner" }
Feature = { id, playerA, playerB, title: "Mid lane duel", matchId: string|null }
Live    = { scene: SceneName|null, params: {}, visible: bool, rev: number }
Job     = { id, kind, status: "running"|"done"|"error", progress: 0..1, message, log: [string], result }
Unmatched = { file, url, kind: "team"|"player"|"sponsor"|"unknown", guess: id|null }  // imported files not linked yet
Tournament = { id, name, short, season, createdAt, broadcastDays: [1..7], teams: number, players: number, matches: number }
Background = { id, name, url, width, height }
Graphic = { id, name, scene, params, createdAt }
ScreenCard = { key, scene, params, title, sub, group, art, width, height, ready, warn, savedId? }
State   = { activeTournamentId, tournaments: [Tournament], capabilities: { photocraft: { available: bool } }, backgrounds: [Background], graphics: [Graphic], screenCatalog: [ScreenCard], settings, teams, players, matches, sponsors, features, live, unmatched, jobs }
```

Player records can include `photoProcessor: "inherit"|"standard"|"photocraft"` (default inherit), which overrides that tournament's photo engine for this player. `photoEngine` records the last processor used. The original-colour toggle `noHarmonize` skips colour correction with either processor.

The database is a versioned envelope `{schemaVersion:2, activeTournamentId, revision, tournaments:[{id,createdAt,broadcastDays,data}]}`. Each `data` object contains its own settings and entity arrays. The store exposes only the active tournament to normal routes. Legacy flat databases migrate automatically with a backup; their existing media URLs, raw files, settings and output directory are retained. New tournaments get separate output folders, and branding uploads use tournament-prefixed filenames. Broadcast weekdays are Monday=1 through Sunday=7 and do not schedule automatic switches.

## REST API (JSON in, JSON out; errors → `{ error: "message" }` with 4xx/5xx)

| Method + path | Body / query | Returns |
| --- | --- | --- |
| `GET /api/state` | | `State` |
| `GET /api/tournaments` | | `{activeTournamentId, tournaments}` |
| `POST /api/tournaments` | `{name, short?, season?, broadcastDays?}` | new `Tournament` (does not activate it) |
| `PUT /api/tournaments/:id` | partial `{name, short, season, broadcastDays}` | updated `Tournament` |
| `POST /api/tournaments/:id/activate` | `{}` | `{activeTournamentId, tournaments}`; takes graphics off air; 409 while work is in progress |
| `GET /api/photocraft/status` | | `{available: bool}` |
| `GET /api/graphics` | | `{graphics: [Graphic], catalog: [ScreenCard]}` for the active tournament |
| `POST /api/graphics` | `{name, scene, params?}` | saved live preset `Graphic` |
| `DELETE /api/graphics/:id` | | removes the saved preset; media and exports stay intact |
| `POST /api/backgrounds` | multipart `file` | normalized PNG `Background`, limited to 40 MP, resized within 3840×3840 |
| `PUT /api/settings` | partial `Settings` (deep merge) | `Settings` |
| `POST /api/teams` · `PUT /api/teams/:id` · `DELETE /api/teams/:id` | partial `Team` | `Team` / `{ok:true}` |
| same for `/api/players`, `/api/matches`, `/api/sponsors`, `/api/features` | | |
| `POST /api/assets/upload` | multipart: `file`, `kind` (team/player/sponsor), `id` | updated entity |
| `POST /api/assets/import` | `{ source: "drive"|"local", url?: string, path?: string, kind: "team"|"player"|"sponsor"|"auto" }` | `Job` (poll) |
| `POST /api/assets/assign` | `{ file, kind, id }` (link an unmatched file) | updated entity |
| `POST /api/assets/reprocess` | `{ kind: "player"|"team"|"sponsor"|"all-players", id? }` | `Job` |
| `GET /api/jobs/:id` | | `Job` |
| `POST /api/hllgr/sync` | `{ what: ["teams","players","matches","stats"] }` | `Job` |
| `GET /api/scene-data` | `?scene=…&<params>` | scene data (below) |
| `GET /api/live` · `POST /api/live` | `{ scene, params, visible }` | `Live` |
| `POST /api/render` | `{ scene, params, name? }` | `{ scene, name, file, url, width, height }`; broadcast PNG 1920×1080, social PNG 1080×1920 |
| `POST /api/render/all` | | `Job` → result `[{scene, file, url}]` |
| `GET /api/live/stream` | Server-Sent Events | events `live` (data: `Live`) and `state` (data: `{rev}` — refetch) |
| `GET /api/vmix/data` | | flat JSON array for vMix Data Sources (one row per match of today) |
| `GET /api/netinfo` | | `{ addresses: ["192.168.x.x"], port }` — LAN IPv4 addresses for the OBS / vMix page |
| `GET /api/output` | | `[{ name, file, url, mtime }]` — the PNG files in `settings.outputDir`, newest first |

The control panel sends `X-Tournament-Id` with writes. If it differs from the active tournament the server returns 409, preventing stale forms in another tab from changing the wrong tournament. Switching waits for jobs and outstanding uploads/renders. Live revisions remain increasing across switches and a hidden `live` SSE event clears the current graphic. Open control panels reload on an active tournament change so drafts, filters, editors and job displays cannot leak into the new workspace.

## Scenes (`SceneName`) and `GET /api/scene-data`

The game is **League of Legends** (roles Top / Jungle / Mid / Bot / Support). Data comes from https://hll.gr. Names can be Greek: every font must have Greek glyphs.

Every scene response has `{ scene, mode, league: {name, short, season, logo}, theme, sponsors: [Sponsor] }` plus:

| scene | params | extra fields |
| --- | --- | --- |
| `roster` | `team` | `team: Team`, `players: [Player]` (captain first), `record: {w, l}` |
| `versus` | `match` | `match: Match`, `teamA: Team`, `teamB: Team`, `playersA: [Player]`, `playersB: [Player]`, `recordA`, `recordB` |
| `simple-vs` | `match` | `match`, `teamA`, `teamB` (logos only) |
| `schedule` | `day` = `today` \| `tomorrow` \| `YYYY-MM-DD` | `date: "YYYY-MM-DD"`, `dateLabel: "Πέμπτη 30 Οκτωβρίου"`, `matches: [{...Match, teamA: Team, teamB: Team}]` sorted by time |
| `matchup` | `feature` (or `a`, `b` player ids) | `title`, `playerA`, `playerB` (Player + `team: Team`), `rows: [{ key, label, a, b, aText, bText, fmt, better, winner: "a"\|"b"\|"tie" }]` (values are per-GAME averages; `aText`/`bText` already formatted), `gamesA`, `gamesB`, `winrateA`, `winrateB` (0..1 or null), `championsA`, `championsB`: `[{ name, games, icon }]` top 3 (icon = Data Dragon URL), `headToHead: number` (games where both played) |
| `bracket` | | `embed: { type: "iframe"\|"url", src: string, html: string }` |
| `sponsors` | | (uses `sponsors`) |
| `social-schedule` | `day`, `page` (1-based) | day schedule with up to six fixtures; `{pagination:{page,pages,total}}`; 1080×1920 |
| `social-versus` | `match`, `playerA?`, `playerB?`, `effect=halftone|prism|none` | both teams and one visible player from each team; player overrides must belong to the correct team; 1080×1920 |

All scenes accept `background=<uploaded background id>` to override the tournament defaults for that graphic, or `background=preset` for the built-in design. Background ids are resolved only within the active tournament. Theme fields `bgImage`, `versusBgImage`, and `socialBgImage` control default plates. A social-specific background falls back to the general one. The photo effect is a visual overlay; it does not edit the stored photo files.

Scene metadata and dimensions are shared in `public/shared/scenes.js`; server validation, the dashboard, builders and exports consume that registry. To extend it, add a definition with a target (`day`, `match`, `team`, `feature`, or `single`) and register its renderer in `public/overlay/js/render.js`. Cards are generated automatically for registered scene targets and saved presets. Missing source data makes a saved card unavailable instead of silently selecting a different team or match.

## Overlay URL rules (for OBS / vMix)

- `/overlay/master.html` — permanent 1920×1080 source for every registered screen, following `Live` with SSE. Portrait scenes are centred and scaled within this landscape canvas. `/overlay/live.html` remains a compatible alias.
- `/overlay/scene.html?scene=versus&match=m_x` — one fixed scene; it re-renders on SSE `state` events.
- Query flags on both: `static=1` (no animation; final frame at once — used by the PNG renderer), `bg=0` (no background plate → transparent, for keying over gameplay), `mode=simple|full` (override).
- Broadcast scene canvases are 1920×1080; standalone social scenes are 1080×1920. Body background is transparent outside the graphic.
- When `static=1`, the page sets `document.body.dataset.ready = "1"` after fonts and images load. The renderer waits for it.
