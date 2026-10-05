import { describe, expect, it } from 'vitest';
import { issueMatchTicket, pairWaitingPlayers, redeemMatchTicket } from './matchmaking';
import type { WaitingPlayer } from './matchmaking';

function waiting(userId: string, rating: number, waitingSince: number = 0): WaitingPlayer {
    return { userId, rating, waitingSince };
}

function names(pairs: [WaitingPlayer, WaitingPlayer][]): string[][] {
    return pairs.map((pair) => pair.map((player) => player.userId));
}

describe('pairWaitingPlayers', () => {
    it('pairs each player with the closest-rated one', () => {
        const pairs = pairWaitingPlayers([
            waiting('a', 1000, 0),
            waiting('b', 1090, 1),
            waiting('c', 1010, 2),
            waiting('d', 1100, 3)
        ], 10);

        expect(names(pairs)).toEqual([['a', 'c'], ['b', 'd']]);
    });

    it('keeps players far apart in rating waiting, but not for ever', () => {
        const players = [waiting('strong', 1500), waiting('new', 1000)];

        expect(pairWaitingPlayers(players, 0)).toEqual([]);
        expect(pairWaitingPlayers(players, 5000)).toEqual([]);
        expect(names(pairWaitingPlayers(players, 8000))).toEqual([['strong', 'new']]);
    });

    it('serves the longest-waiting player first and leaves an odd one out', () => {
        const pairs = pairWaitingPlayers([
            waiting('late', 1000, 5000),
            waiting('early', 1000, 0),
            waiting('middle', 1000, 2000)
        ], 6000);

        expect(names(pairs)).toEqual([['early', 'middle']]);
    });

    it('never pairs an account with itself', () => {
        expect(pairWaitingPlayers([waiting('same', 1000), waiting('same', 1000)], 60000)).toEqual([]);
        expect(pairWaitingPlayers([waiting('alone', 1000)], 60000)).toEqual([]);
    });
});

describe('match tickets', () => {
    it('names the players once, and only for a ticket that was issued', () => {
        const ticket = issueMatchTicket(['a', 'b']);

        expect(redeemMatchTicket('made-up')).toBeNull();
        expect(redeemMatchTicket(undefined)).toBeNull();
        expect(redeemMatchTicket(ticket)).toEqual(['a', 'b']);
        expect(redeemMatchTicket(ticket)).toBeNull();
    });
});
