"""Generate the portfolio's hero block sculpture and export it to glTF-Binary.

Run through Blender's own Python interpreter -- `bpy` does not exist in the
system python3:

    /Applications/Blender.app/Contents/MacOS/Blender \
        --background --factory-startup \
        --python scripts/build_hero_glb.py -- --out public/models/hero.glb

See docs/hero-pipeline.md for the full contract.

What it builds
--------------
A 5x7 `K` glyph mask, stamped twice side by side, where every lit cell of the
mask becomes a 2x2 group of sub-blocks. The block count is *derived* from the
mask (see `block_count()`), it is not a constant: 14 lit cells x 2 letters x 4
sub-blocks = 112.

Every sub-block is its own Blender object with its own origin at its own
centre, so the web runtime can translate/rotate each part independently. All
112 objects share a single mesh datablock and a single material, which is what
lets the web code draw them as one InstancedMesh.

The rest pose is the hero arrangement (the letters). The other four scroll
arrangements are computed at runtime on the web -- nothing else is baked here.
"""

from __future__ import annotations

import argparse
import os
import random
import sys

import bpy

# --- Design constants -------------------------------------------------------

# 5 wide x 7 tall. 'X' marks a lit cell.
K_MASK: tuple[str, ...] = (
    "X...X",
    "X..X.",
    "X.X..",
    "XX...",
    "X.X..",
    "X..X.",
    "X...X",
)

# Column offsets, in glyph cells, at which the mask is stamped. Two letters.
LETTER_OFFSETS: tuple[int, ...] = (0, 6)

# Each lit cell is split into SUBDIV x SUBDIV sub-blocks.
SUBDIV = 2

CELL = 1.0                      # glyph cell pitch, Blender units
SUB_PITCH = CELL / SUBDIV       # sub-block pitch
FILL = 0.86                     # fraction of the pitch the cube occupies
BLOCK_SIZE = SUB_PITCH * FILL   # cube edge length

NAME_PREFIX = "block_"
NAME_PAD = 3                    # block_000 .. block_111
MESH_NAME = "hero_block"
MATERIAL_NAME = "hero_block"
COLLECTION_NAME = "hero"

SEED = 20260916                 # any randomness is seeded from this


def mask_dimensions() -> tuple[int, int]:
    """(columns, rows) of the glyph mask, validated to be rectangular."""
    rows = len(K_MASK)
    widths = {len(row) for row in K_MASK}
    if len(widths) != 1:
        raise ValueError(f"K_MASK rows have differing widths: {sorted(widths)}")
    return widths.pop(), rows


def lit_cells() -> list[tuple[int, int]]:
    """(row, col) of every lit cell in the mask, in stable reading order."""
    return [
        (row, col)
        for row, line in enumerate(K_MASK)
        for col, char in enumerate(line)
        if char == "X"
    ]


def block_count() -> int:
    """Derived from the design, never hardcoded."""
    return len(lit_cells()) * len(LETTER_OFFSETS) * SUBDIV * SUBDIV


def block_placements() -> list[tuple[str, tuple[float, float, float]]]:
    """Every block's name and centre, in the canonical order.

    Ordering (this defines the index -> part mapping the web code relies on):
      letter (left to right) -> mask row (top to bottom) -> mask column
      (left to right) -> sub-row (top to bottom) -> sub-column (left to right).

    The glyph is built in Blender's X/Z plane with thickness along Y, so that
    the glTF exporter's Z-up -> Y-up conversion leaves the letters standing
    upright in the exported X/Y plane.
    """
    cols, rows = mask_dimensions()
    span_cols = max(LETTER_OFFSETS) + cols
    # Centre the whole sculpture on the origin.
    x_shift = -(span_cols * CELL) / 2.0
    z_shift = (rows * CELL) / 2.0

    placements: list[tuple[str, tuple[float, float, float]]] = []
    index = 0
    for offset in LETTER_OFFSETS:
        for row, col in lit_cells():
            for sub_row in range(SUBDIV):
                for sub_col in range(SUBDIV):
                    x = (offset + col) * CELL + (sub_col + 0.5) * SUB_PITCH + x_shift
                    z = -(row * CELL + (sub_row + 0.5) * SUB_PITCH) + z_shift
                    name = f"{NAME_PREFIX}{index:0{NAME_PAD}d}"
                    placements.append((name, (x, 0.0, z)))
                    index += 1
    return placements


# --- Blender plumbing -------------------------------------------------------


