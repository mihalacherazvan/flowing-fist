import { describe, expect, it } from 'vitest';
import { FixedTimestep, TICK_MS } from './FixedTimestep';

describe('FixedTimestep', () => {
    it('runs one tick per tick of elapsed time', () => {
        const timestep = new FixedTimestep();

        expect(timestep.advance(TICK_MS)).toBe(1);
        expect(timestep.getAlpha()).toBeCloseTo(0);
    });

    it('carries leftover time into the next advance', () => {
        const timestep = new FixedTimestep();

        expect(timestep.advance(TICK_MS * 0.6)).toBe(0);
        expect(timestep.getAlpha()).toBeCloseTo(0.6);
        expect(timestep.advance(TICK_MS * 0.6)).toBe(1);
        expect(timestep.getAlpha()).toBeCloseTo(0.2);
    });

    it('caps ticks and drops the backlog after a long stall', () => {
        const timestep = new FixedTimestep(5);

        expect(timestep.advance(TICK_MS * 100)).toBe(5);
        expect(timestep.getAlpha()).toBe(0);
    });
});
