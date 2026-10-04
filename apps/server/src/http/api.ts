import type { ApiErrorResponse, AuthResponse } from '@flowing-fist/protocol';
import express, { Router } from 'express';
import type { ErrorRequestHandler, Request } from 'express';
import { createGuest, findUser, logIn, registerAccount, toAccountInfo } from '../accounts/accounts';
import { createToken, verifyToken } from '../auth/tokens';
import { config } from '../config';
import type { Database } from '../db/database';
import type { UserRow } from '../db/schema';
import { activateDeck, createDeck, deleteDeck, listDecks, updateDeck } from '../decks/decks';
import { HttpError } from './HttpError';
import { rateLimit } from './rateLimit';

const MAX_BODY_SIZE = '16kb';

function readBody(request: Request): Record<string, unknown> {
    const body: unknown = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object');

    return body as Record<string, unknown>;
}

const reportError: ErrorRequestHandler = (error, _request, response, _next) => {
    // body-parser reports malformed or oversized JSON with its own status
    const status = error instanceof HttpError ? error.status : Number((error as { status?: unknown }).status) || 500;
    if (status >= 500) console.error(error);

    const body: ApiErrorResponse = status >= 500
        ? { error: 'Something went wrong on the server' }
        : { error: (error as Error).message, details: error instanceof HttpError ? error.details : undefined };
    response.status(status).json(body);
};

export function createApi(db: Database): Router {
    const router = Router();

    /** The account the request's bearer token belongs to, or null without a usable token */
    const findSignedInUser = async (request: Request): Promise<UserRow | null> => {
        const [scheme, token] = (request.headers.authorization ?? '').split(' ');
        if (scheme !== 'Bearer' || !token) return null;

        const userId = await verifyToken(token);

        return userId ? findUser(db, userId) : null;
    };

    const requireUser = async (request: Request): Promise<UserRow> => {
        const user = await findSignedInUser(request);
        if (!user) throw new HttpError(401, 'Sign in first');

        return user;
    };

    const toAuthResponse = async (user: UserRow): Promise<AuthResponse> => ({
        token: await createToken(user.id),
        account: toAccountInfo(user)
    });

    // Cross-origin headers are already added by Colyseus, for these routes as well as its own
    router.use(express.json({ limit: MAX_BODY_SIZE }));
    router.use('/auth', rateLimit(config.authRateLimitPerMinute));

    router.post('/auth/guest', async (_request, response) => {
        response.status(201).json(await toAuthResponse(await createGuest(db)));
    });

    router.post('/auth/register', async (request, response) => {
        const user = await registerAccount(db, await findSignedInUser(request), readBody(request));
        response.status(201).json(await toAuthResponse(user));
    });

    router.post('/auth/login', async (request, response) => {
        response.status(200).json(await toAuthResponse(await logIn(db, readBody(request))));
    });

    router.get('/me', async (request, response) => {
        response.status(200).json(toAccountInfo(await requireUser(request)));
    });

    router.get('/decks', async (request, response) => {
        const user = await requireUser(request);
        response.status(200).json(await listDecks(db, user.id));
    });

    router.post('/decks', async (request, response) => {
        const user = await requireUser(request);
        response.status(201).json(await createDeck(db, user.id, readBody(request)));
    });

    router.put('/decks/:deckId', async (request, response) => {
        const user = await requireUser(request);
        response.status(200).json(await updateDeck(db, user.id, request.params.deckId, readBody(request)));
    });

    router.delete('/decks/:deckId', async (request, response) => {
        const user = await requireUser(request);
        await deleteDeck(db, user.id, request.params.deckId);
        response.sendStatus(204);
    });

    router.post('/decks/:deckId/activate', async (request, response) => {
        const user = await requireUser(request);
        response.status(200).json(await activateDeck(db, user.id, request.params.deckId));
    });

    router.use((_request, _response, next) => next(new HttpError(404, 'Not found')));
    router.use(reportError);

    return router;
}
