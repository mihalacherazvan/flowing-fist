import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { DEFAULT_DECK, TRAINING_ARENA } from '@flowing-fist/content';
import { PredictionClient } from '@flowing-fist/netcode';
import { DUEL_ROOM_NAME, MATCHMAKING_ROOM_NAME, MessageType, PROTOCOL_VERSION } from '@flowing-fist/protocol';
import type {
    MatchFoundMessage,
    OpponentMessage,
    ResultMessage,
    SeatReservation,
    SnapshotMessage,
    StartMessage,
    TickMessage
} from '@flowing-fist/protocol';
import { FixedTimestep, PI, createCharacter, createWorld } from '@flowing-fist/sim';
import type { InputFrame, WorldState } from '@flowing-fist/sim';
import { accountStore } from '../../account/accountStore';
import { getServerUrl } from '../../api/apiClient';
import type { DuelRequest, HudLobby, HudResult } from '../../ui/hudStore';
import type { GameSession } from './GameSession';

const MAX_TICKS_PER_FRAME = 60;

/**
 * connecting: reaching the server. searching: in the matchmaking queue.
 * waiting: in the duel room, before both players are there. finished: the
 * match has a result. ended: it stopped without one.
 */
type DuelPhase = 'connecting' | 'searching' | 'waiting' | 'fighting' | 'reconnecting' | 'finished' | 'ended';

/** A failure whose message is meant for the player */
class DuelError extends Error {}

/**
 * Artificial one-way delay in milliseconds, from ?latency= in the page address.
 * For feeling out how the game plays on a bad connection.
 */
function getSimulatedLatencyMs(): number {
    const latency = Number(new URLSearchParams(location.search).get('latency'));

    return Number.isFinite(latency) && latency > 0 ? latency : 0;
}

/** Colyseus refusals carry a numeric code and the server's own message */
function isServerRefusal(error: unknown): error is Error {
    return error instanceof Error && typeof (error as { code?: unknown }).code === 'number';
}

/**
 * An online 1v1 match. The server runs the real simulation; this predicts
 * ahead of it so the local player's own actions show without waiting.
 */
export class DuelSession implements GameSession {
    public readonly mode = 'duel';

    // The server keeps real time whatever our frame rate, so catch up fully after a slow frame
    private timestep: FixedTimestep = new FixedTimestep(MAX_TICKS_PER_FRAME);
    private lobby?: Room;
    private room?: Room;
    private prediction?: PredictionClient;
    private phase: DuelPhase = 'connecting';
    private phaseStartedAt: number = performance.now();
    private endReason: string = '';
    private opponentDropped: boolean = false;
    private awaitingSnapshot: boolean = false;
    private latencyMs: number = getSimulatedLatencyMs();
    private disposed: boolean = false;
    private start?: StartMessage;
    private result?: ResultMessage;
    private world: WorldState;
    private previousWorld: WorldState;

    constructor(private readonly request: DuelRequest) {
        // Something to draw until the fight starts
        this.world = createWorld(TRAINING_ARENA.radius, [
            createCharacter(0, -3, 0),
            createCharacter(0, 3, PI)
        ], [DEFAULT_DECK, DEFAULT_DECK]);
        this.previousWorld = this.world;

        this.connect();
    }

    private setPhase(phase: DuelPhase): void {
        this.phase = phase;
        this.phaseStartedAt = performance.now();
    }

