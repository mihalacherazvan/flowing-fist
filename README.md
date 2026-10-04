# Flowing Fist

A browser-based, Absolver-style 1v1 martial-arts game. You fight from one of four stances, and a combat deck you build decides which attacks chain from each stance.

The fight is a deterministic 60 Hz simulation in plain TypeScript. The browser runs it for offline training and for predicting online play; the server runs the same code as the authority.

## Status

Milestones M0–M3 of the [spec](docs/SPEC.md#milestones) are done: you can fight a training dummy offline and duel another player online. Accounts, saved decks and the deck editor (M4) are next.

Combat numbers are placeholders and there are no attack animations yet. An attack shows as the character sliding forward plus a coloured hitbox overlay.

## Documentation

| Document | What it covers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The plan: scope, tech stack, combat and netcode design, milestones |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What each package and file does today, with its current limits |
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | Controls, combat rules, the move list and the default deck |

## Getting started

You need Node 22 or later and pnpm 11.

```sh
pnpm install
pnpm run client   # the game, on http://localhost:3000
pnpm run server   # the duel server, on ws://localhost:2567
```

Training mode needs only the client. Online duels need both: open the game in two tabs and press **O** in each.

### Character model

The model files are not in the repository. Before the game can load, put the Mixamo Y-bot export at:

```
apps/client/public/models/y-bot/y-bot-with-animations.glb
```

`pnpm assets` writes animation-only copies of any clips in `apps/client/public/models/<character>/animations/` to a `clips/` folder next to them.

### Configuration

| Setting | Where | Default |
|---|---|---|
| Server port | `PORT` environment variable for the server | `2567` |
| Server address used by the client | `VITE_SERVER_URL` | the page's host on port `2567` |
| Artificial network delay | `?latency=80` in the page address (milliseconds each way) | none |

## Commands

| Command | What it does |
|---|---|
| `pnpm run client` | Vite dev server for the game |
| `pnpm run server` | Colyseus server, restarts on change |
| `pnpm test` | Unit tests (sim, content, netcode) |
| `pnpm test:e2e` | Browser tests; starts its own client and server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript checks across all packages |
| `pnpm build` | Production build of the client |
| `pnpm assets` | Regenerates animation-only clips from the model files |

The browser tests need Chromium once: `pnpm exec playwright install chromium` in `apps/client`.

## Repository layout

```
apps/client        the game in the browser: input, rendering, HUD (Babylon.js, React, Vite)
apps/server        Colyseus server: one room per fight
packages/sim       the fight simulation
packages/content   moves, decks, arenas (data and rules)
packages/netcode   server authority and client prediction
packages/protocol  network message definitions
tools/assets       asset preparation scripts
docs/              spec, architecture and gameplay
```

`sim`, `content`, `netcode` and `protocol` contain no Babylon.js or Colyseus code, so they run and are tested in plain Node. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for how they fit together.
