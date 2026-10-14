"""Runs inside Blender: turn one character's Mixamo FBX files into the GLB the game loads.

    blender --background --python build-character.py -- <source folder> <output .glb> [<clip source folder>]

The source folder holds character.fbx (the mesh and skeleton, in T-pose) and
animations/<clip name>.fbx (one clip each). Each clip is exported under its
file name, which is the name the game looks it up by.

A character with no clips of its own is given a clip source folder: another
character's source folder, whose clips it plays. Its skeleton is first fitted
to that character's, so the clips mean the same on both.
"""
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

# Mixamo offers 24, 30 and 60; keys are sampled at this rate, so a lower value would drop detail
FRAMES_PER_SECOND = 60
# Two skeletons whose bones rest within this angle of each other can share a clip as it is
SAME_REST_ANGLE = math.radians(1)

arguments = [Path(argument) for argument in sys.argv[sys.argv.index('--') + 1:]]
source_dir, output_path = arguments[:2]
clip_source_dir = arguments[2] if len(arguments) > 2 else None


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


def pose_like(armature, reference, scale):
    """Pose the armature into the reference skeleton's rest pose, its root where the reference's is."""
    # Parents come before their children in an armature's bones
    pose = {}
    for bone in armature.data.bones:
        target = reference.data.bones[bone.name]
        if bone.parent is None:
            pose[bone.name] = Matrix.LocRotScale(target.matrix_local.translation, target.matrix_local.to_quaternion(), (scale,) * 3)
        else:
            offset = (bone.parent.matrix_local.inverted() @ bone.matrix_local).translation
            rotation = (target.parent.matrix_local.inverted() @ target.matrix_local).to_quaternion()
            pose[bone.name] = pose[bone.parent.name] @ Matrix.LocRotScale(offset, rotation, None)

    for bone in armature.data.bones:
        armature.pose.bones[bone.name].matrix = pose[bone.name]
        # A child's pose is worked out from its parent's, which has to be current
        bpy.context.view_layer.update()


def lowest_point(meshes):
    """Height of the lowest vertex of the meshes as they are posed now."""
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    lowest = float('inf')

    for mesh in meshes:
        posed = mesh.evaluated_get(dependency_graph)
        posed_mesh = posed.to_mesh()
        lowest = min(lowest, min((posed.matrix_world @ vertex.co).z for vertex in posed_mesh.vertices))
        posed.to_mesh_clear()

    return lowest


def fit_to_skeleton(armature, objects, reference_path):
    """Give the character the rest pose, the facing and the standing height of another character's skeleton.

    A clip stores every bone's rotation relative to its parent and the height of
    the hips. Both only mean the same on two skeletons that rest in the same pose
    with the hips as far above the ground, and an auto-rigged character may arrive
    lying down, in an A-pose and at any size. The character is posed bone by bone
    into the other skeleton's rest pose and scaled until its soles touch the
    ground from there, and that pose becomes its new rest pose.
    """
    reference_objects = import_fbx(reference_path)
    reference = find_armature(reference_objects, reference_path)
    # Fewer bones are fine: Mixamo's smaller skeletons leave out fingers, which then keep still against the hand
    if not set(armature.data.bones.keys()) <= set(reference.data.bones.keys()):
        raise RuntimeError(f'{character_path.name}: its skeleton has bones that the one in {reference_path} lacks')

    meshes = [candidate for candidate in objects if candidate.type == 'MESH']
    armature.matrix_world = reference.matrix_world.copy()

    # The hips are held where the reference's are, so the soles drop in proportion to the scale
    pose_like(armature, reference, 1)
    root = next(bone for bone in armature.pose.bones if bone.parent is None)
    hips_height = (armature.matrix_world @ root.matrix).translation.z
    scale = hips_height / (hips_height - lowest_point(meshes))
    pose_like(armature, reference, scale)

    # Freeze the mesh in the new pose, make that pose the rest pose, then bind the mesh again
    for mesh in meshes:
        for modifier in [candidate for candidate in mesh.modifiers if candidate.type == 'ARMATURE' and candidate.object == armature]:
            bpy.context.view_layer.objects.active = mesh
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            mesh.modifiers.new('Armature', 'ARMATURE').object = armature

    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    for leftover in reference_objects:
        bpy.data.objects.remove(leftover, do_unlink=True)
    # The reference came with its own one-frame T-pose clip
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    print(f'Fitted to {reference_path}: scaled by {scale:.3f}')


