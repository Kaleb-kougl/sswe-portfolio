/**
 * morph-layouts — the five arrangements of the scrolling background, baked once.
 *
 * WHAT THIS IS
 * ------------
 * One set of 112 blocks is reused by every section of the page. Each section
 * ("stage") is just a different set of positions/scales/alphas/colors for those
 * same 112 blocks, so scrolling can LERP between adjacent stages instead of
 * swapping meshes.
 *
 *   hero     the letters KK
 *   work     a fibonacci sphere
 *   career   four ascending bars
 *   process  an exploded view in three offset layers
 *   contact  a receding floor plane
 *
 * WHERE THE NUMBERS COME FROM
 * ---------------------------
 * The approved 2D mockup (`Scene.dc.html`, `renderVals()`) already tuned every
 * constant here — glyph mask, golden angle + 0.35rad tilt, bar heights,
 * `(gx+gy) % 3` layering, the `pow(t, 1.5)` floor falloff. Those formulas are
 * ported verbatim; the mockup's 1440x900 artboard pixel coordinates are mapped
 * into world units so the stages keep the composition they were tuned for (KK
 * to the right of the copy, the exploded view to the left, and so on).
 *
 * The three deliberate deviations from the 2D source are marked `3D:` below —
 * each is a place where the mockup faked depth with scale/opacity and the real
 * scene has a Z axis to do it properly.
 *
 * REPRESENTATION
 * --------------
 * Four flat typed arrays, stage-major:
 *
 *   position[(stage * 112 + block) * 3 + axis]
 *   scale   [ stage * 112 + block ]
 *   alpha   [ stage * 112 + block ]
 *   color   [(stage * 112 + block) * 3 + channel]   (linear working space)
 *
 * Flat arrays, not objects: the per-frame morph is a `lerp` over contiguous
 * memory with zero allocation and zero property lookups. Built once at module
 * load (5 * 112 entries ~ 9KB total) and never mutated afterwards.
 *
 * No imports on purpose — this file is pure math and is safe to evaluate
 * anywhere (server, worker, test) without pulling in three.js.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const STAGE_KEYS = ['hero', 'work', 'career', 'process', 'contact'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_COUNT = STAGE_KEYS.length;

/**
 * 5x7 `K` glyph, stamped twice at x-offsets 0 and 6. Each `X` cell expands into
 * a 2x2 group of sub-blocks: 14 cells x 2 letters x 4 = 112 blocks.
 */
const K_GLYPH = ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'] as const;
const LETTER_X_OFFSETS = [0, 6] as const;

export interface GlyphCell {
  /** Column in the doubled glyph grid (0..21). */
  gx: number;
  /** Row in the doubled glyph grid (0..13). */
  gy: number;
}

function buildGlyphCells(): GlyphCell[] {
  const cells: GlyphCell[] = [];
  for (const ox of LETTER_X_OFFSETS) {
    K_GLYPH.forEach((row, ry) => {
      row.split('').forEach((char, rx) => {
        if (char !== 'X') return;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            cells.push({ gx: (ox + rx) * 2 + sx, gy: ry * 2 + sy });
          }
        }
      });
    });
  }
  return cells;
}

/** The block identity shared by all five stages. */
export const GLYPH_CELLS: readonly GlyphCell[] = buildGlyphCells();
export const BLOCK_COUNT = GLYPH_CELLS.length; // 112

// ---------------------------------------------------------------------------
// The baked asset — public/models/hero.glb
// ---------------------------------------------------------------------------

/**
 * Where the exported sculpture is served from. Next serves `public/` at the
 * base URL, so `public/models/hero.glb` is `/models/hero.glb`
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`).
 */
export const HERO_GLB_URL = '/models/hero.glb';

/**
 * The half of `docs/hero-pipeline.md` the runtime depends on. The generator
 * derives all of it from the same mask this file stamps, so the two are two
 * encodings of one design — `__tests__/morph-layouts.test.ts` parses the
 * committed GLB and asserts they still agree, block by block.
 *
 * Geometry arrives upright in the exported X/Y plane, z = 0 for every node,
 * `blockSize` cubes on a `pitch` grid, centred on the origin.
 */
