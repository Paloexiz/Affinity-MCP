# Page geometry and print verification

Use this reference for posters, flyers, covers, new layouts or redesigns as well as native Affinity dimensions, Margins, Bleed, folding and print export. Read the existing project's geometry before composing artwork even when the user did not name these settings. This describes the checks to perform, not a prevalidated script or a fixed print specification.

## Poster and artwork preflight

Identify the intended page/artboard and read its actual trim, per-side Bleed and Margins, enabled/use state and applicable overrides or master inheritance. Preserve the project's settings unless changes are authorized; hidden guides do not mean disabled margins. For a new document, use the agreed brief/print requirements and verify the created state rather than importing another project's defaults. If required native readback is unavailable, report that exact setting as unknown instead of silently assuming zero or claiming the layout is print-ready.

Use configured enabled Margins as the initial placement guide for essential copy, logos and codes; respect the agreed print-safety requirement and any explicitly approved exceptions. Margins are not a clipping boundary. Extend backgrounds or imagery intended to print to the trim edge through the configured Bleed, while keeping essential content separate. Record the verified trim, safe-content area and outer bleed area before choosing positions; check them again after layout changes. Do not disable margins or remove bleed merely to make the composition fit.

## Establish the geometry before changing it

Reuse the latest agreed requirements and read the actual target document. Identify it by session UUID and name/path; an open file in another application is not the requested Affinity document. State dimensions as **width × height**, with units and orientation.

Keep these quantities separate:

| Quantity | Meaning | Evidence to read |
| --- | --- | --- |
| Page/artboard trim | Finished boundary of one page or artboard | Actual page/artboard geometry, not only document defaults |
| Spread trim | Combined boundary of the arranged pages | Actual spread extents excluding bleed and children |
| Margins | Inward guides for layout; do not enlarge export size or clip objects | Per-side distances, enabled state, overrides and master inheritance |
| Bleed | Extension outside trim for artwork that will be cut | Native per-side bleed settings plus resulting outer extents |
| Export bounds | Region actually exported | Pages vs spreads vs selection, bleed inclusion in the export settings/preset, scale and actual output dimensions |

Distinguish page size, spread size and size including bleed when the user says “document size.” Resolve conflicts from the current document and prior choices; ask only if the intended target remains ambiguous. Do not use bleed to make up a missing trim dimension.

For a rectangular trim area `W × H`, with left/right/top/bottom distances:

- Margin guide area: `(W - mL - mR) × (H - mT - mB)`; trim remains `W × H`.
- Bounds including bleed, before printer marks or export scaling: `(W + bL + bR) × (H + bT + bB)`.
- Four sides of 5 mm mean 10 mm added to each dimension for bleed, or 10 mm removed from each dimension for the margin guide area—not 5 mm in total.

Examples (arithmetic only, not recommended defaults):

| Trim, width × height | Margins | Bleed | Trim export | Export including bleed |
| --- | --- | --- | --- | --- |
| 280 × 205 mm | 5 mm each side | 0 | 280 × 205 mm | 280 × 205 mm |
| 210 × 148 mm | disabled | 5 mm each side | 210 × 148 mm | 220 × 158 mm |

Read SDK units before converting. Prefer `document.unitValueConverter.getConversionFactor(from, to)` from `/units`, using the live SDK's unit enum values. If constructing a `UnitValueConverter` explicitly, verify the getter names: the document exposes `Document.viewdpi`, while the converter uses `viewDpi`.

**`addGuide` units:** the `pixels96` parameter name is misleading—pass document pixels at the document's DPI (300 in a 300-DPI document gives 25.4 mm), not fixed 96-DPI pixels (which would give 79.375 mm). Convert with `document.unitValueConverter.getConversionFactor(UnitType.Millimetre, UnitType.Pixel)` instead of hardcoding 96; whether `dpi` or `viewdpi` drives the scaling is not established, so verify the placement. The live `/examples/addGuides.js` passes spread-space object bounds directly to the guide command, and enum naming differs between sources (`UnitType.Millimetre` in that example, `UnitType.Millimetres` in `tests/documenttests.js`)—confirm the member against the live enum. Different document/view DPI combinations and `moveGuide()` are untested, no guide-position readback was found in the SDK, and a command-success flag proves neither the placement nor the Margins enabled state.

Only use `mm × dpi / 25.4` for coordinates documented as document pixels; do not assume screen pixels, points, document DPI and view DPI are interchangeable. A raster's `pixels × 25.4 / export_dpi` checks its physical size at that resolution, not its native Margins or Bleed settings. Allow pixel rounding when comparing raster exports.

## Read and apply the correct native setting

Read the live SDK preamble and relevant topics before scripting. Discover topics for document properties, spreads/pages, margins, page boxes and export. Search hints if units, field ordering or scope are unclear. Similar names are not proof of equivalent behavior.

