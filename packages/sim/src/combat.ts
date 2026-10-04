import { MOVE_LIST, STANCES } from '@flowing-fist/content';
import type { Hitbox, MoveDefinition } from '@flowing-fist/content';
import { cos, sin } from './math';
import { QueuedAttack, StunKind } from './state';
import type { CharacterState, CompiledDeck, WorldState } from './state';
import {
    BLOCK_PUSHBACK,
    CHARACTER_RADIUS,
    DODGE_INVULNERABLE_TICKS,
    DODGE_TICKS,
    GUARD_BREAK_STUN_TICKS,
    HIT_PUSHBACK,
    KNOCKOUT_TICKS,
    STAMINA_REGEN_DELAY_TICKS
} from './tuning';

export type MovePhase = 'startup' | 'active' | 'recovery';

export function getCurrentMove(character: CharacterState): MoveDefinition | null {
    return character.moveIndex >= 0 ? MOVE_LIST[character.moveIndex] : null;
}

/**
 * Which part of its attack the character just played, or null when not attacking
 */
export function getMovePhase(character: CharacterState): MovePhase | null {
    const move = getCurrentMove(character);
    if (!move) return null;

    // moveTick counts ticks already played, so the latest one is moveTick - 1
    const playedTick = Math.max(0, character.moveTick - 1);
    if (playedTick < move.startupTicks) return 'startup';
    if (playedTick < move.startupTicks + move.activeTicks) return 'active';

    return 'recovery';
}

/**
 * Ground position of one of the character's hitboxes
 */
export function getHitboxPosition(character: CharacterState, hitbox: Hitbox): { x: number; z: number } {
    const facingSin = sin(character.yaw);
    const facingCos = cos(character.yaw);

    return {
        x: character.x + hitbox.right * facingCos + hitbox.forward * facingSin,
        z: character.z - hitbox.right * facingSin + hitbox.forward * facingCos
    };
}

export function spendStamina(character: CharacterState, amount: number): void {
    character.stamina = Math.max(0, character.stamina - amount);
    character.staminaRegenDelayTicks = STAMINA_REGEN_DELAY_TICKS;
}

export function resetChain(character: CharacterState): void {
    character.moveIndex = -1;
    character.moveTick = 0;
    character.moveHasHit = false;
    character.queuedAttack = QueuedAttack.None;
    character.chainStance = -1;
    character.chainIndex = 0;
}

/**
 * Begin the attack the deck gives for the character's current stance
 *
 * @param requested a QueuedAttack value, Sequence or Alternate
 * @param isChaining true when following straight on from another attack
 * @returns false when there is no such attack or not enough stamina
 */
export function startAttack(
    character: CharacterState,
    deck: CompiledDeck,
    requested: number,
    isChaining: boolean
): boolean {
    let moveIndex = -1;
    let chainStance = -1;
    let chainIndex = 0;

    if (requested === QueuedAttack.Alternate) {
        moveIndex = deck.alternates[character.stance];
    } else {
        const isMidSequence = isChaining
            && character.chainStance >= 0
            && character.chainIndex < deck.sequences[character.chainStance].length;

        if (isMidSequence) {
            chainStance = character.chainStance;
            chainIndex = character.chainIndex;
        } else {
            // Start the sequence that belongs to the stance we are standing in
            chainStance = character.stance;
        }

        const sequence = deck.sequences[chainStance];
        moveIndex = chainIndex < sequence.length ? sequence[chainIndex] : -1;
        chainIndex++;
    }

    if (moveIndex < 0) return false;

    const move = MOVE_LIST[moveIndex];
    if (character.stamina < move.staminaCost) return false;

    spendStamina(character, move.staminaCost);
    character.moveIndex = moveIndex;
    character.moveTick = 0;
    character.moveHasHit = false;
    character.queuedAttack = QueuedAttack.None;
    character.chainStance = chainStance;
    character.chainIndex = chainIndex;
    character.guarding = false;

    return true;
}

