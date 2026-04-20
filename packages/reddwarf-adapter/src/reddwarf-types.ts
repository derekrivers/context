/*
 * VENDORED from RedDwarf's @reddwarf/contracts package.
 *
 * Source:  github.com/derekrivers/RedDwarf
 * Package: @reddwarf/contracts@0.1.0
 * Commit:  9648d893a55b5a310b913a09e011282ae25057b8
 * File:    packages/contracts/src/planning.ts
 *
 * Any change to the contents below that is not a direct import from
 * that source commit is a drift hazard. The adapter validates its
 * output against `projectSpecSchema` below; structural drift in this
 * file fails at module load time via a sha-256 hash check (see
 * ./schema-integrity.ts). If RedDwarf bumps the schema, re-vendor
 * this file and update ADAPTER_TARGET_* constants in ./version.ts.
 */

import { z } from 'zod'

// --- enums (subset used by projectSpec and ticketSpec) ---

export const projectSizes = ['small', 'medium', 'large'] as const
export const projectStatuses = [
  'draft',
  'clarification_pending',
  'pending_approval',
  'approved',
  'executing',
  'complete',
  'failed',
] as const
export const ticketStatuses = [
  'pending',
  'dispatched',
  'in_progress',
  'pr_open',
  'merged',
  'failed',
] as const
export const riskClasses = ['low', 'medium', 'high'] as const

export const projectSizeSchema = z.enum(projectSizes)
export const projectStatusSchema = z.enum(projectStatuses)
export const ticketStatusSchema = z.enum(ticketStatuses)
export const riskClassSchema = z.enum(riskClasses)

export type ProjectSize = z.infer<typeof projectSizeSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type RiskClass = z.infer<typeof riskClassSchema>

// --- utility schemas ---

const isoDateTimeSchema = z.string().datetime({ offset: true })

// --- complexityClassification (subset) ---

export const complexityClassificationSchema = z.object({
  size: projectSizeSchema,
  reasoning: z.string().min(1),
  signals: z.array(z.string().min(1)),
})
export type ComplexityClassification = z.infer<typeof complexityClassificationSchema>

// --- ticketSpec (adapter does not emit these, but types are used) ---

export const ticketSpecSchema = z.object({
  ticketId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)),
  dependsOn: z.array(z.string().min(1)).default([]),
  status: ticketStatusSchema,
  complexityClass: riskClassSchema,
  riskClass: riskClassSchema,
  githubSubIssueNumber: z.number().int().positive().nullable().default(null),
  githubPrNumber: z.number().int().positive().nullable().default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type TicketSpec = z.infer<typeof ticketSpecSchema>

// --- projectSpec ---

export const projectSpecSchema = z.object({
  projectId: z.string().min(1),
  sourceIssueId: z.string().min(1).nullable().default(null),
  sourceRepo: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(20),
  projectSize: projectSizeSchema,
  status: projectStatusSchema,
  complexityClassification: complexityClassificationSchema.nullable().default(null),
  approvalDecision: z.string().min(1).nullable().default(null),
  decidedBy: z.string().min(1).nullable().default(null),
  decisionSummary: z.string().min(1).nullable().default(null),
  amendments: z.string().min(1).nullable().default(null),
  clarificationQuestions: z.array(z.string().min(1)).nullable().default(null),
  clarificationAnswers: z.record(z.string(), z.string()).nullable().default(null),
  clarificationRequestedAt: isoDateTimeSchema.nullable().default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type ProjectSpec = z.infer<typeof projectSpecSchema>
