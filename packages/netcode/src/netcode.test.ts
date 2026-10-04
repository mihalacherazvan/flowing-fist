import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK } from '@flowing-fist/content';
import { PROTOCOL_VERSION } from '@flowing-fist/protocol';
import type { InputMessage, StartMessage, TickMessage } from '@flowing-fist/protocol';
import { Button, encodeInput } from '@flowing-fist/sim';
import type { InputFrame } from '@flowing-fist/sim';
import { DuelAuthority } from './DuelAuthority';
import { PredictionClient } from './PredictionClient';

const DECKS = [DEFAULT_DECK, DEFAULT_DECK];

function createStart(authority: DuelAuthority, slot: number): StartMessage {
    return { protocolVersion: PROTOCOL_VERSION, slot, decks: DECKS, names: ['first', 'second'], snapshot: authority.getSnapshot() };
}

/**
 * Busy, repeatable input: both players circle, attack, guard and dodge
 */
function scriptedInput(slot: number, tick: number): InputFrame {
    const phase = tick + slot * 17;
    const buttons = (phase % 45 < 2 ? Button.Attack : 0)
        | (phase % 131 === 0 ? Button.Alternate : 0)
        | (phase % 200 > 170 ? Button.Guard : 0)
        | (phase % 97 === 0 ? Button.Dodge : 0)
        | (phase === 5 ? Button.LockOn : 0);

    return encodeInput(buttons, ((phase * 7) % 21 - 10) / 10, 0.6, slot === 0 ? 0 : Math.PI);
}

/**
 * A one-way link that delivers in order after a delay, like a TCP stream
 */
class DelayedLink<T> {
    private queue: { deliverAt: number; message: T }[] = [];
    private lastDeliverAt: number = 0;

    constructor(private latencyTicks: number, private jitterTicks: number, private seed: number) {}

    public send(now: number, message: T): void {
        // Small deterministic generator, so a failing run can be repeated
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        const jitter = this.jitterTicks > 0 ? this.seed % (this.jitterTicks + 1) : 0;

        this.lastDeliverAt = Math.max(this.lastDeliverAt, now + this.latencyTicks + jitter);
        this.queue.push({ deliverAt: this.lastDeliverAt, message });
    }

    public receive(now: number): T[] {
        const due: T[] = [];
        while (this.queue.length > 0 && this.queue[0].deliverAt <= now) {
            due.push(this.queue.shift()!.message);
        }

        return due;
    }
}

interface SimulatedPlayer {
    client: PredictionClient;
    toServer: DelayedLink<InputMessage>;
    fromServer: DelayedLink<TickMessage>;
    localTick: number;
    desyncs: number;
    maxDepth: number;
    lateTicks: number;
}

function simulateDuel(latencyTicks: number[], jitterTicks: number, totalTicks: number) {
    const authority = new DuelAuthority(DECKS);
    const players: SimulatedPlayer[] = latencyTicks.map((latency, slot) => ({
        client: new PredictionClient(createStart(authority, slot)),
        toServer: new DelayedLink(latency, jitterTicks, 1 + slot),
        fromServer: new DelayedLink(latency, jitterTicks, 101 + slot),
        localTick: 0,
        desyncs: 0,
        maxDepth: 0,
        lateTicks: 0
    }));
    const warmUpTicks = 180;

    for (let now = 0; now < totalTicks; now++) {
        players.forEach((player, slot) => {
            for (const message of player.fromServer.receive(now)) {
                if (!player.client.receiveTick(message)) player.desyncs++;
                if (now > warmUpTicks && message.lead < 0) player.lateTicks++;
            }

            const ticks = Math.max(0, 1 + player.client.consumeTickAdjustment());
            const input = player.client.advance(ticks, () => scriptedInput(slot, player.localTick++));
            if (input) player.toServer.send(now, input);

            player.client.predict();
            if (now > warmUpTicks) {
                player.maxDepth = Math.max(player.maxDepth, player.client.getPredictionDepth());
            }

            for (const message of player.toServer.receive(now)) {
                authority.receiveInput(slot, message);
            }
        });

        authority.step().forEach((message, slot) => players[slot].fromServer.send(now, message));
    }

    return { authority, players };
}

