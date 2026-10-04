# Flowing Fist — High-Level Spec

## Status

_As of 2026-10-04:_ milestones **M0–M4 are done**; **M5 is next**. This document is the plan. What actually exists is described in [ARCHITECTURE.md](ARCHITECTURE.md), and how the game plays in [GAMEPLAY.md](GAMEPLAY.md).

## Context

Flowing Fist is a browser-based, Absolver-style martial-arts game. It began as a single client folder with Babylon.js, a third-person camera and WASD locomotion on a Mixamo Y-bot, and no physics, combat or networking.

This spec defines the first shippable game and the architecture behind it. Decisions already made:

- **Scope:** 1v1 duel arenas (matchmade + private) plus an offline training dummy. Open world, PvE and co-op are later extensions.
- **Combat:** full Combat Deck from day one (4 stances, editable sequences, alternates), shipped with a small move set.
- **Repo:** single monorepo at the parent folder, pnpm workspaces.
- **Persistence:** accounts + saved decks + match history, on MySQL/MariaDB.

## Core architectural idea

The fight is a **deterministic, fixed-tick (60 Hz) simulation written in plain TypeScript with no Babylon dependency**, living in a shared package that both client and server import. Everything else follows from that:

- The server runs the same code as the authority; the client runs it for prediction and for the offline training mode.
- Hit detection uses **data-defined hitboxes/hurtboxes** (capsules and spheres in character-local space, per active frame), not skeleton or mesh collision. The server never loads a GLB or evaluates an animation.
- Animation is a *view* of sim state: the client sets animation time from the sim's move frame, never the reverse. Root motion is baked into move data at build time.
- Arena collision is simple kinematic capsule-vs-bounds in the sim. **No physics engine in the authoritative path**; Havok is optional and client-only (ragdolls, debris).

## Tech stack

| Area | Choice | Notes |
|---|---|---|
| Rendering | Babylon.js 9.x (upgrade from 8.1) | Keep. WebGL2 default, WebGPU opt-in. |
| Client build | Vite + TypeScript | Keep. |
| Menus / HUD / deck editor | DOM overlay with React | The deck editor is a form-heavy UI that is painful in Babylon GUI. Kept Preact-compatible (no React-only libraries, hooks and function components only) so it can switch via `preact/compat` aliasing in Vite. UI reads game state through a small store, never from Babylon objects directly. |
| Server | Node 22 + Colyseus (current stable, 0.17+) | Rooms, matchmaking, reconnection, auth. |
| Transport | WebSocket first; WebTransport later | Colyseus' WebTransport/unreliable support is still experimental. |
| Database | MySQL 8 / MariaDB via Drizzle ORM | Typed schema + migrations in TS. Data is small and relational, so there is no real gain from PostgreSQL here; stay with what you know. |
| Scaling (later) | Redis presence/driver for Colyseus | Only when running more than one process. |
| Tests | Vitest (sim + server), `@colyseus/testing`, Playwright smoke | |
| Asset pipeline | `gltf-transform` scripts | Strip meshes from animation clips, bake root motion. |

## Repository layout

```
flowing-fist/                  (git root; client history moved up and preserved)
  pnpm-workspace.yaml          pnpm workspaces
  apps/client/                 current flowing-fist-client
  apps/server/                 Colyseus + HTTP API
  packages/sim/                deterministic combat simulation, math, input encoding
  packages/content/            move definitions, deck rules, arena definitions (data + validators)
  packages/protocol/           message types shared by client and server
  packages/netcode/            server authority and client prediction, free of Colyseus and Babylon
  tools/                       asset pipeline, move viewer/hitbox editor
  docs/SPEC.md                 this document
```

## Combat design

- **Stances:** four (front-right, front-left, back-right, back-left). Every attack declares a start stance and an end stance.
- **Combat Deck:** per stance, a sequence of up to 3 attacks plus 1 alternate attack. A sequence is valid only if each attack starts in the stance the previous one ended in. Decks are validated in `packages/content` on both client and server.
- **Move data (per attack):** start/end stance, startup/active/recovery frames, damage, stamina cost, hit-stun and block-stun, height (high/mid/low), type (horizontal/vertical/thrust), properties (guard break, armour, duck, jump), root-motion curve, hitbox list per active frame, animation clip id.
- **Resources:** health, stamina (spent by attacks, dodges and guarding; guard breaks at zero).
- **Defence:** guard, directional dodge, and one style ability at launch (a timed parry). Avoid and absorb styles come later as data plus small sim additions.
- **Techniques:** feint (cancel during startup for stamina), manual stance change, lock-on targeting with free movement when unlocked.
- **Match:** first to 3 rounds, round timer, ring-out optional per arena.
- **Out of scope for v1:** weapons, powers/shards, move learning, gear.

## Netcode

**Server-authoritative rollback.** With only two characters the state is tiny, so re-simulating several ticks per frame is cheap.

