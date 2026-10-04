import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK, STANCES, getMove } from '@flowing-fist/content';
import type { MoveDefinition } from '@flowing-fist/content';
import { getCurrentMove, getMovePhase } from './combat';
import { Button, encodeInput } from './input';
import type { InputFrame } from './input';
import { PI } from './math';
import { StunKind, createCharacter, createWorld } from './state';
import type { CharacterState, WorldState } from './state';
import { stepWorld } from './step';
import {
    BLOCK_PUSHBACK,
    DODGE_STAMINA_COST,
    GUARD_BREAK_STUN_TICKS,
    HIT_PUSHBACK,
    KNOCKOUT_TICKS,
    MAX_HEALTH,
    MAX_STAMINA,
    STAMINA_REGEN_DELAY_TICKS
} from './tuning';

const NO_INPUT = encodeInput(0, 0, 0, 0);
const ATTACK = encodeInput(Button.Attack, 0, 0, 0);
const ALTERNATE = encodeInput(Button.Alternate, 0, 0, 0);
const GUARD = encodeInput(Button.Guard, 0, 0, 0);

function move(id: string): MoveDefinition {
    const definition = getMove(id);
    if (!definition) throw new Error(`Unknown move ${id}`);

    return definition;
}

function totalTicks(id: string): number {
    const definition = move(id);

    return definition.startupTicks + definition.activeTicks + definition.recoveryTicks;
}

/**
 * Attacker at the origin facing +Z, defender facing back at them
 */
function createFight(distance: number): { world: WorldState; attacker: CharacterState; defender: CharacterState } {
    const world = createWorld(50, [
        createCharacter(0, 0, 0),
        createCharacter(0, distance, PI)
    ], [DEFAULT_DECK, DEFAULT_DECK]);

    return { world, attacker: world.characters[0], defender: world.characters[1] };
}

function run(world: WorldState, ticks: number, attackerInput: InputFrame, defenderInput: InputFrame = NO_INPUT): void {
    for (let i = 0; i < ticks; i++) {
        stepWorld(world, [attackerInput, defenderInput]);
    }
}

describe('attacks', () => {
    it('plays the first move of the stance sequence through its phases', () => {
        const { world, attacker } = createFight(20);
        const jab = move('jab');

        stepWorld(world, [ATTACK]);
        expect(getCurrentMove(attacker)).toBe(jab);
        expect(getMovePhase(attacker)).toBe('startup');
        expect(attacker.stamina).toBe(MAX_STAMINA - jab.staminaCost);

        run(world, jab.startupTicks, NO_INPUT);
        expect(getMovePhase(attacker)).toBe('active');

        run(world, jab.activeTicks, NO_INPUT);
        expect(getMovePhase(attacker)).toBe('recovery');

        run(world, jab.recoveryTicks - 1, NO_INPUT);
        expect(getCurrentMove(attacker)).toBeNull();
        expect(STANCES[attacker.stance]).toBe(jab.endStance);
        expect(attacker.z).toBeCloseTo(jab.advance, 6);
    });

    it('chains through the sequence when attack is pressed again during a move', () => {
        const { world, attacker } = createFight(20);

        stepWorld(world, [ATTACK]);
        stepWorld(world, [NO_INPUT]);
        stepWorld(world, [ATTACK]);
        run(world, totalTicks('jab') - 3, NO_INPUT);
        expect(getCurrentMove(attacker)).toBe(move('cross'));

        stepWorld(world, [NO_INPUT]);
        stepWorld(world, [ATTACK]);
        run(world, totalTicks('cross') - 2, NO_INPUT);
        expect(getCurrentMove(attacker)).toBe(move('hook'));

        run(world, totalTicks('hook'), NO_INPUT);
        expect(getCurrentMove(attacker)).toBeNull();
        expect(STANCES[attacker.stance]).toBe('back-right');
    });

    it('starts the sequence of the new stance once a chain is dropped', () => {
        const { world, attacker } = createFight(20);

        stepWorld(world, [ATTACK]);
        run(world, totalTicks('jab'), NO_INPUT);
        expect(STANCES[attacker.stance]).toBe('front-left');

        // front-left has its own sequence, starting with low-kick rather than cross
        stepWorld(world, [ATTACK]);
        expect(getCurrentMove(attacker)).toBe(move('low-kick'));
    });

    it('uses the alternate attack of the current stance', () => {
        const { world, attacker } = createFight(20);

        stepWorld(world, [ALTERNATE]);
        expect(getCurrentMove(attacker)).toBe(move('elbow'));
    });

    it('does nothing when the stance has no alternate', () => {
        const { world, attacker } = createFight(20);
        attacker.stance = STANCES.indexOf('back-left');

        stepWorld(world, [ALTERNATE]);
        expect(getCurrentMove(attacker)).toBeNull();
        expect(attacker.stamina).toBe(MAX_STAMINA);
    });

    it('cannot attack without enough stamina', () => {
        const { world, attacker } = createFight(20);
        attacker.stamina = move('jab').staminaCost - 1;
        attacker.staminaRegenDelayTicks = STAMINA_REGEN_DELAY_TICKS;

        stepWorld(world, [ATTACK]);
        expect(getCurrentMove(attacker)).toBeNull();
    });

    it('ignores movement and dodge input while attacking', () => {
        const { world, attacker } = createFight(20);

        stepWorld(world, [ATTACK]);
        run(world, 5, encodeInput(Button.Dodge, 1, 0, 0));

        expect(attacker.dodgeTicks).toBe(0);
        expect(attacker.x).toBeCloseTo(0, 6);
    });
});

