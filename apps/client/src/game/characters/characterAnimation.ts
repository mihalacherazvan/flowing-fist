import { MOVE_LIST } from '@flowing-fist/content';
import type { MoveDefinition } from '@flowing-fist/content';
import { StunKind, tuning } from '@flowing-fist/sim';
import type { CharacterState } from '@flowing-fist/sim';

// Which clip shows which simulation state, and at which frame. No Babylon in
// here: the result is a description that SkeletonAnimator turns into a pose.
//
// Clips are sampled at 60 frames per second, so at natural speed one frame is
// one tick. All frame numbers below count from the start of the clip as
// downloaded, and were read off the clips' own motion (see docs/ASSETS.md).

type Side = 'left' | 'right';

type StrikeClip = 'jab' | 'hook' | 'uppercut' | 'roundhouse-kick' | 'push-kick' | 'flying-kick' | 'sweep';
type ReactionClip = 'block' | 'parry' | 'hit' | 'hit-body' | 'knockout';

/** A clip in the model file; the name is the file name it was built from */
export type ClipName = 'idle'
    | 'run-forward'
    | 'run-backward'
    | 'left-strafe'
    | 'right-strafe'
    | 'step-forward'
    | 'step-backward'
    | 'step-left'
    | 'step-right'
    | `${StrikeClip | ReactionClip}-${Side}`;

export interface AnimationLayer {
    clip: ClipName;
    /** Frame to show, or null to let the clip loop by itself */
    frame: number | null;
    /** Playback rate of a looping clip */
    speed: number;
    /** Keep the hips where the clip starts, because the simulation moves the character */
    inPlace: boolean;
    /** Show the clip as in a mirror: left and right limbs swapped, sideways travel reversed */
    mirrored: boolean;
}

export interface CharacterAnimation {
    body: AnimationLayer;
    /** Shown from the spine up in place of the body layer, or null */
    upperBody: AnimationLayer | null;
    /** Extra turn of the model so diagonal movement leans into the direction of travel */
    twist: number;
}

/**
 * What the view remembers between frames, for the few things the simulation state alone does not tell
 */
export interface AnimationMemory {
    /** The locomotion pose chosen when the dodge in progress began; null when not dodging */
    dodgePose: { clip: ClipName; twist: number } | null;
    /** The stun or knockout being shown, a StunKind value or KNOCKOUT_REACTION; 0 when there is none */
    reactionKind: number;
    /** Tick on which that reaction began */
    reactionStartTick: number;
    lastStunTicks: number;
}

export function createAnimationMemory(): AnimationMemory {
    return { dodgePose: null, reactionKind: StunKind.None, reactionStartTick: 0, lastStunTicks: 0 };
}

const KNOCKOUT_REACTION = -1;

// Below this the character counts as not moving along that axis. It is the sine
// of 22.5 degrees, so a direction within that angle of straight sideways is a strafe
// and one within it of straight ahead is a run; anything between is a diagonal.
const MOVE_THRESHOLD = 0.38;

/** Where a strike's wind-up starts, where it lands and where the limb is back, in each strike clip */
const STRIKE_FRAMES: Record<StrikeClip, { start: number; impact: number; end: number }> = {
    'jab': { start: 12, impact: 27, end: 57 },
    'hook': { start: 18, impact: 39, end: 63 },
    'uppercut': { start: 16, impact: 42, end: 84 },
    'roundhouse-kick': { start: 28, impact: 61, end: 88 },
    'push-kick': { start: 18, impact: 55, end: 88 },
    'flying-kick': { start: 0, impact: 21, end: 60 },
    'sweep': { start: 28, impact: 58, end: 108 }
};

// The side is the striking limb. Each clip was picked so that the foot it starts
// with in front matches the stance the move starts in (right stance, right foot).
// Moves marked "stand-in" have no clip of their own yet and borrow the nearest one.
const MOVE_CLIPS: Record<string, { clip: StrikeClip; side: Side }> = {
    'jab': { clip: 'jab', side: 'right' },
    'hook': { clip: 'hook', side: 'right' },
    'elbow': { clip: 'uppercut', side: 'right' }, // stand-in
    'cross': { clip: 'jab', side: 'left' }, // stand-in
    'low-kick': { clip: 'roundhouse-kick', side: 'left' }, // stand-in
    'uppercut': { clip: 'uppercut', side: 'left' },
    'back-fist': { clip: 'hook', side: 'right' }, // stand-in
    'roundhouse': { clip: 'roundhouse-kick', side: 'right' },
    'push-kick': { clip: 'push-kick', side: 'left' },
    'side-kick': { clip: 'push-kick', side: 'right' }, // stand-in
    'spin-kick': { clip: 'flying-kick', side: 'left' }, // stand-in
    'sweep': { clip: 'sweep', side: 'right' }
};

