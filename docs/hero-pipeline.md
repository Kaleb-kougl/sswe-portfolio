# Hero background pipeline

The fixed 3D background is **112 small blocks that rearrange as you scroll**.
This document covers how the blocks are produced: the Blender file, the
generator script, the exported `hero.glb`, and the budget check that guards it.

The five scroll arrangements (letters -> fibonacci sphere -> four ascending bars
-> exploded wireframe -> receding floor) are **not** part of this pipeline.
Only the first one, the `KK` letters, is baked -- it is the asset's rest pose.
The other four are computed at runtime on the web from the block positions.

---

## Files

| Path | What it is |
| --- | --- |
| `scripts/build_hero_glb.py` | The generator. Runs inside Blender's Python, builds the sculpture from scratch, saves the `.blend`, exports the `.glb`. |
| `scripts/hero.blend` | The Blender file, saved by the generator. Committed, compressed, hand-editable. |
| `public/models/hero.glb` | The committed artifact the site loads from `/models/hero.glb`. |
| `scripts/check-hero-budget.mjs` | Zero-dependency Node budget check. |
| `.github/workflows/ci.yml` (`asset-budget` job) | Runs the budget check on every push and PR. |
| `.github/workflows/hero-rebuild.yml` | Manually-triggered rebuild from the generator. |

---

## Rebuilding

