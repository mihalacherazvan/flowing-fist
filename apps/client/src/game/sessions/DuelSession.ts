import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { DEFAULT_DECK, TRAINING_ARENA } from '@flowing-fist/content';
import { PredictionClient } from '@flowing-fist/netcode';
import { DUEL_ROOM_NAME, MessageType, PROTOCOL_VERSION } from '@flowing-fist/protocol';
import type { OpponentMessage, SnapshotMessage, StartMessage, TickMessage } from '@flowing-fist/protocol';
import { FixedTimestep, PI, createCharacter, createWorld } from '@flowing-fist/sim';
import type { InputFrame, WorldState } from '@flowing-fist/sim';
import { accountStore } from '../../account/accountStore';
import { getServerUrl } from '../../api/apiClient';
import type { GameSession } from './GameSession';

const MAX_TICKS_PER_FRAME = 60;

type DuelPhase = 'connecting' | 'waiting' | 'fighting' | 'reconnecting' | 'ended';

/**
 * Artificial one-way delay in milliseconds, from ?latency= in the page address.
 * For feeling out how the game plays on a bad connection.
 */
function getSimulatedLatencyMs(): number {
    const latency = Number(new URLSearchParams(location.search).get('latency'));

    return Number.isFinite(latency) && latency > 0 ? latency : 0;
}

/**
 * An online 1v1 fight. The server runs the real simulation; this predicts
 * ahead of it so the local player's own actions show without waiting.
 */
export class DuelSession implements GameSession {
    public readonly mode = 'duel';

    // The server keeps real time whatever our frame rate, so catch up fully after a slow frame
    private timestep: FixedTimestep = new FixedTimestep(MAX_TICKS_PER_FRAME);
    private room?: Room;
    private prediction?: PredictionClient;
    private phase: DuelPhase = 'connecting';
    private endReason: string = '';
    private opponentDropped: boolean = false;
    private awaitingSnapshot: boolean = false;
    private latencyMs: number = getSimulatedLatencyMs();
    private disposed: boolean = false;
    private playerNames: string[] = [];
    private world: WorldState;
    private previousWorld: WorldState;

    constructor() {
        // Something to draw until the fight starts
        this.world = createWorld(TRAINING_ARENA.radius, [
            createCharacter(0, -3, 0),
            createCharacter(0, 3, PI)
        ], [DEFAULT_DECK, DEFAULT_DECK]);
        this.previousWorld = this.world;

        this.connect();
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
            const room = await client.joinOrCreate(DUEL_ROOM_NAME);
            if (this.disposed) {
                room.leave();
                return;
            }

            this.room = room;
            this.phase = 'waiting';

            room.onMessage(MessageType.Start, this.delayed((message: StartMessage) => this.handleStart(message)));
            room.onMessage(MessageType.Tick, this.delayed((message: TickMessage) => this.handleTick(message)));
            room.onMessage(MessageType.Snapshot, this.delayed((message: SnapshotMessage) => {
                this.prediction?.receiveSnapshot(message.snapshot);
                this.awaitingSnapshot = false;
            }));
            room.onMessage(MessageType.Opponent, this.delayed((message: OpponentMessage) => {
                this.opponentDropped = message.status === 'dropped';
                if (message.status === 'left') this.end('Opponent left');
            }));

            room.onDrop(() => {
                if (this.phase !== 'ended') this.phase = 'reconnecting';
            });
            // Delayed like the messages, so that "opponent left" still arrives before the room closing
            room.onLeave(this.delayed(() => this.end('Disconnected')));
            room.onError((_code, message) => this.end(message ?? 'Connection error'));
        } catch (error) {
            // A refusal carries the server's reason (an error code and message); anything else is the network
            const refusal = error instanceof Error && typeof (error as { code?: unknown }).code === 'number' ? error.message : '';
            this.end(refusal || `Could not reach the server at ${getServerUrl()}`);
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
        this.playerNames = message.names;
        this.awaitingSnapshot = false;
        this.phase = 'fighting';
    }

    private handleTick(message: TickMessage): void {
        if (!this.prediction) return;

        const inSync = this.prediction.receiveTick(message);
        if (!inSync && !this.awaitingSnapshot) {
            this.awaitingSnapshot = true;
            this.send(MessageType.RequestSnapshot);
        }
    }

    private end(reason: string): void {
        if (this.phase === 'ended') return;

        this.phase = 'ended';
        this.endReason = reason;
    }

    public getLocalPlayerIndex(): number {
        return this.prediction?.slot ?? 0;
    }

    public getCharacterNames(): string[] {
        const localIndex = this.getLocalPlayerIndex();

        return [0, 1].map((index) => index === localIndex ? 'You' : this.playerNames[index] ?? 'Opponent');
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
        if (this.phase === 'connecting') return 'Online duel · connecting…';
        if (this.phase === 'waiting') return 'Online duel · waiting for an opponent…';
        if (this.phase === 'reconnecting') return 'Online duel · connection lost, reconnecting…';
        if (this.phase === 'ended') return `Online duel ended · ${this.endReason}`;

        const depth = this.prediction?.getPredictionDepth() ?? 0;
        const latency = this.latencyMs > 0 ? ` · +${this.latencyMs} ms simulated each way` : '';
        const opponent = this.opponentDropped ? ' · opponent reconnecting…' : '';

        return `Online duel · predicting ${depth} ticks ahead${latency}${opponent}`;
    }

    public dispose(): void {
        this.disposed = true;
        this.phase = 'ended';
        this.room?.leave();
    }
}
