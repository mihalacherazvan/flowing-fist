import { describe, expect, it } from 'vitest';
import { updateRatings } from './elo';

describe('updateRatings', () => {
    it('moves equal players by half the maximum, and not at all for a draw', () => {
        expect(updateRatings(1000, 1000, 1)).toEqual([1016, 984]);
        expect(updateRatings(1000, 1000, 0)).toEqual([984, 1016]);
        expect(updateRatings(1000, 1000, 0.5)).toEqual([1000, 1000]);
    });

    it('rewards beating a stronger player more than beating a weaker one', () => {
        const [underdog] = updateRatings(1000, 1400, 1);
        const [favourite] = updateRatings(1400, 1000, 1);

        expect(underdog - 1000).toBeGreaterThan(25);
        expect(favourite - 1400).toBeLessThan(5);
    });

    it('takes from one player exactly what it gives the other', () => {
        const [first, second] = updateRatings(1234, 987, 0.5);

        expect(first + second).toBe(1234 + 987);
        expect(first).toBeLessThan(1234);
    });
});
