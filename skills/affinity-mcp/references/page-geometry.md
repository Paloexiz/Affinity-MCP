# Page geometry and print verification

Use this reference for posters, flyers, covers, new layouts and redesigns, and for native Affinity dimensions, Margins, Bleed, folding and print export. Read the existing project's geometry before you compose any artwork, even when the user has not named these settings. This page describes the checks to perform; it is not a prevalidated script or a fixed print specification.

## Poster and artwork preflight

Identify the intended page or artboard, then read its actual trim, per-side Bleed and Margins, whether each one is enabled, and any overrides or master inheritance that apply. Preserve the project's settings unless the user has authorized changes; hidden guides do not mean margins are disabled. For a new document, use the requirements agreed in the brief and verify the state that was created, instead of importing another project's defaults. If the native readback you need is unavailable, report that setting as unknown; do not silently assume zero or claim that the layout is print-ready.

Use the configured, enabled Margins as the first placement guide for essential copy, logos and codes, and respect the agreed print-safety requirement plus any explicitly approved exceptions. Margins are not a clipping boundary. Extend backgrounds and imagery that are meant to print to the trim edge, using the configured Bleed, and keep essential content separate from them. Record the verified trim, the safe-content area and the outer bleed area before you choose positions, and check them again after layout changes. Do not disable margins or remove bleed just to make the composition fit.

## Establish the geometry before changing it

Reuse the latest agreed requirements and read the actual target document. Identify it by session UUID and by name or path; a file open in another application is not the requested Affinity document. State dimensions as **width × height**, with units and orientation.

Keep these quantities separate:

| Quantity | Meaning | Evidence to read |
| --- | --- | --- |
| Page/artboard trim | Finished boundary of one page or artboard | Actual page/artboard geometry, not only document defaults |
| Spread trim | Combined boundary of the arranged pages | Actual spread extents excluding bleed and children |
| Margins | Inward guides for layout; do not enlarge export size or clip objects | Per-side distances, enabled state, overrides and master inheritance |
| Bleed | Extension outside trim for artwork that will be cut | Native per-side bleed settings plus resulting outer extents |
| Export bounds | Region actually exported | Pages vs spreads vs selection, bleed inclusion in the export settings/preset, scale and actual output dimensions |

When the user says “document size,” establish whether they mean page size, spread size or size including bleed. Resolve conflicts from the current document and earlier decisions, and ask only if the intended target is still ambiguous. Do not use bleed to make up for a missing trim dimension.

For a rectangular trim area `W × H`, with left/right/top/bottom distances:

- Margin guide area: `(W - mL - mR) × (H - mT - mB)`; trim remains `W × H`.
- Bounds including bleed, before printer marks or export scaling: `(W + bL + bR) × (H + bT + bB)`.
- When all four sides are 5 mm, bleed adds 10 mm to each dimension and the margin guide area removes 10 mm from each dimension—not 5 mm in total.

Examples (arithmetic only, not recommended defaults):

| Trim, width × height | Margins | Bleed | Trim export | Export including bleed |
| --- | --- | --- | --- | --- |
| 280 × 205 mm | 5 mm each side | 0 | 280 × 205 mm | 280 × 205 mm |
| 210 × 148 mm | disabled | 5 mm each side | 210 × 148 mm | 220 × 158 mm |

Read the SDK units before converting. Prefer `document.unitValueConverter.getConversionFactor(from, to)` from `/units`, with the unit enum values of the live SDK. If you construct a `UnitValueConverter` explicitly, check the getter names: the document exposes `Document.viewdpi`, while the converter uses `viewDpi`.

