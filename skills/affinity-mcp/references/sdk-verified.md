# Behaviours and limits

Cases below are operation-specific records, not whole-module guarantees. Read the live preamble and relevant topics/ranges before first use, retaining them during an unchanged session. Revalidate affected assumptions after build/connection changes or conflicting results.

**Common recipes, recorded environments:** use the same recipe on any operating system with the required runtime APIs, permissions and object preconditions. A sample's OS is provenance, not a restriction to that OS; do not require an OS match or reject a route solely because another system lacks a recorded test. Actual cross-platform equivalence is not claimed. Verify current capability and post-state, and separate OS branches only when an official restriction or a confirmed difference warrants them. Affinity's [official script tutorial](https://www.affinity.studio/help/scripting-tutorial-swap-objects/) presents one JavaScript example for Mac and Windows; the [SDK is beta](https://sdk.affinity.studio/), so a common API is not proof that every implementation behaves identically.

<a id="version-boundaries"></a>
## Version boundaries

Unless explicitly marked 3.3 below, entries retain the historical 3.2-era reference observations; their original per-case build/platform metadata is incomplete. They are lookup leads for a different build, not inherited test passes. The 3.2.3.4646 Windows close failure is historical. The 2026-10-08 samples specifically used **3.3.0.4850 Win32**; an independent SDK version was not obtained. Plugin version and application build are separate.

Separate **3.3.1.4940 MacOS** batch/undo/rectangle samples (**2026-10-19**) and editable-text/embedded-bitmap poster previews with native Margin/Bleed (**2026-10-20**) are bounded in [execution efficiency](scripting-pitfalls.md#execution-efficiency), [single-call preview](scripting-pitfalls.md#single-call-preview) and [native geometry](page-geometry.md#read-and-apply-the-correct-native-setting). Default renders omitted outer Bleed in the poster; only its verified complete-selection PNG covered the full Bleed. These samples do not upgrade unrelated historical cases below.

Separate **3.3.1.4940 MacOS** single-line text samples (**2026-10-20**) distinguish [optical modes, UI hanging rules and punctuation-sensitive alignment](#optical-alignment-and-punctuation). They do not establish multiline reflow, rule-table SDK access or general font/glyph mapping.

Separate **3.3.1.4940 MacOS** two-frame samples (**2026-10-21**, plugin **0.5.3**) verified [link/unlink and restoration](#linked-text-flow), plus [callback/Promise close that discards unsaved content](scripting-pitfalls.md#async-close). They do not extend the optical-rule tests to linked text or establish arbitrary formatting edits, chain shapes or close-error recovery.

Separate **3.3.1.4940 MacOS, 2026-10-21** samples verified [ordinary character insertion](#ordinary-character-insertion), [four basic Boolean operations](#basic-boolean-operations), [detached values](#bounded-value-objects) and [files/export/save-reopen](#verified-file-and-export-workflow). These supersede only the named historical limitations. Runtime `Environment.sdkVersionStr="0.1"`, application `buildVersion=1`, website `/33001/` and plugin `0.5.3` are different identity fields; earlier unrecorded SDK fields remain unrecorded.

**Discovery is not acceptance:** the same observation matched 455 native API objects across 20 modules to 4,332 documented methods: 4,260 callable direct entries, 72 missing declarations (71 NodeDefinition-derived `fromNodeDefinition` methods and `CommandApi.areEqual`). The extra 4,884 inherited qualified paths are aliases. Inspect descriptors/prototype chains; an empty own-property list is not evidence of no methods. Of 68 top-level JS topics, 67 loaded; `/vectorbrush.js` did not. A topic, enum or handle is not an executed capability. Bounded successful samples were associated with 115 documented native methods; 4,142 other callable methods remain unverified, alongside two scale counterexamples and one async-copy failure. This is not complete semantic certification of those 115 methods.

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

- The inspected 3.3.0.4850 Win32 `Node.setText` wrapper uses `TextSelection.create(this.storyRange)`; plain full replacement passed on the 2026-10-08 sample. `begin` / `end` identify endpoints, not start / length. Use the actual story range and verify the target text; linked/partial ranges need their own checks.
- Plain replacement is not a format-preserving recipe: in a 3.3 sample, full replacement merged 20px/12px runs into 20px. For preservation tasks, capture character/paragraph runs first and sample-verify the intended edit/range. The same-length, single-run artistic edit below passed only its limited case. `canHideOverflow` is a capability getter; neither its value nor a complete Story proves visible content or permanent deletion.
- `Font.all` enumerates the installed fonts; `StoryDelta.createPostscriptName` with `createFormatText` selects one. Glyph height, character spacing, alignment and indents can be set on live text and read back. A character-spacing value of 2 produces very wide spacing and wrapping—it is not a two-pixel recipe.
- Historical `CharGlyph.create(33)`/clone/readback succeeded, while `createInsertGlyph` failed at construction with `expected GlyphHandle`. The ordinary-character sample below passed; retain the old failure only with its historical scope.

<a id="ordinary-character-insertion"></a>
### Ordinary character insertion

In the **2026-10-21 character sample** (environment recorded above), a single frame containing AB in ArialMT/16 document pixels accepted a typed CharGlyph at an explicit insertion range and rendered A!B:

```js
const { Selection, TextSelection } = require('/selections.js');
const { DocumentCommand } = require('/commands.js');
const { CharGlyph } = require('/glyphs.js');
// doc/textNode are authorized and UUID/spread/type/content-checked.
const selection = Selection.create(doc, textNode);
selection.addSubSelectionForNode(textNode,
  TextSelection.create({ begin: 1, end: 1 }));
doc.executeCommand(DocumentCommand.createInsertGlyph(selection, CharGlyph.create(33)));
```

Capture full text, character runs, frame box/transform, textRenderScale and protected nodes before inserting. Check the new full text and unchanged font/height/scales/geometry, then render; verified undo/redo/another undo restored the retained sample. Derive ranges from the target Story, not from a guessed frame-local index. The sample does not establish special glyphs, arbitrary code points, missing-font mapping, mixed runs or linked-frame ranges.

<a id="linked-text-flow"></a>
## Linked text flow

On **3.3.1.4940 MacOS, 2026-10-21**, two disposable 640 × 480px, 96 DPI, single-spread samples used a 240 × 86px source frame and a 240 × 360px destination. `DocumentCommand.createLinkTextFrame(source, destination)` and `createUnlinkTextFrame(destination)`, executed through `doc.executeCommand`, passed the following cases:

| Destination before linking | Link result | Unlinking the destination |
| --- | --- | --- |
| Empty | The 57-character source Story flowed across both frames; destination `textBegin=39` | Destination empty; all 57 characters and original formatting remain in the source Story, overflowing its frame |
| 11 characters with distinct formatting | Source text + a paragraph break + destination text form a 69-character Story; destination text starts at 58 | Destination empty; the full merged 69-character Story remains in the source |

Linking preserved the original characters' fonts (`PingFangSC-Regular`/`PingFangSC-Semibold`), heights (24/16/20/18 document pixels), Left/Right/Centre paragraph modes, indents and paragraph spacing in these cases; frame boxes, transforms and text render/UI scales stayed unchanged. Source and destination ranges after linking were [0,39) and [39,58) in the empty case, or [0,39) and [39,70) in the populated case; final ends include the Story terminator. `node.story` is the whole shared Story; `storyRange`/`textBegin` describe the frame's scope and may include overflow/terminator entries, so neither full Story equality nor a range alone proves visible fit.

Before linking, confirm both nodes belong to the intended document/spread and retain each original Story, character/paragraph runs, frame geometry and scales. Before unlinking, resolve the intended text destination: **this tested unlink is not a visible-text split or an inverse of linking**. If separate independent texts are required, do not claim unlink alone achieves that result; establish another authorized, sample-verified operation. Re-read flow members/order/front/back flags, actual ranges, full text and required formatting; render both frames to verify the visible flow and overflow.

Each tested link/unlink operation had a verified one-step undo/redo boundary, and another undo of unlink restored the linked state. Undoing link restored the original separate stories, including the destination's original text; restored linked renders matched their baseline PNG bytes. Check actual values on the target history instead of inferring a rollback count or using unlink to undo a merge. These two-frame results do not themselves establish other chain shapes or recovery after close.

The **2026-10-22, 3.3.1.4940 MacOS** sample separately linked three frames A→B→C across two spreads. Its 178-character mixed Chinese/Latin Story, 24/16/18px runs, frame geometry and text scales survived linking; textBegin was 0/45/134. A Story-coordinate Height=20 write over [40,55), crossing the A/B flow boundary, changed only that range's compared glyph attributes. Undo/redo restored the checked values. Async save/reopen also preserved the chain and compared state; see [file persistence](#extended-file-and-layout-workflow).

**Unlink before the target frame, never assume a split of visible text.** Unlinking B left the full Story in A and an empty but still-linked B/C chain. More seriously, unlinking **the front frame A cleared the entire Story while A/B/C remained linked**. That preservation target failed, though undo recovered this disposable sample. Reject `textFrameInterface.isTextFlowFront` targets before ordinary unlinking; removing a front frame or splitting text needs a separately authorized, verified procedure. Capture the full Story/runs and a recoverable baseline before any unlink, and check every resulting chain. The current [official split-story example](https://www.affinity.studio/help/scripting-tutorial-split-story/) unlinks from the back and excludes the front. No guarantee covers arbitrary history, all formatting properties or recovery after closing.

<a id="text-tool-choice-and-refit"></a>
## Text tool choice and refit

[Affinity's current typography guidance](https://www.affinity.studio/typography-software) associates artistic text with headlines and frame text with long-form layouts. Choose from the actual layout constraints, not a universal Artistic Text preference or a word/line-count cutoff:

| Required behavior | Tool choice |
| --- | --- |
| Structured body paragraphs, stable paragraph edges, fixed-width reflow, columns, linked flow or a fixed container | **Frame Text**. For Chinese body alignment, also verify the [punctuation rules and intended body boundary](#optical-alignment-and-punctuation). |
| Display heading, wordmark or label placed at its natural width, or intentionally scaled as a design object, without a conflicting frame constraint | **Artistic Text**. A short title alone is not a reason to bypass frame requirements. |
| Even a short heading/caption must align inside a fixed column/container or reflow when its width changes | **Frame Text**. Use that fixed container as the paragraph reference. |
| Deliberately line-broken display copy positioned as one natural-width object, without automatic fixed-width reflow | **Artistic Text can be used**, including multiple lines. |

Follow an explicit tool requirement. If it conflicts with the layout requirements, explain the conflict and clarify before editing; do not silently substitute tools. When no tool is specified, choose the matching constraint and state the reason briefly. Determine the required width/container from the brief and existing layout; clarify only when missing constraints materially affect the result. This creation policy does not authorize converting existing objects. Keep each semantic block together as editable text in one object or an intentional linked story; use internal breaks and character formatting instead of line/word/character fragments or padding spaces. Separate objects need an independent semantic, column or transform requirement.

Artistic Text supports paragraphs; its natural width follows its longest line and object resizing changes glyph size. Frame Text supports structured paragraphs and flowing text. These concepts are described in the official **Publisher V2** [Artistic text](https://affinity.help/publisher2/en-US.lproj/pages/Text/artText.html) and [Frame text](https://affinity.help/publisher2/en-US.lproj/pages/Text/frameText.html) help; their UI details do not prove a 3.3 SDK route. A three-line artistic object with mixed font-height runs and a same-length edit inside one run was verified on **3.3.0.4850 Win32**. In the **2026-10-22, 3.3.1.4940 MacOS** linked sample, rewriting the identical whole Story collapsed 24/16/18px runs to 24px. A same-length replacement across a run boundary inherited the starting style throughout the inserted range. Neither route preserves mixed formatting; undo restored the samples, but a general capture/reapply algorithm remains unverified.

After creating or changing text:

1. Preserve the agreed font sizes and content. Read full text, line breaks, character/paragraph attribute runs, frame dimensions and text render/UI scale matrices before editing; plain string equality alone does not prove formatting survived.
2. Establish the permitted container constraints. For a fixed-width column, hold the agreed width and allow height changes within the available area; for a fixed-size card/cell, preserve both dimensions and adjust internal layout only within the brief. Artistic headings normally retain their natural content bounds.
3. When frame dimensions may change, establish width first, allow reflow, then measure the resulting line layout and required height. Include insets, first-baseline/Initial Advance, leading and neighboring objects; do not fit to glyph ink alone or assume the old height is suitable after editing.
4. Use only a documented, sample-verified frame-resize route that preserves effective glyph sizes. The UI distinguishes ordinary frame handles that reflow text from the separate handle that scales text too ([current fitting help](https://www.affinity.studio/help/text-fitting-frame-text/)). The bounded [frame-resize sample](#extended-file-and-layout-workflow) passed a known target height, with compensating node/render transforms; it is not an automatic frame-fit recipe. No automatic measurement/fit method is verified here. If the available SDK cannot reliably resize/reflow or expose the needed measurement, stop that operation, identify the unmet width/height or overflow constraint, and request the specific UI adjustment or another authorized layout choice. Do not claim a completed fit or silently shrink type, delete copy, or split it into fragments.
5. Re-read text and intended character/paragraph attributes, font-height runs, text scale matrix components, frame/content geometry and overflow/clipping. Verify all copy and the final line are visible without unintended overlap; a complete Story can still overflow or be clipped. `canHideOverflow` is a capability getter, not an overflow-state toggle. Fixed frames need not shrink to their contents for alignment; measure the [agreed alignment target](#text-alignment-workflow), keeping complete ink and a body excluding punctuation distinct.

Native vertical frame Align has no verified read/write entry in the inspected 3.3 SDK surfaces. UI supports vertical alignment, but moving or tightening a frame does not set that native mode. Initial Advance is vertical first-baseline spacing; FirstLineIndent is horizontal indentation. Keep those, insets, leading and baseline-grid constraints distinct.

In the **2026-10-22** two-line conversion sample, the UI's Layer → Convert → Convert to Text Frame changed ArtTextNode to FrameTextNode while retaining 25 characters and the compared 24/16px glyph runs, paragraph mode and scales. Its bounds changed, so this is not lossless placement. Undo/redo restored both states. The inspected public commands wrapper and native DocumentCommandApi list did not expose the corresponding conversion command. UI conversion plus MCP verification is distinct from SDK conversion; rebuilding with StoryBuilder is not a verified in-place conversion. Existing objects still require conversion authorization.

<a id="text-alignment-workflow"></a>
## Text alignment workflow

First determine the alignment target: object/frame bounds, all glyph ink including punctuation, a Chinese body excluding punctuation, an artistic-text anchor, or the paragraph reference within a fixed frame. Use the brief and object context; ask only about unresolved material ambiguity. These targets are different. For hanging or body-only alignment, use [Optical alignment and punctuation](#optical-alignment-and-punctuation) before positioning; moving an object by its full bounds can undo the desired hanging effect.

The recipe below was verified on Affinity **3.3.0.4850 Win32** with two unlinked, multiline `FrameTextNode` objects: native paragraph `Centre` followed by horizontal translation aligned the complete text blocks while preserving text, font-height runs, text scale matrices, frame width/height and vertical position. It measures **all glyph ink, including punctuation**; it is not a recipe for centering a body that excludes punctuation, native vertical frame alignment or automatic frame fitting.

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
3. For the whole-ink target covered by this recipe, measure glyph geometry in spread coordinates after paragraph formatting:

   ```js
   const glyphBox = textNode.curvesInterface.polyPolyCurves
     .getExactBoundingBox(textNode.baseToSpreadTransform);
   ```

   Reject null, empty or non-finite bounds. This reads glyph outlines without converting the editable text to curves or mutating those outlines; the method accepts the transform directly, so no clone-and-transform step is needed. `getExactSpreadVisibleBox(false, false)` matched these glyph bounds in the verified plain-frame samples; ordinary `getSpreadVisibleBox(false)` included frame geometry and was unsuitable as a content-center proxy. Do not assume these equivalences for decorated or clipped objects.
4. Compute each block's center as `glyphBox.x + glyphBox.width / 2`, then `dx = targetX - centerX`. Use the agreed reference for `targetX`; for alignment within the current selection, the midpoint of the original combined content bounds preserves the selection's overall horizontal placement. Capture that reference before paragraph formatting. Apply pure horizontal translations with `DocumentCommand.createTransform(Selection.create(doc, textNode), Transform.createTranslate(dx, 0))`, importing `Transform` from `/geometry.js`. Batch each phase with `CompoundCommandBuilder`; format, remeasure, then translate in one script rather than iterating from screenshots.
5. Read back paragraph modes and content centers, plus unchanged text, font-height runs, frame y/width/height and text scale matrix components (compare values, not object identity). Render to check that short and long lines are centered within each paragraph and that the blocks share the requested axis. Checking only the combined outer bounds misses paragraphs left-aligned inside an otherwise centered block.

Native paragraph centering uses typographic spacing; it does not guarantee identical optical centers for every glyph's ink. The inspected `GroupTransformData` exposes object align/distribute settings but no glyph-bounds switch; do not substitute native object alignment for content alignment without verifying its boundary semantics. Native vertical frame Align remains an unexposed entry point in the inspected SDK surfaces; moving a frame does not set that mode. Revalidate linked or overflowing text, text on paths, clipping, effects and color fonts before applying this recipe to those cases. No timing benchmark establishes that glyph-outline measurement is faster than an already verified exact-visible query.

<a id="optical-alignment-and-punctuation"></a>
## Optical alignment and punctuation

Frame Text provides a stable container/paragraph reference for structured copy; it does **not** automatically correct Chinese punctuation. Artistic Text also supports optical effects. The official **V2** [optical alignment help](https://affinity.help/publisher2/en-US.lproj/pages/Text/opticalAlignment.html) distinguishes Manual character rules from Font-provided behavior; check again when the font changes.

On **3.3.1.4940 MacOS, 2026-10-20**, two batches of 84 single-line Art/Frame objects used `PingFangSC-Regular` and `STSongti-SC-Regular`, glyph height 24 document pixels at 96 DPI. `GlyphAtts.opticalAlignmentType` exposes a getter/setter; detached attribute-object writes were checked separately from actual document formatting. The document route below passed mode readback and rendering with `None=0`, `Manual=1`, `Font=2` ([SDK getter](https://sdk.affinity.studio/33001/js/apis/GlyphAttsApi/getOpticalAlignmentType.html), [setter](https://sdk.affinity.studio/33001/js/apis/GlyphAttsApi/setOpticalAlignmentType.html), [delta](https://sdk.affinity.studio/33001/js/apis/StoryDeltaApi/createOpticalAlignmentTypeDelta.html), [enum](https://sdk.affinity.studio/33001/js/enums/OpticalAlignmentType.html)):

```js
const { Selection, TextSelection } = require('/selections.js');
const { DocumentCommand } = require('/commands.js');
const { StoryDelta, OpticalAlignmentType } = require('/storydelta.js');
// doc and textNode are already identified, authorized and scope-checked.
const selection = Selection.create(doc, textNode);
selection.addSubSelectionForNode(textNode,
  TextSelection.create(textNode.storyRange));
doc.executeCommand(DocumentCommand.createFormatText(selection,
  StoryDelta.createOpticalAlignmentType(OpticalAlignmentType.Manual)));
```

Read `story.getGlyphAttRunsFrom(0)` and each `glyphAtts.opticalAlignmentType`, then measure/render the intended effect. This applies a **mode**, not character rules; linked/partial story ranges require their own checks.

The inspected wrappers, related native modules/prototypes and official symbol inventories did not expose custom-character/left/right-percentage rule-table access. This is an inspected SDK entry gap, not an MCP protocol restriction. When the result depends on such rules, use an available UI check/edit within the task's authorization, or report the specific gap; do not invent a setter or treat Manual readback as proof of rule coverage.

In the limited sample, uncustomized Manual improved quotes but did not resolve `「」（）。，`; Font varied with font and operation. UI rules at 100% left/right made the tested Chinese-body offsets zero relative to the same-font unpunctuated baseline for fixed-anchor Art and fixed-frame paragraph Left/Right/Centre. **Custom** was a label for that UI-configured Manual group, not another enum; 100% was a controlled test parameter, not a universal recommendation. Repositioning Art by `getSpreadVisibleBox(false)` still left body offsets in None/Manual/Custom. Selecting Frame or measuring complete glyph ink cannot substitute for the intended body alignment.

For punctuation-sensitive work:

1. Determine the required paragraph/container reference and which characters belong to the aligned body. Check the actual font, optical mode, character rules and left/right hanging values; do not assume all installations/styles share the tested rules.
2. Apply paragraph layout and required optical rules before positioning. Retain the chosen paragraph/anchor reference; do not then recenter by bounds containing punctuation when the target excludes it.
3. Verify the intended body's edge/center and render it, using a same-font unpunctuated control where testing hanging. The sample's zero relative offset does not remove font side bearings or guarantee alignment to arbitrary objects. Its one-outline-per-codepoint mapping was checked only for those simple strings, not a general body-filtering algorithm. If reliable body measurements or required rule settings are unavailable, report the unmet target and use an authorized UI route rather than claim completion from full-ink bounds.
4. Recheck affected text/runs, font size/text scale, frame geometry, line layout and visibility after edits or font changes. Other fonts/sizes, multiline reflow, linked flow, rule copying and save/print behavior remain unverified by these samples.

## Structure and geometry

<a id="basic-boolean-operations"></a>
### Basic Boolean operations

In the **2026-10-21 Boolean sample** (environment recorded above), `Selection.create(doc, [a,b])` passed to `DocumentCommand.createBoolOpUnion`, `createBoolOpSubtract`, `createBoolOpIntersect` or `createBoolOpXor`, followed by `doc.executeCommand`, produced real PolyCurve nodes from pairs of overlapping black rectangles. With A=(40,y,120,50) and B=(100,y,120,50), resulting x/width were Union=40/180, Subtract=40/60, Intersect=100/60, Xor=40/180; coverage at x=70/130/190 was 111/100/010/101. Geometry, rendered interior pixels and actual undo/redo/undo/redo matched retained target/protected snapshots.

Confirm the intended document/spread, node types and ordered operand selection before execution. Capture target/protected membership, types, boxes and six transform components. Read actual output nodes and rendered coverage; a command object or compound-operation enum is insufficient. Re-fetch handles after node replacement or history changes, and verify the actual history boundary before restoration. Complex/open curves, decorations, effects, arbitrary operand orders and other histories remain unverified.

- Renaming through `descriptionInterface.userDescription`, locking through `Document.setEditable` and visibility through `createSetVisibility` are readable; restore lock and visibility after temporary changes. Tag data (`TagInterface`: custom and predefined keys, and the decoration flag) is readable—that is not evidence of arbitrary tag writes.
- `setSpreadSizeWithAnchor` and `setSpreadDocumentProperties` resize a spread and its properties; verified with `SpatialAnchor.TopLeft` and `reflowPages = false`, with `getSpreadExtents()` confirming the result. Other property combinations are untested.
- All `PageBoundingBoxType` variants can return the same box. Read trim, bleed and page boxes separately and check them against the print requirement.
- `createAddArtboard` creates a real artboard and its margin readback works; see [Page geometry](page-geometry.md) for the enabled/nonzero/zero distinction and local coordinates. Ordinary non-artboard shapes return `DISPOSED` for that properties path.
- Check `isArtboardEnabled` before using an ordinary shape's artboard-properties path. Adding an artboard moves the spread and export-preview geometry to the artboard area, and deleting it alone does not restore the previous spread size—use a verified history boundary instead. Do not substitute artboards for Layout pages.
- Use the document's unit converter instead of assuming getters agree (`Document.viewdpi` against the converter's `viewDpi`). Guide placement with unequal document/view DPI is untested. Application version metadata, `DrawingScale` (1:100 and 11 metric defaults) and `Collection` map/filter/reverse/reduce are readable.

## Raster, fills and files

<a id="bounded-value-objects"></a>
### Detached values and RGBA8 pixels

On **3.3.1.4940 MacOS, 2026-10-21**, the following bounded paths passed: Point (0,0)→(3,4) distance=5/squared=25; translate (10,20) and inverse roundtrip; rectangle Curve clone/translate with original bounds unchanged; RGBA8 Colour clone (12,34,56,alpha=200); UTF-8 Buffer clone; default Font name ArialMT. A 4×4 RGBA8 Bitmap with pixel (1,2)=(12,34,56,255) preserved that pixel through `createCompatibleBitmap(true)` and `PixelReaderRGBA8` readback; dispose pixel accessors after use. These do not establish all matrices, colour spaces, encodings or raster formats.

`create()` and `clone()` returned matching shapeType values for ShapeArrow, ShapeCalloutEllipse, ShapeCalloutRectangle, ShapeCat/Cat2/Cat3/Cat4, ShapeCloud, ShapeCog, ShapeCrescent, ShapeDiamond, ShapeDoubleStar, ShapeEllipse, ShapeHeart, ShapePie, ShapePolygon, ShapeRectangle, ShapeSegment, ShapeSpiral, ShapeSquareStar, ShapeStar, ShapeTear, ShapeTrapezoid, ShapeTriangle and ShapeQRCode. This is detached creation/clone/type acceptance only, not parameter editing, document rendering or QR decoding. Verify the required values and clone independence rather than treating a non-null handle as success.

- `Bitmap`, `PixelBuffer`, `PixelReaderRGBA8` / `PixelReaderWriterRGBA8` and `copyTo` work for pixel read and write; a compatible buffer exposes its bytes. `Buffer` roundtrips UTF-8 text, and clone, shared span and independent slice behave as expected.
- Raster domain size, content bounds and placed size are different quantities—do not equate them. Image resources report original and placed size together with format and placement metadata. A generated bitmap reports original DPI 0 and no external file path, so do not assume either. File size is a BigInt and must be converted before JSON logging. Command transforms moved and scaled the raster and image content boxes, confirmed in a preview.
- Historical solid/gradient/hatch/anchoring cases retain their original scope. On **3.3.1.4940 MacOS, 2026-10-21**, `LineStyle.createDefaultWithWeight(2)` read weight=2; the current property is `lineStyle.pathBrush`, and an ordinary solid stroke returned null. The old `vectorBrush` property was undefined and `/vectorbrush.js` failed to load. `PathBrush.createDefault()` and `RasterBrush.createDefault()` throw wrapper placeholders saying `not yet implemented in C++ API`; neither is a successful native creation. That experiment did not obtain a usable instance; the later [existing-PathBrush workflow](#existing-path-brush-workflow) requires a real brushed source. Never fabricate handles.
- `Bitmap.loadFromFile` and the callback-based `loadFromFileAsync` decode images. `NodeRenderingEngine.createDefault` plus a compatible buffer gives actual raster output for inspection.
- Historical Desktop file/seek/directory/status/async-read cases retain their own scope. The [owned-file sample](#verified-file-and-export-workflow) passed UTF-8 write/read and synchronous `copyFile`, but `FileSystemPromises.copyFile` still returned `NO_ENVIRONMENT` with no destination file. Do not generalize that failure to async PNG or all asynchronous methods. No ACL/permission mutations were exercised.
- Synchronous `HttpRequest` GET to a local server works with **Access networks** enabled; timers and callbacks work.
- Historical script-library reads/writes and local `saveAsPackage` observations retain incomplete build metadata. The later [package/load counterexample](#extended-file-and-layout-workflow) did not preserve original image pixels after source removal; do not equate package creation with portable resources. Approval for local writes does not authorise `report_sdk_issue` or sharing hints externally, and local hints require the matching Affinity setting.

<a id="existing-path-brush-workflow"></a>
### Reuse an existing PathBrush

The **2026-10-22 sample on 3.3.1.4940 MacOS** verified reading a real PathBrush from a curve prepared with a built-in image path-brush preset in the UI. This is an SDK reuse workflow with a prepared source, not SDK preset enumeration or creation from scratch. It does not establish RasterBrush acquisition.

1. Bind the intended document/spread and a real brushed source. Read `source.lineStyleInterface.lineStyle.pathBrush`; stop if null. Record source/target geometry, transforms, line style and the brush fields relevant to the edit.
2. Clone the PathBrush and the source LineStyle. The sample changed the clone's `brushWidth` from 120 to 60, set the cloned style's `pathBrush` to that clone and `weight` to 60, and verified the source stayed at 120.
3. Apply the cloned style to the target with three `doc.setLineStyle(style, target, options)` calls, separately using `LineStyleMask.Weight`, `.Brush`, and `.Type`. The tested options also set `contentType: ContentType.Main`, `useTextSelection: false`, and `defaultsMode: LineCommandDefaultsMode.None`. Import the mask from `/linestyle.js`, ContentType from `affinity:dom`, and LineCommandDefaultsMode from `affinity:commands`; check current signatures and ranges before using native imports.
4. Re-fetch nodes and verify target Texture(3), weight=60 and brushWidth=60, the compared remaining brush fields, unchanged source, and both centreline boxes/transforms; render the result. The sample showed a smaller repeating texture on the target. Actual undo/redo/undo/redo restored the compared baseline/applied states; the three separate history entries are sample evidence, not a general rollback count.

Retain the failures: both default brush factories still throw wrapper placeholders. No create/load/preset-enumeration route was found in the checked brush wrappers, native brush API prototypes or published brush symbols. `LineStyle.create` with Texture returned `INVALID_ARGS` both without a brush and with the existing brush, while an explicit Solid control passed. `setLineStyle` with All did not change the sample even with the explicit options above; use only the verified single-field route and read back actual effects. These observations do not prove every Texture factory or All-mask use fails. Other presets, RasterBrush instances, save/reopen and arbitrary brush attributes remain outside this sample.

## Selection and appearance

- Raster selection commands (rectangular mask, grow, feather, smooth, inside-outline, select-all/deselect) change pixels; verify the result rather than trusting command construction. Other sub-selection types return `INVALID_OP`.
- An outer shadow, a Multiply blend mode and gamma 1.8 can be applied, read back and removed with `removeAllLayerEffects`—other effects were not exercised. A solid fill requested with reduced alpha normalises to None, so do not assume any solid fill produces live transparency.
- Filter and adjustment parameter commands modify the tested fields; only the tested field and value per filter is covered.
- `createImageTrace` produces real vector geometry (PolyCurve nodes) from a bitmap; an unchanged document selection is not evidence of no output.

## Lifecycle, documents and export

- `Document.createFromOptions()` with `NewDocumentOptions` creates a new document, including one with multiple spreads; it does not add pages to an existing document. Read actual geometry after creation. Inserting pages into an existing document and multi-page stitching remain unverified.
- On **3.3.1.4940 MacOS, 2026-10-21**, the historical `ExportScale.createWithWidthHeight(600,800)` counterexample was reproduced: Square(3), size=800, multiplier=600, width=800, height=0. `createWithMultiplierSquare(2,600)` returned WidthHeight(4), size=2, multiplier=0 (width/height not recorded). Both fail the intended semantics; root cause is not established. Do not swap factory names as a workaround. Single-argument Width(600), Height(800), Square(600) and Multiplier(2) objects passed type/effective-field readback; use `.size` for Width/Height/Square, not inactive fields. No actual custom-scale export was tested.

- On 3.3.0.4850 Win32, synchronous `Document.close()` closed modified, unsaved disposable samples, confirmed by re-enumeration. Async/promises close and business documents remain unverified on that Win32 sample. On **3.3.1.4940 MacOS, 2026-10-21**, `closeAsync(callback)` and `document.promises.close()` each directly closed a dirty unsaved sample without saving or a prompt interaction, discarding its unsaved content. Callback error and Promise result were `undefined`, and re-enumeration confirmed removal. Apply [the save/discard authorization and completion checks](scripting-pitfalls.md#async-close); the Mac success does not upgrade historical Windows close failures or establish recovery after close.

- Historical save/async-save/package and `executeCommandAsync` cases retain their original incomplete build metadata; they are not new test passes. Later save and export samples are bounded below. The 2026-10-22 async PNG/CurrentPage sample is separate from older failures; `exportMacro` remains unverified by these samples.
- The **3.3.1.4940 MacOS** small-spread sample separately verified synchronous PNG/CurrentSpread export, `File.readAll(...).toString('base64')`, owned temporary-file cleanup and explicit host image handoff in the edit call. Apply the [single-call preview gates](scripting-pitfalls.md#single-call-preview); this does not extend the async, print or arbitrary-document cases.
- `ExportConfig` appears only once a slice exists on the node (for example one created in the UI); `ExportableInterface` on its own can report a null config and no public factory was found. Change a size with `format.replaceSize(index, size)` and the format list with the append/replace/delete methods, write the format back through `config.replaceFormat`, and apply the config with `DocumentCommand.createSetExportConfig(selection, config)`. A fresh read can still return the old value until it is written back.
- `DocumentProperties.create()` returns detached defaults, not a snapshot of the document—set only the fields you intend to change. Setting a single field through `setDocumentProperties` (for example units Millimetre → Inch) applies without changing DPI, view DPI or extents.
- Sub-selection counts (such as CurveEdge or CurveNode ranges) are not visible-vertex counts. Repeated same-kind commands coalesce into fewer history entries, so check the actual history and refuse an ambiguous rollback rather than inferring undo counts from API calls.
- Embedded documents: `EmbeddedDocumentNode` reads page and layer metadata, and the available page boxes are TrimBox, MinimumContent and MaximumContent—an unavailable MediaBox request does not change the value. `createSetEmbeddedDocumentSelectedSpreadID` and `createSetEmbeddedDocumentSelectedArtboardID` switch between valid enumerated IDs, and restoring the original ID restores the rendered output. Writing an empty `selectedArtboardId` returns `COMMAND_FAILED` even though an empty value represents the whole document; restore it with a checked single-step undo instead.
- UI actions (creating a picture frame, preparing a sample for export, clicking a dialog) can produce state that the SDK then reads, but they are not evidence of an SDK entry point. Picture frame reads expose enabled/content, the anchor and the constraints (`calculateAnchor` → Centre, `calculateConstraints(..., ConstraintType.Default)` → ForceAspectMax), and `frameContents` is a raw `NodeHandle`—wrap it with `createTypedNode`. SDK dialogs stay live after an MCP timeout: a button click fires its callback once, OK returns result Ok, and the dialog's own result—not the transport timeout—tells you it finished.

<a id="verified-file-and-export-workflow"></a>
### Verified file/export/save workflow

In the **2026-10-21 file sample** (environment recorded above), an explicitly authorized owned Desktop directory and a 640×480px/96 DPI white-background/three-black-rectangle spread passed these paths:

| Path | Accepted result |
| --- | --- |
| File.create/writeStringAsUtf8/flush/close + File.readAll | 17-byte UTF-8 synthetic text roundtrip; synchronous `fs.copyFile(source,destination,CopyOptions.None)` was byte-identical |
| Synchronous PNG, JPEG, SVG, PDF, WebP / CurrentSpread | Returned export records OK, correct paths and independently readable content/geometry |
| `await doc.promises.export(path, options, area)` / PNG / CurrentSpread | Actual file and OK record after Promise completion; all 307,200 decoded pixels matched the synchronous PNG and expected geometry |
| `doc.saveAs(path)` then close/reopen | Correct path and real file, dirty/needsSaving false; all four nodes, geometry, transforms, DPI and rendered output preserved |

Resolve the requested output and authorization before writing. Use `app.userDesktopPath`, an owned directory/path, and reject collisions; do not test on or overwrite user files. Enumerate `FileExportOptions.allPresetNames` and choose the intended **actual** preset name. This sample used `PNG`, `JPEG (最佳质量)`, `SVG (用于导出)`, `PDF (用于导出)` and `WebP (无损，默认值)`; names depend on installation/language. `createWithPresetName('JPEG')` is not an established universal choice.

Guard the document UUID and spread, then export with `FileExportArea.createForCurrentSpread()` from `/document.js`. The sync route is `doc.export(path, options, area)`; the async route is `await doc.promises.export(path, options, area)` inside a returned async IIFE, not top-level await. Keep options/area alive through completion and recheck the target before subsequent writes. Inspect every returned record in `records.all`: path, `isSuccess`/result, warning and error. Require the intended file to exist and decode it at the expected dimensions/area; metadata or Promise completion alone is insufficient. Respect [the separate Bleed checks](page-geometry.md#completion-evidence).

PNG/WebP/async PNG each matched all 307,200 pixels. JPEG matched 214,500 interior pixels after an 8px edge-band exclusion. SVG retained the four rectangles and viewBox. PDF was one 480×360pt page; independent 96 DPI rendering matched the expected 640×480 geometry and 287,364 interior pixels after a 2px edge exclusion. Sync/async PNG file bytes differed only in iTXt metadata while decoded pixels and IDAT matched. Compare decoded pixels for visual equality, not whole-file hash equality. These checks do not cover text/fonts, photographs, transparency, complex effects, Bleed, other presets/areas/scales or multiple pages.

Older hints saying all Mac async PNG exports fail with `NO_ENVIRONMENT` are contradicted by this sample. The separate `FileSystemPromises.copyFile` sample still failed with that error and no output. Record method/build/post-state separately; do not substitute a JPEG render for a requested PNG or retry failed writes without reading actual state.

For saving, verify the intended path, real file/content and both save-state flags; `undefined` is not a success value. Reopen only a task-owned sample or when the user authorized that lifecycle operation; do not close/reopen user documents merely to check saving. If reopening is outside scope, report that content-persistence check as unverified. Delete only authorized owned temporary outputs after evidence is retained, and confirm cleanup without touching unrelated files. Async save, savePackage, existing-file overwrites and linked resources were not part of the 2026-10-21 sample; the following later sample covers only the named extensions.

<a id="extended-file-and-layout-workflow"></a>
### Extended file and layout workflow

The **2026-10-22, 3.3.1.4940 MacOS** two-page, transparent Chinese/Latin mixed-text sample added these bounded results. Use the common runtime/precondition checks above on every platform; this is recorded provenance, not an OS gate.

| Route | Result and operational limit |
| --- | --- |
| PNG/CurrentSpread; `await doc.promises.export(...)` PNG/CurrentPage; lossless WebP/CurrentSpread | All 640×480 decoded RGBA pixels matched, including transparent corners, 50% blue interior and blurred edges. JPEG flattened onto white. This does not cover every effect or preset. |
| `doc.export(path, options, area, {width:320,height:240})` | Produced 320×240 from the 640×480 spread. The argument is native Size, not an ExportScale handle; the two historical factory counterexamples remain. |
| PDF/WholeDocument; PDF/`createForPages('2')` | Two 480×360pt pages versus one selected second page; extracted complete text matched the Story after layout-whitespace removal, and PingFangSC-Regular/Arial-BoldMT subset font streams were embedded. Check font licensing/actual embedding and pages per output. |
| SVG/CurrentSpread | Text elements retained font-family references; blur became an embedded image. Font references do not prove embedded fonts, portability or an entirely vector effect. |
| `await doc.promises.saveAs(ownedPath)`; edit; `await doc.promises.save()` | Created then overwrote only the owned native file; both save-state flags became false. Close/reopen preserved the three-frame chain, full text, compared glyph/paragraph attributes, geometry and scales. No failure-path or user-file overwrite acceptance. |
| `await doc.promises.saveAsPackage(ownedPackagePath, PackageResourcesPolicy.None)` | Actual package reopened with matching compared state and identical decoded before/after PNG pixels. The live document path remained the original path and pre-existing dirty flags stayed true: packaging is not confirmation that the current document is saved. External-resource collection/relocation remains unverified. |
| Known-height frame resize | For A=(40,40,250,140), a Y scale 9/7 and Y translation -80/7 through `createTransform` yielded height 180 and unchanged compared glyph runs/textUiScale. Node Y scale=9/7 was compensated by textRenderScale Y=7/9, and B/C textBegin changed 45/134→97/160. Explicit false/true `correctChildren` both passed this sample; do not claim that flag is always required. Undo restored the baseline. Rotation, shear, auto-fit and arbitrary transforms remain unverified. |

For the frame resize, compare effective composed transforms and rendered line layout as well as stored font heights; an inverse render compensation is not an unwanted glyph-size change. Validate final visible copy/overflow separately. No automatic height calculation follows from a successful known-height resize.

An additional 320×240 sample requested L/T/R/B Bleed=10/12/14/16 and had a background box (-10,-12,344,268). PNG/CurrentSpread remained 320×240; Selection exported 344×268. PDF (for print)/WholeDocument had MediaBox/TrimBox/BleedBox all at the 240×180pt trim size. **A preset name or OK record does not establish complete Bleed.** Creation options and background extents do not independently confirm active native Bleed settings; inspect actual configuration and output bounds using [page geometry](page-geometry.md#completion-evidence). No general include-Bleed option was verified.

An additional UI-placed Linked PNG sample failed the offline-original-fidelity target: `await doc.promises.saveAsPackage(path, PackageResourcesPolicy.IncludeImages)` produced a package, but after renaming the owned source and copying the package to another directory, `Document.load` retained text/geometry/resource metadata while the exported page differed at 4,902 image-region pixels. `imageResourceInterface.saveOriginalFile` wrote a same-dimension PNG with different pixels. Restoring the source path and reopening the original package restored exact page pixels. This is a bounded package/load workflow counterexample, not proof every packaging route fails; its cause, UI unpacking and other resource policies remain unverified. Require actual originals and offline rendering before portable delivery; a cache preview, dimensions, resource metadata or successful package creation is insufficient. Do not guess bit shifts for the policy enum.

Do not retry an uncertain submitted placement or delete source files still in use. Text-chain save/reopen does not validate custom optical-rule persistence, arbitrary mixed-format replacement or every package resource policy.

## AI

- Canva AI commands can fail at construction with `PERMISSION_DENIED` before any execution. Only `Document.generateImage` was exercised, a saved permission setting is not runtime permission, and switching between the sync and async paths does not fix a construction failure. Do not retry a potentially chargeable request automatically, and do not infer a platform-wide restriction from one refusal.
