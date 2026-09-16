import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ARTBOARD_WORLD_H,
  ARTBOARD_WORLD_W,
  BLOCK_COUNT,
  BLOCK_DEPTH,
  BLOCK_SIZE,
  GLYPH_CELLS,
  HERO_ASSET,
  HERO_GLB_URL,
  LAYOUTS,
  STAGE_BOUNDS,
  STAGE_COUNT,
  STAGE_KEYS,
  TOKEN_HEX,
  heroAssetCell,
  heroBlockName,
  heroGeometryScale,
} from '@/components/3d/morph-layouts';

/**
 * Pure-math coverage for the background's baked layouts. No WebGL, no canvas —
 * jsdom has neither, and none of this needs them.
 */

const at = (stage: number, block: number) => stage * BLOCK_COUNT + block;

describe('morph-layouts', () => {
  it('derives 112 blocks from the doubled K glyph', () => {
    expect(BLOCK_COUNT).toBe(112);
    expect(GLYPH_CELLS).toHaveLength(112);
    // 5x7 mask stamped at x-offsets 0 and 6, each cell a 2x2 group.
    expect(Math.min(...GLYPH_CELLS.map((c) => c.gx))).toBe(0);
    expect(Math.max(...GLYPH_CELLS.map((c) => c.gx))).toBe(21);
    expect(Math.max(...GLYPH_CELLS.map((c) => c.gy))).toBe(13);
  });

  it('bakes one entry per block per stage', () => {
    expect(STAGE_KEYS).toEqual(['hero', 'work', 'career', 'process', 'contact']);
    expect(LAYOUTS.position).toHaveLength(STAGE_COUNT * BLOCK_COUNT * 3);
    expect(LAYOUTS.scale).toHaveLength(STAGE_COUNT * BLOCK_COUNT);
    expect(LAYOUTS.alpha).toHaveLength(STAGE_COUNT * BLOCK_COUNT);
    expect(LAYOUTS.color).toHaveLength(STAGE_COUNT * BLOCK_COUNT * 3);
  });

  it('produces finite, in-frame, renderable values everywhere', () => {
    for (let stage = 0; stage < STAGE_COUNT; stage++) {
      for (let i = 0; i < BLOCK_COUNT; i++) {
        const flat = at(stage, i);
        const [x, y, z] = [0, 1, 2].map((axis) => LAYOUTS.position[flat * 3 + axis]);
        expect(Number.isFinite(x + y + z)).toBe(true);
        // Everything stays inside the artboard the camera is framed to.
        expect(Math.abs(x)).toBeLessThanOrEqual(ARTBOARD_WORLD_W / 2);
        expect(Math.abs(y)).toBeLessThanOrEqual(ARTBOARD_WORLD_H / 2);
        expect(LAYOUTS.scale[flat]).toBeGreaterThan(0);
        expect(LAYOUTS.alpha[flat]).toBeGreaterThan(0);
        expect(LAYOUTS.alpha[flat]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('uses only design-token colors', () => {
    // Linear-space triples, so compare against the same conversion the module
    // applies rather than against the hex values directly.
    const toLinear = (c: number) =>
      c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
    const tokens = new Set(
      Object.values(TOKEN_HEX).map((hex) =>
        [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
          .map((channel) => Math.fround(toLinear(channel / 255)).toFixed(4))
          .join(','),
      ),
    );

    for (let flat = 0; flat < STAGE_COUNT * BLOCK_COUNT; flat++) {
      const key = [0, 1, 2].map((c) => LAYOUTS.color[flat * 3 + c].toFixed(4)).join(',');
      expect(tokens.has(key)).toBe(true);
    }
  });

  it('keeps the hero stage flat, opaque and two-toned', () => {
    const limeBlocks = GLYPH_CELLS.filter((c) => c.gx === 12 || c.gx === 13).length;
    expect(limeBlocks).toBeGreaterThan(0);

    for (let i = 0; i < BLOCK_COUNT; i++) {
      expect(LAYOUTS.position[at(0, i) * 3 + 2]).toBe(0);
      expect(LAYOUTS.alpha[at(0, i)]).toBe(1);
      expect(LAYOUTS.scale[at(0, i)]).toBe(1);
    }
  });

  it('puts the career bars on four ascending columns', () => {
    const tops = new Map<number, number>();
    for (let i = 0; i < BLOCK_COUNT; i++) {
      const flat = at(2, i);
      const x = Math.round(LAYOUTS.position[flat * 3] * 100) / 100;
      const y = LAYOUTS.position[flat * 3 + 1];
      const bar = Math.floor((x - STAGE_BOUNDS[2].centerX + 100) / 5.5);
      tops.set(bar, Math.max(tops.get(bar) ?? -Infinity, y));
    }
    const heights = [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, y]) => y);
    // Bars 7, 11, 16 and 22 blocks tall — strictly ascending left to right.
    expect(heights).toHaveLength(4);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]);
  });

  it('spreads the process stage across three depth layers', () => {
    const depths = new Set<number>();
    for (let i = 0; i < BLOCK_COUNT; i++) depths.add(LAYOUTS.position[at(3, i) * 3 + 2]);
    expect(depths.size).toBe(3);
  });

  it('recedes the contact floor toward the viewer as it drops', () => {
    let lowest = Infinity;
    let nearest = -Infinity;
    for (let i = 0; i < BLOCK_COUNT; i++) {
      const flat = at(4, i);
      const y = LAYOUTS.position[flat * 3 + 1];
      const z = LAYOUTS.position[flat * 3 + 2];
      if (y < lowest) lowest = y;
      if (z > nearest) nearest = z;
    }
    expect(lowest).toBeLessThan(0);
    expect(nearest).toBeGreaterThan(0);
    // Fades into the distance: nothing on the floor is fully opaque.
    for (let i = 0; i < BLOCK_COUNT; i++) expect(LAYOUTS.alpha[at(4, i)]).toBeLessThan(0.6);
  });

  it('reports per-stage bounds that contain every block', () => {
    expect(STAGE_BOUNDS).toHaveLength(STAGE_COUNT);
    for (let stage = 0; stage < STAGE_COUNT; stage++) {
      const bounds = STAGE_BOUNDS[stage];
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      for (let i = 0; i < BLOCK_COUNT; i++) {
        const flat = at(stage, i);
        expect(Math.abs(LAYOUTS.position[flat * 3] - bounds.centerX)).toBeLessThanOrEqual(
          bounds.width / 2,
        );
        expect(Math.abs(LAYOUTS.position[flat * 3 + 1] - bounds.centerY)).toBeLessThanOrEqual(
          bounds.height / 2,
        );
      }
    }
  });
});

/**
 * The runtime instances the block out of `public/models/hero.glb`, but keeps
 * taking positions from the layouts above. That only works while the asset's
 * index order and this file's index order are the same order, and the two were
 * written independently from the same mask — so rather than trust that, parse
 * the committed GLB and check it, block by block.
 *
 * Pure container parsing and arithmetic: no WebGL, no loader, nothing jsdom
 * cannot do. The GLB's own JSON chunk carries the node translations and the
 * mesh's POSITION accessor bounds, which is everything asserted here.
 */
function readHeroGlb(): {
  nodes: { name?: string; mesh?: number; translation?: number[] }[];
  meshes: { primitives: { material?: number }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
} {
  // `HERO_GLB_URL` is the browser path; `public/` is its root on disk.
  const file = path.join(process.cwd(), 'public', HERO_GLB_URL.replace(/^\//, ''));
  const buffer = readFileSync(file);

  expect(buffer.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) return JSON.parse(buffer.subarray(start, start + length).toString());
    offset = start + length + ((4 - (length % 4)) % 4); // chunks are 4-byte aligned
  }
  throw new Error('hero.glb has no JSON chunk');
}

describe('hero.glb contract', () => {
  const gltf = readHeroGlb();
  const parts = gltf.nodes.filter((node) => typeof node.mesh === 'number');

  it('ships one named part per block, contiguous and in order', () => {
    expect(parts).toHaveLength(BLOCK_COUNT);
    expect(HERO_ASSET.blockCount).toBe(BLOCK_COUNT);
    expect(parts.map((node) => node.name)).toEqual(
      Array.from({ length: BLOCK_COUNT }, (_, i) => heroBlockName(i)),
    );
  });

  it('orders its parts exactly as the glyph cells are built', () => {
    // letter -> mask row (top-down) -> mask column -> sub-row -> sub-column.
    // If the asset were ever re-exported in another order, every layout would
    // silently address the wrong block; this is the assertion that catches it.
    parts.forEach((node, i) => {
      const [x, y, z] = node.translation ?? [0, 0, 0];
      expect({ i, ...heroAssetCell(x, y) }).toEqual({ i, ...GLYPH_CELLS[i] });
      // ...and the position is exactly on the grid, not merely nearest to it.
      expect(x).toBeCloseTo(GLYPH_CELLS[i].gx * HERO_ASSET.pitch - HERO_ASSET.halfWidth, 6);
      expect(y).toBeCloseTo(HERO_ASSET.halfHeight - GLYPH_CELLS[i].gy * HERO_ASSET.pitch, 6);
      expect(z).toBe(0); // the glyph is flat in the exported X/Y plane
    });
  });

  it('stays inside the extents the pipeline documents', () => {
    const xs = parts.map((node) => (node.translation ?? [0, 0, 0])[0]);
    const ys = parts.map((node) => (node.translation ?? [0, 0, 0])[1]);
    expect(Math.min(...xs)).toBeCloseTo(-HERO_ASSET.halfWidth, 6);
    expect(Math.max(...xs)).toBeCloseTo(HERO_ASSET.halfWidth, 6);
    expect(Math.min(...ys)).toBeCloseTo(-HERO_ASSET.halfHeight, 6);
    expect(Math.max(...ys)).toBeCloseTo(HERO_ASSET.halfHeight, 6);
  });

  it('keeps every part on one mesh and one material — the single draw call', () => {
    expect(new Set(parts.map((node) => node.mesh)).size).toBe(1);
    const primitives = gltf.meshes[parts[0].mesh as number].primitives;
    expect(primitives).toHaveLength(1);
    expect(new Set(primitives.map((p) => p.material)).size).toBe(1);
  });

  it('scales the asset cube onto the artboard tile', () => {
    // POSITION accessor bounds are the cube's half-extents: a 0.43 cube.
    const [min, max] = [gltf.accessors[0].min ?? [], gltf.accessors[0].max ?? []];
    const size = [0, 1, 2].map((axis) => max[axis] - min[axis]);
    size.forEach((edge) => expect(edge).toBeCloseTo(HERO_ASSET.blockSize, 6));

    const [sx, sy, sz] = heroGeometryScale(size[0], size[1], size[2]);
    expect(size[0] * sx).toBeCloseTo(BLOCK_SIZE, 6);
    expect(size[1] * sy).toBeCloseTo(BLOCK_SIZE, 6);
    expect(size[2] * sz).toBeCloseTo(BLOCK_DEPTH, 6);
  });

  it('falls back to 1 rather than NaN on a degenerate measurement', () => {
    expect(heroGeometryScale(0, Number.NaN, -1)).toEqual([1, 1, 1]);
  });
});
