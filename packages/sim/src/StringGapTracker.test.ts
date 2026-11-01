import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK, STANCES, getMove } from '@flowing-fist/content';
import type { MoveDefinition, Stance } from '@flowing-fist/content';
import { Button, encodeInput } from './input';
import type { InputFrame } from './input';
import { PI } from './math';
import { StringGapTracker } from './StringGapTracker';
import type { StringGap } from './StringGapTracker';
import { cloneWorld, createCharacter, createWorld } from './state';
import type { WorldState } from './state';
import { stepWorld } from './step';
import { MAX_HEALTH } from './tuning';

const NO_INPUT = encodeInput(0, 0, 0, 0);
const ATTACK = encodeInput(Button.Attack, 0, 0, 0);
const PARRY = encodeInput(Button.Parry, 0, 0, 0);
/** Within reach of every hitbox in the game */
const DEFENDER_DISTANCE = 1.5;

function move(id: string): MoveDefinition {
    const definition = getMove(id);
    if (!definition) throw new Error(`Unknown move ${id}`);

    return definition;
}

/**
 * When the attacker presses for the second attack: early (which waits for the whole
 * recovery), or on a tick of the gold link window, counted from its start
 */
type PressTiming = { kind: 'early' } | { kind: 'gold'; windowTick: number };

interface StringRun {
    gaps: StringGap[];
    /** The tick on which the follow-up landed, or -1 */
    hitTick: number;
    world: WorldState;
}

/**
 * The attacker plays the first two attacks of a stance's sequence on a defender held
 * straight in front, so that every attack lands on its first active tick and only
 * the timing decides the gap
 *
 * @param defenderPressTick a tick (world.tick) on which the defender presses parry
 */
function playString(stance: Stance, timing: PressTiming, defenderPressTick: number = -1): StringRun {
    const world = createWorld(50, [
        createCharacter(0, 0, 0),
        createCharacter(0, DEFENDER_DISTANCE, PI)
    ], [DEFAULT_DECK, DEFAULT_DECK]);
    const [attacker, defender] = world.characters;
    attacker.stance = STANCES.indexOf(stance);
    const first = move(DEFAULT_DECK.sequences[stance][0]);
    // Not on the tick right after the first press, where the button would still be held
    const pressTick = timing.kind === 'early'
        ? 2
        : first.startupTicks + first.activeTicks + first.goldLinkStartTick + timing.windowTick;

    const tracker = new StringGapTracker();
    const gaps: StringGap[] = [];
    let hitTick = -1;
    let hasPressedAgain = false;

    for (let i = 0; i < 200 && gaps.length === 0; i++) {
        const isFirstPress = i === 0;
        const isSecondPress: boolean = !isFirstPress && !hasPressedAgain && attacker.moveTick === pressTick;
        hasPressedAgain ||= isSecondPress;
        const attackerInput: InputFrame = isFirstPress || isSecondPress ? ATTACK : NO_INPUT;
        const defenderInput = world.tick === defenderPressTick ? PARRY : NO_INPUT;

        const previous = cloneWorld(world);
        stepWorld(world, [attackerInput, defenderInput]);
        const landed = tracker.observe(previous, world);
        if (landed.length > 0) hitTick = previous.tick;
        gaps.push(...landed);

        // Hold the defender at the same distance so neither advance nor pushback takes them out of reach
        defender.x = attacker.x;
        defender.z = attacker.z + DEFENDER_DISTANCE;
    }

    return { gaps, hitTick, world };
}

describe('StringGapTracker', () => {
    const jab = move('jab');
    const cross = move('cross');

    it('measures a chain that waits for the whole recovery', () => {
        const { gaps } = playString('front-right', { kind: 'early' });

        expect(gaps).toHaveLength(1);
        expect(gaps[0]).toMatchObject({ attackerIndex: 0, previousMoveName: 'Jab', moveName: 'Cross', afterBlock: false, goldLinked: false });
        expect(gaps[0].gapTicks).toBe(jab.activeTicks + jab.recoveryTicks + cross.startupTicks - jab.hitStunTicks);
    });

    it('measures a gold link as a gap shorter by the recovery it cut', () => {
        const { gaps } = playString('front-right', { kind: 'gold', windowTick: 0 });

        expect(gaps).toHaveLength(1);
        expect(gaps[0].goldLinked).toBe(true);
        expect(gaps[0].gapTicks).toBe(jab.activeTicks + jab.goldLinkStartTick + cross.startupTicks - jab.hitStunTicks);
    });

    it('counts the ticks in which a parry would beat the follow-up', () => {
        const unhindered = playString('front-right', { kind: 'early' });
        const { gapTicks } = unhindered.gaps[0];
        expect(gapTicks).toBeGreaterThan(0);

        // With a gap of g ticks the defender's first chance is g - 1 ticks before the hit
        const firstChance = unhindered.hitTick - gapTicks + 1;
        const parried = playString('front-right', { kind: 'early' }, firstChance);
        expect(parried.gaps).toHaveLength(0);
        expect(parried.world.characters[1].health).toBe(MAX_HEALTH - jab.damage);

        // A tick sooner the defender is still stunned, and the press does nothing
        const tooSoon = playString('front-right', { kind: 'early' }, firstChance - 1);
        expect(tooSoon.gaps).toHaveLength(1);
    });

    it('counts a gold link into a fast follow-up as a combo', () => {
        const { gaps } = playString('front-right', { kind: 'gold', windowTick: 0 });

        expect(gaps[0].gapTicks).toBeLessThanOrEqual(0);
    });

    // Each sequence's first link, the way the default deck plays it
    describe.each(['front-right', 'front-left', 'back-right'] as Stance[])('the %s sequence', (stance) => {
        const [firstId, secondId] = DEFAULT_DECK.sequences[stance];
        const first = move(firstId);
        const second = move(secondId);

        it('shortens the gap by the recovery a gold link cuts', () => {
            const early = playString(stance, { kind: 'early' }).gaps[0];
            const gold = playString(stance, { kind: 'gold', windowTick: 0 }).gaps[0];
            const lastGold = playString(stance, { kind: 'gold', windowTick: first.goldLinkTicks - 1 }).gaps[0];

            expect(early.gapTicks).toBe(first.activeTicks + first.recoveryTicks + second.startupTicks - first.hitStunTicks);
            expect(early.gapTicks - gold.gapTicks).toBe(first.recoveryTicks - first.goldLinkStartTick);
            expect(lastGold.gapTicks - gold.gapTicks).toBe(first.goldLinkTicks - 1);
        });
    });
});
