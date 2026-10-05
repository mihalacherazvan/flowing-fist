import { ServerError } from '@colyseus/core';
import type { CombatDeck } from '@flowing-fist/content';
import { findUser } from '../accounts/accounts';
import { verifyToken } from '../auth/tokens';
import type { Database } from '../db/database';
import { getFightingDeck } from '../decks/decks';
import { getRating } from '../matches/matches';

/** What a client is known to be once its token has been checked */
export interface DuelPlayer {
    userId: string;
    displayName: string;
    deck: CombatDeck;
    rating: number;
}

/**
 * Turn a client's token into the player it stands for. The deck comes from the
 * database, never from the client, and is checked against the deck rules once more.
 *
 * @throws a ServerError the client is shown: 401 without a valid token, 422 for a deck that is no longer valid
 */
export async function authenticatePlayer(db: Database, token: string): Promise<DuelPlayer> {
    const userId = token ? await verifyToken(token) : null;
    const user = userId ? await findUser(db, userId) : null;
    if (!user) throw new ServerError(401, 'Sign in to fight online');

    let deck: CombatDeck;
    try {
        deck = await getFightingDeck(db, user.id);
    } catch (error) {
        throw new ServerError(422, (error as Error).message);
    }

    return { userId: user.id, displayName: user.displayName, deck, rating: await getRating(db, user.id) };
}
