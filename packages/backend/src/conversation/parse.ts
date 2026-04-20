import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import type { CanonicalSpec } from '@context/spec-schema'
import type {
  ContentBlock,
  LlmClient,
  Message,
  ToolUseBlock,
} from '../llm/client.js'
import type { ConversationTurn } from '../db/schema.js'
import type { Selection } from './types.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PARSE_PROMPT = readFileSync(resolve(HERE, 'prompts/parse.md'), 'utf8')

export const PARSE_TURN_WINDOW = 3
export const TOOL_NAME = 'record_answer'

export type ClarificationReason =
  | 'ambiguous'
  | 'multiple_interpretations'
  | 'contradicts_existing_spec'
  | 'insufficient_detail'

export type Confidence = 'high' | 'medium' | 'low'

export interface FieldUpdate {
  path: string
  value?: unknown
  confidence: Confidence
}

export type ParseResult =
  | {
      kind: 'update'
      updates: FieldUpdate[]
      tokensIn: number
      tokensOut: number
      modelId: string
    }
  | {
      kind: 'clarification'
      question: string
      reason: ClarificationReason
      tokensIn: number
      tokensOut: number
      modelId: string
    }
  | { kind: 'skip'; tokensIn: number; tokensOut: number; modelId: string }
  | {
      kind: 'unknown'
      reason: string
      tokensIn: number
      tokensOut: number
      modelId: string
    }

const FieldUpdateSchema = z.object({
  path: z.string().min(1),
  value: z.unknown(),
  confidence: z.enum(['high', 'medium', 'low']),
})

const ToolInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('update'),
    updates: z.array(FieldUpdateSchema).min(1),
  }),
  z.object({
    kind: z.literal('clarification'),
    question: z.string().min(1),
    reason: z.enum([
      'ambiguous',
      'multiple_interpretations',
      'contradicts_existing_spec',
      'insufficient_detail',
    ]),
  }),
  z.object({ kind: z.literal('skip') }),
  z.object({
    kind: z.literal('unknown'),
    reason: z.string().min(1),
  }),
])

export function buildParseToolSchema(): Record<string, unknown> {
  return {
    name: TOOL_NAME,
    description:
      "Record the user's answer about the current target field as one of four outcomes: update, clarification, skip, or unknown.",
    input_schema: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          required: ['kind', 'updates'],
          properties: {
            kind: { type: 'string', enum: ['update'] },
            updates: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['path', 'value', 'confidence'],
                properties: {
                  path: {
                    type: 'string',
                    description:
                      "Dotted/indexed path into the canonical spec (e.g. 'intent.summary' or 'capabilities[0].acceptance_criteria'). Stay within the parent of the current target field.",
                  },
                  value: {
                    description:
                      'Value to write at the path. Must match the schema for that field.',
                  },
                  confidence: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description:
                      "High: answer is unambiguous. Medium: parseable but compressed. Low: extractable but user should confirm.",
                  },
                },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['kind', 'question', 'reason'],
          properties: {
            kind: { type: 'string', enum: ['clarification'] },
            question: {
              type: 'string',
              description: 'Concise follow-up question to show the user verbatim.',
            },
            reason: {
              type: 'string',
              enum: [
                'ambiguous',
                'multiple_interpretations',
                'contradicts_existing_spec',
                'insufficient_detail',
              ],
            },
          },
        },
        {
          type: 'object',
          required: ['kind'],
          properties: { kind: { type: 'string', enum: ['skip'] } },
        },
        {
          type: 'object',
          required: ['kind', 'reason'],
          properties: {
            kind: { type: 'string', enum: ['unknown'] },
            reason: {
              type: 'string',
              description: "Why the user doesn't know (as they expressed it).",
            },
          },
        },
      ],
    },
  }
}

export function findToolUse(content: ContentBlock[]): ToolUseBlock | null {
  for (const b of content) {
    if (b.type === 'tool_use' && b.name === TOOL_NAME) return b
  }
  return null
}