- Client sends input frames (bitmask + quantised stick/camera yaw) tagged with tick number, each packet carrying the last few frames redundantly.
- Server collects inputs, advances the authoritative sim, and broadcasts confirmed inputs for both players, plus a state hash every tick and a full snapshot periodically or on mismatch.
- Client predicts both characters (repeating the opponent's last input), rolls back and re-simulates when confirmed inputs differ, and hard-corrects from a snapshot on hash mismatch.
- 2–3 frames of input delay, adaptive to ping, to cut rollback distance.
- **Colyseus Schema state sync is used only for room metadata** (players, round score, timer, phase). Fight state goes through raw messages.
- **Determinism:** IEEE float arithmetic is consistent across JS engines but `Math.sin/cos/pow` are not, so the sim uses its own trig (polynomial approximations built from basic arithmetic). Server snapshots correct any residual drift, so this needs to be good, not perfect.
- **Known risk:** WebSocket is TCP, so packet loss causes head-of-line stalls. Acceptable for regional play; WebTransport datagrams are the planned mitigation.
- **Anti-cheat:** the server owns the sim, validates decks against owned moves, and rejects out-of-range or over-rate inputs.

## Server

- **Rooms:** `MatchmakingRoom` (queue by rating and region), `DuelRoom` (the fight; also joinable by private code), reconnection window on disconnect.
- **HTTP API:** auth (guest that can upgrade to email/OAuth, JWT), deck CRUD, profile, match history.
- **Tables:** `users`, `decks` (slots as JSON, validated in code), `user_moves`, `matches`, `match_players`, `ratings`.
- **Deployment:** one Node process behind Caddy on a VPS to start; one region.

## Client

- **Sim/view split.** `apps/client/src/game/characters/Player.ts` currently mixes input, movement, camera and animation, with speeds expressed per rendered frame (so movement is frame-rate dependent). It is split into: sim character state (in `packages/sim`), `CharacterView` (mesh, animation blending, VFX), and `CameraRig` (orbit + lock-on).
- **Input.** `apps/client/src/game/utils/InputController.ts` is kept and extended to emit a per-tick `InputFrame`, with gamepad support and rebinding. Mouse delta must accumulate between reads instead of overwriting.
- **Fixed-step loop** with render interpolation replaces the per-frame `update()` in `GameScene.ts`.
- **Animation.** One skinned mesh, animation-only clips retargeted onto it, cross-fades driven by sim state. The current assets embed the full 2.2 MB mesh in each of the five animation files; the pipeline strips that.
- **Modes:** training (local sim, no server), duel (networked), deck editor, replay viewer (replays are just input logs).
- **Debug:** hitbox/hurtbox overlay, frame-step, artificial latency and packet loss, rollback counter.

## Tooling

A dev-only **move viewer** page: scrub an animation clip frame by frame, place hitboxes, set frame data, export move JSON to `packages/content`. This is the main content-authoring bottleneck, so it is built early.

## Milestones

1. **M0 Foundation** (done) — monorepo restructure, Babylon upgrade, lint/test/CI, asset pipeline for animation-only clips. The CI workflow was removed again during M4: checks are run by hand and browser play-testing is manual.
2. **M1 Sim core** (done) — fixed-tick loop, deterministic math, locomotion and lock-on in `packages/sim`; client ported to sim/view split.
3. **M2 Offline combat** (done, except the move viewer, which waits for attack animation clips) — stances, attacks, hit/guard/stamina, hitbox overlay, move viewer, 8–12 moves, training dummy.
4. **M3 Networked duel** (done, except input delay and a Node-versus-browser determinism test) — `DuelRoom`, input relay, prediction and rollback, snapshots, latency simulation, reconnection.
5. **M4 Decks and accounts** (done, except OAuth sign-in and the `user_moves` table, which waits for move learning) — auth, database, deck editor UI, server-side deck validation.
6. **M5 Match flow** (next) — matchmaking, rounds, HUD, results, rating, parry style, feints.
7. **M6 Polish and launch** — VFX/SFX, second arena, more moves, gamepad, replays, deployment.

**Later:** AI opponents and co-op zones, move learning, further defensive styles, weapons, WebTransport, multi-region.

## Main risks

- **Animation content** is the largest cost: Mixamo clips need trimming, retargeting and frame-data authoring to feel like a coherent style. Mitigated by the move viewer and a deliberately small launch move set.
- **Combat feel under latency** — mitigated by building latency simulation in M3 and tuning before adding content.
- **TCP transport** — see Netcode.

## Verification

- **Sim:** Vitest replay tests — a recorded input log must produce the same per-tick state hashes on every run and in both Node and a browser; unit tests for deck validation and frame data.
- **Netcode:** two headless bot clients against a local server with injected latency, jitter and loss; assert no desync at match end and a bounded rollback depth.
- **Server:** `@colyseus/testing` for room lifecycle, reconnection and rejected invalid decks; migrations run up and down cleanly.
- **Client:** `tsc --noEmit`, ESLint, Playwright smoke test that loads training mode and lands a hit.
- **Manual per milestone:** two browser tabs at 100 ms simulated ping complete a full match with the hitbox overlay agreeing on both sides.
