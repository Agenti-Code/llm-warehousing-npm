import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Multi-Provider AI SDK Support', () => {
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

  describe('OpenAI Provider Integration', () => {
    it('logs OpenAI GPT-4 calls with full metadata via transport', async () => {
      // Test OpenAI-style logging by directly calling send
      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'openai.chat.completions.create',
        request: {
          args: [],
          kwargs: {
            model: 'gpt-4-turbo-preview',
            messages: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: 'What is AI?' }
            ],
            temperature: 0.7,
            max_tokens: 150,
            top_p: 1.0,
            frequency_penalty: 0,
            presence_penalty: 0
          }
        },
        response: {
          id: 'chatcmpl-openai-123',
          object: 'chat.completion',
          choices: [{
            message: { role: 'assistant', content: 'OpenAI response' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 10,
            total_tokens: 25
          }
        },
        request_id: 'chatcmpl-openai-123',
        latency_s: 1.2
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('openai.chat.completions.create');
      expect(body.request.kwargs.model).toBe('gpt-4-turbo-preview');
      expect(body.request.kwargs.temperature).toBe(0.7);
      expect(body.response.usage.total_tokens).toBe(25);
      expect(body.request_id).toBe('chatcmpl-openai-123');
    });

    it('logs OpenAI streaming responses via transport', async () => {
      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'openai.chat.completions.create',
        request: {
          args: [],
          kwargs: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Stream test' }],
            stream: true
          }
        },
        response: 'streaming_response',
        latency_s: 0.8
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.response).toBe('streaming_response');
      expect(body.request.kwargs.stream).toBe(true);
    });
  });

  describe('Anthropic Claude Integration', () => {
    it('logs Anthropic Claude calls via Vercel AI SDK', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const anthropicModel = {
        modelId: 'claude-3-sonnet-20240229',
        provider: 'anthropic',
        apiKey: 'test-anthropic-key'
      };

      const originalGenerateText = vi.fn(async (params: any) => ({
        text: 'Claude response about consciousness and AI',
        usage: {
          inputTokens: 25,
          outputTokens: 35,
          totalTokens: 60
        },
        finishReason: 'stop',
        rawResponse: {
          id: 'msg_claude_123',
          model: 'claude-3-sonnet-20240229',
          role: 'assistant',
          stop_reason: 'end_turn'
        }
      }));

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      const result = await generateText({
        model: anthropicModel,
        messages: [
          { role: 'user', content: 'Explain consciousness and AI in philosophical terms.' }
        ],
        maxTokens: 200,
        temperature: 0.8
      });

      expect(result.text).toContain('Claude response');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('ai.generateText');
      expect(body.request.kwargs.model.provider).toBe('anthropic');
      expect(body.request.kwargs.model.modelId).toBe('claude-3-sonnet-20240229');
      expect(body.response.usage.totalTokens).toBe(60);
    });

    it('logs Anthropic structured output generation', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const anthropicModel = {
        modelId: 'claude-3-haiku-20240307',
        provider: 'anthropic'
      };

      const personSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          occupation: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'age', 'occupation']
      };

      const originalGenerateObject = vi.fn(async (params: any) => ({
        object: {
          name: 'Dr. Sarah Chen',
          age: 34,
          occupation: 'AI Researcher',
          skills: ['Machine Learning', 'Neural Networks', 'Python']
        },
        usage: { inputTokens: 45, outputTokens: 25, totalTokens: 70 },
        finishReason: 'stop'
      }));

      const { generateObject } = patchVercelAIFunctions({ generateObject: originalGenerateObject });

      const result = await generateObject({
        model: anthropicModel,
        prompt: 'Generate a person profile for an AI researcher',
        schema: personSchema
      });

      expect(result.object.name).toBe('Dr. Sarah Chen');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('ai.generateObject');
      expect(body.request.kwargs.model.provider).toBe('anthropic');
      expect(body.request.kwargs.schema).toEqual(personSchema);
      expect(body.response.object.occupation).toBe('AI Researcher');
    });
  });

  describe('Cohere Integration', () => {
    it('logs Cohere Command-R calls', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const cohereModel = {
        modelId: 'command-r-plus',
        provider: 'cohere',
        apiKey: 'test-cohere-key'
      };

      const originalGenerateText = vi.fn(async (params: any) => ({
        text: 'Cohere Command-R response with excellent reasoning capabilities',
        usage: {
          inputTokens: 20,
          outputTokens: 40,
          totalTokens: 60
        },
        finishReason: 'stop',
        rawResponse: {
          id: 'cohere-gen-123',
          generations: [{
            text: 'Cohere Command-R response with excellent reasoning capabilities'
          }]
        }
      }));

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      const result = await generateText({
        model: cohereModel,
        prompt: 'Explain the benefits of retrieval-augmented generation (RAG)',
        maxTokens: 300,
        temperature: 0.6,
        topP: 0.9
      });

      expect(result.text).toContain('Cohere Command-R response');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('ai.generateText');
      expect(body.request.kwargs.model.provider).toBe('cohere');
      expect(body.request.kwargs.model.modelId).toBe('command-r-plus');
      expect(body.response.usage.totalTokens).toBe(60);
    });

    it('logs Cohere streaming text generation', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const cohereModel = {
        modelId: 'command-r',
        provider: 'cohere'
      };

      const mockStreamResult = {
        textStream: {
          [Symbol.asyncIterator]: async function* () {
            yield 'Cohere ';
            yield 'streaming ';
            yield 'response ';
            yield 'about RAG';
          }
        },
        usage: Promise.resolve({ inputTokens: 15, outputTokens: 25, totalTokens: 40 })
      };

      const originalStreamText = vi.fn(async () => mockStreamResult);

      const { streamText } = patchVercelAIFunctions({ streamText: originalStreamText });

      const result = await streamText({
        model: cohereModel,
        prompt: 'Stream about retrieval augmented generation'
      });

      expect(result.textStream).toBeDefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('ai.streamText');
      expect(body.request.kwargs.model.provider).toBe('cohere');
      expect(body.response).toBe('vercel_ai_streaming_response');
    });
  });

  describe('Google Gemini Integration', () => {
    it('logs Google Gemini Pro calls', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const geminiModel = {
        modelId: 'gemini-1.5-pro-latest',
        provider: 'google',
        apiKey: 'test-google-key'
      };

      const originalGenerateText = vi.fn(async (params: any) => ({
        text: 'Gemini Pro response with multimodal understanding capabilities',
        usage: {
          inputTokens: 30,
          outputTokens: 50,
          totalTokens: 80
        },
        finishReason: 'stop',
        rawResponse: {
          candidates: [{
            content: { parts: [{ text: 'Gemini Pro response...' }] },
            finishReason: 'STOP'
          }]
        }
      }));

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      const result = await generateText({
        model: geminiModel,
        messages: [
          { role: 'user', content: 'Explain multimodal AI capabilities' }
        ],
        maxTokens: 400,
        temperature: 0.7
      });

      expect(result.text).toContain('Gemini Pro response');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('ai.generateText');
      expect(body.request.kwargs.model.provider).toBe('google');
      expect(body.request.kwargs.model.modelId).toBe('gemini-1.5-pro-latest');
      expect(body.response.usage.totalTokens).toBe(80);
    });
  });

  describe('Mistral AI Integration', () => {
    it('logs Mistral Large calls', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const mistralModel = {
        modelId: 'mistral-large-latest',
        provider: 'mistral',
        apiKey: 'test-mistral-key'
      };

      const originalGenerateText = vi.fn(async (params: any) => ({
        text: 'Mistral Large response with advanced reasoning',
        usage: {
          inputTokens: 18,
          outputTokens: 32,
          totalTokens: 50
        },
        finishReason: 'stop',
        rawResponse: {
          id: 'mistral-123',
          model: 'mistral-large-latest',
          choices: [{
            message: { content: 'Mistral Large response with advanced reasoning' }
          }]
        }
      }));

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      const result = await generateText({
        model: mistralModel,
        messages: [
          { role: 'user', content: 'Compare different reasoning approaches in AI' }
        ],
        maxTokens: 250,
        temperature: 0.5
      });

      expect(result.text).toContain('Mistral Large response');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.sdk_method).toBe('ai.generateText');
      expect(body.request.kwargs.model.provider).toBe('mistral');
      expect(body.request.kwargs.model.modelId).toBe('mistral-large-latest');
    });
  });

  describe('Cross-Provider Compatibility', () => {
    it('handles different provider response formats consistently', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const providers = [
        {
          name: 'openai',
          model: { modelId: 'gpt-4', provider: 'openai' },
          response: { text: 'OpenAI response', usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 } }
        },
        {
          name: 'anthropic',
          model: { modelId: 'claude-3-sonnet', provider: 'anthropic' },
          response: { text: 'Claude response', usage: { inputTokens: 12, outputTokens: 18, totalTokens: 30 } }
        },
        {
          name: 'cohere',
          model: { modelId: 'command-r', provider: 'cohere' },
          response: { text: 'Cohere response', usage: { inputTokens: 8, outputTokens: 12, totalTokens: 20 } }
        }
      ];

      const originalGenerateText = vi.fn(async (params: any) => {
        const provider = providers.find(p => p.model.provider === params.model.provider);
        return provider?.response || { text: 'Unknown provider', usage: { totalTokens: 0 } };
      });

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      for (const provider of providers) {
        await generateText({
          model: provider.model,
          prompt: `Test ${provider.name} provider`
        });
      }

      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Verify each provider call was logged correctly
      for (let i = 0; i < 3; i++) {
        const [, init] = fetchSpy.mock.calls[i];
        const body = JSON.parse(String((init as any).body));

        expect(body.sdk_method).toBe('ai.generateText');
        expect(body.request.kwargs.model.provider).toBe(providers[i].model.provider);
        expect(body.response.usage.totalTokens).toBe(providers[i].response.usage.totalTokens);
      }
    });

    it('handles provider-specific error formats', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const providerErrors = [
        {
          provider: 'openai',
          error: new Error('OpenAI API Error: Rate limit exceeded')
        },
        {
          provider: 'anthropic',
          error: new Error('Anthropic API Error: Invalid model')
        },
        {
          provider: 'cohere',
          error: new Error('Cohere API Error: Authentication failed')
        }
      ];

      let errorIndex = 0;
      const originalGenerateText = vi.fn(async () => {
        throw providerErrors[errorIndex++].error;
      });

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      for (const { provider, error } of providerErrors) {
        await expect(generateText({
          model: { modelId: 'test-model', provider },
          prompt: 'Test error handling'
        })).rejects.toThrow(error.message);
      }

      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Verify errors were logged correctly
      for (let i = 0; i < 3; i++) {
        const [, init] = fetchSpy.mock.calls[i];
        const body = JSON.parse(String((init as any).body));

        expect(body.sdk_method).toBe('ai.generateText');
        expect(body.error).toContain(providerErrors[i].error.message);
      }
    });

    it('preserves provider-specific metadata', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const originalGenerateText = vi.fn(async (params: any) => ({
        text: 'Response with metadata',
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        finishReason: 'stop',
        // Provider-specific metadata
        rawResponse: {
          id: `${params.model.provider}-response-123`,
          model: params.model.modelId,
          provider_metadata: {
            confidence: 0.95,
            safety_rating: 'safe',
            latency_ms: 1200
          }
        }
      }));

      const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });

      await generateText({
        model: { modelId: 'test-model', provider: 'custom-provider' },
        prompt: 'Test metadata preservation'
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((init as any).body));

      expect(body.response).toBeDefined();
      expect(body.response.rawResponse).toBeDefined();
      expect(body.response.rawResponse.provider_metadata).toBeDefined();
      expect(body.response.rawResponse.provider_metadata.confidence).toBe(0.95);
      expect(body.response.rawResponse.provider_metadata.safety_rating).toBe('safe');
    });
  });
});