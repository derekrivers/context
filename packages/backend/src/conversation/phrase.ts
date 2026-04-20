import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { CanonicalSpec } from '@context/spec-schema'
import type { LlmClient, Message } from '../llm/client.js'
import type { Selection } from './types.js'
import type { ConversationTurn } from '../db/schema.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PHRASE_PROMPT = readFileSync(resolve(HERE, 'prompts/phrase.md'), 'utf8')

export const PHRASE_TURN_WINDOW = 6

export interface PhraseResult {
  text: string
  tokensIn: number
  tokensOut: number
  modelId: string
}

export interface PhraseOptions {
  maxTokens?: number
  systemPrompt?: string
}

interface SectionSummaryEntry {
  section: string
  hasContent: boolean
}

export function summariseSpecSections(spec: CanonicalSpec): SectionSummaryEntry[] {
  return [
    { section: 'intent', hasContent: Object.keys(spec.intent).length > 0 },
    {
      section: 'domain_model',
      hasContent:
        spec.domain_model.entities.length > 0 || spec.domain_model.relationships.length > 0,
    },
    { section: 'capabilities', hasContent: spec.capabilities.length > 0 },
    { section: 'flows', hasContent: spec.flows.length > 0 },
    { section: 'constraints', hasContent: Object.keys(spec.constraints).length > 0 },
    { section: 'references', hasContent: spec.references.length > 0 },
  ]
}

export interface PhraseContext {
  targetPath: string
  targetDescription: string
  sectionSummary: SectionSummaryEntry[]
  recentTurns: Array<{ phase: string; targetPath: string | null; userText?: string | null }>
}

export function buildPhraseContext(
  selection: Selection,
  spec: CanonicalSpec,
  turns: ConversationTurn[],
): PhraseContext {
  const recent = turns.slice(-PHRASE_TURN_WINDOW).map((t) => ({
    phase: t.phase,
    targetPath: t.targetPath,
  }))
  return {
    targetPath: selection.targetField.path,
    targetDescription: selection.targetField.schemaRef,
    sectionSummary: summariseSpecSections(spec),
    recentTurns: recent,
  }
}

function renderUserMessage(context: PhraseContext, selection: Selection): string {
  const summaryLines = context.sectionSummary
    .map((s) => `- ${s.section}: ${s.hasContent ? 'has content' : 'empty'}`)
    .join('\n')

  const recentLines = context.recentTurns.length
    ? context.recentTurns
        .map((t) => `- ${t.phase}${t.targetPath ? ` @ ${t.targetPath}` : ''}`)
        .join('\n')
    : '- (no prior turns)'

  return [
    `Target field: ${selection.targetField.path}`,
    `Section: ${selection.targetField.section}`,
    `Importance: ${selection.targetField.importance}`,
    `Description: ${context.targetDescription}`,
    '',
    'Section completeness:',
    summaryLines,
    '',
    'Recent turns:',
    recentLines,
    '',
    'Phrase the next question.',
  ].join('\n')
}

export async function phraseQuestion(
  client: LlmClient,
  selection: Selection,
  spec: CanonicalSpec,
  turns: ConversationTurn[],
  model: string,
  options: PhraseOptions = {},
): Promise<PhraseResult> {
  const context = buildPhraseContext(selection, spec, turns)
  const userText = renderUserMessage(context, selection)

  const messages: Message[] = [{ role: 'user', content: userText }]

  const response = await client.callModel({
    system: options.systemPrompt ?? PHRASE_PROMPT,
    messages,
    model,
    maxTokens: options.maxTokens ?? 400,
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  return {
    text,
    tokensIn: response.tokensIn,
    tokensOut: response.tokensOut,
    modelId: response.modelId,
  }
}
