import type {
  CallModelArgs,
  ContentBlock,
  LlmClient,
  ModelResponse,
} from '../../src/llm/client.js'

export interface ScriptedResponse {
  content: ContentBlock[]
  tokensIn?: number
  tokensOut?: number
  modelId?: string
  stopReason?: string
}

export class ScriptedLlmClient implements LlmClient {
  private readonly queue: Array<ScriptedResponse | (() => ScriptedResponse) | Error>
  public readonly calls: CallModelArgs[] = []

  constructor(scripts: Array<ScriptedResponse | (() => ScriptedResponse) | Error> = []) {
    this.queue = [...scripts]
  }

  push(script: ScriptedResponse | (() => ScriptedResponse) | Error): void {
    this.queue.push(script)
  }

  async callModel(args: CallModelArgs): Promise<ModelResponse> {
    this.calls.push(args)
    const next = this.queue.shift()
    if (!next) throw new Error('ScriptedLlmClient ran out of responses')
    if (next instanceof Error) throw next
    const script = typeof next === 'function' ? next() : next
    return {
      content: script.content,
      tokensIn: script.tokensIn ?? 100,
      tokensOut: script.tokensOut ?? 10,
      modelId: script.modelId ?? 'claude-test',
      stopReason: script.stopReason ?? 'end_turn',
    }
  }
}

export function textResponse(text: string, tokensIn = 50, tokensOut = 20): ScriptedResponse {
  return {
    content: [{ type: 'text', text }],
    tokensIn,
    tokensOut,
  }
}

export function toolResponse(
  input: unknown,
  tokensIn = 80,
  tokensOut = 40,
): ScriptedResponse {
  return {
    content: [
      { type: 'tool_use', id: 'toolu_test', name: 'record_answer', input },
    ],
    tokensIn,
    tokensOut,
    stopReason: 'tool_use',
  }
}
