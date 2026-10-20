import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Geometry must describe this exact PNG's complete, axis-aligned export in spread document pixels.
export function createInspectionPreview(png, geometry) {
  function requireValue(ok, message) {
    if (!ok) throw new Error(message);
  }
  requireValue(Buffer.isBuffer(png) && png.length >= 33 &&
    png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    png.readUInt32BE(8) === 13 && png.toString('ascii', 12, 16) === 'IHDR', 'PNG_HEADER_REQUIRED');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  requireValue(width > 0 && height > 0 && width * height <= 64_000_000, 'PNG_SIZE_OUT_OF_RANGE');
  requireValue(geometry?.coordinateSpace === 'spread-document-pixels', 'COORDINATE_SPACE_REQUIRED');
  requireValue(geometry.imageSha256 === createHash('sha256').update(png).digest('hex'), 'IMAGE_HASH_MISMATCH');
  const { exportBounds, bleedBounds, trimBounds, margin } = geometry;
  function checkBox(box) {
    requireValue(box && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(box[k])) &&
      box.width > 0 && box.height > 0 && Number.isFinite(box.x + box.width) &&
      Number.isFinite(box.y + box.height), 'FINITE_POSITIVE_BOX_REQUIRED');
  }
  [exportBounds, bleedBounds, trimBounds].forEach(checkBox);
  requireValue(['x', 'y', 'width', 'height'].every(k => Math.abs(exportBounds[k] - bleedBounds[k]) <= 1e-6),
    'EXPORT_MUST_MATCH_VERIFIED_BLEED');
  function contains(outer, inner) {
    return inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
      inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
      inner.y + inner.height <= outer.y + outer.height + 1e-6;
  }
  requireValue(contains(bleedBounds, trimBounds), 'BLEED_MUST_CONTAIN_TRIM');
  requireValue(typeof margin?.enabled === 'boolean', 'KNOWN_MARGIN_STATE_REQUIRED');
  if (margin.enabled) {
    checkBox(margin.bounds);
    requireValue(contains(trimBounds, margin.bounds), 'MARGIN_MUST_BE_INSIDE_TRIM');
  } else {
    requireValue(margin.bounds === null, 'DISABLED_MARGIN_REQUIRES_NULL_BOX');
  }
  const sx = width / exportBounds.width, sy = height / exportBounds.height;
  requireValue(Math.abs(width - exportBounds.width * sy) <= 1 &&
    Math.abs(height - exportBounds.height * sx) <= 1, 'RASTER_ASPECT_MISMATCH');
  const left = 24, top = 100, canvasWidth = Math.max(640, width + 48), canvasHeight = height + 160;
  function rect(id, box, colour, dashed = false) {
    const values = `x="${left + (box.x - exportBounds.x) * sx}" y="${top + (box.y - exportBounds.y) * sy}" width="${box.width * sx}" height="${box.height * sy}"`;
    const dash = dashed ? ' stroke-dasharray="6 4"' : '';
    return `<g id="${id}" fill="none"${dash}><rect ${values} stroke="#fff" stroke-width="4"/><rect ${values} stroke="${colour}" stroke-width="1.5"/></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
<title>Inspection preview: full Bleed, Trim and Margin</title>
<rect width="100%" height="100%" fill="#17212b"/>
<g font-family="sans-serif" font-size="14" fill="#fff">
<text x="24" y="22">INSPECTION ONLY — keep the clean PNG for artwork review</text>
<text x="24" y="44" fill="#ff63ae">SOLID: Trim / finished edge</text>
<text x="24" y="64" fill="#00cfe8">${margin.enabled ? 'DASHED: Margin / essential-content guide' : 'Margin disabled: no configured safe-area claim'}</text>
<text x="24" y="84" fill="#ffbe55">OUTER: full Bleed | checkerboard = transparency</text>
</g>
<defs><pattern id="transparency-grid" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fff"/><path d="M0 0h6v6H0zM6 6h6v6H6z" fill="#cbd5e1"/></pattern></defs>
<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#transparency-grid)"/>
<image id="source-preview" x="${left}" y="${top}" width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/>
<g id="inspection-overlay">
${rect('bleed-outline', bleedBounds, '#ffbe55')}
${rect('trim-outline', trimBounds, '#ff63ae')}
${margin.enabled ? rect('margin-outline', margin.bounds, '#00cfe8', true) : ''}
</g>
<g font-family="sans-serif" font-size="13" fill="#fff">
<text x="24" y="${height + 126}">Trim ${trimBounds.width} × ${trimBounds.height} | Bleed ${bleedBounds.width} × ${bleedBounds.height} document px</text>
<text x="24" y="${height + 146}">Guides aid inspection; verify actual content bounds and native settings separately.</text>
</g>
</svg>\n`;
}

if (import.meta.main) {
  try {
    const [input, geometryPath, output, ...extra] = process.argv.slice(2);
    if (!input || !geometryPath || !output || extra.length || !output.endsWith('.svg')) {
      throw new Error('Usage: node inspection-preview.mjs clean.png geometry.json inspection.svg');
    }
    const svg = createInspectionPreview(readFileSync(input), JSON.parse(readFileSync(geometryPath, 'utf8')));
    writeFileSync(output, svg, { encoding: 'utf8', flag: 'wx' });
    console.log('INSPECTION_SVG_CREATED');
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'OUTPUT_ALREADY_EXISTS' : error.message);
    process.exitCode = 1;
  }
}
