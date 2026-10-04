import { API_PREFIX, DEFAULT_SERVER_PORT } from '@flowing-fist/protocol';
import type {
    AccountInfo,
    ApiErrorResponse,
    AuthResponse,
    DeckRequest,
    LoginRequest,
    RegisterRequest,
    SavedDeck
} from '@flowing-fist/protocol';

/** Status used when the server could not be reached at all */
export const NETWORK_ERROR_STATUS = 0;

export class ApiError extends Error {
    constructor(public readonly status: number, message: string, public readonly details: string[] = []) {
        super(message);
    }
}

export function getServerUrl(): string {
    return import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:${DEFAULT_SERVER_PORT}`;
}

async function request<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${getServerUrl()}${API_PREFIX}${path}`, {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch {
        throw new ApiError(NETWORK_ERROR_STATUS, `Could not reach the server at ${getServerUrl()}`);
    }

    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const error = data as ApiErrorResponse | null;
        throw new ApiError(response.status, error?.error ?? `The server answered ${response.status}`, error?.details);
    }

    return data as T;
}

export const api = {
    createGuest: () => request<AuthResponse>('POST', '/auth/guest', null),
    /** With a guest's token the guest becomes the registered account */
    register: (token: string | null, details: RegisterRequest) => request<AuthResponse>('POST', '/auth/register', token, details),
    logIn: (details: LoginRequest) => request<AuthResponse>('POST', '/auth/login', null, details),
    getAccount: (token: string) => request<AccountInfo>('GET', '/me', token),
    listDecks: (token: string) => request<SavedDeck[]>('GET', '/decks', token),
    createDeck: (token: string, deck: DeckRequest) => request<SavedDeck>('POST', '/decks', token, deck),
    updateDeck: (token: string, deckId: string, deck: DeckRequest) => request<SavedDeck>('PUT', `/decks/${deckId}`, token, deck),
    deleteDeck: (token: string, deckId: string) => request<null>('DELETE', `/decks/${deckId}`, token),
    /** @returns every deck of the account, with the active flag moved */
    activateDeck: (token: string, deckId: string) => request<SavedDeck[]>('POST', `/decks/${deckId}/activate`, token)
};
