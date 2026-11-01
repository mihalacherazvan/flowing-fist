import { MOVE_LIST } from '@flowing-fist/content';
import { StunKind } from './state';
import type { CharacterState, WorldState } from './state';

/**
 * How close one attack of a string followed the one before it
 */
export interface StringGap {
    attackerIndex: number;
    /** Name of the attack that stunned the defender */
    previousMoveName: string;
    /** Name of the attack that just landed */
    moveName: string;
    /** The previous attack was blocked, so the gap is measured against block stun */
    afterBlock: boolean;
    /** The attack that just landed was started with a gold link */
    goldLinked: boolean;
    /**
     * Ticks in which the defender could have started a guard, parry or dodge that would
     * have taken effect before this attack landed. 0 or less: it could not be escaped.
     */
    gapTicks: number;
}

interface StunRecord {
    attackerIndex: number;
    moveName: string;
    afterBlock: boolean;
    /** First tick on which the defender can act again */
    freeFromTick: number;
}

/**
 * Watches a fight tick by tick and measures, for each attack that lands while a string
 * is running, how long the defender had to act since the previous one. Diagnostics only:
 * it reads the world and never changes it.
 */
export class StringGapTracker {
    /** Per defender, the latest stun a string put them in */
    private stuns = new Map<number, StunRecord>();
    /** Per attacker, whether the attack in progress was started with a gold link */
    private goldLinked = new Map<number, boolean>();

    /**
     * @param previous the world before the tick
     * @param current the same world after it
     * @returns one entry per follow-up attack that landed on this tick
     */
    public observe(previous: WorldState, current: WorldState): StringGap[] {
        // The tick that was just played
        const tick = current.tick - 1;
        const gaps: StringGap[] = [];

        current.characters.forEach((character, index) => {
            const before = previous.characters[index];

            if (character.moveIndex < 0) {
                // The string is over: whatever it does next starts a new one
                this.goldLinked.delete(index);
                for (const [defenderIndex, record] of this.stuns) {
                    if (record.attackerIndex === index) this.stuns.delete(defenderIndex);
                }
            } else if (StringGapTracker.isNewMove(before, character)) {
                // A chained attack waits for the next tick; only a gold link plays its first tick at once
                this.goldLinked.set(index, before.moveIndex >= 0 && character.moveTick === 1);
            }
        });

        current.characters.forEach((attacker, attackerIndex) => {
            const before = previous.characters[attackerIndex];
            if (attacker.moveIndex < 0 || before.moveHasHit || !attacker.moveHasHit) return;

            const moveName = MOVE_LIST[attacker.moveIndex].name;

            current.characters.forEach((defender, defenderIndex) => {
                if (defenderIndex === attackerIndex) return;

                const record = this.stuns.get(defenderIndex);
                if (record?.attackerIndex === attackerIndex) {
                    gaps.push({
                        attackerIndex,
                        previousMoveName: record.moveName,
                        moveName,
                        afterBlock: record.afterBlock,
                        goldLinked: this.goldLinked.get(attackerIndex) ?? false,
                        // A defender free from tick F can act on F, F + 1, ... up to the tick of the hit
                        gapTicks: tick - record.freeFromTick + 1
                    });
                }

                if (defender.stunTicks > 0) {
                    // Stun counts down from the next tick, and the defender acts on the tick after it ends
                    this.stuns.set(defenderIndex, {
                        attackerIndex,
                        moveName,
                        afterBlock: defender.stunKind === StunKind.Block,
                        freeFromTick: tick + defender.stunTicks + 1
                    });
                } else {
                    // Knocked out or not stunned at all: nothing to follow up on
                    this.stuns.delete(defenderIndex);
                }
            });
        });

        return gaps;
    }

    /**
     * moveTick goes up by one every tick of the same attack, so anything else is a new one
     */
    private static isNewMove(before: CharacterState, after: CharacterState): boolean {
        return before.moveIndex < 0 || after.moveTick !== before.moveTick + 1;
    }
}
