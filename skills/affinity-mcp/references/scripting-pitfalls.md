# Scripting practice and runtime limits

Read this before long scripted sessions and whenever a preview, a tool result or a unit looks wrong. Each item is tagged with the side that owns the limit, so you know whether to work around it or account for it: **[server]** the local Affinity MCP server, **[host]** the client application running the agent, **[SDK]** the Affinity JavaScript wrapper. Figures such as size limits come from one host client; another host may use different values.

## Tool results and previews

- **[server]** A render is capped at 1024 px on its longest side. Fine type and small geometry are not resolvable in a render; read values with the SDK instead of measuring a preview.
- **[host]** An image result is inlined only up to about 200 KiB of base64; larger results are written to a local artifact file instead (the client reports `inlineLimit=200 KiB`). Where that file goes, and any crop or zoom tooling around it, is host behaviour—do not build a workflow that depends on a host path.
- **[host]** A single tool result is truncated at roughly 50,000 bytes (the client reports strategy `truncate`). Aggregate inside the script—counts, ranges and short summaries rather than full dumps.
- **[server]** `list_library_scripts` can return `isError: false` with empty text, so an empty script library and a failed read are indistinguishable. Treat that result as unknown rather than as proof that no scripts exist.
- **[server]** `list_sdk_documentation` can fail with `Listing failed` while another client is using the local server; the server appears to serve one session at a time. Retry once and surface the failure to the user instead of concluding that the connection is broken.

## Documents and spreads

- **[SDK]** `Document.current` follows the most recently created or activated document; scripts using it can therefore acquire a different target. `render_spread` and `render_selection` take the session UUID explicitly. Bind the intended document and verify its UUID inside every script modifying an existing document, even with only one document open. Authorized creation has the separate identity-binding step below.
- **[server]** No MCP tool switches the active document; open the intended document before running a script that only makes sense for it.
- **[SDK]** Setting the current spread is required for some command-class operations on nodes of another spread, not for all of them: `createSetVisibility` (`Document.setVisible`) fails with a bare `COMMAND_FAILED` until the spread is current, while `setEditable`, `Document.applyTransform` and `AddChildNodesCommandBuilder` work without switching. Match the exact error to the operation before assuming a cause.
- **[SDK]** Do not set the spread that is already current: it clears the selection.

<a id="session-recovery"></a>
## Session recovery before further writes

Connection availability, preamble state, document identity and current-spread prerequisites are separate checks. Use the trigger that actually occurred:

| Trigger | Next action |
| --- | --- |
| First scripted connection | Read preamble, discover/read relevant topics and required native ranges; enumerate documents and establish the intended document/spread, or the authorized creation intent if the target does not exist yet. Cache this material for the unchanged connection. |
| Explicit preamble-not-read refusal | Stop writes and read preamble plus necessary topics/ranges on this connection. Recheck the intended document and operation preconditions before continuing; do not mistake the refusal for a successful edit. |
| Invalid document UUID | Stop using that UUID and its cached handles. Re-enumerate documents, match the intended document using title/path and known content/scope, then use its new confirmed UUID. Identity failure alone does not prove a transport reconnection or require rediscovering every SDK topic. |
| Timeout/disconnect, application restart or confirmed connection change | Reconnect if needed; after a connection change, read preamble and affected topics/ranges again. Re-enumerate documents and discard stale handles. Read back the previous operation's target state before choosing any further write. A timeout on an unchanged connection still requires post-state inspection, not automatically full discovery. |
| A new disposable document becomes current | Treat it as a different document, not proof that the original was reopened or the MCP connection changed. Keep its identity separate; re-establish the intended current document before resuming the original task. |
| Normal continuous calls | Reuse confirmed documentation and identity; keep the in-script UUID guard and operation-specific spread checks. Do not repeat full enumeration/discovery without a trigger. |

Before **every script modifying an existing document**, bind the confirmed document and reject a mismatch before any write to it. Replace the placeholder with the UUID established for this task:

