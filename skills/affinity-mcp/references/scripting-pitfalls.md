# Scripting practice and runtime limits

Read this before long scripted sessions and whenever a preview, a tool result or a unit looks wrong. Each item is tagged with the side that owns the limit, so you know whether to work around it or account for it: **[server]** the local Affinity MCP server, **[host]** the client application running the agent, **[SDK]** the Affinity JavaScript wrapper. Figures such as size limits come from one host client; another host may use different values.

## Tool results and previews

- **[server]** A render is capped at 1024 px on its longest side. Fine type and small geometry are not resolvable in a render; read values with the SDK instead of measuring a preview.
- **[host]** One historical client inlined images only up to about 200 KiB of Base64, then wrote a local artifact (`inlineLimit=200 KiB`). This is not a universal limit; the 2026-10-20 Codex/functions poster sample forwarded a complete PNG with more than 260,000 Base64 characters. Verify the actual client's handling; do not depend on an artifact path.
- **[host]** One historical client truncated tool text at roughly 50,000 bytes (`truncate`); the poster sample's larger complete payload passed in its host context. Aggregate unnecessary dumps and verify completeness rather than assuming either observation defines another client's limit.
- **[server]** `list_library_scripts` can return `isError: false` with empty text, so an empty script library and a failed read are indistinguishable. Treat that result as unknown rather than as proof that no scripts exist.
- **[server]** `list_sdk_documentation` can fail with `Listing failed` while another client is using the local server; the server appears to serve one session at a time. Retry once and surface the failure to the user instead of concluding that the connection is broken.

<a id="execution-efficiency"></a>
## Execution efficiency and undo boundaries

