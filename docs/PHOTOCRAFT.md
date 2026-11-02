# PhotoCraft on this PC

PhotoCraft 0.17.0 (Windows x64 portable) is installed at:

`D:/Asset Studio/tools/photocraft/0.17.0/photocraft-0.17.0-windows-x64-portable/`

The downloaded archive was checked against the release SHA256SUMS.txt:
`3453777af0a0b376bfea0d1ccf42bedcbe1c324e1836b50d6227b9e1d64a20ab`.

## Player photos

Settings → Player photo pipeline → Photo processing → **PhotoCraft**.
This default belongs to the active tournament. For one player, open their editor,
choose **Photo processing → PhotoCraft**, and click **Apply to this photo**.
Choose **Tournament default** to inherit the active tournament's setting or
**Standard** to opt out. The per-player choice also applies to later uploads.
The program shows local PhotoCraft availability and disables unavailable choices.
Upload/import and Re-process use it automatically. ISNet supplies the initial
subject mask for opaque photos. Existing transparent photos retain their supplied
mask. PhotoCraft refines the edge using Select and Mask, a small feather and edge
shift, and colour decontamination. It then corrects colour casts and contrast with
faded automatic adjustments, restores shadows slightly, and adds mild vibrance.
PNG exports remain transparent and use the configured framing and dimensions.

The colour toggle, strength slider and per-player original-colour option are
respected. PhotoCraft mode replaces the old league colour transfer rather than
stacking both colour systems. Choosing Standard restores the original pipeline.
An unavailable PhotoCraft installation reports an error; it does not silently
claim to process the image. Batch results report completed photos and errors.

Original uploads stay in `data/raw/players/`. Uncorrected refined cutouts stay in
`data/raw/cutouts/`, so reapplying a colour grade never compounds the previous
grade. Backups of pre-PhotoCraft results are under `data/backups/`.

Machine-local executable configuration is `data/photocraft.json`; the
`HLL_PHOTOCRAFT` environment variable takes precedence. The code talks JSON-RPC
to the native `photocraft-cli mcp` process. Each edit has an isolated temporary
read/write root and a two-minute request timeout.

## MCP in Asset Studio and other projects

Asset Studio reads extra servers from `D:/Asset Studio/data/mcp/extra-servers.json`.
Both its Claude and Codex session builders register PhotoCraft and substitute the
current workspace for `${workspace}`. New sessions receive it after the backend
loads the change; an existing agent session may need to be reopened to discover
the added tools. Other Studio tools remain registered.

PhotoCraft is also registered in the user's Codex and Claude Code MCP settings.
The global launcher `D:/Asset Studio/tools/photocraft/mcp-launcher.py` scopes
read/write access to the client's current working directory. It accepts
`--root <absolute folder>` when launched by hand.

Start with `doc_open`, use `command_list` with a filter to discover exact engine
commands and parameters, apply `command_run` or `command_batch`, then
`doc_export` to a new PNG or `doc_save` to a layered `.pcraft`/PSD. Preview with
`render_preview`. File paths must stay inside the configured workspace.
The MCP server works headlessly; the desktop editor need not be open.

This release's Select Subject is a classical saliency/GrabCut algorithm. It is
available for manual MCP use, but the automatic portrait workflow uses ISNet plus
PhotoCraft refinement rather than assuming the classical selector is superior.

Upstream: https://github.com/storytold/photocraft
MCP reference: https://github.com/storytold/photocraft/blob/v0.17.0/docs/mcp.md
