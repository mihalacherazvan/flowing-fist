import { randomUUID } from 'node:crypto';
import { DEFAULT_DECK, createEmptyDeck } from '@flowing-fist/content';
import type { CombatDeck } from '@flowing-fist/content';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decks } from '../db/schema';
import { startTestServer } from '../testing/testServer';
import type { TestServer } from '../testing/testServer';
import { DuelRoom } from './DuelRoom';

let server: TestServer;

beforeAll(async () => {
    server = await startTestServer();
    DuelRoom.db = server.db;
});
beforeEach(() => server.reset());
afterAll(() => server.close());

/** Put a deck straight into the database, past the checks the API makes */
function storeActiveDeck(userId: string, slots: CombatDeck): Promise<unknown> {
    return server.db.insert(decks).values({ id: randomUUID(), userId, name: 'Stored', slots, isActive: true });
}

describe('DuelRoom.onAuth', () => {
    it('refuses a client without a valid token', async () => {
        await expect(DuelRoom.onAuth('')).rejects.toMatchObject({ code: 401 });
        await expect(DuelRoom.onAuth('not-a-token')).rejects.toMatchObject({ code: 401 });
    });

    it('gives an account without decks the default deck', async () => {
        const guest = await server.createGuest();

        expect(await DuelRoom.onAuth(guest.token)).toEqual({
            userId: guest.account.id,
            displayName: guest.account.displayName,
            deck: DEFAULT_DECK
        });
    });

    it('uses the active deck saved by the account', async () => {
        const guest = await server.createGuest();
        const deck = createEmptyDeck();
        deck.sequences['front-right'] = ['hook'];
        await server.request('POST', '/decks', { token: guest.token, body: { name: 'Empty', deck: createEmptyDeck() } });
        const hooks = await server.request('POST', '/decks', { token: guest.token, body: { name: 'Hooks', deck } });
        await server.request('POST', `/decks/${hooks.body.id}/activate`, { token: guest.token });

        expect((await DuelRoom.onAuth(guest.token)).deck).toEqual(deck);
    });

    it('rejects a stored deck that breaks the deck rules', async () => {
        const guest = await server.createGuest();
        const deck = createEmptyDeck();
        deck.sequences['front-right'] = ['jab', 'jab'];
        await storeActiveDeck(guest.account.id, deck);

        await expect(DuelRoom.onAuth(guest.token)).rejects.toMatchObject({ code: 422 });
    });

    it('rejects a stored deck that is not a deck at all', async () => {
        const guest = await server.createGuest();
        await storeActiveDeck(guest.account.id, { sequences: 'everything' } as unknown as CombatDeck);

        await expect(DuelRoom.onAuth(guest.token)).rejects.toMatchObject({ code: 422 });
    });
});
