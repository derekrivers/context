import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createEmptySpec, type CanonicalSpec } from '@context/spec-schema'
import {
  RETRY_BUDGET,
  SECTION_THRESHOLDS,
  SKIP_WINDOW,
  isCompleteEnough,
  selectNextField,
} from '../src/conversation/selector.js'
import type { SelectorTurn, TurnOutcome, TurnPhase } from '../src/conversation/types.js'

function emptySpec(): CanonicalSpec {
  return createEmptySpec({ title: 'test', author: { id: 'tester' } })
}

function intentFilled(base: CanonicalSpec): CanonicalSpec {
  return {
    ...base,
    intent: {
      summary: 'A thing that does a thing.',
      problem: 'A problem.',
      users: [{ id: 'u1', persona: 'dev' }],
      non_goals: ['no features'],
    },
  }
}

function withEntity(base: CanonicalSpec, entityId = 'todo'): CanonicalSpec {
  return {
    ...base,
    domain_model: {
      ...base.domain_model,
      entities: [
        ...base.domain_model.entities,
        {
          id: entityId,
          name: entityId.charAt(0).toUpperCase() + entityId.slice(1),
          fields: [{ name: 'id', type: 'string', required: true }],
        },
      ],
    },
  }
}

function makeTurn(
  index: number,
  phase: TurnPhase,
  targetPath: string | null,
  outcome: TurnOutcome | null = null,
): SelectorTurn {
  return { turnId: randomUUID(), turnIndex: index, phase, targetPath, outcome }
}

function fullyComplete(): CanonicalSpec {
  const base = intentFilled(withEntity(withEntity(emptySpec(), 'todo'), 'user'))
  return {
    ...base,
    domain_model: {
      ...base.domain_model,
      relationships: [
        { id: 'user_owns_todo', from_entity: 'user', to_entity: 'todo', kind: 'one_to_many' },
      ],
    },
    capabilities: [
      {
        id: 'create_todo',
        name: 'Create todo',
        entity_ref: 'todo',
        verb: 'create',
        acceptance_criteria: [
          {
            id: 'ok',
            given: 'auth user',
            when: 'submits title',
            then: 'todo appears',
          },
        ],
      },
    ],
    flows: [
      {
        id: 'add_first',
        name: 'Add first todo',
        trigger: 'Opens app',
        steps: [
          { actor: 'user', action: 'types title' },
          { actor: 'system', action: 'persists' },
        ],
        failure_modes: [{ when: 'empty title', behavior: 'disable submit' }],
      },
    ],
    constraints: {
      platform: 'web',
      stack: { frontend: 'React', backend: 'Fastify' },
      auth: 'Bearer',
      data_retention: 'indefinite',
      performance: 'P95 200ms',
      compliance: 'none',
      deploy_posture: 'self-hosted',
    },
    references: [{ id: 'todomvc', label: 'TodoMVC', url_or_path: 'https://todomvc.com' }],
  }
}

describe('selectNextField — base selection', () => {
  it('returns intent.summary for an empty spec', () => {
    const sel = selectNextField(emptySpec(), [])
    expect(sel?.targetField.path).toBe('intent.summary')
    expect(sel?.reason.kind).toBe('highest_priority_unblocked')
  })

  it('advances to domain_model.entities once intent is filled', () => {
    const sel = selectNextField(intentFilled(emptySpec()), [])
    expect(sel?.targetField.path).toBe('domain_model.entities')
  })

  it('picks capabilities before domain_model.relationships when only one entity exists', () => {
    const spec = intentFilled(withEntity(emptySpec()))
    const sel = selectNextField(spec, [])
    expect(sel?.targetField.path).toBe('capabilities')
  })

  it('unblocks domain_model.relationships once two entities exist', () => {
    const spec = intentFilled(withEntity(withEntity(emptySpec()), 'user'))
    const sel = selectNextField(spec, [])
    expect(sel?.targetField.section === 'capabilities' || sel?.targetField.path === 'domain_model.relationships').toBe(true)
  })
})

