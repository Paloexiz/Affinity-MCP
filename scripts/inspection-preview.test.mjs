import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createInspectionPreview } from '../skills/affinity-mcp/scripts/inspection-preview.mjs';

const png = readFileSync(new URL('../assets/sdk-evidence/poster-selection-bleed.png', import.meta.url));
const geometry = JSON.parse(readFileSync(new URL('../assets/sdk-evidence/poster-inspection-geometry.json', import.meta.url), 'utf8'));

test('full Bleed is embedded unchanged and asymmetric trim/margin coordinates are mapped', () => {
  const svg = createInspectionPreview(png, geometry);
  assert(svg.includes('x="32" y="110" width="600" height="800"'));
  assert(svg.includes('x="56" y="138" width="544" height="736"'));
  const embedded = svg.match(/href="data:image\/png;base64,([^"]+)"/)[1];
  assert.deepEqual(Buffer.from(embedded, 'base64'), png);
  const shifted = structuredClone(geometry);
  for (const b of [shifted.exportBounds, shifted.bleedBounds, shifted.trimBounds, shifted.margin.bounds]) {
    b.x += 125; b.y -= 70;
  }
  assert.equal(createInspectionPreview(png, shifted), svg);
  const scaled = structuredClone(geometry);
  for (const b of [scaled.exportBounds, scaled.bleedBounds, scaled.trimBounds, scaled.margin.bounds]) {
    for (const k of ['x', 'y', 'width', 'height']) b[k] /= 2;
  }
  assert(createInspectionPreview(png, scaled).includes('x="56" y="138" width="544" height="736"'));
});

test('disabled margins do not become a fictitious safe frame; invalid inputs fail closed', () => {
  const disabled = structuredClone(geometry);
  disabled.margin = { enabled: false, bounds: null };
  assert(!createInspectionPreview(png, disabled).includes('id="margin-outline"'));
  for (const mutate of [
    g => { g.imageSha256 = 'wrong'; },
    g => { g.coordinateSpace = 'millimetres'; },
    g => { delete g.margin.enabled; },
    g => { g.exportBounds.width = 600; },
    g => { g.margin.bounds.x = -1; },
    g => { g.trimBounds.width = NaN; },
    g => { g.bleedBounds.height = g.exportBounds.height = 900; },
  ]) {
    const invalid = structuredClone(geometry); mutate(invalid);
    assert.throws(() => createInspectionPreview(png, invalid));
  }
  assert.throws(() => createInspectionPreview(Buffer.from('not a PNG'), geometry));
});

test('transparent negative fixture stays intact above an explicit checkerboard backdrop', () => {
  const transparent = readFileSync(new URL('../assets/sdk-evidence/poster-inspection-negative-clean.png', import.meta.url));
  const negativeGeometry = JSON.parse(readFileSync(new URL('../assets/sdk-evidence/poster-inspection-negative-geometry.json', import.meta.url), 'utf8'));
  const svg = createInspectionPreview(transparent, negativeGeometry);
  assert(svg.includes('checkerboard = transparency'));
  const backdrop = svg.indexOf('fill="url(#transparency-grid)"');
  assert(backdrop > 0 && backdrop < svg.indexOf('<image id="source-preview"'));
  const embedded = svg.match(/href="data:image\/png;base64,([^"]+)"/)[1];
  assert.deepEqual(Buffer.from(embedded, 'base64'), transparent);
});

test('CLI writes a standalone SVG, rejects overwrite and import has no side effects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-agent-inspection-test- 中文 '));
  try {
    writeFileSync(join(dir, 'clean.png'), png);
    writeFileSync(join(dir, 'geometry.json'), JSON.stringify(geometry));
    const entry = new URL('../skills/affinity-mcp/scripts/inspection-preview.mjs', import.meta.url);
    const args = [fileURLToPath(entry), join(dir, 'clean.png'), join(dir, 'geometry.json'), join(dir, 'check.svg')];
    const run = () => spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const saved = readFileSync(join(dir, 'check.svg'));
    const second = run(); assert.equal(second.status, 1); assert.match(second.stderr, /OUTPUT_ALREADY_EXISTS/);
    assert.deepEqual(readFileSync(join(dir, 'check.svg')), saved);
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(entry.href)})`], { encoding: 'utf8' });
    assert.equal(imported.status, 0); assert.equal(imported.stdout, ''); assert.equal(imported.stderr, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
