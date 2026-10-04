import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * @returns the salt and the derived key, in a form verifyPassword can read back
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await scryptAsync(password, salt, KEY_BYTES);

    return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    const [scheme, salt, key] = passwordHash.split('$');
    if (scheme !== 'scrypt' || !salt || !key) return false;

    const expectedKey = Buffer.from(key, 'base64');
    const actualKey = await scryptAsync(password, Buffer.from(salt, 'base64'), expectedKey.length);

    return timingSafeEqual(actualKey, expectedKey);
}
