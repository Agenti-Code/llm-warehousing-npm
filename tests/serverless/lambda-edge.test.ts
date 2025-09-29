import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Serverless Environment Compatibility', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    vi.resetModules();
    fetchSpy.mockClear();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('AWS Lambda Environment', () => {
    beforeEach(() => {
      // Mock AWS Lambda environment
      process.env = {
        ...OLD_ENV,
        AWS_LAMBDA_FUNCTION_NAME: 'llm-warehouse-test',
        AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
        AWS_REGION: 'us-east-1',
        AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs18.x',
        LLM_WAREHOUSE_API_KEY: 'lambda-key',
        LLM_WAREHOUSE_URL: 'https://lambda-warehouse.example.com',
        LLM_WAREHOUSE_DEBUG: '1'
      } as any;

      // @ts-ignore
      global.fetch = fetchSpy;
    });

    it('works in AWS Lambda context with cold start', async () => {
      // Simulate cold start scenario
      const lambdaContext = {
        functionName: 'llm-warehouse-test',
        functionVersion: '$LATEST',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:llm-warehouse-test',
        memoryLimitInMB: '128',
        awsRequestId: 'test-request-id',
        getRemainingTimeInMillis: vi.fn(() => 5000)
      };

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'lambda.coldstart.test',
        request: { args: [], kwargs: { context: lambdaContext.functionName } },
        response: { text: 'Lambda response', usage: { total_tokens: 20 } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://lambda-warehouse.example.com/llm-logs',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer lambda-key'
          }
        })
      );

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse((init as any).body);
      expect(body.env).toBeDefined();
      // Note: Environment variables are captured in the transport layer
      // The test verifies the logging works in Lambda context
    });

    it('handles Lambda timeouts gracefully', async () => {
      // Mock a timeout scenario
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Lambda timeout')), 100);
      });

      fetchSpy.mockImplementation(() => timeoutPromise);

      const { send } = await import('../../src/transport.ts');

      // Should handle timeout without crashing
      await send({
        sdk_method: 'lambda.timeout.test',
        request: { args: [], kwargs: {} }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('works with Lambda layers and dependencies', async () => {
      // Test module loading with Lambda layers
      const modules = await Promise.all([
        import('../../src/index.ts'),
        import('../../src/patch.ts'),
        import('../../src/observify.ts')
      ]);

      modules.forEach(module => {
        expect(module).toBeDefined();
      });

      const { installPatch } = modules[1];
      expect(installPatch).toBeDefined();
    });
  });

  describe('Vercel Edge Functions', () => {
    beforeEach(() => {
      // Mock Vercel Edge environment
      process.env = {
        ...OLD_ENV,
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_REGION: 'iad1',
        VERCEL_URL: 'edge-function.vercel.app',
        LLM_WAREHOUSE_API_KEY: 'vercel-edge-key',
        LLM_WAREHOUSE_URL: 'https://vercel-warehouse.example.com'
      } as any;

      // Mock Edge Runtime globals
      (globalThis as any).EdgeRuntime = '1.0.0';
      (globalThis as any).navigator = {
        userAgent: 'Vercel Edge Runtime'
      };

      // @ts-ignore
      global.fetch = fetchSpy;
    });

    it('works in Vercel Edge Functions', async () => {
      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'vercel.edge.test',
        request: { args: [], kwargs: { region: process.env.VERCEL_REGION } },
        response: { text: 'Edge response', usage: { total_tokens: 15 } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse((init as any).body);
      expect(body.sdk_method).toBe('vercel.edge.test');
      expect(body.env).toBeDefined();
      // Note: Environment variables are captured in the transport layer
    });

    it('handles Edge Runtime limitations', async () => {
      // Mock Edge Runtime with limited APIs
      const originalConsole = console;
      const mockConsole = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };
      // @ts-ignore
      global.console = mockConsole;

      try {
        const { send } = await import('../../src/transport.ts');

        await send({
          sdk_method: 'vercel.edge.limited.test',
          request: { args: [], kwargs: {} }
        } as any);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        // @ts-ignore
        global.console = originalConsole;
      }
    });

    it('supports streaming responses in Edge', async () => {
      const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
      installPatch();

      const originalStreamText = vi.fn(async () => ({
        textStream: {
          [Symbol.asyncIterator]: async function* () {
            yield 'Streaming ';
            yield 'from ';
            yield 'edge!';
          }
        }
      }));

      const { streamText } = patchVercelAIFunctions({ streamText: originalStreamText });

      const result = await streamText({
        model: 'gpt-4',
        prompt: 'Stream test'
      });

      expect(result.textStream).toBeDefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse((init as any).body);
      expect(body.response).toBe('vercel_ai_streaming_response');
    });
  });

  describe('CloudFlare Workers', () => {
    beforeEach(() => {
      // Mock CloudFlare Workers environment
      process.env = {
        ...OLD_ENV,
        LLM_WAREHOUSE_API_KEY: 'cf-worker-key',
        LLM_WAREHOUSE_URL: 'https://cf-warehouse.example.com'
      } as any;

      // Mock CloudFlare Workers globals
      (globalThis as any).WorkerGlobalScope = {};
      (globalThis as any).caches = {
        default: {
          match: vi.fn(),
          put: vi.fn()
        }
      };

      // @ts-ignore
      global.fetch = fetchSpy;
    });

    it('works in CloudFlare Workers', async () => {
      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'cloudflare.worker.test',
        request: { args: [], kwargs: { worker: true } },
        response: { text: 'Worker response', usage: { total_tokens: 25 } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://cf-warehouse.example.com/llm-logs',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer cf-worker-key'
          }
        })
      );
    });

    it('handles CloudFlare Workers KV storage context', async () => {
      // Mock KV namespace
      (globalThis as any).KV_NAMESPACE = {
        get: vi.fn(async () => '{"cached": "data"}'),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {})
      };

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'cloudflare.kv.test',
        request: { args: [], kwargs: { useKV: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('supports CloudFlare Workers Durable Objects context', async () => {
      // Mock Durable Object environment
      const mockDurableObject = {
        id: 'test-object-id',
        storage: {
          get: vi.fn(async () => 'stored-value'),
          put: vi.fn(async () => {}),
          list: vi.fn(async () => new Map())
        }
      };

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'cloudflare.durable.test',
        request: { args: [], kwargs: { objectId: mockDurableObject.id } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('General Serverless Patterns', () => {
    it('handles cold start optimization', async () => {
      // Simulate cold start timing
      const coldStartTime = performance.now();

      process.env = {
        ...OLD_ENV,
        LLM_WAREHOUSE_API_KEY: 'serverless-key',
        LLM_WAREHOUSE_URL: 'https://serverless-warehouse.example.com'
      } as any;

      // @ts-ignore
      global.fetch = fetchSpy;

      const { installPatch } = await import('../../src/patch.ts');
      installPatch();

      const warmupTime = performance.now();
      const coldStartDuration = warmupTime - coldStartTime;

      expect(coldStartDuration).toBeGreaterThan(0);
      expect(coldStartDuration).toBeLessThan(1000); // Should be fast
    });

    it('supports environment variable injection patterns', async () => {
      // Test different serverless env patterns
      const envConfigs = [
        {
          LLM_WAREHOUSE_API_KEY: 'env-key-1',
          LLM_WAREHOUSE_URL: 'https://env1.example.com'
        },
        {
          LLM_WAREHOUSE_API_KEY: 'env-key-2',
          LLM_WAREHOUSE_URL: 'https://env2.example.com'
        }
      ];

      // @ts-ignore
      global.fetch = fetchSpy;

      for (const envConfig of envConfigs) {
        vi.resetModules();
        process.env = { ...OLD_ENV, ...envConfig } as any;

        const { send } = await import('../../src/transport.ts');

        await send({
          sdk_method: 'serverless.env.test',
          request: { args: [], kwargs: {} }
        } as any);
      }

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('handles serverless memory constraints', async () => {
      // Mock low memory scenario
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn(() => ({
        rss: 50 * 1024 * 1024, // 50MB
        heapTotal: 30 * 1024 * 1024,
        heapUsed: 25 * 1024 * 1024,
        external: 1 * 1024 * 1024,
        arrayBuffers: 0
      }));

      try {
        process.env = {
          ...OLD_ENV,
          LLM_WAREHOUSE_API_KEY: 'memory-test-key',
          LLM_WAREHOUSE_URL: 'https://memory-warehouse.example.com'
        } as any;

        // @ts-ignore
        global.fetch = fetchSpy;

        const { send } = await import('../../src/transport.ts');

        await send({
          sdk_method: 'serverless.memory.test',
          request: { args: [], kwargs: {} }
        } as any);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        process.memoryUsage = originalMemoryUsage;
      }
    });

    it('supports async/await patterns in serverless handlers', async () => {
      process.env = {
        ...OLD_ENV,
        LLM_WAREHOUSE_API_KEY: 'async-test-key',
        LLM_WAREHOUSE_URL: 'https://async-warehouse.example.com'
      } as any;

      // @ts-ignore
      global.fetch = fetchSpy;

      // Simulate serverless handler pattern
      const handler = async (event: any, context: any) => {
        const { send } = await import('../../src/transport.ts');

        await send({
          sdk_method: 'serverless.handler.test',
          request: { args: [event, context], kwargs: {} }
        } as any);

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true })
        };
      };

      const result = await handler({ test: 'event' }, { requestId: 'test-123' });

      expect(result.statusCode).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});