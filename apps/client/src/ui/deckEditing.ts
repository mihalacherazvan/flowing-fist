import { MOVE_LIST, getMove } from '@flowing-fist/content';
import type { CombatDeck, MoveDefinition, Stance } from '@flowing-fist/content';

/** One place in a deck a move can go: a position in a stance's sequence, or its alternate */
export type DeckSlot = { stance: Stance; kind: 'sequence'; index: number } | { stance: Stance; kind: 'alternate' };

function getSlotMove(deck: CombatDeck, slot: DeckSlot): string | null {
    return slot.kind === 'alternate' ? deck.alternates[slot.stance] : deck.sequences[slot.stance][slot.index] ?? null;
}

/**
 * The stance a move in this slot must start in, or null when the slot cannot
 * be filled yet because the one before it is empty
 */
export function getSlotStance(deck: CombatDeck, slot: DeckSlot): Stance | null {
    if (slot.kind === 'alternate' || slot.index === 0) return slot.stance;

    const previousMoveId = deck.sequences[slot.stance][slot.index - 1];

    return previousMoveId ? getMove(previousMoveId)?.endStance ?? null : null;
}

/**
 * The moves the deck rules allow in a slot: they start in the right stance
 * and are not used anywhere else in the deck
 */
export function getSlotChoices(deck: CombatDeck, slot: DeckSlot): MoveDefinition[] {
    const stance = getSlotStance(deck, slot);
    if (!stance) return [];

    const currentMoveId = getSlotMove(deck, slot);
    const usedMoveIds = new Set([...Object.values(deck.sequences).flat(), ...Object.values(deck.alternates)]);

    return MOVE_LIST.filter((move) => move.startStance === stance && (move.id === currentMoveId || !usedMoveIds.has(move.id)));
}

/**
 * Put a move in a slot, or empty it with null
 *
 * @returns a new deck. Changing a sequence drops the moves after the changed
 * one from the point where they no longer chain.
 */
export function setSlotMove(deck: CombatDeck, slot: DeckSlot, moveId: string | null): CombatDeck {
    if (slot.kind === 'alternate') {
        return { ...deck, alternates: { ...deck.alternates, [slot.stance]: moveId } };
    }

    const current = deck.sequences[slot.stance];
    const sequence = current.slice(0, slot.index);

    if (moveId) {
        sequence.push(moveId);

        for (const laterMoveId of current.slice(slot.index + 1)) {
            const endStance = getMove(sequence[sequence.length - 1])?.endStance;
            if (getMove(laterMoveId)?.startStance !== endStance) break;

            sequence.push(laterMoveId);
        }
    }

    return { ...deck, sequences: { ...deck.sequences, [slot.stance]: sequence } };
}
