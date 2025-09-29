import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Query Module', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV, LLM_WAREHOUSE_API_KEY: 'test-key', LLM_WAREHOUSE_URL: 'http://localhost:9999' };
    // @ts-ignore
    global.fetch = fetchSpy;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('retrieves recent logs successfully', async () => {
    const mockLogs = [
      {
        sdk_method: 'openai.chat.completions.create',
        timestamp: '2023-01-01T00:00:00Z',
        latency_s: 1.5,
        request: {
          kwargs: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hello world' }]
          }
        },
        response: {
          choices: [{ message: { content: 'Hi there!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }
      }
    ];

    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ logs: mockLogs }), { status: 200 }));

    const { getRecentLogs } = await import('../../src/query.ts');

    const logs = await getRecentLogs(5);
    expect(logs).toEqual(mockLogs);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:9999/llm-logs?limit=5',
      {
        headers: {
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json'
        }
      }
    );
  });

  it('handles missing warehouse configuration', async () => {
    delete process.env.LLM_WAREHOUSE_API_KEY;

    const { getRecentLogs } = await import('../../src/query.ts');

    const logs = await getRecentLogs(5);
    expect(logs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    fetchSpy.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const { getRecentLogs } = await import('../../src/query.ts');

    const logs = await getRecentLogs(5);
    expect(logs).toEqual([]);
  });

  it('handles network errors gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const { getRecentLogs } = await import('../../src/query.ts');

    const logs = await getRecentLogs(5);
    expect(logs).toEqual([]);
  });

  it('handles URL with existing /llm-logs path', async () => {
    process.env.LLM_WAREHOUSE_URL = 'http://localhost:9999/llm-logs';

    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ logs: [] }), { status: 200 }));

    const { getRecentLogs } = await import('../../src/query.ts');

    await getRecentLogs(5);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:9999/llm-logs?limit=5',
      expect.any(Object)
    );
  });
});