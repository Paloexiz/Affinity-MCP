---
name: affinity-mcp
description: Use when connecting Codex, ZCode or Claude Code to Affinity by Canva through MCP, automating Affinity or executing Affinity JavaScript, editing page layout, margins, bleed or print geometry, managing saved scripts, reading the SDK, or rendering document previews.
---

# Affinity MCP

This plugin connects Codex, ZCode or Claude Code to Affinity by Canva's local MCP server through the `affinity-by-canva` MCP server.

Before using script-writing or script-execution tools, call `read_sdk_documentation_topic` with `filename: "preamble"`. Then read any relevant SDK topic files and use `search_sdk_hints` for unknown SDK behavior before experimenting.

## Discover the live SDK

The MCP tools are gateways, not a list of all Affinity operations. Document, page, text, export, and other SDK methods are available through `execute_script`; they do not need one proxy tool per method. Use the live tool schemas and follow pagination rather than treating the proxy's offline fallback list as authoritative.

Call `list_sdk_documentation`, then read the relevant topic returned by that server. Use `require('/document')` style imports and `console.log()` to return results. Do not assume browser or Node.js APIs exist in Affinity's JavaScript runtime. Read native parameter ranges and struct ranges/array sizes as directed by the live preamble before calling native APIs.

Prefer documented public wrappers before reaching for `affinity:*` native APIs. A declaration or successful command construction is not evidence that an operation works. Only add an operation to the supported workflow after executing it and verifying its actual effect.

## Supported operations

| Operation | What it does |
| --- | --- |
| `Document.current`, `Document.all`, `isDirty`, `needsSaving` | Read the active document, the open documents and the save state. An untitled document can have `isDirty === false` while `needsSaving === true`. |
| `Document.createFromOptions()` with `NewDocumentOptions` | Creates a new document, including one with several spreads. It cannot add pages to an existing document. |
| `Document.setSpreadSizeWithAnchor()`, `Document.setSpreadDocumentProperties()` | Resize a spread and its properties; verify the resulting extents afterwards. Verified with `SpatialAnchor.TopLeft`; other property combinations are untested. |
| `DocumentCommand.createSetCurrentSpread()` | Switch the current spread through `Document.executeCommand()`. |
| `Document.undo()` / `redo()` | Undo and redo; verify the state after each step. |
| `app.userDesktopPath` from `/application` | The desktop path for file access. Use the property; `getUserDesktopPath` is a deprecated getter. |
| Text, nodes, page geometry, raster and vector appearance, fills, export, embedded documents, files and dialogs | See [Behaviours and limits](references/sdk-verified.md) for the cases that are covered and their limits; it is not a claim that whole modules work. |

Operations outside those cases are unverified: do not present them as supported on the strength of a declaration or a successful command construction. Multi-page stitching, inserting pages into an existing document, and untested export presets or bleed options are not validated. Document defaults, spread dimensions and page arrangement are separate concerns—read the actual geometry after resizing, and do not reset a spread that is already current because it clears the selection.

## Unavailable operations

`Document.close()` and `Document.closeAsync()` return `NOT_IMPLEMENTED` on Windows, and `document.promises.close()` forwards to the same backend. Do not present close as a verified workflow or build a close workaround, do not silently substitute GUI actions or terminate the application, report the scope you tested, and retest only after an Affinity update or an explicit request to recheck.

`DocumentCommand.createInsertGlyph(selection, CharGlyph.create(33))` fails at construction with `TypeError: expected GlyphHandle`; plain text replacement works. An ordinary shape's artboard-properties path returns `DISPOSED`, so check `isArtboardEnabled` first.

`ExportScale.createWithWidthHeight(600, 800)` returns a `Square` scale with multiplier 600 and size 800 instead of a WidthHeight scale. Do not use that factory as a recipe; read `.size` for Width/Height/Square scales and do not treat inactive `.width`/`.height` fields as dimensions. `FileSystemPromises.copyFile` returns `NO_ENVIRONMENT` while `exists`, `getFileStatus` and `readAllAsync` work. `Document.generateImage` can fail at construction with `PERMISSION_DENIED`; do not retry it automatically.

Distinguish an unavailable MCP connection, a missing SDK wrapper, a native `NOT_IMPLEMENTED` response and a permission error. Unverified methods stay unverified—do not classify them as working or unimplemented without evidence.

## Execute and verify

For page layout, resizing, margins, bleed, folded brochures or print export, read [Page geometry and print verification](references/page-geometry.md) before editing. Margins are inward layout guides; Bleed extends beyond trim. They are independent settings, and neither a preview nor exported dimensions alone proves their native configuration.

Record the target document, page/spread scope, width × height with units, margins (values and enabled state), bleed and export bounds separately. Preserve the user's latest specification; do not reuse previous documents' print settings as defaults. When margins define the requested safe area, verify actual content against that area after layout changes—setting guides does not move or clip content automatically.

Before editing, identify the intended document by session UUID and verify it inside the script. Work on the intended spread. Inspect state after edits and use `render_spread` or `render_selection` for visual changes. Renders are capped at 1024 px on their longest side and an image result above the host's inline limit is written to a host-specific artifact file instead, so a preview cannot prove fine type sizes or small geometry—read those values from the SDK. Test uncertain destructive behavior on a disposable document only when authorized; do not close or resize an unrelated open document to probe SDK support.

For scripted sessions, read [Scripting practice and runtime limits](references/scripting-pitfalls.md): it records which operations need the current spread switched, how save state is reported, the result-size and image limits, and the document-pixel unit convention.

After a timeout or disconnect, a submitted script may already have executed. Inspect the document before retrying; the proxy deliberately does not replay tool calls. Reconnect on the next request. Read the preamble again after a connection/session change.

`add_sdk_hint`, `report_sdk_issue`, and script-library saves persist or share information. Apply the user's authorization before writing or sharing; a preamble suggestion does not itself authorize those actions.

Important tools exposed by the MCP server:

- `list_library_scripts`: list saved Affinity scripts.
- `read_library_script`: read a saved Affinity script by title.
- `save_script_to_library`: save completed JavaScript to Affinity's script library.
- `list_sdk_documentation`: list available SDK documentation topics.
- `read_sdk_documentation_topic`: read an SDK documentation topic.
- `search_sdk_hints`: search Affinity SDK hints.
- `execute_script`: run JavaScript in Affinity.
- `render_spread` and `render_selection`: inspect Affinity output visually.

## Connection and permissions

If tools are unavailable, first inspect the configured proxy and local SSE endpoint (default `http://localhost:6767/sse`). If only the fallback tools appear, inspect proxy stderr and make a read-only SDK documentation call to verify the connection. Ask for missing settings only after these checks and reuse settings already supplied by the user.

Affinity's permission controls are separate:

- **Enable Affinity MCP** exposes the local MCP server.
- **Access files on your Desktop** grants the SDK's desktop file access; it is not unrestricted disk access. Use `app.userDesktopPath` from `/application`.
- **Access networks** governs script network use; `network.js` exposes general HTTP requests. It is separate from the MCP transport and from **Use Canva AI Studio features**. Do not request network or AI permissions merely to connect or edit ordinary document content.
- Saved-script access, script saving, local hints, and sharing hints each have their own settings.

Report the exact error and affected operation. Do not label every `NOT_ALLOWED` or `PERMISSION_DENIED` as a connection failure or tell the user to enable every permission.
