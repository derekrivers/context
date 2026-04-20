export type FieldKind =
  | 'string'
  | 'textarea'
  | 'enum'
  | 'boolean'
  | 'number'
  | 'chip-array'
  | 'object-array'
  | 'object'

export interface FieldDescriptor {
  path: string
  label: string
  kind: FieldKind
  options?: readonly string[]
  help?: string
  multiline?: boolean
  itemLabel?: string
  itemFields?: readonly FieldDescriptor[]
}

export type SectionKey =
  | 'intent'
  | 'domain_model'
  | 'capabilities'
  | 'flows'
  | 'constraints'
  | 'references'
  | 'provenance'
  | 'extensions'

export interface SectionDescriptor {
  key: SectionKey
  label: string
  fields: readonly FieldDescriptor[]
  description?: string
  advanced?: boolean
}

const ACTOR_OPTIONS = ['user', 'system'] as const
const RELATIONSHIP_KINDS = ['one_to_one', 'one_to_many', 'many_to_many'] as const

const ENTITY_FIELD: FieldDescriptor = {
  path: 'domain_model.entities[].fields',
  label: 'Fields',
  kind: 'object-array',
  itemLabel: 'field',
  itemFields: [
    { path: 'name', label: 'Name', kind: 'string' },
    { path: 'type', label: 'Type', kind: 'string' },
    { path: 'required', label: 'Required', kind: 'boolean' },
    { path: 'description', label: 'Description', kind: 'textarea' },
  ],
}

const USER_PERSONA: FieldDescriptor = {
  path: 'intent.users',
  label: 'Users',
  kind: 'object-array',
  itemLabel: 'user',
  itemFields: [
    { path: 'id', label: 'Id (slug)', kind: 'string' },
    { path: 'persona', label: 'Persona', kind: 'string' },
    { path: 'needs', label: 'Needs', kind: 'textarea' },
  ],
}

const ENTITIES: FieldDescriptor = {
  path: 'domain_model.entities',
  label: 'Entities',
  kind: 'object-array',
  itemLabel: 'entity',
  itemFields: [
    { path: 'id', label: 'Id (slug)', kind: 'string' },
    { path: 'name', label: 'Name', kind: 'string' },
    { path: 'description', label: 'Description', kind: 'textarea' },
    ENTITY_FIELD,
  ],
}

const RELATIONSHIPS: FieldDescriptor = {
  path: 'domain_model.relationships',
  label: 'Relationships',
  kind: 'object-array',
  itemLabel: 'relationship',
  itemFields: [
    { path: 'id', label: 'Id (slug)', kind: 'string' },
    { path: 'from_entity', label: 'From entity', kind: 'string' },
    { path: 'to_entity', label: 'To entity', kind: 'string' },
    { path: 'kind', label: 'Kind', kind: 'enum', options: RELATIONSHIP_KINDS },
    { path: 'description', label: 'Description', kind: 'textarea' },
  ],
}

const CAPABILITIES: FieldDescriptor = {
  path: 'capabilities',
  label: 'Capabilities',
  kind: 'object-array',
  itemLabel: 'capability',
  itemFields: [
    { path: 'id', label: 'Id (slug)', kind: 'string' },
    { path: 'name', label: 'Name', kind: 'string' },
    { path: 'verb', label: 'Verb', kind: 'string' },
    { path: 'entity_ref', label: 'Entity ref', kind: 'string' },
    { path: 'description', label: 'Description', kind: 'textarea' },
    {
      path: 'acceptance_criteria',
      label: 'Acceptance criteria',
      kind: 'object-array',
      itemLabel: 'criterion',
      itemFields: [
        { path: 'id', label: 'Id (slug)', kind: 'string' },
        { path: 'given', label: 'Given', kind: 'textarea' },
        { path: 'when', label: 'When', kind: 'textarea' },
        { path: 'then', label: 'Then', kind: 'textarea' },
      ],
    },
  ],
}

