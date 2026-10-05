import { randomUUID } from 'node:crypto';

/** Rating difference accepted between two players the moment they start looking */
const INITIAL_RATING_GAP = 100;
/** The accepted difference widens by this much for every second the longer-waiting player has waited */
const RATING_GAP_PER_SECOND = 50;

export interface WaitingPlayer {
    userId: string;
    rating: number;
    /** Milliseconds, on the same clock as the `now` given to pairWaitingPlayers */
    waitingSince: number;
}

/**
 * Choose who fights whom. Whoever has waited longest is served first and gets
 * the closest-rated opponent within a difference that grows with their wait,
 * so a match is close when there is a choice and still happens when there is not.
 *
 * @returns the pairs; players left out keep waiting
 */
export function pairWaitingPlayers<T extends WaitingPlayer>(waiting: readonly T[], now: number): [T, T][] {
    const unpaired = [...waiting].sort((a, b) => a.waitingSince - b.waitingSince);
    const pairs: [T, T][] = [];

    while (unpaired.length > 1) {
        const player = unpaired.shift()!;
        const acceptedGap = INITIAL_RATING_GAP + RATING_GAP_PER_SECOND * (now - player.waitingSince) / 1000;

        let closest = -1;
        unpaired.forEach((candidate, index) => {
            const gap = Math.abs(candidate.rating - player.rating);
            const isCloser = closest < 0 || gap < Math.abs(unpaired[closest].rating - player.rating);
            if (candidate.userId !== player.userId && gap <= acceptedGap && isCloser) closest = index;
        });

        if (closest >= 0) {
            pairs.push([player, unpaired.splice(closest, 1)[0]]);
        }
    }

    return pairs;
}

// A ranked duel room may only be created by the matchmaker. Rooms are created
// through Colyseus with options any client could also send, so the matchmaker
// proves itself with a ticket that only this process knows.
const issuedTickets = new Map<string, string[]>();

/**
 * @param userIds the two accounts the ranked room is for
 */
export function issueMatchTicket(userIds: string[]): string {
    const ticket = randomUUID();
    issuedTickets.set(ticket, userIds);

    return ticket;
}

/**
 * @returns the accounts the ticket was issued for, or null if it is not a ticket. A ticket works once.
 */
export function redeemMatchTicket(ticket: unknown): string[] | null {
    if (typeof ticket !== 'string') return null;

    const userIds = issuedTickets.get(ticket) ?? null;
    issuedTickets.delete(ticket);

    return userIds;
}
