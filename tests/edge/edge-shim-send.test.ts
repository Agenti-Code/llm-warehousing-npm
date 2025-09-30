import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('Edge-like send()', () => {
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  const oldProcess = (globalThis as any).process;

  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).process = { env: { LLM_WAREHOUSE_API_KEY: 'test-key', LLM_WAREHOUSE_URL: 'http://localhost:9999' } };
    // @ts-ignore
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    (globalThis as any).process = oldProcess;
    fetchSpy.mockClear();
  });

  it('posts logs via fetch without Node APIs', async () => {
    const { send } = await import('../../src/transport.ts');
    await send({ sdk_method: 'edge.test', request: { args: [], kwargs: {} } } as any);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});


