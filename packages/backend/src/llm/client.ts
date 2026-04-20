import Anthropic from '@anthropic-ai/sdk'

export type TextBlock = { type: 'text'; text: string }
export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown }
export type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface CallModelArgs {
  system: string
  messages: Message[]
  tools?: Tool[]
  model: string
  maxTokens: number
}

export interface ModelResponse {
  content: ContentBlock[]
  tokensIn: number
  tokensOut: number
  modelId: string
  stopReason: string
}

export interface LlmClient {
  callModel(args: CallModelArgs): Promise<ModelResponse>
}

export class LlmTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM call timed out after ${timeoutMs}ms`)
    this.name = 'LlmTimeoutError'
  }
}

export class LlmRateLimitError extends Error {
  constructor(message = 'rate-limited after retries') {
    super(message)
    this.name = 'LlmRateLimitError'
  }
}

export interface CreateClientOptions {
  apiKey: string
  timeoutMs: number
  maxRetries?: number
  baseBackoffMs?: number
  sleep?: (ms: number) => Promise<void>
  sdk?: Anthropic
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429) return true
    if (err.status !== undefined && err.status >= 500 && err.status < 600) return true
  }
  return false
}

function is429(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 429
}

function extractBlocks(raw: Anthropic.Messages.Message): ContentBlock[] {
  const blocks: ContentBlock[] = []
  for (const b of raw.content) {
    if (b.type === 'text') {
      blocks.push({ type: 'text', text: b.text })
    } else if (b.type === 'tool_use') {
      blocks.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input })
    }
  }
  return blocks
}

export function createLlmClient(opts: CreateClientOptions): LlmClient {
  const {
    apiKey,
    timeoutMs,
    maxRetries = 3,
    baseBackoffMs = 500,
    sleep = defaultSleep,
  } = opts
  const sdk = opts.sdk ?? new Anthropic({ apiKey })

  async function callOnce(args: CallModelArgs): Promise<Anthropic.Messages.Message> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const payload: Anthropic.Messages.MessageCreateParamsNonStreaming = {
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: args.messages as Anthropic.Messages.MessageParam[],
      }
      if (args.tools && args.tools.length > 0) {
        payload.tools = args.tools as unknown as Anthropic.Messages.Tool[]
      }
      const response = await sdk.messages.create(payload, {
        signal: controller.signal,
      })
      return response
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('aborted'))
      ) {
        throw new LlmTimeoutError(timeoutMs)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async callModel(args: CallModelArgs): Promise<ModelResponse> {
      let attempt = 0
      let lastErr: unknown
      while (attempt < maxRetries) {
        try {
          const raw = await callOnce(args)
          return {
            content: extractBlocks(raw),
            tokensIn: raw.usage.input_tokens,
            tokensOut: raw.usage.output_tokens,
            modelId: raw.model,
            stopReason: raw.stop_reason ?? 'unknown',
          }
        } catch (err) {
          lastErr = err
          if (!isRetryable(err) || attempt === maxRetries - 1) break
          const backoff = baseBackoffMs * 2 ** attempt
          await sleep(backoff)
          attempt += 1
        }
      }
      if (is429(lastErr)) throw new LlmRateLimitError()
      throw lastErr
    },
  }
}
