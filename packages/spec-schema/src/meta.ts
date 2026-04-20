import type { CanonicalSpec } from './schema.js'

export type Importance = 'critical' | 'high' | 'medium' | 'low'

export type SectionKey =
  | 'intent'
  | 'domain_model'
  | 'capabilities'
  | 'flows'
  | 'constraints'
  | 'references'

export type DependencyPredicate = (spec: CanonicalSpec) => boolean

export interface FieldMeta {
  path: string
  section: SectionKey
  importance: Importance
  description: string
  dependsOn?: DependencyPredicate[]
  kind: 'scalar' | 'collection'
  minElements?: number
}

const hasAnyEntity: DependencyPredicate = (spec) => spec.domain_model.entities.length > 0

export const SECTION_PRIORITY: Record<SectionKey, number> = {
  intent: 6,
  domain_model: 5,
  capabilities: 4,
  flows: 3,
  constraints: 2,
  references: 1,
}

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export const FIELD_META: readonly FieldMeta[] = [
  {
    path: 'intent.summary',
    section: 'intent',
    importance: 'critical',
    kind: 'scalar',
    description: 'A one-line description of what is being built.',
  },
  {
    path: 'intent.problem',
    section: 'intent',
    importance: 'critical',
    kind: 'scalar',
    description: 'The problem this system exists to solve.',
  },
  {
    path: 'intent.users',
    section: 'intent',
    importance: 'high',
    kind: 'collection',
    minElements: 1,
    description: 'At least one user persona with their needs.',
  },
  {
    path: 'intent.non_goals',
    section: 'intent',
    importance: 'medium',
    kind: 'collection',
    minElements: 1,
    description: 'Things this system explicitly will not do.',
  },
  {
    path: 'domain_model.entities',
    section: 'domain_model',
    importance: 'critical',
    kind: 'collection',
    minElements: 1,
    description: 'At least one entity in the domain model.',
  },
  {
    path: 'domain_model.relationships',
    section: 'domain_model',
    importance: 'medium',
    kind: 'collection',
    minElements: 1,
    dependsOn: [(spec) => spec.domain_model.entities.length >= 2],
    description: 'Relationships between entities (only relevant once two or more entities exist).',
  },
  {
    path: 'capabilities',
    section: 'capabilities',
    importance: 'high',
    kind: 'collection',
    minElements: 1,
    dependsOn: [hasAnyEntity],
    description: 'At least one capability (verb against an entity).',
  },
  {
    path: 'flows',
    section: 'flows',
    importance: 'medium',
    kind: 'collection',
    minElements: 1,
    dependsOn: [hasAnyEntity],
    description: 'At least one end-to-end flow.',
  },
  {
    path: 'constraints.platform',
    section: 'constraints',
    importance: 'medium',
    kind: 'scalar',
    description: 'Target platform (e.g. web, mobile).',
  },
  {
    path: 'constraints.stack',
    section: 'constraints',
    importance: 'medium',
    kind: 'scalar',
    description: 'Preferred stack: frontend, backend, database.',
  },
  {
    path: 'constraints.auth',
    section: 'constraints',
    importance: 'medium',
    kind: 'scalar',
    description: 'Authentication posture.',
  },
  {
    path: 'constraints.data_retention',
    section: 'constraints',
    importance: 'low',
    kind: 'scalar',
    description: 'Data retention policy.',
  },
  {
    path: 'constraints.performance',
    section: 'constraints',
    importance: 'low',
    kind: 'scalar',
    description: 'Performance expectations.',
  },
  {
    path: 'constraints.compliance',
    section: 'constraints',
    importance: 'low',
    kind: 'scalar',
    description: 'Compliance requirements.',
  },
  {
    path: 'constraints.deploy_posture',
    section: 'constraints',
    importance: 'low',
    kind: 'scalar',
    description: 'Deployment posture (self-hosted, SaaS, etc.).',
  },
  {
    path: 'references',
    section: 'references',
    importance: 'low',
    kind: 'collection',
    minElements: 1,
    description: 'Pointers to existing implementations or prior art.',
  },
] as const
