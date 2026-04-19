import type { CanonicalSpec } from '../src/schema.js'
import { SCHEMA_VERSION } from '../src/schema.js'

const TS = '2026-01-01T00:00:00.000Z'

export function fixtureEmpty(): CanonicalSpec {
  return {
    schema_version: SCHEMA_VERSION,
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Empty Fixture',
    status: 'draft',
    created_at: TS,
    updated_at: TS,
    intent: {},
    domain_model: { entities: [], relationships: [] },
    capabilities: [],
    flows: [],
    constraints: {},
    references: [],
    provenance: { authors: [{ id: 'alice' }], unresolved_questions: [] },
    extensions: {},
  }
}

export function fixtureIntentOnly(): CanonicalSpec {
  const base = fixtureEmpty()
  base.intent = {
    summary: 'A minimal todo app',
    problem: 'Users lose track of tasks across devices',
    users: [{ id: 'primary', persona: 'Solo professional', needs: 'Low-friction task capture' }],
    non_goals: ['Team collaboration'],
  }
  return base
}

export function fixtureWithEntities(): CanonicalSpec {
  const base = fixtureIntentOnly()
  base.domain_model = {
    entities: [
      {
        id: 'todo',
        name: 'Todo',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'done', type: 'boolean' },
        ],
      },
    ],
    relationships: [],
  }
  return base
}

export function fixtureComplete(): CanonicalSpec {
  const base = fixtureWithEntities()
  base.domain_model.entities.push({
    id: 'user',
    name: 'User',
    fields: [{ name: 'email', type: 'string', required: true }],
  })
  base.domain_model.relationships = [
    {
      id: 'user_owns_todo',
      from_entity: 'user',
      to_entity: 'todo',
      kind: 'one_to_many',
    },
  ]
  base.capabilities = [
    {
      id: 'create_todo',
      name: 'Create todo',
      entity_ref: 'todo',
      verb: 'create',
      acceptance_criteria: [
        {
          id: 'created',
          given: 'authenticated user',
          when: 'they submit a non-empty title',
          then: 'a new todo appears in their list',
        },
      ],
    },
  ]
  base.flows = [
    {
      id: 'add_first_todo',
      name: 'Add first todo',
      trigger: 'User opens the app for the first time',
      steps: [
        { actor: 'user', action: 'Types a title and presses enter' },
        { actor: 'system', action: 'Persists the todo and renders it' },
      ],
      failure_modes: [{ when: 'empty title', behavior: 'Disable submit button' }],
    },
  ]
  base.constraints = {
    platform: 'web',
    stack: { frontend: 'React', backend: 'Fastify', database: 'Postgres' },
    auth: 'Bearer token',
    data_retention: 'Indefinite',
    performance: 'P95 < 200ms for list queries',
    compliance: 'None',
    deploy_posture: 'Self-hosted',
  }
  base.references = [
    { id: 'todomvc', label: 'TodoMVC', url_or_path: 'https://todomvc.com' },
  ]
  return base
}
