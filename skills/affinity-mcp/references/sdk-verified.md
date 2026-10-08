# Behaviours and limits

Cases below are operation-specific records, not whole-module guarantees. Read the live preamble and relevant topics/ranges before first use, retaining them during an unchanged session. Revalidate affected assumptions after build/connection changes or conflicting results.

<a id="version-boundaries"></a>
## Version boundaries

Unless explicitly marked 3.3 below, entries retain the historical 3.2-era reference observations; their original per-case build/platform metadata is incomplete. They are lookup leads for a different build, not inherited test passes. The 3.2.3.4646 Windows close failure is historical. The 2026-10-08 samples specifically used **3.3.0.4850 Win32**; an independent SDK version was not obtained. Plugin version and application build are separate.

Mandatory preamble reading does not make every preamble/hint claim correct. Prefer the current public wrapper, verify exact native imports/ranges when needed, and compare the requested result with actual post-state. An `ALWAYS add hint` suggestion does not override user authorization. The 3.3 samples used `app.userDesktopPath`; Collection `.first` / `.at(0)` worked while `[0]` did not. A missing `DocumentApi.getDocumentProperties` entry does not prove all native property reads are absent. Spread prerequisites vary by command; use [the operation-specific notes](scripting-pitfalls.md#documents-and-spreads), not a blanket switch before every edit.

## Nodes and text

- `AddChildNodesCommandBuilder` inserts nodes and returns them in `command.newNodes`. `Document.addNode()` returns `undefined`—do not read `.newNodes` from it.
- `createMoveNodes` with `NodeMoveType.Inside` and `NodeChildType.Main` moves nodes without changing spread bounds. Setting and clearing a selection works.
- `applyTransform(Transform.createTranslate(x, y), node)` moves a node by exactly (x, y). `Transform.data` holds six values with the translation at indices 2 and 5. Transform and inverse point roundtrips work, as do RGBA8 colour clone/alpha/tint/noise and the `HandleObject` null guard.
- Shape parameters such as `ShapeStar.points`, `innerRadius` and `curvedEdges` survive creation and readback. Curve entry counts include control and closure entries—do not equate them with visible corners, and a readable compound-operation value is not evidence of executed Boolean geometry.
- `StoryBuilder` creates frame text with the default style; `createSetText` replaces it. `Story.text`, the glyph accessors, `StoryInterface` and single-frame `TextFrameInterface` are readable. A `StoryInterface` range can include one more entry than `Story.length`, and an empty special-glyph collection does not prove that every special glyph type works—do not treat either as interchangeable.
- Replace and format text through an explicit text sub-selection:

```js
const { Selection, TextSelection } = require('/selections');
const { DocumentCommand } = require('/commands');
const selection = Selection.create(document, textNode);
selection.addSubSelectionForNode(textNode,
  TextSelection.create({ begin: 0, end: textNode.story.length }));
document.executeCommand(DocumentCommand.createSetText(selection, 'Replacement'));
```

- A historical convenience wrapper referenced missing `TextSelection.from`. The inspected 3.3.0.4850 `Node.setText` wrapper instead uses `TextSelection.create(this.storyRange)`; plain full replacement passed on the sample. `begin` / `end` identify endpoints, not start / length. Use the actual story range and verify the target text; linked/partial ranges need their own checks.
- Plain replacement is not a format-preserving recipe: in a 3.3 sample, full replacement merged 20px/12px runs into 20px. For preservation tasks, capture character/paragraph runs first and sample-verify the intended edit/range. The same-length, single-run artistic edit below passed only its limited case. `canHideOverflow` is a capability getter; neither its value nor a complete Story proves visible content or permanent deletion.
- `Font.all` enumerates the installed fonts; `StoryDelta.createPostscriptName` with `createFormatText` selects one. Glyph height, character spacing, alignment and indents can be set on live text and read back. A character-spacing value of 2 produces very wide spacing and wrapping—it is not a two-pixel recipe.
- `CharGlyph.create(33)`, clone, `char32` and `string` work. `createInsertGlyph` with such a typed glyph fails at construction (`expected GlyphHandle`).

<a id="text-tool-choice-and-refit"></a>
## Text tool choice and refit

Prefer **Artistic Text** for new text, including ordinary multiline paragraphs. Keep a paragraph or continuous, jointly positioned copy in one editable object; use internal line/paragraph breaks and character formatting instead of splitting it into separate lines or words. Separate objects are appropriate for independent labels, columns or deliberate independent transforms, not simply because the copy has multiple lines. Artistic Text supports multiple lines; its natural width follows its longest line, and scaling it changes the glyph size. A three-line artistic object with mixed font-height runs and a same-length edit inside one run was verified on 3.3.0.4850 Win32; arbitrary cross-run replacements remain unverified.

Choose **Frame Text** for a specific fixed-width reflow, column, linked-flow or fixed-container requirement, or when explicitly requested. This preference does not authorize converting existing objects. After changing text:

1. Preserve the agreed font sizes and content. Read full text, line breaks, character/paragraph attribute runs, frame dimensions and text render/UI scale matrices before editing; plain string equality alone does not prove formatting survived.
2. Establish the permitted container constraints. For a fixed-width column, hold the agreed width and allow height changes within the available area; for a fixed-size card/cell, preserve both dimensions and adjust internal layout only within the brief. Artistic headings normally retain their natural content bounds.
3. When frame dimensions may change, establish width first, allow reflow, then measure the resulting line layout and required height. Include insets, first-baseline/Initial Advance, leading and neighboring objects; do not fit to glyph ink alone or assume the old height is suitable after editing.
4. Use only a documented, sample-verified frame-resize route that preserves glyph sizes and text scales. UI frame-handle resizing and scaling the entire text object have different semantics; a generic transform plus a box ratio is not an established auto-fit recipe. No automatic frame-fit method is verified here. If the available SDK cannot reliably resize/reflow or expose the needed measurement, stop that operation, identify the unmet width/height or overflow constraint, and request the specific UI adjustment or another authorized layout choice. Do not claim a completed fit or silently shrink type, delete copy, or split it into fragments.
5. Re-read text and intended character/paragraph attributes, font-height runs, text scale matrix components, frame/content geometry and overflow/clipping. Verify all copy and the final line are visible without unintended overlap; a complete Story can still overflow or be clipped. `canHideOverflow` is a capability getter, not an overflow-state toggle. Fixed frames need not shrink to their contents for accurate content alignment; use the measured content boundary instead.

Native vertical frame Align has no verified read/write entry in the inspected 3.3 SDK surfaces. UI supports vertical alignment, but moving or tightening a frame does not set that native mode. Initial Advance is vertical first-baseline spacing; FirstLineIndent is horizontal indentation. Keep those, insets, leading and baseline-grid constraints distinct.

<a id="text-alignment-workflow"></a>
## Text alignment workflow

Verified on Affinity **3.3.0.4850 Win32** with two unlinked, multiline `FrameTextNode` objects: native paragraph `Centre` followed by horizontal translation aligned the text blocks while preserving text, font-height runs, text scale matrices, frame width/height and vertical position. This covers horizontal centering, not native vertical frame alignment or automatic frame fitting.

1. Confirm the target document UUID, spread and text nodes. Unless the user explicitly asks to align frame bounds, use text content as the alignment object. Clarify an ambiguous reference (each other, page or key object) and whether multiline paragraphs should be centered internally. Offer the combined case when needed: paragraph centering and block alignment are not mutually exclusive. Preserve paragraph style if the user explicitly requests only moving the blocks.
2. When multiline centered layout is intended, apply native paragraph `Centre` to each target's explicit text sub-selection first. For the verified unlinked-frame case:

   ```js
   const { Selection, TextSelection } = require('/selections.js');
   const { DocumentCommand } = require('/commands.js');
   const { StoryDelta, ParagraphAlignXType } = require('/storydelta.js');
   // doc and textNode have already been identified and scope-checked.
   const selection = Selection.create(doc, textNode);
   selection.addSubSelectionForNode(textNode,
     TextSelection.create(textNode.storyRange));
   doc.executeCommand(DocumentCommand.createFormatText(selection,
     StoryDelta.createAlignX(ParagraphAlignXType.Centre)));
   ```

   Read `story.getParagraphAttRunsFrom(0)` and check `paragraphAtts.alignXType.value === 1` for the intended paragraphs before positioning. Linked frames require separately verified story/paragraph ranges; do not assume their ranges start at zero or affect only one frame.
3. After paragraph formatting, measure glyph geometry in spread coordinates:

   ```js
   const glyphBox = textNode.curvesInterface.polyPolyCurves
     .getExactBoundingBox(textNode.baseToSpreadTransform);
   ```

   Reject null, empty or non-finite bounds. This reads glyph outlines without converting the editable text to curves or mutating those outlines; the method accepts the transform directly, so no clone-and-transform step is needed. `getExactSpreadVisibleBox(false, false)` matched these glyph bounds in the verified plain-frame samples; ordinary `getSpreadVisibleBox(false)` included frame geometry and was unsuitable as a content-center proxy. Do not assume these equivalences for decorated or clipped objects.
4. Compute each block's center as `glyphBox.x + glyphBox.width / 2`, then `dx = targetX - centerX`. Use the agreed reference for `targetX`; for alignment within the current selection, the midpoint of the original combined content bounds preserves the selection's overall horizontal placement. Capture that reference before paragraph formatting. Apply pure horizontal translations with `DocumentCommand.createTransform(Selection.create(doc, textNode), Transform.createTranslate(dx, 0))`, importing `Transform` from `/geometry.js`. Batch each phase with `CompoundCommandBuilder`; format, remeasure, then translate in one script rather than iterating from screenshots.
5. Read back paragraph modes and content centers, plus unchanged text, font-height runs, frame y/width/height and text scale matrix components (compare values, not object identity). Render to check that short and long lines are centered within each paragraph and that the blocks share the requested axis. Checking only the combined outer bounds misses paragraphs left-aligned inside an otherwise centered block.

Native paragraph centering uses typographic spacing; it does not guarantee identical optical centers for every glyph's ink. The inspected `GroupTransformData` exposes object align/distribute settings but no glyph-bounds switch; do not substitute native object alignment for content alignment without verifying its boundary semantics. Native vertical frame Align remains an unexposed entry point in the inspected SDK surfaces; moving a frame does not set that mode. Revalidate linked or overflowing text, text on paths, clipping, effects and color fonts before applying this recipe to those cases. No timing benchmark establishes that glyph-outline measurement is faster than an already verified exact-visible query.

## Structure and geometry

- Renaming through `descriptionInterface.userDescription`, locking through `Document.setEditable` and visibility through `createSetVisibility` are readable; restore lock and visibility after temporary changes. Tag data (`TagInterface`: custom and predefined keys, and the decoration flag) is readable—that is not evidence of arbitrary tag writes.
- `setSpreadSizeWithAnchor` and `setSpreadDocumentProperties` resize a spread and its properties; verified with `SpatialAnchor.TopLeft` and `reflowPages = false`, with `getSpreadExtents()` confirming the result. Other property combinations are untested.
- All `PageBoundingBoxType` variants can return the same box. Read trim, bleed and page boxes separately and check them against the print requirement.
- `createAddArtboard` creates a real artboard and its margin readback works; see [Page geometry](page-geometry.md) for the enabled/nonzero/zero distinction and local coordinates. Ordinary non-artboard shapes return `DISPOSED` for that properties path.
- Adding an artboard moves the spread and export-preview geometry to the artboard area, and deleting it alone does not restore the previous spread size—roll back through history instead. Do not substitute artboards for Layout pages.
- Use the document's unit converter instead of assuming getters agree (`Document.viewdpi` against the converter's `viewDpi`). Guide placement with unequal document/view DPI is untested. Application version metadata, `DrawingScale` (1:100 and 11 metric defaults) and `Collection` map/filter/reverse/reduce are readable.

