import { describe, expect, it } from 'vitest'
import { createEmptySpec, type CanonicalSpec } from '@context/spec-schema'
import { phraseQuestion } from '../src/conversation/phrase.js'
import type { Selection } from '../src/conversation/types.js'
import { ScriptedLlmClient, textResponse } from './helpers/llm.js'

function emptySpec(): CanonicalSpec {
  return createEmptySpec({ title: 't', author: { id: 'tester' } })
}

function selection(): Selection {
  return {
    targetField: {
      path: 'intent.summary',
      section: 'intent',
      schemaRef: 'intent.summary',
      importance: 'critical',
    },
    context: { surroundingSpec: null, relatedFields: [], recentTurns: [] },
    reason: { kind: 'highest_priority_unblocked' },
  }
}

describe('phraseQuestion', () => {
  it('returns text from the model with token counts', async () => {
    const client = new ScriptedLlmClient([
      textResponse('What is this app for?', 120, 8),
    ])
    const result = await phraseQuestion(
      client,
      selection(),
      emptySpec(),
      [],
      'claude-haiku-test',
    )
    expect(result.text).toBe('What is this app for?')
    expect(result.tokensIn).toBe(120)
    expect(result.tokensOut).toBe(8)
    expect(result.modelId).toBe('claude-test')
  })

  it('sends the target path and section summary in the user message', async () => {
    const client = new ScriptedLlmClient([textResponse('question?')])
    await phraseQuestion(
      client,
      selection(),
      emptySpec(),
      [],
      'claude-haiku-test',
    )
    const call = client.calls[0]!
    const userContent = call.messages[0]!.content
    const text = typeof userContent === 'string' ? userContent : JSON.stringify(userContent)
    expect(text).toContain('intent.summary')
    expect(text).toContain('intent')
  })
})
