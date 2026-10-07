import type { Animation } from '@babylonjs/core/Animations/animation';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AnimationLayer, CharacterAnimation, ClipName } from './characterAnimation';

/** Clips are authored at this rate; a layer's frame numbers are in these frames */
const CLIP_FRAMES_PER_SECOND = 60;
/** How long a change of clip takes to blend in */
export const BLEND_SECONDS = 0.12;

interface Clip {
    /** Per bone, in the animator's bone order; null where the clip does not move that bone */
    rotations: (Animation | null)[];
    hipsPosition: Animation | null;
    hipsStart: Vector3;
    /** Length in clip frames */
    length: number;
}

/** A part of the skeleton that can change clip, and blend, independently of the other */
interface Region {
    /** The clip shown and whether it is mirrored; null before anything has been shown */
    shown: string | null;
    /** 0 right after a change of clip, 1 once the new clip has fully taken over */
    blend: number;
}

/**
 * Poses a skeleton from the clips in a loaded model.
 *
 * Babylon's own animation playback is not used: the simulation dictates the
 * frame of an attack tick by tick, and may jump back and forth when a
 * prediction is corrected. So each frame the wanted clips are sampled directly
 * and written to the bones, blending from the pose last shown whenever a clip changes.
 */
export class SkeletonAnimator {
    private bones: TransformNode[] = [];
    private isUpperBody: boolean[] = [];
    /** Per bone, the bone on the other side of the body; a bone on the centre line is its own */
    private mirrorBone: number[] = [];
    private hipsIndex = -1;
    /** Straight up, as a direction in the space the hips are positioned in */
    private hipsUp = Vector3.Up();
    private clips = new Map<ClipName, Clip>();
    /** Free-running time, in clip frames, of each looping clip in use */
    private loopFrames = new Map<ClipName, number>();
    private lowerBody: Region = { shown: null, blend: 1 };
    private upperBody: Region = { shown: null, blend: 1 };
    /** The pose each bone had when its region last changed clip */
    private blendFromRotations: Quaternion[] = [];
    private blendFromHipsPosition = new Vector3();
    private sampledRotation = new Quaternion();
    private sampledPosition = new Vector3();
    private hipsStart = new Vector3();

    constructor(animationGroups: AnimationGroup[]) {
        const boneIndexes = new Map<TransformNode, number>();
        const getBoneIndex = (bone: TransformNode): number => {
            let index = boneIndexes.get(bone);
            if (index === undefined) {
                index = this.bones.length;
                boneIndexes.set(bone, index);
                this.bones.push(bone);
            }

            return index;
        };

        for (const group of animationGroups) {
            // The loader starts the first group by itself
            group.stop();

            const clip: Clip = { rotations: [], hipsPosition: null, hipsStart: new Vector3(), length: 0 };
            for (const { target, animation } of group.targetedAnimations) {
                const keys = animation.getKeys();
                const framesPerClipFrame = animation.framePerSecond / CLIP_FRAMES_PER_SECOND;
                clip.length = Math.max(clip.length, (keys[keys.length - 1].frame - keys[0].frame) / framesPerClipFrame);

                if (animation.targetProperty === 'rotationQuaternion') {
                    clip.rotations[getBoneIndex(target)] = animation;
                } else if (animation.targetProperty === 'position' && isNamed(target, 'Hips')) {
                    if (this.hipsIndex < 0) this.findHipsUp(target);
                    this.hipsIndex = getBoneIndex(target);
                    clip.hipsPosition = animation;
                    clip.hipsStart.copyFrom(keys[0].value);
                }
            }
            this.clips.set(group.name as ClipName, clip);
        }

        for (const clip of this.clips.values()) {
            for (let index = 0; index < this.bones.length; index++) {
                clip.rotations[index] ??= null;
            }
        }

        this.isUpperBody = this.bones.map(isInUpperBody);
        this.mirrorBone = this.bones.map((bone, index) => {
            const otherSide = this.bones.findIndex((candidate) => candidate.name === swapSide(bone.name));

            return otherSide < 0 ? index : otherSide;
        });
        this.blendFromRotations = this.bones.map(() => new Quaternion());
    }

