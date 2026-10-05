import { STARTING_RATING } from '@flowing-fist/protocol';
import type { AuthResponse, MatchSummary } from '@flowing-fist/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer } from '../testing/testServer';
import type { TestServer } from '../testing/testServer';
import { getRating, recordMatch } from './matches';
import type { FinishedMatch } from './matches';

let server: TestServer;
let first: AuthResponse;
let second: AuthResponse;

beforeAll(async () => {
    server = await startTestServer();
});
beforeEach(async () => {
    await server.reset();
    first = await server.createGuest();
    second = await server.createGuest();
});
afterAll(() => server.close());

function finished(changes: Partial<FinishedMatch> = {}): FinishedMatch {
    return {
        kind: 'ranked',
        reason: 'completed',
        winner: 0,
        roundWins: [3, 1],
        rounds: 4,
        durationTicks: 12000,
        players: [first, second].map(({ account }) => ({ userId: account.id, displayName: account.displayName })),
        ...changes
    };
}

describe('recordMatch', () => {
    it('moves both ratings after a ranked match and counts the result', async () => {
        expect(await recordMatch(server.db, finished())).toEqual([
            { before: STARTING_RATING, after: STARTING_RATING + 16 },
            { before: STARTING_RATING, after: STARTING_RATING - 16 }
        ]);
        expect(await getRating(server.db, first.account.id)).toBe(STARTING_RATING + 16);

        // The second match starts from the ratings the first one left
        const [, loser] = await recordMatch(server.db, finished({ winner: -1, roundWins: [2, 2], rounds: 9 }));
        expect(loser).toEqual({ before: STARTING_RATING - 16, after: STARTING_RATING - 15 });

        expect((await server.request('GET', '/profile', { token: first.token })).body).toEqual({
            rating: STARTING_RATING + 15, games: 2, wins: 1, losses: 0, draws: 1
        });
        expect((await server.request('GET', '/profile', { token: second.token })).body).toEqual({
            rating: STARTING_RATING - 15, games: 2, wins: 0, losses: 1, draws: 1
        });
    });

    it('leaves ratings alone after a private match, but still remembers it', async () => {
        expect(await recordMatch(server.db, finished({ kind: 'private', reason: 'forfeit', winner: 1, roundWins: [1, 0] }))).toEqual([null, null]);

        expect((await server.request('GET', '/profile', { token: second.token })).body).toEqual({
            rating: STARTING_RATING, games: 0, wins: 0, losses: 0, draws: 0
        });

        const history = await server.request('GET', '/matches', { token: second.token });
        expect(history.status).toBe(200);
        expect(history.body).toEqual([{
            id: expect.any(String),
            playedAt: expect.any(String),
            kind: 'private',
            reason: 'forfeit',
            outcome: 'win',
            roundsWon: 0,
            roundsLost: 1,
            opponentName: first.account.displayName,
            ratingChange: null
        }]);
    });
});

describe('GET /matches and /profile', () => {
    it('shows each player their own side of a match', async () => {
        await recordMatch(server.db, finished());

        const [winner] = (await server.request('GET', '/matches', { token: first.token })).body as MatchSummary[];
        const [loser] = (await server.request('GET', '/matches', { token: second.token })).body as MatchSummary[];

        expect(winner).toMatchObject({ outcome: 'win', roundsWon: 3, roundsLost: 1, opponentName: second.account.displayName, ratingChange: 16 });
        expect(loser).toMatchObject({ outcome: 'loss', roundsWon: 1, roundsLost: 3, opponentName: first.account.displayName, ratingChange: -16 });
        expect(Number.isNaN(Date.parse(winner.playedAt))).toBe(false);
    });

    it('answers a new account with the starting rating and no matches, and refuses a stranger', async () => {
        expect((await server.request('GET', '/profile', { token: first.token })).body.rating).toBe(STARTING_RATING);
        expect((await server.request('GET', '/matches', { token: first.token })).body).toEqual([]);

        expect((await server.request('GET', '/profile')).status).toBe(401);
        expect((await server.request('GET', '/matches')).status).toBe(401);
    });
});
