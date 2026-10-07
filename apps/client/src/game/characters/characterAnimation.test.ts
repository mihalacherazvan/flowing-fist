import { describe, expect, it } from 'vitest';
import { MOVE_LIST, getMoveIndex } from '@flowing-fist/content';
import { StunKind, createCharacter, tuning } from '@flowing-fist/sim';
import type { CharacterState } from '@flowing-fist/sim';
import { chooseAnimation, createAnimationMemory, getMoveClip, getStrikeFrame } from './characterAnimation';

function character(changes: Partial<CharacterState> = {}): CharacterState {
    return { ...createCharacter(0, 0, 0), ...changes };
}

describe('move clips', () => {
    it('gives every move a clip', () => {
        for (const move of MOVE_LIST) {
            expect(getMoveClip(move.id), move.id).toBeDefined();
        }
    });

    it('lands the strike as the startup ends and runs forward through the whole move', () => {
        for (const move of MOVE_LIST) {
            const totalTicks = move.startupTicks + move.activeTicks + move.recoveryTicks;
            const frames = Array.from({ length: totalTicks + 1 }, (_, tick) => getStrikeFrame(move, tick));

            for (let tick = 1; tick <= totalTicks; tick++) {
                expect(frames[tick], `${move.id} tick ${tick}`).toBeGreaterThan(frames[tick - 1]);
            }
            // The jab's strike is at frame 27 of its clip
            if (move.id === 'jab') expect(frames[move.startupTicks]).toBe(27);
        }
    });
});

describe('chooseAnimation', () => {
    it('mirrors the idle, which stands left foot in front, in the right stances', () => {
        expect(chooseAnimation(character({ stance: 0 }), createAnimationMemory(), 10, 1).body).toMatchObject({ clip: 'idle', mirrored: true });
        expect(chooseAnimation(character({ stance: 3 }), createAnimationMemory(), 10, 1).body).toMatchObject({ clip: 'idle', mirrored: false });
    });

    it('strafes with the clip of the side travelled to', () => {
        const animation = chooseAnimation(character({ moveRight: 1 }), createAnimationMemory(), 10, 1);

        expect(animation.body).toMatchObject({ clip: 'right-strafe', frame: null });
    });

    it('steps instead of running while locked on, without turning into diagonals', () => {
        const circling = chooseAnimation(character({ stance: 1, lockedOn: true, moveRight: -1 }), createAnimationMemory(), 10, 1);
        expect(circling.body).toMatchObject({ clip: 'step-left', frame: null, inPlace: true, mirrored: false });

        // In a right stance the steps are mirrored, and it is the mirrored step to the right that travels left
        const mirrored = chooseAnimation(character({ stance: 0, lockedOn: true, moveRight: -1 }), createAnimationMemory(), 10, 1);
        expect(mirrored.body).toMatchObject({ clip: 'step-right', mirrored: true });

        const diagonal = chooseAnimation(character({ lockedOn: true, moveRight: 0.7, moveForward: -0.7 }), createAnimationMemory(), 10, 1);
        expect(diagonal.body.clip).toBe('step-backward');
        expect(diagonal.twist).toBe(0);

        const running = chooseAnimation(character({ lockedOn: true, moveForward: 1, running: true }), createAnimationMemory(), 10, 1);
        expect(running.body.clip).toBe('run-forward');
    });

    it('shows an attack at the frame its tick dictates, in place', () => {
        const jab = MOVE_LIST[getMoveIndex('jab')];
        const state = character({ moveIndex: getMoveIndex('jab'), moveTick: jab.startupTicks });
        const animation = chooseAnimation(state, createAnimationMemory(), 10, 1);

        expect(animation.body).toEqual({ clip: 'jab-right', frame: 27, speed: 1, inPlace: true, mirrored: false });
        expect(animation.upperBody).toBeNull();
    });

    it('keeps the guard up over walking legs, and takes the whole body when standing', () => {
        const walking = chooseAnimation(character({ guarding: true, moveForward: 1 }), createAnimationMemory(), 10, 1);
        expect(walking.body.clip).toBe('run-forward');
        expect(walking.upperBody?.clip).toBe('block-right');

        const standing = chooseAnimation(character({ guarding: true }), createAnimationMemory(), 10, 1);
        expect(standing.body.clip).toBe('block-right');
        expect(standing.upperBody).toBeNull();
    });

    it('plays a hit reaction forward from the tick it began, and again on a second hit', () => {
        const memory = createAnimationMemory();
        const first = chooseAnimation(character({ stunKind: StunKind.Hit, stunTicks: 20 }), memory, 100, 1);
        const later = chooseAnimation(character({ stunKind: StunKind.Hit, stunTicks: 15 }), memory, 105, 1);
        const hitAgain = chooseAnimation(character({ stunKind: StunKind.Hit, stunTicks: 24 }), memory, 106, 1);

        expect(first.body.clip).toBe('hit-right');
        expect(later.body.frame).toBe(first.body.frame! + 5);
        expect(hitAgain.body.frame).toBe(first.body.frame);
    });

    it('lets a knockout fall although a match never counts it down', () => {
        const memory = createAnimationMemory();
        const down = character({ knockoutTicks: tuning.KNOCKOUT_TICKS });

        expect(chooseAnimation(down, memory, 100, 1).body).toMatchObject({ clip: 'knockout-right', frame: 1 });
        expect(chooseAnimation(down, memory, 150, 1).body.frame).toBe(51);
        // and stays on the ground at the end of the clip
        expect(chooseAnimation(down, memory, 900, 1).body.frame).toBe(128);
    });

    it('has the parrying arm across the body as the window closes', () => {
        const state = character({ parryTicks: tuning.PARRY_TICKS - tuning.PARRY_WINDOW_TICKS });

        expect(chooseAnimation(state, createAnimationMemory(), 10, 1).body).toMatchObject({ clip: 'parry-right', frame: 33 });
    });
});
