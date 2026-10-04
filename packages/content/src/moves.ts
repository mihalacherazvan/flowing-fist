import type { Stance } from './stances';

/**
 * Sphere that deals the hit, positioned relative to the attacker
 */
export interface Hitbox {
    right: number;
    up: number;
    forward: number;
    radius: number;
}

export type AttackHeight = 'high' | 'mid' | 'low';

export interface MoveDefinition {
    id: string;
    name: string;
    startStance: Stance;
    endStance: Stance;
    /** Ticks before the attack can hit */
    startupTicks: number;
    /** Ticks during which the hitboxes are live */
    activeTicks: number;
    /** Ticks after the hitboxes switch off before the character can act */
    recoveryTicks: number;
    damage: number;
    staminaCost: number;
    /** Stamina taken from a defender who blocks */
    guardDamage: number;
    hitStunTicks: number;
    blockStunTicks: number;
    height: AttackHeight;
    /** Breaks a guard outright instead of being blocked */
    guardBreak: boolean;
    /** Distance stepped forward over startup and active ticks */
    advance: number;
    hitboxes: Hitbox[];
}

// All timings, damage and hitboxes below are placeholders until real attack
// animations exist to author them against. Distances assume the character
// model as drawn by the client, about 2.7 units tall.
const MOVE_DEFINITIONS: MoveDefinition[] = [
    {
        id: 'jab',
        name: 'Jab',
        startStance: 'front-right',
        endStance: 'front-left',
        startupTicks: 8,
        activeTicks: 3,
        recoveryTicks: 14,
        damage: 6,
        staminaCost: 8,
        guardDamage: 8,
        hitStunTicks: 18,
        blockStunTicks: 10,
        height: 'high',
        guardBreak: false,
        advance: 0.6,
        hitboxes: [{ right: 0.225, up: 2.1, forward: 1.35, radius: 0.45 }]
    },
    {
        id: 'hook',
        name: 'Hook',
        startStance: 'front-right',
        endStance: 'back-right',
        startupTicks: 14,
        activeTicks: 4,
        recoveryTicks: 20,
        damage: 11,
        staminaCost: 13,
        guardDamage: 14,
        hitStunTicks: 24,
        blockStunTicks: 14,
        height: 'high',
        guardBreak: false,
        advance: 0.75,
        hitboxes: [{ right: -0.3, up: 2.1, forward: 1.2, radius: 0.6 }]
    },
    {
        id: 'elbow',
        name: 'Breaking Elbow',
        startStance: 'front-right',
        endStance: 'front-right',
        startupTicks: 22,
        activeTicks: 4,
        recoveryTicks: 26,
        damage: 10,
        staminaCost: 16,
        guardDamage: 0,
        hitStunTicks: 26,
        blockStunTicks: 0,
        height: 'mid',
        guardBreak: true,
        advance: 0.9,
        hitboxes: [{ right: 0.15, up: 1.8, forward: 0.9, radius: 0.525 }]
    },
    {
        id: 'cross',
        name: 'Cross',
        startStance: 'front-left',
        endStance: 'front-right',
        startupTicks: 10,
        activeTicks: 3,
        recoveryTicks: 16,
        damage: 8,
        staminaCost: 10,
        guardDamage: 10,
        hitStunTicks: 20,
        blockStunTicks: 12,
        height: 'high',
        guardBreak: false,
        advance: 0.75,
        hitboxes: [{ right: -0.225, up: 2.1, forward: 1.5, radius: 0.45 }]
    },
    {
        id: 'low-kick',
        name: 'Low Kick',
        startStance: 'front-left',
        endStance: 'back-left',
        startupTicks: 13,
        activeTicks: 4,
        recoveryTicks: 18,
        damage: 9,
        staminaCost: 11,
        guardDamage: 10,
        hitStunTicks: 20,
        blockStunTicks: 12,
        height: 'low',
        guardBreak: false,
        advance: 0.6,
        hitboxes: [{ right: 0.3, up: 0.6, forward: 1.65, radius: 0.525 }]
    },
    {
        id: 'uppercut',
        name: 'Uppercut',
        startStance: 'front-left',
        endStance: 'back-left',
        startupTicks: 15,
        activeTicks: 4,
        recoveryTicks: 22,
        damage: 12,
        staminaCost: 14,
        guardDamage: 14,
        hitStunTicks: 26,
        blockStunTicks: 14,
        height: 'mid',
        guardBreak: false,
        advance: 0.75,
        hitboxes: [{ right: 0, up: 1.8, forward: 1.2, radius: 0.525 }]
    },
    {
        id: 'back-fist',
        name: 'Back Fist',
        startStance: 'back-right',
        endStance: 'back-left',
        startupTicks: 11,
        activeTicks: 3,
        recoveryTicks: 16,
        damage: 8,
        staminaCost: 10,
        guardDamage: 10,
        hitStunTicks: 20,
        blockStunTicks: 12,
        height: 'high',
        guardBreak: false,
        advance: 0.75,
        hitboxes: [{ right: 0.375, up: 2.1, forward: 1.35, radius: 0.525 }]
    },
    {
        id: 'roundhouse',
        name: 'Roundhouse',
        startStance: 'back-right',
        endStance: 'front-left',
        startupTicks: 18,
        activeTicks: 5,
        recoveryTicks: 24,
        damage: 14,
        staminaCost: 16,
        guardDamage: 18,
        hitStunTicks: 28,
        blockStunTicks: 16,
        height: 'high',
        guardBreak: false,
        advance: 0.9,
        hitboxes: [
            { right: 0.6, up: 1.95, forward: 1.5, radius: 0.6 },
            { right: -0.3, up: 1.95, forward: 1.8, radius: 0.6 }
        ]
    },
    {
        id: 'push-kick',
        name: 'Push Kick',
        startStance: 'back-right',
        endStance: 'front-right',
        startupTicks: 14,
        activeTicks: 4,
        recoveryTicks: 20,
        damage: 9,
        staminaCost: 12,
        guardDamage: 14,
        hitStunTicks: 22,
        blockStunTicks: 14,
        height: 'mid',
        guardBreak: false,
        advance: 1.5,
        hitboxes: [{ right: 0, up: 1.5, forward: 1.8, radius: 0.525 }]
    },
    {
        id: 'side-kick',
        name: 'Side Kick',
        startStance: 'back-left',
        endStance: 'front-right',
        startupTicks: 16,
        activeTicks: 4,
        recoveryTicks: 22,
        damage: 13,
        staminaCost: 15,
        guardDamage: 16,
        hitStunTicks: 26,
        blockStunTicks: 15,
        height: 'mid',
        guardBreak: false,
        advance: 1.35,
        hitboxes: [{ right: 0, up: 1.65, forward: 1.95, radius: 0.525 }]
    },
    {
        id: 'spin-kick',
        name: 'Spin Kick',
        startStance: 'back-left',
        endStance: 'back-right',
        startupTicks: 20,
        activeTicks: 5,
        recoveryTicks: 26,
        damage: 16,
        staminaCost: 18,
        guardDamage: 20,
        hitStunTicks: 30,
        blockStunTicks: 18,
        height: 'high',
        guardBreak: false,
        advance: 1.05,
        hitboxes: [
            { right: -0.6, up: 1.95, forward: 1.5, radius: 0.6 },
            { right: 0.3, up: 1.95, forward: 1.8, radius: 0.6 }
        ]
    },
    {
        id: 'sweep',
        name: 'Sweep',
        startStance: 'back-left',
        endStance: 'front-left',
        startupTicks: 17,
        activeTicks: 5,
        recoveryTicks: 24,
        damage: 10,
        staminaCost: 13,
        guardDamage: 12,
        hitStunTicks: 28,
        blockStunTicks: 14,
        height: 'low',
        guardBreak: false,
        advance: 0.75,
        hitboxes: [
            { right: 0.6, up: 0.45, forward: 1.35, radius: 0.6 },
            { right: -0.45, up: 0.45, forward: 1.65, radius: 0.6 }
        ]
    }
];

/**
 * Every move in a fixed order. The simulation refers to moves by their index here.
 */
export const MOVE_LIST: readonly MoveDefinition[] = MOVE_DEFINITIONS;

const MOVE_INDEX_BY_ID = new Map(MOVE_LIST.map((move, index) => [move.id, index]));

export function getMoveIndex(moveId: string): number {
    return MOVE_INDEX_BY_ID.get(moveId) ?? -1;
}

export function getMove(moveId: string): MoveDefinition | undefined {
    return MOVE_LIST[getMoveIndex(moveId)];
}
