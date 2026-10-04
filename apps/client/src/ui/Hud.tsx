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
        <div className={`hud-panel hud-panel-${side}`} data-testid={`hud-${character.name.toLowerCase()}`}>
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
    const [player, dummy] = state.characters;

    if (!player || !dummy) return null;

    return (
        <div className="hud">
            <CharacterPanel character={player} side="left" />
            <CharacterPanel character={dummy} side="right" />
            <div className="hud-help">
                <div>Dummy: <b>{state.dummyMode}</b>{state.paused ? ' · PAUSED' : ''}</div>
                <div>WASD move · Shift run · Space dodge · F lock on</div>
                <div>LMB / J attack · RMB / K alternate · Q guard</div>
                <div>G dummy mode · H hitboxes · P pause · . step one tick</div>
            </div>
        </div>
    );
}
