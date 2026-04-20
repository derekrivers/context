import { describe, expect, it } from 'vitest'
import { createEmptySpec, type CanonicalSpec } from '@context/spec-schema'
import {
  buildPhraseContext,
  PHRASE_TURN_WINDOW,
  summariseSpecSections,
} from '../src/conversation/phrase.js'
import type { Selection } from '../src/conversation/types.js'
import type { ConversationTurn } from '../src/db/schema.js'

function emptySpec(): CanonicalSpec {
  return createEmptySpec({ title: 'x', author: { id: 'tester' } })
}

function selection(path = 'intent.summary'): Selection {
  return {
    targetField: { path, section: 'intent', schemaRef: path, importance: 'critical' },
    context: { surroundingSpec: null, relatedFields: [], recentTurns: [] },
    reason: { kind: 'highest_priority_unblocked' },
  }
}

function fakeTurn(n: number, path: string): ConversationTurn {
  return {
    id: `turn-${n}`,
    specId: 'spec',
    turnIndex: n,
    createdAt: new Date(),
    phase: 'selection',
    targetPath: path,
    targetSection: 'intent',
    selectionReason: { kind: 'highest_priority_unblocked' },
    specSnapshot: null,
    completenessSnapshot: null,
    outcome: null,
    llmModelId: null,
    llmTokensIn: null,
    llmTokensOut: null,
  }
}

describe('summariseSpecSections', () => {
  it('marks every section empty on a fresh spec', () => {
    const out = summariseSpecSections(emptySpec())
    for (const s of out) expect(s.hasContent).toBe(false)
  })

  it('flags intent as having content once any field is set', () => {
    const spec: CanonicalSpec = {
      ...emptySpec(),
      intent: { summary: 'a todo app' },
    }
    const out = summariseSpecSections(spec)
    const intent = out.find((s) => s.section === 'intent')!
    expect(intent.hasContent).toBe(true)
  })
})

describe('buildPhraseContext', () => {
  it('echoes the target path and section summary', () => {
    const ctx = buildPhraseContext(selection(), emptySpec(), [])
    expect(ctx.targetPath).toBe('intent.summary')
    expect(ctx.sectionSummary.find((s) => s.section === 'intent')?.hasContent).toBe(false)
    expect(ctx.recentTurns).toHaveLength(0)
  })

  it(`caps recent turns to ${PHRASE_TURN_WINDOW}`, () => {
    const turns: ConversationTurn[] = Array.from({ length: PHRASE_TURN_WINDOW + 3 }, (_, i) =>
      fakeTurn(i, 'intent.problem'),
    )
    const ctx = buildPhraseContext(selection(), emptySpec(), turns)
    expect(ctx.recentTurns).toHaveLength(PHRASE_TURN_WINDOW)
  })
})