export const HERO_ASSET = {
  /** Named parts: `block_000` .. `block_111`, contiguous and unique. */
  blockCount: 112,
  /** Grid pitch between adjacent sub-blocks, in asset units. */
  pitch: 0.5,
  /** Cube edge, in asset units (`SUB_PITCH * FILL` = 0.5 * 0.86). */
  blockSize: 0.43,
  /** Extents: x in [-5.25, 5.25], y in [-3.25, 3.25]. */
  halfWidth: 5.25,
  halfHeight: 3.25,
} as const;

/** The glTF node name of block `index`, i.e. `block_%03d`. */
export const heroBlockName = (index: number): string =>
  `block_${String(index).padStart(3, '0')}`;

/**
 * Which glyph cell an asset node standing at `(x, y)` occupies.
 *
 * The asset's index order is load-bearing — letter, then mask row top-down,
 * then mask column left-right, then sub-row, then sub-column — and it is the
 * same walk `buildGlyphCells()` performs. This inverts a node's position back
 * to its `(gx, gy)` so the two orderings can be compared directly instead of
 * trusted: asset x grows with gx, asset y grows *downward* with gy.
 */
export function heroAssetCell(x: number, y: number): GlyphCell {
  return {
    gx: Math.round((x + HERO_ASSET.halfWidth) / HERO_ASSET.pitch),
    gy: Math.round((HERO_ASSET.halfHeight - y) / HERO_ASSET.pitch),
  };
}

// ---------------------------------------------------------------------------
// Artboard -> world mapping
// ---------------------------------------------------------------------------

/** The mockup's artboard, in its own pixels. */
const ARTBOARD_W = 1440;
const ARTBOARD_H = 900;
/** Mockup pixels per world unit — the mockup's 20px layout grid is 1 unit. */
const PX_PER_UNIT = 20;

/** Artboard size in world units: the frustum the camera has to cover at z = 0. */
export const ARTBOARD_WORLD_W = ARTBOARD_W / PX_PER_UNIT; // 72
export const ARTBOARD_WORLD_H = ARTBOARD_H / PX_PER_UNIT; // 45

/** A block is the mockup's 16px tile on its 20px grid. */
export const BLOCK_SIZE = 16 / PX_PER_UNIT; // 0.8
/** Shallow, so blocks read as the mockup's flat tiles rather than dice. */
export const BLOCK_DEPTH = 0.3;

/**
 * Factors that seat the asset's cube in the artboard's unit system.
 *
 * The asset is authored on its own grid — a 0.43 cube on a 0.5 pitch — while
 * these layouts place blocks on the mockup's 20px grid mapped to 1 world unit.
 * Positions come from the layouts, so the geometry is the side that has to
 * move: one non-uniform scale, baked into the geometry once at load, leaves the
 * asset's vertices drawing exactly the tile the mockup was composed around
 * (0.8 x 0.8 face, `BLOCK_DEPTH` deep — flat tiles, not dice).
 *
 * Sizes are measured from the loaded bounding box rather than assumed, so a
 * re-export at a different `FILL` still lands correctly; a degenerate axis
 * falls back to 1 instead of producing a NaN matrix.
 */
export function heroGeometryScale(
  width: number,
  height: number,
  depth: number,
): readonly [number, number, number] {
  const factor = (target: number, measured: number) =>
    Number.isFinite(measured) && measured > 0 ? target / measured : 1;
  return [
    factor(BLOCK_SIZE, width),
    factor(BLOCK_SIZE, height),
    factor(BLOCK_DEPTH, depth),
  ];
}

const worldX = (px: number) => (px - ARTBOARD_W / 2) / PX_PER_UNIT;
const worldY = (py: number) => (ARTBOARD_H / 2 - py) / PX_PER_UNIT; // artboard Y is down
const worldZ = (pz: number) => pz / PX_PER_UNIT;

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/**
 * Design token hex values (see `globals.css` / `colors.ts`).
 * `ink #161310 · lime #BFF03A · cta orange #FF5E1A · link blue #1F3BE0`.
 */
export const TOKEN_HEX = {
  ink: 0x161310,
  lime: 0xbff03a,
  orange: 0xff5e1a,
  blue: 0x1f3be0,
} as const;