/** The block clips stand in guard for their first second, then take a hit */
const GUARD_FRAME = 30;
const BLOCK_REACTION = { start: 68, end: 115, framesPerTick: 2 };
/** The head snaps back */
const HIT_REACTION = { start: 4, end: 45, framesPerTick: 1 };
/** Doubled over: a broken guard, or an attack that was parried */
const STAGGER_REACTION = { start: 8, end: 76, framesPerTick: 1 };
const KNOCKOUT_LAST_FRAME = 128;
/** The arm starts up, is across the body as the parry window closes, and is back down */
const PARRY_FRAMES = { start: 6, windowEnd: 33, end: 72 };
// At twice its own pace the forward step covers exactly the 3 units a second of a locked-on
// or guarded walk. The other steps are shorter and slide a little; any faster looks frantic.
const STEP_PLAYBACK_SPEED = 2;

function lerp(from: number, to: number, amount: number): number {
    return from + (to - from) * Math.min(1, Math.max(0, amount));
}

function held(clip: ClipName, frame: number, inPlace = false): AnimationLayer {
    return { clip, frame, speed: 1, inPlace, mirrored: false };
}

function looping(clip: ClipName, speed: number, options: { inPlace?: boolean; mirrored?: boolean } = {}): AnimationLayer {
    return { clip, frame: null, speed, inPlace: options.inPlace ?? false, mirrored: options.mirrored ?? false };
}

/**
 * The side of the foot in front: stances alternate right, left in STANCES
 */
function stanceSide(character: CharacterState): Side {
    return character.stance % 2 === 0 ? 'right' : 'left';
}

/**
 * The clip a move plays, with its side; undefined for a move nobody has given a clip
 */
export function getMoveClip(moveId: string): ClipName | undefined {
    const entry = MOVE_CLIPS[moveId];

    return entry && `${entry.clip}-${entry.side}`;
}

/**
 * Frame of a move's clip after `elapsedTicks` of the move. The clip is stretched so that
 * its strike lands exactly when the move's startup ends, whatever the clip's own pace.
 */
export function getStrikeFrame(move: MoveDefinition, elapsedTicks: number): number {
    const frames = STRIKE_FRAMES[MOVE_CLIPS[move.id].clip];

    if (elapsedTicks <= move.startupTicks) {
        return lerp(frames.start, frames.impact, elapsedTicks / move.startupTicks);
    }

    const ticksAfterImpact = move.activeTicks + move.recoveryTicks;

    return lerp(frames.impact, frames.end, (elapsedTicks - move.startupTicks) / ticksAfterImpact);
}

/**
 * Walking while locked on: short steps that keep the body square to the opponent
 */
function chooseStep(character: CharacterState): AnimationLayer | null {
    const isStepping = character.lockedOn && !character.running && character.dodgeTicks === 0;
    if (!isStepping || (character.moveForward === 0 && character.moveRight === 0)) return null;

    // The step clips stand left foot in front, so a right stance shows them mirrored,
    // and a mirrored step to the left travels right
    const mirrored = stanceSide(character) === 'right';
    const isRightwards = (character.moveRight > 0) !== mirrored;

    // On a diagonal the steps forward and back win, as the sideways ones cover less ground
    const clip: ClipName = Math.abs(character.moveForward) >= Math.abs(character.moveRight)
        ? (character.moveForward > 0 ? 'step-forward' : 'step-backward')
        : (isRightwards ? 'step-right' : 'step-left');

    return looping(clip, STEP_PLAYBACK_SPEED, { inPlace: true, mirrored });
}

function chooseLocomotion(character: CharacterState, memory: AnimationMemory): { layer: AnimationLayer; twist: number } {
    const step = chooseStep(character);
    if (step) {
        memory.dodgePose = null;

        return { layer: step, twist: 0 };
    }

    const forward = Math.abs(character.moveForward) > MOVE_THRESHOLD ? Math.sign(character.moveForward) : 0;
    const right = Math.abs(character.moveRight) > MOVE_THRESHOLD ? Math.sign(character.moveRight) : 0;

    let clip: ClipName = 'idle';
    let twist = 0;

    if (forward > 0 && right === 0) {
        clip = 'run-forward';
    } else if (forward < 0) {
        clip = 'run-backward';
        twist = -right * Math.PI / 4;
    } else if (right !== 0) {
        clip = right > 0 ? 'right-strafe' : 'left-strafe';
        twist = forward > 0 ? -right * Math.PI / 4 : 0;
    }

    // A dodge keeps its direction while the character may keep turning (towards a
    // locked-on opponent, say), so its direction relative to the facing drifts.
    // Hold the pose it started with rather than sliding into another animation.
    if (character.dodgeTicks === 0) {
        memory.dodgePose = null;
    } else {
        memory.dodgePose ??= { clip, twist };
        ({ clip, twist } = memory.dodgePose);
    }

    const speed = character.running ? 1.5 : character.dodgeTicks > 0 ? 0.3 : 1;
    // The idle stands left foot in front; mirrored, it is the idle of the right stances
    const mirrored = clip === 'idle' && stanceSide(character) === 'right';

    return { layer: looping(clip, speed, { mirrored }), twist };
}

