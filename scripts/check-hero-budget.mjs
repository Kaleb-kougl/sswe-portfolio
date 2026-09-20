#!/usr/bin/env node
/**
 * Asset budget check for public/models/hero.glb.
 *
 * Parses the GLB container by hand (no runtime dependencies) and asserts the
 * two budgets the site advertises, to the extent they can honestly be checked
 * from a static file.
 *
 * WHAT THIS PROVES
 *   - the file is a valid glTF-Binary v2 container
 *   - its byte size is within the size budget
 *   - how many distinct mesh primitives the renderer would *have* to issue at
 *     minimum, i.e. the lower bound on draw calls
 *   - every named part resolves to a shared mesh + material, so the parts are
 *     instanceable
 *
 * WHAT THIS DOES *NOT* PROVE
 *   Draw calls are a property of the runtime, not of the file. The same GLB is
 *   1 draw call rendered through a single InstancedMesh and 112 draw calls
 *   rendered naively as 112 separate Meshes. This script therefore reports a
 *   *minimum*, never the actual number, and deliberately prints no draw-call
 *   figure it did not measure.
 *
 *   Nor can it tell a scene drawing one call per frame from a scene drawing
 *   none -- and the backdrop shipped in the second state for a while, passing
 *   this check the whole time, because a floor and a ceiling are both
 *   satisfied by zero. The runtime figure now lives in
 *   `e2e/backdrop-renders.spec.ts`, which asserts a RANGE: above zero, and
 *   within the budget below.
 *
 * Usage: node scripts/check-hero-budget.mjs [path/to/hero.glb]
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// --- Budgets ---------------------------------------------------------------

const MAX_BYTES = 500 * 1024; // 500 KB, as advertised in the Process section
const MAX_DRAW_CALLS = 10; // advertised ceiling; checked as a lower bound only
const EXPECTED_PARTS = 112; // 14 lit mask cells x 2 letters x 2x2 subdivision
const NAME_PATTERN = /^block_\d{3}$/;

// --- GLB container ---------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

/** Split a .glb into its JSON chunk and the byte length of its BIN chunk. */
function parseGlb(buffer) {
  if (buffer.length < 12) {
    throw new Error(`file is ${buffer.length} bytes, too short to be a GLB`);
  }
  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `bad GLB magic 0x${magic.toString(16)} (expected 0x${GLB_MAGIC.toString(16)})`,
    );
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`GLB version ${version}, expected 2`);

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(
      `GLB header declares ${declaredLength} bytes but the file is ${buffer.length}`,
    );
  }

  let offset = 12;
  let json = null;
  let binBytes = 0;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buffer.length) {
      throw new Error(`chunk at ${offset} overruns the end of the file`);
    }
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, end).toString("utf8"));
    } else if (chunkType === CHUNK_BIN) {
      binBytes = chunkLength;
    }
    offset = end + ((4 - (chunkLength % 4)) % 4); // chunks are 4-byte aligned
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, binBytes };
}

// --- Analysis --------------------------------------------------------------

function analyse(json) {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];

  const meshNodes = nodes.filter((n) => typeof n.mesh === "number");
  const usedMeshes = new Set(meshNodes.map((n) => n.mesh));

  // A "batch" is one (mesh, primitive) pair. Rendered with instancing, each
  // distinct batch costs one draw call; that is the floor.
  const batches = new Set();
  let primitiveInstances = 0;
  for (const node of meshNodes) {
    const mesh = meshes[node.mesh];
    const prims = mesh?.primitives ?? [];
    primitiveInstances += prims.length;
    prims.forEach((prim, i) => {
      batches.add(`${node.mesh}:${i}:${prim.material ?? "none"}`);
    });
  }

  const usedMaterials = new Set();
  for (const meshIndex of usedMeshes) {
    for (const prim of meshes[meshIndex]?.primitives ?? []) {
      if (typeof prim.material === "number") usedMaterials.add(prim.material);
    }
  }

  const partNames = meshNodes.map((n) => n.name ?? "");

  return {
    nodeCount: nodes.length,
    meshNodeCount: meshNodes.length,
    meshCount: meshes.length,
    usedMeshCount: usedMeshes.size,
    materialCount: materials.length,
    usedMaterialCount: usedMaterials.size,
    primitiveInstances,
    minDrawCalls: batches.size,
    partNames,
    generator: json.asset?.generator ?? "unknown",
  };
}

