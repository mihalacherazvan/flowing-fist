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
    /** Rounds won in this match; null where there are no rounds */
    roundsWon: number | null;
}

/** Rounds and score, shown top centre during a match */
export interface HudMatch {
    round: number;
    roundsToWin: number;
    /** Whole seconds left in the round; null between rounds */
    secondsLeft: number | null;
    /** Large text across the middle, e.g. "Round 2 · 3" or "KO · You win the round"; empty for none */
    announcement: string;
}

/** Shown in the middle while an online duel has no fight to show */
export interface HudLobby {
    message: string;
    /** The code a friend needs to join this private duel */
    code: string | null;
    /** True when nothing more will happen: the duel failed or was cut off */
    isOver: boolean;
}

/** The end of a match */
export interface HudResult {
    title: string;
    /** Score and how it ended, e.g. "3 – 1" or "1 – 0 · your opponent left" */
    detail: string;
    /** Rating before and after, or why there is none */
    rating: string;
    isRanked: boolean;
}

export interface HudState {
    mode: 'training' | 'duel';
    characters: HudCharacter[];
    /** One line describing the session, e.g. the dummy mode or the connection state */
    statusLine: string;
    match: HudMatch | null;
    lobby: HudLobby | null;
    result: HudResult | null;
    /** An online match is being fought; leaving now forfeits it */
    isMatchInProgress: boolean;
}

/** ranked: the server finds an opponent. private: create a duel (code null) or join the one with that code. */
export type DuelRequest = { kind: 'ranked' } | { kind: 'private'; code: string | null };

export interface HudActions {
    startTraining(): void;
    startDuel(request: DuelRequest): void;
}

type Listener = () => void;

/**
 * The only link between the game and the UI: the game publishes plain data
 * here and the UI subscribes to it. The UI never touches Babylon or the sim.
 */
class HudStore {
    private state: HudState = {
        mode: 'training',
        characters: [],
        statusLine: '',
        match: null,
        lobby: null,
        result: null,
        isMatchInProgress: false
    };
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
