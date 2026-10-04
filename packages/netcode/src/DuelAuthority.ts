import { TRAINING_ARENA } from '@flowing-fist/content';
import type { CombatDeck } from '@flowing-fist/content';
import type { InputMessage, TickMessage, WorldSnapshot } from '@flowing-fist/protocol';
import { EMPTY_INPUT, PI, createCharacter, createWorld, hashWorld, sanitiseInput, stepWorld } from '@flowing-fist/sim';
import type { InputFrame, WorldState } from '@flowing-fist/sim';
import { takeSnapshot } from './snapshot';

// Inputs further from the current tick than this are refused, so a client cannot fill the server's memory
const MAX_INPUT_LEAD_TICKS = 120;
const MAX_INPUT_LATENESS_TICKS = 120;
const START_DISTANCE = 6;

/**
 * The server's side of a duel: the one true simulation. It collects each
 * player's input, steps the world, and reports what it used.
 */
export class DuelAuthority {
    private world: WorldState;
    private pendingInputs: Map<number, InputFrame>[];
    private lastInputs: InputFrame[];
    private newestInputTicks: number[];
    private connected: boolean[];

    constructor(decks: CombatDeck[]) {
        this.world = createWorld(TRAINING_ARENA.radius, [
            createCharacter(0, -START_DISTANCE / 2, 0),
            createCharacter(0, START_DISTANCE / 2, PI)
        ], decks);

        this.pendingInputs = this.world.characters.map(() => new Map());
        this.lastInputs = this.world.characters.map(() => EMPTY_INPUT);
        this.newestInputTicks = this.world.characters.map(() => -1);
        this.connected = this.world.characters.map(() => true);
    }

    public getTick(): number {
        return this.world.tick;
    }

    public getSnapshot(): WorldSnapshot {
        return takeSnapshot(this.world);
    }

    /**
     * A disconnected player's character stands still instead of repeating its last input
     */
    public setConnected(slot: number, connected: boolean): void {
        this.connected[slot] = connected;
    }

    /**
     * Store a player's input for the ticks it names. Frames that arrive after
     * their tick was simulated are kept and applied on the next one instead.
     */
    public receiveInput(slot: number, message: InputMessage): void {
        if (!Number.isInteger(message?.tick) || !Array.isArray(message.frames)) return;

        const firstTick = message.tick - message.frames.length + 1;

        message.frames.forEach((frame, index) => {
            const tick = firstTick + index;
            const isInRange = tick >= this.world.tick - MAX_INPUT_LATENESS_TICKS
                && tick <= this.world.tick + MAX_INPUT_LEAD_TICKS;
            if (!isInRange) return;

            this.pendingInputs[slot].set(tick, sanitiseInput(frame));
            this.newestInputTicks[slot] = Math.max(this.newestInputTicks[slot], tick);
        });
    }

    /**
     * Take the input a player's character should use this tick
     */
    private consumeInput(slot: number, tick: number): InputFrame {
        const pending = this.pendingInputs[slot];
        const dueTicks = [...pending.keys()].filter((pendingTick) => pendingTick <= tick).sort((a, b) => a - b);

        if (!this.connected[slot]) {
            dueTicks.forEach((dueTick) => pending.delete(dueTick));
            return EMPTY_INPUT;
        }

        // With nothing received for this tick, assume the player kept doing the same thing
        if (dueTicks.length === 0) return this.lastInputs[slot];

        // Usually exactly one frame is due. When several are (they arrived late),
        // use the newest but keep every button from the others, so that a quick
        // press is delayed rather than lost.
        let input = EMPTY_INPUT;
        let buttons = 0;
        for (const dueTick of dueTicks) {
            input = pending.get(dueTick) ?? input;
            buttons |= input.buttons;
            pending.delete(dueTick);
        }

        return { ...input, buttons };
    }

    /**
     * Simulate one tick
     *
     * @returns the message for each player, by slot
     */
    public step(): TickMessage[] {
        const tick = this.world.tick;

        const inputs = this.pendingInputs.map((_pending, slot) => {
            const input = this.consumeInput(slot, tick);
            this.lastInputs[slot] = input;

            return input;
        });

        stepWorld(this.world, inputs);
        const hash = hashWorld(this.world);

        return this.newestInputTicks.map((newestInputTick) => ({
            tick,
            inputs,
            hash,
            lead: newestInputTick - tick
        }));
    }
}
