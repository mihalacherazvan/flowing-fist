/**
 * Interpolate between two angles along the shorter way round
 */
export function lerpAngle(from: number, to: number, amount: number): number {
    const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));

    return from + difference * amount;
}