    private async connect(): Promise<void> {
        try {
            // The server may have been unreachable when the page loaded
            await accountStore.connect();
            const token = accountStore.getToken();
            if (accountStore.getState().status !== 'online' || !token) {
                this.end(`Could not reach the server at ${getServerUrl()}`);
                return;
            }

            // The server picks the deck from the account behind this token
            const client = new Client(getServerUrl());
            client.auth.token = token;

            const room = await this.joinDuelRoom(client);
            if (this.disposed) {
                room.leave();
                return;
            }

            this.room = room;
            this.setPhase('waiting');

            room.onMessage(MessageType.Start, this.delayed((message: StartMessage) => this.handleStart(message)));
            room.onMessage(MessageType.Tick, this.delayed((message: TickMessage) => this.handleTick(message)));
            room.onMessage(MessageType.Snapshot, this.delayed((message: SnapshotMessage) => {
                this.prediction?.receiveSnapshot(message.snapshot);
                this.awaitingSnapshot = false;
            }));
            room.onMessage(MessageType.Opponent, this.delayed((message: OpponentMessage) => {
                this.opponentDropped = message.status === 'dropped';
            }));
            room.onMessage(MessageType.Result, this.delayed((message: ResultMessage) => this.handleResult(message)));

            room.onDrop(() => {
                if (this.phase === 'fighting') this.setPhase('reconnecting');
            });
            // Delayed like the messages, so that the result still arrives before the room closing
            room.onLeave(this.delayed(() => {
                const neverStarted = this.phase === 'waiting' && this.request.kind === 'ranked';
                this.end(neverStarted ? 'Your opponent did not connect, so the match was called off' : 'Disconnected');
            }));
            room.onError((_code, message) => this.end(message ?? 'Connection error'));
        } catch (error) {
            // A refusal carries the server's reason; anything else is the network
            const reason = error instanceof DuelError || isServerRefusal(error) ? error.message : '';
            this.end(reason || `Could not reach the server at ${getServerUrl()}`);
        }
    }

    /**
     * Get into a duel room the way the request asks: through the matchmaking
     * queue, by creating a private room, or by joining one by its code
     */
    private async joinDuelRoom(client: Client): Promise<Room> {
        if (this.request.kind === 'private') {
            const code = this.request.code;
            if (code === null) return client.create(DUEL_ROOM_NAME);

            try {
                return await client.joinById(code);
            } catch (error) {
                if (!isServerRefusal(error)) throw error;
                throw new DuelError(`No private duel is waiting under the code ${code}`);
            }
        }

        const lobby = await client.joinOrCreate(MATCHMAKING_ROOM_NAME);
        if (this.disposed) {
            lobby.leave();
            throw new DuelError('Cancelled');
        }

        this.lobby = lobby;
        this.setPhase('searching');

        try {
            const reservation = await new Promise<SeatReservation>((resolve, reject) => {
                lobby.onMessage(MessageType.MatchFound, (message: MatchFoundMessage) => resolve(message.reservation));
                lobby.onLeave(() => reject(new DuelError('The search for an opponent was interrupted')));
                lobby.onError((_code, message) => reject(new DuelError(message ?? 'Connection error')));
            });

            return await client.consumeSeatReservation(reservation);
        } finally {
            this.lobby = undefined;
            lobby.leave();
        }
    }

    /**
     * Wrap a message handler so it runs after the simulated latency, in order
     */
    private delayed<T>(handler: (message: T) => void): (message: T) => void {
        if (this.latencyMs === 0) return handler;

        return (message) => setTimeout(() => handler(message), this.latencyMs);
    }

    private send(type: string, message?: unknown): void {
        if (this.latencyMs === 0) {
            this.room?.send(type, message);
        } else {
            setTimeout(() => this.room?.send(type, message), this.latencyMs);
        }
    }

    private handleStart(message: StartMessage): void {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
            this.end('This page is out of date, please reload');
            return;
        }

