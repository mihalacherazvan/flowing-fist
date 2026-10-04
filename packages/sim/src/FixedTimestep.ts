export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/**
 * Converts variable frame time into a whole number of fixed simulation ticks
 */
export class FixedTimestep {
    private accumulatorMs: number = 0;

    constructor(private readonly maxTicksPerAdvance: number = 5) {}

    /**
     * Add elapsed time and return how many ticks the simulation should run
     */
    public advance(elapsedMs: number): number {
        this.accumulatorMs += elapsedMs;

        let ticks = Math.floor(this.accumulatorMs / TICK_MS);
        if (ticks > this.maxTicksPerAdvance) {
            // Drop the backlog after a long stall rather than fast-forwarding through it
            ticks = this.maxTicksPerAdvance;
            this.accumulatorMs = 0;
        } else {
            this.accumulatorMs -= ticks * TICK_MS;
        }

        return ticks;
    }

    /**
     * Fraction of a tick left over, for interpolating rendering between ticks
     */
    public getAlpha(): number {
        return this.accumulatorMs / TICK_MS;
    }
}