/**
 * Called when an attack has played all its ticks: take its end stance, then
 * either chain into the queued attack or return to neutral
 */
export function finishMove(character: CharacterState, deck: CompiledDeck): void {
    const move = MOVE_LIST[character.moveIndex];
    character.stance = STANCES.indexOf(move.endStance);

    const queued = character.queuedAttack;
    if (queued === QueuedAttack.None || !startAttack(character, deck, queued, true)) {
        resetChain(character);
    }
}

/**
 * Find every attack that connects this tick, then apply them all together so
 * that two characters hitting each other on the same tick both take the hit
 */
export function resolveHits(world: WorldState): void {
    const hits: { attacker: CharacterState; defender: CharacterState; move: MoveDefinition }[] = [];

    for (const attacker of world.characters) {
        const move = getCurrentMove(attacker);
        if (!move || attacker.moveHasHit || attacker.moveTick === 0 || getMovePhase(attacker) !== 'active') continue;

        for (const defender of world.characters) {
            if (defender === attacker || !canBeHit(defender)) continue;

            if (move.hitboxes.some((hitbox) => hitboxTouches(attacker, hitbox, defender))) {
                hits.push({ attacker, defender, move });
            }
        }
    }

    for (const hit of hits) {
        hit.attacker.moveHasHit = true;
        applyHit(hit.attacker, hit.defender, hit.move);
    }
}

function canBeHit(defender: CharacterState): boolean {
    if (defender.knockoutTicks > 0) return false;

    const isDodgeInvulnerable = defender.dodgeTicks > DODGE_TICKS - DODGE_INVULNERABLE_TICKS;

    return !isDodgeInvulnerable;
}

function hitboxTouches(attacker: CharacterState, hitbox: Hitbox, defender: CharacterState): boolean {
    // Characters are upright cylinders, so only the ground-plane distance matters for now
    const position = getHitboxPosition(attacker, hitbox);
    const offsetX = defender.x - position.x;
    const offsetZ = defender.z - position.z;
    const reach = hitbox.radius + CHARACTER_RADIUS;

    return offsetX * offsetX + offsetZ * offsetZ <= reach * reach;
}

function applyHit(attacker: CharacterState, defender: CharacterState, move: MoveDefinition): void {
    // A guard only covers attacks coming from the front half
    const toAttackerX = attacker.x - defender.x;
    const toAttackerZ = attacker.z - defender.z;
    const isFromFront = toAttackerX * sin(defender.yaw) + toAttackerZ * cos(defender.yaw) > 0;
    const isGuarded = defender.guarding && isFromFront;

    if (isGuarded && move.guardBreak) {
        breakGuard(defender);
    } else if (isGuarded) {
        spendStamina(defender, move.guardDamage);
        if (defender.stamina === 0) {
            breakGuard(defender);
        } else {
            defender.stunKind = StunKind.Block;
            defender.stunTicks = move.blockStunTicks;
        }
        pushAway(attacker, defender, BLOCK_PUSHBACK);
    } else {
        defender.health = Math.max(0, defender.health - move.damage);
        defender.guarding = false;
        defender.dodgeTicks = 0;
        resetChain(defender);
        pushAway(attacker, defender, HIT_PUSHBACK);

        if (defender.health === 0) {
            defender.knockoutTicks = KNOCKOUT_TICKS;
            defender.stunKind = StunKind.None;
            defender.stunTicks = 0;
        } else {
            defender.stunKind = StunKind.Hit;
            defender.stunTicks = move.hitStunTicks;
        }
    }
}

function breakGuard(defender: CharacterState): void {
    spendStamina(defender, defender.stamina);
    defender.guarding = false;
    defender.stunKind = StunKind.GuardBroken;
    defender.stunTicks = GUARD_BREAK_STUN_TICKS;
}

function pushAway(attacker: CharacterState, defender: CharacterState, distance: number): void {
    defender.x += sin(attacker.yaw) * distance;
    defender.z += cos(attacker.yaw) * distance;
}
