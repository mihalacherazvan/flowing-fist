import type { CombatDeck } from '@flowing-fist/content';
import { PI } from './math';
import { MatchPhase, NO_WINNER, createCharacter, createWorld } from './state';
import type { CharacterState, MatchState, WorldState } from './state';
import {
    MATCH_START_DISTANCE,
    MAX_ROUNDS,
    ROUNDS_TO_WIN,
    ROUND_COUNTDOWN_TICKS,
    ROUND_OVER_TICKS,
    ROUND_TICKS
} from './tuning';

/**
 * Two fresh characters facing each other across the middle of the arena
 */
function createRoundCharacters(): CharacterState[] {
    return [
        createCharacter(0, -MATCH_START_DISTANCE / 2, 0),
        createCharacter(0, MATCH_START_DISTANCE / 2, PI)
    ];
}

/**
 * A world that plays a whole match: rounds, a round timer and a score
 */
export function createMatchWorld(arenaRadius: number, decks: CombatDeck[]): WorldState {
    return createWorld(arenaRadius, createRoundCharacters(), decks, {
        phase: MatchPhase.Countdown,
        phaseTicks: ROUND_COUNTDOWN_TICKS,
        round: 1,
        wins: [0, 0],
        roundWinner: NO_WINNER,
        matchWinner: NO_WINNER
    });
}

/**
 * Whether the characters may act and hit each other this tick. Always true
 * without a match.
 */
export function isFightOn(world: WorldState): boolean {
    return !world.match || world.match.phase === MatchPhase.Fighting;
}

/**
 * Advance the round and the score by one tick, after the characters have moved
 */
export function stepMatch(world: WorldState): void {
    const match = world.match;
    if (!match || match.phase === MatchPhase.MatchOver) return;

    match.phaseTicks--;

    if (match.phase === MatchPhase.Fighting) {
        const [first, second] = world.characters;
        const isFirstDown = first.health <= 0;
        const isSecondDown = second.health <= 0;

        if (isFirstDown || isSecondDown) {
            endRound(match, isFirstDown && isSecondDown ? NO_WINNER : isFirstDown ? 1 : 0);
        } else if (match.phaseTicks <= 0) {
            // Time is up: whoever has more health left takes the round
            endRound(match, first.health === second.health ? NO_WINNER : first.health > second.health ? 0 : 1);
        }
    } else if (match.phaseTicks <= 0) {
        if (match.phase === MatchPhase.Countdown) {
            match.phase = MatchPhase.Fighting;
            match.phaseTicks = ROUND_TICKS;
        } else if (isMatchDecided(match)) {
            match.phase = MatchPhase.MatchOver;
            match.phaseTicks = 0;
            match.matchWinner = match.wins[0] === match.wins[1] ? NO_WINNER : match.wins[0] > match.wins[1] ? 0 : 1;
        } else {
            startNextRound(world, match);
        }
    }
}

function endRound(match: MatchState, winner: number): void {
    match.roundWinner = winner;
    if (winner !== NO_WINNER) {
        match.wins[winner]++;
    }

    match.phase = MatchPhase.RoundOver;
    match.phaseTicks = ROUND_OVER_TICKS;
}

function isMatchDecided(match: MatchState): boolean {
    return match.wins.some((wins) => wins >= ROUNDS_TO_WIN) || match.round >= MAX_ROUNDS;
}

function startNextRound(world: WorldState, match: MatchState): void {
    match.round++;
    match.phase = MatchPhase.Countdown;
    match.phaseTicks = ROUND_COUNTDOWN_TICKS;

    createRoundCharacters().forEach((fresh, index) => {
        const character = world.characters[index];
        // What the player has toggled or is holding carries over; everything else starts again
        Object.assign(character, fresh, { lockedOn: character.lockedOn, previousButtons: character.previousButtons });
    });
}
