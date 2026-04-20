import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CanonicalSpecSchema, SpecStatusSchema } from '@context/spec-schema'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'

export function authoringKeys(specId: string) {
  return {
    spec: ['specs', specId] as const,
    turns: ['specs', specId, 'turns'] as const,
    turnsRecent: (recent: number) => ['specs', specId, 'turns', { recent }] as const,
    completeness: ['specs', specId, 'completeness'] as const,
    unresolved: ['specs', specId, 'unresolved'] as const,
    lock: ['specs', specId, 'lock'] as const,
    shares: ['specs', specId, 'shares'] as const,
  }
}

const SpecDetailSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  title: z.string(),
  status: SpecStatusSchema,
  schema_version: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  locked_by: z.string().uuid().nullable(),
  lock_expires_at: z.string().nullable(),
  spec: CanonicalSpecSchema,
  access: z.enum(['owner', 'editor', 'viewer']).optional(),
})
export type SpecDetail = z.infer<typeof SpecDetailSchema>

const LockStateSchema = z.object({
  spec_id: z.string().uuid(),
  locked_by: z.string().uuid().nullable(),
  lock_expires_at: z.string().nullable(),
  held_by_caller: z.boolean(),
  holder: z
    .object({ id: z.string().uuid(), name: z.string().nullable() })
    .nullable(),
})
export type LockState = z.infer<typeof LockStateSchema>

const LockAcquiredSchema = z.object({
  spec_id: z.string().uuid(),
  locked_by: z.string().uuid(),
  lock_expires_at: z.string().nullable(),
  lock_ttl_ms: z.number(),
})

const TurnPhaseSchema = z.enum([
  'selection',
  'answer',
  'clarification',
  'skip',
  'unskip',
  'direct_edit',
  'retry_request',
])
export type TurnPhase = z.infer<typeof TurnPhaseSchema>

const TurnRowSchema = z.object({
  id: z.string().uuid(),
  spec_id: z.string().uuid(),
  turn_index: z.number(),
  created_at: z.string(),
  phase: TurnPhaseSchema,
  target_path: z.string().nullable(),
  target_section: z.string().nullable(),
  selection_reason: z.unknown().nullable(),
  outcome: z.string().nullable(),
  llm_model_id: z.string().nullable(),
  llm_tokens_in: z.number().nullable(),
  llm_tokens_out: z.number().nullable(),
  question_text: z.string().nullable().optional(),
  user_text: z.string().nullable().optional(),
})
export type TurnRow = z.infer<typeof TurnRowSchema>

const TurnListSchema = z.object({ turns: z.array(TurnRowSchema) })

const SharesListSchema = z.object({
  shares: z.array(
    z.object({
      user_id: z.string().uuid(),
      user_display: z.string(),
      role: z.enum(['viewer', 'editor']),
      granted_at: z.string(),
      granted_by: z.string().uuid(),
    }),
  ),
})

export type NextTurnResponse =
  | {
      kind: 'selection'
      turn_id: string
      turn_index: number
      target_field: { path: string; section: string; importance: string; schemaRef: string }
      context: unknown
      reason: { kind: string; previousTurnId?: string; previousSkipTurnId?: string }
    }
  | { kind: 'turn_cap_reached'; turn_count: number; limit: number }
  | { kind: 'token_cap_reached'; token_count: number; limit: number }

const NextTurnSchema = z.union([
  z.object({
    kind: z.literal('selection'),
    turn_id: z.string().uuid(),
    turn_index: z.number(),
    target_field: z.object({
      path: z.string(),
      section: z.string(),
      importance: z.string(),
      schemaRef: z.string(),
    }),
    context: z.unknown(),
    reason: z.object({
      kind: z.string(),
      previousTurnId: z.string().optional(),
      previousSkipTurnId: z.string().optional(),
    }),
  }),
  z.object({
    kind: z.literal('turn_cap_reached'),
    turn_count: z.number(),
    limit: z.number(),
  }),
  z.object({
    kind: z.literal('token_cap_reached'),
    token_count: z.number(),
    limit: z.number(),
  }),
])