/**
 * Ticks since the stun or knockout the character is in began, or null when it is in neither.
 * The simulation only counts stuns down, and in a match does not count a knockout at all,
 * so the start is remembered here.
 */
function getReactionTicks(character: CharacterState, memory: AnimationMemory, time: number, tick: number): number | null {
    const kind = character.knockoutTicks > 0 ? KNOCKOUT_REACTION : character.stunTicks > 0 ? character.stunKind : StunKind.None;
    // A stun that grew is a new hit landing on a character already stunned
    const isNewReaction = kind !== memory.reactionKind || character.stunTicks > memory.lastStunTicks;

    if (isNewReaction) {
        memory.reactionKind = kind;
        // The state shown is the one the previous tick ended in, on its way to this one
        memory.reactionStartTick = tick - 1;
    }
    memory.lastStunTicks = character.stunTicks;

    return kind === StunKind.None ? null : Math.max(0, time - memory.reactionStartTick);
}

function reactionFrame(reaction: { start: number; end: number; framesPerTick: number }, ticks: number): number {
    return Math.min(reaction.end, reaction.start + ticks * reaction.framesPerTick);
}

/**
 * Pick what to show for a character.
 *
 * @param tick  the world tick `character` belongs to
 * @param alpha how far the picture is between the previous tick (0) and this one (1)
 */
export function chooseAnimation(character: CharacterState, memory: AnimationMemory, tick: number, alpha: number): CharacterAnimation {
    const side = stanceSide(character);
    const time = tick - 1 + alpha;
    const locomotion = chooseLocomotion(character, memory);
    const reactionTicks = getReactionTicks(character, memory, time, tick);
    const fullBody = (body: AnimationLayer): CharacterAnimation => ({ body, upperBody: null, twist: 0 });

    if (reactionTicks !== null) {
        switch (memory.reactionKind) {
        case KNOCKOUT_REACTION:
            return fullBody(held(`knockout-${side}`, Math.min(KNOCKOUT_LAST_FRAME, reactionTicks), true));
        case StunKind.Hit:
            return fullBody(held(`hit-${side}`, reactionFrame(HIT_REACTION, reactionTicks), true));
        case StunKind.Block:
            return fullBody(held(`block-${side}`, reactionFrame(BLOCK_REACTION, reactionTicks), true));
        default:
            return fullBody(held(`hit-body-${side}`, reactionFrame(STAGGER_REACTION, reactionTicks), true));
        }
    }

    const move = character.moveIndex >= 0 ? MOVE_LIST[character.moveIndex] : undefined;
    const moveClip = move && getMoveClip(move.id);
    if (move && moveClip) {
        // moveTick counts ticks already played, so the latest one is moveTick - 1
        return fullBody(held(moveClip, getStrikeFrame(move, Math.max(0, character.moveTick - 1 + alpha)), true));
    }

    if (character.parryTicks > 0) {
        const ticks = Math.max(0, tuning.PARRY_TICKS - character.parryTicks - 1 + alpha);
        const frame = ticks <= tuning.PARRY_WINDOW_TICKS
            ? lerp(PARRY_FRAMES.start, PARRY_FRAMES.windowEnd, ticks / tuning.PARRY_WINDOW_TICKS)
            : lerp(PARRY_FRAMES.windowEnd, PARRY_FRAMES.end, (ticks - tuning.PARRY_WINDOW_TICKS) / (tuning.PARRY_TICKS - tuning.PARRY_WINDOW_TICKS));

        return fullBody(held(`parry-${side}`, frame, true));
    }

    if (character.guarding && character.dodgeTicks === 0) {
        const guard = held(`block-${side}`, GUARD_FRAME, true);
        const isMoving = character.moveForward !== 0 || character.moveRight !== 0;

        // Standing still the whole body takes the guard; on the move the legs keep walking under it
        return isMoving ? { body: locomotion.layer, upperBody: guard, twist: locomotion.twist } : fullBody(guard);
    }

    return { body: locomotion.layer, upperBody: null, twist: locomotion.twist };
}
