import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
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

export const specShares = contextSchema.table(
  'spec_shares',
  {
    specId: uuid('spec_id')
      .notNull()
      .references(() => specs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['viewer', 'editor'] }).notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.specId, t.userId] }),
    userIdx: index('spec_shares_user_id_idx').on(t.userId),
    roleCheck: check('spec_shares_role_check', sql`${t.role} IN ('viewer', 'editor')`),
  }),
)

export const conversationTurns = contextSchema.table(
  'conversation_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    specId: uuid('spec_id')
      .notNull()
      .references(() => specs.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    phase: text('phase', {
      enum: ['selection', 'answer', 'clarification', 'skip', 'unskip'],
    }).notNull(),
    targetPath: text('target_path'),
    targetSection: text('target_section'),
    selectionReason: jsonb('selection_reason'),
    specSnapshot: jsonb('spec_snapshot'),
    completenessSnapshot: jsonb('completeness_snapshot'),
    outcome: text('outcome'),
    llmModelId: text('llm_model_id'),
    llmTokensIn: integer('llm_tokens_in'),
    llmTokensOut: integer('llm_tokens_out'),
  },
  (t) => ({
    specTurnUnique: unique('conversation_turns_spec_turn_unique').on(t.specId, t.turnIndex),
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
export type SpecShare = typeof specShares.$inferSelect
export type NewSpecShare = typeof specShares.$inferInsert
