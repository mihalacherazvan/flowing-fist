import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK, createEmptyDeck, parseDeck, validateDeck } from './decks';
import { MOVE_LIST } from './moves';

const emptyDeck = createEmptyDeck;

describe('validateDeck', () => {
    it('accepts the default deck and an empty deck', () => {
        expect(validateDeck(DEFAULT_DECK)).toEqual([]);
        expect(validateDeck(emptyDeck())).toEqual([]);
    });

    it('rejects a sequence whose first move starts in another stance', () => {
        const deck = emptyDeck();
        deck.sequences['front-right'] = ['cross'];

        expect(validateDeck(deck)).toEqual([
            'front-right sequence #1: "cross" starts in front-left, expected front-right'
        ]);
    });

    it('rejects a move that does not start where the previous one ended', () => {
        const deck = emptyDeck();
        deck.sequences['front-right'] = ['jab', 'hook'];

        expect(validateDeck(deck)).toEqual([
            'front-right sequence #2: "hook" starts in front-right, expected front-left'
        ]);
    });

    it('rejects unknown moves, duplicates and over-long sequences', () => {
        const deck = emptyDeck();
        deck.sequences['front-right'] = ['elbow', 'nope'];
        deck.alternates['front-right'] = 'elbow';
        expect(validateDeck(deck)).toEqual([
            'front-right sequence #2: unknown move "nope"',
            'front-right alternate: "elbow" is already used elsewhere in the deck'
        ]);

        const longDeck = emptyDeck();
        longDeck.sequences['front-right'] = ['jab', 'cross', 'hook', 'back-fist'];
        expect(validateDeck(longDeck)).toContain('front-right sequence: at most 3 moves allowed');
    });

    it('rejects an alternate that starts in another stance', () => {
        const deck = emptyDeck();
        deck.alternates['back-left'] = 'jab';

        expect(validateDeck(deck)).toEqual([
            'back-left alternate: "jab" starts in front-right, expected back-left'
        ]);
    });
});

describe('move list', () => {
    it('has unique ids and sane frame data', () => {
        expect(new Set(MOVE_LIST.map((move) => move.id)).size).toBe(MOVE_LIST.length);

        for (const move of MOVE_LIST) {
            expect(move.startupTicks).toBeGreaterThan(0);
            expect(move.activeTicks).toBeGreaterThan(0);
            expect(move.hitboxes.length).toBeGreaterThan(0);
        }
    });
});

describe('parseDeck', () => {
    it('returns a copy of a well-formed deck, without unknown fields', () => {
        const parsed = parseDeck({ ...JSON.parse(JSON.stringify(DEFAULT_DECK)), extra: true });

        expect(parsed).toEqual(DEFAULT_DECK);
        expect(parsed).not.toBe(DEFAULT_DECK);
    });

    it('refuses anything that is not shaped like a deck', () => {
        const missingStance = JSON.parse(JSON.stringify(DEFAULT_DECK));
        delete missingStance.sequences['back-left'];

        const wrongMoveType = JSON.parse(JSON.stringify(DEFAULT_DECK));
        wrongMoveType.sequences['front-right'] = [1, 2];

        const wrongAlternateType = JSON.parse(JSON.stringify(DEFAULT_DECK));
        wrongAlternateType.alternates['front-right'] = ['elbow'];

        const tooLong = JSON.parse(JSON.stringify(DEFAULT_DECK));
        tooLong.sequences['front-right'] = ['jab', 'cross', 'hook', 'elbow'];

        for (const value of [null, 'deck', [], {}, { sequences: {}, alternates: null }, missingStance, wrongMoveType, wrongAlternateType, tooLong]) {
            expect(parseDeck(value)).toBeNull();
        }
    });
});
