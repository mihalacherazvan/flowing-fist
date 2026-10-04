import type { AddressInfo } from 'node:net';
import { API_PREFIX } from '@flowing-fist/protocol';
import type { AuthResponse } from '@flowing-fist/protocol';
import express from 'express';
import { config } from '../config';
import { openDatabase } from '../db/database';
import type { Database } from '../db/database';
import { decks, users } from '../db/schema';
import { createApi } from '../http/api';

export interface TestServer {
    db: Database;
    /** Send a JSON request to the API and read the JSON answer */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read whatever the API answered
    request(method: string, path: string, options?: { token?: string; body?: unknown }): Promise<{ status: number; body: any }>;
    createGuest(): Promise<AuthResponse>;
    /** Remove every account and deck */
    reset(): Promise<void>;
    close(): Promise<void>;
}

/**
 * The real API on a spare port, backed by the test database
 */
export async function startTestServer(): Promise<TestServer> {
    const database = await openDatabase(config.databaseUrl);
    const app = express();
    app.use(API_PREFIX, createApi(database.db));

    const listener = app.listen(0);
    await new Promise((resolve) => listener.once('listening', resolve));
    const baseUrl = `http://localhost:${(listener.address() as AddressInfo).port}${API_PREFIX}`;

    const request: TestServer['request'] = async (method, path, options = {}) => {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
            },
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        });
        const text = await response.text();

        return { status: response.status, body: text ? JSON.parse(text) : null };
    };

    return {
        db: database.db,
        request,
        createGuest: async () => (await request('POST', '/auth/guest')).body,
        reset: async () => {
            await database.db.delete(decks);
            await database.db.delete(users);
        },
        close: async () => {
            await new Promise((resolve) => listener.close(resolve));
            await database.close();
        }
    };
}
