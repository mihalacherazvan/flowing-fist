import { useSyncExternalStore } from 'react';
import { CHARACTER_MODELS, characterModelStore } from '../game/characters/characterModelStore';

/**
 * Chooses the model both characters are drawn with
 */
export function ModelPicker() {
    const model = useSyncExternalStore(characterModelStore.subscribe, characterModelStore.getModel);

    return (
        <div className="menu-actions">
            <label htmlFor="character-model">Character model</label>
            <select
                id="character-model"
                className="menu-input"
                data-testid="character-model"
                value={model.id}
                onChange={(event) => characterModelStore.select(event.target.value)}
            >
                {CHARACTER_MODELS.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                ))}
            </select>
        </div>
    );
}