// --- Report ----------------------------------------------------------------

function main() {
  const target = process.argv[2] ?? "public/models/hero.glb";
  const file = path.resolve(process.cwd(), target);

  const failures = [];
  const note = (ok, label, detail) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
    if (!ok) failures.push(label);
  };

  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    console.error(`hero budget: cannot read ${file}`);
    console.error("Rebuild it with `npm run hero:build` (needs Blender).");
    process.exit(1);
  }

  const bytes = statSync(file).size;
  let json;
  let binBytes;
  try {
    ({ json, binBytes } = parseGlb(buffer));
  } catch (error) {
    console.error(`hero budget FAILED: ${target} is not a readable GLB.`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
  const a = analyse(json);

  console.log(`hero asset budget -- ${path.relative(process.cwd(), file)}`);
  console.log(`  generator        ${a.generator}`);
  console.log(
    `  size             ${bytes} B (${(bytes / 1024).toFixed(1)} KB), BIN chunk ${binBytes} B`,
  );
  console.log(
    `  nodes            ${a.nodeCount} total, ${a.meshNodeCount} carrying a mesh`,
  );
  console.log(
    `  meshes           ${a.meshCount} defined, ${a.usedMeshCount} referenced`,
  );
  console.log(
    `  materials        ${a.materialCount} defined, ${a.usedMaterialCount} referenced`,
  );
  console.log(
    `  primitives       ${a.primitiveInstances} node-primitive pairs, ${a.minDrawCalls} distinct batch(es)`,
  );
  console.log("");
  console.log("checks");

  note(
    bytes <= MAX_BYTES,
    `size <= ${MAX_BYTES} B`,
    `${bytes} B (${((bytes / MAX_BYTES) * 100).toFixed(1)}% of budget)`,
  );

  note(
    a.meshNodeCount === EXPECTED_PARTS,
    `part count == ${EXPECTED_PARTS}`,
    `${a.meshNodeCount} named parts`,
  );

  const badNames = a.partNames.filter((n) => !NAME_PATTERN.test(n));
  note(
    badNames.length === 0,
    `part names match ${NAME_PATTERN}`,
    badNames.length ? `offenders: ${badNames.slice(0, 5).join(", ")}` : "block_000 ... block_111",
  );

  const expectedNames = Array.from(
    { length: EXPECTED_PARTS },
    (_, i) => `block_${String(i).padStart(3, "0")}`,
  );
  const contiguous =
    a.partNames.length === expectedNames.length &&
    [...a.partNames].sort().join(",") === expectedNames.sort().join(",");
  note(contiguous, "part names are contiguous and unique", contiguous ? "no gaps" : "gaps or duplicates");

  note(
    a.usedMeshCount === 1 && a.usedMaterialCount === 1,
    "parts are instanceable (one shared mesh + one shared material)",
    `${a.usedMeshCount} mesh / ${a.usedMaterialCount} material`,
  );

  note(
    a.minDrawCalls <= MAX_DRAW_CALLS,
    `minimum draw calls <= ${MAX_DRAW_CALLS}`,
    `${a.minDrawCalls} distinct batch(es) -- a FLOOR, not the runtime number`,
  );

  console.log("");
  console.log("limits of this check");
  console.log(
    "  Draw calls are decided by the renderer, not the file. These 112 nodes",
  );
  console.log(
    "  share one mesh and one material, so they CAN be drawn in 1 call via an",
  );
  console.log(
    "  InstancedMesh -- but drawn naively they are 112. This script verifies",
  );
  console.log(
    "  the asset permits the budget; it cannot verify the scene honours it.",
  );
  console.log(
    "  The runtime figure is measured by e2e/backdrop-renders.spec.ts, which",
  );
  console.log(
    "  also asserts it is ABOVE zero -- this check cannot see a blank scene.",
  );

  if (failures.length) {
    console.log("");
    console.error(`hero budget FAILED (${failures.length}): ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("");
  console.log("hero budget OK");
}

main();