## Raster, fills and files

- `Bitmap`, `PixelBuffer`, `PixelReaderRGBA8` / `PixelReaderWriterRGBA8` and `copyTo` work for pixel read and write; a compatible buffer exposes its bytes. `Buffer` roundtrips UTF-8 text, and clone, shared span and independent slice behave as expected.
- Raster domain size, content bounds and placed size are different quantities—do not equate them. Image resources report original and placed size together with format and placement metadata. A generated bitmap reports original DPI 0 and no external file path, so do not assume either. File size is a BigInt and must be converted before JSON logging. Command transforms moved and scaled the raster and image content boxes, confirmed in a preview.
- Solid and two-stop linear-gradient fills, stroke weight, hatch fills and brush-fill anchoring can be set, read back and rendered. `LineStyle.createDefaultWithWeight` works without a VectorBrush; `VectorBrush.createDefault()` throws, so take an existing brush from `lineStyleInterface.lineStyle.vectorBrush` and never fabricate a handle. RasterBrush acquisition remains unverified.
- `Bitmap.loadFromFile` and the callback-based `loadFromFileAsync` decode images. `NodeRenderingEngine.createDefault` plus a compatible buffer gives actual raster output for inspection.
- Desktop file read/write/seek, the synchronous `copyFile`, `Directory.entries` / `all` / `filePaths`, `FileStatus`, `clone`, `File.promises.length` and UTF-8 content work. `FileSystemPromises.copyFile` returns `NO_ENVIRONMENT` while `exists`, `getFileStatus` and `readAllAsync` work—do not generalise either way. No ACL or permission mutations were exercised.
- Synchronous `HttpRequest` GET to a local server works with **Access networks** enabled; timers and callbacks work.
- Script-library reads and writes and `saveAsPackage` with `PackageResourcesPolicy.IncludeImages` work for local files. Approval for local writes does not authorise `report_sdk_issue` or sharing hints externally, and local hints require the matching Affinity setting.

