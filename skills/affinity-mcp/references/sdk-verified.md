# Behaviours and limits

The cases below are operation-specific records; they are not guarantees for a whole module. Read the live preamble and the relevant topics and ranges before first use, and keep them during an unchanged session. Revalidate the affected assumptions after a build or connection change, or when results conflict.

**Common recipes, recorded environments:** use the same recipe on any operating system that has the required runtime APIs, permissions and object preconditions. The OS in a sample is provenance, not a restriction: do not require an OS match, and do not reject a route only because another system has no recorded test. Actual cross-platform equivalence is not claimed. Verify the current capability and post-state, and split behavior by OS only when an official restriction or a confirmed difference calls for it. Affinity's [official script tutorial](https://www.affinity.studio/help/scripting-tutorial-swap-objects/) presents a single JavaScript example for Mac and Windows, and the [SDK is beta](https://sdk.affinity.studio/), so a shared API is not proof that every implementation behaves the same.

<a id="version-boundaries"></a>
## Version boundaries

Unless an entry below is explicitly marked 3.3, it keeps the historical 3.2-era reference observation, and its original per-case build and platform metadata is incomplete. Such an entry is a lookup lead for a different build, not an inherited test pass. The 3.2.3.4646 Windows close failure is historical. The 2026-10-08 samples specifically used **3.3.0.4850 Win32**, and no independent SDK version was obtained. The plugin version and the application build are separate.

