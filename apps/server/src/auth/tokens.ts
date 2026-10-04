import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';

const ALGORITHM = 'HS256';
const LIFETIME = '30d';

const secret = new TextEncoder().encode(config.jwtSecret);

export function createToken(userId: string): Promise<string> {
    return new SignJWT({})
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(LIFETIME)
        .sign(secret);
}

/**
 * @returns the user id the token was issued to, or null if it is forged, damaged or expired
 */
export async function verifyToken(token: string): Promise<string | null> {
    try {
        const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });

        return payload.sub ?? null;
    } catch {
        return null;
    }
}
