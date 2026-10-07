import { useState, useSyncExternalStore } from 'react';
import { STANCES } from '@flowing-fist/content';
import { hudStore } from './hudStore';
import type { HudCharacter, HudLobby, HudMatch, HudResult } from './hudStore';
import { Menu } from './Menu';
import { menuStore } from './menuStore';

function Bar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
    return (
        <div className="hud-bar" aria-label={`${label} ${Math.round(value)} of ${max}`}>
            <div className={`hud-bar-fill ${className}`} style={{ width: `${value / max * 100}%` }} />
        </div>
    );
}

function StanceDiamond({ stance }: { stance: string }) {
    return (
        <div className="hud-stances" title={stance}>
            {STANCES.map((name) => (
                <div key={name} className={`hud-stance hud-stance-${name}${name === stance ? ' is-current' : ''}`} />
            ))}
        </div>
    );
}

/** One mark per round needed to win the match, filled for each round won */
function RoundMarks({ won, needed }: { won: number; needed: number }) {
    return (
        <div className="hud-rounds" aria-label={`${won} of ${needed} rounds won`}>
            {Array.from({ length: needed }, (_, index) => (
                <div key={index} className={`hud-round${index < won ? ' is-won' : ''}`} />
            ))}
        </div>
    );
}

function CharacterPanel({ character, side, roundsToWin }: { character: HudCharacter; side: 'left' | 'right'; roundsToWin: number }) {
    return (
        <div className={`hud-panel hud-panel-${side}`} data-testid={`hud-${side}`}>
            <div className="hud-name">{character.name}</div>
            <Bar label="Health" value={character.health} max={character.maxHealth} className="hud-health" />
            <Bar label="Stamina" value={character.stamina} max={character.maxStamina} className="hud-stamina" />
            {character.roundsWon !== null && <RoundMarks won={character.roundsWon} needed={roundsToWin} />}
            <div className="hud-row">
                <StanceDiamond stance={character.stance} />
                <div>
                    <div className="hud-stance-name">{character.stance}</div>
                    <div className="hud-status">{character.status}</div>
                </div>
            </div>
        </div>
    );
}

function MatchClock({ match }: { match: HudMatch }) {
    return (
        <div className="hud-clock" data-testid="hud-clock">
            <div className="hud-clock-time">{match.secondsLeft ?? '–'}</div>
            <div className="hud-clock-round">Round {match.round}</div>
        </div>
    );
}

function LobbyPanel({ lobby }: { lobby: HudLobby }) {
    const [copied, setCopied] = useState(false);

    const copy = (code: string) => {
        navigator.clipboard.writeText(code).then(() => setCopied(true), () => undefined);
    };

    return (
        <div className="hud-dialog" data-testid="hud-lobby">
            <div className={lobby.isOver ? 'hud-dialog-problem' : ''}>{lobby.message}</div>
            {lobby.code && (
                <div className="hud-code">
                    <span data-testid="hud-code">{lobby.code}</span>
                    <button className="hud-button" onClick={() => copy(lobby.code!)}>{copied ? 'Copied' : 'Copy'}</button>
                </div>
            )}
            <button className="hud-button" onClick={() => hudStore.actions.startTraining()}>
                {lobby.isOver ? 'Back to training (O)' : 'Cancel (O)'}
            </button>
        </div>
    );
}

function ResultPanel({ result }: { result: HudResult }) {
    return (
        <div className="hud-dialog" data-testid="hud-result">
            <div className="hud-result-title">{result.title}</div>
            <div className="hud-result-detail">{result.detail}</div>
            <div>{result.rating}</div>
            <div>
                {result.isRanked && (
                    <button className="hud-button" onClick={() => hudStore.actions.startDuel({ kind: 'ranked' })}>
                        Find another match
                    </button>
                )}
                <button className="hud-button" onClick={() => hudStore.actions.startTraining()}>Back to training (O)</button>
            </div>
        </div>
    );
}

export function Hud() {
    const state = useSyncExternalStore(hudStore.subscribe, hudStore.getState);
    const [first, second] = state.characters;

    if (!first || !second) return null;

    const isTraining = state.mode === 'training';
    const roundsToWin = state.match?.roundsToWin ?? 0;

    return (
        <div className="hud">
            <CharacterPanel character={first} side="left" roundsToWin={roundsToWin} />
            <CharacterPanel character={second} side="right" roundsToWin={roundsToWin} />
            {state.match && <MatchClock match={state.match} />}
            {state.match?.announcement && <div className="hud-announcement" data-testid="hud-announcement">{state.match.announcement}</div>}
            {state.lobby && <LobbyPanel lobby={state.lobby} />}
            {state.result && <ResultPanel result={state.result} />}
            <div className="hud-help">
                <div data-testid="hud-status"><b>{state.statusLine}</b></div>
                <div>WASD move · Shift run · Space dodge · F lock on</div>
                <div>LMB / H attack · RMB / J alternate · L guard (during a wind-up: feint) · K parry</div>
                <div>V hitboxes{isTraining && ' · G dummy mode · P pause · . step one tick'}</div>
                <button
                    className="hud-button"
                    onClick={() => isTraining ? hudStore.actions.startDuel({ kind: 'ranked' }) : hudStore.actions.startTraining()}
                >
                    {isTraining ? 'Find ranked match (O)' : state.isMatchInProgress ? 'Forfeit the match' : 'Back to training (O)'}
                </button>
                <button className="hud-button" data-testid="menu-open" onClick={() => menuStore.setOpen(true)}>
                    Play online, decks and account (B)
                </button>
            </div>
            <Menu />
        </div>
    );
}
