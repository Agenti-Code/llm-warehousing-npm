import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Comprehensive Vercel AI SDK Coverage', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV, LLM_WAREHOUSE_API_KEY: 'test-key', LLM_WAREHOUSE_URL: 'http://localhost:9999' } as any;
    // @ts-ignore
    global.fetch = fetchSpy;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('patches generateText and logs comprehensive metadata', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const originalGenerateText = vi.fn(async (params: any) => ({
      text: 'Generated response text',
      usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
      finishReason: 'stop',
      warnings: [],
      rawResponse: { headers: {} }
    }));

    const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

    const result = await generateText({
      model: 'gpt-4',
      prompt: 'Write a haiku about coding',
      maxTokens: 50,
      temperature: 0.7,
      topP: 0.9
    });

    expect(result.text).toBe('Generated response text');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));

    expect(body.sdk_method).toBe('ai.generateText');
    expect(body.request.kwargs.model).toBe('gpt-4');
    expect(body.request.kwargs.prompt).toBe('Write a haiku about coding');
    expect(body.request.kwargs.maxTokens).toBe(50);
    expect(body.request.kwargs.temperature).toBe(0.7);
    expect(body.response.usage.totalTokens).toBe(40);
    expect(body.latency_s).toBeGreaterThanOrEqual(0);
  });

  it('patches generateObject with schema validation', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const mockSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      }
    };

    const originalGenerateObject = vi.fn(async (params: any) => ({
      object: { name: 'John Doe', age: 30 },
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      finishReason: 'stop'
    }));

    const { generateObject } = patchVercelAIFunctions({ generateObject: originalGenerateObject });

    const result = await generateObject({
      model: 'gpt-4',
      prompt: 'Generate a person object',
      schema: mockSchema
    });

    expect(result.object).toEqual({ name: 'John Doe', age: 30 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));

    expect(body.sdk_method).toBe('ai.generateObject');
    // Note: the schema replacement happens in wrapVercelAIMethod, but our tests mock the functions directly
    // so we expect the actual schema object here
    expect(body.request.kwargs.schema).toEqual(mockSchema);
    expect(body.response.object.name).toBe('John Doe');
  });

  it('patches streamText with async iterator handling', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const mockStreamResult = {
      textStream: {
        [Symbol.asyncIterator]: async function* () {
          yield 'Hello ';
          yield 'world!';
        }
      },
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 15, totalTokens: 20 }),
      finishReason: Promise.resolve('stop')
    };

    const originalStreamText = vi.fn(async (params: any) => mockStreamResult);

    const { streamText } = patchVercelAIFunctions({ streamText: originalStreamText });

    const result = await streamText({
      model: 'gpt-4',
      prompt: 'Say hello',
      maxTokens: 100
    });

    expect(result.textStream).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));

    expect(body.sdk_method).toBe('ai.streamText');
    expect(body.response).toBe('vercel_ai_streaming_response');
  });

  it('patches streamObject with streaming schema responses', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const mockSchema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    };

    const mockStreamResult = {
      objectStream: {
        [Symbol.asyncIterator]: async function* () {
          yield { items: ['item1'] };
          yield { items: ['item1', 'item2'] };
        }
      },
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 })
    };

    const originalStreamObject = vi.fn(async (params: any) => mockStreamResult);

    const { streamObject } = patchVercelAIFunctions({ streamObject: originalStreamObject });

    const result = await streamObject({
      model: 'gpt-4',
      prompt: 'Generate a list of items',
      schema: mockSchema
    });

    expect(result.objectStream).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));

    expect(body.sdk_method).toBe('ai.streamObject');
    expect(body.response).toBe('vercel_ai_streaming_response');
    expect(body.request.kwargs.schema).toEqual(mockSchema);
  });

  it('handles tool calling scenarios', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const mockTools = {
      weather: {
        description: 'Get weather information',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          }
        }
      }
    };

    const originalGenerateText = vi.fn(async (params: any) => ({
      text: 'The weather in Paris is sunny.',
      usage: { inputTokens: 25, outputTokens: 15, totalTokens: 40 },
      finishReason: 'tool_calls',
      toolCalls: [
        {
          toolCallId: 'call_123',
          toolName: 'weather',
          args: { location: 'Paris' }
        }
      ]
    }));

    const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

    const result = await generateText({
      model: 'gpt-4',
      prompt: 'What is the weather in Paris?',
      tools: mockTools
    });

    expect(result.toolCalls).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));

    expect(body.sdk_method).toBe('ai.generateText');
    expect(body.request.kwargs.tools).toEqual(mockTools);
    expect(body.response.toolCalls).toBeDefined();
    expect(body.response.toolCalls).toHaveLength(1);
    expect(body.response.toolCalls[0].toolName).toBe('weather');
  });

  it('handles different AI providers with model wrapping', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    // Mock different provider models
    const anthropicModel = {
      modelId: 'claude-3-sonnet',
      provider: 'anthropic'
    };

    const cohereModel = {
      modelId: 'command-r-plus',
      provider: 'cohere'
    };

    const originalGenerateText = vi.fn(async (params: any) => ({
      text: 'Response from provider',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      finishReason: 'stop'
    }));

    const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

    // Test Anthropic
    await generateText({
      model: anthropicModel,
      prompt: 'Hello from Anthropic'
    });

    // Test Cohere
    await generateText({
      model: cohereModel,
      prompt: 'Hello from Cohere'
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Check Anthropic call
    const [, anthropicInit] = fetchSpy.mock.calls[0];
    const anthropicBody = JSON.parse(String((anthropicInit as any).body));
    expect(anthropicBody.request.kwargs.model.provider).toBe('anthropic');

    // Check Cohere call
    const [, cohereInit] = fetchSpy.mock.calls[1];
    const cohereBody = JSON.parse(String((cohereInit as any).body));
    expect(cohereBody.request.kwargs.model.provider).toBe('cohere');
  });

  it('handles errors in AI SDK functions gracefully', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const originalGenerateText = vi.fn(async (params: any) => {
      throw new Error('AI provider rate limit exceeded');
    });

    const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

    await expect(generateText({
      model: 'gpt-4',
      prompt: 'This will fail'
    })).rejects.toThrow('AI provider rate limit exceeded');

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));

    expect(body.sdk_method).toBe('ai.generateText');
    expect(body.error).toContain('AI provider rate limit exceeded');
    expect(body.latency_s).toBeGreaterThanOrEqual(0);
  });

  it('preserves original function behavior when patching', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const originalGenerateText = vi.fn(async (params: any) => {
      // Simulate some processing
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        text: `Processed: ${params.prompt}`,
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        finishReason: 'stop'
      };
    });

    const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

    const result = await generateText({
      model: 'gpt-4',
      prompt: 'Test input'
    });

    // Verify original function was called with correct params
    expect(originalGenerateText).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Test input'
    });

    // Verify result is unchanged
    expect(result.text).toBe('Processed: Test input');
    expect(result.usage.totalTokens).toBe(15);

    // Verify logging happened
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});