def standing_height(skeleton, like):
    """How far the root stands above the ball of the foot, in world units, with the
    skeleton's own bone lengths and the rest pose of `like` (which may be itself)."""
    bones = skeleton.data.bones
    height = 0
    bone = bones['mixamorig:LeftToeBase']

    while bone.parent:
        offset = (bone.parent.matrix_local.inverted() @ bone.matrix_local).translation
        # Where the bone sits against its parent, turned the way that parent rests in `like`
        parent_rest = like.matrix_world @ like.data.bones[bone.parent.name].matrix_local
        height -= (parent_rest.to_quaternion() @ offset).z
        bone = bone.parent

    return height * skeleton.matrix_world.to_scale().z


def rest_rotation(skeleton, bone):
    """How a bone rests: relative to its parent, or to the world for the root."""
    matrix = bone.parent.matrix_local.inverted() @ bone.matrix_local if bone.parent else skeleton.matrix_world @ bone.matrix_local

    return matrix.to_quaternion()


def rests_alike(first, second):
    return all(
        rest_rotation(first, bone).rotation_difference(rest_rotation(second, second.data.bones[bone.name])).angle < SAME_REST_ANGLE
        for bone in first.data.bones
    )


def curve_collections(action):
    """The action's collections of curves. Blender 5 keeps them in channel bags, one per thing the action animates."""
    if hasattr(action, 'fcurves'):
        return [action.fcurves]

    return [bag.fcurves for layer in action.layers for strip in layer.strips for bag in strip.channelbags]


def curves_of(action):
    return [curve for curves in curve_collections(action) for curve in curves]


def remove_curves_of_missing_bones(action, armature):
    """Drop the keys of bones the character lacks, which the exporter would warn about one by one."""
    for curves in curve_collections(action):
        for curve in list(curves):
            match = re.match(r'pose\.bones\["(.+?)"\]', curve.data_path)
            if match and match.group(1) not in armature.data.bones:
                curves.remove(curve)


