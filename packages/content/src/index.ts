export const STANCES = ['front-right', 'front-left', 'back-right', 'back-left'] as const;

export type Stance = typeof STANCES[number];

export interface ArenaDefinition {
    /** Radius of the circular fighting area, in world units */
    radius: number;
}

export const TRAINING_ARENA: ArenaDefinition = { radius: 50 };
