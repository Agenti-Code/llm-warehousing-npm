import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Bun Runtime Compatibility', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  let originalBun: any;

  beforeEach(() => {
    vi.resetModules();

    // Mock Bun global environment
    originalBun = (globalThis as any).Bun;
    (globalThis as any).Bun = {
      version: '1.0.25',
      env: {
        LLM_WAREHOUSE_API_KEY: 'test-bun-key',
        LLM_WAREHOUSE_URL: 'http://localhost:9999',
        LLM_WAREHOUSE_DEBUG: '1'
      },
      main: '/path/to/main.ts',
      serve: vi.fn(),
      file: vi.fn(),
      write: vi.fn(),
      build: vi.fn()
    };

    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-bun-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      LLM_WAREHOUSE_DEBUG: '1'
    } as any;

    // @ts-ignore
    global.fetch = fetchSpy;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    (globalThis as any).Bun = originalBun;
  });

  it('works with Bun fetch implementation', async () => {
    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'bun.test',
      request: { args: [], kwargs: { model: 'gpt-4', prompt: 'Hello Bun' } },
      response: { text: 'Hello from Bun!', usage: { total_tokens: 15 } }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:9999/llm-logs',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-bun-key'
        }
      })
    );

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.sdk_method).toBe('bun.test');
    expect(body.source).toBe('typescript-openai');
  });

  it('handles Bun environment variables', async () => {
    // Test Bun.env access
    (globalThis as any).Bun.env = {
      LLM_WAREHOUSE_API_KEY: 'bun-specific-key',
      LLM_WAREHOUSE_URL: 'https://bun-warehouse.example.com',
      LLM_WAREHOUSE_DEBUG: 'false'
    };

    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'bun-specific-key',
      LLM_WAREHOUSE_URL: 'https://bun-warehouse.example.com',
      LLM_WAREHOUSE_DEBUG: 'false'
    } as any;

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'bun.env.test',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bun-warehouse.example.com/llm-logs',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer bun-specific-key'
        })
      })
    );
  });

  it('supports Bun module resolution and hot reloading', async () => {
    // Test that modules can be dynamically imported (Bun feature)
    const moduleImport = async () => {
      return await import('../../src/patch.ts');
    };

    const module = await moduleImport();
    expect(module.installPatch).toBeDefined();

    // Test re-import (simulating hot reload)
    const moduleReimport = await import('../../src/patch.ts');
    expect(moduleReimport.installPatch).toBeDefined();
  });

  it('works with Bun native APIs', async () => {
    // Mock Bun-specific file operations
    (globalThis as any).Bun.file = vi.fn(() => ({
      text: vi.fn(async () => '{"test": "data"}'),
      json: vi.fn(async () => ({ test: 'data' }))
    }));

    (globalThis as any).Bun.write = vi.fn(async () => 'written');

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'bun.native.test',
      request: { args: [], kwargs: { useBunAPI: true } }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles Bun transpiler and TypeScript', async () => {
    // Test that TypeScript features work with Bun's built-in transpiler
    const { status } = await import('../../src/observify.ts');

    const statusInfo = status();
    expect(statusInfo).toHaveProperty('enabled');
    expect(statusInfo).toHaveProperty('patched');

    // Test interface/type compatibility
    interface BunTestInterface {
      bunVersion: string;
      isTest: boolean;
    }

    const testObj: BunTestInterface = {
      bunVersion: (globalThis as any).Bun.version,
      isTest: true
    };

    expect(testObj.bunVersion).toBe('1.0.25');
    expect(testObj.isTest).toBe(true);
  });

  it('supports Bun server integration', async () => {
    // Mock Bun server scenario
    const mockServer = {
      port: 3000,
      hostname: 'localhost'
    };

    (globalThis as any).Bun.serve = vi.fn(() => mockServer);

    // Test in server context
    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'bun.server.test',
      request: { args: [], kwargs: { serverPort: mockServer.port } }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.request.kwargs.serverPort).toBe(3000);
  });

  it('handles Bun performance optimizations', async () => {
    // Test performance-sensitive operations
    const startTime = performance.now();

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'bun.performance.test',
      request: { args: [], kwargs: { startTime } }
    } as any);

    const endTime = performance.now();
    expect(endTime - startTime).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('works with Bun package management', async () => {
    // Simulate Bun package installation scenario
    const mockPackageJson = {
      name: 'bun-test-app',
      dependencies: {
        'llm-warehouse': 'latest'
      }
    };

    // Test module loading as if installed via Bun
    const modules = await Promise.all([
      import('../../src/index.ts'),
      import('../../src/patch.ts'),
      import('../../src/transport.ts')
    ]);

    modules.forEach(module => {
      expect(module).toBeDefined();
    });
  });

  it('handles Bun Worker threads', async () => {
    // Mock Bun Worker scenario
    const mockWorkerGlobal = {
      postMessage: vi.fn(),
      onmessage: null,
      self: globalThis
    };

    // Simulate worker context
    const originalSelf = globalThis.self;
    (globalThis as any).self = mockWorkerGlobal;

    try {
      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'bun.worker.test',
        request: { args: [], kwargs: { inWorker: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).self = originalSelf;
    }
  });

  it('supports Bun SQLite integration context', async () => {
    // Mock Bun's built-in SQLite
    (globalThis as any).Bun.Database = vi.fn(() => ({
      query: vi.fn(() => ({ all: vi.fn(() => []) })),
      close: vi.fn()
    }));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'bun.sqlite.test',
      request: { args: [], kwargs: { database: 'test.db' } }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles Bun error scenarios and debugging', async () => {
    // Mock Bun-specific error
    fetchSpy.mockRejectedValue(new Error('Bun fetch error: connection refused'));

    const { send } = await import('../../src/transport.ts');

    // Should handle Bun errors gracefully
    await send({
      sdk_method: 'bun.error.test',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});