import type { InputFrame, WorldState } from '@flowing-fist/sim';

/**
 * Where the simulated world comes from. The scene draws whatever a session
 * gives it, without knowing whether the fight is local or online.
 */
export interface GameSession {
    readonly mode: 'training' | 'duel';

    /** Index of the character the local player controls */
    getLocalPlayerIndex(): number;

    getCharacterNames(): string[];

    /**
     * Advance by the time since the last frame
     *
     * @param sampleInput returns the local player's input for one tick
     */
    update(elapsedMs: number, sampleInput: () => InputFrame): void;

    /** The world at the latest tick */
    getWorld(): WorldState;

    /** The world one tick earlier, for render interpolation */
    getPreviousWorld(): WorldState;

    /** How far rendering is between the previous and latest tick, 0 to 1 */
    getAlpha(): number;

    /** One line for the HUD describing the session */
    getStatusLine(): string;

    dispose(): void;
}
