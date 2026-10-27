# Inspection preview with Bleed, Trim and Margin

Use this procedure to check edge coverage or the safety of essential content. Produce a clean, complete-Bleed PNG and a separate annotated inspection image. The outlines in the annotated image are diagnostic overlays only. They are not document objects, native guides or printer marks; do not add them to the project or to a delivery export.

## Bind image and geometry

1. Guard the intended document UUID and page or artboard scope, and read the actual native settings together with the [common-coordinate geometry](page-geometry.md#read-and-apply-the-correct-native-setting). Use a single **axis-aligned rectangular target**. Other page arrangements, rotated artboards and inheritance modes each need their own verified mapping.
2. Export the complete configured Bleed, using a scope that has been verified for that target. The [complete-selection recipe](scripting-pitfalls.md#single-call-preview) is conditional, and default renders can leave Bleed out. Preserve the state and selection, and clean up temporary files. Never pad a trim-only image to make it look as if it includes missing artwork, and never add document objects just to force an export size.
3. Capture the trim, the effective enabled Margin box, the outer Bleed and the actual export bounds in the **same spread document-pixel coordinate system, and from the same unchanged state, as the PNG**. Keep the document and scope identity with the private capture record. Unknown native settings stay unknown: do not substitute creation defaults, content bounds or a guessed safe frame. Bleed extents support the geometry, but they do not replace checking the native settings.
4. Decode the complete PNG and verify its scope, dimensions and required edge content. Bind its exact bytes to the geometry record with SHA-256. A matching hash shows that the files were not mixed up, but it cannot prove that the supplied geometry came from the right document. Finish that provenance check before you use the helper.

This is the shape of the geometry JSON for the local helper. The numbers are an example, never defaults:

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

`margin.enabled` must be known. When Margins are disabled, use `bounds: null`; the helper then labels them disabled and draws no safe frame. If you agreed on a separate safety clearance, check it on its own terms instead of labeling it as the native Margin. When Margins are enabled, use the effective native box, including the applicable origin and overrides.

## Generate and inspect

The bundled [inspection helper](../scripts/inspection-preview.mjs) uses Node.js built-ins and embeds the PNG bytes, unchanged, in a standalone SVG. It does not connect to Affinity, modify the source PNG, register an MCP tool or change the proxy. Run from the Skill directory, and use unique task-owned paths in an authorized local working directory:

```sh
node scripts/inspection-preview.mjs clean.png geometry.json inspection.svg
```

The helper rejects an image-hash mismatch, an unknown Margin enabled state, invalid boxes, export bounds that differ from the verified Bleed, and an inconsistent raster aspect ratio. It maps `(x - export.x) × imageWidth / export.width`, with the equivalent expression for Y, so nonzero origins, asymmetric insets and export scaling are preserved. This is a rectangular mapping, not reconstruction of an arbitrary transform. Its PNG header check is not a decoder, so a successful SVG does not replace the pixel validation above or a successful downstream render.

Open or render the SVG with a trusted local renderer that is already available. If the host accepts only PNG images, rasterize the SVG locally and explicitly deliver that complete PNG to the Agent together with the clean preview. Check that the embedded image rendered, that all four Bleed edges and both frames are present, that the labels are readable and that nothing was unexpectedly cropped or rescaled. If no renderer is available, report that; do not install one, and do not claim to have visually inspected a text-only SVG. This extra rendering cost is not part of the earlier single-call PNG performance measurements.

- **Orange outer boundary:** the full exported Bleed. Check background coverage through this edge.
- **Checkerboard inside the image:** transparency in the source PNG. If the background is meant to be full-bleed, check whether the checkerboard reveals missing coverage; in other artwork the transparency may be intentional. A solid inspection backdrop can hide a transparent gap, so keep the checkerboard when you render.
- **Magenta solid rectangle:** the Trim, or finished, edge.
- **Cyan dashed rectangle:** the enabled Margin, the guide for essential content.

Use the marked image to find possible crossings, then compare the actual visible bounds of each required text, logo or code, and its applicable clearance, numerically in the same coordinate system. Backgrounds and deliberate decoration may cross Margin and Trim. Respect approved exceptions; a Margin guide is not a universal clipping rule. Strokes, overflow, masks and QR quiet zones may need additional checks. Keep the clean preview available, because the guide strokes hide a few pixels at the boundaries.

Finish only when you have verified the image and geometry identity and scope, and actually inspected both the clean and the marked image. Also check the required content against its safety rule, and confirm that the annotation left the original document and state unchanged. An annotated preview supports your judgment; it is not automatic print certification.
