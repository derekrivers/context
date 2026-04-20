import { describe, expect, it } from 'vitest'
import {
  buildParseToolSchema,
  findToolUse,
  interpretToolUse,
  TOOL_NAME,
} from '../src/conversation/parse.js'

describe('buildParseToolSchema', () => {
  it('advertises the record_answer tool with four input variants', () => {
    const tool = buildParseToolSchema()
    expect(tool).toMatchObject({ name: TOOL_NAME })
    const schema = tool.input_schema as { oneOf: Array<{ required: string[] }> }
    expect(schema.oneOf).toHaveLength(4)
  })
})

describe('interpretToolUse', () => {
  const meta = { tokensIn: 42, tokensOut: 7, modelId: 'claude-test' }

  it('maps an update variant to ParseResult.update', () => {
    const result = interpretToolUse({
      ...meta,
      input: {
        kind: 'update',
        updates: [
          { path: 'intent.summary', value: 'hi', confidence: 'high' },
        ],
      },
    })
    expect(result?.kind).toBe('update')
    if (result?.kind === 'update') {
      expect(result.updates[0]?.path).toBe('intent.summary')
      expect(result.updates[0]?.confidence).toBe('high')
      expect(result.tokensIn).toBe(42)
      expect(result.tokensOut).toBe(7)
      expect(result.modelId).toBe('claude-test')
    }
  })

  it('maps a clarification variant with reason', () => {
    const result = interpretToolUse({
      ...meta,
      input: {
        kind: 'clarification',
        question: 'Which tenants?',
        reason: 'contradicts_existing_spec',
      },
    })
    expect(result?.kind).toBe('clarification')
    if (result?.kind === 'clarification') {
      expect(result.reason).toBe('contradicts_existing_spec')
      expect(result.question).toBe('Which tenants?')
    }
  })

  it('maps a skip variant', () => {
    const result = interpretToolUse({ ...meta, input: { kind: 'skip' } })
    expect(result?.kind).toBe('skip')
  })

  it('maps an unknown variant with reason', () => {
    const result = interpretToolUse({
      ...meta,
      input: { kind: 'unknown', reason: 'user deferred deciding' },
    })
    expect(result?.kind).toBe('unknown')
    if (result?.kind === 'unknown') {
      expect(result.reason).toBe('user deferred deciding')
    }
  })

  it('returns null for malformed input', () => {
    expect(
      interpretToolUse({ ...meta, input: { kind: 'bogus' } }),
    ).toBeNull()
    expect(
      interpretToolUse({ ...meta, input: { kind: 'update', updates: [] } }),
    ).toBeNull()
    expect(interpretToolUse({ ...meta, input: null })).toBeNull()
  })

  it('rejects missing confidence on update', () => {
    expect(
      interpretToolUse({
        ...meta,
        input: { kind: 'update', updates: [{ path: 'x', value: 1 }] },
      }),
    ).toBeNull()
  })
})

describe('findToolUse', () => {
  it('returns the matching tool_use block', () => {
    const block = { type: 'tool_use' as const, id: 'id', name: TOOL_NAME, input: {} }
    expect(findToolUse([{ type: 'text', text: 'noise' }, block])).toEqual(block)
  })

  it('returns null when no tool_use is present', () => {
    expect(findToolUse([{ type: 'text', text: 'hi' }])).toBeNull()
  })

  it('ignores tool_use blocks with a different name', () => {
    expect(
      findToolUse([
        { type: 'tool_use', id: 'id', name: 'other_tool', input: {} },
      ]),
    ).toBeNull()
  })
})
