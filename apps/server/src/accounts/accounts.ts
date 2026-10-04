import { randomInt, randomUUID } from 'node:crypto';
import { MAX_DISPLAY_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@flowing-fist/protocol';
import type { AccountInfo } from '@flowing-fist/protocol';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../auth/passwords';
import type { Database } from '../db/database';
import { users } from '../db/schema';
import type { UserRow } from '../db/schema';
import { HttpError } from '../http/HttpError';

const MAX_EMAIL_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_ENTRY_ERROR = 'ER_DUP_ENTRY';

export function toAccountInfo(user: UserRow): AccountInfo {
    return { id: user.id, displayName: user.displayName, email: user.email, isGuest: user.email === null };
}

function readEmail(value: unknown): string {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) throw new HttpError(422, 'Enter a valid email address');

    return email;
}

function readNewPassword(value: unknown): string {
    if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
        throw new HttpError(422, `The password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long`);
    }

    return value;
}

function readDisplayName(value: unknown): string {
    const displayName = typeof value === 'string' ? value.trim() : '';
    if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        throw new HttpError(422, `The display name must be 1 to ${MAX_DISPLAY_NAME_LENGTH} characters long`);
    }

    return displayName;
}

function isDuplicateEntry(error: unknown): boolean {
    // Drizzle wraps the driver's error, which carries the code
    const codes = [error, (error as { cause?: unknown } | null)?.cause].map((candidate) => (candidate as { code?: unknown } | null)?.code);

    return codes.includes(DUPLICATE_ENTRY_ERROR);
}

export async function findUser(db: Database, userId: string): Promise<UserRow | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    return user ?? null;
}

/**
 * A guest is a full account without an email: it can save decks and fight,
 * but only from the browser that holds its token
 */
export async function createGuest(db: Database): Promise<UserRow> {
    const id = randomUUID();
    await db.insert(users).values({ id, displayName: `Guest-${randomInt(1000, 10000)}` });

    return (await findUser(db, id))!;
}

/**
 * Give an account an email and password. When a guest is signed in, that guest
 * becomes the registered account and keeps its decks.
 */
export async function registerAccount(db: Database, guest: UserRow | null, body: Record<string, unknown>): Promise<UserRow> {
    const email = readEmail(body.email);
    const password = readNewPassword(body.password);
    const displayName = readDisplayName(body.displayName);
    const passwordHash = await hashPassword(password);

    if (guest && guest.email !== null) throw new HttpError(409, 'You are already signed in to a registered account');

    const id = guest?.id ?? randomUUID();
    try {
        if (guest) {
            await db.update(users).set({ email, passwordHash, displayName }).where(eq(users.id, id));
        } else {
            await db.insert(users).values({ id, email, passwordHash, displayName });
        }
    } catch (error) {
        if (isDuplicateEntry(error)) throw new HttpError(409, 'That email address is already registered');
        throw error;
    }

    return (await findUser(db, id))!;
}

export async function logIn(db: Database, body: Record<string, unknown>): Promise<UserRow> {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const [user] = email.length <= MAX_EMAIL_LENGTH && password.length <= MAX_PASSWORD_LENGTH
        ? await db.select().from(users).where(eq(users.email, email)).limit(1)
        : [];

    // The same answer whether the email or the password was wrong, so neither can be probed
    if (!user?.passwordHash || !await verifyPassword(password, user.passwordHash)) {
        throw new HttpError(401, 'Wrong email address or password');
    }

    return user;
}
