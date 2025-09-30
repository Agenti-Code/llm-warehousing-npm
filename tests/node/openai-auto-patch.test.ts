import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';


vi.mock('openai', () => {
  class OpenAI {
    chat = {
      completions: {
        create: vi.fn(async (_req: any) => ({
          id: 'cmpl_123',
          choices: [{ message: { content: 'hello' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        }))
      }
    };
  }
  return { default: OpenAI };
});

describe('OpenAI auto-patch (Node)', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...OLD_ENV, LLM_WAREHOUSE_API_KEY: 'test-key', LLM_WAREHOUSE_URL: 'http://localhost:9999', LLM_WAREHOUSE_DEBUG: '1' } as any;
    // @ts-ignore
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    process.env = OLD_ENV;
    fetchSpy.mockClear();
  });

  it('auto-patches on import and logs a call', async () => {
    // Preload openai and force patching
    await import('openai');
    const { installPatch } = await import('../../src/patch.ts');
    installPatch();

    const OpenAI = (globalThis as any).__LLM_WAREHOUSE_PATCHED_OPENAI__ as any;
    const client = new OpenAI();
    const res = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(res.choices[0].message.content).toBe('hello');

    // logging is non-blocking; wait until fetch is called (up to 1s)
    const waitUntil = async (predicate: () => boolean, timeoutMs = 1000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    await waitUntil(() => fetchSpy.mock.calls.length > 0);
    expect(fetchSpy).toHaveBeenCalled();

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String((init as any).body));
    expect(body.sdk_method).toBe('openai.chat.completions.create');
    expect(body.response.usage.total_tokens).toBe(2);
  });
});