describe('hits', () => {
    it('damages and stuns a defender in range, once per attack', () => {
        const { world, attacker, defender } = createFight(1.8);
        const jab = move('jab');

        stepWorld(world, [ATTACK]);
        run(world, jab.startupTicks, NO_INPUT);
        expect(defender.health).toBe(MAX_HEALTH - jab.damage);
        expect(defender.stunKind).toBe(StunKind.Hit);
        expect(defender.stunTicks).toBe(jab.hitStunTicks);
        expect(defender.z).toBeGreaterThanOrEqual(1.8 + HIT_PUSHBACK - 1e-9);
        expect(attacker.moveHasHit).toBe(true);

        // The remaining active ticks must not hit again
        run(world, jab.activeTicks + jab.recoveryTicks, NO_INPUT);
        expect(defender.health).toBe(MAX_HEALTH - jab.damage);
    });

    it('misses a defender out of reach', () => {
        const { world, defender } = createFight(4);

        stepWorld(world, [ATTACK]);
        run(world, totalTicks('jab'), NO_INPUT);

        expect(defender.health).toBe(MAX_HEALTH);
    });

    it('interrupts the defender\'s own attack', () => {
        const { world, defender } = createFight(1.8);

        // The defender's slow alternate is still starting up when the jab lands
        stepWorld(world, [ATTACK, ALTERNATE]);
        run(world, move('jab').startupTicks, NO_INPUT);

        expect(defender.health).toBeLessThan(MAX_HEALTH);
        expect(getCurrentMove(defender)).toBeNull();
    });

    it('lets both characters hit each other on the same tick', () => {
        const { world, attacker, defender } = createFight(1.8);

        stepWorld(world, [ATTACK, ATTACK]);
        run(world, move('jab').startupTicks, NO_INPUT);

        expect(attacker.health).toBe(MAX_HEALTH - move('jab').damage);
        expect(defender.health).toBe(MAX_HEALTH - move('jab').damage);
    });

    it('passes through a defender who has just dodged', () => {
        const { world, defender } = createFight(1.8);
        const jab = move('jab');

        stepWorld(world, [ATTACK]);
        run(world, jab.startupTicks - 1, NO_INPUT);
        // Dodge straight back on the tick the jab would land
        stepWorld(world, [NO_INPUT, encodeInput(Button.Dodge, 0, -1, PI)]);
        run(world, jab.activeTicks, NO_INPUT);

        expect(defender.health).toBe(MAX_HEALTH);
        expect(defender.stamina).toBe(MAX_STAMINA - DODGE_STAMINA_COST);
    });

    it('knocks out at zero health, then stands the character back up', () => {
        const { world, defender } = createFight(1.8);
        defender.health = 1;

        stepWorld(world, [ATTACK]);
        run(world, move('jab').startupTicks, NO_INPUT);
        expect(defender.health).toBe(0);
        expect(defender.knockoutTicks).toBe(KNOCKOUT_TICKS);

        // Knocked-out characters cannot act or be hit again
        run(world, KNOCKOUT_TICKS - 1, ATTACK, ATTACK);
        expect(defender.health).toBe(0);
        expect(getCurrentMove(defender)).toBeNull();

        run(world, 1, NO_INPUT);
        expect(defender.health).toBe(MAX_HEALTH);
        expect(defender.knockoutTicks).toBe(0);
    });
});

