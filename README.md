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

- **HLL.GR** — Control panel → Import → HLL.GR → Sync. This reads the teams, the players with their photos, all matches and the per-game player stats from the public pages of hll.gr. Do the sync again after each match day.
- **Google Drive** — Control panel → Import → Google Drive. Paste the folder link.
  - The folder must be shared as **Anyone with the link → Viewer**. A private folder gives an error.
  - Or install Google Drive for desktop and use **Local folder** with the path of the synced folder.
  - Name each file as the player nick, the team name or tag, or the sponsor name. Sub-folders with a team name (`TP/Goldmen.png`) help the match. Folder names with `logo`/`team`, `player`/`photo` or `sponsor` set the kind.
  - A file with no match goes to the **Unmatched** list. Assign it there.

Image processing is automatic:

- Logos: a flat background is removed, the logo is trimmed and centred in a square. The team colours come from the logo.
- Player photos: the background is removed (ISNet) when the photo has no transparency. The photo is trimmed and framed to 800×1000. The colours are matched to one league look (Settings → Photos → strength). Turn this off per player if a photo looks wrong.

## Graphics

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
2. URL: `http://localhost:4610/overlay/live.html` (one source for all graphics; the control panel chooses what is on air).
3. Width `1920`, height `1080`.
4. Tick **Refresh browser when scene becomes active**.
5. Do not tick **Shutdown source when not visible** for `live.html`.

For one fixed graphic, use a second Browser source with `/overlay/scene.html?scene=…`.
Transparency works automatically.

## vMix

1. Add Input → **Web Browser**.
2. URL: `http://localhost:4610/overlay/live.html`, size 1920×1080. Transparency works.
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
- `data/` — the database (`db.json`) and the processed images. Make a backup of this folder.
- `docs/CONTRACT.md` — the API and the data shapes.
- `npm test` — unit tests for the colour and stats code.