Two separate sets of **3.3.1.4940 MacOS** samples are bounded in [execution efficiency](scripting-pitfalls.md#execution-efficiency), [single-call preview](scripting-pitfalls.md#single-call-preview) and [native geometry](page-geometry.md#read-and-apply-the-correct-native-setting). One set is the batch, undo and rectangle samples (**2026-10-19**). The other covers the poster previews with editable text, an embedded bitmap and native Margin/Bleed (**2026-10-20**). In the poster, default renders left out the outer Bleed; only the verified complete-selection PNG covered the full Bleed. These samples do not upgrade the unrelated historical cases below.

Separate **3.3.1.4940 MacOS** single-line text samples (**2026-10-20**) distinguish [optical modes, UI hanging rules and punctuation-sensitive alignment](#optical-alignment-and-punctuation). They do not establish multiline reflow, SDK access to the rule table, or general font and glyph mapping.

Separate **3.3.1.4940 MacOS** two-frame samples (**2026-10-21**, plugin **0.5.3**) verified [link/unlink and restoration](#linked-text-flow), and also [callback/Promise close that discards unsaved content](scripting-pitfalls.md#async-close). They do not extend the optical-rule tests to linked text, and they do not establish arbitrary formatting edits, other chain shapes or recovery from a close error.

Separate **3.3.1.4940 MacOS, 2026-10-21** samples verified [ordinary character insertion](#ordinary-character-insertion), [four basic Boolean operations](#basic-boolean-operations), [detached values](#bounded-value-objects) and [files, export and save-reopen](#verified-file-and-export-workflow). The runtime's `Environment.sdkVersionStr="0.1"`, the application's `buildVersion=1`, the website path `/33001/` and plugin `0.5.3` are different identity fields; SDK fields that earlier samples did not record stay unrecorded.

**Discovery is not acceptance:** in the same observation, 455 native API objects across 20 modules matched 4,332 documented methods: 4,260 callable direct entries and 72 missing declarations (71 `fromNodeDefinition` methods derived from NodeDefinition, plus `CommandApi.areEqual`). The 4,884 additional inherited qualified paths are aliases. Inspect descriptors and prototype chains; an empty own-property list does not prove that there are no methods. Of 68 top-level JS topics, 67 loaded; `/vectorbrush.js` did not. A topic, enum or handle is not an executed capability. The bounded successful samples were associated with 115 documented native methods; the other 4,142 callable methods remain unverified, along with two scale counterexamples and one async-copy failure. This is not a complete semantic certification of those 115 methods.

Reading the preamble as required does not make every preamble or hint claim correct. Prefer the current public wrapper, check the exact native imports and ranges when you need them, and compare the result you asked for with the actual post-state. An `ALWAYS add hint` suggestion does not override the user's authorization. The 3.3 samples used `app.userDesktopPath`. On Collection, `.first` and `.at(0)` worked while `[0]` did not. The absence of a `DocumentApi.getDocumentProperties` entry does not prove that all native property reads are missing. Spread prerequisites vary by command; use [the operation-specific notes](scripting-pitfalls.md#documents-and-spreads), not a blanket switch before every edit.

## Nodes and text

- `AddChildNodesCommandBuilder` inserts nodes and returns them in `command.newNodes`. `Document.addNode()` returns `undefined`, so do not read `.newNodes` from it.
- `createMoveNodes` with `NodeMoveType.Inside` and `NodeChildType.Main` moves nodes without changing spread bounds. Setting and clearing a selection both work.
- `applyTransform(Transform.createTranslate(x, y), node)` moves a node by exactly (x, y). `Transform.data` holds six values with the translation at indices 2 and 5. Transform and inverse point round trips work, as do RGBA8 colour clone/alpha/tint/noise and the `HandleObject` null guard.
- Shape parameters such as `ShapeStar.points`, `innerRadius` and `curvedEdges` survive creation and readback. Curve entry counts include control and closure entries, so do not equate them with visible corners. A readable compound-operation value is not evidence that Boolean geometry was executed.
- `StoryBuilder` creates frame text with the default style; `createSetText` replaces it. `Story.text`, the glyph accessors, `StoryInterface` and single-frame `TextFrameInterface` are readable. A `StoryInterface` range can contain one more entry than `Story.length`, and an empty special-glyph collection does not prove that every special glyph type works. Do not treat these as interchangeable.
- Replace and format text through an explicit text sub-selection:

```js
const { Selection, TextSelection } = require('/selections');
const { DocumentCommand } = require('/commands');
const selection = Selection.create(document, textNode);
selection.addSubSelectionForNode(textNode,
  TextSelection.create({ begin: 0, end: textNode.story.length }));
document.executeCommand(DocumentCommand.createSetText(selection, 'Replacement'));
```

- The inspected 3.3.0.4850 Win32 `Node.setText` wrapper uses `TextSelection.create(this.storyRange)`, and plain full replacement passed on the 2026-10-08 sample. `begin` and `end` identify endpoints, not a start and a length. Use the actual story range and verify the target text; linked and partial ranges need their own checks.
- Plain replacement does not preserve formatting: in a 3.3 sample, a full replacement merged 20px and 12px runs into 20px. When formatting must survive, capture the character and paragraph runs first, then verify the intended edit and range on a sample. The same-length, single-run artistic edit below passed only in its limited case. `canHideOverflow` is a capability getter; neither its value nor a complete Story proves that content is visible or that it was permanently deleted.
- `Font.all` enumerates the installed fonts, and `StoryDelta.createPostscriptName` with `createFormatText` selects one. Glyph height, character spacing, alignment and indents can be set on live text and read back. A character-spacing value of 2 produces very wide spacing and wrapping; it is not a recipe for two pixels.
- Historically, `CharGlyph.create(33)`, cloning and readback succeeded, while `createInsertGlyph` failed at construction with `expected GlyphHandle`. The ordinary-character sample below passed; keep the old failure only within its historical scope.

<a id="ordinary-character-insertion"></a>
### Ordinary character insertion

In the **2026-10-21 character sample** (environment recorded above), a single frame containing AB in ArialMT at 16 document pixels accepted a typed CharGlyph at an explicit insertion range and rendered A!B:

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

Before inserting, capture the full text, character runs, frame box and transform, textRenderScale and the protected nodes. Check the new full text and the unchanged font, height, scales and geometry, then render. Verified undo, redo and another undo restored the retained sample. Derive ranges from the target Story, not from a guessed frame-local index. The sample does not establish special glyphs, arbitrary code points, missing-font mapping, mixed runs or linked-frame ranges.

<a id="linked-text-flow"></a>
## Linked text flow

On **3.3.1.4940 MacOS, 2026-10-21**, two disposable 640 × 480px, 96 DPI, single-spread samples used a 240 × 86px source frame and a 240 × 360px destination. `DocumentCommand.createLinkTextFrame(source, destination)` and `createUnlinkTextFrame(destination)`, run through `doc.executeCommand`, passed the following cases:

| Destination before linking | Link result | Unlinking the destination |
| --- | --- | --- |
| Empty | The 57-character source Story flowed across both frames; destination `textBegin=39` | Destination empty; all 57 characters and original formatting remain in the source Story, overflowing its frame |
| 11 characters with distinct formatting | Source text + a paragraph break + destination text form a 69-character Story; destination text starts at 58 | Destination empty; the full merged 69-character Story remains in the source |

Linking preserved the original characters' fonts (`PingFangSC-Regular`/`PingFangSC-Semibold`), the heights (24/16/20/18 document pixels), the Left/Right/Centre paragraph modes, the indents and the paragraph spacing in these cases. Frame boxes, transforms and text render and UI scales stayed unchanged. After linking, the source and destination ranges were [0,39) and [39,58) in the empty case, or [0,39) and [39,70) in the populated case; the final ends include the Story terminator. `node.story` is the whole shared Story, while `storyRange` and `textBegin` describe the frame's scope and may include overflow or terminator entries, so neither full Story equality nor a range on its own proves visible fit.

Before linking, confirm that both nodes belong to the intended document and spread, and retain each original Story, its character and paragraph runs, the frame geometry and the scales. Before unlinking, work out where the text is meant to go: **the unlink tested here is not a split of visible text and does not reverse linking**. If separate, independent texts are needed, do not claim that unlink alone produces them; find another authorized operation and verify it on a sample. Re-read the flow members, their order and the front and back flags, the actual ranges, the full text and the required formatting; render both frames to check the visible flow and the overflow.

Each tested link and unlink operation had a verified one-step undo and redo boundary, and another undo of the unlink restored the linked state. Undoing a link restored the original separate stories, including the destination's original text, and the restored linked renders matched their baseline PNG bytes. Check actual values on the target history instead of inferring a rollback count, and do not use unlink to undo a merge. These two-frame results do not establish other chain shapes or recovery after a close.

The **2026-10-22, 3.3.1.4940 MacOS** sample separately linked three frames A→B→C across two spreads. Linking preserved its 178-character mixed Chinese and Latin Story, the 24/16/18px runs, the frame geometry and the text scales; textBegin was 0/45/134. A Story-coordinate Height=20 write over [40,55), which crosses the A/B flow boundary, changed only the compared glyph attributes of that range. Undo and redo restored the checked values. Async save and reopen also preserved the chain and the compared state; see [file persistence](#extended-file-and-layout-workflow).

**Unlink before the target frame, and never assume a split of visible text.** Unlinking B left the full Story in A and an empty but still-linked B/C chain. Worse, unlinking **the front frame A cleared the entire Story while A/B/C stayed linked**. That preservation target failed, although undo recovered the disposable sample. Reject targets where `textFrameInterface.isTextFlowFront` is true before ordinary unlinking; removing a front frame, or splitting text, needs its own authorized and verified procedure. Capture the full Story and runs and a recoverable baseline before any unlink, and check every chain that results. The current [official split-story example](https://www.affinity.studio/help/scripting-tutorial-split-story/) unlinks from the back and excludes the front. No guarantee covers arbitrary history, all formatting properties or recovery after closing.

<a id="text-tool-choice-and-refit"></a>
## Text tool choice and refit

Affinity's [current typography guidance](https://www.affinity.studio/typography-software) associates artistic text with headlines and frame text with long-form layouts. Choose from the actual layout constraints, not from a general preference for Artistic Text or a word or line-count cutoff:

| Required behavior | Tool choice |
| --- | --- |
| Structured body paragraphs, stable paragraph edges, fixed-width reflow, columns, linked flow or a fixed container | **Frame Text**. For Chinese body alignment, also verify the [punctuation rules and intended body boundary](#optical-alignment-and-punctuation). |
| Display heading, wordmark or label placed at its natural width, or intentionally scaled as a design object, without a conflicting frame constraint | **Artistic Text**. A short title alone is not a reason to bypass frame requirements. |
| Even a short heading/caption must align inside a fixed column/container or reflow when its width changes | **Frame Text**. Use that fixed container as the paragraph reference. |
| Deliberately line-broken display copy positioned as one natural-width object, without automatic fixed-width reflow | **Artistic Text can be used**, including multiple lines. |

Follow an explicit tool requirement. If it conflicts with the layout requirements, explain the conflict and clarify before editing; do not quietly substitute a different tool. When no tool is specified, choose the one that matches the constraint and give the reason briefly. Work out the required width or container from the brief and the existing layout; ask only when a missing constraint would materially change the result. This creation policy does not authorize converting existing objects. Keep each semantic block together as editable text in one object, or in an intentional linked story: use internal breaks and character formatting instead of line, word or character fragments or padding spaces. Separate objects need their own semantic, column or transform requirement.

Artistic Text supports paragraphs; its natural width follows its longest line, and resizing the object changes the glyph size. Frame Text supports structured paragraphs and flowing text. The **Publisher V2** help pages on [Artistic text](https://affinity.help/publisher2/en-US.lproj/pages/Text/artText.html) and [Frame text](https://affinity.help/publisher2/en-US.lproj/pages/Text/frameText.html) describe these concepts, but their UI details do not prove a route in the 3.3 SDK. A three-line artistic object with mixed font-height runs, and a same-length edit inside one run, were verified on **3.3.0.4850 Win32**. In the **2026-10-22, 3.3.1.4940 MacOS** linked sample, rewriting the identical whole Story collapsed 24/16/18px runs to 24px, and a same-length replacement across a run boundary inherited the starting style for the whole inserted range. Neither route preserves mixed formatting. Undo restored the samples, but a general capture-and-reapply algorithm remains unverified.

After creating or changing text:

1. Keep the agreed font sizes and content. Before editing, read the full text, line breaks, character and paragraph attribute runs, frame dimensions and the text render and UI scale matrices; equal strings alone do not prove that formatting survived.
2. Establish the permitted container constraints. In a fixed-width column, hold the agreed width and let the height change within the available area. In a fixed-size card or cell, preserve both dimensions and adjust the internal layout only as the brief allows. Artistic headings normally keep their natural content bounds.
3. When the frame dimensions may change, set the width first, let the text reflow, then measure the resulting line layout and the height it needs. Include insets, the first baseline (Initial Advance), leading and neighboring objects. Do not fit to glyph ink alone, and do not assume that the old height still fits after the edit.
4. Use only a documented, sample-verified frame-resize route that preserves the effective glyph sizes. The UI distinguishes the ordinary frame handles, which reflow text, from the separate handle that also scales the text ([current fitting help](https://www.affinity.studio/help/text-fitting-frame-text/)). The bounded [frame-resize sample](#extended-file-and-layout-workflow) passed a known target height using compensating node and render transforms; it is not an automatic frame-fit recipe, and no automatic measurement or fit method is verified here. If the available SDK cannot reliably resize or reflow the text, or cannot expose the measurement you need, stop that operation. State the width, height or overflow constraint that is unmet, and ask for the specific UI adjustment or another authorized layout choice. Do not claim that the fit is done, and do not quietly shrink the type, delete copy or split it into fragments.
5. Read back the text, the intended character and paragraph attributes, the font-height runs, the text scale matrix components, the frame and content geometry, and the overflow and clipping. Verify that all the copy and the final line are visible without unintended overlap; a complete Story can still overflow or be clipped. `canHideOverflow` is a capability getter, not a switch for the overflow state. A fixed frame does not have to shrink to its contents for alignment; measure the [agreed alignment target](#text-alignment-workflow), and keep complete ink distinct from a body that excludes punctuation.

Native vertical frame Align has no verified read or write entry in the 3.3 SDK surfaces that were inspected. The UI supports vertical alignment, but moving or tightening a frame does not set that native mode. Initial Advance is vertical first-baseline spacing, and FirstLineIndent is horizontal indentation. Keep those separate from insets, leading and baseline-grid constraints.

In the **2026-10-22** two-line conversion sample, the UI command Layer → Convert → Convert to Text Frame changed an ArtTextNode into a FrameTextNode. It kept the 25 characters, the compared 24/16px glyph runs, the paragraph mode and the scales. Its bounds changed, so the placement was not lossless. Undo and redo restored both states. Neither the inspected public commands wrapper nor the native DocumentCommandApi list exposed the corresponding conversion command. Converting in the UI and verifying with MCP is not the same as an SDK conversion, and rebuilding with StoryBuilder is not a verified in-place conversion. Converting an existing object still requires authorization.

<a id="text-alignment-workflow"></a>
## Text alignment workflow

First decide which alignment target applies: object or frame bounds, all glyph ink including punctuation, a Chinese body with punctuation excluded, an artistic-text anchor, or the paragraph reference inside a fixed frame. Use the brief and the object context, and ask only when a material ambiguity remains. These targets are not interchangeable. For hanging or body-only alignment, read [Optical alignment and punctuation](#optical-alignment-and-punctuation) before you position anything; moving an object by its full bounds can undo the hanging effect you wanted.

The recipe below was verified on Affinity **3.3.0.4850 Win32** with two unlinked, multiline `FrameTextNode` objects. Native paragraph `Centre` followed by a horizontal translation aligned the complete text blocks and preserved the text, font-height runs, text scale matrices, frame width and height and vertical position. It measures **all glyph ink, including punctuation**; it is not a recipe for centering a body that excludes punctuation, for native vertical frame alignment or for automatic frame fitting.

1. Confirm the target document UUID, the spread and the text nodes. Unless the user explicitly asks to align frame bounds, align the text content. Clarify an ambiguous reference (to each other, to the page, or to a key object) and whether multiline paragraphs should also be centered internally. Offer the combined case when it is needed, because paragraph centering and block alignment are not mutually exclusive. If the user asks only to move the blocks, preserve the paragraph style.
2. When the layout is meant to be multiline and centered, apply native paragraph `Centre` to each target's explicit text sub-selection first. For the verified unlinked-frame case:

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

   Before positioning, read `story.getParagraphAttRunsFrom(0)` and check that `paragraphAtts.alignXType.value === 1` for the intended paragraphs. Linked frames need separately verified story and paragraph ranges; do not assume that their ranges start at zero or affect only one frame.
3. For the whole-ink target this recipe covers, measure the glyph geometry in spread coordinates after the paragraph formatting:

   ```js
   const glyphBox = textNode.curvesInterface.polyPolyCurves
     .getExactBoundingBox(textNode.baseToSpreadTransform);
   ```

   Reject null, empty or non-finite bounds. This reads the glyph outlines without converting the editable text to curves or changing those outlines; the method accepts the transform directly, so you do not need to clone and transform. `getExactSpreadVisibleBox(false, false)` matched these glyph bounds in the verified plain-frame samples, whereas ordinary `getSpreadVisibleBox(false)` included frame geometry and was unsuitable as a content-center proxy. Do not assume these equivalences for decorated or clipped objects.
4. Compute each block's center as `glyphBox.x + glyphBox.width / 2`, then `dx = targetX - centerX`. Use the agreed reference for `targetX`; for alignment within the current selection, the midpoint of the original combined content bounds keeps the selection's overall horizontal placement. Capture that reference before paragraph formatting. Apply pure horizontal translations with `DocumentCommand.createTransform(Selection.create(doc, textNode), Transform.createTranslate(dx, 0))`, importing `Transform` from `/geometry.js`. Batch each phase with `CompoundCommandBuilder`: format, remeasure, then translate in one script, instead of iterating from screenshots.
5. Read back the paragraph modes and content centers, and the unchanged text, font-height runs, frame y, width and height, and text scale matrix components; compare values, not object identity. Render to check that short and long lines are centered within each paragraph and that the blocks share the requested axis. Checking only the combined outer bounds misses paragraphs that are left-aligned inside an otherwise centered block.

Native paragraph centering uses typographic spacing, so it does not guarantee identical optical centers for the ink of every glyph. The inspected `GroupTransformData` exposes object align and distribute settings but no glyph-bounds switch; do not substitute native object alignment for content alignment without verifying how it treats the boundary. Native vertical frame Align is still an unexposed entry point in the inspected SDK surfaces, and moving a frame does not set that mode. Before you apply this recipe to linked or overflowing text, text on a path, clipping, effects or color fonts, revalidate those cases. No timing benchmark shows that measuring glyph outlines is faster than an already verified exact-visible query.

<a id="optical-alignment-and-punctuation"></a>
## Optical alignment and punctuation

Frame Text gives structured copy a stable container and paragraph reference, but it does **not** correct Chinese punctuation automatically. Artistic Text supports optical effects as well. The official **V2** [optical alignment help](https://affinity.help/publisher2/en-US.lproj/pages/Text/opticalAlignment.html) distinguishes Manual character rules from behavior supplied by the font; check again when the font changes.

On **3.3.1.4940 MacOS, 2026-10-20**, two batches of 84 single-line Art and Frame objects used `PingFangSC-Regular` and `STSongti-SC-Regular`, with a glyph height of 24 document pixels at 96 DPI. `GlyphAtts.opticalAlignmentType` exposes a getter and a setter; writes to detached attribute objects were checked separately from actual document formatting. The document route below passed mode readback and rendering with `None=0`, `Manual=1` and `Font=2` ([SDK getter](https://sdk.affinity.studio/33001/js/apis/GlyphAttsApi/getOpticalAlignmentType.html), [setter](https://sdk.affinity.studio/33001/js/apis/GlyphAttsApi/setOpticalAlignmentType.html), [delta](https://sdk.affinity.studio/33001/js/apis/StoryDeltaApi/createOpticalAlignmentTypeDelta.html), [enum](https://sdk.affinity.studio/33001/js/enums/OpticalAlignmentType.html)):

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

Read `story.getGlyphAttRunsFrom(0)` and each `glyphAtts.opticalAlignmentType`, then measure and render the intended effect. This applies a **mode**, not character rules; linked and partial story ranges need their own checks.

The inspected wrappers, the related native modules and prototypes, and the official symbol inventories did not expose access to the custom character and left/right percentage rule table. This is a gap in the inspected SDK entry points, not a restriction of the MCP protocol. When the result depends on such rules, use an available UI check or edit within the task's authorization, or report the specific gap. Do not invent a setter, and do not treat a Manual readback as proof that the rules are covered.

In the limited sample, Manual without customization improved the quotes but did not resolve `「」（）。，`, and the effect of Font varied with the font and the operation. With UI rules at 100% left and right, the tested Chinese-body offsets became zero relative to the same-font, unpunctuated baseline, for fixed-anchor Art and for fixed-frame paragraph Left, Right and Centre. **Custom** was a label for that UI-configured Manual group, not another enum value, and 100% was a controlled test parameter, not a universal recommendation. Repositioning Art by `getSpreadVisibleBox(false)` still left body offsets in None, Manual and Custom. Selecting Frame, or measuring complete glyph ink, cannot substitute for the intended body alignment.

For punctuation-sensitive work:

1. Determine the required paragraph or container reference, and which characters belong to the aligned body. Check the actual font, optical mode, character rules and left/right hanging values; do not assume that every installation or style shares the tested rules.
2. Apply the paragraph layout and the required optical rules before positioning. Keep the paragraph or anchor reference you chose, and do not then recenter by bounds that contain punctuation when the target excludes it.
3. Verify the intended body's edge or center and render it, using a same-font, unpunctuated control when you are testing hanging. The sample's zero relative offset does not remove font side bearings or guarantee alignment to arbitrary objects. Its one-outline-per-codepoint mapping was checked only on those simple strings, so it is not a general body-filtering algorithm. If reliable body measurements or the required rule settings are unavailable, report the unmet target and use an authorized UI route; do not claim completion from full-ink bounds.
4. After edits or font changes, recheck the affected text and runs, the font size and text scale, the frame geometry, the line layout and the visibility. These samples leave other fonts and sizes, multiline reflow, linked flow, rule copying and save and print behavior unverified.

## Structure and geometry

<a id="basic-boolean-operations"></a>
### Basic Boolean operations

In the **2026-10-21 Boolean sample** (environment recorded above), `Selection.create(doc, [a,b])` passed to `DocumentCommand.createBoolOpUnion`, `createBoolOpSubtract`, `createBoolOpIntersect` or `createBoolOpXor`, followed by `doc.executeCommand`, produced real PolyCurve nodes from pairs of overlapping black rectangles. With A=(40,y,120,50) and B=(100,y,120,50), the resulting x/width values were Union=40/180, Subtract=40/60, Intersect=100/60 and Xor=40/180; coverage at x=70/130/190 was 111/100/010/101. The geometry, the rendered interior pixels and the actual undo, redo, undo, redo sequence matched the retained target and protected snapshots.

Before executing, confirm the intended document and spread, the node types and the ordered operand selection. Capture the target and protected membership, types, boxes and six transform components. Read the actual output nodes and the rendered coverage; a command object or a compound-operation enum is not enough. Re-fetch handles after node replacement or history changes, and verify the actual history boundary before restoration. Complex or open curves, decorations, effects, arbitrary operand orders and other histories remain unverified.

- Renaming through `descriptionInterface.userDescription`, locking through `Document.setEditable` and visibility through `createSetVisibility` are readable; restore the lock and visibility after a temporary change. Tag data (`TagInterface`: custom and predefined keys, and the decoration flag) is readable, but that is not evidence that arbitrary tag writes work.
- `setSpreadSizeWithAnchor` and `setSpreadDocumentProperties` resize a spread and its properties. They were verified with `SpatialAnchor.TopLeft` and `reflowPages = false`, and `getSpreadExtents()` confirmed the result. Other property combinations are untested.
- Every `PageBoundingBoxType` variant can return the same box. Read the trim, bleed and page boxes separately, and check them against the print requirement.
- `createAddArtboard` creates a real artboard, and its margin readback works; [Page geometry](page-geometry.md) explains the difference between enabled, nonzero and zero values, and the local coordinates. An ordinary, non-artboard shape returns `DISPOSED` on that properties path.
- Check `isArtboardEnabled` before you use an ordinary shape's artboard-properties path. Adding an artboard moves the spread and the export-preview geometry to the artboard area, and deleting it does not restore the previous spread size on its own; use a verified history boundary instead. Do not substitute artboards for Layout pages.
- Use the document's unit converter instead of assuming that the getters agree (`Document.viewdpi` against the converter's `viewDpi`). Guide placement with unequal document and view DPI is untested. Application version metadata, `DrawingScale` (1:100 and 11 metric defaults), and `Collection` map, filter, reverse and reduce are readable.

## Raster, fills and files

<a id="bounded-value-objects"></a>
### Detached values and RGBA8 pixels

On **3.3.1.4940 MacOS, 2026-10-21**, the following bounded paths passed: Point (0,0)→(3,4) with distance=5 and squared=25; translate by (10,20) and the inverse round trip; and a rectangle Curve clone and translate with the original bounds unchanged. An RGBA8 Colour clone (12,34,56,alpha=200), a UTF-8 Buffer clone and the default Font name ArialMT also passed. A 4×4 RGBA8 Bitmap with pixel (1,2)=(12,34,56,255) kept that pixel through `createCompatibleBitmap(true)` and a `PixelReaderRGBA8` readback; dispose the pixel accessors after use. These results do not establish all matrices, colour spaces, encodings or raster formats.

`create()` and `clone()` returned matching shapeType values for ShapeArrow, ShapeCalloutEllipse, ShapeCalloutRectangle, ShapeCat/Cat2/Cat3/Cat4, ShapeCloud, ShapeCog, ShapeCrescent, ShapeDiamond, ShapeDoubleStar, ShapeEllipse, ShapeHeart, ShapePie, ShapePolygon, ShapeRectangle, ShapeSegment, ShapeSpiral, ShapeSquareStar, ShapeStar, ShapeTear, ShapeTrapezoid, ShapeTriangle and ShapeQRCode. This establishes detached creation, cloning and type acceptance only, not parameter editing, document rendering or QR decoding. Verify the values you need and that the clone is independent; do not treat a non-null handle as success.

- `Bitmap`, `PixelBuffer`, `PixelReaderRGBA8`, `PixelReaderWriterRGBA8` and `copyTo` work for reading and writing pixels, and a compatible buffer exposes its bytes. `Buffer` round-trips UTF-8 text, and cloning, a shared span and an independent slice behave as expected.
- Raster domain size, content bounds and placed size are different quantities, so do not equate them. Image resources report the original and placed size along with format and placement metadata. A generated bitmap reports an original DPI of 0 and no external file path, so do not assume either. File size is a BigInt and must be converted before it is logged as JSON. Command transforms moved and scaled the raster and image content boxes, which was confirmed in a preview.
- Historical solid, gradient, hatch and anchoring cases keep their original scope. On **3.3.1.4940 MacOS, 2026-10-21**, `LineStyle.createDefaultWithWeight(2)` read back weight=2; the current property is `lineStyle.pathBrush`, and an ordinary solid stroke returned null. The old `vectorBrush` property was undefined, and `/vectorbrush.js` failed to load. `PathBrush.createDefault()` and `RasterBrush.createDefault()` throw wrapper placeholders that say `not yet implemented in C++ API`; neither is a successful native creation. That experiment did not obtain a usable instance; the later [existing-PathBrush workflow](#existing-path-brush-workflow) requires a real brushed source. Never fabricate handles.
- `Bitmap.loadFromFile` and the callback-based `loadFromFileAsync` decode images. `NodeRenderingEngine.createDefault` plus a compatible buffer produces actual raster output that you can inspect.
- Historical Desktop file, seek, directory, status and async-read cases keep their own scope. The [owned-file sample](#verified-file-and-export-workflow) passed UTF-8 write and read and synchronous `copyFile`, but `FileSystemPromises.copyFile` still returned `NO_ENVIRONMENT` and wrote no destination file. Do not generalize that failure to async PNG or to all asynchronous methods. No ACL or permission mutations were exercised.
- A synchronous `HttpRequest` GET to a local server works with **Access networks** enabled, and timers and callbacks work.
- Historical script-library reads and writes, and local `saveAsPackage` observations, keep incomplete build metadata. The later [package/load counterexample](#extended-file-and-layout-workflow) did not preserve the original image pixels after the source was removed; do not equate creating a package with portable resources. Permission for local writes does not authorize `report_sdk_issue` or sharing hints externally, and local hints need the matching Affinity setting.

<a id="existing-path-brush-workflow"></a>
### Reuse an existing PathBrush

The **2026-10-22 sample on 3.3.1.4940 MacOS** verified reading a real PathBrush from a curve that had been prepared in the UI with a built-in image path-brush preset. This is an SDK reuse workflow that starts from a prepared source; it is not SDK preset enumeration or creation from scratch. It does not establish RasterBrush acquisition.

1. Bind the intended document and spread and a real brushed source. Read `source.lineStyleInterface.lineStyle.pathBrush`, and stop if it is null. Record the source and target geometry, transforms, line style and the brush fields that matter for the edit.
2. Clone the PathBrush and the source LineStyle. The sample changed the clone's `brushWidth` from 120 to 60, set the cloned style's `pathBrush` to the clone and `weight` to 60, and verified that the source stayed at 120.
3. Apply the cloned style to the target with three `doc.setLineStyle(style, target, options)` calls, using `LineStyleMask.Weight`, `.Brush` and `.Type` separately. The tested options also set `contentType: ContentType.Main`, `useTextSelection: false` and `defaultsMode: LineCommandDefaultsMode.None`. Import the mask from `/linestyle.js`, ContentType from `affinity:dom` and LineCommandDefaultsMode from `affinity:commands`; check the current signatures and ranges before you use native imports.
4. Re-fetch the nodes and verify the target's Texture(3), weight=60 and brushWidth=60, the remaining compared brush fields, the unchanged source and both centreline boxes and transforms; then render the result. In the sample, the target showed a smaller repeating texture. The actual undo, redo, undo, redo sequence restored the compared baseline and applied states; those three separate history entries are evidence from this sample, not a general rollback count.

Keep the failures: both default brush factories still throw wrapper placeholders. No create, load or preset-enumeration route was found in the brush wrappers, the native brush API prototypes or the published brush symbols that were checked. `LineStyle.create` with Texture returned `INVALID_ARGS`, both without a brush and with the existing brush, while an explicit Solid control passed. `setLineStyle` with All did not change the sample even with the explicit options above; use only the verified single-field route and read back the actual effects. These observations do not prove that every Texture factory, or every use of the All mask, fails. Other presets, RasterBrush instances, save and reopen, and arbitrary brush attributes remain outside this sample.

## Selection and appearance

- Raster selection commands (rectangular mask, grow, feather, smooth, inside-outline, select-all and deselect) change pixels; verify the result instead of trusting that the command constructs. Other sub-selection types return `INVALID_OP`.
- An outer shadow, a Multiply blend mode and gamma 1.8 can be applied, read back and removed with `removeAllLayerEffects`; other effects were not exercised. A solid fill requested with reduced alpha normalises to None, so do not assume that any solid fill gives live transparency.
- Filter and adjustment parameter commands modify the fields that were tested; only the tested field and value of each filter is covered.
- `createImageTrace` produces real vector geometry (PolyCurve nodes) from a bitmap; an unchanged document selection does not prove that there was no output.

## Lifecycle, documents and export

- `Document.createFromOptions()` with `NewDocumentOptions` creates a new document, including one with multiple spreads, but it does not add pages to an existing document. Read the actual geometry after creation. Inserting pages into an existing document and multi-page stitching remain unverified.
- On **3.3.1.4940 MacOS, 2026-10-21**, the historical `ExportScale.createWithWidthHeight(600,800)` counterexample was reproduced: Square(3), size=800, multiplier=600, width=800, height=0. `createWithMultiplierSquare(2,600)` returned WidthHeight(4), size=2, multiplier=0, with width and height not recorded. Both fail the intended semantics, and the root cause is not established. Do not swap factory names as a workaround. Single-argument Width(600), Height(800), Square(600) and Multiplier(2) objects passed type and effective-field readback; use `.size` for Width, Height and Square, not inactive fields. No actual custom-scale export was tested.

- On 3.3.0.4850 Win32, synchronous `Document.close()` closed modified, unsaved disposable samples, confirmed by re-enumeration. Async and Promise close, and business documents, remain unverified on that Win32 sample. On **3.3.1.4940 MacOS, 2026-10-21**, `closeAsync(callback)` and `document.promises.close()` each closed a dirty, unsaved sample directly without saving or prompting, discarding its unsaved content. The callback error and the Promise result were `undefined`, and re-enumeration confirmed removal. Follow [the save/discard authorization and completion checks](scripting-pitfalls.md#async-close); the Mac success does not upgrade the historical Windows close failures or establish recovery after a close.

- Historical save, async-save and package cases, and `executeCommandAsync` cases, keep their original incomplete build metadata; they are not new test passes. The save and export samples below are bounded. The 2026-10-22 async PNG and CurrentPage sample is separate from the older failures, and these samples leave `exportMacro` unverified.
- The **3.3.1.4940 MacOS** small-spread sample separately verified synchronous PNG/CurrentSpread export, `File.readAll(...).toString('base64')`, cleanup of the owned temporary file, and explicit host image handoff in the edit call. Apply the [single-call preview gates](scripting-pitfalls.md#single-call-preview); this does not extend the async, print or arbitrary-document cases.
- `ExportConfig` appears only once a slice exists on the node, for example one created in the UI. `ExportableInterface` on its own can report a null config, and no public factory was found. Change a size with `format.replaceSize(index, size)`, change the format list with the append, replace or delete methods, write the format back through `config.replaceFormat`, and apply the config with `DocumentCommand.createSetExportConfig(selection, config)`. A fresh read can still return the old value until the change is written back.
- `DocumentProperties.create()` returns detached defaults, not a snapshot of the document, so set only the fields you intend to change. Setting a single field through `setDocumentProperties`, for example units Millimetre → Inch, applies without changing the DPI, the view DPI or the extents.
- Sub-selection counts, such as CurveEdge or CurveNode ranges, are not counts of visible vertices. Repeated commands of the same kind coalesce into fewer history entries, so check the actual history and refuse an ambiguous rollback; do not infer undo counts from the number of API calls.
- For embedded documents, `EmbeddedDocumentNode` reads page and layer metadata. The available page boxes are TrimBox, MinimumContent and MaximumContent, and requesting the unavailable MediaBox does not change the value. `createSetEmbeddedDocumentSelectedSpreadID` and `createSetEmbeddedDocumentSelectedArtboardID` switch between valid enumerated IDs, and restoring the original ID restores the rendered output. Writing an empty `selectedArtboardId` returns `COMMAND_FAILED`, even though an empty value represents the whole document; restore it with a checked single-step undo instead.
- UI actions, such as creating a picture frame, preparing a sample for export or clicking a dialog, can produce state that the SDK then reads. They are not evidence of an SDK entry point. Picture frame reads expose the enabled state and content, the anchor and the constraints (`calculateAnchor` → Centre, `calculateConstraints(..., ConstraintType.Default)` → ForceAspectMax), and `frameContents` is a raw `NodeHandle`, so wrap it with `createTypedNode`. SDK dialogs stay live after an MCP timeout: clicking a button fires its callback once, OK returns result Ok, and the dialog's own result, not the transport timeout, tells you when it finished.

<a id="verified-file-and-export-workflow"></a>
### Verified file/export/save workflow

In the **2026-10-21 file sample** (environment recorded above), an explicitly authorized, owned Desktop directory and a 640×480px, 96 DPI spread with a white background and three black rectangles passed these paths:

| Path | Accepted result |
| --- | --- |
| File.create/writeStringAsUtf8/flush/close + File.readAll | 17-byte UTF-8 synthetic text roundtrip; synchronous `fs.copyFile(source,destination,CopyOptions.None)` was byte-identical |
| Synchronous PNG, JPEG, SVG, PDF, WebP / CurrentSpread | Returned export records OK, correct paths and independently readable content/geometry |
| `await doc.promises.export(path, options, area)` / PNG / CurrentSpread | Actual file and OK record after Promise completion; all 307,200 decoded pixels matched the synchronous PNG and expected geometry |
| `doc.saveAs(path)` then close/reopen | Correct path and real file, dirty/needsSaving false; all four nodes, geometry, transforms, DPI and rendered output preserved |

Before writing, establish what output the user asked for and what is authorized. Use `app.userDesktopPath` and a directory or path you own, and reject collisions; do not test on user files or overwrite them. Enumerate `FileExportOptions.allPresetNames` and choose the **actual** preset name you intend. This sample used `PNG`, `JPEG (最佳质量)`, `SVG (用于导出)`, `PDF (用于导出)` and `WebP (无损，默认值)`; the names depend on the installation and language. `createWithPresetName('JPEG')` is not an established universal choice.

Guard the document UUID and spread, then export with `FileExportArea.createForCurrentSpread()` from `/document.js`. The synchronous route is `doc.export(path, options, area)`. The async route is `await doc.promises.export(path, options, area)` inside a returned async IIFE, not with top-level await. Keep the options and area alive until the export completes, and recheck the target before you write again. Inspect every returned record in `records.all`: the path, `isSuccess` or the result, the warning and the error. Require the intended file to exist, and decode it at the expected dimensions and area; metadata or a completed Promise alone is not enough. Respect [the separate Bleed checks](page-geometry.md#completion-evidence).

PNG, WebP and async PNG each matched all 307,200 pixels. JPEG matched 214,500 interior pixels after excluding an 8px edge band. SVG kept the four rectangles and the viewBox. The PDF was one 480×360pt page, and independent 96 DPI rendering matched the expected 640×480 geometry and 287,364 interior pixels after a 2px edge exclusion. The sync and async PNG file bytes differed only in iTXt metadata, while the decoded pixels and the IDAT matched. Compare decoded pixels for visual equality, not whole-file hashes. These checks do not cover text or fonts, photographs, transparency, complex effects, Bleed, other presets, areas or scales, or multiple pages.

Older hints that say every Mac async PNG export fails with `NO_ENVIRONMENT` are contradicted by this sample. The separate `FileSystemPromises.copyFile` sample still failed with that error and produced no output. Record the method, the build and the post-state separately; do not substitute a JPEG render for a requested PNG, and do not retry a failed write without reading the actual state.

For saving, verify the intended path, a real file and its content, and both save-state flags; `undefined` is not a success value. Reopen only a task-owned sample, or when the user authorized that lifecycle operation; do not close and reopen user documents just to check saving. If reopening is outside the scope, report the content-persistence check as unverified. Delete only authorized, owned temporary outputs, and only after the evidence is retained; confirm the cleanup without touching unrelated files. Async save, savePackage, overwriting existing files and linked resources were not part of the 2026-10-21 sample; the later sample below covers only the named extensions.

<a id="extended-file-and-layout-workflow"></a>
### Extended file and layout workflow

The **2026-10-22, 3.3.1.4940 MacOS** two-page sample with transparent, mixed Chinese and Latin text added these bounded results. Use the common runtime and precondition checks above on every platform; the recorded sample is provenance, not an OS gate.

| Route | Result and operational limit |
| --- | --- |
| PNG/CurrentSpread; `await doc.promises.export(...)` PNG/CurrentPage; lossless WebP/CurrentSpread | All 640×480 decoded RGBA pixels matched, including transparent corners, 50% blue interior and blurred edges. JPEG flattened onto white. This does not cover every effect or preset. |
| `doc.export(path, options, area, {width:320,height:240})` | Produced 320×240 from the 640×480 spread. The argument is native Size, not an ExportScale handle; the two historical factory counterexamples remain. |
| PDF/WholeDocument; PDF/`createForPages('2')` | Two 480×360pt pages versus one selected second page; extracted complete text matched the Story after layout-whitespace removal, and PingFangSC-Regular/Arial-BoldMT subset font streams were embedded. Check font licensing/actual embedding and pages per output. |
| SVG/CurrentSpread | Text elements retained font-family references; blur became an embedded image. Font references do not prove embedded fonts, portability or an entirely vector effect. |
| `await doc.promises.saveAs(ownedPath)`; edit; `await doc.promises.save()` | Created then overwrote only the owned native file; both save-state flags became false. Close/reopen preserved the three-frame chain, full text, compared glyph/paragraph attributes, geometry and scales. No failure-path or user-file overwrite acceptance. |
| `await doc.promises.saveAsPackage(ownedPackagePath, PackageResourcesPolicy.None)` | Actual package reopened with matching compared state and identical decoded before/after PNG pixels. The live document path remained the original path and pre-existing dirty flags stayed true: packaging is not confirmation that the current document is saved. External-resource collection/relocation remains unverified. |
| Known-height frame resize | For A=(40,40,250,140), a Y scale 9/7 and Y translation -80/7 through `createTransform` yielded height 180 and unchanged compared glyph runs/textUiScale. Node Y scale=9/7 was compensated by textRenderScale Y=7/9, and B/C textBegin changed 45/134→97/160. Explicit false/true `correctChildren` both passed this sample; do not claim that flag is always required. Undo restored the baseline. Rotation, shear, auto-fit and arbitrary transforms remain unverified. |

For the frame resize, compare the effective composed transforms and the rendered line layout, as well as the stored font heights; an inverse render compensation is not an unwanted glyph-size change. Validate the final visible copy and overflow separately. A successful known-height resize does not give you automatic height calculation.

An additional 320×240 sample requested L/T/R/B Bleed=10/12/14/16 and had a background box (-10,-12,344,268). PNG/CurrentSpread stayed 320×240, while Selection exported 344×268. PDF (for print)/WholeDocument had MediaBox, TrimBox and BleedBox all at the 240×180pt trim size. **A preset name or an OK record does not establish complete Bleed.** Creation options and background extents do not independently confirm the active native Bleed settings. Inspect the actual configuration and output bounds using [page geometry](page-geometry.md#completion-evidence). No general include-Bleed option was verified.

An additional UI-placed Linked PNG sample failed the offline-original-fidelity target. `await doc.promises.saveAsPackage(path, PackageResourcesPolicy.IncludeImages)` produced a package. After the owned source was renamed and the package copied to another directory, `Document.load` kept the text, geometry and resource metadata, while the exported page differed at 4,902 pixels in the image region. `imageResourceInterface.saveOriginalFile` wrote a PNG with the same dimensions but different pixels. Restoring the source path and reopening the original package restored the exact page pixels. This is a bounded package and load counterexample, not proof that every packaging route fails; its cause, UI unpacking and other resource policies remain unverified. Require the actual originals and an offline render before portable delivery; a cache preview, dimensions, resource metadata or a successfully created package is not enough. Do not guess bit shifts for the policy enum.

Do not retry a submitted placement that is uncertain, and do not delete source files that are still in use. A text-chain save and reopen does not validate custom optical-rule persistence, arbitrary mixed-format replacement or every package resource policy.

## AI

- Canva AI commands can fail at construction with `PERMISSION_DENIED`, before anything executes. Only `Document.generateImage` was exercised. A saved permission setting is not runtime permission, and switching between the sync and async paths does not fix a construction failure. Do not retry a potentially chargeable request automatically, and do not infer a platform-wide restriction from one refusal.
