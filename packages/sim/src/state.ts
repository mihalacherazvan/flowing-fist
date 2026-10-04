import { STANCES, getMoveIndex } from '@flowing-fist/content';
import type { CombatDeck } from '@flowing-fist/content';
import { MAX_HEALTH, MAX_STAMINA } from './tuning';

export const StunKind = {
    None: 0,
    Hit: 1,
    Block: 2,
    GuardBroken: 3
} as const;

export const QueuedAttack = {
    None: 0,
    Sequence: 1,
    Alternate: 2
} as const;

/**
 * Everything the simulation knows about one character. Plain numbers and
 * booleans only, so the world can be cloned for rollback and hashed for
 * desync detection.
 */
export interface CharacterState {
    x: number;
    z: number;
    /** Facing in radians, 0 looks along +Z and positive turns towards +X */
    yaw: number;
    /** Movement direction relative to facing, each -1 to 1 (for animation) */
    moveRight: number;
    moveForward: number;
    running: boolean;
    /** Ticks left in the current dodge, 0 when not dodging */
    dodgeTicks: number;
    dodgeCooldownTicks: number;
    dodgeDirectionX: number;
    dodgeDirectionZ: number;
    lockedOn: boolean;
    previousButtons: number;

    health: number;
    stamina: number;
    staminaRegenDelayTicks: number;
    /** Index into STANCES */
    stance: number;
    guarding: boolean;
    /** Index into MOVE_LIST of the attack in progress, -1 when not attacking */
    moveIndex: number;
    /** Ticks of the current attack already played */
    moveTick: number;
    moveHasHit: boolean;
    /** Attack pressed during the current one, a QueuedAttack value */
    queuedAttack: number;
    /** Stance whose sequence is being played, -1 when no chain is running */
    chainStance: number;
    /** Position of the next attack in that sequence */
    chainIndex: number;
    stunTicks: number;
    /** A StunKind value */
    stunKind: number;
    /** Ticks left knocked out, 0 when standing */
    knockoutTicks: number;
}

/**
 * A CombatDeck with move ids resolved to MOVE_LIST indexes, indexed by stance
 */
export interface CompiledDeck {
    sequences: number[][];
    /** -1 where the stance has no alternate attack */
    alternates: number[];
}

export interface WorldState {
    tick: number;
    arenaRadius: number;
    characters: CharacterState[];
    /** decks[i] belongs to characters[i]. Fixed for the whole fight. */
    decks: readonly CompiledDeck[];
}

export function createCharacter(x: number, z: number, yaw: number): CharacterState {
    return {
        x,
        z,
        yaw,
        moveRight: 0,
        moveForward: 0,
        running: false,
        dodgeTicks: 0,
        dodgeCooldownTicks: 0,
        dodgeDirectionX: 0,
        dodgeDirectionZ: 0,
        lockedOn: false,
        previousButtons: 0,
        health: MAX_HEALTH,
        stamina: MAX_STAMINA,
        staminaRegenDelayTicks: 0,
        stance: 0,
        guarding: false,
        moveIndex: -1,
        moveTick: 0,
        moveHasHit: false,
        queuedAttack: QueuedAttack.None,
        chainStance: -1,
        chainIndex: 0,
        stunTicks: 0,
        stunKind: StunKind.None,
        knockoutTicks: 0
    };
}

/**
 * Resolve a deck's move ids. The deck is expected to have passed validateDeck.
 */
export function compileDeck(deck: CombatDeck): CompiledDeck {
    return {
        sequences: STANCES.map((stance) => deck.sequences[stance].map(getMoveIndex)),
        alternates: STANCES.map((stance) => {
            const alternate = deck.alternates[stance];
            return alternate === null ? -1 : getMoveIndex(alternate);
        })
    };
}

export function createWorld(arenaRadius: number, characters: CharacterState[], decks: CombatDeck[]): WorldState {
    return { tick: 0, arenaRadius, characters, decks: decks.map(compileDeck) };
}

export function cloneWorld(world: WorldState): WorldState {
    return {
        tick: world.tick,
        arenaRadius: world.arenaRadius,
        characters: world.characters.map((character) => ({ ...character })),
        decks: world.decks
    };
}

// Taken from a real character so a newly added field can never be left out of the hash
const CHARACTER_FIELDS = Object.keys(createCharacter(0, 0, 0)) as (keyof CharacterState)[];

/**
 * 32-bit FNV-1a hash of everything in the world that changes during a fight
 */
export function hashWorld(world: WorldState): number {
    const values = new Float64Array(2 + world.characters.length * CHARACTER_FIELDS.length);
    let index = 0;

    values[index++] = world.tick;
    values[index++] = world.arenaRadius;

    for (const character of world.characters) {
        for (const field of CHARACTER_FIELDS) {
            values[index++] = Number(character[field]);
        }
    }

    const bytes = new Uint8Array(values.buffer);
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        hash = Math.imul(hash ^ bytes[i], 0x01000193);
    }

    return hash >>> 0;
}
