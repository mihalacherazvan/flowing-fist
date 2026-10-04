import type { CombatDeck } from '@flowing-fist/content';
import { boolean, index, json, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
    id: varchar('id', { length: 36 }).primaryKey(),
    displayName: varchar('display_name', { length: 24 }).notNull(),
    /** Null while the account is a guest */
    email: varchar('email', { length: 255 }).unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow()
});

export const decks = mysqlTable('decks', {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 40 }).notNull(),
    /** Stored as given by the editor; checked against the deck rules in code, on save and again on use */
    slots: json('slots').$type<CombatDeck>().notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow()
}, (table) => [
    index('decks_user_id_index').on(table.userId)
]);

export type UserRow = typeof users.$inferSelect;
export type DeckRow = typeof decks.$inferSelect;
