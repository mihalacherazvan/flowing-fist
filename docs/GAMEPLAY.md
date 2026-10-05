# Flowing Fist — Controls and Gameplay

How the game plays **today**. Like [ARCHITECTURE.md](ARCHITECTURE.md), this is updated as the game changes; planned features are in [SPEC.md](SPEC.md).

_Last updated: 2026-10-04, after milestone M5 (match flow)._

> All combat numbers are placeholders. There are no attack animations yet, so an attack shows only as your character sliding forward plus the coloured hitbox overlay, and a parry only as a colour in that overlay (see [Reading the overlay](#reading-the-overlay)).

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
| Feint | Press Q while your attack is still winding up |
| Parry | E |
| Show / hide hitbox overlay | H |
| Find a ranked match; cancel a search; leave a finished duel | O |
| Open the menu: online play, account, deck editor | B (Esc closes it) |

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

- **Stamina** is spent by attacks, feints, parries, dodges and blocking. It starts to refill 0.75 seconds after you last spent any, at 30 per second, and does not refill while you are guarding, attacking, parrying or dodging.
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

You play this deck until you build and choose your own (see [Building a deck](#building-a-deck)). The training dummy always plays it.

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

## Building a deck

Press **B** (or click "Play online, decks and account") to open the menu. It needs the server; without it, training carries on with the deck you last used. While the menu is open the game ignores the keyboard.

- The grid has one row per stance: three **Attack** slots for the sequence and one **Alternate** slot.
- A slot only offers the moves that are legal there: they start in the right stance (the row's stance for the first attack and the alternate, otherwise the stance the previous attack ends in) and are not used anywhere else in the deck. To move an attack to another slot, empty its current slot first.
- A later slot unlocks once the one before it is filled. Changing an attack removes the attacks after it that no longer chain.
- Hovering a filled slot shows the move's damage, stamina cost and height.
- **Save** stores the deck on the server, which checks the same rules again. You can keep up to 8 decks.
- **Fight with this deck** makes it your active deck, marked ✓. Your first saved deck becomes active by itself. Training restarts with the new deck at once; an online duel in progress keeps the deck it started with.
- Deleting your active deck puts you back on the default deck until you choose another.

## Accounts

You are given a guest account on your first visit, so decks can be saved straight away. A guest exists only in that browser: clear its storage and the guest and its decks are gone.

- **Create account** gives the guest an email, a password (8 characters or more) and a display name. Your decks stay.
- **Log in** switches to an existing account, on any machine. The guest you were is left behind.
- **Log out** carries on as a new guest.

Your display name is what your opponent sees above your health bar.

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

## Feinting

Press **Q** while your attack is still in its startup (the yellow phase in the overlay) and the attack is called off. It must be a fresh press: holding Q from before the attack does nothing.

- It costs 5 stamina on top of what the attack already cost, and needs those 5 to be available.
- You are back in neutral at once, in the stance you started in, with your chain dropped. Keep Q held and you are guarding from the next tick.
- Once the attack is active (red) it can no longer be called off.

The point is to make the opponent react — guard, parry or dodge — to an attack that never comes.

## Parrying

Press **E** in neutral. A parry lasts half a second (30 ticks) and costs 10 stamina; you cannot move, attack or guard until it is over.

- An attack from the **front** that lands in the parry's first 10 ticks (about 0.17 seconds) is turned aside: you take no damage and no stun, your parry ends on the spot, and the attacker is stunned for 0.75 seconds with their chain dropped. Any attack can be parried, guard-break moves included.
- An attack that lands after those 10 ticks, or from behind, hits you in full.

So a parry beats an attack you read, and loses to a feint: parry a feinted attack and you are stuck in the rest of the parry while the opponent is free.

## Knockout

At zero health a fighter is knocked out. In training they stay down for 2 seconds, unable to act or be hit, then get back up with full health and stamina. In a match the knockout ends the round.

## Matches

Every online duel is a match of rounds.

- **Winning.** The first fighter to win **3 rounds** wins the match.
- **A round** starts with both fighters 6 units apart, facing each other, at full health and stamina, in front-right stance. A 3-second countdown follows, during which nobody can move or act (you can toggle lock-on, and it stays as you left it from round to round). Then the round runs for up to **90 seconds**.
- **Knockout.** A fighter at zero health loses the round. If both go down on the same tick, the round is drawn.
- **Time up.** When the clock runs out, the fighter with more health wins the round. Equal health is a draw.
- **A drawn round** scores for nobody and the match goes on. To keep a match from going on for ever, it stops after 9 rounds; whoever has won more rounds wins, and if that is level the match is a draw.
- After a round is decided there is a 3-second pause before the next one, or before the result.
- **Leaving** a match once it has started — the "Forfeit the match" button, closing the page, or losing your connection for more than 20 seconds — gives the match to your opponent. The O key does nothing during a match, so it cannot be forfeited by a stray key press.

The HUD shows the round clock and round number at the top, a row of three marks under each fighter's bars that fill in as they win rounds, and announcements in the middle of the screen ("Round 2 · 3", "Fight!", "KO · You win the round", "Time up · Round drawn"). When the match ends a dialog shows Victory, Defeat or Draw, the score in rounds, and your rating change.

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
| Bright cyan | Parrying, and an attack landing now would be turned aside |
| Dark teal | Parrying, but too late to turn anything aside |
| Orange | Attack was parried (stunned) |
| Grey | Dodging |
| Black | Knocked out |

**Spheres** — the hitboxes of the attack in progress:

| Colour | Meaning |
|---|---|
| Yellow | Startup: not dangerous yet |
| Red | Active: touching the opponent's cylinder now is a hit |
| Grey | Recovery: no longer dangerous |

The HUD also names the move and its phase under each fighter's stance, e.g. "Jab (active)", and says "Parrying" or "Parried".

## Training mode

The game starts here and needs no server. You face a dummy that always turns towards you. Press **G** to cycle its behaviour:

- **stand** — does nothing;
- **guard** — holds guard, so you can practise breaking it;
- **attack** — throws a short sequence every 3 seconds.

There are no rounds in training. To practise the parry, set the dummy to **attack** and press E just before its attack turns red.

**P** pauses; while paused, **.** advances one tick at a time, which is the way to study an attack's timing with the overlay on.

## Online duels

Start the database (`docker compose up -d`), the server (`pnpm run server`) and the client (`pnpm run client`). Each player fights with their own active deck, and every duel is a [match](#matches).

### Ranked match

Press **O**, or click "Find ranked match" (on the HUD or in the menu). You join a queue, and the game shows how long you have been looking; **O** or Cancel leaves the queue.

- The server pairs players by rating. At first it only accepts an opponent within 100 points of you; the accepted difference grows by 50 points for every second you wait, so with few players online you are still matched within a few seconds.
- Above each health bar you see the fighter's name and rating.
- The result moves both ratings (see below), and "Find another match" on the result dialog queues you again.
- An account can only be in the queue once. Two tabs of the same browser share one account, so to play a ranked match against yourself on one machine, use a private window or a second browser for the other player.

### Private duel

Open the menu (**B**).

- **Create private duel** opens a duel and shows a five-character code (with a Copy button). Give it to your opponent; the match starts as soon as they join.
- **Join private duel**: type the code and press the button. Upper and lower case do not matter.

A private duel plays exactly like a ranked one but does not change anyone's rating. It still appears in your match history.

### Rating

Everyone starts at **1000**. After a ranked match the winner gains what the loser loses: 16 points between equally rated players, more for beating a higher-rated opponent, less for beating a lower-rated one (Elo, with a maximum of 32 per match). A drawn match moves equal players by nothing. A forfeit counts as an ordinary loss.

Guests have a rating like anyone else; it stays with the account when the guest registers.

The menu shows your rating, how many ranked matches you have won, lost and drawn, and your latest 20 matches: when, the result, the score in rounds, the opponent, and the rating change (or "private").

### Connection

The status line shows the connection state and how many ticks ahead your game is predicting. If your connection drops you have 20 seconds to come back and carry on; your character stands still meanwhile, and the round clock keeps running. A drop within the first 5 seconds of a match cannot be recovered. If the opponent found for a ranked match never connects, the match is called off after 15 seconds and nothing is recorded.

To feel how it plays on a poor connection, add `?latency=80` to the page address for 80 ms of artificial delay each way.

## Not in the game yet

Attack and parry animations, rematches, ring-outs, manual stance changes, defensive styles other than the parry, sound and effects, gamepad support.
