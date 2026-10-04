import { useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_DISPLAY_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@flowing-fist/protocol';
import type { AccountInfo } from '@flowing-fist/protocol';
import { accountStore } from '../account/accountStore';
import { ApiError } from '../api/apiClient';

type Form = 'none' | 'register' | 'login';

export function AccountPanel({ account }: { account: AccountInfo }) {
    const [form, setForm] = useState<Form>('none');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const show = (next: Form) => {
        setForm(next);
        setError('');
        setPassword('');
    };

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError('');

        try {
            await action();
            show('none');
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        run(() => form === 'register'
            ? accountStore.register({ email, password, displayName })
            : accountStore.logIn({ email, password }));
    };

    return (
        <div className="account-panel">
            <div className="menu-actions">
                <span data-testid="account-name">
                    Playing as <b>{account.displayName}</b>{account.isGuest ? ' (guest)' : ` · ${account.email}`}
                </span>
                {account.isGuest && form === 'none' && (
                    <>
                        <button className="menu-button" data-testid="account-register" onClick={() => show('register')}>
                            Create account
                        </button>
                        <button className="menu-button" data-testid="account-login" onClick={() => show('login')}>Log in</button>
                    </>
                )}
                {!account.isGuest && (
                    <button className="menu-button" data-testid="account-logout" disabled={busy} onClick={() => run(() => accountStore.logOut())}>
                        Log out
                    </button>
                )}
            </div>

            {account.isGuest && form === 'none' && (
                <p className="menu-hint">
                    A guest's decks are kept only in this browser. Create an account to keep them and use them anywhere.
                </p>
            )}

            {form !== 'none' && (
                <form className="account-form" onSubmit={submit}>
                    <label>
                        Email
                        <input
                            className="menu-input"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </label>
                    <label>
                        Password
                        <input
                            className="menu-input"
                            type="password"
                            autoComplete={form === 'register' ? 'new-password' : 'current-password'}
                            required
                            minLength={form === 'register' ? MIN_PASSWORD_LENGTH : undefined}
                            maxLength={MAX_PASSWORD_LENGTH}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </label>
                    {form === 'register' && (
                        <label>
                            Display name
                            <input
                                className="menu-input"
                                autoComplete="nickname"
                                required
                                maxLength={MAX_DISPLAY_NAME_LENGTH}
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                            />
                        </label>
                    )}
                    <div className="menu-actions">
                        <button className="menu-button" type="submit" data-testid="account-submit" disabled={busy}>
                            {form === 'register' ? 'Create account' : 'Log in'}
                        </button>
                        <button className="menu-button" type="button" onClick={() => show('none')}>Cancel</button>
                    </div>
                    {form === 'register' && <p className="menu-hint">Your current decks move to the new account.</p>}
                    {form === 'login' && <p className="menu-hint">Logging in leaves this guest and its decks behind.</p>}
                </form>
            )}

            {error && <div className="menu-problem" role="alert">{error}</div>}
        </div>
    );
}
