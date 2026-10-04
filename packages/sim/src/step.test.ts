import { describe, expect, it } from 'vitest';
import { TICK_RATE } from './FixedTimestep';
import { Button, encodeInput } from './input';
import type { InputFrame } from './input';
import { DEFAULT_DECK } from '@flowing-fist/content';
import { PI } from './math';
import { cloneWorld, createCharacter, createWorld, hashWorld } from './state';
import type { WorldState } from './state';
import { stepWorld } from './step';
import { CHARACTER_RADIUS, DODGE_COOLDOWN_TICKS, DODGE_SPEED, DODGE_TICKS, RUN_SPEED, WALK_SPEED } from './tuning';

const ARENA_RADIUS = 50;

function createDuel(): WorldState {
    return createWorld(ARENA_RADIUS, [
        createCharacter(0, 0, 0),
        createCharacter(0, 10, PI)
    ], [DEFAULT_DECK, DEFAULT_DECK]);
}

function run(world: WorldState, ticks: number, input: InputFrame): void {
    for (let i = 0; i < ticks; i++) {
        stepWorld(world, [input]);
    }
}

describe('stepWorld locomotion', () => {
    it('walks forward along the camera yaw', () => {
        const world = createDuel();
        run(world, TICK_RATE, encodeInput(0, 0, 1, PI / 2));

        const player = world.characters[0];
        expect(player.x).toBeCloseTo(WALK_SPEED, 3);
        expect(player.z).toBeCloseTo(0, 3);
        expect(player.yaw).toBeCloseTo(PI / 2, 3);
        expect(player.moveForward).toBeCloseTo(1, 3);
        expect(player.moveRight).toBeCloseTo(0, 3);
    });

    it('strafes right towards +X when the camera looks along +Z', () => {
        const world = createDuel();
        run(world, TICK_RATE, encodeInput(0, 1, 0, 0));

        const player = world.characters[0];
        expect(player.x).toBeCloseTo(WALK_SPEED, 3);
        expect(player.z).toBeCloseTo(0, 3);
        expect(player.moveRight).toBeCloseTo(1, 3);
    });

    it('runs faster than it walks and is no faster diagonally', () => {
        const world = createDuel();
        run(world, TICK_RATE, encodeInput(Button.Run, 1, -1, 0));

        const player = world.characters[0];
        expect(player.running).toBe(true);
        expect(Math.hypot(player.x, player.z)).toBeCloseTo(RUN_SPEED, 3);
    });

    it('keeps its facing when input stops', () => {
        const world = createDuel();
        run(world, 10, encodeInput(0, 0, 1, 1));
        run(world, 10, encodeInput(0, 0, 0, 2));

        expect(world.characters[0].yaw).toBeCloseTo(1, 3);
        expect(world.characters[0].moveForward).toBe(0);
    });

    it('cannot leave the arena', () => {
        const world = createDuel();
        run(world, TICK_RATE * 30, encodeInput(Button.Run, 0, 1, PI / 2));

        expect(world.characters[0].x).toBeCloseTo(ARENA_RADIUS - CHARACTER_RADIUS, 3);
    });

    it('cannot walk through the other character', () => {
        const world = createDuel();
        run(world, TICK_RATE * 10, encodeInput(0, 0, 1, 0));

        const [player, dummy] = world.characters;
        expect(Math.hypot(dummy.x - player.x, dummy.z - player.z)).toBeGreaterThanOrEqual(CHARACTER_RADIUS * 2 - 1e-9);
    });
});