describe('guard', () => {
    it('blocks a frontal attack at the cost of stamina', () => {
        const { world, defender } = createFight(1.8);
        const jab = move('jab');

        stepWorld(world, [ATTACK, GUARD]);
        run(world, jab.startupTicks, NO_INPUT, GUARD);

        expect(defender.health).toBe(MAX_HEALTH);
        expect(defender.stamina).toBe(MAX_STAMINA - jab.guardDamage);
        expect(defender.stunKind).toBe(StunKind.Block);
        expect(defender.z).toBeCloseTo(1.8 + BLOCK_PUSHBACK, 6);
    });

    it('does not cover the back', () => {
        const { world, defender } = createFight(1.8);
        defender.yaw = 0;

        stepWorld(world, [ATTACK, GUARD]);
        run(world, move('jab').startupTicks, NO_INPUT, GUARD);

        expect(defender.health).toBeLessThan(MAX_HEALTH);
    });

    it('is broken outright by a guard-break move', () => {
        const { world, defender } = createFight(1.8);
        const elbow = move('elbow');

        stepWorld(world, [ALTERNATE, GUARD]);
        run(world, elbow.startupTicks, NO_INPUT, GUARD);

        expect(defender.health).toBe(MAX_HEALTH);
        expect(defender.stamina).toBe(0);
        expect(defender.guarding).toBe(false);
        expect(defender.stunKind).toBe(StunKind.GuardBroken);
        expect(defender.stunTicks).toBe(GUARD_BREAK_STUN_TICKS);
    });

    it('breaks when blocking empties the stamina bar', () => {
        const { world, defender } = createFight(1.8);
        defender.stamina = 5;
        defender.staminaRegenDelayTicks = 1000;

        stepWorld(world, [ATTACK, GUARD]);
        run(world, move('jab').startupTicks, NO_INPUT, GUARD);

        expect(defender.stamina).toBe(0);
        expect(defender.stunKind).toBe(StunKind.GuardBroken);
    });

    it('slows movement and stops stamina regeneration while held', () => {
        const { world, attacker } = createFight(20);
        attacker.stamina = 50;

        run(world, 60, encodeInput(Button.Guard | Button.Run, 1, 0, 0));

        expect(attacker.guarding).toBe(true);
        expect(attacker.running).toBe(false);
        expect(attacker.x).toBeCloseTo(1.5, 3);
        expect(attacker.stamina).toBe(50);
    });
});

describe('stamina', () => {
    it('regenerates after a delay and stops at the maximum', () => {
        const { world, attacker } = createFight(20);
        const jab = move('jab');

        stepWorld(world, [ATTACK]);
        run(world, totalTicks('jab'), NO_INPUT);
        // The regeneration delay outlasts the jab
        expect(attacker.stamina).toBe(MAX_STAMINA - jab.staminaCost);

        run(world, STAMINA_REGEN_DELAY_TICKS, NO_INPUT);
        expect(attacker.stamina).toBeGreaterThan(MAX_STAMINA - jab.staminaCost);

        run(world, 600, NO_INPUT);
        expect(attacker.stamina).toBe(MAX_STAMINA);
    });
});
