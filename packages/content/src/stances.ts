export const STANCES = ['front-right', 'front-left', 'back-right', 'back-left'] as const;

export type Stance = typeof STANCES[number];
