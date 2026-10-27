# Scripting practice and runtime limits

Read this before a long scripted session, and whenever a preview, a tool result or a unit looks wrong. Each item is tagged with the component that owns the limit, so you know whether to work around it or plan for it: **[server]** the local Affinity MCP server, **[host]** the client application running the agent, **[SDK]** the Affinity JavaScript wrapper. Figures such as size limits come from one host client; another host may use different values.

## Tool results and previews

- **[server]** A render is capped at 1024 px on its longest side. Fine type and small geometry are not resolvable in a render; read values with the SDK instead of measuring a preview.
- **[host]** One historical client inlined images only up to about 200 KiB of Base64 and then wrote a local artifact (`inlineLimit=200 KiB`). The 2026-10-20 Codex/functions poster sample forwarded a complete PNG with more than 260,000 Base64 characters. Check how the actual client behaves; do not depend on an artifact path.
- **[host]** Another historical client truncated tool text at roughly 50,000 bytes (`truncate`), while the poster sample's larger complete payload passed in its host context. Avoid unnecessary aggregate dumps and verify completeness.
- **[server]** `list_library_scripts` can return `isError: false` with empty text, which makes an empty script library indistinguishable from a failed read. Treat that result as unknown; do not conclude that no scripts exist.
- **[server]** `list_sdk_documentation` can fail with `Listing failed` while another client is using the local server, which appears to serve one session at a time. Retry once, then surface the failure to the user; do not conclude that the connection is broken.

<a id="execution-efficiency"></a>
## Execution efficiency and undo boundaries

