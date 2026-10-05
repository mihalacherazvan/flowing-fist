import { TICK_RATE } from './FixedTimestep';
import { finishMove, getCurrentMove, resetChain, resolveHits, spendStamina, startAttack } from './combat';
import { Button, EMPTY_INPUT, inputAxisToUnit, inputYawToRadians } from './input';
import type { InputFrame } from './input';
import { atan2, cos, sin, wrapAngle } from './math';
import { isFightOn, stepMatch } from './match';
import { QueuedAttack, StunKind } from './state';
import type { CharacterState, WorldState } from './state';
import {
    CHARACTER_RADIUS,
    DODGE_COOLDOWN_TICKS,
    DODGE_SPEED,
    DODGE_STAMINA_COST,
    DODGE_TICKS,
    FEINT_STAMINA_COST,
    GUARD_MOVE_SPEED,
    MAX_HEALTH,
    MAX_STAMINA,
    PARRY_STAMINA_COST,
    PARRY_TICKS,
    RUN_SPEED,
    STAMINA_REGEN_PER_TICK,
    WALK_SPEED
} from './tuning';

/**
 * Advance the world by one tick. inputs[i] drives characters[i];
 * a missing entry is treated as no input.
 */
export function stepWorld(world: WorldState, inputs: readonly InputFrame[]): void {
    const isFighting = isFightOn(world);

    for (let i = 0; i < world.characters.length; i++) {
        const input = inputs[i] ?? EMPTY_INPUT;
        stepCharacter(world, i, isFighting ? input : betweenRounds(input));
    }

    if (isFighting) {
        resolveHits(world);
    }
    separateCharacters(world);

    for (const character of world.characters) {
        keepInsideArena(character, world.arenaRadius);
    }

    stepMatch(world);

    world.tick++;
}

/**
 * Outside the fighting part of a round the characters stand where they are:
 * only the lock-on toggle gets through
 */
function betweenRounds(input: InputFrame): InputFrame {
    return { buttons: input.buttons & Button.LockOn, moveX: 0, moveY: 0, yaw: input.yaw };
}

