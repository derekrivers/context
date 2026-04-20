import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { SpecStatusSchema, CanonicalSpecSchema } from '@context/spec-schema'
import { apiGet, apiPost } from '../lib/api.js'

const CompletenessSchema = z.object({
  overall: z.number(),
  by_section: z.record(z.string(), z.number()),
})

export const SpecSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: SpecStatusSchema,
  owner_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  access: z.enum(['owner', 'editor', 'viewer']),
  completeness: CompletenessSchema,
})
export type SpecSummary = z.infer<typeof SpecSummarySchema>

export const SpecListSchema = z.object({
  specs: z.array(SpecSummarySchema),
})

export const SpecDetailSchema = z.object({
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

export function specsQueryKey(): readonly string[] {
  return ['specs']
}

export function specQueryKey(id: string): readonly string[] {
  return ['specs', id]
}

export function useSpecs(): ReturnType<typeof useQuery<{ specs: SpecSummary[] }>> {
  return useQuery({
    queryKey: specsQueryKey(),
    queryFn: () => apiGet('/specs', SpecListSchema),
  })
}

export function useSpec(id: string): ReturnType<typeof useQuery<SpecDetail>> {
  return useQuery({
    queryKey: specQueryKey(id),
    queryFn: () => apiGet(`/specs/${id}`, SpecDetailSchema),
    enabled: id.length > 0,
  })
}

export function useCreateSpec(): ReturnType<
  typeof useMutation<SpecDetail, Error, { title: string }>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => apiPost('/specs', input, SpecDetailSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: specsQueryKey() })
    },
  })
}

const MeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  role: z.enum(['editor', 'viewer']),
  created_at: z.string(),
  token_rotated_at: z.string(),
})
export type Me = z.infer<typeof MeSchema>

export function useMe(): ReturnType<typeof useQuery<Me>> {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiGet('/users/me', MeSchema),
  })
}
