# Google Sheets match source

Open **Settings → Google Sheets · Matches**, paste a Google Sheet URL, enable automatic sync and save. The **Matches** tab must follow the SUPERCUP template. Share this match-only file as **Anyone with the link → Viewer**; keep write access with the tournament operators. No Google credentials are stored in the program.

The server reads the sheet every 30 seconds while running, including when another tournament is selected. Google caching or temporary network failures can delay updates. **Sync now** checks immediately. Dashboard status shows the last successful sync or the reason a snapshot was rejected. The previous valid matches stay available on an error.

## Editing

- Change `date` (YYYY-MM-DD), `time` (HH:mm, tournament timezone), `score_a`, `score_b`, `status`, `best_of`, `stage`, `cast` and `notes` in the sheet. Blank date/time means TBD; blank score is distinct from zero.
- `status`: `scheduled`, `live`, `done`. A completed match requires two known teams and a valid final score. A decisive score (for example 2–1 in a best-of-3) finishes the match and advances the winner, also when `status` still says `scheduled` or `live`. With `best_of` TBD, only `done` finishes the match. `best_of`: 1, 3, 5, or TBD. `cast`: yes, no, tbd.
- Keep `match_id`, `id`, headers and all existing rows. Sorting rows is supported. This connector updates the existing bracket rather than adding/removing tournament matches.
- Use tags from the Teams tab for seeded opponents. Keep calculated team cells and winner/loser formulas intact.
- GSL opening draw: fill the four `source_a` / `source_b` fields for G1 and G2 with the four qualifying paths, once each, e.g. `W:3-1`. All four slots must be set; partial draws are rejected. Other bracket dependencies stay fixed.
- If correcting a previous winner changes participants in an already started later match, clear that later match's scores and set it to scheduled. Otherwise the snapshot is rejected to avoid assigning old scores to a different team.

While connected, match writes and opening-draw edits from the dashboard are blocked. Rosters remain editable in the dashboard. Turn off automatic sync to edit matches locally again; re-enabling sync makes the sheet authoritative.

## Feeds

**Google CSV**, usable by an external site without the local server:

`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq?tqx=out:csv&sheet=Matches`

Read column names rather than fixed positions. This contains the template's calculated tags and its stable match IDs.

The program also serves tournament-specific feeds, independent of which tournament is selected:

- `/api/tournaments/TOURNAMENT_ID/matches.json`
- `/api/tournaments/TOURNAMENT_ID/matches.csv`

The JSON contains tournament name/timezone, `updatedAt`, and `matches`: IDs, date, time, stage, status, best_of, cast, resolved team objects (id/tag/name/logo/placeholder), scores, winner/loser IDs, and bracket source objects. CSV has flat tags and result fields. Feeds support cross-origin GET and do not expose player records or settings. Relative logo paths refer to this server.

`localhost` is only reachable on the same machine. Use the Google CSV for a remotely hosted site, or host the program at a reachable address. Program feeds reflect the last successfully imported snapshot; they are not a direct Google proxy. Exported PNGs remain static; live browser-source graphics update automatically.

## Bracket page for a website

Settings → Google Sheets · Matches → **Bracket page for a website** → **Download bracket page** gives one HTML file (`/api/tournaments/TOURNAMENT_ID/bracket-embed.html`). It contains the bracket format, the team names and the logos, and it reads the results from the public sheet every 30 seconds in the browser of the visitor. It does not need this program. Put the file on any web host (SUPERCUP 2026: GitHub Pages, branch `gh-pages`, folder `supercup/`). Download and publish it again after you change teams, logos or the bracket format; results, dates and the GSL draw come from the sheet.

URL options: `?bracket=<id>` opens one bracket first, `?tabs=0` hides the bracket tabs, `?bg=0` makes the background transparent. Embed it with an iframe; the page sends its height with `postMessage({ type: "bracket-embed-height", id, height })`, where `id` is the `frame` URL option.
