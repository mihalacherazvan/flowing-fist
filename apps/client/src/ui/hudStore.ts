import type { Stance } from '@flowing-fist/content';

export interface HudCharacter {
    name: string;
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    stance: Stance;
    /** What the character is doing, e.g. "Jab (active)" or "Guarding" */
    status: string;
}

export interface HudState {
    mode: 'training' | 'duel';
    characters: HudCharacter[];
    /** One line describing the session, e.g. the dummy mode or the connection state */
    statusLine: string;
}

export interface HudActions {
    startTraining(): void;
    startDuel(): void;
}

type Listener = () => void;

/**
 * The only link between the game and the UI: the game publishes plain data
 * here and the UI subscribes to it. The UI never touches Babylon or the sim.
 */
class HudStore {
    private state: HudState = { mode: 'training', characters: [], statusLine: '' };
    private serialisedState: string = '';
    private listeners: Set<Listener> = new Set();

    /** What the UI can ask the game to do; set by the game on start-up */
    public actions: HudActions = { startTraining: () => undefined, startDuel: () => undefined };

    public subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    public getState = (): HudState => this.state;

    /**
     * Called by the game every frame; subscribers are only told when something changed
     */
    public publish(state: HudState): void {
        const serialisedState = JSON.stringify(state);
        if (serialisedState === this.serialisedState) return;

        this.state = state;
        this.serialisedState = serialisedState;
        this.listeners.forEach((listener) => listener());
    }
}

export const hudStore = new HudStore();
