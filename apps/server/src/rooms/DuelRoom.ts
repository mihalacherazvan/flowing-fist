import { randomInt } from 'node:crypto';
import { Room, ServerError, matchMaker } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { DuelAuthority } from '@flowing-fist/netcode';
import { MessageType, PROTOCOL_VERSION } from '@flowing-fist/protocol';
import type {
    DuelKind,
    InputMessage,
    MatchEndReason,
    OpponentMessage,
    OpponentStatus,
    RatingChange,
    ResultMessage,
    SnapshotMessage,
    StartMessage
} from '@flowing-fist/protocol';
import { FixedTimestep, TICK_MS } from '@flowing-fist/sim';
import type { Database } from '../db/database';
import { recordMatch } from '../matches/matches';
import { redeemMatchTicket } from './matchmaking';
import { authenticatePlayer } from './players';
import type { DuelPlayer } from './players';

const PLAYER_COUNT = 2;
const RECONNECTION_SECONDS = 20;
/** A ranked room whose players have not both arrived by then is closed */
const RANKED_ARRIVAL_SECONDS = 15;
// No 0/O or 1/I/L, which are easy to confuse when a code is read out or typed
const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;

function createRoomCode(): string {
    let code: string;
    do {
        code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)]).join('');
    } while (matchMaker.getLocalRoomById(code));

    return code;
}

/**
 * One 1v1 match. The room owns the authoritative simulation; clients only
 * send input and are told what the server did with it.
 *
 * A room is either ranked, made by the matchmaker for two particular players,
 * or private, made by a player and joined by whoever is given its code.
 */
export class DuelRoom extends Room {
    /** Set once at start-up; rooms are created by Colyseus, so it cannot be passed in */
    public static db: Database;

    public maxClients = PLAYER_COUNT;

    private kind: DuelKind = 'private';
    /** In a ranked room, the only accounts let in */
    private expectedUserIds: string[] = [];
    private authority?: DuelAuthority;
    private timestep: FixedTimestep = new FixedTimestep();
    private lastUpdateAt: number = performance.now();
    /** Session id to character slot */
    private slots: Map<string, number> = new Map();
    /** Who fights in each slot; kept after the fight starts, for players who rejoin */
    private players: DuelPlayer[] = [];
    /** Set once the match has a result; nothing is simulated or recorded after that */
    private concluded: boolean = false;

    /**
     * Runs before a client that joins by itself is let in. Players placed by
     * the matchmaker were checked there and skip this.
     *
     * @returns the player, which Colyseus hands to onJoin as client.auth
     */
    public static onAuth(token: string): Promise<DuelPlayer> {
        return authenticatePlayer(DuelRoom.db, token);
    }

    public onCreate(options?: { ticket?: unknown }): void {
        // The fight is synchronised through messages, not through room state
        this.setPatchRate(null);
        // Nobody finds a duel by browsing: the matchmaker places players, or they join by code
        this.setPrivate(true);

        const ticketUserIds = redeemMatchTicket(options?.ticket);
        if (ticketUserIds) {
            this.kind = 'ranked';
            this.expectedUserIds = ticketUserIds;
            this.clock.setTimeout(() => {
                if (!this.authority) this.disconnect();
            }, RANKED_ARRIVAL_SECONDS * 1000);
        } else {
            // The room id is the code a friend types in
            this.roomId = createRoomCode();
        }

        this.onMessage(MessageType.Input, (client: Client, message: InputMessage) => {
            const slot = this.slots.get(client.sessionId);
            if (slot !== undefined) this.authority?.receiveInput(slot, message);
        });

        this.onMessage(MessageType.RequestSnapshot, (client: Client) => {
            if (!this.authority) return;

            const message: SnapshotMessage = { snapshot: this.authority.getSnapshot() };
            client.send(MessageType.Snapshot, message);
        });

        // Colyseus only wakes us up here; the elapsed time it passes in is not
        // reliable (it reads as near zero), so update() measures time itself
        this.setSimulationInterval(() => this.update(), TICK_MS);
    }

