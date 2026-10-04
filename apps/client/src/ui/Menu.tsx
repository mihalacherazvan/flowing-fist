import { useSyncExternalStore } from 'react';
import { accountStore } from '../account/accountStore';
import { getServerUrl } from '../api/apiClient';
import { AccountPanel } from './AccountPanel';
import { DeckEditor } from './DeckEditor';
import { menuStore } from './menuStore';

/**
 * The deck editor and the account, shown over the game
 */
export function Menu() {
    const isOpen = useSyncExternalStore(menuStore.subscribe, menuStore.isOpen);
    const account = useSyncExternalStore(accountStore.subscribe, accountStore.getState);

    if (!isOpen) return null;

    return (
        <div className="menu" data-testid="menu">
            <div className="menu-header">
                <h1>Decks and account</h1>
                <button className="menu-button" data-testid="menu-close" onClick={() => menuStore.setOpen(false)}>Close (Esc)</button>
            </div>

            {account.status === 'online' && account.account ? (
                <>
                    <AccountPanel account={account.account} />
                    {/* A different account has different decks, so the editor starts over */}
                    <DeckEditor key={account.account.id} account={account} />
                </>
            ) : account.status === 'connecting' ? (
                <p>Connecting to the server…</p>
            ) : (
                <>
                    <p className="menu-problem">
                        Could not reach the server at {getServerUrl()}. Decks and accounts need it; training carries on
                        with the deck you last used.
                    </p>
                    <div className="menu-actions">
                        <button className="menu-button" onClick={() => accountStore.connect()}>Try again</button>
                    </div>
                </>
            )}
        </div>
    );
}
