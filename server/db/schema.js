import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auth0UserId: text('auth0_user_id').notNull(),
    displayName: varchar('display_name', { length: 80 }),
    profilePictureUrl: text('profile_picture_url'),
    theme: varchar('theme', { length: 10 }).default('light').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('users_auth0_user_id_idx').on(table.auth0UserId)],
)

export const games = pgTable('games', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  moderatorId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  joinPassword: varchar('join_password', { length: 120 }),
  totalPlayers: integer('total_players').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const gameMembers = pgTable(
  'game_members',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).default('member').notNull(),
    isAlive: boolean('is_alive').default(true).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.userId] })],
)

export const votes = pgTable(
  'votes',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    voterId: uuid('voter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetPlayerId: uuid('target_player_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.voterId] })],
)