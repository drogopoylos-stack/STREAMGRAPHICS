# HLL Broadcast Graphics

Livestream graphics for **HLL – Hellenic Legends League** (League of Legends, https://hll.gr).
One local program: a control panel for the operator, live overlays for OBS Studio / vMix, and PNG export.

## Start

1. Install Node.js 22 or newer.
2. In this folder, run `npm install` (one time).
3. Run `npm start`.
4. Open http://localhost:4610 — the control panel.

The first background removal downloads the ISNet model (178 MB) to `models/`.
PNG export needs Google Chrome or Microsoft Edge. Set `HLL_BROWSER` to the .exe path if it is in a different place.

## Get the data

Use **Active tournament** in the top bar to choose which tournament you are working on. Open **Tournaments → Add tournament** to create another one, set its name and optional broadcast days, then choose **Switch tournament**. Your existing HLL setup is kept as the first tournament.

Each tournament has its own teams, players, matches, stats, sponsors, branding, imports, photo settings and export folder. HLL stays intact when you work on another event. Broadcast days are reminders; switching is manual. A switch takes graphics off air and updates every open control panel and the live OBS / vMix source. Wait for running imports, processing, uploads or renders to finish before switching. The same `/overlay/live.html` source works across tournaments; choose a graphic and put it on air after switching.

- **HLL.GR** — Control panel → Import → HLL.GR → Sync. This reads the teams, the players with their photos, all matches and the per-game player stats from the public pages of hll.gr. Do the sync again after each match day.
- **Google Drive** — Control panel → Import → Google Drive. Paste the folder link.
  - The folder must be shared as **Anyone with the link → Viewer**. A private folder gives an error.
  - Or install Google Drive for desktop and use **Local folder** with the path of the synced folder.
  - Name each file as the player nick, the team name or tag, or the sponsor name. Sub-folders with a team name (`TP/Goldmen.png`) help the match. Folder names with `logo`/`team`, `player`/`photo` or `sponsor` set the kind.
  - A file with no match goes to the **Unmatched** list. Assign it there.

Image processing is automatic:

- Logos: a flat background is removed, the logo is trimmed and centred in a square. The team colours come from the logo.
- Player photos: the background is removed (ISNet) when the photo has no transparency. The photo is trimmed and framed to 800×1000. The colours are matched to one league look (Settings → Photos → strength). Turn this off per player if a photo looks wrong.

PhotoCraft is available in Settings → Player photo pipeline → Photo processing. It uses the existing ISNet subject mask, then PhotoCraft's Select and Mask with colour decontamination to refine edges. Colour correction uses restrained Auto Color, Auto Contrast, shadow recovery and Vibrance instead of league colour transfer, preserving team jerseys and natural skin tones. The correction strength and per-player original-colour switch still apply. All PhotoCraft operations run locally through its native MCP server.

For just one player: **Players → click the player → Photo processing → PhotoCraft → Apply to this photo**. Choose **Tournament default** to follow that tournament's settings, or **Standard** to use the original processor. The player's choice is saved for future uploads. Settings shows whether PhotoCraft is installed on this PC.

Set `HLL_PHOTOCRAFT` to the absolute `photocraft-cli.exe` path, or save `{ "command": "C:/path/to/photocraft-cli.exe" }` in `data/photocraft.json`. Choose **Standard** on a PC without PhotoCraft. Originals stay in `data/raw/players`; reprocessing always starts from those originals. See [PhotoCraft setup](docs/PHOTOCRAFT.md) for this machine's install and MCP use.

## Graphics

**Master URL:** `http://localhost:4610/overlay/master.html` — add it once as a 1920×1080 Browser Source in OBS or vMix. The **Live** page is the graphics dashboard for the selected tournament: search or filter schedules, match screens, rosters, matchups, sponsors, brackets and social posters. **Preview** prepares a screen; **Take** puts it on the Master URL; **Hide** clears the stream. The existing `/overlay/live.html` address continues to work.

Use the Custom scene builder to choose a match, date, players and background, then **Save to dashboard** to keep that configuration in the active tournament. These are live presets, so team names, scores and player photos stay current. New scenes registered in `public/shared/scenes.js` automatically participate in the dashboard.

**Custom backgrounds:** Graphics & export → Custom backgrounds → upload an image. Apply it to all screens or only social graphics. The builder can also choose an uploaded background for one saved graphic, or restore its built-in design. Background libraries and choices belong to the selected tournament.

**Instagram / TikTok:** Graphics & export → Single render → choose **Social · Day schedule (9:16)** or **Social · Match poster (9:16)**. Set the day or match, choose one player from each team for a poster, and select **Halftone**, **Prism**, or no overlay effect. The preview uses the portrait layout. Render and **Download PNG** at **1080×1920**. Vertical schedules use six fixtures per page; use the Page field for longer days. Social screens can also be cued through the Master URL, which centres them inside its 16:9 canvas.

| Scene | URL parameters |
| --- | --- |
| Team roster (16:9) | `scene=roster&team=<teamId>` |
| Versus | `scene=versus&match=<matchId>` |
| Simple VS (logos only) | `scene=simple-vs&match=<matchId>` |
| Day schedule | `scene=schedule&day=today` / `tomorrow` / `YYYY-MM-DD` |
| Player vs player | `scene=matchup&feature=<featureId>` or `&a=<playerId>&b=<playerId>` |
| Bracket (embed) | `scene=bracket` — paste the embed code in Settings |
| Sponsors | `scene=sponsors` |

Flags for every URL: `bg=0` (no background, transparent over gameplay), `mode=simple` (logos only), `static=1` (no animation).
The control panel → OBS / vMix page makes these URLs for you with a copy button.

## OBS Studio

1. Sources → **+** → **Browser**.
2. URL: `http://localhost:4610/overlay/master.html` (one source for all graphics; the Live dashboard chooses what is on air).
3. Width `1920`, height `1080`.
4. Tick **Refresh browser when scene becomes active**.
5. Do not tick **Shutdown source when not visible** for the Master URL.

For one fixed graphic, use a second Browser source with `/overlay/scene.html?scene=…`.
Transparency works automatically.

## vMix

1. Add Input → **Web Browser**.
2. URL: `http://localhost:4610/overlay/master.html`, size 1920×1080. Transparency works.
3. Optional, for your own GT titles: Settings → **Data Sources** → JSON → `http://localhost:4610/api/vmix/data` (one row for each match of today).

## Other PC on the network

Replace `localhost` with the IP address of this PC, for example `http://192.168.1.20:4610/overlay/live.html`.
Allow port 4610 in the Windows firewall.

## PNG export

Control panel → Graphics → **Render all**. The PNG files go to the output folder (Settings).
In OBS (Image source) or vMix (Image input), point to a file in that folder. The image updates when you render again.

## Files

- `server/` — the Express server, the HLL.GR import, Drive import, image processing, PNG render.
- `public/control/` — the control panel. `public/overlay/` — the graphics.
- `data/` — all tournaments in `db.json` and the processed images. Make a backup of this folder. The first update to tournament support automatically saves the previous database as `db.json.before-tournaments-*.json`.
- `docs/CONTRACT.md` — the API and the data shapes.
- `npm test` — unit tests for the colour and stats code.
