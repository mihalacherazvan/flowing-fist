import { DEFAULT_DECK, TRAINING_ARENA } from '@flowing-fist/content';
import { FixedTimestep, PI, cloneWorld, createCharacter, createWorld, stepWorld } from '@flowing-fist/sim';
import type { InputFrame, WorldState } from '@flowing-fist/sim';
import { TrainingDummy } from '../training/TrainingDummy';
import type { GameSession } from './GameSession';

/**
 * Offline practice against the training dummy, simulated entirely in the browser
 */
export class TrainingSession implements GameSession {
    public readonly mode = 'training';

    private timestep: FixedTimestep = new FixedTimestep();
    private world: WorldState;
    private previousWorld: WorldState;
    private dummy: TrainingDummy = new TrainingDummy();
    private paused: boolean = false;
    private stepRequested: boolean = false;

    constructor() {
        // The player and the dummy facing each other
        this.world = createWorld(TRAINING_ARENA.radius, [
            createCharacter(0, 0, 0),
            createCharacter(0, 5, PI)
        ], [DEFAULT_DECK, DEFAULT_DECK]);
        this.previousWorld = cloneWorld(this.world);

        window.addEventListener('keydown', this.handleKeyDown);
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (event.code === 'KeyG') this.dummy.cycleMode();
        if (event.code === 'KeyP') this.paused = !this.paused;
        if (event.code === 'Period') this.stepRequested = true;
    };

    public getLocalPlayerIndex(): number {
        return 0;
    }

    public getCharacterNames(): string[] {
        return ['Player', 'Dummy'];
    }

    public update(elapsedMs: number, sampleInput: () => InputFrame): void {
        let ticks = this.timestep.advance(elapsedMs);

        // While paused the simulation only moves when asked to, one tick at a time
        if (this.paused) {
            ticks = this.stepRequested ? 1 : 0;
        }
        this.stepRequested = false;

        for (let i = 0; i < ticks; i++) {
            this.previousWorld = cloneWorld(this.world);
            stepWorld(this.world, [sampleInput(), this.dummy.sampleInputFrame()]);
        }
    }

    public getWorld(): WorldState {
        return this.world;
    }

    public getPreviousWorld(): WorldState {
        return this.previousWorld;
    }

    public getAlpha(): number {
        return this.paused ? 1 : this.timestep.getAlpha();
    }

    public getStatusLine(): string {
        return `Training · dummy: ${this.dummy.getMode()}${this.paused ? ' · PAUSED' : ''}`;
    }

    public dispose(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
    }
}