Combine necessary target inspection, an already authorized operation and its immediate readback in one script when no user decision or sample approval must intervene. Keep the UUID guard before the write and the required visual check afterwards. A known continuous task does not need repeated SDK discovery or hints; refresh only after the triggers in [session recovery](#session-recovery). Combining calls does not authorize a larger edit or removing checks.

Choose an optimization by a representative task's request-to-verified-preview time, retaining the same state checks and visual scope. Adopt it for speed only when that full task improves; fewer commands, shorter output or faster SDK timing alone do not meet this gate. If it does not improve, keep the working path rather than dropping verification or shrinking the preview.

For the same transform on independent targets, `Selection.create(doc, nodes)` allows a single transform command. Verify target membership, the common coordinate system and protected state before selecting this path, then apply the full-task performance gate above.

`AddChildNodesCommandBuilder` can organize compatible insertions into one intended command/undo boundary; obtain inserted nodes from `command.newNodes` and follow the [identity checks](page-geometry.md#target-scope-and-coordinates). Treat this as a command/undo choice, not a default speed optimization; changing an existing single-script insertion path still requires a demonstrated full-task gain. `CompoundCommandBuilder` can group different verified commands into one intended operation. Keep dependencies and sample gates explicit; do not replace ordered writes with concurrent MCP calls or force unrelated operations into one large batch.

Choose the batch boundary for the requested undo behavior as well as the workload. Verify undo, redo and another undo against retained target and protected values on a representative sample. State which values were compared; a membership/transform check does not establish every property, command type or history state.

One script is not necessarily one undo step. Do not derive a rollback count solely from API-call count or a `history.position` difference: history may coalesce, branch or be limited. Establish the intended boundary on a representative sample, capture target and protected state, and verify the actual restored values. Stop at an ambiguous boundary rather than undoing earlier user work or using an opposite translation as a general rollback. The controlled sample does not explain failures on other histories.

For repeated reads from a stable generator-backed collection, consider one `Array.from(collection)` and reuse the array within that read phase; profile the task rather than assuming this is faster for every lookup pattern. A single lookup does not require materializing the entire collection. Refresh membership after insertion, deletion, reparenting, undo/redo or a context change. An array of wrappers is not a snapshot of their mutable properties: copy the actual values needed for comparison. Compare nodes through a documented identity route such as `isSameNode`, not wrapper-object equality.

Fewer SDK commands or less enumeration work does not guarantee a faster request-to-preview result. Start task timing before imports and target binding, and finish after the required preview and comparison; measure preparation, SDK work, tool round trips and rendering separately. Keep the same host entry point, counterbalance trial order, and report results by order and block as well as uncertainty; a pooled median alone does not establish stable gain. A restored object snapshot does not establish application idleness: record reset/undo costs separately, and use independent disposable documents to check for carry-over from a previous trial. An extra readiness read is not an idle guarantee, and moving a wait outside the task timer is not a speed improvement. A prescribed workflow or direct Plugin driver does not prove an autonomous Agent using a revised Skill is faster; fresh-proxy tests are not cold-application tests.

When returning a compact summary, still compare every required target and protected value inside the script and return failed checks explicitly. A smaller result is useful for output limits but is not itself evidence of faster execution; preserve any baseline values needed for later recovery outside transient script state.

<a id="single-call-preview"></a>
### Single-call preview for a covered small spread

On **3.3.1.4940 MacOS**, observed **2026-10-19**, a fixed 12-pair Codex/functions experiment used the same batch500 edit on independent 800 × 600, 96 DPI rectangle samples. Returning a complete native PNG from the edit script shortened creation-to-image handoff compared with a separate `render_spread` call; both execution orders supported the gain. This tests the preview path, not a batching speed claim or autonomous Agent use of this Skill.

Use this branch only when a representative sample confirms the same full visual scope, required state checks and actual task benefit; the host must support explicit native image forwarding, the complete Base64 result must fit its output limit, and temporary Desktop file access must already be authorized. Keep the normal render path for unverified scenes or clients.

1. Guard the intended UUID/current spread and retain target/protected values and selection. Choose a unique task-owned path under `Application.userDesktopPath`; reject an existing output before writing.
2. After the authorized edit and full readback, use synchronous `Document.export` with `FileExportOptions.createWithPresetName('PNG')` and `FileExportArea.createForCurrentSpread()`. Require the returned export path to match, then read `File.readAll(path).toString('base64')`. In `finally`, remove only the owned output and verify it is absent; compare the retained state fields and selection again.
3. Parse the complete image payload and explicitly forward it as native `image/png` content. Text containing Base64 does not display itself. Hand off the image before later work; a buffered `image()` call alone is not delivery. Keep required image validation and the representative undo/cleanup checks; record which checks are inside the task timer and which are later acceptance checks.

This sample covered 510 names/six matrix components, the protected ten nodes, all 500 selected targets, every PNG pixel and actual one-step undo to the ten-node/ten-selection baseline. It does not establish arbitrary export geometry, Bleed/Margin, transparency, colour/metadata equivalence to JPEG, large-image output limits or other platforms. On an export/output failure, reconcile the already edited state before choosing a separate render; do not replay the edit or enable permissions automatically.

**Poster scope, observed 2026-10-20 on 3.3.1.4940 MacOS:** a 600 × 800 artboard with four editable text blocks, an embedded raster and enabled native Margin/Bleed exposed a scope gap: default `render_spread`, `render_selection` and PNG/CurrentSpread omitted outside-Trim Bleed. A preview does not prove Bleed inclusion or Margin state. Read the [native geometry guidance](page-geometry.md#read-and-apply-the-correct-native-setting).

For that specific poster, `FileExportArea.createForSelection(doc.selection)` included the full 620 × 824 Bleed when the verified selection contained every poster content node and a background whose bounds exactly matched the native Bleed extents. `createForSelectionArea` was not equivalent. Do not replace CurrentSpread blindly: verify exact membership, visibility/clipping, coordinate space, outer bounds and the decoded output. Preserve selection and all required checks; never add a covering object or change document settings solely to force a desired export size.

A separate 12-pair comparison used the **same full-selection PNG** in both arms: create/configure/content then another export script, versus one create/configure/content/export script. Blank-document request to explicit image handoff medians were 4714.5 → 2638 ms; all pairs and both order strata supported a reduction, with all PNG pixels and actual content-undo/cleanup checked. This is a bounded recipe for a validated complete selection, not a general includeBleed flag, a universal speed guarantee, print-ready acceptance or a frontend-paint measurement. Keep the unique owned path, complete payload parsing, native image forwarding, `finally` deletion and post-export state/selection checks above. Outside this verified geometry, retain the working preview path and report any Bleed visibility gap.

## Documents and spreads

- **[SDK]** `Document.current` follows the most recently created or activated document; scripts using it can therefore acquire a different target. `render_spread` and `render_selection` take the session UUID explicitly. Bind the intended document and verify its UUID inside every script modifying an existing document, even with only one document open. Authorized creation has the separate identity-binding step below.
- **[server]** No MCP tool switches the active document; open the intended document before running a script that only makes sense for it.
- **[SDK]** Setting the current spread is required for some command-class operations on nodes of another spread, not for all of them: `createSetVisibility` (`Document.setVisible`) fails with a bare `COMMAND_FAILED` until the spread is current, while `setEditable`, `Document.applyTransform` and `AddChildNodesCommandBuilder` work without switching. Match the exact error to the operation before assuming a cause.
- **[SDK]** Do not set the spread that is already current: it clears the selection.
- **[SDK]** When a command requires a spread switch, use `DocumentCommand.createSetCurrentSpread` through `Document.executeCommand`, after confirming the target spread and current state.

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
- **[SDK]** An untitled document can have `isDirty === false` while `needsSaving === true`; a clean flag alone does not establish that the document has been saved.
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
- General Bleed inclusion remains unestablished. The 3.3.1.4940 MacOS poster above omitted outer Bleed in default spread/selection renders and PNG/CurrentSpread, while an exact complete-selection PNG included it; verify the actual target's scope and pixels.
- `execute_script` can return no output for a script that runs normally.