## Selection and appearance

- Raster selection commands (rectangular mask, grow, feather, smooth, inside-outline, select-all/deselect) change pixels; verify the result rather than trusting command construction. Other sub-selection types return `INVALID_OP`.
- An outer shadow, a Multiply blend mode and gamma 1.8 can be applied, read back and removed with `removeAllLayerEffects`—other effects were not exercised. A solid fill requested with reduced alpha normalises to None, so do not assume any solid fill produces live transparency.
- Filter and adjustment parameter commands modify the tested fields; only the tested field and value per filter is covered.
- `createImageTrace` produces real vector geometry (PolyCurve nodes) from a bitmap; an unchanged document selection is not evidence of no output.

## Lifecycle, documents and export

- Historical 3.2 Windows close paths returned `NOT_IMPLEMENTED`. On 3.3.0.4850 Win32, synchronous `Document.close()` closed modified, unsaved disposable samples, confirmed by re-enumeration. Async/promises close, business documents and save prompts remain unverified. Confirm authorization and the sample identity before closing; do not extrapolate this result to discarding user work.

- `save`, `saveAs`, `saveAsync`, `saveAsAsync` and the package variants write files and clear the save-state getters afterwards. `executeCommandAsync` completes callbacks.
- Sync `Document.export` with PNG/CurrentSpread and async `exportAsync` with PNG/CurrentPage produce rendered images. Other scopes, presets and bleed behaviour are unverified. `exportMacro` writes the current macro.
- `ExportConfig` appears only once a slice exists on the node (for example one created in the UI); `ExportableInterface` on its own can report a null config and no public factory was found. Change a size with `format.replaceSize(index, size)` and the format list with the append/replace/delete methods, write the format back through `config.replaceFormat`, and apply the config with `DocumentCommand.createSetExportConfig(selection, config)`. A fresh read can still return the old value until it is written back.
- `DocumentProperties.create()` returns detached defaults, not a snapshot of the document—set only the fields you intend to change. Setting a single field through `setDocumentProperties` (for example units Millimetre → Inch) applies without changing DPI, view DPI or extents.
- Sub-selection counts (such as CurveEdge or CurveNode ranges) are not visible-vertex counts. Repeated same-kind commands coalesce into fewer history entries, so check the actual history and refuse an ambiguous rollback rather than inferring undo counts from API calls.
- Embedded documents: `EmbeddedDocumentNode` reads page and layer metadata, and the available page boxes are TrimBox, MinimumContent and MaximumContent—an unavailable MediaBox request does not change the value. `createSetEmbeddedDocumentSelectedSpreadID` and `createSetEmbeddedDocumentSelectedArtboardID` switch between valid enumerated IDs, and restoring the original ID restores the rendered output. Writing an empty `selectedArtboardId` returns `COMMAND_FAILED` even though an empty value represents the whole document; restore it with a checked single-step undo instead.
- UI actions (creating a picture frame, preparing a sample for export, clicking a dialog) can produce state that the SDK then reads, but they are not evidence of an SDK entry point. Picture frame reads expose enabled/content, the anchor and the constraints (`calculateAnchor` → Centre, `calculateConstraints(..., ConstraintType.Default)` → ForceAspectMax), and `frameContents` is a raw `NodeHandle`—wrap it with `createTypedNode`. SDK dialogs stay live after an MCP timeout: a button click fires its callback once, OK returns result Ok, and the dialog's own result—not the transport timeout—tells you it finished.

## AI

- Canva AI commands can fail at construction with `PERMISSION_DENIED` before any execution. Only `Document.generateImage` was exercised, a saved permission setting is not runtime permission, and switching between the sync and async paths does not fix a construction failure. Do not retry a potentially chargeable request automatically, and do not infer a platform-wide restriction from one refusal.
