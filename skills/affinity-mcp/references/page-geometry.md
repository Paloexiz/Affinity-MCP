# Page geometry and print verification

Use this reference for native Affinity layout, dimensions, Margins, Bleed, folding or print export. It describes the checks to perform, not a prevalidated script or a fixed print specification.

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
- `DocumentProperties.margin`, `includeMargins` and `bleed`: distinct document properties.
- `SpreadDocumentProperties` extends `ArtboardDocumentProperties`, inheriting `margin` and `useMargin`; it also exposes `useMasterMargin`. These property objects describe changes, not proof of the live spread's state.
- For an actual `ArtboardInterface`, follow `artboardProperties.marginsInterface.useMargins` / `hasMargins`; `artboardProperties.getMarginBox(behaviour)` is the margin-box read lead. `/artboardproperties` exports `EffectiveMarginBehaviour`: read its enum values and semantics before choosing a member. Do not treat `hasMargins` as the enabled flag or assume an artboard path covers every Layout page/spread. Resolve the target's live interface and inheritance first.
- `getSpreadExtents({ includeSpread: true, includeBleed: false, includeChildren: false })` versus the same query with `includeBleed: true`: geometric corroboration, not a replacement for reading native settings.

Verify each field's current semantics, units and accepted struct shape. Apply changes through the documented document command, then read the actual target again; reading a newly constructed options object only confirms your inputs. A script's literal `marginsDisabled: true` is also not a native-state readback, even if the tool succeeds. Avoid applying default-filled property objects that reset unrelated settings. If the SDK cannot read or change a required setting, report that exact gap rather than claiming success from matching geometry.

Applying `ArtboardDocumentProperties` through `setArtboardDocumentProperties` and reading the native interfaces:

| Requested margin state | `useMargins` | `hasMargins` | `getMarginBox(PageBoxIfDisabled)` |
| --- | --- | --- | --- |
| Enabled, L/T/R/B = 10/20/30/40 | true | true | local `(10, 20)`, 560 × 640 |
| Disabled, same supplied values | false | false | local `(0, 0)`, 600 × 700 |
| Enabled, all zero | true | false | local `(0, 0)`, 600 × 700 |

The returned margin box is **artboard-local**, not spread coordinates. `hasMargins` is not the enabled flag. Applying margins leaves the artboard's position and dimensions unchanged. This covers an actual artboard, not Layout spread/master inheritance or view visibility; an ordinary rectangle's artboard-properties path returns `DISPOSED`. The document unit converter converts between millimetres and pixels in both directions. Stored disabled margin distances cannot be read back.

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

## Completion evidence

For export implementation, `/document` exposes `Document.export(path, exportOptions, exportArea, size)`, `FileExportOptions.allPresetNames` / `createWithPresetName()`, and `FileExportArea.createForCurrentSpread()`, `createForCurrentPage()`, `createForArtboard()` and `createForSpreads()` / `createForPages()`. Sync PNG/CurrentSpread and async PNG/CurrentPage are verified; other scopes, presets and bleed behaviour are not. See [Behaviours and limits](sdk-verified.md). Inspect the chosen preset and live documentation; do not invent an `includeBleed` setter on `FileExportOptions`. A successful export call does not prove the scope or bleed is correct—inspect the produced files.

`isVisibleInExport` is read-only: assigning to it neither throws nor takes effect, so hide the node with `createSetVisibility` before exporting instead—capture and restore the previous visibility in the same script, read it back after restoring, tell the user that the document was changed temporarily, and do not save while a node is hidden. Hide nodes only when the user asked to exclude them, switch the spread first if the node is outside the current spread, and if a script times out or is interrupted restore visibility before anything is saved. A translucent overlay is associated with exports that mix rasterized and sharp vector regions; a transparent-capable export preset is believed to avoid it, but that is not established. See [Scripting practice and runtime limits](scripting-pitfalls.md).

Before reporting a change complete:

1. Read back actual geometry and native Margins values/enabled state and Bleed values for every affected scope, including effective inheritance. Distinguish defaults from overrides, and confirm that any temporary change (a lock or a hidden node) has been restored.
2. Check all affected panels for content safety, overflow and background coverage, then inspect rendered spreads and necessary detail views. Export previews normally omit guides, so their absence cannot prove Margins were disabled.
3. If export is requested, verify the actual output at the requested page/spread scope. For PDF, inspect trim/bleed/media boxes as applicable and render the result; for raster, inspect pixels and resolution. Export boxes alone cannot prove the native document configuration.
4. Save only within the requested workflow and verify save success. Report trim size, bleed, Margins state and export size separately, naming anything still unverified. A correct export does not substitute for a requested native-document edit.

## Sources

- [Affinity Publisher: Margins](https://affinity.help/publisher2/English.lproj/pages/DesignAids/margins.html): guides, master inheritance and visibility controls.
- [Affinity Designer: Document setup](https://s3-eu-west-1.amazonaws.com/affinity-docs/help/designer/en-US.lproj/pages/GetStarted/DocumentSetup.html): separate dimensions, Margins and Bleed settings.

These help pages establish the concepts; their older UI paths do not establish current Affinity by Canva SDK support. Use live SDK documentation for implementation.
