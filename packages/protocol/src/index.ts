import type { CombatDeck } from '@flowing-fist/content';
import type { CharacterState, InputFrame } from '@flowing-fist/sim';

export const PROTOCOL_VERSION = 1;
export const DUEL_ROOM_NAME = 'duel';
export const DEFAULT_SERVER_PORT = 2567;

export const MessageType = {
    /** Server to client: the fight has started, or the client has rejoined it */
    Start: 'start',
    /** Server to client: one simulated tick */
    Tick: 'tick',
    /** Server to client: full state, sent when a client asks for it */
    Snapshot: 'snapshot',
    /** Server to client: the other player dropped, came back or left */
    Opponent: 'opponent',
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
}

export interface StartMessage {
    protocolVersion: number;
    /** Which character this client controls */
    slot: number;
    decks: CombatDeck[];
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

export type OpponentStatus = 'dropped' | 'reconnected' | 'left';

export interface OpponentMessage {
    status: OpponentStatus;
}
