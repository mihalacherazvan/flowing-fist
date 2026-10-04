import { getMove } from './moves';
import { STANCES } from './stances';
import type { Stance } from './stances';

export const MAX_SEQUENCE_LENGTH = 3;

/**
 * A player's chosen attacks: per stance, a sequence played by repeated attack
 * presses and one alternate attack. Moves are referenced by id.
 */
export interface CombatDeck {
    sequences: Record<Stance, string[]>;
    alternates: Record<Stance, string | null>;
}

/**
 * Check a deck against the deck-building rules
 *
 * @returns one message per problem, empty when the deck is valid
 */
export function validateDeck(deck: CombatDeck): string[] {
    const errors: string[] = [];
    const usedMoveIds = new Set<string>();

    const checkMove = (moveId: string, expectedStance: Stance, slot: string): Stance | null => {
        const move = getMove(moveId);
        if (!move) {
            errors.push(`${slot}: unknown move "${moveId}"`);
            return null;
        }

        if (usedMoveIds.has(moveId)) {
            errors.push(`${slot}: "${moveId}" is already used elsewhere in the deck`);
        }
        usedMoveIds.add(moveId);

        if (move.startStance !== expectedStance) {
            errors.push(`${slot}: "${moveId}" starts in ${move.startStance}, expected ${expectedStance}`);
        }

        return move.endStance;
    };

    for (const stance of STANCES) {
        const sequence = deck.sequences[stance];
        if (sequence.length > MAX_SEQUENCE_LENGTH) {
            errors.push(`${stance} sequence: at most ${MAX_SEQUENCE_LENGTH} moves allowed`);
        }

        // Each attack must start in the stance the previous one ended in
        let expectedStance: Stance | null = stance;
        sequence.forEach((moveId, index) => {
            if (expectedStance === null) return;
            expectedStance = checkMove(moveId, expectedStance, `${stance} sequence #${index + 1}`);
        });

        const alternate = deck.alternates[stance];
        if (alternate !== null) {
            checkMove(alternate, stance, `${stance} alternate`);
        }
    }

    return errors;
}

export const DEFAULT_DECK: CombatDeck = {
    sequences: {
        'front-right': ['jab', 'cross', 'hook'],
        'front-left': ['low-kick', 'side-kick'],
        'back-right': ['back-fist', 'spin-kick', 'roundhouse'],
        'back-left': ['sweep']
    },
    alternates: {
        'front-right': 'elbow',
        'front-left': 'uppercut',
        'back-right': 'push-kick',
        'back-left': null
    }
};