    public onJoin(client: Client): void {
        const player = client.auth as DuelPlayer;
        if (this.kind === 'ranked') {
            const isExpected = this.expectedUserIds.includes(player.userId);
            const isAlreadyHere = this.players.some((present) => present?.userId === player.userId);
            if (!isExpected || isAlreadyHere) throw new ServerError(403, 'This match is for other players');
        }

        const takenSlots = new Set(this.slots.values());
        const slot = [...Array(PLAYER_COUNT).keys()].find((candidate) => !takenSlots.has(candidate));
        if (slot === undefined) throw new Error('Room is full');

        this.slots.set(client.sessionId, slot);
        this.players[slot] = player;

        if (this.slots.size === PLAYER_COUNT && !this.authority) {
            this.authority = new DuelAuthority(this.players.map((present) => present.deck));
            this.lock();
            this.clients.forEach((roomClient) => this.sendStart(roomClient));
        }
    }

    public onDrop(client: Client): void {
        const slot = this.slots.get(client.sessionId);
        if (slot === undefined || !this.authority || this.concluded) return;

        this.authority.setConnected(slot, false);
        this.notifyOpponent(client, 'dropped');
        this.allowReconnection(client, RECONNECTION_SECONDS);
    }

    public onReconnect(client: Client): void {
        const slot = this.slots.get(client.sessionId);
        if (slot === undefined || !this.authority) return;

        this.authority.setConnected(slot, true);
        this.sendStart(client);
        this.notifyOpponent(client, 'reconnected');
    }

    public onLeave(client: Client): void {
        const slot = this.slots.get(client.sessionId);
        this.slots.delete(client.sessionId);

        // Before the fight starts the room just waits for another player.
        // Once it has, leaving (or not coming back in time) gives the match away.
        if (slot !== undefined && this.authority && !this.concluded) {
            this.conclude('forfeit', 1 - slot);
        }
    }

    private update(): void {
        const now = performance.now();
        const elapsedMs = now - this.lastUpdateAt;
        this.lastUpdateAt = now;

        if (!this.authority || this.concluded) return;

        const ticks = this.timestep.advance(elapsedMs);
        for (let i = 0; i < ticks; i++) {
            const messages = this.authority.step();

            this.clients.forEach((client) => {
                const slot = this.slots.get(client.sessionId);
                if (slot !== undefined) client.send(MessageType.Tick, messages[slot]);
            });

            if (this.authority.isMatchOver()) {
                this.conclude('completed', this.authority.getMatch().matchWinner);
                break;
            }
        }
    }

    /**
     * Stop the fight, store the match, tell the players how it went and close the room
     *
     * @param winner slot of the winner, or -1 for a draw
     */
    private async conclude(reason: MatchEndReason, winner: number): Promise<void> {
        if (!this.authority || this.concluded) return;
        this.concluded = true;

        const match = this.authority.getMatch();
        let ratings: (RatingChange | null)[] = this.players.map(() => null);
        try {
            ratings = await recordMatch(DuelRoom.db, {
                kind: this.kind,
                reason,
                winner,
                roundWins: match.wins,
                rounds: match.round,
                durationTicks: this.authority.getTick(),
                players: this.players
            });
        } catch (error) {
            // The players still get their result; it is only missing from the history and the ratings
            console.error(error);
        }

        const message: ResultMessage = { kind: this.kind, reason, winner, roundWins: match.wins, ratings };
        this.broadcast(MessageType.Result, message);
        this.disconnect();
    }

    private sendStart(client: Client): void {
        const slot = this.slots.get(client.sessionId);
        if (slot === undefined || !this.authority) return;

        const message: StartMessage = {
            protocolVersion: PROTOCOL_VERSION,
            slot,
            decks: this.players.map((player) => player.deck),
            names: this.players.map((player) => player.displayName),
            ratings: this.players.map((player) => player.rating),
            kind: this.kind,
            snapshot: this.authority.getSnapshot()
        };
        client.send(MessageType.Start, message);
    }

    private notifyOpponent(client: Client, status: OpponentStatus): void {
        const message: OpponentMessage = { status };
        this.broadcast(MessageType.Opponent, message, { except: client });
    }
}
