import { TAU } from './math';

export const Button = {
    Run: 1 << 0,
    Dodge: 1 << 1,
    LockOn: 1 << 2,
    Attack: 1 << 3,
    Alternate: 1 << 4,
    Guard: 1 << 5
} as const;

const MOVE_AXIS_MAX = 127;
const YAW_STEPS = 65536;

/**
 * One tick of player input. Every field is an integer so it can be sent
 * over the network and replayed exactly.
 */
export interface InputFrame {
    /** Bitmask of Button values */
    buttons: number;
    /** Right (+) / left (-), -127 to 127 */
    moveX: number;
    /** Forward (+) / backward (-), -127 to 127 */
    moveY: number;
    /** Camera yaw the movement is relative to, 0 to 65535 for a full turn */
    yaw: number;
}

export const EMPTY_INPUT: Readonly<InputFrame> = { buttons: 0, moveX: 0, moveY: 0, yaw: 0 };

/**
 * Quantise raw input into an InputFrame
 *
 * @param moveRight -1 to 1
 * @param moveForward -1 to 1
 * @param cameraYaw radians, 0 looks along +Z and positive turns towards +X
 */
export function encodeInput(buttons: number, moveRight: number, moveForward: number, cameraYaw: number): InputFrame {
    const turns = cameraYaw / TAU;

    return {
        buttons,
        moveX: quantiseAxis(moveRight),
        moveY: quantiseAxis(moveForward),
        yaw: Math.round((turns - Math.floor(turns)) * YAW_STEPS) % YAW_STEPS
    };
}

export function inputYawToRadians(yaw: number): number {
    return yaw * (TAU / YAW_STEPS);
}

export function inputAxisToUnit(axis: number): number {
    return axis / MOVE_AXIS_MAX;
}

function quantiseAxis(value: number): number {
    return Math.round(Math.max(-1, Math.min(1, value)) * MOVE_AXIS_MAX);
}
