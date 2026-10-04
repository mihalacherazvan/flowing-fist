"""Runs inside Blender: turn one character's Mixamo FBX files into the GLB the game loads.

    blender --background --python build-character.py -- <source folder> <output .glb>

The source folder holds character.fbx (the mesh and skeleton, in T-pose) and
animations/<clip name>.fbx (one clip each). Each clip is exported under its
file name, which is the name the game looks it up by.
"""
import sys
from pathlib import Path

import bpy

# Mixamo offers 24, 30 and 60; keys are sampled at this rate, so a lower value would drop detail
FRAMES_PER_SECOND = 60

source_dir, output_path = (Path(argument) for argument in sys.argv[sys.argv.index('--') + 1:])


def import_fbx(path):
    """Import a file and return the objects it added."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))

    return [candidate for candidate in bpy.data.objects if candidate not in before]


def find_armature(objects, path):
    armatures = [candidate for candidate in objects if candidate.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'{path.name}: expected one skeleton, found {len(armatures)}')

    return armatures[0]


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FRAMES_PER_SECOND

character_path = source_dir / 'character.fbx'
armature = find_armature(import_fbx(character_path), character_path)

# The character file carries a one-frame T-pose clip, which the game has no use for
if armature.animation_data and armature.animation_data.action:
    bpy.data.actions.remove(armature.animation_data.action)
armature.animation_data_create()

clip_paths = sorted((source_dir / 'animations').glob('*.fbx'))
if not clip_paths:
    raise RuntimeError(f'No animation files in {source_dir / "animations"}')

for clip_path in clip_paths:
    imported = import_fbx(clip_path)
    clip_armature = find_armature(imported, clip_path)

    if set(clip_armature.data.bones.keys()) != set(armature.data.bones.keys()):
        raise RuntimeError(f'{clip_path.name}: its skeleton differs from the character\'s; was it downloaded for another character?')

    action = clip_armature.animation_data.action
    action.name = clip_path.stem
    # Keep the action alive once the skeleton it arrived on is deleted
    action.use_fake_user = True

    for leftover in imported:
        bpy.data.objects.remove(leftover, do_unlink=True)

    # Parking the action on a track of the character's skeleton is what makes the exporter pick it up
    track = armature.animation_data.nla_tracks.new()
    track.name = clip_path.stem
    track.strips.new(clip_path.stem, int(action.frame_range[0]), action)

output_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output_path),
    export_format='GLB',
    export_animations=True,
    # One animation per action, named after it. The NLA_TRACKS mode is not used
    # because in Blender 4.4 it wrote each clip under its neighbour's name.
    export_animation_mode='ACTIONS'
)
print(f'Wrote {output_path} with {len(clip_paths)} clips')
