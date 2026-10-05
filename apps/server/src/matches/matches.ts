import { randomUUID } from 'node:crypto';
import { STARTING_RATING } from '@flowing-fist/protocol';
import type {
    DuelKind,
    MatchEndReason,
    MatchOutcome,
    MatchSummary,
    ProfileResponse,
    RatingChange
} from '@flowing-fist/protocol';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/database';
import { matchPlayers, matches, ratings } from '../db/schema';
import { updateRatings } from '../ratings/elo';

const MATCH_HISTORY_LENGTH = 20;
const NO_WINNER = -1;

export interface FinishedMatch {
    kind: DuelKind;
    reason: MatchEndReason;
    /** Slot of the winner, or -1 for a draw */
    winner: number;
    /** Rounds won by each slot */
    roundWins: number[];
    /** Rounds started */
    rounds: number;
    durationTicks: number;
    /** By slot; exactly two */
    players: { userId: string; displayName: string }[];
}

export async function getRating(db: Database, userId: string): Promise<number> {
    const [row] = await db.select({ rating: ratings.rating }).from(ratings).where(eq(ratings.userId, userId)).limit(1);

    return row?.rating ?? STARTING_RATING;
}

export async function getProfile(db: Database, userId: string): Promise<ProfileResponse> {
    const [row] = await db.select().from(ratings).where(eq(ratings.userId, userId)).limit(1);

    return {
        rating: row?.rating ?? STARTING_RATING,
        games: row?.games ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
        draws: row?.draws ?? 0
    };
}

function outcomeFor(slot: number, winner: number): MatchOutcome {
    if (winner === NO_WINNER) return 'draw';

    return winner === slot ? 'win' : 'loss';
}

/**
 * Store a finished match and, for a ranked one, move both players' ratings
 *
 * @returns each slot's rating before and after, or null where the match did not count
 */
export async function recordMatch(db: Database, match: FinishedMatch): Promise<(RatingChange | null)[]> {
    const matchId = randomUUID();
    const outcomes = match.players.map((_player, slot) => outcomeFor(slot, match.winner));
    // A ranked match is always between two accounts; the check keeps a rating from being read twice
    const isRated = match.kind === 'ranked' && match.players[0].userId !== match.players[1].userId;

    return db.transaction(async (transaction) => {
        let changes: (RatingChange | null)[] = match.players.map(() => null);

        if (isRated) {
            const userIds = match.players.map((player) => player.userId);
            const rows = await transaction.select().from(ratings).where(inArray(ratings.userId, userIds)).for('update');
            const before = userIds.map((userId) => rows.find((row) => row.userId === userId)?.rating ?? STARTING_RATING);
            const scoreOfFirst = outcomes[0] === 'win' ? 1 : outcomes[0] === 'loss' ? 0 : 0.5;
            const after = updateRatings(before[0], before[1], scoreOfFirst);

            for (const [slot, userId] of userIds.entries()) {
                const row = rows.find((candidate) => candidate.userId === userId);
                const totals = {
                    rating: after[slot],
                    games: (row?.games ?? 0) + 1,
                    wins: (row?.wins ?? 0) + (outcomes[slot] === 'win' ? 1 : 0),
                    losses: (row?.losses ?? 0) + (outcomes[slot] === 'loss' ? 1 : 0),
                    draws: (row?.draws ?? 0) + (outcomes[slot] === 'draw' ? 1 : 0)
                };

                if (row) {
                    await transaction.update(ratings).set(totals).where(eq(ratings.userId, userId));
                } else {
                    await transaction.insert(ratings).values({ userId, ...totals });
                }
            }

            changes = before.map((rating, slot) => ({ before: rating, after: after[slot] }));
        }

        await transaction.insert(matches).values({
            id: matchId,
            kind: match.kind,
            reason: match.reason,
            rounds: match.rounds,
            durationTicks: match.durationTicks
        });
        await transaction.insert(matchPlayers).values(match.players.map((player, slot) => ({
            matchId,
            slot,
            userId: player.userId,
            displayName: player.displayName,
            roundsWon: match.roundWins[slot],
            outcome: outcomes[slot],
            ratingBefore: changes[slot]?.before ?? null,
            ratingAfter: changes[slot]?.after ?? null
        })));

        return changes;
    });
}

/**
 * The account's latest matches, newest first
 */
export async function listMatches(db: Database, userId: string): Promise<MatchSummary[]> {
    const rows = await db.select({ player: matchPlayers, match: matches })
        .from(matchPlayers)
        .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
        .where(eq(matchPlayers.userId, userId))
        .orderBy(desc(matches.createdAt), desc(matches.id))
        .limit(MATCH_HISTORY_LENGTH);
    if (rows.length === 0) return [];

    const everyPlayer = await db.select().from(matchPlayers).where(inArray(matchPlayers.matchId, rows.map((row) => row.match.id)));

    return rows.map(({ player, match }) => {
        const opponent = everyPlayer.find((other) => other.matchId === match.id && other.slot !== player.slot);

        return {
            id: match.id,
            playedAt: match.createdAt.toISOString(),
            kind: match.kind,
            reason: match.reason,
            outcome: player.outcome,
            roundsWon: player.roundsWon,
            roundsLost: opponent?.roundsWon ?? 0,
            opponentName: opponent?.displayName ?? 'Unknown',
            ratingChange: player.ratingBefore !== null && player.ratingAfter !== null ? player.ratingAfter - player.ratingBefore : null
        };
    });
}
