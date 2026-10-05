import type { CombatDeck } from '@flowing-fist/content';
import type { DuelKind, MatchEndReason, MatchOutcome } from '@flowing-fist/protocol';
import { boolean, index, int, json, mysqlTable, primaryKey, timestamp, varchar } from 'drizzle-orm/mysql-core';

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

/** One row per account that has played a ranked match; an account without one has the starting rating */
export const ratings = mysqlTable('ratings', {
    userId: varchar('user_id', { length: 36 }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    rating: int('rating').notNull(),
    games: int('games').notNull().default(0),
    wins: int('wins').notNull().default(0),
    losses: int('losses').notNull().default(0),
    draws: int('draws').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow()
});

/** One finished match; created_at is when it ended */
export const matches = mysqlTable('matches', {
    id: varchar('id', { length: 36 }).primaryKey(),
    kind: varchar('kind', { length: 16 }).$type<DuelKind>().notNull(),
    reason: varchar('reason', { length: 16 }).$type<MatchEndReason>().notNull(),
    /** Rounds started */
    rounds: int('rounds').notNull(),
    durationTicks: int('duration_ticks').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => [
    index('matches_created_at_index').on(table.createdAt)
]);

export const matchPlayers = mysqlTable('match_players', {
    matchId: varchar('match_id', { length: 36 }).notNull().references(() => matches.id, { onDelete: 'cascade' }),
    slot: int('slot').notNull(),
    /** Emptied if the account is deleted, so the opponent keeps their history */
    userId: varchar('user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
    /** The name the player fought under */
    displayName: varchar('display_name', { length: 24 }).notNull(),
    roundsWon: int('rounds_won').notNull(),
    outcome: varchar('outcome', { length: 8 }).$type<MatchOutcome>().notNull(),
    /** Both null in a match that did not count towards the rating */
    ratingBefore: int('rating_before'),
    ratingAfter: int('rating_after')
}, (table) => [
    primaryKey({ columns: [table.matchId, table.slot] }),
    index('match_players_user_id_index').on(table.userId)
]);

export type UserRow = typeof users.$inferSelect;
export type DeckRow = typeof decks.$inferSelect;