const FLOWS: FieldDescriptor = {
  path: 'flows',
  label: 'Flows',
  kind: 'object-array',
  itemLabel: 'flow',
  itemFields: [
    { path: 'id', label: 'Id (slug)', kind: 'string' },
    { path: 'name', label: 'Name', kind: 'string' },
    { path: 'trigger', label: 'Trigger', kind: 'textarea' },
    {
      path: 'steps',
      label: 'Steps',
      kind: 'object-array',
      itemLabel: 'step',
      itemFields: [
        { path: 'actor', label: 'Actor', kind: 'enum', options: ACTOR_OPTIONS },
        { path: 'action', label: 'Action', kind: 'textarea' },
      ],
    },
    {
      path: 'failure_modes',
      label: 'Failure modes',
      kind: 'object-array',
      itemLabel: 'failure mode',
      itemFields: [
        { path: 'when', label: 'When', kind: 'textarea' },
        { path: 'behavior', label: 'Behaviour', kind: 'textarea' },
      ],
    },
  ],
}

const REFERENCES: FieldDescriptor = {
  path: 'references',
  label: 'References',
  kind: 'object-array',
  itemLabel: 'reference',
  itemFields: [
    { path: 'id', label: 'Id (slug)', kind: 'string' },
    { path: 'label', label: 'Label', kind: 'string' },
    { path: 'url_or_path', label: 'URL or path', kind: 'string' },
    { path: 'notes', label: 'Notes', kind: 'textarea' },
  ],
}

export const SECTION_DESCRIPTORS: readonly SectionDescriptor[] = [
  {
    key: 'intent',
    label: 'Intent',
    fields: [
      { path: 'intent.summary', label: 'Summary', kind: 'textarea' },
      { path: 'intent.problem', label: 'Problem', kind: 'textarea' },
      USER_PERSONA,
      {
        path: 'intent.non_goals',
        label: 'Non-goals',
        kind: 'chip-array',
      },
    ],
  },
  {
    key: 'domain_model',
    label: 'Domain model',
    fields: [ENTITIES, RELATIONSHIPS],
  },
  {
    key: 'capabilities',
    label: 'Capabilities',
    fields: [CAPABILITIES],
  },
  {
    key: 'flows',
    label: 'Flows',
    fields: [FLOWS],
  },
  {
    key: 'constraints',
    label: 'Constraints',
    fields: [
      { path: 'constraints.platform', label: 'Platform', kind: 'string' },
      {
        path: 'constraints.stack',
        label: 'Stack',
        kind: 'object',
        itemFields: [
          { path: 'frontend', label: 'Frontend', kind: 'string' },
          { path: 'backend', label: 'Backend', kind: 'string' },
          { path: 'database', label: 'Database', kind: 'string' },
          { path: 'notes', label: 'Notes', kind: 'textarea' },
        ],
      },
      { path: 'constraints.auth', label: 'Auth', kind: 'textarea' },
      { path: 'constraints.data_retention', label: 'Data retention', kind: 'textarea' },
      { path: 'constraints.performance', label: 'Performance', kind: 'textarea' },
      { path: 'constraints.compliance', label: 'Compliance', kind: 'textarea' },
      { path: 'constraints.deploy_posture', label: 'Deploy posture', kind: 'textarea' },
    ],
  },
  {
    key: 'references',
    label: 'References',
    fields: [REFERENCES],
  },
  {
    key: 'provenance',
    label: 'Provenance',
    fields: [],
    description: 'Managed by the system. Read-only.',
  },
  {
    key: 'extensions',
    label: 'Extensions',
    fields: [],
    description: 'Consumer-specific namespaced fields.',
    advanced: true,
  },
]

export function sectionForPath(path: string): SectionKey | null {
  const head = path.split(/[.[]/)[0] ?? ''
  const section = SECTION_DESCRIPTORS.find((s) => s.key === head)
  return section ? section.key : null
}
