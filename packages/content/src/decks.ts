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
 * A deck with nothing in it, as a starting point for building one
 */
export function createEmptyDeck(): CombatDeck {
    return {
        sequences: { 'front-right': [], 'front-left': [], 'back-right': [], 'back-left': [] },
        alternates: { 'front-right': null, 'front-left': null, 'back-right': null, 'back-left': null }
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a deck from data that cannot be trusted (a request body, stored JSON).
 * This only checks the shape; the rules are checked by validateDeck.
 *
 * @returns a copy holding only the known fields, or null when the shape is wrong
 */
export function parseDeck(value: unknown): CombatDeck | null {
    if (!isRecord(value) || !isRecord(value.sequences) || !isRecord(value.alternates)) return null;

    const deck = createEmptyDeck();

    for (const stance of STANCES) {
        const sequence = value.sequences[stance];
        // Longer sequences are refused here so that an oversized request is never walked
        if (!Array.isArray(sequence) || sequence.length > MAX_SEQUENCE_LENGTH) return null;
        if (!sequence.every((moveId) => typeof moveId === 'string')) return null;

        const alternate = value.alternates[stance];
        if (alternate !== null && typeof alternate !== 'string') return null;

        deck.sequences[stance] = [...sequence];
        deck.alternates[stance] = alternate;
    }

    return deck;
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
