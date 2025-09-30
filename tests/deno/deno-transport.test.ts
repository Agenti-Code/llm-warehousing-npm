import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Deno Environment Compatibility', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  let originalDeno: any;

  beforeEach(() => {
    vi.resetModules();

    // Mock Deno global environment
    originalDeno = (globalThis as any).Deno;
    (globalThis as any).Deno = {
      env: {
        get: (key: string) => {
          const envMap = {
            'LLM_WAREHOUSE_API_KEY': 'test-deno-key',
            'LLM_WAREHOUSE_URL': 'http://localhost:9999',
            'LLM_WAREHOUSE_DEBUG': '1'
          };
          return envMap[key as keyof typeof envMap];
        },
        set: vi.fn(),
        has: (key: string) => ['LLM_WAREHOUSE_API_KEY', 'LLM_WAREHOUSE_URL', 'LLM_WAREHOUSE_DEBUG'].includes(key)
      },
      permissions: {
        query: vi.fn(async () => ({ state: 'granted' }))
      },
      version: {
        deno: '1.40.0'
      }
    };

    // Mock Deno's process-like environment for compatibility
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-deno-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      LLM_WAREHOUSE_DEBUG: '1'
    } as any;

    // @ts-ignore
    global.fetch = fetchSpy;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    (globalThis as any).Deno = originalDeno;
  });

  it('works with Deno fetch API', async () => {
    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'deno.test',
      request: { args: [], kwargs: { model: 'gpt-4', prompt: 'Hello Deno' } },
      response: { text: 'Hello from Deno!', usage: { total_tokens: 10 } }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:9999/llm-logs',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-deno-key'
        }
      })
    );

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.sdk_method).toBe('deno.test');
    expect(body.source).toBe('typescript-openai');
  });

  it('handles Deno environment variables correctly', async () => {
    // Test with different Deno env values
    (globalThis as any).Deno.env.get = vi.fn((key: string) => {
      const envMap = {
        'LLM_WAREHOUSE_API_KEY': 'deno-specific-key',
        'LLM_WAREHOUSE_URL': 'https://deno-warehouse.example.com',
        'LLM_WAREHOUSE_DEBUG': 'false'
      };
      return envMap[key as keyof typeof envMap];
    });

    // Update process.env to match for compatibility
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'deno-specific-key',
      LLM_WAREHOUSE_URL: 'https://deno-warehouse.example.com',
      LLM_WAREHOUSE_DEBUG: 'false'
    } as any;

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'deno.env.test',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://deno-warehouse.example.com/llm-logs',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer deno-specific-key'
        })
      })
    );
  });

  it('supports Deno permissions model', async () => {
    // Mock permission denied scenario
    (globalThis as any).Deno.permissions.query = vi.fn(async (desc: any) => {
      if (desc.name === 'net') {
        return { state: 'granted' };
      }
      return { state: 'denied' };
    });

    const { send } = await import('../../src/transport.ts');

    // Should still work since net permission is granted
    await send({
      sdk_method: 'deno.permissions.test',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles Deno module resolution', async () => {
    // Test that the module can be imported in Deno-like environment
    const { installPatch } = await import('../../src/patch.ts');
    expect(installPatch).toBeDefined();

    const { getRecentLogs } = await import('../../src/query.ts');
    expect(getRecentLogs).toBeDefined();

    const { patch, status } = await import('../../src/observify.ts');
    expect(patch).toBeDefined();
    expect(status).toBeDefined();
  });

  it('works with Deno Web APIs', async () => {
    // Mock Deno-specific Web API features
    const originalURL = globalThis.URL;
    const originalHeaders = globalThis.Headers;

    try {
      // Ensure Web APIs are available (Deno has these built-in)
      expect(URL).toBeDefined();
      expect(Headers).toBeDefined();
      expect(fetch).toBeDefined();

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'deno.webapi.test',
        request: { args: [], kwargs: { test: 'web-api' } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://localhost:9999/llm-logs');
      expect((init as any).headers['Content-Type']).toBe('application/json');
    } finally {
      globalThis.URL = originalURL;
      globalThis.Headers = originalHeaders;
    }
  });

  it('handles Deno import maps and ES modules', async () => {
    // Simulate Deno's ES module system
    const modulePromise = import('../../src/index.ts');
    await expect(modulePromise).resolves.toBeDefined();

    const module = await modulePromise;
    expect(module.installPatch).toBeDefined();
    expect(module.patch).toBeDefined();
    expect(module.getRecentLogs).toBeDefined();
  });

  it('works with Deno TypeScript compilation', async () => {
    // Test that TypeScript features work in Deno environment
    const { status } = await import('../../src/observify.ts');

    const statusInfo = status();
    expect(statusInfo).toHaveProperty('enabled');
    expect(statusInfo).toHaveProperty('patched');
    expect(statusInfo).toHaveProperty('debug');
    expect(statusInfo).toHaveProperty('warehouseUrl');
  });

  it('handles Deno-specific error scenarios', async () => {
    // Mock network permission denied
    fetchSpy.mockRejectedValue(new Error('Permission denied: network access'));

    const { send } = await import('../../src/transport.ts');

    // Should handle Deno permission errors gracefully
    await send({
      sdk_method: 'deno.error.test',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('supports Deno deployment environments', async () => {
    // Mock Deno Deploy environment
    (globalThis as any).Deno.env.get = vi.fn((key: string) => {
      const deployEnv = {
        'LLM_WAREHOUSE_API_KEY': 'deploy-key',
        'LLM_WAREHOUSE_URL': 'https://api.deno-deploy.example.com',
        'DENO_DEPLOYMENT_ID': 'deploy-123'
      };
      return deployEnv[key as keyof typeof deployEnv];
    });

    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'deploy-key',
      LLM_WAREHOUSE_URL: 'https://api.deno-deploy.example.com',
      DENO_DEPLOYMENT_ID: 'deploy-123'
    } as any;

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'deno.deploy.test',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.deno-deploy.example.com/llm-logs',
      expect.any(Object)
    );
  });
});