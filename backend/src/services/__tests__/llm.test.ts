import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../../config/env', () => ({ env: { GEMINI_API_KEY: 'test-gemini-key' } }))
import { callLlm, callLlmWithTools, parseLlmJson } from '../llm'

const mockFetchOk = (text: string) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  })

describe('callLlm (Gemini)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('separa los mensajes role:system en systemInstruction y mapea assistant->model', async () => {
    const fetchMock = mockFetchOk('{"ok":true}')
    vi.stubGlobal('fetch', fetchMock)

    await callLlm(
      [
        { role: 'system', content: 'Eres un asistente' },
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Hola, en que ayudo' },
      ],
      { model: 'gemini-3.6-flash', json: true }
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('gemini-3.6-flash:generateContent')
    const body = JSON.parse(init.body)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Eres un asistente' }] })
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hola' }] },
      { role: 'model', parts: [{ text: 'Hola, en que ayudo' }] },
    ])
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('apaga el thinking (thinkingBudget: 0) en toda llamada -- gemini-3.6-flash lo factura por defecto', async () => {
    const fetchMock = mockFetchOk('hola')
    vi.stubGlobal('fetch', fetchMock)

    await callLlm([{ role: 'user', content: 'hola' }], { model: 'gemini-3.6-flash' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('no incluye responseMimeType si json no se pide', async () => {
    const fetchMock = mockFetchOk('hola')
    vi.stubGlobal('fetch', fetchMock)

    await callLlm([{ role: 'user', content: 'hola' }], { model: 'gemini-3.6-flash' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.generationConfig.responseMimeType).toBeUndefined()
  })

  it('incluye tools solo si se pasan explicitamente (busqueda de precios)', async () => {
    const fetchMock = mockFetchOk('resultado de busqueda')
    vi.stubGlobal('fetch', fetchMock)

    await callLlm([{ role: 'user', content: 'cobre 1/2' }], {
      model: 'gemini-3.6-flash',
      tools: [{ google_search: {} }],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.tools).toEqual([{ google_search: {} }])
    expect(body.generationConfig.responseMimeType).toBeUndefined()
  })

  it('lanza 502 si la respuesta no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    )
    await expect(
      callLlm([{ role: 'user', content: 'hola' }], { model: 'gemini-3.6-flash' })
    ).rejects.toMatchObject({ status: 502 })
  })

  it('lanza 503 con mensaje explicito si Gemini responde 429 (cupo agotado), no 502 generico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}',
      })
    )
    await expect(
      callLlm([{ role: 'user', content: 'hola' }], { model: 'gemini-3.6-flash' })
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining('cupo') })
  })

  it('lanza 502 si el fetch falla (red/timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(
      callLlm([{ role: 'user', content: 'hola' }], { model: 'gemini-3.6-flash' })
    ).rejects.toMatchObject({ status: 502 })
  })

  it('callLlmWithTools envia functionDeclarations y parsea llamadas de herramientas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'buscar_catalogo',
                    args: { termino: 'cobre' },
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const turn = await callLlmWithTools([{ role: 'user', parts: [{ text: 'busca cobre' }] }], {
      model: 'gemini-3.6-flash',
      systemInstruction: 'Instruccion',
      functionDeclarations: [
        {
          name: 'buscar_catalogo',
          description: 'Busca en catalogo',
          parameters: { type: 'object', properties: { termino: { type: 'string' } } },
        },
      ],
    })

    expect(turn.functionCalls).toEqual([{ name: 'buscar_catalogo', args: { termino: 'cobre' } }])
    expect(turn.usage.tokensIn).toBe(15)
    expect(turn.usage.tokensOut).toBe(8)
    const reqBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(reqBody.tools[0].functionDeclarations).toHaveLength(1)
  })

  it('lanza 503 si GEMINI_API_KEY no esta configurada', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({ env: { GEMINI_API_KEY: undefined } }))
    const { callLlm: callLlmSinKey } = await import('../llm')
    await expect(
      callLlmSinKey([{ role: 'user', content: 'hola' }], { model: 'gemini-3.6-flash' })
    ).rejects.toMatchObject({ status: 503 })
    vi.doUnmock('../../config/env')
  })
})

