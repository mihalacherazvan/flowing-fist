import { randomUUID } from 'node:crypto';
import { DEFAULT_DECK, parseDeck, validateDeck } from '@flowing-fist/content';
import type { CombatDeck } from '@flowing-fist/content';
import { MAX_DECKS_PER_ACCOUNT, MAX_DECK_NAME_LENGTH } from '@flowing-fist/protocol';
import type { SavedDeck } from '@flowing-fist/protocol';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../db/database';
import { decks } from '../db/schema';
import type { DeckRow } from '../db/schema';
import { HttpError } from '../http/HttpError';

interface DeckInput {
    name: string;
    deck: CombatDeck;
}

function toSavedDeck(row: DeckRow): SavedDeck {
    return { id: row.id, name: row.name, deck: row.slots, isActive: row.isActive };
}

/**
 * Check a request body against the deck rules. The client runs the same rules,
 * so a refusal here means a modified or outdated client.
 */
function readDeckInput(body: Record<string, unknown>): DeckInput {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > MAX_DECK_NAME_LENGTH) {
        throw new HttpError(422, `The deck name must be 1 to ${MAX_DECK_NAME_LENGTH} characters long`);
    }

    const deck = parseDeck(body.deck);
    if (!deck) throw new HttpError(422, 'That is not a deck');

    const problems = validateDeck(deck);
    if (problems.length > 0) throw new HttpError(422, 'The deck breaks the deck rules', problems);

    return { name, deck };
}

async function findOwnedDeck(db: Database, userId: string, deckId: string): Promise<DeckRow> {
    // Someone else's deck is reported as missing, the same as one that does not exist
    const [row] = await db.select().from(decks).where(and(eq(decks.id, deckId), eq(decks.userId, userId))).limit(1);
    if (!row) throw new HttpError(404, 'Deck not found');

    return row;
}

export async function listDecks(db: Database, userId: string): Promise<SavedDeck[]> {
    const rows = await db.select().from(decks).where(eq(decks.userId, userId)).orderBy(asc(decks.name), asc(decks.id));

    return rows.map(toSavedDeck);
}

export async function createDeck(db: Database, userId: string, body: Record<string, unknown>): Promise<SavedDeck> {
    const input = readDeckInput(body);
    const id = randomUUID();

    await db.transaction(async (transaction) => {
        const existing = await transaction.select({ id: decks.id }).from(decks).where(eq(decks.userId, userId)).for('update');
        if (existing.length >= MAX_DECKS_PER_ACCOUNT) {
            throw new HttpError(409, `An account can hold at most ${MAX_DECKS_PER_ACCOUNT} decks`);
        }

        // An account's first deck is the one it fights with
        await transaction.insert(decks).values({ id, userId, name: input.name, slots: input.deck, isActive: existing.length === 0 });
    });

    return toSavedDeck(await findOwnedDeck(db, userId, id));
}

export async function updateDeck(db: Database, userId: string, deckId: string, body: Record<string, unknown>): Promise<SavedDeck> {
    const input = readDeckInput(body);
    await findOwnedDeck(db, userId, deckId);

    await db.update(decks).set({ name: input.name, slots: input.deck }).where(and(eq(decks.id, deckId), eq(decks.userId, userId)));

    return toSavedDeck(await findOwnedDeck(db, userId, deckId));
}

export async function deleteDeck(db: Database, userId: string, deckId: string): Promise<void> {
    await findOwnedDeck(db, userId, deckId);
    await db.delete(decks).where(and(eq(decks.id, deckId), eq(decks.userId, userId)));
}

export async function activateDeck(db: Database, userId: string, deckId: string): Promise<SavedDeck[]> {
    await findOwnedDeck(db, userId, deckId);

    await db.transaction(async (transaction) => {
        await transaction.update(decks).set({ isActive: false }).where(eq(decks.userId, userId));
        await transaction.update(decks).set({ isActive: true }).where(and(eq(decks.id, deckId), eq(decks.userId, userId)));
    });

    return listDecks(db, userId);
}

/**
 * The deck an account takes into a fight: its active deck, or the default one
 * if it has none. The stored deck is checked again, because the move list can
 * change after a deck was saved.
 *
 * @throws if the stored deck no longer passes the deck rules
 */
export async function getFightingDeck(db: Database, userId: string): Promise<CombatDeck> {
    const [row] = await db.select().from(decks).where(and(eq(decks.userId, userId), eq(decks.isActive, true))).limit(1);
    if (!row) return DEFAULT_DECK;

    const deck = parseDeck(row.slots);
    if (!deck || validateDeck(deck).length > 0) {
        throw new Error(`Your deck "${row.name}" is no longer valid; open the deck editor and fix it`);
    }

    return deck;
}