**`addGuide` units:** the `pixels96` parameter name is misleading. Pass document pixels at the document's DPI: in a 300-DPI document, 300 document pixels give 25.4 mm, whereas fixed 96-DPI pixels would give 79.375 mm. Convert with `document.unitValueConverter.getConversionFactor(UnitType.Millimetre, UnitType.Pixel)` instead of hardcoding 96. It is not established whether `dpi` or `viewdpi` drives the scaling, so verify where the guide actually lands. The live `/examples/addGuides.js` passes spread-space object bounds straight to the guide command, and the enum name differs between sources: `UnitType.Millimetre` in that example, `UnitType.Millimetres` in `tests/documenttests.js`. Confirm the member against the live enum. Different document and view DPI combinations and `moveGuide()` are untested, no guide-position readback was found in the SDK, and a command-success flag proves neither the placement nor the Margins enabled state.

Use `mm × dpi / 25.4` only for coordinates that the documentation defines as document pixels. Do not assume that screen pixels, points, document DPI and view DPI can be converted interchangeably. For a raster, `pixels × 25.4 / export_dpi` checks its physical size at that resolution; it says nothing about the native Margins or Bleed settings. Allow for pixel rounding when you compare raster exports.

## Read and apply the correct native setting

Read the live SDK preamble and the relevant topics before you script. Look up the topics for document properties, spreads and pages, margins, page boxes and export. Search the hints if the units, field order or scope are unclear. A similar name is not proof of equivalent behavior.

The following names are **static lookup leads**; confirm each one against the live SDK and the actual document:

- `NewDocumentOptions.margins` and `marginsEnabled`: creation options; they do not tell you the current document's state.
- `DocumentProperties.margin`, `includeMargins` and `bleed`: separate lookup leads. The 2026-10-20 wrapper marks `margin` and `includeMargins` deprecated and stores them only on the options object; they do not set or read back the native margin state. `bleed` is still native on the property object, but the inspected surface had no route from the active document to that object.
- `SpreadDocumentProperties` extends `ArtboardDocumentProperties`, inheriting `margin` and `useMargin`, and it also exposes `useMasterMargin`. These property objects describe changes; they do not prove the live spread's state.
- For an actual `ArtboardInterface`, follow `artboardProperties.marginsInterface.margins`, `useMargins` and `hasMargins`. On 3.3.1.4940 MacOS, observed 2026-10-20, `ArtboardInterface.marginBox` computes its effective box in **spread coordinates** from `spreadBaseBox` and the enabled margins. The older `artboardProperties.getMarginBox(behaviour)` / `EffectiveMarginBehaviour` recipe below is a separate historical lead; do not assume that the live wrapper exports it. `hasMargins` is not the enabled flag, and the artboard path does not cover every Layout page or spread, or every inheritance mode.
- `getSpreadExtents({ includeSpread: true, includeBleed: false, includeChildren: false })`, compared with the same query with `includeBleed: true`, supports the geometry but does not replace reading the native settings.

Verify each field's current meaning, units and accepted struct shape. Apply changes through the documented document command, then read the actual target again; reading a newly constructed options object only confirms the inputs you supplied. A literal `marginsDisabled: true` in a script is not a native-state readback either, even if the tool succeeds. Avoid applying property objects filled with defaults, because they reset unrelated settings. If the SDK cannot read or change a required setting, report that exact gap; do not claim success because the geometry matches.

Historical margin sample, with incomplete build metadata for each case. It applied `ArtboardDocumentProperties` through `setArtboardDocumentProperties` and read the native interfaces available at the time:

| Requested margin state | `useMargins` | `hasMargins` | `getMarginBox(PageBoxIfDisabled)` |
| --- | --- | --- | --- |
| Enabled, L/T/R/B = 10/20/30/40 | true | true | local `(10, 20)`, 560 × 640 |
| Disabled, same supplied values | false | false | local `(0, 0)`, 600 × 700 |
| Enabled, all zero | true | false | local `(0, 0)`, 600 × 700 |

That historical `getMarginBox` result was **artboard-local**, unlike the spread-coordinate `ArtboardInterface.marginBox` above. `hasMargins` was not the enabled flag, and applying margins left the artboard's position and dimensions unchanged. The sample covered an actual artboard; it did not cover Layout spread or master inheritance, or view visibility. The artboard-properties path on an ordinary rectangle returned `DISPOSED`, and stored distances were not readable when margins were disabled. The historical converter case covered both millimetre-to-pixel and pixel-to-millimetre directions; recheck the target wrapper and units.