describe('stepWorld dodge', () => {
    it('travels a fixed distance in the direction held when it started', () => {
        const world = createDuel();
        stepWorld(world, [encodeInput(Button.Dodge, 1, 0, 0)]);
        // Steering and releasing the button must not change the dodge
        run(world, DODGE_TICKS - 1, encodeInput(0, -1, 0, 0));

        const player = world.characters[0];
        expect(player.x).toBeCloseTo(DODGE_SPEED * DODGE_TICKS / TICK_RATE, 3);
        expect(player.dodgeTicks).toBe(0);
        expect(player.dodgeCooldownTicks).toBe(DODGE_COOLDOWN_TICKS);
    });

    it('needs a direction and a fresh press, and respects the cooldown', () => {
        const world = createDuel();
        const player = world.characters[0];

        stepWorld(world, [encodeInput(Button.Dodge, 0, 0, 0)]);
        expect(player.dodgeTicks).toBe(0);

        // Still held from the previous tick, so this is not a new press
        stepWorld(world, [encodeInput(Button.Dodge, 1, 0, 0)]);
        expect(player.dodgeTicks).toBe(0);

        stepWorld(world, [encodeInput(0, 1, 0, 0)]);
        stepWorld(world, [encodeInput(Button.Dodge, 1, 0, 0)]);
        expect(player.dodgeTicks).toBe(DODGE_TICKS - 1);

        run(world, DODGE_TICKS, encodeInput(0, 1, 0, 0));
        stepWorld(world, [encodeInput(Button.Dodge, 1, 0, 0)]);
        expect(player.dodgeTicks).toBe(0);

        run(world, DODGE_COOLDOWN_TICKS, encodeInput(0, 1, 0, 0));
        stepWorld(world, [encodeInput(Button.Dodge, 1, 0, 0)]);
        expect(player.dodgeTicks).toBe(DODGE_TICKS - 1);
    });
});

describe('stepWorld lock-on', () => {
    it('faces the target while locked and strafes around it', () => {
        const world = createDuel();
        const [player, dummy] = world.characters;

        stepWorld(world, [encodeInput(Button.LockOn, 0, 0, 0)]);
        expect(player.lockedOn).toBe(true);

        // Half a second: the camera is fixed here, so a longer strafe would curve away from sideways
        run(world, TICK_RATE / 2 - 1, encodeInput(Button.LockOn, 1, 0, 0));
        // Facing is taken from where the character stands at the start of the tick
        const expectedYaw = Math.atan2(dummy.x - player.x, dummy.z - player.z);
        run(world, 1, encodeInput(Button.LockOn, 1, 0, 0));

        expect(player.x).toBeGreaterThan(1);
        expect(player.yaw).toBeCloseTo(expectedYaw, 3);
        expect(player.moveRight).toBeGreaterThan(0.9);
    });

    it('toggles off on the next press', () => {
        const world = createDuel();

        stepWorld(world, [encodeInput(Button.LockOn, 0, 0, 0)]);
        stepWorld(world, [encodeInput(0, 0, 0, 0)]);
        stepWorld(world, [encodeInput(Button.LockOn, 0, 0, 0)]);

        expect(world.characters[0].lockedOn).toBe(false);
    });

    it('cannot lock on with nobody else in the world', () => {
        const world = createWorld(ARENA_RADIUS, [createCharacter(0, 0, 0)], [DEFAULT_DECK]);
        stepWorld(world, [encodeInput(Button.LockOn, 0, 0, 0)]);

        expect(world.characters[0].lockedOn).toBe(false);
    });
});

describe('determinism', () => {
    function scriptedInput(tick: number): InputFrame {
        const buttons = (tick % 90 === 0 ? Button.Dodge : 0)
            | (tick % 200 < 100 ? Button.Run : 0)
            | (tick === 150 ? Button.LockOn : 0)
            | (tick % 37 < 2 ? Button.Attack : 0)
            | (tick % 113 === 0 ? Button.Alternate : 0)
            | (tick % 300 > 250 ? Button.Guard : 0);

        return encodeInput(buttons, ((tick * 7) % 21 - 10) / 10, ((tick * 3) % 21 - 10) / 10, tick * 0.031);
    }

    it('produces the same hash every tick when replaying the same inputs', () => {
        const first = createDuel();
        const second = createDuel();

        for (let tick = 0; tick < 600; tick++) {
            stepWorld(first, [scriptedInput(tick), scriptedInput(tick + 40)]);
            stepWorld(second, [scriptedInput(tick), scriptedInput(tick + 40)]);
            expect(hashWorld(second)).toBe(hashWorld(first));
        }
    });

    it('resumes identically from a cloned world', () => {
        const world = createDuel();
        for (let tick = 0; tick < 100; tick++) {
            stepWorld(world, [scriptedInput(tick)]);
        }

        const snapshot = cloneWorld(world);
        const hashAtSnapshot = hashWorld(snapshot);

        for (let tick = 100; tick < 200; tick++) {
            stepWorld(world, [scriptedInput(tick)]);
        }
        expect(hashWorld(snapshot)).toBe(hashAtSnapshot);

        for (let tick = 100; tick < 200; tick++) {
            stepWorld(snapshot, [scriptedInput(tick)]);
        }
        expect(hashWorld(snapshot)).toBe(hashWorld(world));
    });
});
