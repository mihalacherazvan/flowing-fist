import { useSyncExternalStore } from 'react';
import { STANCES } from '@flowing-fist/content';
import { hudStore } from './hudStore';
import type { HudCharacter } from './hudStore';

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

function CharacterPanel({ character, side }: { character: HudCharacter; side: 'left' | 'right' }) {
    return (
        <div className={`hud-panel hud-panel-${side}`} data-testid={`hud-${side}`}>
            <div className="hud-name">{character.name}</div>
            <Bar label="Health" value={character.health} max={character.maxHealth} className="hud-health" />
            <Bar label="Stamina" value={character.stamina} max={character.maxStamina} className="hud-stamina" />
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

export function Hud() {
    const state = useSyncExternalStore(hudStore.subscribe, hudStore.getState);
    const [first, second] = state.characters;

    if (!first || !second) return null;

    const isTraining = state.mode === 'training';

    return (
        <div className="hud">
            <CharacterPanel character={first} side="left" />
            <CharacterPanel character={second} side="right" />
            <div className="hud-help">
                <div data-testid="hud-status"><b>{state.statusLine}</b></div>
                <div>WASD move · Shift run · Space dodge · F lock on</div>
                <div>LMB / J attack · RMB / K alternate · Q guard · H hitboxes</div>
                {isTraining && <div>G dummy mode · P pause · . step one tick</div>}
                <button
                    className="hud-button"
                    onClick={() => isTraining ? hudStore.actions.startDuel() : hudStore.actions.startTraining()}
                >
                    {isTraining ? 'Find online duel (O)' : 'Back to training (O)'}
                </button>
            </div>
        </div>
    );
}
