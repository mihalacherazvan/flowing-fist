import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/mysql2';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createConnection, createPool } from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import * as schema from './schema';

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export type Database = MySql2Database<typeof schema>;

export interface DatabaseHandle {
    db: Database;
    close(): Promise<void>;
}

/**
 * Create the database named in the URL if the server does not have it yet,
 * so a new development or test database needs no manual step
 */
async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
    const url = new URL(databaseUrl);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (!/^[A-Za-z0-9_]+$/.test(databaseName)) throw new Error(`Unusable database name "${databaseName}"`);

    url.pathname = '/';
    const connection = await createConnection(url.toString());
    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4`);
    } finally {
        await connection.end();
    }
}

/**
 * Connect and bring the schema up to date
 */
export async function openDatabase(databaseUrl: string): Promise<DatabaseHandle> {
    await ensureDatabaseExists(databaseUrl);

    const pool: Pool = createPool(databaseUrl);
    const db = drizzle(pool, { schema, mode: 'default' });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    return { db, close: () => pool.end() };
}
