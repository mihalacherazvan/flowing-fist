// Math.sin/cos/atan2 may differ in the last bits between JS engines, which would
// desync client and server. These use only + - * / and Math.sqrt/floor/abs, which
// IEEE 754 defines exactly.

export const PI = 3.141592653589793;
export const TAU = PI * 2;
const HALF_PI = PI / 2;

/**
 * Wrap an angle into [-PI, PI)
 */
export function wrapAngle(angle: number): number {
    return angle - TAU * Math.floor((angle + PI) / TAU);
}

export function sin(angle: number): number {
    let x = wrapAngle(angle);
    if (x > HALF_PI) {
        x = PI - x;
    } else if (x < -HALF_PI) {
        x = -PI - x;
    }

    // Taylor series to x^13, error below 1e-9 on [-PI/2, PI/2]
    const x2 = x * x;
    return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040
        + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}

export function cos(angle: number): number {
    return sin(angle + HALF_PI);
}

/**
 * Same argument order and quadrants as Math.atan2, accurate to about 1e-5 rad
 */
export function atan2(y: number, x: number): number {
    if (x === 0 && y === 0) return 0;

    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const swapped = absY > absX;
    const z = swapped ? absX / absY : absY / absX;

    const z2 = z * z;
    let angle = z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346
        + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.0117212)))));

    if (swapped) angle = HALF_PI - angle;
    if (x < 0) angle = PI - angle;
    if (y < 0) angle = -angle;

    return angle;
}