function stepCharacter(world: WorldState, index: number, input: InputFrame): void {
    const character = world.characters[index];
    const deck = world.decks[index];
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

    const requestedAttack = (pressedButtons & Button.Attack) ? QueuedAttack.Sequence
        : (pressedButtons & Button.Alternate) ? QueuedAttack.Alternate
            : QueuedAttack.None;
    const isGuardHeld = (input.buttons & Button.Guard) !== 0;

    const isIncapacitated = character.knockoutTicks > 0 || character.stunTicks > 0;
    const isAttacking = character.moveIndex >= 0;
    const isParrying = character.parryTicks > 0;

    // Decide what to start this tick. Only a character in neutral can start anything.
    if (!isIncapacitated && !isAttacking && !isParrying) {
        if (character.lockedOn && target) {
            faceTarget(character, target);
        } else if (isMoving) {
            character.yaw = wrapAngle(cameraYaw);
        }

        if (character.dodgeTicks === 0) {
            character.guarding = isGuardHeld && character.stamina > 0;

            const canDodge = isMoving
                && character.dodgeCooldownTicks === 0
                && character.stamina >= DODGE_STAMINA_COST;

            if (requestedAttack !== QueuedAttack.None && startAttack(character, deck, requestedAttack, false)) {
                // startAttack has set the move up
            } else if ((pressedButtons & Button.Parry) && character.stamina >= PARRY_STAMINA_COST) {
                character.parryTicks = PARRY_TICKS;
                character.guarding = false;
                spendStamina(character, PARRY_STAMINA_COST);
            } else if ((pressedButtons & Button.Dodge) && canDodge) {
                const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
                character.dodgeTicks = DODGE_TICKS;
                character.dodgeDirectionX = moveX / moveLength;
                character.dodgeDirectionZ = moveZ / moveLength;
                character.guarding = false;
                spendStamina(character, DODGE_STAMINA_COST);
            }
        }
    }

    // Then play one tick of whatever the character is doing
    let directionX = 0;
    let directionZ = 0;
    let speed = 0;
    // Attacks carry the character forward, but that is not walking as far as animation is concerned
    let isLocomotion = false;
    character.running = false;

    const move = getCurrentMove(character);

    // A feint: pressing guard while an attack is still winding up calls it off
    const isFeinting = move !== null
        && (pressedButtons & Button.Guard) !== 0
        && character.moveTick > 0
        && character.moveTick < move.startupTicks
        && character.stamina >= FEINT_STAMINA_COST;

    if (character.knockoutTicks > 0) {
        // In a match a knocked-out character stays down until the next round
        if (!world.match) {
            character.knockoutTicks--;
            if (character.knockoutTicks === 0) {
                character.health = MAX_HEALTH;
                character.stamina = MAX_STAMINA;
            }
        }
    } else if (character.stunTicks > 0) {
        // Keep blocking through block stun so the rest of a chain is blocked too
        character.guarding = character.stunKind === StunKind.Block && isGuardHeld && character.stamina > 0;

        character.stunTicks--;
        if (character.stunTicks === 0) {
            character.stunKind = StunKind.None;
        }
    } else if (move && isFeinting) {
        // The stance does not change: the attack never finished
        spendStamina(character, FEINT_STAMINA_COST);
        resetChain(character);
    } else if (move) {
        if (requestedAttack !== QueuedAttack.None && character.moveTick > 0) {
            character.queuedAttack = requestedAttack;
        }

        if (character.moveTick < move.startupTicks && character.lockedOn && target) {
            faceTarget(character, target);
        }

        const advanceTicks = move.startupTicks + move.activeTicks;
        if (character.moveTick < advanceTicks) {
            directionX = sin(character.yaw);
            directionZ = cos(character.yaw);
            speed = move.advance / advanceTicks * TICK_RATE;
        }

        character.moveTick++;
        if (character.moveTick >= advanceTicks + move.recoveryTicks) {
            finishMove(character, deck);
        }
    } else if (character.parryTicks > 0) {
        character.parryTicks--;
    } else if (character.dodgeTicks > 0) {
        directionX = character.dodgeDirectionX;
        directionZ = character.dodgeDirectionZ;
        speed = DODGE_SPEED;
        isLocomotion = true;

        character.dodgeTicks--;
        if (character.dodgeTicks === 0) {
            character.dodgeCooldownTicks = DODGE_COOLDOWN_TICKS;
        }
    } else if (isMoving) {
        directionX = moveX;
        directionZ = moveZ;
        isLocomotion = true;

        if (character.guarding) {
            speed = GUARD_MOVE_SPEED;
        } else {
            character.running = (input.buttons & Button.Run) !== 0;
            speed = character.running ? RUN_SPEED : WALK_SPEED;
        }
    }

    regenerateStamina(character);

    character.x += directionX * speed / TICK_RATE;
    character.z += directionZ * speed / TICK_RATE;

    // Express the movement direction relative to facing so the view can pick an animation
    if (isLocomotion) {
        const facingSin = sin(character.yaw);
        const facingCos = cos(character.yaw);
        character.moveRight = directionX * facingCos - directionZ * facingSin;
        character.moveForward = directionX * facingSin + directionZ * facingCos;
    } else {
        character.moveRight = 0;
        character.moveForward = 0;
    }
}

function faceTarget(character: CharacterState, target: CharacterState): void {
    const toTargetX = target.x - character.x;
    const toTargetZ = target.z - character.z;

    if (toTargetX !== 0 || toTargetZ !== 0) {
        character.yaw = atan2(toTargetX, toTargetZ);
    }
}

function regenerateStamina(character: CharacterState): void {
    if (character.staminaRegenDelayTicks > 0) {
        character.staminaRegenDelayTicks--;
        return;
    }

    const isBusy = character.guarding || character.moveIndex >= 0 || character.dodgeTicks > 0 || character.parryTicks > 0;
    if (!isBusy && character.knockoutTicks === 0) {
        character.stamina = Math.min(MAX_STAMINA, character.stamina + STAMINA_REGEN_PER_TICK);
    }
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
