import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('Browser-like (jsdom) import', () => {
  const OLD_ENV = process.env as any;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV, LLM_WAREHOUSE_API_KEY: 'test-key', LLM_WAREHOUSE_URL: 'http://localhost:9999' } as any;
    // @ts-ignore
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    process.env = OLD_ENV;
    fetchSpy.mockClear();
  });

  it('imports without errors and can call send()', async () => {
    const { send } = await import('../../src/transport.ts');
    await send({ sdk_method: 'unit.test', request: { args: [], kwargs: {} }, response: { ok: true } } as any);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});


