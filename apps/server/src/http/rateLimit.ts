import type { RequestHandler } from 'express';
import { HttpError } from './HttpError';

const WINDOW_MS = 60_000;

/**
 * Refuse an address that makes more than `limit` requests within a minute.
 * Counts are held in memory, which is enough while there is one server process.
 */
export function rateLimit(limit: number): RequestHandler {
    const counts = new Map<string, number>();
    let windowStartedAt = Date.now();

    return (request, _response, next) => {
        const now = Date.now();
        if (now - windowStartedAt >= WINDOW_MS) {
            counts.clear();
            windowStartedAt = now;
        }

        const address = request.ip ?? 'unknown';
        const count = (counts.get(address) ?? 0) + 1;
        counts.set(address, count);

        next(count > limit ? new HttpError(429, 'Too many attempts, try again in a minute') : undefined);
    };
}
