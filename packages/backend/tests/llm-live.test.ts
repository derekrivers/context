import { describe, expect, it } from 'vitest'
import { createEmptySpec, type CanonicalSpec } from '@context/spec-schema'
import { createLlmClient } from '../src/llm/client.js'
import { phraseQuestion } from '../src/conversation/phrase.js'
import { parseAnswer } from '../src/conversation/parse.js'
import type { Selection } from '../src/conversation/types.js'

const LIVE = Boolean(process.env['RUN_LIVE_LLM_TESTS']) && Boolean(process.env['ANTHROPIC_API_KEY'])

function emptySpec(): CanonicalSpec {
  return createEmptySpec({ title: 'Live Spec', author: { id: 'live' } })
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

describe.skipIf(!LIVE)('live LLM — phraseQuestion', () => {
  it('produces plain-text output with no markdown', async () => {
    const client = createLlmClient({
      apiKey: process.env['ANTHROPIC_API_KEY']!,
      timeoutMs: 30000,
    })
    const result = await phraseQuestion(
      client,
      selection(),
      emptySpec(),
      [],
      process.env['CONTEXT_PHRASE_MODEL'] ?? 'claude-haiku-4-5-20251001',
    )
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.text).not.toMatch(/^\*|\*$|^#|^- |```|\*\*/)
    expect(result.tokensIn).toBeGreaterThan(0)
    expect(result.tokensOut).toBeGreaterThan(0)
  }, 60000)
})

describe.skipIf(!LIVE)('live LLM — parseAnswer', () => {
  it('returns an update for a clean, parseable answer', async () => {
    const client = createLlmClient({
      apiKey: process.env['ANTHROPIC_API_KEY']!,
      timeoutMs: 30000,
    })
    const result = await parseAnswer(
      client,
      selection(),
      'A small team-internal project tracker.',
      emptySpec(),
      [],
      process.env['CONTEXT_PARSE_MODEL'] ?? 'claude-sonnet-4-6',
    )
    expect(result.kind).toBe('update')
    if (result.kind === 'update') {
      const u = result.updates[0]
      expect(u?.path).toBe('intent.summary')
      expect(typeof u?.value).toBe('string')
    }
  }, 60000)
})