        // Also sent after a reconnection, in which case this starts over from the server's state
        this.prediction = new PredictionClient(message);
        this.start = message;
        this.awaitingSnapshot = false;
        this.setPhase('fighting');
    }

    private handleTick(message: TickMessage): void {
        if (!this.prediction) return;

        const inSync = this.prediction.receiveTick(message);
        if (!inSync && !this.awaitingSnapshot) {
            this.awaitingSnapshot = true;
            this.send(MessageType.RequestSnapshot);
        }
    }

    private handleResult(message: ResultMessage): void {
        if (this.phase === 'ended') return;

        this.result = message;
        this.setPhase('finished');
        // The rating and the match history have just changed
        accountStore.refreshProfile();
    }

    private end(reason: string): void {
        // A match that has its result is over already; the room closing after it is not news
        if (this.phase === 'ended' || this.phase === 'finished') return;

        this.setPhase('ended');
        this.endReason = reason;
    }

    public getLocalPlayerIndex(): number {
        return this.prediction?.slot ?? 0;
    }

    public getCharacterNames(): string[] {
        const localIndex = this.getLocalPlayerIndex();

        return [0, 1].map((index) => {
            const name = index === localIndex ? 'You' : this.start?.names[index] ?? 'Opponent';
            // Ratings only matter, and are only shown, where the match counts towards them
            return this.start?.kind === 'ranked' ? `${name} · ${this.start.ratings[index]}` : name;
        });
    }

    public update(elapsedMs: number, sampleInput: () => InputFrame): void {
        let ticks = this.timestep.advance(elapsedMs);
        if (!this.prediction || this.phase !== 'fighting') return;

        // Run slightly fast or slow to keep inputs arriving at the server just in time
        ticks = Math.max(0, ticks + this.prediction.consumeTickAdjustment());

        const message = this.prediction.advance(ticks, sampleInput);
        if (message) this.send(MessageType.Input, message);

        const predicted = this.prediction.predict();
        this.world = predicted.current;
        this.previousWorld = predicted.previous;
    }

    public getWorld(): WorldState {
        return this.world;
    }

    public getPreviousWorld(): WorldState {
        return this.previousWorld;
    }

    public getAlpha(): number {
        return this.phase === 'fighting' ? this.timestep.getAlpha() : 1;
    }

    public getPhase(): DuelPhase {
        return this.phase;
    }

    public getStatusLine(): string {
        const kind = this.request.kind === 'ranked' ? 'Ranked duel' : 'Private duel';

        if (this.phase === 'connecting') return `${kind} · connecting…`;
        if (this.phase === 'searching') return `${kind} · looking for an opponent…`;
        if (this.phase === 'waiting') return `${kind} · waiting for your opponent…`;
        if (this.phase === 'reconnecting') return `${kind} · connection lost, reconnecting…`;
        if (this.phase === 'finished') return `${kind} · finished`;
        if (this.phase === 'ended') return `${kind} ended · ${this.endReason}`;

        const depth = this.prediction?.getPredictionDepth() ?? 0;
        const latency = this.latencyMs > 0 ? ` · +${this.latencyMs} ms simulated each way` : '';
        const opponent = this.opponentDropped ? ' · opponent reconnecting…' : '';

        return `${kind} · predicting ${depth} ticks ahead${latency}${opponent}`;
    }

    public getLobby(): HudLobby | null {
        const seconds = Math.floor((performance.now() - this.phaseStartedAt) / 1000);

        if (this.phase === 'connecting') return { message: 'Connecting…', code: null, isOver: false };
        if (this.phase === 'searching') return { message: `Looking for an opponent… ${seconds} s`, code: null, isOver: false };
        if (this.phase === 'ended') return { message: this.endReason, code: null, isOver: true };
        if (this.phase !== 'waiting') return null;

        // Only the player who made a private duel has a code to pass on
        const isHost = this.request.kind === 'private' && this.request.code === null;

        return isHost
            ? { message: 'Give this code to your opponent', code: this.room?.roomId ?? null, isOver: false }
            : { message: 'Opponent found, starting…', code: null, isOver: false };
    }

    public getResult(): HudResult | null {
        const result = this.result;
        if (this.phase !== 'finished' || !result) return null;

        const slot = this.getLocalPlayerIndex();
        const title = result.winner < 0 ? 'Draw' : result.winner === slot ? 'Victory' : 'Defeat';
        const score = `${result.roundWins[slot]} – ${result.roundWins[1 - slot]}`;
        const forfeit = result.winner === slot ? 'your opponent left' : 'you left the match';
        const rating = result.ratings[slot];
        const change = rating ? rating.after - rating.before : 0;

        return {
            title,
            detail: result.reason === 'forfeit' ? `${score} · ${forfeit}` : score,
            rating: rating
                ? `Rating ${rating.before} → ${rating.after} (${change >= 0 ? '+' : '−'}${Math.abs(change)})`
                : 'Private duels do not change your rating',
            isRanked: result.kind === 'ranked'
        };
    }

    public dispose(): void {
        this.disposed = true;
        // Leaving a match that is still being fought gives it to the opponent
        this.phase = 'ended';
        this.lobby?.leave();
        this.room?.leave();
    }
}
