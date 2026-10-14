type Listener = () => void;

export interface CharacterModel {
    id: string;
    name: string;
    /** The GLB built by `pnpm assets`, relative to the page */
    path: string;
}

/** The first one is used until the player picks another */
export const CHARACTER_MODELS: readonly CharacterModel[] = [
    { id: 'fighter', name: 'Masked fighter', path: 'models/fighter/fighter-with-animations.glb' },
    { id: 'fighter-v2', name: 'Masked fighter v2', path: 'models/fighter-v2/fighter-v2-with-animations.glb' },
    { id: 'y-bot', name: 'Y Bot', path: 'models/y-bot/y-bot-with-animations.glb' }
];

const MODEL_KEY = 'flowing-fist.characterModel';

/**
 * Which model the characters are drawn with. A choice of this browser only:
 * it changes nothing in the simulation and is not sent to the server.
 */
class CharacterModelStore {
    private model: CharacterModel = CHARACTER_MODELS.find((model) => model.id === localStorage.getItem(MODEL_KEY)) ?? CHARACTER_MODELS[0];
    private listeners: Set<Listener> = new Set();

    public subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    public getModel = (): CharacterModel => this.model;

    public select(id: string): void {
        const model = CHARACTER_MODELS.find((candidate) => candidate.id === id);
        if (!model || model === this.model) return;

        this.model = model;
        localStorage.setItem(MODEL_KEY, model.id);
        this.listeners.forEach((listener) => listener());
    }
}

export const characterModelStore = new CharacterModelStore();
