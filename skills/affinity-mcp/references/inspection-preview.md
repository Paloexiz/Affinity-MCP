# Inspection preview with Bleed, Trim and Margin

Use this branch when checking edge coverage or essential-content safety. Produce a clean complete-Bleed PNG and a separate annotated inspection image. The lines are diagnostic overlays, not document objects, native guides or printer marks; do not add them to the project or its delivery export.

## Bind image and geometry

1. Guard the intended document UUID and page/artboard scope. Read the actual native settings and [common-coordinate geometry](page-geometry.md#read-and-apply-the-correct-native-setting). Use one **axis-aligned rectangular target**; other page arrangements, rotated artboards and inheritance modes need their own verified mapping.
2. Export the complete configured Bleed through a scope verified for that target. The [complete-selection recipe](scripting-pitfalls.md#single-call-preview) is conditional; default renders can omit Bleed. Preserve state/selection and temporary-file cleanup. Never pad a trim-only image to pretend it includes missing artwork, or add document objects to force an export size.
3. Capture trim, effective enabled Margin box, outer Bleed and actual export bounds in the **same spread document-pixel coordinate system and unchanged state as the PNG**. Retain document/scope identity with the private capture record. Unknown native settings remain unknown: do not substitute creation defaults, content bounds or a guessed safe frame. Bleed extents corroborate geometry but do not replace native settings verification.
4. Decode the complete PNG to verify scope, dimensions and required edge content. Bind its exact bytes to the geometry record with SHA-256. A matching hash prevents mixing files; it cannot prove that supplied geometry came from the right document. Complete that provenance check before using the helper.

The geometry JSON for the local helper has this shape (numbers are an example, never defaults):

```json
{
  "coordinateSpace": "spread-document-pixels",
  "imageSha256": "<SHA-256 of the exact clean PNG bytes>",
  "exportBounds": {"x": -8, "y": -10, "width": 620, "height": 824},
  "bleedBounds": {"x": -8, "y": -10, "width": 620, "height": 824},
  "trimBounds": {"x": 0, "y": 0, "width": 600, "height": 800},
  "margin": {"enabled": true, "bounds": {"x": 24, "y": 28, "width": 544, "height": 736}}
}
```

`margin.enabled` must be known. Disabled Margins require `bounds: null`; the helper then labels them disabled and draws no safe frame. If a separate safety clearance was agreed, check it independently instead of labeling it as the native Margin. With enabled Margins, use the effective native box including applicable origin and overrides.

## Generate and inspect

The bundled [inspection helper](../scripts/inspection-preview.mjs) uses Node.js built-ins and embeds the PNG bytes unchanged in a standalone SVG. It does not connect to Affinity, modify the source PNG, register an MCP tool or alter the proxy. Run from the Skill directory, using unique task-owned paths in an authorized local work directory:

```sh
node scripts/inspection-preview.mjs clean.png geometry.json inspection.svg
```

The helper rejects an image-hash mismatch, unknown Margin enabled state, invalid boxes, export bounds differing from verified Bleed, or an inconsistent raster aspect ratio. It maps `(x - export.x) × imageWidth / export.width` and the equivalent Y expression, so nonzero origins, asymmetric insets and export scaling are retained. This is rectangular mapping, not arbitrary transform reconstruction. Its PNG header check is not a decoder; successful SVG generation does not replace the pixel validation above or successful downstream rendering.

Open/render the SVG using an already available trusted local renderer. If the host accepts only PNG images, rasterize the SVG locally and explicitly deliver that complete PNG to the Agent alongside the clean preview. Verify that the embedded image rendered, all four Bleed edges and both frames are present, labels are readable and no unexpected crop/rescale occurred. Report an unavailable renderer rather than installing one or claiming that a text SVG path was visually inspected. This extra rendering cost is not included in the earlier single-call PNG performance measurements.

- **Orange outer boundary:** full exported Bleed; inspect background coverage through this edge.
- **Checkerboard inside the image:** transparency in the source PNG. For an intended full-bleed background, inspect whether this reveals missing coverage; transparency can be intentional in other artwork. A solid inspection backdrop can hide a transparent gap, so preserve the checkerboard when rendering.
- **Magenta solid rectangle:** Trim / finished edge.
- **Cyan dashed rectangle:** enabled Margin / essential-content guide.

Use the marked image to locate possible crossings, then compare each required text/logo/code's actual visible bounds and applicable clearance numerically in the same coordinate system. Backgrounds and intentional decoration may cross Margin and Trim. Respect approved exceptions; a Margin guide is not a universal clipping rule. Strokes, overflow, masks and QR quiet zones may need additional checks. Keep the clean preview available because guide strokes obscure a few pixels at the boundaries.

Complete only after the image/geometry identity and scope are verified, the clean and marked images are actually inspected, required content is checked against its safety rule, and the original document/state remains unchanged by annotation. An annotated preview aids judgment; it is not automatic print certification or a forced Agent behavior.
