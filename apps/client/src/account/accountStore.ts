import { DEFAULT_DECK, parseDeck, validateDeck } from '@flowing-fist/content';
import type { CombatDeck } from '@flowing-fist/content';
import type { AccountInfo, AuthResponse, DeckRequest, LoginRequest, RegisterRequest, SavedDeck } from '@flowing-fist/protocol';
import { ApiError, NETWORK_ERROR_STATUS, api } from '../api/apiClient';

const TOKEN_KEY = 'flowing-fist.token';
const ACTIVE_DECK_KEY = 'flowing-fist.active-deck';

export interface AccountState {
    /** offline: the server could not be reached, so only the remembered deck is available */
    status: 'connecting' | 'online' | 'offline';
    account: AccountInfo | null;
    decks: SavedDeck[];
    /** The deck fights are played with: the account's active deck, or the default one */
    activeDeck: CombatDeck;
}

type Listener = () => void;

/**
 * The deck last known to be active, so that training works with it before the
 * server has answered, and when it cannot be reached at all
 */
function readRememberedDeck(): CombatDeck {
    try {
        const deck = parseDeck(JSON.parse(localStorage.getItem(ACTIVE_DECK_KEY) ?? 'null'));

        return deck && validateDeck(deck).length === 0 ? deck : DEFAULT_DECK;
    } catch {
        return DEFAULT_DECK;
    }
}

/**
 * Who the player is and which decks they own. Everything the UI and the game
 * know about the account comes from here; this is the only caller of the API.
 */
class AccountStore {
    private state: AccountState = { status: 'connecting', account: null, decks: [], activeDeck: readRememberedDeck() };
    private token: string | null = localStorage.getItem(TOKEN_KEY);
    private listeners: Set<Listener> = new Set();
    private connecting: Promise<void> | null = null;

    public subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    public getState = (): AccountState => this.state;

    public getToken(): string | null {
        return this.token;
    }

    private setState(changes: Partial<AccountState>): void {
        this.state = { ...this.state, ...changes };
        this.listeners.forEach((listener) => listener());
    }

    private setDecks(decks: SavedDeck[]): void {
        const activeDeck = decks.find((deck) => deck.isActive)?.deck ?? DEFAULT_DECK;
        localStorage.setItem(ACTIVE_DECK_KEY, JSON.stringify(activeDeck));

        // Keep the same object while the content is unchanged, so listeners can tell when it really changed
        const isUnchanged = JSON.stringify(activeDeck) === JSON.stringify(this.state.activeDeck);
        this.setState({ decks, activeDeck: isUnchanged ? this.state.activeDeck : activeDeck });
    }

    private async signIn(response: AuthResponse): Promise<void> {
        this.token = response.token;
        localStorage.setItem(TOKEN_KEY, response.token);

        this.setState({ status: 'online', account: response.account });
        this.setDecks(await api.listDecks(response.token));
    }

    /**
     * Sign in with the remembered token, or as a new guest. Safe to call again
     * at any time; it only does something when not online.
     */
    public connect(): Promise<void> {
        if (this.state.status === 'online') return Promise.resolve();

        this.connecting ??= this.runConnect().finally(() => {
            this.connecting = null;
        });

        return this.connecting;
    }

    private async runConnect(): Promise<void> {
        this.setState({ status: 'connecting' });

        try {
            if (this.token) {
                try {
                    const account = await api.getAccount(this.token);
                    await this.signIn({ token: this.token, account });

                    return;
                } catch (error) {
                    // A token the server no longer accepts is replaced by a new guest
                    if (!(error instanceof ApiError) || error.status !== 401) throw error;
                }
            }

            await this.signIn(await api.createGuest());
        } catch (error) {
            if (!(error instanceof ApiError) || error.status !== NETWORK_ERROR_STATUS) console.error(error);
            this.setState({ status: 'offline' });
        }
    }

    private requireToken(): string {
        if (!this.token || this.state.status !== 'online') throw new ApiError(NETWORK_ERROR_STATUS, 'Not connected to the server');

        return this.token;
    }

    public async register(details: RegisterRequest): Promise<void> {
        // A guest's token goes along, so that the guest and its decks become the registered account
        await this.signIn(await api.register(this.state.account?.isGuest ? this.token : null, details));
    }

    public async logIn(details: LoginRequest): Promise<void> {
        await this.signIn(await api.logIn(details));
    }

    /**
     * Leave the account; the player carries on as a new guest
     */
    public async logOut(): Promise<void> {
        await this.signIn(await api.createGuest());
    }

    /**
     * @param deckId the deck to overwrite, or null to add a new one
     */
    public async saveDeck(deckId: string | null, deck: DeckRequest): Promise<SavedDeck> {
        const token = this.requireToken();
        const saved = deckId ? await api.updateDeck(token, deckId, deck) : await api.createDeck(token, deck);
        this.setDecks(await api.listDecks(token));

        return saved;
    }

    public async deleteDeck(deckId: string): Promise<void> {
        const token = this.requireToken();
        await api.deleteDeck(token, deckId);
        this.setDecks(await api.listDecks(token));
    }

    public async activateDeck(deckId: string): Promise<void> {
        this.setDecks(await api.activateDeck(this.requireToken(), deckId));
    }
}

export const accountStore = new AccountStore();
