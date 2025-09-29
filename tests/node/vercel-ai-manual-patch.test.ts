import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Vercel AI manual patch (Node)', () => {
  const OLD_ENV = process.env;
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

  it('wraps generateText and logs request/response metadata', async () => {
    const { installPatch, patchVercelAIFunctions } = await import('../../src/patch.ts');
    installPatch();

    const originalGenerateText = vi.fn(async (_params: any) => ({
      text: 'ok',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop'
    }));

    const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText });
    const res = await generateText({ model: 'gpt-4o', prompt: 'hi' });
    expect(res.text).toBe('ok');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as any).body));
    expect(body.sdk_method).toBe('ai.generateText');
    expect(body.request.kwargs.prompt).toBe('hi');
  });
});