/**
 * sRGB -> linear, the same transfer function three.js applies in
 * `SRGBToLinear`. `instanceColor` is consumed in the renderer's working
 * (linear) color space, so the tokens are converted once here instead of
 * constructing 560 `THREE.Color` objects.
 */
function srgbToLinear(channel: number): number {
  return channel < 0.04045 ? channel * 0.0773993808 : Math.pow(channel * 0.9478672986 + 0.0521327014, 2.4);
}

function toLinearRGB(hex: number): readonly [number, number, number] {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

const RGB = {
  ink: toLinearRGB(TOKEN_HEX.ink),
  lime: toLinearRGB(TOKEN_HEX.lime),
  orange: toLinearRGB(TOKEN_HEX.orange),
  blue: toLinearRGB(TOKEN_HEX.blue),
} as const;

type LinearRGB = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Stage tuning that only exists in 3D
// ---------------------------------------------------------------------------

/** Radius of the fibonacci sphere, in artboard px (mockup value). */
const SPHERE_RADIUS_PX = 230;
/**
 * 3D: the mockup sold sphere depth with `scale = 0.5 + 0.45 * d` because it had
 * no Z. Here Z is real and perspective already does most of that work, so the
 * scale ramp is damped to keep the combined front/back ratio near the mockup's.
 */
const SPHERE_SCALE_BASE = 0.65;
const SPHERE_SCALE_RANGE = 0.3;

/** 3D: the exploded layers are pulled apart along Z as well as on screen. */
const PROCESS_LAYER_DEPTH_PX = 56;
/**
 * 3D: the mockup's three layers are transparent boxes with colored borders. A
 * single shared material can't draw a border, so the outer layers lose a little
 * alpha instead — the "exploded wireframe" reading comes from the separation.
 */
const PROCESS_LAYER_ALPHA = [0.85, 0.85, 0.55] as const;

/**
 * 3D: the contact stage's `pow(t, 1.5) * 220` recession is split between "down"
 * and "toward the camera", which turns the mockup's faked floor into an actual
 * ground plane receding away from the viewer.
 */
const FLOOR_DROP = 0.55;
const FLOOR_APPROACH = 0.85;

// ---------------------------------------------------------------------------
// The layouts
// ---------------------------------------------------------------------------

export interface MorphLayouts {
  /** xyz per block, stage-major. Length: STAGE_COUNT * BLOCK_COUNT * 3. */
  readonly position: Float32Array;
  /** Uniform scale per block. Length: STAGE_COUNT * BLOCK_COUNT. */
  readonly scale: Float32Array;
  /** Per-block alpha. Length: STAGE_COUNT * BLOCK_COUNT. */
  readonly alpha: Float32Array;
  /** Linear-space rgb per block. Length: STAGE_COUNT * BLOCK_COUNT * 3. */
  readonly color: Float32Array;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPHERE_TILT = 0.35;
const BAR_HEIGHTS = [7, 11, 16, 22] as const;
const FLOOR_COLS = 14;

interface BarCell {
  /** Which bar (0..3). */
  k: number;
  /** Row within the bar. */
  r: number;
  /** Which of the two columns making the bar. */
  w: number;
  /** Top row of its bar — the highlighted cap. */
  top: boolean;
}

function buildBarCells(): BarCell[] {
  const cells: BarCell[] = [];
  BAR_HEIGHTS.forEach((h, k) => {
    for (let r = 0; r < h; r++) {
      for (let w = 0; w < 2; w++) cells.push({ k, r, w, top: r === h - 1 });
    }
  });
  return cells; // 2 * (7 + 11 + 16 + 22) = 112
}

function buildLayouts(): MorphLayouts {
  const position = new Float32Array(STAGE_COUNT * BLOCK_COUNT * 3);
  const scale = new Float32Array(STAGE_COUNT * BLOCK_COUNT);
  const alpha = new Float32Array(STAGE_COUNT * BLOCK_COUNT);
  const color = new Float32Array(STAGE_COUNT * BLOCK_COUNT * 3);
  const bars = buildBarCells();
  const n = BLOCK_COUNT;

  const write = (
    stage: number,
    i: number,
    px: number,
    py: number,
    pz: number,
    s: number,
    a: number,
    rgb: LinearRGB,
  ) => {
    const flat = stage * BLOCK_COUNT + i;
    position[flat * 3] = worldX(px);
    position[flat * 3 + 1] = worldY(py);
    position[flat * 3 + 2] = worldZ(pz);
    scale[flat] = s;
    alpha[flat] = a;
    color[flat * 3] = rgb[0];
    color[flat * 3 + 1] = rgb[1];
    color[flat * 3 + 2] = rgb[2];
  };

  for (let i = 0; i < n; i++) {
    const cell = GLYPH_CELLS[i];

    // --- 0 · hero — the letters KK -----------------------------------------
    // The second K's stem (gx 12/13) is lime; everything else is ink.
    write(
      0,
      i,
      790 + cell.gx * 20,
      330 + cell.gy * 20,
      0,
      1,
      1,
      cell.gx === 12 || cell.gx === 13 ? RGB.lime : RGB.ink,
    );

    // --- 1 · work — fibonacci sphere ---------------------------------------
    const yy = 1 - (2 * i) / (n - 1);
    const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
    const theta = GOLDEN_ANGLE * i + 0.6;
    const sx = Math.cos(theta) * ring;
    const sz0 = Math.sin(theta) * ring;
    const sy = yy * Math.cos(SPHERE_TILT) - sz0 * Math.sin(SPHERE_TILT);
    const sz = yy * Math.sin(SPHERE_TILT) + sz0 * Math.cos(SPHERE_TILT);
    const depth = (sz + 1) / 2; // 0 back .. 1 front
    write(
      1,
      i,
      1120 + sx * SPHERE_RADIUS_PX,
      470 - sy * SPHERE_RADIUS_PX,
      sz * SPHERE_RADIUS_PX,
      SPHERE_SCALE_BASE + SPHERE_SCALE_RANGE * depth,
      0.35 + 0.55 * depth,
      sz > 0.45 ? (i % 4 === 0 ? RGB.lime : RGB.orange) : RGB.ink,
    );

    // --- 2 · career — four ascending bars ----------------------------------
    const bar = bars[i];
    write(
      2,
      i,
      900 + bar.k * 110 + bar.w * 20,
      740 - bar.r * 20,
      0,
      1,
      1,
      bar.top ? RGB.lime : bar.k === 3 ? RGB.orange : RGB.ink,
    );

    // --- 3 · process — exploded view, three offset layers -------------------
    const layer = (cell.gx + cell.gy) % 3;
    write(
      3,
      i,
      136 + cell.gx * 24 + layer * 26,
      312 + cell.gy * 24 - layer * 22,
      layer * PROCESS_LAYER_DEPTH_PX,
      1,
      PROCESS_LAYER_ALPHA[layer],
      i === 0 ? RGB.lime : layer === 0 ? RGB.blue : layer === 1 ? RGB.orange : RGB.ink,
    );

    // --- 4 · contact — receding floor plane --------------------------------
    const row = Math.floor(i / FLOOR_COLS);
    const col = i % FLOOR_COLS;
    const t = row / 7; // 0 = far, 1 = nearest the viewer
    const gap = 26 + t * 58;
    const recede = Math.pow(t, 1.5) * 220;
    write(
      4,
      i,
      720 + (col - 6.5) * gap,
      650 + recede * FLOOR_DROP,
      recede * FLOOR_APPROACH,
      0.5 + t * 0.7,
      0.18 + t * 0.3,
      row === 6 && col === 9 ? RGB.orange : row === 5 && col === 3 ? RGB.lime : RGB.ink,
    );
  }

  return { position, scale, alpha, color };
}

/** Every stage, baked once at module load. Treat as immutable. */
export const LAYOUTS: MorphLayouts = buildLayouts();

export interface StageBounds {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** Per-stage extents in world units — used to frame a single stage on its own. */
export const STAGE_BOUNDS: readonly StageBounds[] = STAGE_KEYS.map((_, stage) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const at = (stage * BLOCK_COUNT + i) * 3;
    const x = LAYOUTS.position[at];
    const y = LAYOUTS.position[at + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX + BLOCK_SIZE,
    height: maxY - minY + BLOCK_SIZE,
  };
});
