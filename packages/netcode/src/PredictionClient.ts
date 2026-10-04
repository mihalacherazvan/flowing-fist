import type { InputMessage, StartMessage, TickMessage, WorldSnapshot } from '@flowing-fist/protocol';
import { EMPTY_INPUT, cloneWorld, hashWorld, stepWorld } from '@flowing-fist/sim';
import type { InputFrame, WorldState } from '@flowing-fist/sim';
import type { CombatDeck } from '@flowing-fist/content';
import { worldFromSnapshot } from './snapshot';

/** How many ticks ahead of the server our inputs should arrive: enough to absorb jitter */
const TARGET_LEAD_TICKS = 3;
const MIN_LEAD_TICKS = 2;
const MAX_LEAD_TICKS = 6;
/** Lead reports lag behind by a round trip, so wait this long between corrections */
const ADJUSTMENT_COOLDOWN_TICKS = 30;
const MAX_CATCH_UP_TICKS = 10;
/** Falling back means skipping ticks, which the player feels as a hitch, so do it in small steps */
const MAX_FALL_BACK_TICKS = 2;
/** Stop predicting when the server has been silent this long, rather than drifting further */
const MAX_PREDICTION_TICKS = 60;

/**
 * A player's side of a duel. It keeps the last state the server confirmed, and
 * predicts ahead of it by replaying the local player's unconfirmed inputs while
 * assuming the opponent keeps doing what they were last seen doing.
 */
export class PredictionClient {
    public readonly slot: number;

    private decks: CombatDeck[];
    private confirmedWorld: WorldState;
    private lastConfirmedInputs: InputFrame[];
    private localInputs: Map<number, InputFrame> = new Map();
    /** The next tick that needs a local input */
    private predictedTick: number;
    private latestLead: number = TARGET_LEAD_TICKS;
    /** Worst lead reported since the last timing correction; the one that decides whether inputs were late */
    private lowestLead: number = Infinity;
    private adjustmentCooldown: number = 0;

    constructor(start: StartMessage) {
        this.slot = start.slot;
        this.decks = start.decks;
        this.confirmedWorld = worldFromSnapshot(start.snapshot, this.decks);
        this.lastConfirmedInputs = this.confirmedWorld.characters.map(() => EMPTY_INPUT);
        this.predictedTick = this.confirmedWorld.tick + TARGET_LEAD_TICKS;
    }

    public getConfirmedTick(): number {
        return this.confirmedWorld.tick;
    }

    /**
     * How many ticks are currently being predicted beyond what the server confirmed
     */
    public getPredictionDepth(): number {
        return Math.max(0, this.predictedTick - this.confirmedWorld.tick);
    }

    public getLatestLead(): number {
        return this.latestLead;
    }

    /**
     * Apply one tick confirmed by the server
     *
     * @returns false when local state does not match the server's, in which case a snapshot is needed
     */
    public receiveTick(message: TickMessage): boolean {
        // Already covered by a snapshot
        if (message.tick < this.confirmedWorld.tick) return true;
        if (message.tick > this.confirmedWorld.tick) return false;

        stepWorld(this.confirmedWorld, message.inputs);
        this.lastConfirmedInputs = message.inputs;
        this.localInputs.delete(message.tick);
        this.latestLead = message.lead;
        this.lowestLead = Math.min(this.lowestLead, message.lead);

        return hashWorld(this.confirmedWorld) === message.hash;
    }

    public receiveSnapshot(snapshot: WorldSnapshot): void {
        if (snapshot.tick < this.confirmedWorld.tick) return;

        this.confirmedWorld = worldFromSnapshot(snapshot, this.decks);
        for (const tick of this.localInputs.keys()) {
            if (tick < snapshot.tick) this.localInputs.delete(tick);
        }
    }

    /**
     * How many ticks to run this frame on top of real time: +n to get further
     * ahead of the server because inputs are arriving late, -n to fall back
     * because they are arriving needlessly early.
     */
    public consumeTickAdjustment(): number {
        if (this.adjustmentCooldown > 0 || this.lowestLead === Infinity) return 0;

        // Judge by the worst moment, not the latest: at low frame rates inputs
        // leave in bursts, and the lead sags between them
        let adjustment = 0;
        if (this.lowestLead < MIN_LEAD_TICKS) {
            adjustment = Math.min(MAX_CATCH_UP_TICKS, TARGET_LEAD_TICKS - this.lowestLead);
        } else if (this.lowestLead > MAX_LEAD_TICKS) {
            adjustment = -Math.min(MAX_FALL_BACK_TICKS, this.lowestLead - TARGET_LEAD_TICKS);
        }

        this.lowestLead = Infinity;
        this.adjustmentCooldown = ADJUSTMENT_COOLDOWN_TICKS;

        return adjustment;
    }

    /**
     * Take local input for the next ticks
     *
     * @returns the message to send to the server, or null when no tick was run
     */
    public advance(ticks: number, sampleInput: () => InputFrame): InputMessage | null {
        this.adjustmentCooldown = Math.max(0, this.adjustmentCooldown - Math.max(1, ticks));

        // After a long pause (a hidden tab, say) the server is far ahead: skip forward instead of replaying
        if (this.predictedTick < this.confirmedWorld.tick) {
            this.predictedTick = this.confirmedWorld.tick + TARGET_LEAD_TICKS;
        }

        const frames: InputFrame[] = [];
        for (let i = 0; i < ticks; i++) {
            if (this.getPredictionDepth() >= MAX_PREDICTION_TICKS) break;

            const frame = sampleInput();
            this.localInputs.set(this.predictedTick, frame);
            this.predictedTick++;
            frames.push(frame);
        }

        return frames.length > 0 ? { tick: this.predictedTick - 1, frames } : null;
    }

    /**
     * Predict from the confirmed state up to the present
     *
     * @returns the predicted world and the one a tick earlier, for render interpolation
     */
    public predict(): { previous: WorldState; current: WorldState } {
        const current = cloneWorld(this.confirmedWorld);
        let previous = current;
        let localInput = this.lastConfirmedInputs[this.slot];

        while (current.tick < this.predictedTick) {
            localInput = this.localInputs.get(current.tick) ?? localInput;
            const inputs = this.lastConfirmedInputs.map((input, slot) => slot === this.slot ? localInput : input);

            if (current.tick === this.predictedTick - 1) {
                previous = cloneWorld(current);
            }
            stepWorld(current, inputs);
        }

        return { previous, current };
    }
}