Treat the following names as **static lookup leads**; confirm each against the live SDK and the actual document:

- `NewDocumentOptions.margins` and `marginsEnabled`: creation options, not evidence of the current document's state.
- `DocumentProperties.margin`, `includeMargins` and `bleed`: distinct lookup leads. The 2026-10-20 wrapper marks `margin` and `includeMargins` deprecated and stores them only on the options object; they are not a native margin-state setter/readback. `bleed` remains native on the property object, but a route from the active document to that object was not found in the inspected surface.
- `SpreadDocumentProperties` extends `ArtboardDocumentProperties`, inheriting `margin` and `useMargin`; it also exposes `useMasterMargin`. These property objects describe changes, not proof of the live spread's state.
- For an actual `ArtboardInterface`, follow `artboardProperties.marginsInterface.margins`, `useMargins` and `hasMargins`. On 3.3.1.4940 MacOS, observed 2026-10-20, `ArtboardInterface.marginBox` computes its effective box in **spread coordinates** from `spreadBaseBox` and enabled margins. The older `artboardProperties.getMarginBox(behaviour)` / `EffectiveMarginBehaviour` recipe below is a separate historical lookup lead; do not assume the live wrapper exports it. `hasMargins` is not the enabled flag, and an artboard path does not cover every Layout page/spread or inheritance mode.
- `getSpreadExtents({ includeSpread: true, includeBleed: false, includeChildren: false })` versus the same query with `includeBleed: true`: geometric corroboration, not a replacement for reading native settings.

Verify each field's current semantics, units and accepted struct shape. Apply changes through the documented document command, then read the actual target again; reading a newly constructed options object only confirms your inputs. A script's literal `marginsDisabled: true` is also not a native-state readback, even if the tool succeeds. Avoid applying default-filled property objects that reset unrelated settings. If the SDK cannot read or change a required setting, report that exact gap rather than claiming success from matching geometry.

Historical margin sample, with incomplete per-case build metadata: applying `ArtboardDocumentProperties` through `setArtboardDocumentProperties` and reading the then-available native interfaces:

| Requested margin state | `useMargins` | `hasMargins` | `getMarginBox(PageBoxIfDisabled)` |
| --- | --- | --- | --- |
| Enabled, L/T/R/B = 10/20/30/40 | true | true | local `(10, 20)`, 560 × 640 |
| Disabled, same supplied values | false | false | local `(0, 0)`, 600 × 700 |
| Enabled, all zero | true | false | local `(0, 0)`, 600 × 700 |

That historical `getMarginBox` result was **artboard-local**, unlike the spread-coordinate `ArtboardInterface.marginBox` above. `hasMargins` was not the enabled flag. Applying margins left the artboard's position and dimensions unchanged. This covered an actual artboard, not Layout spread/master inheritance or view visibility; an ordinary rectangle's artboard-properties path returned `DISPOSED`, and stored disabled distances were not readable in that sample. The historical converter case covered both millimetre/pixel directions; recheck the target wrapper and units.

Handle Margin state explicitly:

- **Hide guides** changes view visibility; it does not disable configured margins. No visibility operation is runtime-verified here. Find a documented view operation separately; guide creation/movement and `useMargins` are not substitutes. If unavailable, report the view-control gap.
- **Disable Margins** changes the applicable enabled/use setting. Check page/spread overrides and inherited master margins that could keep them active. Do not alter a shared master and unrelated pages just to change one target.
- **Set values to zero** changes the distances; it does not by itself prove the enabled setting is off.

Use the user's context to distinguish these requests. Preserve margin values when merely disabling or hiding them unless a reset is requested. Bleed and Margins can coexist; enabling bleed does not authorize removing margins. Hiding guides or disabling Margins still leaves any agreed content safety distances in effect.

## Refit content and folded layouts

For Layout brochures, preserve the intended native page/spread arrangement. Do not substitute Vector artboards or a flattened external mockup for a requested Layout document.

Use the print provider's fold template or the user's specified panel widths. For a roll fold, do not assume equal widths or a universal outside/inside page order. Record each panel's role, width and fold position; their widths must sum to the spread trim width. A fold is not an extra outer bleed strip: do not sum every panel's bleed to calculate a spread export.

After resizing or moving folds, recalculate the safe area for **each panel**, accounting for outer edges and fold clearances. Transform object bounds into the same page/spread coordinate system before comparing. For a local page origin `(0, 0)`, a required safe area is `[mL, mT, W - mR, H - mB]`; include the actual origin for offset pages. Respect inside/outside margins on facing pages.

