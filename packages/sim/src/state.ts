/**
 * Everything the simulation knows about one character. Plain data only, so the
 * world can be cloned for rollback and hashed for desync detection.
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
}

export interface WorldState {
    tick: number;
    arenaRadius: number;
    characters: CharacterState[];
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
        previousButtons: 0
    };
}

export function createWorld(arenaRadius: number, characters: CharacterState[]): WorldState {
    return { tick: 0, arenaRadius, characters };
}

export function cloneWorld(world: WorldState): WorldState {
    return {
        tick: world.tick,
        arenaRadius: world.arenaRadius,
        characters: world.characters.map((character) => ({ ...character }))
    };
}

const FIELDS_PER_CHARACTER = 12;

/**
 * 32-bit FNV-1a hash of the full world state
 */
export function hashWorld(world: WorldState): number {
    const values = new Float64Array(2 + world.characters.length * FIELDS_PER_CHARACTER);
    let index = 0;

    values[index++] = world.tick;
    values[index++] = world.arenaRadius;

    for (const character of world.characters) {
        values[index++] = character.x;
        values[index++] = character.z;
        values[index++] = character.yaw;
        values[index++] = character.moveRight;
        values[index++] = character.moveForward;
        values[index++] = character.running ? 1 : 0;
        values[index++] = character.dodgeTicks;
        values[index++] = character.dodgeCooldownTicks;
        values[index++] = character.dodgeDirectionX;
        values[index++] = character.dodgeDirectionZ;
        values[index++] = character.lockedOn ? 1 : 0;
        values[index++] = character.previousButtons;
    }

    const bytes = new Uint8Array(values.buffer);
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        hash = Math.imul(hash ^ bytes[i], 0x01000193);
    }

    return hash >>> 0;
}
