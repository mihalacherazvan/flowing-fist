import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK } from '@flowing-fist/content';
import { Button, encodeInput } from './input';
import { createMatchWorld } from './match';
import { MatchPhase, NO_WINNER, cloneWorld, hashWorld } from './state';
import type { MatchState, WorldState } from './state';
import { stepWorld } from './step';
import {
    MATCH_START_DISTANCE,
    MAX_HEALTH,
    MAX_ROUNDS,
    ROUNDS_TO_WIN,
    ROUND_COUNTDOWN_TICKS,
    ROUND_OVER_TICKS,
    ROUND_TICKS
} from './tuning';

const NO_INPUT = encodeInput(0, 0, 0, 0);
const FORWARD = encodeInput(0, 0, 1, 0);

function createMatch(): { world: WorldState; match: MatchState } {
    const world = createMatchWorld(50, [DEFAULT_DECK, DEFAULT_DECK]);

    return { world, match: world.match! };
}

function run(world: WorldState, ticks: number, input = NO_INPUT): void {
    for (let i = 0; i < ticks; i++) {
        stepWorld(world, [input, NO_INPUT]);
    }
}

/** Knock a character out and play on to the end of the pause that follows */
function finishRound(world: WorldState, loser: number): void {
    world.characters[loser].health = 0;
    run(world, 1 + ROUND_OVER_TICKS);
}

describe('match', () => {
    it('holds the fighters still through the countdown, then lets them fight', () => {
        const { world, match } = createMatch();

        run(world, ROUND_COUNTDOWN_TICKS - 1, encodeInput(Button.LockOn, 0, 1, 0));
        expect(match.phase).toBe(MatchPhase.Countdown);
        expect(world.characters[0].z).toBe(-MATCH_START_DISTANCE / 2);
        // Locking on is the one thing that works meanwhile
        expect(world.characters[0].lockedOn).toBe(true);

        run(world, 1, FORWARD);
        expect(match.phase).toBe(MatchPhase.Fighting);
        expect(match.phaseTicks).toBe(ROUND_TICKS);

        run(world, 10, FORWARD);
        expect(world.characters[0].z).toBeGreaterThan(-MATCH_START_DISTANCE / 2);
    });

    it('gives the round to the fighter left standing and starts the next one afresh', () => {
        const { world, match } = createMatch();
        run(world, ROUND_COUNTDOWN_TICKS + 30, encodeInput(Button.LockOn, 1, 0, 0));
        world.characters[0].health = 40;

        world.characters[1].health = 0;
        run(world, 1);
        expect(match.phase).toBe(MatchPhase.RoundOver);
        expect(match.roundWinner).toBe(0);
        expect(match.wins).toEqual([1, 0]);

        run(world, ROUND_OVER_TICKS);
        expect(match.phase).toBe(MatchPhase.Countdown);
        expect(match.round).toBe(2);
        expect(world.characters.map((character) => character.health)).toEqual([MAX_HEALTH, MAX_HEALTH]);
        expect(world.characters[0].x).toBe(0);
        expect(world.characters[0].z).toBe(-MATCH_START_DISTANCE / 2);
        expect(world.characters[0].lockedOn).toBe(true);
    });

    it('decides a round on health when the time runs out, and scores a draw for nobody', () => {
        const { world, match } = createMatch();
        run(world, ROUND_COUNTDOWN_TICKS);
        world.characters[0].health = 30;

        run(world, ROUND_TICKS);
        expect(match.phase).toBe(MatchPhase.RoundOver);
        expect(match.roundWinner).toBe(1);
        expect(match.wins).toEqual([0, 1]);

        run(world, ROUND_OVER_TICKS + ROUND_COUNTDOWN_TICKS + ROUND_TICKS);
        expect(match.roundWinner).toBe(NO_WINNER);
        expect(match.wins).toEqual([0, 1]);
        expect(match.round).toBe(2);
    });

    it('ends when a fighter has won enough rounds', () => {
        const { world, match } = createMatch();

        for (let round = 1; round <= ROUNDS_TO_WIN; round++) {
            expect(match.round).toBe(round);
            run(world, ROUND_COUNTDOWN_TICKS);
            finishRound(world, 0);
        }

        expect(match.phase).toBe(MatchPhase.MatchOver);
        expect(match.matchWinner).toBe(1);
        expect(match.wins).toEqual([0, ROUNDS_TO_WIN]);

        // Nothing moves on after the end
        const tick = world.tick;
        run(world, 100, FORWARD);
        expect(match.phase).toBe(MatchPhase.MatchOver);
        expect(world.tick).toBe(tick + 100);
    });

    it('ends as a draw when the rounds run out with the score level', () => {
        const { world, match } = createMatch();

        for (let round = 1; round <= MAX_ROUNDS; round++) {
            run(world, ROUND_COUNTDOWN_TICKS);
            world.characters[0].health = 0;
            finishRound(world, 1);
        }

        expect(match.phase).toBe(MatchPhase.MatchOver);
        expect(match.matchWinner).toBe(NO_WINNER);
        expect(match.wins).toEqual([0, 0]);
    });

    it('is part of what is cloned and hashed', () => {
        const { world, match } = createMatch();
        const copy = cloneWorld(world);
        expect(hashWorld(copy)).toBe(hashWorld(world));

        match.wins[0]++;
        expect(copy.match!.wins).toEqual([0, 0]);
        expect(hashWorld(copy)).not.toBe(hashWorld(world));
    });
});