Blender is **not on `PATH`** on the dev machine, and `bpy` does not exist in the
system `python3` (it only ships inside Blender's own interpreter), so the
generator must be run *through* Blender.

```sh
npm run hero:build
```

which is exactly:

```sh
"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" \
  --background --factory-startup \
  --python scripts/build_hero_glb.py \
  -- --out public/models/hero.glb --blend scripts/hero.blend
```

Set `BLENDER` to point elsewhere (Linux, or a different install):

```sh
BLENDER=/opt/blender/blender npm run hero:build
```

Everything after the bare `--` goes to the script, not to Blender.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--out` | `public/models/hero.glb` | glTF-Binary output path. |
| `--blend` | `scripts/hero.blend` | Where to save the `.blend`. Pass `""` to skip saving. |
| `--jitter` | `0.0` | Seeded random offset per block, in Blender units. The shipped rest pose is exact, so this is `0`. |

Then verify:

```sh
npm run hero:check
```

### Notes on the invocation

- `--background` runs headless.
- `--factory-startup` skips user preferences and add-on state, so the build does
  not depend on whoever's machine it runs on. The script *also* wipes the scene
  itself (`wipe_scene()`), so it is idempotent: re-running never accumulates a
  second copy of the sculpture, and it is safe to re-run from inside the saved
  `.blend` via Blender's text editor.
- Written against **Blender 5.2.0 LTS**, glTF exporter `Khronos glTF Blender I/O
  v5.2.39`. The exporter's argument names have churned across Blender versions;
  if a future version rejects one, introspect the current names rather than
  guessing:
  ```sh
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python-expr 'import bpy; print(sorted(p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties))'
  ```
  In 5.2 there is **no** "keep object names" flag -- glTF node names are taken
  straight from the Blender object names, unconditionally.

### Editing the `.blend` by hand

Open `scripts/hero.blend` in Blender, move blocks, then re-export **without**
re-running the generator (which would overwrite your edits):

```sh
"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" --background scripts/hero.blend \
  --python-expr 'import bpy; bpy.ops.export_scene.gltf(filepath="public/models/hero.glb", export_format="GLB", export_yup=True, export_animations=False, export_texcoords=False, export_extras=False)'
npm run hero:check
```

Keep the object names intact -- the web code matches on them. If you add or
remove blocks, update `EXPECTED_PARTS` in `scripts/check-hero-budget.mjs` and
the block-count derivation below.

---

## Where 112 comes from

The count is **derived in the generator, never hardcoded**. It falls out of the
design:

```python
K_MASK = ("X...X",
          "X..X.",
          "X.X..",
          "XX...",
          "X.X..",
          "X..X.",
          "X...X")     # 5 wide x 7 tall, 14 lit cells
LETTER_OFFSETS = (0, 6) # the mask is stamped twice, 6 cells apart
SUBDIV = 2              # every lit cell becomes a 2x2 group of sub-blocks
```

`14 lit cells x 2 letters x 2 x 2 = 112`. Change the mask, the offsets or the
subdivision and the count follows automatically (`block_count()`).

---

## Part naming

Every block is a **separate Blender object with its own origin at its own
centre**, so the web runtime can translate and rotate each part independently
about a sensible pivot.

Names are zero-padded and contiguous:

```
block_000, block_001, ... , block_111
```

i.e. `block_%03d`, indices `0 .. N-1` with no gaps. The web code may rely on
this. These become the glTF **node** names verbatim; all 112 are direct children
of the scene root (the `hero` collection is not exported as a node).

The index order is fixed and meaningful:

> **letter** (left to right) -> **mask row** (top to bottom) -> **mask column**
> (left to right) -> **sub-row** (top to bottom) -> **sub-column** (left to
> right)

So `block_000` is the top-left sub-block of the left `K` and `block_111` is the
bottom-right sub-block of the right `K`.

### Orientation and units

The glyph is authored in Blender's X/Z plane with thickness along Y. The
exporter's Z-up -> Y-up conversion (`export_yup=True`) therefore lands the
letters **upright in the exported X/Y plane, flat at z = 0**, centred on the
origin:

- x from `-5.25` to `+5.25` (10.5 units wide)
- y from `-3.25` to `+3.25` (6.5 units tall)
- z `0` for every block

Block cubes are `0.43` units on a side on a `0.5` unit pitch (`FILL = 0.86`),
which is where the gap between blocks comes from. Scale to taste on the web
side; nothing here assumes a particular camera.

### Instancing

All 112 objects **share one mesh datablock and one material**, so the GLB
contains a single 24-vertex / 36-index mesh referenced by 112 nodes. That is
what makes it cheap to draw the whole sculpture as one `InstancedMesh`.
`EXT_mesh_gpu_instancing` is deliberately **off** -- it would collapse the named
nodes, and the web code needs to address each part by name.

---

## Determinism

Running the generator twice on the same Blender build produces a
**byte-identical** `hero.glb` (verified). There is no wall-clock or path data in
the output, geometry is computed from integers and exact binary fractions, and
the only randomness (`--jitter`, default off) is drawn from a `random.Random`
seeded with a fixed `SEED`.

Across *different* Blender builds or platforms the bytes may shift (the
`asset.generator` string alone encodes the exporter version) without the
geometry changing. That is why nothing gates on a byte comparison -- see CI
below.

---

## Budgets

The site's Process section advertises two budgets:

- **`hero.glb` <= 500 KB**
- **<= 10 draw calls**

`npm run hero:check` parses the GLB container by hand -- no runtime
dependencies, just the documented 12-byte header plus length-prefixed JSON and
BIN chunks -- and checks:

| Check | What it asserts |
| --- | --- |
| container | valid glTF-Binary v2, header length matches the file |
| size | file size <= 500 KB |
| part count | exactly 112 mesh-carrying nodes |
| part names | every name matches `/^block_\d{3}$/` |
| name integrity | names are contiguous `block_000 .. block_111`, no gaps or duplicates |
| instanceable | all parts resolve to **one** shared mesh and **one** shared material |
| draw-call floor | distinct `(mesh, primitive, material)` batches <= 10 |

Current numbers: **8,672 bytes (8.5 KB, 1.7% of the size budget)**, 112 nodes,
1 mesh, 1 material, **1 distinct batch**.

### What the check does NOT prove

**It cannot measure draw calls.** Draw calls are a property of how the web code
renders the asset, not of the file. This exact GLB is:

- **1 draw call** if the 112 nodes are drawn through a single `InstancedMesh`
- **112 draw calls** if they are instantiated naively as 112 separate `Mesh`es

So the script reports a **floor** -- the minimum any renderer could achieve --
and deliberately prints no draw-call figure it did not measure. Passing this
check means *the asset permits the budget*, not that the scene honours it.

The honest way to get a real number is a Playwright probe that reads
`renderer.info.render.calls` off the live renderer after the scene settles.
**That is the follow-up, and it is not implemented yet.** Until it exists, the
"<= 10 draw calls" claim is guaranteed by the asset's shape and by code review
of the scene, not by an automated measurement.

---

## CI

**Every push and PR** runs the `asset-budget` job in `.github/workflows/ci.yml`.
It checks out the repo, sets up Node 20, and runs `npm run hero:check` against
the **committed** `hero.glb`. It runs in parallel with `build-and-test`, inherits
the workflow-level concurrency group, and takes seconds.

It does **not** install Blender, and it does **not** rebuild the asset. Reasons:

- GitHub's ubuntu runners do not ship Blender.
- `apt install blender` is slow and pins whatever version the runner image's
  archive happens to carry, which drifts and would make the output unstable.
- Spending minutes per PR re-deriving an 8.5 KB file that changes almost never
  is a bad trade. The committed artifact is the thing the site actually ships,
  so the committed artifact is the thing worth guarding.

It also skips `npm ci`: the check has zero dependencies and uses only `node:`
builtins, so installing the tree would be pure latency.

**Rebuilding in CI is opt-in.** `.github/workflows/hero-rebuild.yml` is
`workflow_dispatch`-only. It downloads a pinned Blender from `blender.org`
(default `5.2.0`, overridable from the dispatch form), runs `npm run hero:build`,
runs the budget check on the result, uploads the rebuilt `.glb` as an artifact,
and **reports** whether it differs from the committed one in the job summary.

That last step is a report, not a gate, on purpose: a byte diff across Blender
builds is expected and proves nothing about the geometry, so failing on it would
be a flaky check. The budget check is the real gate; a human reads the summary
and commits the rebuilt file if the change was intended.

Run it after changing `scripts/build_hero_glb.py` or `scripts/hero.blend`, or
when bumping Blender.
