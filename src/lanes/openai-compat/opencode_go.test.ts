/**
 * Focused OpenCode Go transport regressions.
 *
 * Run: bun run src/lanes/openai-compat/opencode_go.test.ts
 */

import assert from 'node:assert/strict'
import type { AnthropicStreamEvent } from '../../services/api/providers/base_provider.js'
import { OpenAICompatLane } from './loop.js'

type CapturedRequest = {
  url: string
  headers: Record<string, string>
  body: Record<string, any>
}

async function captureRequest(
  model: string,
): Promise<{ request: CapturedRequest; events: AnthropicStreamEvent[] }> {
  const lane = new OpenAICompatLane()
  lane.registerProvider('opencodego', 'test-opencode-key', 'https://opencode.ai/zen/go/v1')

  const oldFetch = globalThis.fetch
  const oldClient = process.env.OPENCODE_CLIENT
  process.env.OPENCODE_CLIENT = 'opencode-tau/test'
  let request: CapturedRequest | null = null

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    request = {
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, any>,
    }

    if (String(url).endsWith('/messages')) {
      const sse = [
        'event: message_start',
        `data: ${JSON.stringify({
          type: 'message_start',
          message: {
            id: 'msg_go_qwen',
            type: 'message',
            role: 'assistant',
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 3, output_tokens: 0 },
          },
        })}`,
        '',
        'event: content_block_start',
        `data: ${JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        })}`,
        '',
        'event: content_block_delta',
        `data: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'ok' },
        })}`,
        '',
        'event: content_block_stop',
        `data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}`,
        '',
        'event: message_delta',
        `data: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 1 },
        })}`,
        '',
        'event: message_stop',
        `data: ${JSON.stringify({ type: 'message_stop' })}`,
        '',
        '',
      ].join('\n')
      return new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const chunks = [
      {
        id: 'chatcmpl_go_glm',
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
      },
      {
        id: 'chatcmpl_go_glm',
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      },
    ]
    const sse = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')
      + 'data: [DONE]\n\n'
    return new Response(sse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }) as typeof fetch

  try {
    const events: AnthropicStreamEvent[] = []
    const stream = lane.streamAsProvider({
      model,
      messages: [{ role: 'user', content: 'hey' }],
      system: 'You are a coding agent.',
      tools: [],
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 512 },
      signal: new AbortController().signal,
      sessionId: 'session-fixed',
      providerHint: 'opencodego',
    })
    for await (const event of stream) events.push(event)
    assert(request, 'fetch was not called')
    return { request, events }
  } finally {
    globalThis.fetch = oldFetch
    if (oldClient === undefined) delete process.env.OPENCODE_CLIENT
    else process.env.OPENCODE_CLIENT = oldClient
    lane.unregisterProvider('opencodego')
  }
}

async function main(): Promise<void> {
  const qwen = await captureRequest('qwen3.7-max')
  assert.equal(qwen.request.url, 'https://opencode.ai/zen/go/v1/messages')
  assert.equal(qwen.request.headers['x-api-key'], 'test-opencode-key')
  assert.equal(qwen.request.headers.Authorization, undefined)
  assert.equal(qwen.request.body.thinking, undefined)
  assert.equal(qwen.request.body.reasoning, undefined)
  assert.equal(qwen.request.body.reasoning_effort, undefined)
  assert.deepEqual(qwen.request.body.messages, [{ role: 'user', content: 'hey' }])
  assert(qwen.events.some(event =>
    event.type === 'content_block_delta'
    && event.delta.type === 'text_delta'
    && event.delta.text === 'ok'))

  const glm = await captureRequest('glm-5.2')
  assert.equal(glm.request.url, 'https://opencode.ai/zen/go/v1/chat/completions')
  assert.equal(glm.request.body.thinking, undefined)
  assert.equal(glm.request.body.reasoning, undefined)
  assert.equal(glm.request.body.reasoning_effort, undefined)
  assert.equal(glm.request.body.enable_thinking, undefined)
  assert.equal(glm.request.body.chat_template_args, undefined)

  console.log('OpenCode Go focused transport tests passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