export interface InterpretToolUseArgs {
  input: unknown
  tokensIn: number
  tokensOut: number
  modelId: string
}

export function interpretToolUse(args: InterpretToolUseArgs): ParseResult | null {
  const parsed = ToolInputSchema.safeParse(args.input)
  if (!parsed.success) return null
  const data = parsed.data
  const meta = {
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    modelId: args.modelId,
  }
  if (data.kind === 'update') return { kind: 'update', updates: data.updates, ...meta }
  if (data.kind === 'clarification') {
    return {
      kind: 'clarification',
      question: data.question,
      reason: data.reason,
      ...meta,
    }
  }
  if (data.kind === 'skip') return { kind: 'skip', ...meta }
  return { kind: 'unknown', reason: data.reason, ...meta }
}

function renderUserMessage(
  selection: Selection,
  userText: string,
  spec: CanonicalSpec,
  turns: ConversationTurn[],
): string {
  const recent = turns.slice(-PARSE_TURN_WINDOW)
  const turnLines = recent.length
    ? recent
        .map(
          (t) =>
            `- ${t.phase}${t.targetPath ? ` @ ${t.targetPath}` : ''}${
              t.outcome ? ` (${t.outcome})` : ''
            }`,
        )
        .join('\n')
    : '- (no prior turns)'

  return [
    `Target field: ${selection.targetField.path}`,
    `Target section: ${selection.targetField.section}`,
    `Target importance: ${selection.targetField.importance}`,
    '',
    'Current spec (JSON):',
    '```json',
    JSON.stringify(spec, null, 2),
    '```',
    '',
    'Recent turns:',
    turnLines,
    '',
    'User answer:',
    userText,
    '',
    'Call the `record_answer` tool.',
  ].join('\n')
}

export interface ParseOptions {
  maxTokens?: number
  systemPrompt?: string
}

export async function parseAnswer(
  client: LlmClient,
  selection: Selection,
  userText: string,
  spec: CanonicalSpec,
  turns: ConversationTurn[],
  model: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const tool = buildParseToolSchema()
  const systemPrompt = options.systemPrompt ?? PARSE_PROMPT
  const maxTokens = options.maxTokens ?? 1200

  const firstUser = renderUserMessage(selection, userText, spec, turns)
  const messages: Message[] = [{ role: 'user', content: firstUser }]

  const first = await client.callModel({
    system: systemPrompt,
    messages,
    tools: [tool as { name: string; description: string; input_schema: Record<string, unknown> }],
    model,
    maxTokens,
  })

  const firstToolUse = findToolUse(first.content)
  if (firstToolUse) {
    const result = interpretToolUse({
      input: firstToolUse.input,
      tokensIn: first.tokensIn,
      tokensOut: first.tokensOut,
      modelId: first.modelId,
    })
    if (result) return result
  }

  const retryMessages: Message[] = [
    ...messages,
    { role: 'assistant', content: first.content },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: firstToolUse?.id ?? 'missing',
          content:
            'Your previous tool call did not match the expected input_schema. Call `record_answer` again with one valid variant: update, clarification, skip, or unknown.',
          is_error: true,
        },
      ],
    },
  ]

  const second = await client.callModel({
    system: systemPrompt,
    messages: retryMessages,
    tools: [tool as { name: string; description: string; input_schema: Record<string, unknown> }],
    model,
    maxTokens,
  })

  const secondToolUse = findToolUse(second.content)
  if (secondToolUse) {
    const result = interpretToolUse({
      input: secondToolUse.input,
      tokensIn: first.tokensIn + second.tokensIn,
      tokensOut: first.tokensOut + second.tokensOut,
      modelId: second.modelId,
    })
    if (result) return result
  }

  return {
    kind: 'clarification',
    question:
      "I couldn't parse that cleanly — could you say it a different way, or add a bit more detail?",
    reason: 'insufficient_detail',
    tokensIn: first.tokensIn + second.tokensIn,
    tokensOut: first.tokensOut + second.tokensOut,
    modelId: second.modelId,
  }
}