```js
const { Document } = require('/document.js');
const expectedSessionUuid = '<confirmed target UUID>';
const doc = Document.current;
if (!doc || doc.sessionUuid !== expectedSessionUuid) {
  throw new Error('TARGET_DOCUMENT_MISMATCH');
}
// Only now resolve target nodes and perform the authorized operation.
```

For **authorized new-document creation**, no target UUID exists before `Document.createFromOptions()`. First record the requested creation options and current open-document inventory, without modifying existing documents. After creation, identify the added document using a documented creation result or a scoped before/after inventory difference, then confirm its actual UUID before populating or otherwise editing it. Stop if the added identity is ambiguous; do not use an assumed current document or a matching title alone. Apply the UUID guard to subsequent writes to that new document. This exception authorizes only the requested creation, not edits to another open document.

If the script creates/activates a different document, crosses an asynchronous boundary, or otherwise changes context, recheck the intended identity before subsequent writes. Confirm each command's spread prerequisite from the notes above; switch only when needed and never reset an already-current spread. Render with the same confirmed UUID and intended spread index. A failed render with an old UUID is not proof of empty content.

For an uncertain submitted operation, compare actual text/runs, geometry, hierarchy, visibility and object counts with the retained baseline and intended post-state; `isDirty` alone cannot establish completion. Resume only the proven missing work, not the entire script. If the result or intended document remains ambiguous, stop affected writes and request the specific document activation or decision needed. Do not silently target `Document.current`, close/reopen a user document, or restart the application to force recovery. The proxy reconnects transport and never automatically replays; it does not restore SDK preconditions or roll back edits for the agent.

## Saving and state

- **[SDK]** `Document.save()` and `Document.saveAs(path)` return `undefined`; there is no success value. A successful save leaves `isDirty` and `needsSaving` false—use those flags as the save check.
- **[SDK]** `isDirty` does not mean "content equals the saved file": undoing the whole history of an unsaved document leaves it true. Do not use it to prove the content state.

## Visibility and export

- **[SDK]** `isVisibleInExport` is read-only: assigning to it neither throws nor takes effect, and only a getter is exposed—no export-only hide entry point was found. Hide the node with `createSetVisibility` instead (switch the spread first if the node is outside it), then capture and restore the previous visibility in the same script, read it back after restoring, tell the user that the document was changed temporarily, and do not save while a node is hidden. Hide nodes only when the user asked to exclude them, and after a timeout or interruption restore visibility before anything is saved.

## Geometry, units and text

- **[SDK]** Glyph heights are document pixels at the document's DPI: a value of 100 renders an em of about 100 px whatever the document DPI, and the default frame-text style is 12 pt expressed that way. Treat the related size attributes in the same family the same way, but check each one before converting—only the glyph height convention is established. Multiply by `72 / document.dpi` when a point size is required; do not divide a stored value by the DPI to "correct" it. The dpi/view DPI caveat in [Page geometry](page-geometry.md) still applies to guide and converter calls.
- **[SDK]** `getPageBoundingBox` accepts an integer index 0–8, an enum member, a `{value: n}` wrapper or the enum key; all four forms returned the same box. Pass the plain integer unless a case specifically needs a wrapper.

## Not established

Treat these as unconfirmed; verify before relying on them.

- A new document's `width`/`height` options can disagree with the created spread: read `currentSpread.getSpreadExtents()` after creating a document rather than trusting the requested orientation.
- A Layout document (no artboards) may expose no SDK readback for page margins, and its page boxes can disagree with the finished size measured in the print workflow. Do not use page boxes or assumed defaults as the finished-size evidence for a Layout document.
- A translucent overlay can leave an export mixing rasterized and sharp vector regions; transparent-capable presets are the commonly reported workaround.
- Whether previews include the bleed area is not established; do not read a preview's proportions as evidence either way.
- `execute_script` can return no output for a script that runs normally.