describe('OmniRoute delegation & fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.doUnmock('../../config/env')
  })

  it('delega callLlm a OmniRoute en formato OpenAI cuando OMNIROUTE_URL está configurada', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
        OMNIROUTE_URL: 'http://127.0.0.1:20128/v1',
        OMNIROUTE_API_KEY: 'test-omni-key',
        OMNIROUTE_MODEL: 'gemini/gemini-3.6-flash',
      },
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Respuesta desde OmniRoute' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { callLlm: omniCall } = await import('../llm')
    const res = await omniCall(
      [
        { role: 'system', content: 'Eres un bot' },
        { role: 'user', content: 'Hola' },
      ],
      { model: 'gemini-3.6-flash' }
    )

    expect(res).toBe('Respuesta desde OmniRoute')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:20128/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer test-omni-key')
  })

  it('degrada automáticamente a Gemini directo si OmniRoute falla', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
        OMNIROUTE_URL: 'http://127.0.0.1:20128/v1',
        OMNIROUTE_API_KEY: 'test-omni-key',
      },
    }))
    const fetchMock = vi
      .fn()
      // Primera llamada a OmniRoute falla:
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'OmniRoute overloaded',
      })
      // Segunda llamada de fallback a Gemini triunfa:
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Fallback desde Gemini directo' }] } }],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { callLlm: omniCall } = await import('../llm')
    const res = await omniCall([{ role: 'user', content: 'Hola' }], { model: 'gemini-3.6-flash' })

    expect(res).toBe('Fallback desde Gemini directo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('delega callLlmWithTools a OmniRoute y parsea tool_calls de OpenAI', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
        OMNIROUTE_URL: 'http://127.0.0.1:20128/v1',
        OMNIROUTE_MODEL: 'gemini/gemini-3.6-flash',
      },
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_999',
                  type: 'function',
                  function: {
                    name: 'buscar_catalogo',
                    arguments: '{"query":"sensor"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 12 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { callLlmWithTools: omniWithTools } = await import('../llm')
    const turn = await omniWithTools([{ role: 'user', parts: [{ text: 'busca sensor' }] }], {
      model: 'gemini-3.6-flash',
      systemInstruction: 'Actua como agente',
      functionDeclarations: [
        {
          name: 'buscar_catalogo',
          description: 'Busca catalogo',
          parameters: { type: 'object' },
        },
      ],
    })

    expect(turn.functionCalls).toEqual([
      { id: 'call_999', name: 'buscar_catalogo', args: { query: 'sensor' } },
    ])
    expect(turn.usage).toEqual({ tokensIn: 30, tokensOut: 12 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:20128/v1/chat/completions')
  })

  it('usa LOCAL_LLM_URL (OpenJarvis/Ollama) con prioridad sobre la nube en estrategia hybrid', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
        LOCAL_LLM_URL: 'http://localhost:11434/v1',
        LOCAL_LLM_MODEL: 'qwen2.5:7b',
        LLM_ROUTING_STRATEGY: 'hybrid',
      },
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Respuesta desde Ollama local' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { callLlm: localCall } = await import('../llm')
    const res = await localCall([{ role: 'user', content: 'Precio cobre' }], {
      model: 'gemini-3.6-flash',
    })

    expect(res).toBe('Respuesta desde Ollama local')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('rechaza con 503 si LLM_ROUTING_STRATEGY=local_only y el motor local falla (sin fallback a nube)', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
        LOCAL_LLM_URL: 'http://localhost:11434/v1',
        LLM_ROUTING_STRATEGY: 'local_only',
      },
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Ollama crashed',
    })
    vi.stubGlobal('fetch', fetchMock)

    const { callLlm: localCall } = await import('../llm')
    await expect(
      localCall([{ role: 'user', content: 'Test' }], { model: 'gemini-3.6-flash' })
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('LLM_ROUTING_STRATEGY=local_only'),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('salta el motor local si LLM_ROUTING_STRATEGY=cloud_only', async () => {
    vi.resetModules()
    vi.doMock('../../config/env', () => ({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
        LOCAL_LLM_URL: 'http://localhost:11434/v1',
        LLM_ROUTING_STRATEGY: 'cloud_only',
      },
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Directo de Gemini Cloud' }] } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { callLlm: cloudCall } = await import('../llm')
    const res = await cloudCall([{ role: 'user', content: 'Test' }], { model: 'gemini-3.6-flash' })

    expect(res).toBe('Directo de Gemini Cloud')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('googleapis.com')
  })
})

describe('parseLlmJson', () => {
  it('parsea JSON puro', () => {
    expect(parseLlmJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it('extrae el primer objeto si viene envuelto en texto/markdown (respuesta con grounding)', () => {
    expect(
      parseLlmJson<{ a: number }>('Aqui esta el resultado:\n```json\n{"a":1}\n```\nListo.')
    ).toEqual({ a: 1 })
  })

  it('lanza si no hay JSON valido en ningun lado', () => {
    expect(() => parseLlmJson('no hay json aca')).toThrow()
  })
})
