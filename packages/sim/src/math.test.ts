import { describe, expect, it } from 'vitest';
import { PI, atan2, cos, sin, wrapAngle } from './math';

describe('deterministic math', () => {
    it('matches Math.sin and Math.cos across several turns', () => {
        for (let angle = -20; angle <= 20; angle += 0.0137) {
            expect(Math.abs(sin(angle) - Math.sin(angle))).toBeLessThan(1e-8);
            expect(Math.abs(cos(angle) - Math.cos(angle))).toBeLessThan(1e-8);
        }
    });

    it('matches Math.atan2 in every quadrant', () => {
        for (let angle = -PI + 0.001; angle < PI; angle += 0.0091) {
            const x = Math.cos(angle) * 3;
            const y = Math.sin(angle) * 3;
            expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-4);
        }
    });

    it('handles atan2 on the axes and at the origin', () => {
        expect(atan2(0, 0)).toBe(0);
        expect(atan2(0, 1)).toBe(0);
        expect(atan2(1, 0)).toBeCloseTo(PI / 2, 4);
        expect(atan2(-1, 0)).toBeCloseTo(-PI / 2, 4);
        expect(atan2(0, -1)).toBeCloseTo(PI, 4);
    });

    it('wraps angles into [-PI, PI)', () => {
        expect(wrapAngle(0)).toBe(0);
        expect(wrapAngle(PI)).toBeCloseTo(-PI);
        expect(wrapAngle(3 * PI + 0.5)).toBeCloseTo(-PI + 0.5);
        expect(wrapAngle(-PI - 0.5)).toBeCloseTo(PI - 0.5);
    });
});
