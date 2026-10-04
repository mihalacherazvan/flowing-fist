import { TICK_RATE } from './FixedTimestep';
import { Button, EMPTY_INPUT, inputAxisToUnit, inputYawToRadians } from './input';
import type { InputFrame } from './input';
import { atan2, cos, sin, wrapAngle } from './math';
import type { CharacterState, WorldState } from './state';
import {
    CHARACTER_RADIUS,
    DODGE_COOLDOWN_TICKS,
    DODGE_SPEED,
    DODGE_TICKS,
    RUN_SPEED,
    WALK_SPEED
} from './tuning';

/**
 * Advance the world by one tick. inputs[i] drives characters[i];
 * a missing entry is treated as no input.
 */
export function stepWorld(world: WorldState, inputs: readonly InputFrame[]): void {
    for (let i = 0; i < world.characters.length; i++) {
        stepCharacter(world, i, inputs[i] ?? EMPTY_INPUT);
    }

    separateCharacters(world);

    for (const character of world.characters) {
        keepInsideArena(character, world.arenaRadius);
    }

    world.tick++;
}

function stepCharacter(world: WorldState, index: number, input: InputFrame): void {
    const character = world.characters[index];
    const pressedButtons = input.buttons & ~character.previousButtons;
    character.previousButtons = input.buttons;

    const target = findTarget(world, index);

    if (pressedButtons & Button.LockOn) {
        character.lockedOn = !character.lockedOn;
    }
    if (!target) {
        character.lockedOn = false;
    }

    // Movement input is relative to the camera
    const cameraYaw = inputYawToRadians(input.yaw);
    let inputRight = inputAxisToUnit(input.moveX);
    let inputForward = inputAxisToUnit(input.moveY);
    const inputLength = Math.sqrt(inputRight * inputRight + inputForward * inputForward);
    if (inputLength > 1) {
        inputRight /= inputLength;
        inputForward /= inputLength;
    }
    const isMoving = inputLength > 0;

    const cameraSin = sin(cameraYaw);
    const cameraCos = cos(cameraYaw);
    const moveX = inputRight * cameraCos + inputForward * cameraSin;
    const moveZ = -inputRight * cameraSin + inputForward * cameraCos;

    if (character.dodgeCooldownTicks > 0) {
        character.dodgeCooldownTicks--;
    }

    const canDodge = character.dodgeTicks === 0 && character.dodgeCooldownTicks === 0;
    if ((pressedButtons & Button.Dodge) && isMoving && canDodge) {
        const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
        character.dodgeTicks = DODGE_TICKS;
        character.dodgeDirectionX = moveX / moveLength;
        character.dodgeDirectionZ = moveZ / moveLength;
    }

    if (character.lockedOn && target) {
        const toTargetX = target.x - character.x;
        const toTargetZ = target.z - character.z;
        if (toTargetX !== 0 || toTargetZ !== 0) {
            character.yaw = atan2(toTargetX, toTargetZ);
        }
    } else if (isMoving) {
        character.yaw = wrapAngle(cameraYaw);
    }

    let directionX = 0;
    let directionZ = 0;
    let speed = 0;

    if (character.dodgeTicks > 0) {
        directionX = character.dodgeDirectionX;
        directionZ = character.dodgeDirectionZ;
        speed = DODGE_SPEED;
        character.running = false;

        character.dodgeTicks--;
        if (character.dodgeTicks === 0) {
            character.dodgeCooldownTicks = DODGE_COOLDOWN_TICKS;
        }
    } else if (isMoving) {
        directionX = moveX;
        directionZ = moveZ;
        character.running = (input.buttons & Button.Run) !== 0;
        speed = character.running ? RUN_SPEED : WALK_SPEED;
    } else {
        character.running = false;
    }

    character.x += directionX * speed / TICK_RATE;
    character.z += directionZ * speed / TICK_RATE;

    // Express the movement direction relative to facing so the view can pick an animation
    const facingSin = sin(character.yaw);
    const facingCos = cos(character.yaw);
    character.moveRight = directionX * facingCos - directionZ * facingSin;
    character.moveForward = directionX * facingSin + directionZ * facingCos;
}

/**
 * Duels have exactly one opponent, so the target is simply the other character
 */
function findTarget(world: WorldState, index: number): CharacterState | undefined {
    for (let i = 0; i < world.characters.length; i++) {
        if (i !== index) return world.characters[i];
    }

    return undefined;
}

function separateCharacters(world: WorldState): void {
    const minimumDistance = CHARACTER_RADIUS * 2;

    for (let i = 0; i < world.characters.length; i++) {
        for (let j = i + 1; j < world.characters.length; j++) {
            const a = world.characters[i];
            const b = world.characters[j];

            let offsetX = b.x - a.x;
            let offsetZ = b.z - a.z;
            let distance = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
            if (distance >= minimumDistance) continue;

            if (distance === 0) {
                // Exactly overlapping: pick an arbitrary but fixed direction
                offsetX = 1;
                offsetZ = 0;
                distance = 1;
            }

            const push = (minimumDistance - distance) / 2;
            a.x -= offsetX / distance * push;
            a.z -= offsetZ / distance * push;
            b.x += offsetX / distance * push;
            b.z += offsetZ / distance * push;
        }
    }
}

function keepInsideArena(character: CharacterState, arenaRadius: number): void {
    const maximumDistance = arenaRadius - CHARACTER_RADIUS;
    const distance = Math.sqrt(character.x * character.x + character.z * character.z);

    if (distance > maximumDistance) {
        character.x *= maximumDistance / distance;
        character.z *= maximumDistance / distance;
    }
}
