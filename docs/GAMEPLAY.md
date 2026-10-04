# Flowing Fist — Controls and Gameplay

How the game plays **today**. Like [ARCHITECTURE.md](ARCHITECTURE.md), this is updated as the game changes; planned features are in [SPEC.md](SPEC.md).

_Last updated: 2026-10-04, after milestone M3 (online duels)._

> All combat numbers are placeholders. There are no attack animations yet, so an attack shows only as your character sliding forward plus the coloured hitbox overlay (see [Reading the overlay](#reading-the-overlay)).

## Controls

Click the game once to capture the mouse; press Esc to release it. The click that captures the mouse does not attack.

| Action | Keyboard / mouse |
|---|---|
| Move | W A S D |
| Run | Hold Shift |
| Dodge | Space, while holding a direction |
| Look around | Mouse (once captured); wheel zooms |
| Lock on / off | F |
| Attack | Left mouse button or J |
| Alternate attack | Right mouse button or K |
| Guard | Hold Q |
| Show / hide hitbox overlay | H |
| Switch between training and online duel | O |

Training mode only:

| Action | Key |
|---|---|
| Change dummy behaviour (stand → guard → attack) | G |
| Pause / resume | P |
| Advance one tick while paused | . |

Development builds only: the backtick key opens the Babylon.js inspector.

## Moving

- **Walk and run.** Movement is relative to the camera. Running is twice walking speed.
- **Free movement.** When not locked on, your character faces the way the camera looks whenever you move.
- **Lock-on.** Your character always faces the opponent, movement becomes circling and stepping in and out, and the camera swings behind you. Mouse left/right is ignored while locked on.
- **Dodge.** A half-second dash in the direction you were holding when you pressed it; you cannot steer it. It costs 15 stamina, makes you unhittable for its first 0.2 seconds, and cannot be used again for 1 second after it ends.
- You cannot walk through the opponent or leave the arena.

## Health and stamina

Both start at 100.

- **Stamina** is spent by attacks, dodges and blocking. It starts to refill 0.75 seconds after you last spent any, at 30 per second, and does not refill while you are guarding, attacking or dodging.
- An attack needs its full stamina cost to start. If you don't have it, nothing happens.

## Stances and the combat deck

Your character is always in one of four stances: **front-right**, **front-left**, **back-right** or **back-left**. The HUD shows it as four squares seen from above (front on top, left on the left). You start in front-right.

Every attack starts in one stance and ends in another. Your **deck** decides which attacks you have:

- each stance has a **sequence** of up to three attacks, played by pressing Attack repeatedly;
- each stance may have one **alternate** attack, played with the Alternate button.

### How attacks chain

1. Press **Attack** in neutral: you play the first attack of your current stance's sequence.
2. Press **Attack** again *during* that attack: the next attack in the same sequence is queued and starts when the current one has fully finished.
3. When the sequence runs out and you keep pressing, you start the sequence of the stance you are now in.
4. If you stop pressing, the chain is dropped. Your next attack starts from the first attack of whatever stance you ended in.
5. **Alternate** plays the alternate attack of your current stance, from neutral or queued during another attack. It breaks the chain: afterwards you start a fresh sequence from the new stance.

Your stance changes when an attack finishes. If you are hit mid-attack, you stay in the stance you started in.

While attacking you cannot move, dodge or guard. Each attack steps you forward a little; when locked on, you keep turning towards the opponent until the attack's startup ends.

### The default deck

Everyone currently plays this deck.

| Stance | Sequence (Attack) | Alternate |
|---|---|---|
| Front-right | Jab → Cross → Hook | Breaking Elbow |
| Front-left | Low Kick → Side Kick | Uppercut |
| Back-right | Back Fist → Spin Kick → Roundhouse | Push Kick |
| Back-left | Sweep | — |

Mashing Attack from the start therefore goes: Jab, Cross, Hook (now back-right), Back Fist, Spin Kick, Roundhouse (now front-left), Low Kick, Side Kick (now front-right), and round again — stamina permitting.

### Move list

Timings are in ticks; 60 ticks is one second. *Startup* is the wind-up before the attack can hit, *active* is when it can hit, *recovery* is the wait afterwards.

| Move | Stance change | Startup / active / recovery | Damage | Stamina | Stamina taken if blocked |
|---|---|---|---|---|---|
| Jab | front-right → front-left | 8 / 3 / 14 | 6 | 8 | 8 |
| Hook | front-right → back-right | 14 / 4 / 20 | 11 | 13 | 14 |
| Breaking Elbow | front-right → front-right | 22 / 4 / 26 | 10 | 16 | breaks guard |
| Cross | front-left → front-right | 10 / 3 / 16 | 8 | 10 | 10 |
| Low Kick | front-left → back-left | 13 / 4 / 18 | 9 | 11 | 10 |
| Uppercut | front-left → back-left | 15 / 4 / 22 | 12 | 14 | 14 |
| Back Fist | back-right → back-left | 11 / 3 / 16 | 8 | 10 | 10 |
| Roundhouse | back-right → front-left | 18 / 5 / 24 | 14 | 16 | 18 |
| Push Kick | back-right → front-right | 14 / 4 / 20 | 9 | 12 | 14 |
| Side Kick | back-left → front-right | 16 / 4 / 22 | 13 | 15 | 16 |
| Spin Kick | back-left → back-right | 20 / 5 / 26 | 16 | 18 | 20 |
| Sweep | back-left → front-left | 17 / 5 / 24 | 10 | 13 | 12 |

The source of truth is `packages/content/src/moves.ts`.

## Getting hit

- A hit takes health, stuns you briefly, pushes you back, and cancels whatever you were doing — including your own attack or dodge.
- An attack can hit only once.
- If both fighters' attacks connect on the same tick, both are hit.
- Attack height (high, mid, low) is recorded on each move but has no effect yet.

## Guarding

- Hold **Q** in neutral. You move at half walking speed and cannot run.
- A guard only covers attacks from the **front**. Hits from behind land normally.
- Blocking costs stamina instead of health (see the move list), stuns you for a shorter time, and pushes you back slightly. Keep holding guard and the rest of a chain is blocked too.
- **Guard break.** If blocking empties your stamina, or you block a guard-break move (Breaking Elbow), your guard is broken: stamina drops to zero and you are stunned for a full second, open to anything. A guard-break move does no damage to a guard it breaks.
- You cannot guard with zero stamina.

## Knockout

At zero health a fighter is knocked out: down for 2 seconds, unable to act or be hit, then back up with full health and stamina. There are no rounds, score or winner yet.

## Reading the overlay

Press H to toggle it. It shows exactly what the game tests for hits.

**Body cylinder** — the area that can be hit, coloured by state:

| Colour | Meaning |
|---|---|
| Green | Neutral |
| Blue | Guarding |
| Light blue | Just blocked (block stun) |
| White | Just hit (hit stun) |
| Magenta | Guard broken |
| Grey | Dodging |
| Black | Knocked out |

**Spheres** — the hitboxes of the attack in progress:

| Colour | Meaning |
|---|---|
| Yellow | Startup: not dangerous yet |
| Red | Active: touching the opponent's cylinder now is a hit |
| Grey | Recovery: no longer dangerous |

The HUD also names the move and its phase under each fighter's stance, e.g. "Jab (active)".

## Training mode

The game starts here and needs no server. You face a dummy that always turns towards you. Press **G** to cycle its behaviour:

- **stand** — does nothing;
- **guard** — holds guard, so you can practise breaking it;
- **attack** — throws a short sequence every 3 seconds.

**P** pauses; while paused, **.** advances one tick at a time, which is the way to study an attack's timing with the overlay on.

## Online duel

1. Start the server (`pnpm run server`) and the client (`pnpm run client`).
2. Open the game in two tabs or on two machines.
3. Press **O** (or click "Find online duel") in each. The first player waits; the fight starts when the second joins. Fighters start 6 units apart, facing each other.
4. Press **O** again to return to training. That ends the fight for the other player too.

The status line shows the connection state and how many ticks ahead your game is predicting. If your connection drops you have 20 seconds to come back and carry on; your character stands still meanwhile. A drop within the first 5 seconds of a fight cannot be recovered.

To feel how it plays on a poor connection, add `?latency=80` to the page address for 80 ms of artificial delay each way.

## Not in the game yet

Attack animations, rounds and winning, the deck editor, accounts, matchmaking, feints, manual stance changes, parry and other defensive styles, sound and effects, gamepad support.
