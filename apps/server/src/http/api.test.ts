import { DEFAULT_DECK, createEmptyDeck } from '@flowing-fist/content';
import { MAX_DECKS_PER_ACCOUNT } from '@flowing-fist/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer } from '../testing/testServer';
import type { TestServer } from '../testing/testServer';

let server: TestServer;

beforeAll(async () => {
    server = await startTestServer();
});
beforeEach(() => server.reset());
afterAll(() => server.close());

const REGISTRATION = { email: 'Fighter@Example.com', password: 'correct horse', displayName: 'Fighter' };

describe('accounts', () => {
    it('creates a guest that can be read back with its token', async () => {
        const created = await server.request('POST', '/auth/guest');
        expect(created.status).toBe(201);
        expect(created.body.account).toMatchObject({ email: null, isGuest: true });

        const me = await server.request('GET', '/me', { token: created.body.token });
        expect(me.status).toBe(200);
        expect(me.body).toEqual(created.body.account);
    });

    it('refuses a missing, forged or orphaned token', async () => {
        const guest = await server.createGuest();
        await server.reset();

        for (const token of [undefined, 'not-a-token', `${guest.token}x`, guest.token]) {
            const me = await server.request('GET', '/me', { token });
            expect(me.status).toBe(401);
        }
    });

    it('turns a guest into a registered account that keeps its decks', async () => {
        const guest = await server.createGuest();
        await server.request('POST', '/decks', { token: guest.token, body: { name: 'Mine', deck: DEFAULT_DECK } });

        const registered = await server.request('POST', '/auth/register', { token: guest.token, body: REGISTRATION });
        expect(registered.status).toBe(201);
        expect(registered.body.account).toEqual({
            id: guest.account.id,
            displayName: 'Fighter',
            email: 'fighter@example.com',
            isGuest: false
        });

        const loggedIn = await server.request('POST', '/auth/login', {
            body: { email: 'fighter@example.com', password: REGISTRATION.password }
        });
        expect(loggedIn.status).toBe(200);

        const decks = await server.request('GET', '/decks', { token: loggedIn.body.token });
        expect(decks.body).toHaveLength(1);
    });

    it('registers without a guest, and refuses an email that is taken', async () => {
        expect((await server.request('POST', '/auth/register', { body: REGISTRATION })).status).toBe(201);

        const again = await server.request('POST', '/auth/register', { body: { ...REGISTRATION, email: 'fighter@example.com' } });
        expect(again.status).toBe(409);
    });

    it('refuses to register over an account that is already registered', async () => {
        const registered = await server.request('POST', '/auth/register', { body: REGISTRATION });

        const again = await server.request('POST', '/auth/register', {
            token: registered.body.token,
            body: { ...REGISTRATION, email: 'other@example.com' }
        });
        expect(again.status).toBe(409);
    });

    it('validates registration details', async () => {
        for (const change of [{ email: 'nope' }, { password: 'short' }, { displayName: '   ' }, { displayName: 'x'.repeat(25) }]) {
            const response = await server.request('POST', '/auth/register', { body: { ...REGISTRATION, ...change } });
            expect(response.status).toBe(422);
        }
    });

    it('answers a wrong password and an unknown email alike', async () => {
        await server.request('POST', '/auth/register', { body: REGISTRATION });

        const wrongPassword = await server.request('POST', '/auth/login', { body: { email: REGISTRATION.email, password: 'wrong horse' } });
        const unknownEmail = await server.request('POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'wrong horse' } });

        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail).toEqual(wrongPassword);
    });

    it('answers malformed requests with a client error', async () => {
        expect((await server.request('POST', '/auth/login', { body: [] })).status).toBe(400);
        expect((await server.request('GET', '/nothing-here')).status).toBe(404);
    });
});