When no user decision or sample approval has to happen in between, combine the necessary target inspection, an already authorized operation and the readback that follows it in one script. Keep the UUID guard before the write and the required visual check after it. A task that is known to be continuous does not need repeated SDK discovery or hints; refresh only after one of the triggers in [session recovery](#session-recovery). Combining calls does not authorize a larger edit, and it does not allow you to drop checks.

Judge an optimization by the request-to-verified-preview time of a representative task, with the same state checks and the same visual scope. Adopt it for speed only when that whole task improves. Fewer commands, shorter output or faster SDK timing on their own do not pass this gate. If the full task does not improve, keep the path that already works instead of dropping verification or shrinking the preview.

For the same transform on independent targets, `Selection.create(doc, nodes)` lets you issue a single transform command. Before you choose this path, verify target membership, the common coordinate system and the protected state, then apply the full-task performance gate above.

`AddChildNodesCommandBuilder` can group compatible insertions into one intended command and undo boundary. Obtain the inserted nodes from `command.newNodes` and follow the [identity checks](page-geometry.md#target-scope-and-coordinates). Treat this as a choice about commands and undo, not as a default speed optimization: changing an existing single-script insertion path still requires a demonstrated gain on the full task. `CompoundCommandBuilder` can group different verified commands into one intended operation. Keep dependencies and sample gates explicit; do not replace ordered writes with concurrent MCP calls, and do not force unrelated operations into one large batch.

Choose the batch boundary to match the undo behavior the user wants, as well as the workload. On a representative sample, verify undo, redo and another undo against the target and protected values you retained. Say which values you compared; a membership or transform check does not establish every property, command type or history state.

One script is not necessarily one undo step. Do not work out a rollback count from the number of API calls or from a `history.position` difference alone: history can coalesce, branch or be limited. Establish the intended boundary on a representative sample, capture the target and protected state, and verify the values that are actually restored. If the boundary is ambiguous, stop; do not undo earlier user work, and do not use an opposite translation as a general rollback. A controlled sample does not explain failures on other histories.

For repeated reads from a stable, generator-backed collection, consider calling `Array.from(collection)` once and reusing the array during that read phase. Profile the task instead of assuming this is faster for every lookup pattern; a single lookup does not need the whole collection materialized. Refresh membership after an insertion, a deletion, a reparenting, undo or redo, or a context change. An array of wrappers is not a snapshot of their mutable properties, so copy the actual values you need to compare. Compare nodes through a documented identity route such as `isSameNode`, not through wrapper-object equality.

Start the timer before imports and target binding, and stop it after the required preview and comparison. Measure preparation, SDK work, tool round trips and rendering separately. Keep the same host entry point, counterbalance the trial order, and report results by order and block as well as by uncertainty; a pooled median on its own does not establish a stable gain. A restored object snapshot does not mean the application was idle, so record reset and undo costs separately, and use independent disposable documents to check whether one trial carries over into the next. An extra readiness read does not guarantee idleness, and moving a wait outside the task timer is not a speed improvement. A prescribed workflow, or a direct Plugin driver, does not prove that an autonomous Agent using a revised Skill is faster; fresh-proxy tests are not cold-application tests.

When you return a compact summary, still compare every required target and protected value inside the script, and return failed checks explicitly. A smaller result helps with output limits; keep any baseline values that later recovery needs outside transient script state.

<a id="single-call-preview"></a>
### Single-call preview for a covered small spread

On **3.3.1.4940 MacOS**, observed **2026-10-19**, a fixed 12-pair Codex/functions experiment applied the same batch500 edit to independent 800 × 600, 96 DPI rectangle samples. Returning a complete native PNG from the edit script shortened the creation-to-image handoff compared with a separate `render_spread` call, and both execution orders showed the gain. This tests the preview path; it is not a claim that batching is faster, nor evidence about an autonomous Agent using this Skill.

Use this branch only when a representative sample confirms the same full visual scope, the required state checks and a real benefit for the task. The host must support explicit native image forwarding, the complete Base64 result must fit its output limit, and temporary Desktop file access must already be authorized. Keep the normal render path for unverified scenes or clients.

1. Guard the intended UUID and current spread, and retain the target and protected values and the selection. Choose a unique task-owned path under `Application.userDesktopPath`, and reject an output that already exists before writing.
2. After the authorized edit and the full readback, call synchronous `Document.export` with `FileExportOptions.createWithPresetName('PNG')` and `FileExportArea.createForCurrentSpread()`. Require the returned export path to match, then read `File.readAll(path).toString('base64')`. In `finally`, remove only the output you own and verify that it is gone; compare the retained state fields and the selection again.
3. Parse the complete image payload and forward it explicitly as native `image/png` content. Text that contains Base64 does not display itself. Hand off the image before you do later work; a buffered `image()` call on its own is not delivery. Keep the required image validation and the representative undo and cleanup checks, and note which checks are inside the task timer and which happen later, at acceptance.

This sample covered 510 names and six matrix components, the ten protected nodes, all 500 selected targets, every PNG pixel and an actual one-step undo back to the ten-node, ten-selection baseline. It does not establish arbitrary export geometry, Bleed or Margin, transparency, colour or metadata equivalence with JPEG, large-image output limits or other platforms. If the export or output fails, reconcile the state you have already edited before you choose a separate render; do not replay the edit, and do not enable permissions automatically.

**Poster scope, observed 2026-10-20 on 3.3.1.4940 MacOS:** a 600 × 800 artboard with four editable text blocks, an embedded raster, and native Margin and Bleed both enabled, exposed a scope gap. Default `render_spread`, `render_selection` and PNG/CurrentSpread left out the Bleed outside Trim. A preview does not prove that Bleed is included or show the Margin state; read the [native geometry guidance](page-geometry.md#read-and-apply-the-correct-native-setting).

For that poster specifically, `FileExportArea.createForSelection(doc.selection)` included the full 620 × 824 Bleed when the verified selection contained every content node and a background whose bounds exactly matched the native Bleed extents. `createForSelectionArea` was not equivalent. Do not replace CurrentSpread blindly: verify the exact membership, visibility and clipping, the coordinate space, the outer bounds and the decoded output. Preserve the selection and all required checks. Never add a covering object, or change document settings, just to force a particular export size.

A separate 12-pair comparison used the **same full-selection PNG** in both arms: one arm created and configured the content and then ran a second export script, while the other created and configured the content and exported it in a single script. Median time from the blank-document request to the explicit image handoff fell from 4714.5 ms to 2638 ms; every pair and both order strata supported the reduction, and all PNG pixels and the actual content undo and cleanup were checked. This is a bounded recipe for a validated complete selection, and it is not a general speed guarantee. It is not a general includeBleed flag or print-ready acceptance, nor a frontend-paint measurement. Keep the unique owned path, complete payload parsing, native image forwarding, `finally` deletion and the post-export state and selection checks described above. Outside this verified geometry, keep the working preview path and report any gap in Bleed visibility.

## Documents and spreads

- **[SDK]** `Document.current` follows the most recently created or activated document, so a script that relies on it can end up with a different target. `render_spread` and `render_selection` take the session UUID explicitly. Bind the intended document and verify its UUID inside every script that modifies an existing document, even when only one document is open. Authorized creation has its own identity-binding step below.
- **[server]** No MCP tool switches the active document. Open the intended document before you run a script that only makes sense for it.
- **[SDK]** Some command-class operations on nodes in another spread require the current spread to be set, but not all of them. `createSetVisibility` (`Document.setVisible`) fails with a bare `COMMAND_FAILED` until the spread is current, while `setEditable`, `Document.applyTransform` and `AddChildNodesCommandBuilder` work without switching. Match the exact error to the operation before you assume a cause.
- **[SDK]** Do not set the spread that is already current; it clears the selection.
- **[SDK]** When a command does require a spread switch, use `DocumentCommand.createSetCurrentSpread` through `Document.executeCommand`, after confirming the target spread and the current state.

<a id="session-recovery"></a>
## Session recovery before further writes

Connection availability, preamble state, document identity and current-spread prerequisites are separate checks. Pick the trigger that actually applies:

| Trigger | Next action |
| --- | --- |
| First scripted connection | Read the preamble, discover and read the relevant topics and required native ranges, enumerate documents, and establish the intended document and spread; if the target does not exist yet, establish the authorized creation intent instead. Keep this material for as long as the connection is unchanged. |
| Explicit preamble-not-read refusal | Stop writing. Read the preamble and the necessary topics and ranges on this connection, then recheck the intended document and the operation's preconditions before you continue. Do not mistake the refusal for a successful edit. |
| Invalid document UUID | Stop using that UUID and the handles cached for it. Enumerate the documents again, match the intended one by title or path and by known content or scope, then use its newly confirmed UUID. A failure of identity alone does not prove that the transport reconnected, and it does not require rediscovering every SDK topic. |
| Timeout/disconnect, application restart or confirmed connection change | Reconnect if needed. After a connection change, read the preamble and the affected topics and ranges again. Enumerate the documents again and discard stale handles. Read back the target state left by the previous operation before you choose any further write. A timeout on an unchanged connection still calls for inspecting the post-state; it does not automatically require full discovery. |
| A new disposable document becomes current | Treat it as a different document, not as proof that the original was reopened or that the MCP connection changed. Keep its identity separate, and re-establish the intended current document before you resume the original task. |
| Normal continuous calls | Reuse the documentation and identity you have confirmed, and keep the in-script UUID guard and the operation-specific spread checks. Do not repeat full enumeration or discovery without a trigger. |

Before **every script that modifies an existing document**, bind the confirmed document and reject a mismatch before any write. Replace the placeholder with the UUID established for this task:

```js
const { Document } = require('/document.js');
const expectedSessionUuid = '<confirmed target UUID>';
const doc = Document.current;
if (!doc || doc.sessionUuid !== expectedSessionUuid) {
  throw new Error('TARGET_DOCUMENT_MISMATCH');
}
// Only now resolve target nodes and perform the authorized operation.
```

For **authorized new-document creation**, no target UUID exists before `Document.createFromOptions()`. First record the requested creation options and the current open-document inventory, without modifying existing documents. After creation, identify the added document from a documented creation result or from a scoped before/after difference in the inventory, then confirm its actual UUID before you populate or otherwise edit it. Stop if the added identity is ambiguous; do not use an assumed current document or a matching title alone. Apply the UUID guard to later writes to that new document. This exception authorizes only the creation that was requested, not edits to another open document.

If the script creates or activates a different document, crosses an asynchronous boundary or changes context in some other way, recheck the intended identity before you write again. Confirm each command's spread prerequisite from the notes above. Switch only when it is needed, and never reset a spread that is already current. Render with the same confirmed UUID and the intended spread index. A failed render with an old UUID does not prove that the content is empty.

When an operation you submitted is uncertain, compare the actual text and runs, geometry, hierarchy, visibility and object counts with the baseline you retained and with the post-state you intended; `isDirty` alone cannot establish that it finished. Resume only the work that is proven missing, not the entire script. If the result or the intended document stays ambiguous, stop the affected writes and ask for the specific activation or decision you need. Do not silently target `Document.current`, close or reopen a user document, or restart the application to force recovery. The proxy reconnects the transport and never replays a call automatically; it does not restore SDK preconditions and does not roll back edits for the agent.

## Saving and state

- **[SDK]** `Document.save()` and `Document.saveAs(path)` return `undefined`, so there is no success value. Verify the intended path, a real readable file and its content, and both the `isDirty` and `needsSaving` flags; the flags alone are not enough. The [owned saveAs/reopen sample](sdk-verified.md#verified-file-and-export-workflow) preserved its nodes, geometry and render, but it does not establish other save routes or give permission to close or reopen user documents.
- **[SDK]** An untitled document can have `isDirty === false` while `needsSaving === true`, so a clean flag alone does not prove that the document was saved.
- **[SDK]** `isDirty` does not mean “the content matches the saved file”: if you undo the whole history of an unsaved document, it stays true. Do not use it to prove the content state.
- **[SDK]** The **2026-10-22** [extended file workflow](sdk-verified.md#extended-file-and-layout-workflow) separately checked async saveAs and save, overwriting an owned file, and a three-frame save and reopen. Async saveAsPackage kept the live document path and the existing dirty flags, so a created package does not confirm that the active file is saved. Its linked-image offline-fidelity counterexample means you should check the originals and the rendered pixels after relocation, instead of trusting a cache preview or resource metadata.

<a id="async-close"></a>
### Async close discards unsaved content

**[SDK] 3.3.1.4940 MacOS, observed 2026-10-21:** `doc.closeAsync(callback)` and `doc.promises.close()` each closed a modified, never-saved disposable sample directly, with `isDirty=true` and `needsSaving=true`. There was no save call and no save-prompt interaction: **the unsaved content was discarded**. The callback received one `undefined` error argument, and the Promise resolved to `undefined`. In both cases, enumerating documents afterwards confirmed that the target was gone. The previously reported `NOT_IMPLEMENTED` failures remain historical; they are not a current Mac result.

1. Bind and guard the intended document UUID, and inspect `isDirty` and `needsSaving`. Before you submit the close, establish whether the user wants to keep or discard unsaved work. Reuse explicit discard authorization only for the sample it names; a general request to close does not authorize losing user work. If the work must be preserved, save only within the authorized path and scope, and verify the save first. Never rely on a GUI save prompt or on undo after the close.
2. Wait for the callback or Promise, handle its error, and enumerate the documents again to confirm that the target is gone and that unrelated documents are intact. A returned `undefined`, or an accepted request on its own, is not enough. After a timeout or an ambiguous result, inspect the inventory before you retry; do not replay a close that may already have completed.

The tested Promise script returned an async IIFE (`return (async () => { await doc.promises.close(); /* verify inventory */ })();`), because this execution context rejected top-level `await`. This validates only the successful close path for the two never-saved samples. It does not cover existing saved files with pending edits, cancellation, failures, timeouts, reopening or application recovery. For text-flow restoration, verify [link/unlink undo](sdk-verified.md#linked-text-flow) while the document is still open.

## Visibility and export

- **[SDK]** On **3.3.1.4940 MacOS, 2026-10-21**, five synchronous formats and `doc.promises.export` for PNG on CurrentSpread produced files that were checked independently. `FileSystemPromises.copyFile` still returned `NO_ENVIRONMENT`; that failure is not a blanket limit on asynchronous methods. Use [the exact preset and scope, completion, record and content checks](sdk-verified.md#verified-file-and-export-workflow). Export preset names are localized. Sync and async PNG can decode to identical pixels but carry different metadata bytes, so a whole-file hash is not a visual oracle.
- **[SDK]** In the tested render route, PixelBuffer has a native `.buffer` ArrayBuffer. Read its bytes with `new Uint8Array(pixelBuffer.buffer)` instead of assuming it has the SDK Buffer `.array` property. Compare enum `.value` with enum `.value`, or with another documented common representation; a strict comparison between a numeric value and an enum object fails before the guard you intended can pass.

- **[SDK]** `isVisibleInExport` is read-only: assigning to it neither throws nor takes effect, and only a getter is exposed; no export-only hide entry point was found. Use `createSetVisibility` instead. Switch the spread first if the node is outside it. Then capture and restore the previous visibility in the same script, read it back after restoring, tell the user that the document was changed temporarily, and do not save while a node is hidden. Hide nodes only when the user asked to exclude them, and after a timeout or interruption restore visibility before anything is saved.

## Geometry, units and text

- **[SDK]** Glyph heights are document pixels at the document's DPI: a value of 100 renders an em of about 100 px whatever the document DPI, and the default frame-text style is 12 pt expressed in the same document-pixel terms. Treat the related size attributes in the same family the same way, but check each one before converting; only the glyph-height convention is established. Multiply by `72 / document.dpi` when you need a point size, and do not divide a stored value by the DPI to “correct” it. The dpi/view DPI caveat in [Page geometry](page-geometry.md) still applies to guide and converter calls.
- **[SDK]** `getPageBoundingBox` accepts an integer index from 0 to 8, an enum member, a `{value: n}` wrapper or the enum key. All four forms returned the same box, so pass the plain integer unless a case specifically needs a wrapper.

## Not established

These are unconfirmed. Verify them before you rely on them.

- A new document's `width` and `height` options can disagree with the spread that was created. After creating a document, read `currentSpread.getSpreadExtents()` instead of trusting the requested orientation.
- A Layout document, which has no artboards, may expose no SDK readback for page margins, and its page boxes can disagree with the finished size measured in the print workflow. Do not take page boxes or assumed defaults as evidence of the finished size of a Layout document.
- A translucent overlay can leave an export that mixes rasterized and sharp vector regions; transparent-capable presets are the commonly reported workaround.
- General Bleed inclusion remains unestablished. The 3.3.1.4940 MacOS poster above left out the outer Bleed in default spread and selection renders and in PNG/CurrentSpread, while an exact complete-selection PNG included it. Verify the scope and the pixels for the actual target.
- `execute_script` can return no output even when a script runs normally.
