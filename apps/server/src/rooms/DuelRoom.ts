import { Room } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { DEFAULT_DECK } from '@flowing-fist/content';
import { DuelAuthority } from '@flowing-fist/netcode';
import { MessageType, PROTOCOL_VERSION } from '@flowing-fist/protocol';
import type {
    InputMessage,
    OpponentMessage,
    OpponentStatus,
    SnapshotMessage,
    StartMessage
} from '@flowing-fist/protocol';
import { FixedTimestep, TICK_MS } from '@flowing-fist/sim';

const PLAYER_COUNT = 2;
const RECONNECTION_SECONDS = 20;
// Everyone plays the default deck until decks can be saved and chosen
const DECKS = [DEFAULT_DECK, DEFAULT_DECK];

/**
 * One 1v1 fight. The room owns the authoritative simulation; clients only
 * send input and are told what the server did with it.
 */
export class DuelRoom extends Room {
    public maxClients = PLAYER_COUNT;

    private authority?: DuelAuthority;
    private timestep: FixedTimestep = new FixedTimestep();
    private lastUpdateAt: number = performance.now();
    /** Session id to character slot */
    private slots: Map<string, number> = new Map();

    public onCreate(): void {
        // The fight is synchronised through messages, not through room state
        this.setPatchRate(null);

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
        const takenSlots = new Set(this.slots.values());
        const slot = [...Array(PLAYER_COUNT).keys()].find((candidate) => !takenSlots.has(candidate));
        if (slot === undefined) throw new Error('Room is full');

        this.slots.set(client.sessionId, slot);

        if (this.slots.size === PLAYER_COUNT && !this.authority) {
            this.authority = new DuelAuthority(DECKS);
            this.lock();
            this.clients.forEach((roomClient) => this.sendStart(roomClient));
        }
    }

    public onDrop(client: Client): void {
        const slot = this.slots.get(client.sessionId);
        if (slot === undefined || !this.authority) return;

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
        this.slots.delete(client.sessionId);

        // A fight cannot go on with one player; before it starts the room just waits for another
        if (this.authority) {
            this.notifyOpponent(client, 'left');
            this.disconnect();
        }
    }

    private update(): void {
        const now = performance.now();
        const elapsedMs = now - this.lastUpdateAt;
        this.lastUpdateAt = now;

        if (!this.authority) return;

        const ticks = this.timestep.advance(elapsedMs);
        for (let i = 0; i < ticks; i++) {
            const messages = this.authority.step();

            this.clients.forEach((client) => {
                const slot = this.slots.get(client.sessionId);
                if (slot !== undefined) client.send(MessageType.Tick, messages[slot]);
            });
        }
    }

    private sendStart(client: Client): void {
        const slot = this.slots.get(client.sessionId);
        if (slot === undefined || !this.authority) return;

        const message: StartMessage = {
            protocolVersion: PROTOCOL_VERSION,
            slot,
            decks: DECKS,
            snapshot: this.authority.getSnapshot()
        };
        client.send(MessageType.Start, message);
    }

    private notifyOpponent(client: Client, status: OpponentStatus): void {
        const message: OpponentMessage = { status };
        this.broadcast(MessageType.Opponent, message, { except: client });
    }
}
