export {
  SCHEMA_VERSION,
  CanonicalSpecSchema,
  IntentSchema,
  DomainModelSchema,
  EntitySchema,
  EntityFieldSchema,
  RelationshipSchema,
  RelationshipKindSchema,
  CapabilitySchema,
  AcceptanceCriterionSchema,
  FlowSchema,
  FlowStepSchema,
  FlowFailureModeSchema,
  ConstraintsSchema,
  StackSchema,
  ReferenceSchema,
  ProvenanceSchema,
  AuthorSchema,
  UnresolvedQuestionSchema,
  UnresolvedQuestionStateSchema,
  CompletenessSnapshotSchema,
  SpecStatusSchema,
  UserPersonaSchema,
  ExtensionsSchema,
} from './schema.js'

export type {
  CanonicalSpec,
  Intent,
  DomainModel,
  Entity,
  EntityField,
  Relationship,
  RelationshipKind,
  Capability,
  AcceptanceCriterion,
  Flow,
  FlowStep,
  FlowFailureMode,
  Constraints,
  Stack,
  Reference,
  Provenance,
  Author,
  UnresolvedQuestion,
  UnresolvedQuestionState,
  CompletenessSnapshot,
  SpecStatus,
  UserPersona,
  Extensions,
} from './schema.js'

export {
  FIELD_META,
  IMPORTANCE_WEIGHT,
  SECTION_PRIORITY,
} from './meta.js'

export type {
  FieldMeta,
  Importance,
  SectionKey,
  DependencyPredicate,
} from './meta.js'

export { createEmptySpec } from './factory.js'
export type { CreateEmptySpecInput } from './factory.js'

export { computeCompleteness } from './completeness.js'
export type {
  CompletenessReport,
  SectionCompleteness,
  MissingField,
} from './completeness.js'