Handle Margin state explicitly:

- **Hide guides** changes how guides are shown in the view; it does not disable configured margins. No visibility operation has been runtime-verified here. Look for a documented view operation separately; creating or moving guides, and `useMargins`, are not substitutes. If none is available, report the view-control gap.
- **Disable Margins** changes the enabled or use setting that applies. Check page and spread overrides and inherited master margins that could keep the margins active. Do not change a shared master or unrelated pages just to change one target.
- **Set values to zero** changes the distances; by itself it does not prove that the enabled setting is off.

Use the user's context to tell these requests apart. When you only disable or hide margins, preserve their values unless a reset was requested. Bleed and Margins can coexist; enabling bleed does not authorize removing margins. Hiding guides or disabling Margins leaves any agreed content safety distances in effect.

## Refit content and folded layouts

For Layout brochures, preserve the intended native page and spread arrangement. Do not substitute Vector artboards, or a flattened external mockup, for a Layout document the user asked for.

Use the print provider's fold template, or the panel widths the user specified. For a roll fold, do not assume equal widths or a single universal outside/inside page order. Record each panel's role, width and fold position; the widths must add up to the spread trim width. A fold is not an extra outer bleed strip, so do not add up every panel's bleed to work out a spread export.

After resizing or moving folds, recalculate the safe area for **each panel**, taking outer edges and fold clearances into account. Convert object bounds into the same page or spread coordinate system before you compare them. When the page origin is local `(0, 0)`, a required safe area is `[mL, mT, W - mR, H - mB]`; for offset pages, include the actual origin. Respect inside and outside margins on facing pages.

When the user reports too much whitespace at the edges, locate the trim and bleed boundaries before you change any artwork: uncovered outer bleed and too much internal content inset are different problems. Measure the content inset from the trim or the folds, not from the outer bleed edge, and do not add the bleed width again as if it were inward padding. Reduce excess whitespace without removing the agreed safety clearance or treating an earlier brochure's inset as a default.

Check visible text, table contents and borders, logos, QR codes (including their quiet zones), headers and footers against the agreed safety constraints. Frame bounds alone do not prove that the text fits: check for overflow, clipping, strokes and visible content. Reflow or reposition as needed; do not quietly remove copy or shrink type below an agreed size. Scaling a whole group uniformly does not prove that the reflow worked, so recheck the physical type and QR sizes, the spacing and the panel balance. When copy must be preserved, compare the text and table entries before and after, not just the object count. If the margins are only guides for body layout, deliberate headers and footers outside them are not automatically defects; check them against the actual print safety requirement.

Treat full-bleed backgrounds and decorative imagery separately from essential content. Extend the backgrounds that need it to the outer bleed edge, check the fold joins for gaps, and recheck the watermark's position and visibility and the panel centering after transforms. Do not force backgrounds into the text safe area.

<a id="target-scope-and-coordinates"></a>
## Target scope and parent coordinates

Before you write, prepare a compact target manifest: the confirmed document UUID, the page or spread, each node's identity, a short content or name label, the parent chain, the semantic role, and the reason nearby non-targets are excluded. Match roles against the brief and the hierarchy; uppercase text, node type, size or an object count alone does not identify body text. For example, an uppercase `ELISA` heading and an uppercase running header need different roles, and text attached under a Logo or embedded-content parent must not go through a generic artistic-to-frame conversion. Ask about a role only when the existing brief and document cannot settle it.

Treat the manifest as the allowlist of objects you may change. Keep logos, decorative headings, embedded content, shared masters and pages outside the scope excluded unless the user explicitly asks for them. Recheck membership after insertion or reparenting; a correct total count does not prove that the right objects changed. Snapshot the protected neighbors and parents as well as the targets, so you can detect effects that travel through a shared parent or a linked story.

