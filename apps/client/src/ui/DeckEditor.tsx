import { useState } from 'react';
import { DEFAULT_DECK, MAX_SEQUENCE_LENGTH, STANCES, validateDeck } from '@flowing-fist/content';
import type { CombatDeck, Stance } from '@flowing-fist/content';
import { MAX_DECKS_PER_ACCOUNT, MAX_DECK_NAME_LENGTH } from '@flowing-fist/protocol';
import type { SavedDeck } from '@flowing-fist/protocol';
import { accountStore } from '../account/accountStore';
import type { AccountState } from '../account/accountStore';
import { ApiError } from '../api/apiClient';
import { getSlotChoices, getSlotStance, setSlotMove } from './deckEditing';
import type { DeckSlot } from './deckEditing';

interface Draft {
    /** The saved deck being changed, or null for one that has not been saved yet */
    deckId: string | null;
    name: string;
    deck: CombatDeck;
}

function draftOf(saved: SavedDeck): Draft {
    return { deckId: saved.id, name: saved.name, deck: saved.deck };
}

function newDraft(): Draft {
    return { deckId: null, name: 'New deck', deck: DEFAULT_DECK };
}

function SlotSelect({ deck, slot, onChange }: { deck: CombatDeck; slot: DeckSlot; onChange: (deck: CombatDeck) => void }) {
    const choices = getSlotChoices(deck, slot);
    const moveId = slot.kind === 'alternate' ? deck.alternates[slot.stance] : deck.sequences[slot.stance][slot.index];
    const testId = `deck-slot-${slot.stance}-${slot.kind === 'alternate' ? 'alternate' : slot.index}`;
    const move = choices.find((choice) => choice.id === moveId);
    const details = move
        ? `${move.name}: ${move.damage} damage, ${move.staminaCost} stamina, ${move.height}${move.guardBreak ? ', breaks guard' : ''}`
        : '';

    return (
        <select
            className="menu-input"
            data-testid={testId}
            title={details}
            value={moveId ?? ''}
            disabled={getSlotStance(deck, slot) === null}
            onChange={(event) => onChange(setSlotMove(deck, slot, event.target.value || null))}
        >
            <option value="">—</option>
            {choices.map((move) => (
                <option key={move.id} value={move.id}>
                    {move.name} → {move.endStance}
                </option>
            ))}
        </select>
    );
}

function StanceRow({ deck, stance, onChange }: { deck: CombatDeck; stance: Stance; onChange: (deck: CombatDeck) => void }) {
    return (
        <tr>
            <th scope="row">{stance}</th>
            {Array.from({ length: MAX_SEQUENCE_LENGTH }, (_, index) => (
                <td key={index}>
                    <SlotSelect deck={deck} slot={{ stance, kind: 'sequence', index }} onChange={onChange} />
                </td>
            ))}
            <td>
                <SlotSelect deck={deck} slot={{ stance, kind: 'alternate' }} onChange={onChange} />
            </td>
        </tr>
    );
}

export function DeckEditor({ account }: { account: AccountState }) {
    const [draft, setDraft] = useState<Draft>(() => {
        const active = account.decks.find((deck) => deck.isActive) ?? account.decks[0];

        return active ? draftOf(active) : newDraft();
    });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [problems, setProblems] = useState<string[]>([]);

    const saved = account.decks.find((deck) => deck.id === draft.deckId);
    const ruleProblems = validateDeck(draft.deck);
    const name = draft.name.trim();
    const isChanged = !saved || saved.name !== name || JSON.stringify(saved.deck) !== JSON.stringify(draft.deck);
    const canAddDeck = account.decks.length < MAX_DECKS_PER_ACCOUNT;

    const select = (next: Draft) => {
        setDraft(next);
        setMessage('');
        setProblems([]);
    };

    /** Run a change against the server, showing its outcome under the editor */
    const run = async (action: () => Promise<string>) => {
        setBusy(true);
        setMessage('');
        setProblems([]);

        try {
            setMessage(await action());
        } catch (error) {
            setMessage(error instanceof ApiError ? error.message : 'Something went wrong');
            setProblems(error instanceof ApiError ? error.details : []);
        } finally {
            setBusy(false);
        }
    };

    const save = () => run(async () => {
        const result = await accountStore.saveDeck(draft.deckId, { name, deck: draft.deck });
        setDraft(draftOf(result));

        return result.isActive ? 'Saved. This is the deck you fight with.' : 'Saved.';
    });

    const activate = () => run(async () => {
        await accountStore.activateDeck(draft.deckId!);

        return 'This is now the deck you fight with.';
    });

    const remove = () => run(async () => {
        await accountStore.deleteDeck(draft.deckId!);
        const remaining = accountStore.getState().decks;
        setDraft(remaining[0] ? draftOf(remaining[0]) : newDraft());

        return saved?.isActive ? 'Deleted. You now fight with the default deck until you choose another.' : 'Deleted.';
    });

    return (
        <div className="deck-editor">
            <ul className="deck-list">
                {account.decks.map((deck) => (
                    <li key={deck.id}>
                        <button
                            className={`menu-button deck-list-item${deck.id === draft.deckId ? ' is-selected' : ''}`}
                            onClick={() => select(draftOf(deck))}
                        >
                            {deck.name}{deck.isActive ? ' ✓' : ''}
                        </button>
                    </li>
                ))}
                <li>
                    <button
                        className={`menu-button deck-list-item${draft.deckId === null ? ' is-selected' : ''}`}
                        data-testid="deck-new"
                        disabled={!canAddDeck}
                        title={canAddDeck ? '' : `At most ${MAX_DECKS_PER_ACCOUNT} decks`}
                        onClick={() => select(newDraft())}
                    >
                        + New deck
                    </button>
                </li>
            </ul>

            <div className="deck-form">
                <label>
                    Name{' '}
                    <input
                        className="menu-input"
                        data-testid="deck-name"
                        value={draft.name}
                        maxLength={MAX_DECK_NAME_LENGTH}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                </label>

                <table className="deck-table">
                    <thead>
                        <tr>
                            <th scope="col">Stance</th>
                            {Array.from({ length: MAX_SEQUENCE_LENGTH }, (_, index) => (
                                <th scope="col" key={index}>Attack {index + 1}</th>
                            ))}
                            <th scope="col">Alternate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {STANCES.map((stance) => (
                            <StanceRow key={stance} deck={draft.deck} stance={stance} onChange={(deck) => setDraft({ ...draft, deck })} />
                        ))}
                    </tbody>
                </table>
                <p className="menu-hint">
                    Each attack must start in the stance the one before it ended in, and a move can be used only once.
                    The ✓ marks the deck you fight with.
                </p>

                <div className="menu-actions">
                    <button
                        className="menu-button"
                        data-testid="deck-save"
                        disabled={busy || !isChanged || name.length === 0 || ruleProblems.length > 0}
                        onClick={save}
                    >
                        {saved ? 'Save changes' : 'Save deck'}
                    </button>
                    <button
                        className="menu-button"
                        data-testid="deck-activate"
                        disabled={busy || !saved || saved.isActive || isChanged}
                        onClick={activate}
                    >
                        Fight with this deck
                    </button>
                    <button className="menu-button" data-testid="deck-delete" disabled={busy || !saved} onClick={remove}>
                        Delete
                    </button>
                </div>

                <div className="menu-message" data-testid="deck-message" role="status">{message}</div>
                {[...ruleProblems, ...problems].map((problem) => (
                    <div className="menu-problem" key={problem}>{problem}</div>
                ))}
            </div>
        </div>
    );
}
