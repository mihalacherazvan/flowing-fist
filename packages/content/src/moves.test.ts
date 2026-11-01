import { describe, expect, it } from 'vitest';
import { MOVE_LIST } from './moves';
import type { MoveDefinition } from './moves';

// The gold link follows Absolver: it saves a few ticks, and whether a string
// becomes a combo is decided move by move, through hit stun.

/** A gold link never cuts more than this much recovery */
const MAX_GOLD_LINK_SAVING_TICKS = 9;
/** A gold link pressed as its window opens turns a follow-up this fast or faster into a combo */
const GOLD_LINK_COMBO_STARTUP_TICKS = 14;

const fastestStartupTicks = Math.min(...MOVE_LIST.map((move) => move.startupTicks));

/**
 * Ticks the defender is still stunned when the attacker can start its next attack,
 * after a hit on the first active tick
 *
 * @param recoveryPlayed the recovery ticks played before the next attack starts
 */
function advantageOnHit(move: MoveDefinition, recoveryPlayed: number): number {
    return move.hitStunTicks - move.activeTicks - recoveryPlayed;
}

describe.each(MOVE_LIST.map((move) => [move.id, move] as const))('%s', (_id, move) => {
    it('saves at most a few ticks with a gold link', () => {
        expect(move.recoveryTicks - move.goldLinkStartTick).toBeLessThanOrEqual(MAX_GOLD_LINK_SAVING_TICKS);
        expect(move.goldLinkStartTick + move.goldLinkTicks).toBeLessThanOrEqual(move.recoveryTicks);
    });

    it('leaves a gap before any follow-up chained without a gold link', () => {
        expect(advantageOnHit(move, move.recoveryTicks)).toBeLessThan(fastestStartupTicks);
    });

    it('combos into fast follow-ups with a gold link', () => {
        expect(advantageOnHit(move, move.goldLinkStartTick)).toBeGreaterThanOrEqual(GOLD_LINK_COMBO_STARTUP_TICKS);
    });
});
