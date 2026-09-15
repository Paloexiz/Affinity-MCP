# Behaviours and limits

Cases below are runtime-checked, not whole-module guarantees. Re-read the live preamble, topic and ranges before relying on an operation. Behaviour can differ between platforms and Affinity builds, so re-check on the target system instead of assuming these hold everywhere.

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

- `TextSelection.from` is undefined despite a convenience wrapper referencing it. `begin` / `end` identify endpoints, not start / length.
- `Font.all` enumerates the installed fonts; `StoryDelta.createPostscriptName` with `createFormatText` selects one. Glyph height, character spacing, alignment and indents can be set on live text and read back. A character-spacing value of 2 produces very wide spacing and wrapping—it is not a two-pixel recipe.
- `CharGlyph.create(33)`, clone, `char32` and `string` work. `createInsertGlyph` with such a typed glyph fails at construction (`expected GlyphHandle`).

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

- `save`, `saveAs`, `saveAsync`, `saveAsAsync` and the package variants write files and clear the save-state getters afterwards. `executeCommandAsync` completes callbacks.
- Sync `Document.export` with PNG/CurrentSpread and async `exportAsync` with PNG/CurrentPage produce rendered images. Other scopes, presets and bleed behaviour are unverified. `exportMacro` writes the current macro.
- `ExportConfig` appears only once a slice exists on the node (for example one created in the UI); `ExportableInterface` on its own can report a null config and no public factory was found. Change a size with `format.replaceSize(index, size)` and the format list with the append/replace/delete methods, write the format back through `config.replaceFormat`, and apply the config with `DocumentCommand.createSetExportConfig(selection, config)`. A fresh read can still return the old value until it is written back.
- `DocumentProperties.create()` returns detached defaults, not a snapshot of the document—set only the fields you intend to change. Setting a single field through `setDocumentProperties` (for example units Millimetre → Inch) applies without changing DPI, view DPI or extents.
- Sub-selection counts (such as CurveEdge or CurveNode ranges) are not visible-vertex counts. Repeated same-kind commands coalesce into fewer history entries, so check the actual history and refuse an ambiguous rollback rather than inferring undo counts from API calls.
- Embedded documents: `EmbeddedDocumentNode` reads page and layer metadata, and the available page boxes are TrimBox, MinimumContent and MaximumContent—an unavailable MediaBox request does not change the value. `createSetEmbeddedDocumentSelectedSpreadID` and `createSetEmbeddedDocumentSelectedArtboardID` switch between valid enumerated IDs, and restoring the original ID restores the rendered output. Writing an empty `selectedArtboardId` returns `COMMAND_FAILED` even though an empty value represents the whole document; restore it with a checked single-step undo instead.
- UI actions (creating a picture frame, preparing a sample for export, clicking a dialog) can produce state that the SDK then reads, but they are not evidence of an SDK entry point. Picture frame reads expose enabled/content, the anchor and the constraints (`calculateAnchor` → Centre, `calculateConstraints(..., ConstraintType.Default)` → ForceAspectMax), and `frameContents` is a raw `NodeHandle`—wrap it with `createTypedNode`. SDK dialogs stay live after an MCP timeout: a button click fires its callback once, OK returns result Ok, and the dialog's own result—not the transport timeout—tells you it finished.

## AI

- Canva AI commands can fail at construction with `PERMISSION_DENIED` before any execution. Only `Document.generateImage` was exercised, a saved permission setting is not runtime permission, and switching between the sync and async paths does not fix a construction failure. Do not retry a potentially chargeable request automatically, and do not infer a platform-wide restriction from one refusal.