Compare geometry only in a named, common coordinate system. Establish each bound's native coordinate space from the current SDK documentation. For local bounds, use the complete local-to-spread transform, including every parent scale, rotation and translation (for glyph measurement, `baseToSpreadTransform`, within the build and sample limits of [the verified text recipe](sdk-verified.md#text-alignment-workflow)). Do not copy local x, y, width and height into a new parent's space. If reparenting requires mapping spread coordinates into the destination parent, use a documented inverse or composition that has been verified on a sample, in the correct order, and stop if a transform is null, non-finite, singular or otherwise unusable. Do not multiply font size or coordinates by a guessed parent scale. For a rotated or skewed local rectangle, transform all four corners to get its axis-aligned spread bounds; content geometry may need a different measurement from frame bounds.

Before a proposed conversion or reparenting, sample the cases that matter for the task: a nested scaled object, a fragmented-text case and a nearby non-body heading or Logo. Record the text and line breaks, the runs, the font heights and text scale, the parent chain and the visible spread bounds, before and after. Inspect the line wrapping and the non-targets. Do not delete the source until the replacement passes. Arbitrary artistic-to-frame conversion that preserves all formatting and reflow is unverified; a usable node factory does not establish it.

When you use `AddChildNodesCommandBuilder`, take the inserted nodes from [`command.newNodes`](sdk-verified.md#nodes-and-text) and match their actual identity, parent, type and content or geometry against the definitions you intended. Never assume that the returned array is in the same order as the definition array. If the results are missing or ambiguous, inspect a scoped before/after difference in child identity, using an identity-comparison route that the current SDK documents and that has been verified on a sample, and check each candidate's content and parent. Do not fall back to `children.last` or a guessed index. If there is no reliable identity route, or the matches stay ambiguous, stop expanding. Apply [the sample gate](#representative-layout-gate) before bulk writes, and keep object-level evidence of any mismatch.

<a id="representative-layout-gate"></a>
## Representative layout gate

Before bulk text or layout edits, establish [the semantic target allowlist and common coordinates](#target-scope-and-coordinates). Then decide which alignment target applies: object or frame bounds, the complete glyph ink, a Chinese body with punctuation excluded, the visual center of a numeric body, or a shared baseline. These are different acceptance criteria. For multiline centering, paragraph layout and block positioning may both be required; use [the text workflow](sdk-verified.md#text-alignment-workflow).

1. Capture an object-level baseline. Record target identities and hierarchy; full text and line breaks; character and paragraph attribute runs; font heights; the values in the text render and UI scale matrices; frame and content bounds in a named coordinate system; visibility and clipping; and the constraints imposed by neighbors. Include non-target objects that a shared parent or story could affect. Keep the baseline recoverable until the change is accepted.
2. Choose the smallest sample that covers the differences in this task: plain numbers; numbers with descending units such as `μg/mg`; Chinese and long English in narrow columns; multiline text; mixed font and size runs; or nested objects. For Chinese edge or center alignment, include opening and closing `「」（）` and trailing `。，` where relevant, and check the [intended body and hanging rules](sdk-verified.md#optical-alignment-and-punctuation). A plain number does not validate a cell that carries units, and a complete ink box can be pulled down by descenders even when the numeric body should look centered. Do not apply one universal optical offset across fonts and sizes.
3. Apply the proposed edit to those samples only. Compare the intended text and runs, the physical font size and text scaling, the frame and content geometry, the visible final lines and any overlap with neighbors against the baseline. Story completeness and visible fit are separate checks: text you cannot see does not prove that it was permanently deleted, and a complete Story does not prove that nothing overflows. Check the actual paragraph mode, line layout and block position where they apply.
4. Render the samples and the details that matter. SDK geometry determines positions; renders check appearance, not exact coordinates. If success depends on the user's visual judgment, show the concrete samples and wait for approval before applying the edit in bulk. If an equivalent sample and tolerance were already accepted, reuse them instead of asking again. A numerical pass cannot overrule a user's rejection.
5. Stop expanding if a sample is rejected, exceeds the agreed tolerance, changes protected formatting, loses visibility or changes non-target objects. Find the cause and revise the sample first. Once the sample is accepted, apply bounded batches, read back the required state of every affected target and render representative examples; a passing sample does not validate the whole batch by itself.

Rollback must use known history boundaries or a verified state-restoration route. Commands can coalesce into fewer history entries, so one script is not necessarily one undo. Read back the restored content, attributes, hierarchy and geometry. If the rollback boundary is ambiguous, stop and preserve the evidence; do not undo earlier user work, and do not compensate with an opposite translation. This checklist does not establish automatic fitting, arbitrary text conversion or format preservation.

## Completion evidence

For export implementation, `/document` exposes `Document.export(path, exportOptions, exportArea, size)`, `FileExportOptions.allPresetNames` and `createWithPresetName()`, and export areas for spreads, pages, artboards, selections and selection areas. The [file/export workflow](sdk-verified.md#verified-file-and-export-workflow) records the **2026-10-21** sample with five synchronous formats and async PNG on CurrentSpread. The [2026-10-22 extension](sdk-verified.md#extended-file-and-layout-workflow) separately verifies transparent text, async PNG on CurrentPage, two-page and selected-page PDF, and an explicit Size. That extension's default PNG and PDF-for-print still left out the requested outer region. In the **2026-10-20** [poster](scripting-pitfalls.md#single-call-preview) sample, `createForSelection` covered the exact native Bleed bounds only when the selection had been verified to contain all content and a background; `createForSelectionArea` was not equivalent. Untested presets and scopes, and arbitrary bleed geometry, remain unverified. Inspect the live docs and the actual settings and output; do not invent an `includeBleed` setter, and do not infer completeness from the name of a print preset.

`isVisibleInExport` is read-only: assigning to it neither throws nor has any effect. To hide a node for an export, use `createSetVisibility` instead. Capture the previous visibility and restore it in the same script, read it back after restoring, tell the user that the document changed temporarily, and do not save while a node is hidden. Hide nodes only when the user asked to exclude them, and switch the spread first if the node is outside the current spread. If a script times out or is interrupted, restore visibility before anything is saved. A translucent overlay is associated with exports that mix rasterized and sharp vector regions; a transparent-capable export preset is thought to avoid it, but that is not established. See [Scripting practice and runtime limits](scripting-pitfalls.md).

Before reporting a change complete:

1. Read back the actual geometry, the native Margins values and enabled state, and the Bleed values for every affected scope, including inherited values. Distinguish defaults from overrides, and confirm that any temporary change, such as a lock or a hidden node, has been restored.
2. Check every affected panel for content safety, overflow and background coverage, then inspect the rendered spreads and any detail views you need. Export previews normally leave guides out, so missing guides do not prove that Margins were disabled. For a verified rectangular scope, use the separate [inspection preview](inspection-preview.md) to show full Bleed, Trim and the enabled Margin without adding objects to the project; keep the clean image and the actual-bounds checks.
3. If the user asked for an export, verify the actual output at the requested page or spread scope. For a PDF, inspect the trim, bleed and media boxes as applicable, and render the result. For a raster file, inspect the pixels and the resolution. Export boxes alone cannot prove the native document configuration.
4. Save only within the requested workflow, and verify that the save succeeded. Report the trim size, the bleed, the Margins state and the export size separately, and name anything that is still unverified. A correct export does not stand in for a native-document edit the user asked for.

## Sources

- [Affinity Publisher: Margins](https://affinity.help/publisher2/English.lproj/pages/DesignAids/margins.html): guides, master inheritance and visibility controls.
- [Affinity Designer: Document setup](https://s3-eu-west-1.amazonaws.com/affinity-docs/help/designer/en-US.lproj/pages/GetStarted/DocumentSetup.html): separate dimensions, Margins and Bleed settings.

These help pages establish the concepts. Their older UI paths do not establish what the current Affinity by Canva SDK supports; use the live SDK documentation for implementation.
