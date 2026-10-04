import { Button, encodeInput } from '@flowing-fist/sim';
import type { InputFrame } from '@flowing-fist/sim';

export const DUMMY_MODES = ['stand', 'guard', 'attack'] as const;

export type DummyMode = typeof DUMMY_MODES[number];

// Long enough for a three-attack sequence to finish and stamina to recover
const ATTACK_INTERVAL_TICKS = 180;
// Presses repeat through this part of the interval so the sequence chains
const ATTACK_PRESS_WINDOW_TICKS = 50;
const ATTACK_PRESS_EVERY_TICKS = 6;

/**
 * Produces the training dummy's input, in place of a second player
 */
export class TrainingDummy {
    private mode: DummyMode = 'stand';
    private tick: number = 0;

    public getMode(): DummyMode {
        return this.mode;
    }

    public cycleMode(): void {
        this.mode = DUMMY_MODES[(DUMMY_MODES.indexOf(this.mode) + 1) % DUMMY_MODES.length];
    }

    /**
     * Get the dummy's input for the next simulation tick
     */
    public sampleInputFrame(): InputFrame {
        let buttons = 0;

        // Lock on once at the start so the dummy always faces the player
        if (this.tick === 0) buttons |= Button.LockOn;

        if (this.mode === 'guard') {
            buttons |= Button.Guard;
        } else if (this.mode === 'attack') {
            const intervalTick = this.tick % ATTACK_INTERVAL_TICKS;
            if (intervalTick < ATTACK_PRESS_WINDOW_TICKS && intervalTick % ATTACK_PRESS_EVERY_TICKS === 0) {
                buttons |= Button.Attack;
            }
        }

        this.tick++;

        return encodeInput(buttons, 0, 0, 0);
    }
}