When a user reports excessive edge whitespace, locate the trim and bleed boundaries before changing artwork: uncovered external bleed and excessive internal content inset are different problems. Measure content inset from trim or folds, not the outer bleed edge; do not add the bleed width again as inward padding. Tighten excessive whitespace without removing the agreed safety clearance or treating a previous brochure's inset as a default.

Check visible text, table contents and borders, logos, QR codes (including their quiet zones), headers and footers against the agreed safety constraints. Frame bounds alone do not prove text fits: check overflow, clipping, strokes and visible content. Reflow or reposition as needed; do not silently remove copy or shrink type below an agreed size. Uniform group scaling alone does not establish a successful reflow: recheck physical type and QR sizes, spacing and panel balance. When copy must be preserved, compare text and table entries before and after, not just object counts. If margins are merely body-layout guides, deliberate headers/footers outside them are not automatically defects—verify against the actual print safety requirement.

Treat full-bleed backgrounds and decorative imagery separately from essential content. Extend required backgrounds to the external bleed edge, check fold joins for gaps, and recheck watermark position/visibility and panel centering after transforms. Do not force backgrounds into the text safe area.

<a id="target-scope-and-coordinates"></a>
## Target scope and parent coordinates

Before writing, prepare a compact target manifest: confirmed document UUID, page/spread, node identity, short content/name, parent chain, semantic role and exclusion reason for nearby non-targets. Match role with the brief and hierarchy; uppercase text, node type, size or an object count alone is not a body-text selector. For example, an uppercase `ELISA` heading and an uppercase running header need different roles; text attached beneath a Logo/embedded-content parent must not enter a generic artistic-to-frame conversion. Ask for the unresolved role only when the existing brief and document cannot distinguish it.

Use the manifest as the mutation allowlist. Keep logos, decorative headings, embedded content, shared masters and off-scope pages excluded unless explicitly requested. Recheck membership after insertion/reparenting; a correct total count does not prove the correct objects were changed. Snapshot protected neighbors/parents as well as targets so shared-parent or linked-story effects can be detected.