describe('decks', () => {
    it('requires a signed-in account', async () => {
        expect((await server.request('GET', '/decks')).status).toBe(401);
        expect((await server.request('POST', '/decks', { body: { name: 'Mine', deck: DEFAULT_DECK } })).status).toBe(401);
    });

    it('saves, lists, changes and deletes decks', async () => {
        const { token } = await server.createGuest();

        const created = await server.request('POST', '/decks', { token, body: { name: ' Mine ', deck: DEFAULT_DECK } });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name: 'Mine', deck: DEFAULT_DECK, isActive: true });

        const second = await server.request('POST', '/decks', { token, body: { name: 'Empty', deck: createEmptyDeck() } });
        expect(second.body.isActive).toBe(false);

        const changedDeck = createEmptyDeck();
        changedDeck.sequences['front-right'] = ['hook'];
        const changed = await server.request('PUT', `/decks/${second.body.id}`, { token, body: { name: 'Hooks', deck: changedDeck } });
        expect(changed.status).toBe(200);
        expect(changed.body).toMatchObject({ name: 'Hooks', deck: changedDeck, isActive: false });

        const activated = await server.request('POST', `/decks/${second.body.id}/activate`, { token });
        expect(activated.status).toBe(200);
        expect(activated.body.map((deck: { name: string; isActive: boolean }) => [deck.name, deck.isActive])).toEqual([
            ['Hooks', true],
            ['Mine', false]
        ]);

        expect((await server.request('DELETE', `/decks/${created.body.id}`, { token })).status).toBe(204);
        expect((await server.request('GET', '/decks', { token })).body).toHaveLength(1);
    });

    it('rejects a deck that breaks the deck rules, and says why', async () => {
        const { token } = await server.createGuest();
        const deck = createEmptyDeck();
        deck.sequences['front-right'] = ['cross'];

        const response = await server.request('POST', '/decks', { token, body: { name: 'Broken', deck } });

        expect(response.status).toBe(422);
        expect(response.body.details).toEqual(['front-right sequence #1: "cross" starts in front-left, expected front-right']);
        expect((await server.request('GET', '/decks', { token })).body).toEqual([]);
    });

    it('rejects a deck with the wrong shape or a bad name', async () => {
        const { token } = await server.createGuest();

        for (const body of [
            { name: 'Mine' },
            { name: 'Mine', deck: { sequences: {}, alternates: {} } },
            { name: '', deck: DEFAULT_DECK },
            { name: 'x'.repeat(41), deck: DEFAULT_DECK }
        ]) {
            expect((await server.request('POST', '/decks', { token, body })).status).toBe(422);
        }
    });

    it('keeps one account away from another account\'s decks', async () => {
        const owner = await server.createGuest();
        const stranger = await server.createGuest();
        const deck = (await server.request('POST', '/decks', { token: owner.token, body: { name: 'Mine', deck: DEFAULT_DECK } })).body;

        expect((await server.request('GET', '/decks', { token: stranger.token })).body).toEqual([]);
        expect((await server.request('PUT', `/decks/${deck.id}`, { token: stranger.token, body: { name: 'Stolen', deck: DEFAULT_DECK } })).status).toBe(404);
        expect((await server.request('DELETE', `/decks/${deck.id}`, { token: stranger.token })).status).toBe(404);
        expect((await server.request('POST', `/decks/${deck.id}/activate`, { token: stranger.token })).status).toBe(404);

        expect((await server.request('GET', '/decks', { token: owner.token })).body).toEqual([deck]);
    });

    it('limits how many decks an account can hold', async () => {
        const { token } = await server.createGuest();
        for (let i = 0; i < MAX_DECKS_PER_ACCOUNT; i++) {
            expect((await server.request('POST', '/decks', { token, body: { name: `Deck ${i}`, deck: DEFAULT_DECK } })).status).toBe(201);
        }

        expect((await server.request('POST', '/decks', { token, body: { name: 'One too many', deck: DEFAULT_DECK } })).status).toBe(409);
    });
});
