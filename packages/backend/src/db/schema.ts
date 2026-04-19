import {
  bigserial,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const contextSchema = pgSchema('context')

export const users = contextSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  name: text('name'),
  role: text('role', { enum: ['editor', 'viewer'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenRotatedAt: timestamp('token_rotated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const specs = contextSchema.table('specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  status: text('status', { enum: ['draft', 'ready', 'sent', 'archived'] })
    .notNull()
    .default('draft'),
  schemaVersion: text('schema_version').notNull(),
  specJson: jsonb('spec_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
  lockExpiresAt: timestamp('lock_expires_at', { withTimezone: true }),
})

export const specHistory = contextSchema.table('spec_history', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  specId: uuid('spec_id')
    .notNull()
    .references(() => specs.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  diff: jsonb('diff').notNull(),
  specJsonAfter: jsonb('spec_json_after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversationTurns = contextSchema.table(
  'conversation_turns',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    specId: uuid('spec_id')
      .notNull()
      .references(() => specs.id, { onDelete: 'cascade' }),
    turnNumber: integer('turn_number').notNull(),
    targetField: text('target_field').notNull(),
    question: text('question'),
    userAnswer: text('user_answer'),
    fieldUpdate: jsonb('field_update'),
    modelId: text('model_id'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    stateSnapshot: jsonb('state_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    specTurnUnique: unique('conversation_turns_spec_turn_unique').on(t.specId, t.turnNumber),
  }),
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Spec = typeof specs.$inferSelect
export type NewSpec = typeof specs.$inferInsert
export type SpecHistoryRow = typeof specHistory.$inferSelect
export type NewSpecHistoryRow = typeof specHistory.$inferInsert
export type ConversationTurn = typeof conversationTurns.$inferSelect
export type NewConversationTurn = typeof conversationTurns.$inferInsert