const AnswerResponseSchema = z.union([
  z.object({
    kind: z.literal('update'),
    updates: z.array(
      z.object({
        path: z.string(),
        value: z.unknown().optional(),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
    ),
    tokens_in: z.number(),
    tokens_out: z.number(),
    model_id: z.string(),
  }),
  z.object({
    kind: z.literal('clarification'),
    question: z.string(),
    reason: z.enum([
      'ambiguous',
      'multiple_interpretations',
      'contradicts_existing_spec',
      'insufficient_detail',
    ]),
    tokens_in: z.number(),
    tokens_out: z.number(),
    model_id: z.string(),
    apply_failures: z.array(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('skip'),
    tokens_in: z.number(),
    tokens_out: z.number(),
    model_id: z.string(),
  }),
  z.object({
    kind: z.literal('unknown'),
    reason: z.string(),
    tokens_in: z.number(),
    tokens_out: z.number(),
    model_id: z.string(),
  }),
])
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>

const PhraseResponseSchema = z.object({
  text: z.string(),
  tokens_in: z.number(),
  tokens_out: z.number(),
  model_id: z.string(),
})
export type PhraseResponse = z.infer<typeof PhraseResponseSchema>

export function useSpecDetail(specId: string) {
  return useQuery({
    queryKey: authoringKeys(specId).spec,
    queryFn: () => apiGet(`/specs/${specId}`, SpecDetailSchema),
    enabled: specId.length > 0,
  })
}

export function useTurns(specId: string) {
  return useQuery({
    queryKey: authoringKeys(specId).turns,
    queryFn: () => apiGet(`/specs/${specId}/turns`, TurnListSchema),
    enabled: specId.length > 0,
  })
}

export function useLockState(specId: string, pollIntervalMs = 30_000) {
  return useQuery({
    queryKey: authoringKeys(specId).lock,
    queryFn: () => apiGet(`/specs/${specId}/lock`, LockStateSchema),
    refetchInterval: pollIntervalMs,
    enabled: specId.length > 0,
  })
}

export function useShares(specId: string, enabled: boolean) {
  return useQuery({
    queryKey: authoringKeys(specId).shares,
    queryFn: () => apiGet(`/specs/${specId}/shares`, SharesListSchema),
    enabled,
  })
}

export function useAcquireLock(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost(`/specs/${specId}/lock`, {}, LockAcquiredSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).lock })
    },
  })
}

export function useReleaseLock(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete(`/specs/${specId}/lock`, z.unknown()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).lock })
    },
  })
}

export function usePatchSpec(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { title?: string; spec?: unknown; status?: string }) =>
      apiPatch(`/specs/${specId}`, body, SpecDetailSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).spec })
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).completeness })
    },
  })
}

export function useNextTurn(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiPost(`/specs/${specId}/turns/next`, {}, NextTurnSchema).catch((err: unknown) => {
        if ((err as { status?: number }).status === 204) return null
        throw err
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).turns })
    },
  })
}

export function usePhraseTurn(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (turnId: string) =>
      apiPost(`/specs/${specId}/turns/${turnId}/phrase`, {}, PhraseResponseSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).turns })
    },
  })
}

export function useAnswerTurn(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { turnId: string; userText: string }) =>
      apiPost(
        `/specs/${specId}/turns/answer`,
        { turn_id: vars.turnId, user_text: vars.userText },
        AnswerResponseSchema,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).turns })
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).spec })
    },
  })
}

export function useSkipTurn(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (turnId: string) =>
      apiPost(`/specs/${specId}/turns/${turnId}/skip`, {}, z.unknown()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).turns })
    },
  })
}

export function useUnskipTurn(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) =>
      apiPost(`/specs/${specId}/turns/unskip`, { path }, z.unknown()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).turns })
    },
  })
}

const UnresolvedEntrySchema = z.object({
  path: z.string(),
  section: z.string().nullable(),
  last_asked_at: z.string(),
  last_question: z.string().nullable(),
  reason: z.enum(['retry_budget_exhausted', 'user_marked_unanswerable']),
  retries_attempted: z.number(),
})
export type UnresolvedEntry = z.infer<typeof UnresolvedEntrySchema>

const UnresolvedListSchema = z.object({
  entries: z.array(UnresolvedEntrySchema),
})

export function useUnresolved(specId: string) {
  return useQuery({
    queryKey: authoringKeys(specId).unresolved,
    queryFn: () => apiGet(`/specs/${specId}/unresolved`, UnresolvedListSchema),
    enabled: specId.length > 0,
  })
}

export function useRetryField(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) =>
      apiPost(
        `/specs/${specId}/fields/retry`,
        { path },
        z.object({ path: z.string(), retry_cleared: z.boolean() }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).unresolved })
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).turns })
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).spec })
    },
  })
}

export function useMarkUnanswerable(specId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { path: string; reason?: string; currentSpec: unknown }) => {
      const spec = vars.currentSpec as {
        provenance: { unresolved_questions: Array<{ id: string; path: string; reason: string; state: string; created_at: string }> }
      }
      const now = new Date().toISOString()
      const existing = spec.provenance.unresolved_questions.filter((q) => q.path !== vars.path)
      const next = {
        ...spec,
        provenance: {
          ...spec.provenance,
          unresolved_questions: [
            ...existing,
            {
              id: `q_mu_${Date.now()}`,
              path: vars.path,
              reason: vars.reason ?? 'user marked as unanswerable',
              state: 'unanswerable',
              created_at: now,
            },
          ],
        },
        updated_at: now,
      }
      return apiPatch(`/specs/${specId}`, { spec: next }, SpecDetailSchema)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).unresolved })
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).spec })
      void qc.invalidateQueries({ queryKey: authoringKeys(specId).completeness })
    },
  })
}
