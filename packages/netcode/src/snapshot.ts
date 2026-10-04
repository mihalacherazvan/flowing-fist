import type { CombatDeck } from '@flowing-fist/content';
import type { WorldSnapshot } from '@flowing-fist/protocol';
import { createWorld } from '@flowing-fist/sim';
import type { WorldState } from '@flowing-fist/sim';

export function takeSnapshot(world: WorldState): WorldSnapshot {
    return {
        tick: world.tick,
        arenaRadius: world.arenaRadius,
        characters: world.characters.map((character) => ({ ...character }))
    };
}

export function worldFromSnapshot(snapshot: WorldSnapshot, decks: CombatDeck[]): WorldState {
    const world = createWorld(snapshot.arenaRadius, snapshot.characters.map((character) => ({ ...character })), decks);
    world.tick = snapshot.tick;

    return world;
}