def convert_clip(action, clip_armature, armature, clip_path):
    """Rewrite a clip made for another character's skeleton so that it plays on this one.

    Mixamo fits every clip it hands out to the character selected at the time:
    the keys are relative to that skeleton's rest pose and the hips travel at
    its size. The clip is played on the skeleton it came with, and at every
    frame each bone's turn against its parent is expressed again from this
    skeleton's rest pose, with the hips' position scaled by how tall the two stand.
    """
    scale = standing_height(armature, armature) / standing_height(clip_armature, armature)
    to_armature = armature.matrix_world.inverted()
    to_armature_rotation = to_armature.to_quaternion()
    rest = {bone.name: bone.matrix_local for bone in armature.data.bones}
    offset = {bone.name: (bone.parent.matrix_local.inverted() @ bone.matrix_local).translation for bone in armature.data.bones if bone.parent}

    first_frame, last_frame = (int(round(frame)) for frame in action.frame_range)
    rotations = {bone.name: {} for bone in armature.data.bones}
    locations = {}
    previous = {}

    for frame in range(first_frame, last_frame + 1):
        bpy.context.scene.frame_set(frame)
        played = {pose_bone.name: clip_armature.matrix_world @ pose_bone.matrix for pose_bone in clip_armature.pose.bones}
        posed = {}

        # Parents come before their children in an armature's bones
        for bone in armature.data.bones:
            name = bone.name
            if bone.parent is None:
                posed[name] = Matrix.LocRotScale(
                    to_armature @ (played[name].translation * scale),
                    to_armature_rotation @ played[name].to_quaternion(),
                    None
                )
                basis = rest[name].inverted() @ posed[name]
                locations[frame] = basis.translation.copy()
            else:
                turn = (played[bone.parent.name].inverted() @ played[name]).to_quaternion()
                posed[name] = posed[bone.parent.name] @ Matrix.LocRotScale(offset[name], turn, None)
                basis = (posed[bone.parent.name] @ rest[bone.parent.name].inverted() @ rest[name]).inverted() @ posed[name]

            rotation = basis.to_quaternion()
            # A quaternion and its negative are the same turn; keep to one so the keys blend the short way
            if name in previous and rotation.dot(previous[name]) < 0:
                rotation.negate()
            previous[name] = rotation
            rotations[name][frame] = rotation

    keyed = set()
    for curve in curves_of(action):
        match = re.fullmatch(r'pose\.bones\["(.+)"\]\.(\w+)', curve.data_path)
        if not match or match.group(1) not in rotations:
            continue

        name, channel = match.groups()
        if channel not in ('rotation_quaternion', 'location', 'scale'):
            raise RuntimeError(f'{clip_path.name}: cannot convert a clip keyed on {channel}')

        for key in curve.keyframe_points:
            frame = min(max(int(round(key.co.x)), first_frame), last_frame)
            if channel == 'rotation_quaternion':
                value = rotations[name][frame][curve.array_index]
                keyed.add(name)
            elif channel == 'location':
                # Only the root travels; every other bone stays where this skeleton has it
                value = locations[frame][curve.array_index] if armature.data.bones[name].parent is None else 0
            else:
                value = 1

            key.co.y = value
            key.handle_left.y = value
            key.handle_right.y = value
            key.interpolation = 'LINEAR'
        curve.update()

    # The tips of fingers, toes and head are never keyed and move nothing; they keep their rest pose
    unkeyed = {name for name in set(rotations) - keyed if armature.data.bones[name].children}
    if unkeyed:
        raise RuntimeError(f'{clip_path.name}: cannot convert a clip with no keys on {sorted(unkeyed)}')

    print(f'Converted {clip_path.name} from another character\'s skeleton: hips scaled by {scale:.3f}')


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FRAMES_PER_SECOND

character_path = source_dir / 'character.fbx'
character_objects = import_fbx(character_path)
armature = find_armature(character_objects, character_path)

# The character file carries a one-frame T-pose clip, which the game has no use for
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
armature.animation_data_clear()

for material in bpy.data.materials:
    if not material.node_tree:
        continue

    # A texture with an alpha channel in use is always written as PNG, and a character is never see-through
    for link in [candidate for candidate in material.node_tree.links if candidate.to_socket.name == 'Alpha']:
        material.node_tree.links.remove(link)

    # A painted character is matte cloth; its file can arrive fully metallic, which draws nearly black
    if any(node.type == 'TEX_IMAGE' for node in material.node_tree.nodes):
        for shader in [node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED']:
            shader.inputs['Metallic'].default_value = 0
            shader.inputs['Roughness'].default_value = 1

if clip_source_dir:
    fit_to_skeleton(armature, character_objects, clip_source_dir / 'character.fbx')

armature.animation_data_create()

clip_dir = (clip_source_dir or source_dir) / 'animations'
clip_paths = sorted(clip_dir.glob('*.fbx'))
if not clip_paths:
    raise RuntimeError(f'No animation files in {clip_dir}')

for clip_path in clip_paths:
    imported = import_fbx(clip_path)
    clip_armature = find_armature(imported, clip_path)

    # A clip may move bones the character lacks (fingers, on Mixamo's smaller skeletons); those keys move nothing
    if not set(armature.data.bones.keys()) <= set(clip_armature.data.bones.keys()):
        raise RuntimeError(f'{clip_path.name}: its skeleton lacks bones the character has; it has to be a Mixamo skeleton')

    action = clip_armature.animation_data.action
    if not rests_alike(armature, clip_armature):
        convert_clip(action, clip_armature, armature, clip_path)
    remove_curves_of_missing_bones(action, armature)
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
    export_animation_mode='ACTIONS',
    # A generated character can carry a texture of many megabytes as PNG
    export_image_format='JPEG'
)
print(f'Wrote {output_path} with {len(clip_paths)} clips')
