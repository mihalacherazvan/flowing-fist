// Speeds are in units per second, durations in ticks.
// Combat values are placeholders to be tuned once real animations exist.
export const WALK_SPEED = 6;
export const RUN_SPEED = 12;
export const GUARD_MOVE_SPEED = 3;
export const DODGE_SPEED = 12;
export const DODGE_TICKS = 30;
export const DODGE_COOLDOWN_TICKS = 60;
/** Attacks pass through a dodging character for this many ticks from the start of the dodge */
export const DODGE_INVULNERABLE_TICKS = 12;
export const DODGE_STAMINA_COST = 15;
export const CHARACTER_RADIUS = 0.5;

export const MAX_HEALTH = 100;
export const MAX_STAMINA = 100;
export const STAMINA_REGEN_PER_TICK = 0.5;
/** Ticks after spending stamina before it starts to come back */
export const STAMINA_REGEN_DELAY_TICKS = 45;
export const GUARD_BREAK_STUN_TICKS = 60;
export const HIT_PUSHBACK = 0.3;
export const BLOCK_PUSHBACK = 0.15;
/** Training rule: a knocked-out character gets back up at full health after this long */
export const KNOCKOUT_TICKS = 120;