    /**
     * Pose the skeleton
     *
     * @param elapsedSeconds time since the previous call, which is what looping clips and blends run on
     */
    public update(animation: CharacterAnimation, elapsedSeconds: number): void {
        const upperLayer = animation.upperBody ?? animation.body;

        this.enterClip(this.lowerBody, animation.body, false, elapsedSeconds);
        this.enterClip(this.upperBody, upperLayer, true, elapsedSeconds);
        this.advanceLoops(animation.body, upperLayer, elapsedSeconds);

        const lowerClip = this.clips.get(animation.body.clip);
        const upperClip = this.clips.get(upperLayer.clip);

        for (let index = 0; index < this.bones.length; index++) {
            const isUpper = this.isUpperBody[index];
            const layer = isUpper ? upperLayer : animation.body;
            const clip = isUpper ? upperClip : lowerClip;
            const region = isUpper ? this.upperBody : this.lowerBody;
            const bone = this.bones[index];
            // A mirrored pose gives each bone what the clip does to the bone opposite, reflected
            const rotationTrack = clip?.rotations[layer.mirrored ? this.mirrorBone[index] : index];

            if (clip && rotationTrack && bone.rotationQuaternion) {
                this.sampledRotation.copyFrom(rotationTrack.evaluate(this.getTrackFrame(rotationTrack, clip, layer)));
                if (layer.mirrored) {
                    this.sampledRotation.y = -this.sampledRotation.y;
                    this.sampledRotation.z = -this.sampledRotation.z;
                }
                Quaternion.SlerpToRef(this.blendFromRotations[index], this.sampledRotation, region.blend, bone.rotationQuaternion);
            }

            if (clip?.hipsPosition && index === this.hipsIndex) {
                this.sampledPosition.copyFrom(clip.hipsPosition.evaluate(this.getTrackFrame(clip.hipsPosition, clip, layer)));
                if (layer.mirrored) this.sampledPosition.x = -this.sampledPosition.x;
                if (layer.inPlace) {
                    // Keep only the rise and fall of the hips
                    const start = this.hipsStart.copyFrom(clip.hipsStart);
                    if (layer.mirrored) start.x = -start.x;
                    const rise = Vector3.Dot(this.sampledPosition.subtractInPlace(start), this.hipsUp);
                    this.hipsUp.scaleToRef(rise, this.sampledPosition).addInPlace(start);
                }
                Vector3.LerpToRef(this.blendFromHipsPosition, this.sampledPosition, region.blend, bone.position);
            }
        }
    }

    /**
     * The skeleton sits under nodes that turn and scale it, so "up" for the hips is not simply +Y
     */
    private findHipsUp(hips: TransformNode): void {
        const parent = hips.parent as TransformNode | null;
        if (!parent) return;

        const worldToParent = Matrix.Invert(parent.computeWorldMatrix(true));
        Vector3.TransformNormalToRef(Vector3.Up(), worldToParent, this.hipsUp);
        this.hipsUp.normalize();
    }

    /**
     * Note the clip a region is to show. On a change, the pose on screen becomes what the new clip blends in from.
     */
    private enterClip(region: Region, layer: AnimationLayer, isUpper: boolean, elapsedSeconds: number): void {
        if (!this.clips.has(layer.clip)) return;

        const shown = `${layer.clip}${layer.mirrored ? ' mirrored' : ''}`;
        if (region.shown === shown) {
            region.blend = Math.min(1, region.blend + elapsedSeconds / BLEND_SECONDS);

            return;
        }

        // Nothing has been shown yet the first time round, so there is nothing to blend from
        region.blend = region.shown === null ? 1 : 0;
        region.shown = shown;

        for (let index = 0; index < this.bones.length; index++) {
            if (this.isUpperBody[index] !== isUpper) continue;

            const bone = this.bones[index];
            if (bone.rotationQuaternion) this.blendFromRotations[index].copyFrom(bone.rotationQuaternion);
            if (index === this.hipsIndex) this.blendFromHipsPosition.copyFrom(bone.position);
        }
    }

    /**
     * Run the clock of each looping clip in use; one that was not in use starts again from its first frame
     */
    private advanceLoops(body: AnimationLayer, upperLayer: AnimationLayer, elapsedSeconds: number): void {
        const previousFrames = this.loopFrames;
        this.loopFrames = new Map();

        for (const layer of [body, upperLayer]) {
            const clip = this.clips.get(layer.clip);
            if (layer.frame !== null || !clip || this.loopFrames.has(layer.clip)) continue;

            const previousFrame = previousFrames.get(layer.clip);
            const frame = previousFrame === undefined ? 0 : previousFrame + elapsedSeconds * CLIP_FRAMES_PER_SECOND * layer.speed;
            this.loopFrames.set(layer.clip, clip.length > 0 ? frame % clip.length : 0);
        }
    }

    /**
     * Turn a layer's frame, counted from the start of the clip, into a frame on one of the clip's tracks
     */
    private getTrackFrame(track: Animation, clip: Clip, layer: AnimationLayer): number {
        const clipFrame = Math.min(clip.length, Math.max(0, layer.frame ?? this.loopFrames.get(layer.clip) ?? 0));

        return track.getKeys()[0].frame + clipFrame * track.framePerSecond / CLIP_FRAMES_PER_SECOND;
    }
}

/** Mixamo prefixes its bone names, as in `mixamorig:Hips` */
function isNamed(bone: TransformNode, name: string): boolean {
    return bone.name === name || bone.name.endsWith(`:${name}`);
}

/** `mixamorig:LeftArm` and `mixamorig:RightArm` are each other's mirror image */
function swapSide(boneName: string): string {
    return boneName.includes('Left') ? boneName.replace('Left', 'Right') : boneName.replace('Right', 'Left');
}

/**
 * From the first spine bone up: torso, arms and head. The hips and legs are the rest.
 */
function isInUpperBody(bone: TransformNode): boolean {
    for (let node: TransformNode | null = bone; node; node = node.parent as TransformNode | null) {
        if (isNamed(node, 'Spine')) return true;
    }

    return false;
}
