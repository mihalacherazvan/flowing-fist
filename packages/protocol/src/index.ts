import type { CombatDeck } from '@flowing-fist/content';
import type { CharacterState, InputFrame, MatchState } from '@flowing-fist/sim';

export const PROTOCOL_VERSION = 3;
export const DUEL_ROOM_NAME = 'duel';
export const MATCHMAKING_ROOM_NAME = 'matchmaking';
/** The rating every account starts with */
export const STARTING_RATING = 1000;
export const DEFAULT_SERVER_PORT = 2567;

export const MessageType = {
    /** Server to client: the fight has started, or the client has rejoined it */
    Start: 'start',
    /** Server to client: one simulated tick */
    Tick: 'tick',
    /** Server to client: full state, sent when a client asks for it */
    Snapshot: 'snapshot',
    /** Server to client: the other player dropped or came back */
    Opponent: 'opponent',
    /** Server to client: the match is over; the last message of a fight */
    Result: 'result',
    /** Server to client, in the matchmaking room: an opponent was found, here is your place in the fight */
    MatchFound: 'matchFound',
    /** Client to server: input for one or more ticks */
    Input: 'input',
    /** Client to server: local state no longer matches, send a snapshot */
    RequestSnapshot: 'requestSnapshot'
} as const;

/**
 * The parts of the world that change during a fight
 */
export interface WorldSnapshot {
    tick: number;
    arenaRadius: number;
    characters: CharacterState[];
    match: MatchState | null;
}

/** ranked: opponents paired by the server, counts towards the rating. private: joined by code, counts for nothing. */
export type DuelKind = 'ranked' | 'private';

export interface StartMessage {
    protocolVersion: number;
    /** Which character this client controls */
    slot: number;
    decks: CombatDeck[];
    /** Display name of each character's player */
    names: string[];
    /** Rating of each character's player before this match */
    ratings: number[];
    kind: DuelKind;
    snapshot: WorldSnapshot;
}

export interface TickMessage {
    /** The tick these inputs were applied to */
    tick: number;
    /** The input the server used for each character, which is the final word */
    inputs: InputFrame[];
    /** Hash of the world after the tick, to detect a client drifting out of sync */
    hash: number;
    /**
     * How many ticks ahead of the server this client's newest input was.
     * Negative means inputs are arriving too late to be used.
     */
    lead: number;
}

export interface InputMessage {
    /** Tick of the last frame; earlier frames are for the ticks before it */
    tick: number;
    frames: InputFrame[];
}

export interface SnapshotMessage {
    snapshot: WorldSnapshot;
}

export type OpponentStatus = 'dropped' | 'reconnected';

export interface OpponentMessage {
    status: OpponentStatus;
}

/** completed: played to the end. forfeit: a player left or did not come back in time. */
export type MatchEndReason = 'completed' | 'forfeit';

export interface RatingChange {
    before: number;
    after: number;
}

export interface ResultMessage {
    kind: DuelKind;
    reason: MatchEndReason;
    /** Slot of the winner, or -1 for a draw */
    winner: number;
    /** Rounds won by each slot */
    roundWins: number[];
    /** Per slot; null in a match that does not count towards the rating */
    ratings: (RatingChange | null)[];
}

/** What the client hands to the Colyseus SDK to take its place in a room */
export interface SeatReservation {
    name: string;
    sessionId: string;
    roomId: string;
    publicAddress?: string;
    processId?: string;
    reconnectionToken?: string;
    devMode?: boolean;
}

export interface MatchFoundMessage {
    reservation: SeatReservation;
}

// HTTP API, served by the same process under API_PREFIX

export const API_PREFIX = '/api';
export const MAX_DECKS_PER_ACCOUNT = 8;
export const MAX_DECK_NAME_LENGTH = 40;
export const MAX_DISPLAY_NAME_LENGTH = 24;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export interface AccountInfo {
    id: string;
    displayName: string;
    /** Null for a guest, who exists only as a token held by one browser */
    email: string | null;
    isGuest: boolean;
}

export interface AuthResponse {
    /** Sent back as `Authorization: Bearer <token>` and when joining a room */
    token: string;
    account: AccountInfo;
}

export interface RegisterRequest {
    email: string;
    password: string;
    displayName: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface SavedDeck {
    id: string;
    name: string;
    deck: CombatDeck;
    /** The one deck the account fights with */
    isActive: boolean;
}

export interface DeckRequest {
    name: string;
    deck: CombatDeck;
}

export interface ApiErrorResponse {
    error: string;
    /** One line per problem, e.g. each broken deck rule */
    details?: string[];
}

export interface ProfileResponse {
    rating: number;
    /** Ranked matches only */
    games: number;
    wins: number;
    losses: number;
    draws: number;
}

export type MatchOutcome = 'win' | 'loss' | 'draw';

/** One finished match, from the point of view of the account asking */
export interface MatchSummary {
    id: string;
    /** ISO 8601 */
    playedAt: string;
    kind: DuelKind;
    reason: MatchEndReason;
    outcome: MatchOutcome;
    roundsWon: number;
    roundsLost: number;
    opponentName: string;
    /** Null for a private match */
    ratingChange: number | null;
}