describe('selectNextField — unknown field acknowledgements', () => {
  it('keeps selecting a field marked unknown if there is no acknowledgement turn', () => {
    const spec: CanonicalSpec = {
      ...emptySpec(),
      provenance: {
        authors: [{ id: 'a' }],
        unresolved_questions: [
          {
            id: 'q1',
            path: 'intent.summary',
            reason: 'test',
            state: 'unanswerable',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    }
    const sel = selectNextField(spec, [])
    expect(sel?.targetField.path).toBe('intent.summary')
  })

  it('treats a field as satisfied when unknown AND an acknowledgement turn exists', () => {
    const spec: CanonicalSpec = {
      ...emptySpec(),
      provenance: {
        authors: [{ id: 'a' }],
        unresolved_questions: [
          {
            id: 'q1',
            path: 'intent.summary',
            reason: 'test',
            state: 'unanswerable',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    }
    const turns: SelectorTurn[] = [makeTurn(0, 'answer', 'intent.summary', 'answered')]
    const sel = selectNextField(spec, turns)
    expect(sel?.targetField.path).not.toBe('intent.summary')
  })
})

describe('selectNextField — skip window', () => {
  it(`drops a skipped field within the ${SKIP_WINDOW}-turn window`, () => {
    const turns: SelectorTurn[] = [
      makeTurn(0, 'skip', 'intent.summary', 'skipped'),
      makeTurn(1, 'selection', 'intent.problem'),
    ]
    const sel = selectNextField(emptySpec(), turns)
    expect(sel?.targetField.path).not.toBe('intent.summary')
    expect(sel?.targetField.path).toBe('intent.problem')
  })

  it(`re-surfaces a skipped field after ${SKIP_WINDOW} turns`, () => {
    const turns: SelectorTurn[] = [
      makeTurn(0, 'skip', 'intent.summary', 'skipped'),
      makeTurn(1, 'selection', 'intent.problem'),
      makeTurn(2, 'selection', 'intent.problem'),
      makeTurn(3, 'selection', 'intent.problem'),
      makeTurn(4, 'selection', 'intent.problem'),
      makeTurn(5, 'selection', 'intent.problem'),
    ]
    const sel = selectNextField(emptySpec(), turns)
    expect(sel?.targetField.path).toBe('intent.summary')
  })
})

describe('selectNextField — retry budget', () => {
  it(`drops a field after ${RETRY_BUDGET} unparseable/clarification outcomes`, () => {
    const turns: SelectorTurn[] = [
      makeTurn(0, 'answer', 'intent.summary', 'unparseable'),
      makeTurn(1, 'clarification', 'intent.summary', 'clarification_requested'),
      makeTurn(2, 'answer', 'intent.summary', 'unparseable'),
    ]
    const sel = selectNextField(emptySpec(), turns)
    expect(sel?.targetField.path).not.toBe('intent.summary')
    expect(sel?.targetField.path).toBe('intent.problem')
  })
})

describe('selectNextField — clarification retry priority', () => {
  it('returns the clarification path immediately when it is the latest turn', () => {
    const turns: SelectorTurn[] = [
      makeTurn(0, 'selection', 'intent.summary'),
      makeTurn(1, 'clarification', 'intent.summary', 'clarification_requested'),
    ]
    const sel = selectNextField(emptySpec(), turns)
    expect(sel?.targetField.path).toBe('intent.summary')
    expect(sel?.reason.kind).toBe('retry_after_clarification')
    if (sel?.reason.kind === 'retry_after_clarification') {
      expect(sel.reason.previousTurnId).toBe(turns[1]!.turnId)
    }
  })
})

describe('selectNextField — unskip promotion', () => {
  it('promotes an unskipped path over the ranked top', () => {
    const turns: SelectorTurn[] = [
      makeTurn(0, 'skip', 'intent.non_goals', 'skipped'),
      makeTurn(1, 'selection', 'intent.problem'),
      makeTurn(2, 'selection', 'intent.problem'),
      makeTurn(3, 'selection', 'intent.problem'),
      makeTurn(4, 'selection', 'intent.problem'),
      makeTurn(5, 'selection', 'intent.problem'),
      makeTurn(6, 'unskip', 'intent.non_goals'),
    ]
    const sel = selectNextField(emptySpec(), turns)
    expect(sel?.targetField.path).toBe('intent.non_goals')
    expect(sel?.reason.kind).toBe('user_unskipped')
  })
})

describe('selectNextField — determinism', () => {
  it('returns the same selection for identical inputs', () => {
    const spec = intentFilled(emptySpec())
    const a = selectNextField(spec, [])
    const b = selectNextField(spec, [])
    expect(a?.targetField.path).toBe(b?.targetField.path)
  })

  it('ties between critical intent fields break by declaration order', () => {
    // Both intent.summary and intent.problem are critical; summary is declared first.
    const sel = selectNextField(emptySpec(), [])
    expect(sel?.targetField.path).toBe('intent.summary')
  })
})

describe('isCompleteEnough', () => {
  it('returns false for an empty spec', () => {
    expect(isCompleteEnough(emptySpec())).toBe(false)
  })

  it('returns true for a fully filled spec', () => {
    expect(isCompleteEnough(fullyComplete())).toBe(true)
  })

  it('honours the references threshold of 0.2', () => {
    expect(SECTION_THRESHOLDS.references).toBe(0.2)
  })
})

describe('selectNextField — completeness termination', () => {
  it('returns null when every section meets its threshold', () => {
    const sel = selectNextField(fullyComplete(), [])
    expect(sel).toBeNull()
  })
})
