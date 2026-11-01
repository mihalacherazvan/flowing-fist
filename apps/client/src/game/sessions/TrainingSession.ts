import { DEFAULT_DECK, TRAINING_ARENA } from '@flowing-fist/content';
import type { CombatDeck } from '@flowing-fist/content';
import { FixedTimestep, PI, StringGapTracker, cloneWorld, createCharacter, createWorld, stepWorld } from '@flowing-fist/sim';
import type { InputFrame, StringGap, WorldState } from '@flowing-fist/sim';
import type { HudLobby, HudResult } from '../../ui/hudStore';
import { menuStore } from '../../ui/menuStore';
import { TrainingDummy } from '../training/TrainingDummy';
import type { GameSession } from './GameSession';

/** Speeds T cycles through, to watch timings in slow motion */
const TIME_SCALES = [1, 0.5, 0.25];

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
    private timeScaleIndex: number = 0;
    private gapTracker: StringGapTracker = new StringGapTracker();
    /** The latest follow-up attack that landed, by either character */
    private latestGap: StringGap | null = null;

    /**
     * @param deck the player's deck; the dummy always fights with the default one
     */
    constructor(deck: CombatDeck) {
        // The player and the dummy facing each other
        this.world = createWorld(TRAINING_ARENA.radius, [
            createCharacter(0, 0, 0),
            createCharacter(0, 5, PI)
        ], [deck, DEFAULT_DECK]);
        this.previousWorld = cloneWorld(this.world);

        window.addEventListener('keydown', this.handleKeyDown);
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (menuStore.isOpen()) return;

        if (event.code === 'KeyG') this.dummy.cycleMode();
        if (event.code === 'KeyP') this.paused = !this.paused;
        if (event.code === 'Period') this.stepRequested = true;
        if (event.code === 'KeyT') this.timeScaleIndex = (this.timeScaleIndex + 1) % TIME_SCALES.length;
    };

    public getLocalPlayerIndex(): number {
        return 0;
    }

    public getCharacterNames(): string[] {
        return ['Player', 'Dummy'];
    }

    public update(elapsedMs: number, sampleInput: () => InputFrame): void {
        let ticks = this.timestep.advance(elapsedMs * this.getTimeScale());

        // While paused the simulation only moves when asked to, one tick at a time
        if (this.paused) {
            ticks = this.stepRequested ? 1 : 0;
        }
        this.stepRequested = false;

        for (let i = 0; i < ticks; i++) {
            this.previousWorld = cloneWorld(this.world);
            stepWorld(this.world, [sampleInput(), this.dummy.sampleInputFrame()]);

            const gaps = this.gapTracker.observe(this.previousWorld, this.world);
            if (gaps.length > 0) this.latestGap = gaps[gaps.length - 1];
        }
    }

    public getTimeScale(): number {
        return TIME_SCALES[this.timeScaleIndex];
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
        const timeScale = this.getTimeScale();
        const parts = [`Training · dummy: ${this.dummy.getMode()}`];
        if (timeScale !== 1) parts.push(`${timeScale}× speed`);
        if (this.paused) parts.push('PAUSED');
        if (this.latestGap) parts.push(this.describeGap(this.latestGap));

        return parts.join(' · ');
    }

    /**
     * E.g. "Jab → Cross: 9-tick gap" or "Player: Jab → Cross: combo, 2 ticks to spare (gold link)"
     */
    private describeGap(gap: StringGap): string {
        const attacker = this.getCharacterNames()[gap.attackerIndex];
        const timing = gap.gapTicks > 0 ? `${gap.gapTicks}-tick gap` : `combo, ${-gap.gapTicks} ticks to spare`;
        const notes = [gap.goldLinked ? 'gold link' : '', gap.afterBlock ? 'after a block' : ''].filter(Boolean);

        return `${attacker}: ${gap.previousMoveName} → ${gap.moveName}: ${timing}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
    }

    public getLobby(): HudLobby | null {
        return null;
    }

    public getResult(): HudResult | null {
        return null;
    }

    public dispose(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
    }
}
