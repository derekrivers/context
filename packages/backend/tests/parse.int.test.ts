import { describe, expect, it } from 'vitest'
import { createEmptySpec, type CanonicalSpec } from '@context/spec-schema'
import { parseAnswer } from '../src/conversation/parse.js'
import type { Selection } from '../src/conversation/types.js'
import { ScriptedLlmClient, textResponse, toolResponse } from './helpers/llm.js'

function emptySpec(): CanonicalSpec {
  return createEmptySpec({ title: 't', author: { id: 'tester' } })
}

function selection(path = 'intent.summary'): Selection {
  return {
    targetField: { path, section: 'intent', schemaRef: path, importance: 'critical' },
    context: { surroundingSpec: null, relatedFields: [], recentTurns: [] },
    reason: { kind: 'highest_priority_unblocked' },
  }
}

describe('parseAnswer', () => {
  it('returns an update when the tool call is valid', async () => {
    const client = new ScriptedLlmClient([
      toolResponse({
        kind: 'update',
        updates: [
          { path: 'intent.summary', value: 'A todo app', confidence: 'high' },
        ],
      }),
    ])
    const result = await parseAnswer(
      client,
      selection(),
      'It is a todo app.',
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('update')
    if (result.kind === 'update') {
      expect(result.updates[0]?.path).toBe('intent.summary')
      expect(result.updates[0]?.value).toBe('A todo app')
      expect(result.tokensIn).toBeGreaterThan(0)
    }
  })

  it('returns clarification when the model asks for one', async () => {
    const client = new ScriptedLlmClient([
      toolResponse({
        kind: 'clarification',
        question: 'Admins or customers?',
        reason: 'ambiguous',
      }),
    ])
    const result = await parseAnswer(
      client,
      selection('intent.users'),
      'users',
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('clarification')
    if (result.kind === 'clarification') {
      expect(result.reason).toBe('ambiguous')
    }
  })

  it('returns skip when the model reports skip intent', async () => {
    const client = new ScriptedLlmClient([toolResponse({ kind: 'skip' })])
    const result = await parseAnswer(
      client,
      selection(),
      'skip',
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('skip')
  })

  it('returns unknown with a reason', async () => {
    const client = new ScriptedLlmClient([
      toolResponse({ kind: 'unknown', reason: 'deferred to stakeholder' }),
    ])
    const result = await parseAnswer(
      client,
      selection(),
      "I don't know yet",
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('unknown')
    if (result.kind === 'unknown') {
      expect(result.reason).toBe('deferred to stakeholder')
    }
  })

  it('retries once when the first tool call fails Zod and succeeds on retry', async () => {
    const client = new ScriptedLlmClient([
      toolResponse({ kind: 'update', updates: [] }), // empty updates fail Zod
      toolResponse({
        kind: 'update',
        updates: [
          { path: 'intent.summary', value: 'fine', confidence: 'medium' },
        ],
      }),
    ])
    const result = await parseAnswer(
      client,
      selection(),
      'something',
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('update')
    expect(client.calls).toHaveLength(2)
  })

  it('returns clarification when both attempts fail Zod', async () => {
    const client = new ScriptedLlmClient([
      toolResponse({ kind: 'bogus' }),
      toolResponse({ kind: 'also_bogus' }),
    ])
    const result = await parseAnswer(
      client,
      selection(),
      'something',
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('clarification')
    if (result.kind === 'clarification') {
      expect(result.reason).toBe('insufficient_detail')
    }
    expect(client.calls).toHaveLength(2)
  })

  it('returns clarification when the model replies with text instead of a tool call', async () => {
    const client = new ScriptedLlmClient([
      textResponse('I have opinions about this question.'),
      textResponse('Still opinions.'),
    ])
    const result = await parseAnswer(
      client,
      selection(),
      'something',
      emptySpec(),
      [],
      'claude-test',
    )
    expect(result.kind).toBe('clarification')
  })
})