Compare geometry only in a named common coordinate system. Establish each bound's native coordinate space from current SDK documentation; for local bounds, use the complete local-to-spread transform including all parent scales/rotations/translations (for example `baseToSpreadTransform` for glyph measurement, within [the verified text recipe's build and sample limits](sdk-verified.md#text-alignment-workflow)), rather than copying local x/y/width/height into a new parent's space. If reparenting requires mapping spread coordinates into the destination parent, use a documented and sample-verified inverse/composition in the correct order, and stop on null/non-finite/singular or otherwise unusable transforms. Do not multiply font size or coordinates by a guessed parent scale. A rotated/skewed local rectangle requires transforming all corners for its axis-aligned spread bounds; content geometry may need a different measurement from frame bounds.

For a proposed conversion/reparenting, first sample a nested scaled object, a fragmented-text case and a nearby non-body heading/Logo as relevant to the task. Record text/line breaks, runs, font heights/text scale, parent chain and visible spread bounds before and after, and inspect line wrapping and non-targets. Do not delete the source before the replacement passes. Arbitrary artistic-to-frame conversion preserving all formatting/reflow is unverified; a usable node factory alone does not establish it.

When using `AddChildNodesCommandBuilder`, acquire inserted nodes from [`command.newNodes`](sdk-verified.md#nodes-and-text), then match actual identity, parent, type and content/geometry to the intended definitions. Never assume return-array order matches definition-array order. If results are absent or ambiguous, inspect a scoped before/after child-identity difference using an identity-comparison route documented by the current SDK and verified on a sample, and verify each candidate's content and parent; do not fall back to `children.last` or a guessed index. If no reliable identity route is available or matches remain ambiguous, stop expansion. Apply [the sample gate](#representative-layout-gate) before bulk writes and retain object-level evidence for any mismatch.

<a id="representative-layout-gate"></a>
## Representative layout gate

Before bulk text/layout edits, establish [the semantic target allowlist and common coordinates](#target-scope-and-coordinates), then the intended alignment target: object/frame bounds, complete glyph ink, a Chinese body excluding punctuation, the visual center of a numeric body, or a shared baseline. These are different acceptance criteria. For multiline centering, paragraph layout and block positioning may both be required; use [the text workflow](sdk-verified.md#text-alignment-workflow).

1. Capture an object-level baseline: target identities and hierarchy, full text/line breaks, character and paragraph attribute runs, font heights, text render/UI scale matrix values, frame and content bounds in a named coordinate system, visibility/clipping and neighboring constraints. Include non-target objects likely to be affected by a shared parent or story. Keep the baseline recoverable until acceptance.
2. Choose the smallest set covering the differences in this task: plain numbers, numbers with descending units such as `μg/mg`, Chinese and long English in narrow columns, multiline text, mixed font/size runs, or nested objects. For Chinese edge/center alignment, include opening/closing `「」（）` and trailing `。，` as relevant, checking the [intended body and hanging rules](sdk-verified.md#optical-alignment-and-punctuation). A plain number does not validate a unit-bearing cell; a complete ink box can be pulled downward by descenders even when the numeric body should appear centered. Do not apply a universal optical offset across fonts and sizes.
3. Apply the proposed edit to those samples only. Compare intended text and runs, physical font size/text scaling, frame/content geometry, visible final lines and neighboring overlap against the baseline. Story completeness and visible fit are separate checks: invisible text does not prove permanent deletion, and a complete Story does not prove no overflow. Check the actual paragraph mode, line layout and block position where applicable.
4. Render the samples and necessary details. SDK geometry determines positions; renders check appearance, not precise coordinates. If success requires the user's visual judgment, show the concrete samples and wait for approval before bulk application; reuse an already accepted equivalent sample/tolerance rather than asking again. A numerical pass cannot override a user rejection.
5. Stop expansion if a sample is rejected, exceeds the agreed tolerance, changes protected formatting, loses visibility, or changes non-target objects. Inspect the cause and revise the sample first. After sample acceptance, apply bounded batches and read back every affected target's required state, plus representative renders; sample success alone does not validate the entire batch.

Rollback must use known history boundaries or a verified state-restoration route. Commands may coalesce into fewer history entries; one script is not necessarily one undo. Read back restored content, attributes, hierarchy and geometry. If the rollback boundary is ambiguous, stop and preserve the evidence instead of undoing earlier user work or compensating with an opposite translation. Automatic fitting, arbitrary text conversion and format preservation are not established by this checklist.

## Completion evidence

For export implementation, `/document` exposes `Document.export(path, exportOptions, exportArea, size)`, `FileExportOptions.allPresetNames` / `createWithPresetName()`, and areas for spreads, pages, artboards, selections and selection areas. The **2026-10-21 five-format/async-PNG CurrentSpread sample** is bounded in the [file/export workflow](sdk-verified.md#verified-file-and-export-workflow); it had no Bleed. Historical async PNG/CurrentPage and the **2026-10-20** [complete-selection poster preview](scripting-pitfalls.md#single-call-preview) remain separate. In that poster, default CurrentSpread omitted outer Bleed; `createForSelection` covered the exact native Bleed bounds only with the verified full content/background selection. `createForSelectionArea` was not equivalent. Untested presets/scopes and arbitrary bleed geometry remain unverified. Inspect the live documentation and chosen preset; do not invent an `includeBleed` setter. A successful export does not prove correct scope—inspect the produced files and pixels.

`isVisibleInExport` is read-only: assigning to it neither throws nor takes effect, so hide the node with `createSetVisibility` before exporting instead—capture and restore the previous visibility in the same script, read it back after restoring, tell the user that the document was changed temporarily, and do not save while a node is hidden. Hide nodes only when the user asked to exclude them, switch the spread first if the node is outside the current spread, and if a script times out or is interrupted restore visibility before anything is saved. A translucent overlay is associated with exports that mix rasterized and sharp vector regions; a transparent-capable export preset is believed to avoid it, but that is not established. See [Scripting practice and runtime limits](scripting-pitfalls.md).

Before reporting a change complete:

1. Read back actual geometry and native Margins values/enabled state and Bleed values for every affected scope, including effective inheritance. Distinguish defaults from overrides, and confirm that any temporary change (a lock or a hidden node) has been restored.
2. Check all affected panels for content safety, overflow and background coverage, then inspect rendered spreads and necessary detail views. Export previews normally omit guides, so their absence cannot prove Margins were disabled. For a verified rectangular scope, use the separate [inspection preview](inspection-preview.md) to show full Bleed, Trim and enabled Margin without adding objects to the project; keep the clean image and actual-bounds checks.
3. If export is requested, verify the actual output at the requested page/spread scope. For PDF, inspect trim/bleed/media boxes as applicable and render the result; for raster, inspect pixels and resolution. Export boxes alone cannot prove the native document configuration.
4. Save only within the requested workflow and verify save success. Report trim size, bleed, Margins state and export size separately, naming anything still unverified. A correct export does not substitute for a requested native-document edit.

## Sources

- [Affinity Publisher: Margins](https://affinity.help/publisher2/English.lproj/pages/DesignAids/margins.html): guides, master inheritance and visibility controls.
- [Affinity Designer: Document setup](https://s3-eu-west-1.amazonaws.com/affinity-docs/help/designer/en-US.lproj/pages/GetStarted/DocumentSetup.html): separate dimensions, Margins and Bleed settings.

These help pages establish the concepts; their older UI paths do not establish current Affinity by Canva SDK support. Use live SDK documentation for implementation.