def wipe_scene() -> None:
    """Start from an empty scene so re-running never accumulates duplicates.

    `--factory-startup` still ships the default cube/camera/light, and the
    script is also meant to be re-runnable from inside the saved .blend, so we
    purge objects and orphan data unconditionally.
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.images,
    ):
        for block in list(datablocks):
            datablocks.remove(block, do_unlink=True)


def make_cube_mesh(size: float) -> bpy.types.Mesh:
    """One cube, centred on its own origin, built without operators."""
    h = size / 2.0
    verts = [
        (-h, -h, -h), (h, -h, -h), (h, h, -h), (-h, h, -h),
        (-h, -h, h), (h, -h, h), (h, h, h), (-h, h, h),
    ]
    faces = [
        (0, 3, 2, 1),  # -Z
        (4, 5, 6, 7),  # +Z
        (0, 1, 5, 4),  # -Y
        (1, 2, 6, 5),  # +X
        (2, 3, 7, 6),  # +Y
        (3, 0, 4, 7),  # -X
    ]
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    return mesh


def make_material() -> bpy.types.Material:
    # Blender 5.2 gives every new material a node tree with a Principled BSDF
    # already wired to the output. `Material.use_nodes` is deprecated here
    # (slated for removal in 6.0), so we do not touch it.
    material = bpy.data.materials.new(MATERIAL_NAME)
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.82, 0.84, 0.88, 1.0)
        principled.inputs["Metallic"].default_value = 0.1
        principled.inputs["Roughness"].default_value = 0.45
    return material


def build(jitter: float) -> list[bpy.types.Object]:
    wipe_scene()

    rng = random.Random(SEED)  # seeded so --jitter stays reproducible

    mesh = make_cube_mesh(BLOCK_SIZE)
    mesh.materials.append(make_material())

    collection = bpy.data.collections.new(COLLECTION_NAME)
    bpy.context.scene.collection.children.link(collection)

    objects: list[bpy.types.Object] = []
    for name, (x, y, z) in block_placements():
        obj = bpy.data.objects.new(name, mesh)  # shared mesh datablock
        if jitter:
            x += rng.uniform(-jitter, jitter)
            y += rng.uniform(-jitter, jitter)
            z += rng.uniform(-jitter, jitter)
        obj.location = (x, y, z)  # origin == centre, so pivot == centre
        collection.objects.link(obj)
        objects.append(obj)

    bpy.context.view_layer.update()
    return objects


def export_glb(path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    # Blender 5.2 glTF exporter. There is no "keep object names" flag -- glTF
    # node names come straight from the Blender object names. Collections are
    # not exported as nodes unless export_hierarchy_full_collections is on, so
    # the 112 blocks land as 112 top-level nodes.
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        use_visible=False,
        use_renderable=False,
        use_active_collection=False,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_normals=True,
        export_tangents=False,
        export_texcoords=False,
        export_attributes=False,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        # EXT_mesh_gpu_instancing would collapse the named nodes; the web code
        # needs to address every part by name, so leave it off.
        export_gpu_instances=False,
        export_draco_mesh_compression_enable=False,
        export_hierarchy_full_collections=False,
        export_unused_images=False,
        export_unused_textures=False,
        will_save_settings=False,
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="build_hero_glb.py",
        description="Build the hero block sculpture and export hero.glb.",
    )
    parser.add_argument(
        "--out",
        default="public/models/hero.glb",
        help="glb output path (default: public/models/hero.glb)",
    )
    parser.add_argument(
        "--blend",
        default="scripts/hero.blend",
        help="where to save the .blend (default: scripts/hero.blend); "
             "pass an empty string to skip saving",
    )
    parser.add_argument(
        "--jitter",
        type=float,
        default=0.0,
        help="seeded random offset applied to every block, in Blender units "
             "(default: 0.0 -- the shipped rest pose is exact)",
    )
    args = parser.parse_args(argv)

    expected = block_count()
    objects = build(args.jitter)
    if len(objects) != expected:
        raise SystemExit(
            f"built {len(objects)} blocks but the mask derives {expected}"
        )

    if args.blend:
        os.makedirs(os.path.dirname(args.blend) or ".", exist_ok=True)
        # Blender keeps N rolling backups (hero.blend1, ...) next to the saved
        # file. They are noise in a repo, so turn them off for this save.
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(
            filepath=os.path.abspath(args.blend), compress=True
        )

    export_glb(os.path.abspath(args.out))

    cols, rows = mask_dimensions()
    print("--- hero build ---")
    print(f"mask            {cols}x{rows}, {len(lit_cells())} lit cells")
    print(f"letters         {len(LETTER_OFFSETS)} at cell offsets {list(LETTER_OFFSETS)}")
    print(f"subdivision     {SUBDIV}x{SUBDIV} per lit cell")
    print(f"blocks          {len(objects)} (derived)")
    print(f"names           {objects[0].name} .. {objects[-1].name}")
    print(f"shared meshes   {len({o.data.name for o in objects})}")
    print(f"shared mats     {len({m.name for o in objects for m in o.data.materials})}")
    print(f"blend           {args.blend or '(not saved)'}")
    print(f"glb             {args.out}")
    return 0


if __name__ == "__main__":
    # Blender passes the script its own argv; ours is whatever follows "--".
    script_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    sys.exit(main(script_args))
