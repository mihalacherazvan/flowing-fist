import { useState } from 'react';
import type { FormEvent } from 'react';
import type { MatchSummary } from '@flowing-fist/protocol';
import type { AccountState } from '../account/accountStore';
import { hudStore } from './hudStore';
import type { DuelRequest } from './hudStore';
import { menuStore } from './menuStore';

const OUTCOME_LABELS = { win: 'Won', loss: 'Lost', draw: 'Drew' };

function formatRatingChange(change: number | null): string {
    if (change === null) return 'private';

    return `${change >= 0 ? '+' : '−'}${Math.abs(change)}`;
}

function MatchRow({ match }: { match: MatchSummary }) {
    return (
        <tr>
            <td>{new Date(match.playedAt).toLocaleString()}</td>
            <td className={`match-${match.outcome}`}>{OUTCOME_LABELS[match.outcome]}</td>
            <td>{match.roundsWon} – {match.roundsLost}{match.reason === 'forfeit' ? ' (forfeit)' : ''}</td>
            <td>{match.opponentName}</td>
            <td>{formatRatingChange(match.ratingChange)}</td>
        </tr>
    );
}

/**
 * Starting an online duel, and how the account has done in them so far
 */
export function PlayPanel({ account }: { account: AccountState }) {
    const [code, setCode] = useState('');
    const { profile, matches } = account;

    const play = (request: DuelRequest) => {
        menuStore.setOpen(false);
        hudStore.actions.startDuel(request);
    };

    const join = (event: FormEvent) => {
        event.preventDefault();
        play({ kind: 'private', code: code.trim().toUpperCase() });
    };

    return (
        <div className="play-panel">
            <div className="menu-actions">
                <button className="menu-button" data-testid="play-ranked" onClick={() => play({ kind: 'ranked' })}>
                    Find ranked match
                </button>
                <button className="menu-button" data-testid="play-private" onClick={() => play({ kind: 'private', code: null })}>
                    Create private duel
                </button>
                <form className="menu-actions play-join" onSubmit={join}>
                    <input
                        className="menu-input play-code"
                        data-testid="play-code"
                        placeholder="Code"
                        aria-label="Private duel code"
                        maxLength={12}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                    />
                    <button className="menu-button" type="submit" data-testid="play-join" disabled={code.trim().length === 0}>
                        Join private duel
                    </button>
                </form>
            </div>
            <p className="menu-hint">
                A ranked match is first to 3 rounds against an opponent of similar rating, and moves your rating.
                A private duel is the same match against whoever you give the code to, and does not.
            </p>

            {profile && (
                <p className="play-rating" data-testid="play-rating">
                    Rating <b>{profile.rating}</b> · {profile.games} ranked {profile.games === 1 ? 'match' : 'matches'}:
                    {' '}{profile.wins} won, {profile.losses} lost, {profile.draws} drawn
                </p>
            )}

            {matches.length > 0 && (
                <table className="match-table" data-testid="play-history">
                    <thead>
                        <tr>
                            <th scope="col">Played</th>
                            <th scope="col">Result</th>
                            <th scope="col">Rounds</th>
                            <th scope="col">Opponent</th>
                            <th scope="col">Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map((match) => <MatchRow key={match.id} match={match} />)}
                    </tbody>
                </table>
            )}
        </div>
    );
}
