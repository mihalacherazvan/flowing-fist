// Speeds are in units per second, durations in ticks.
// Combat values are placeholders to be tuned once real animations exist.
export const WALK_SPEED = 6;
/** Walking while locked on: slow enough for the stepping animation to keep up */
export const LOCKED_ON_WALK_SPEED = 3;
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
/** Extra stamina taken, on top of the attack's own cost, for cancelling it during startup */
export const FEINT_STAMINA_COST = 5;
/** A parry lasts this long in all; the character can do nothing else meanwhile */
export const PARRY_TICKS = 30;
/** Only an attack that lands within this many ticks of the parry starting is turned aside */
export const PARRY_WINDOW_TICKS = 10;
export const PARRY_STAMINA_COST = 10;
/** How long an attacker is left open after being parried */
export const PARRY_STUN_TICKS = 45;
/** Outside a match, a knocked-out character gets back up at full health after this long */
export const KNOCKOUT_TICKS = 120;

// Matches
export const ROUNDS_TO_WIN = 3;
/** Drawn rounds score for nobody, so a match is cut off after this many rounds */
export const MAX_ROUNDS = 9;
export const ROUND_TICKS = 90 * 60;
export const ROUND_COUNTDOWN_TICKS = 180;
/** Pause after a round is decided, before the next one or the end of the match */
export const ROUND_OVER_TICKS = 180;
/** How far apart the fighters stand at the start of a round */
export const MATCH_START_DISTANCE = 6;