describe('server-authoritative prediction', () => {
    it('stays in sync over a clean low-latency link', () => {
        const { authority, players } = simulateDuel([1, 1], 0, 1200);

        for (const player of players) {
            expect(player.desyncs).toBe(0);
            expect(player.lateTicks).toBe(0);
            expect(player.maxDepth).toBeLessThanOrEqual(8);
            expect(player.client.getConfirmedTick()).toBeGreaterThan(1100);
        }

        // The players' inputs really drove the fight
        const [first, second] = authority.getSnapshot().characters;
        expect(Math.hypot(first.x, first.z + 3)).toBeGreaterThan(0.5);
        expect(first.health + second.health).toBeLessThan(200);
    });

    it('stays in sync with 100 ms and 200 ms round trips and jitter', () => {
        // 3 and 6 ticks each way
        const { players } = simulateDuel([3, 6], 2, 1800);

        for (const player of players) {
            expect(player.desyncs).toBe(0);
            // Inputs settle into arriving on time, give or take the odd jitter spike
            expect(player.lateTicks).toBeLessThan(20);
        }

        expect(players[0].maxDepth).toBeLessThanOrEqual(20);
        expect(players[1].maxDepth).toBeLessThanOrEqual(28);
    });

    it('predicts the local player ahead of the confirmed state', () => {
        const authority = new DuelAuthority(DECKS);
        const client = new PredictionClient(createStart(authority, 0));
        const startX = authority.getSnapshot().characters[0].x;

        client.advance(10, () => encodeInput(0, 1, 0, 0));
        const { previous, current } = client.predict();

        expect(current.tick).toBe(client.getConfirmedTick() + client.getPredictionDepth());
        expect(previous.tick).toBe(current.tick - 1);
        expect(current.characters[0].x).toBeGreaterThan(startX + 0.4);
        // The server has confirmed nothing yet
        expect(client.getConfirmedTick()).toBe(0);
    });

    it('recovers from a desync with a snapshot', () => {
        const authority = new DuelAuthority(DECKS);
        const client = new PredictionClient(createStart(authority, 0));

        const corrupted = authority.step()[0];
        expect(client.receiveTick({ ...corrupted, hash: corrupted.hash + 1 })).toBe(false);

        client.receiveSnapshot(authority.getSnapshot());
        expect(client.getConfirmedTick()).toBe(authority.getTick());
        expect(client.receiveTick(authority.step()[0])).toBe(true);
    });

    it('asks for a snapshot when ticks are missing', () => {
        const authority = new DuelAuthority(DECKS);
        const client = new PredictionClient(createStart(authority, 0));

        authority.step();
        expect(client.receiveTick(authority.step()[0])).toBe(false);
    });

    it('stops predicting when the server goes quiet, and skips ahead after a long pause', () => {
        const authority = new DuelAuthority(DECKS);
        const client = new PredictionClient(createStart(authority, 0));

        client.advance(500, () => encodeInput(0, 0, 1, 0));
        expect(client.getPredictionDepth()).toBe(60);

        // The server runs on far past everything the client predicted
        for (let i = 0; i < 300; i++) authority.step();
        client.receiveSnapshot(authority.getSnapshot());

        const message = client.advance(1, () => encodeInput(0, 0, 1, 0));
        expect(message?.tick).toBeGreaterThan(authority.getTick());
    });
});

describe('DuelAuthority input handling', () => {
    it('repeats the last input when nothing arrives, and stands a disconnected player still', () => {
        const authority = new DuelAuthority(DECKS);
        const forward = encodeInput(0, 0, 1, 0);

        authority.receiveInput(0, { tick: 0, frames: [forward] });
        expect(authority.step()[0].inputs[0]).toEqual(forward);
        expect(authority.step()[0].inputs[0]).toEqual(forward);

        authority.setConnected(0, false);
        expect(authority.step()[0].inputs[0].moveY).toBe(0);
    });

    it('applies late input on the next tick instead of losing it, and reports the lead', () => {
        const authority = new DuelAuthority(DECKS);
        authority.step();
        authority.step();

        // Two late frames: a quick attack press, then the button already released
        authority.receiveInput(0, {
            tick: 1,
            frames: [encodeInput(Button.Attack, 1, 0, 0), encodeInput(0, 0, 1, 0)]
        });
        const late = authority.step()[0];
        expect(late.inputs[0]).toEqual(encodeInput(Button.Attack, 0, 1, 0));
        expect(late.lead).toBeLessThan(0);

        authority.receiveInput(0, { tick: 5, frames: [encodeInput(0, 1, 0, 0)] });
        const early = authority.step()[0];
        expect(early.inputs[0]).toEqual(encodeInput(Button.Attack, 0, 1, 0));
        expect(early.lead).toBe(2);
    });

    it('sanitises malformed input instead of trusting it', () => {
        const authority = new DuelAuthority(DECKS);

        authority.receiveInput(0, { tick: 0, frames: [{ buttons: 1e9, moveX: 9999, moveY: NaN, yaw: -5 }] });
        authority.receiveInput(1, { tick: 'x', frames: null } as unknown as InputMessage);
        authority.receiveInput(1, { tick: 100000, frames: [encodeInput(0, 1, 0, 0)] });
        authority.receiveInput(1, { tick: -100000, frames: [encodeInput(0, 1, 0, 0)] });

        const [message] = authority.step();
        expect(message.inputs[0]).toEqual({ buttons: 63, moveX: 127, moveY: 0, yaw: 0 });
        expect(message.inputs[1].moveX).toBe(0);
    });
});
