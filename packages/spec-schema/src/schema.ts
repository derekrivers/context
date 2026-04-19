import { z } from 'zod'

export const SCHEMA_VERSION = '0.1' as const

const NonEmptyString = z.string().min(1)
const Slug = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/, 'must be lower_snake_case or kebab-case starting with a letter')

const NamespacedKey = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/,
    'must look like "<namespace>:<name>" with lowercase letters, digits, _ or -',
  )

export const SpecStatusSchema = z.enum(['draft', 'ready', 'sent', 'archived'])
export type SpecStatus = z.infer<typeof SpecStatusSchema>

export const UserPersonaSchema = z
  .object({
    id: Slug,
    persona: NonEmptyString,
    needs: z.string().optional(),
  })
  .strict()

export const IntentSchema = z
  .object({
    summary: z.string().optional(),
    problem: z.string().optional(),
    users: z.array(UserPersonaSchema).optional(),
    non_goals: z.array(NonEmptyString).optional(),
  })
  .strict()

export const EntityFieldSchema = z
  .object({
    name: Slug,
    type: NonEmptyString,
    required: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict()

export const EntitySchema = z
  .object({
    id: Slug,
    name: NonEmptyString,
    description: z.string().optional(),
    fields: z.array(EntityFieldSchema),
  })
  .strict()

export const RelationshipKindSchema = z.enum(['one_to_one', 'one_to_many', 'many_to_many'])
export type RelationshipKind = z.infer<typeof RelationshipKindSchema>

export const RelationshipSchema = z
  .object({
    id: Slug,
    from_entity: Slug,
    to_entity: Slug,
    kind: RelationshipKindSchema,
    description: z.string().optional(),
  })
  .strict()

export const DomainModelSchema = z
  .object({
    entities: z.array(EntitySchema),
    relationships: z.array(RelationshipSchema),
  })
  .strict()

export const AcceptanceCriterionSchema = z
  .object({
    id: Slug,
    given: NonEmptyString,
    when: NonEmptyString,
    then: NonEmptyString,
  })
  .strict()

export const CapabilitySchema = z
  .object({
    id: Slug,
    name: NonEmptyString,
    entity_ref: z.string().min(1),
    verb: NonEmptyString,
    description: z.string().optional(),
    acceptance_criteria: z.array(AcceptanceCriterionSchema),
  })
  .strict()

export const FlowStepSchema = z
  .object({
    actor: z.enum(['user', 'system']),
    action: NonEmptyString,
  })
  .strict()

export const FlowFailureModeSchema = z
  .object({
    when: NonEmptyString,
    behavior: NonEmptyString,
  })
  .strict()

export const FlowSchema = z
  .object({
    id: Slug,
    name: NonEmptyString,
    trigger: NonEmptyString,
    steps: z.array(FlowStepSchema),
    failure_modes: z.array(FlowFailureModeSchema),
  })
  .strict()

export const StackSchema = z
  .object({
    frontend: z.string().optional(),
    backend: z.string().optional(),
    database: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict()

export const ConstraintsSchema = z
  .object({
    platform: z.string().optional(),
    stack: StackSchema.optional(),
    auth: z.string().optional(),
    data_retention: z.string().optional(),
    performance: z.string().optional(),
    compliance: z.string().optional(),
    deploy_posture: z.string().optional(),
  })
  .strict()

export const ReferenceSchema = z
  .object({
    id: Slug,
    label: NonEmptyString,
    url_or_path: NonEmptyString,
    notes: z.string().optional(),
  })
  .strict()

export const AuthorSchema = z
  .object({
    id: Slug,
    name: z.string().optional(),
    role: z.string().optional(),
  })
  .strict()

export const UnresolvedQuestionStateSchema = z.enum(['pending', 'unanswerable'])
export type UnresolvedQuestionState = z.infer<typeof UnresolvedQuestionStateSchema>

export const UnresolvedQuestionSchema = z
  .object({
    id: Slug,
    path: NonEmptyString,
    reason: NonEmptyString,
    state: UnresolvedQuestionStateSchema,
    created_at: z.string().datetime({ offset: true }),
  })
  .strict()

export const CompletenessSnapshotSchema = z
  .object({
    overall: z.number().min(0).max(1),
    by_section: z.record(z.string(), z.number().min(0).max(1)),
    computed_at: z.string().datetime({ offset: true }),
  })
  .strict()

export const ProvenanceSchema = z
  .object({
    authors: z.array(AuthorSchema),
    unresolved_questions: z.array(UnresolvedQuestionSchema),
    completeness_snapshot: CompletenessSnapshotSchema.optional(),
  })
  .strict()

export const ExtensionsSchema = z.record(NamespacedKey, z.unknown())

export const CanonicalSpecSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    id: z.string().uuid(),
    title: NonEmptyString,
    status: SpecStatusSchema,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    intent: IntentSchema,
    domain_model: DomainModelSchema,
    capabilities: z.array(CapabilitySchema),
    flows: z.array(FlowSchema),
    constraints: ConstraintsSchema,
    references: z.array(ReferenceSchema),
    provenance: ProvenanceSchema,
    extensions: ExtensionsSchema,
  })
  .strict()

export type CanonicalSpec = z.infer<typeof CanonicalSpecSchema>
export type Intent = z.infer<typeof IntentSchema>
export type DomainModel = z.infer<typeof DomainModelSchema>
export type Entity = z.infer<typeof EntitySchema>
export type EntityField = z.infer<typeof EntityFieldSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type Capability = z.infer<typeof CapabilitySchema>
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>
export type Flow = z.infer<typeof FlowSchema>
export type FlowStep = z.infer<typeof FlowStepSchema>
export type FlowFailureMode = z.infer<typeof FlowFailureModeSchema>
export type Constraints = z.infer<typeof ConstraintsSchema>
export type Stack = z.infer<typeof StackSchema>
export type Reference = z.infer<typeof ReferenceSchema>
export type Provenance = z.infer<typeof ProvenanceSchema>
export type Author = z.infer<typeof AuthorSchema>
export type UnresolvedQuestion = z.infer<typeof UnresolvedQuestionSchema>
export type CompletenessSnapshot = z.infer<typeof CompletenessSnapshotSchema>
export type UserPersona = z.infer<typeof UserPersonaSchema>
export type Extensions = z.infer<typeof ExtensionsSchema>
