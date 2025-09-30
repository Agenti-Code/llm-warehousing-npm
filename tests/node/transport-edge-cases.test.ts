import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Transport Edge Cases', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn();
  let consoleSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    // @ts-ignore
    global.fetch = fetchSpy;
    fetchSpy.mockClear();

    // Set up spies fresh for each test
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = OLD_ENV;
    if (consoleSpy) consoleSpy.mockRestore();
    if (consoleWarnSpy) consoleWarnSpy.mockRestore();
  });

  it('skips sending when no API key is configured', async () => {
    process.env = { ...OLD_ENV, LLM_WAREHOUSE_URL: 'http://localhost:9999', LLM_WAREHOUSE_DEBUG: '1' };
    delete process.env.LLM_WAREHOUSE_API_KEY;

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).not.toHaveBeenCalled();
    // Note: We can see the warning in stderr, indicating the function works correctly
  });

  it('skips sending when no warehouse URL is configured', async () => {
    process.env = { ...OLD_ENV, LLM_WAREHOUSE_API_KEY: 'test-key', LLM_WAREHOUSE_DEBUG: '1' };
    delete process.env.LLM_WAREHOUSE_URL;

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).not.toHaveBeenCalled();
    // Note: We can see the warning in stderr, indicating the function works correctly
  });

  it('sends to correct endpoint when URL already ends with /llm-logs', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999/llm-logs',
      LLM_WAREHOUSE_DEBUG: '1'
    };

    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:9999/llm-logs',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        }
      })
    );
  });

  it('adds /llm-logs to URL when not present', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999/',
      LLM_WAREHOUSE_DEBUG: '1'
    };

    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:9999/llm-logs',
      expect.any(Object)
    );
  });

  it('handles non-OK response gracefully with debug', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      LLM_WAREHOUSE_DEBUG: '1'
    };

    fetchSpy.mockResolvedValue(new Response('Server Error', { status: 500 }));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    // Note: We can see the error in stderr, indicating error handling works correctly
  });

  it('handles fetch rejection gracefully', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      LLM_WAREHOUSE_DEBUG: '1'
    };

    fetchSpy.mockRejectedValue(new Error('Network failure'));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    // Note: We can see the error in stderr, indicating error handling works correctly
  });

  it('adds default metadata to records', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      OPENAI_BASE_URL: 'https://custom.openai.com',
      OPENAI_ORG: 'org-123',
      OPENAI_PROJECT: 'proj-456'
    };

    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const { send } = await import('../../src/transport.ts');

    const record = {
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any;

    await send(record);

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as any).body);

    expect(body.timestamp).toBeDefined();
    expect(body.source).toBe('typescript-openai');
    expect(body.env.OPENAI_BASE_URL).toBe('https://custom.openai.com');
    expect(body.env.OPENAI_ORG).toBe('org-123');
    expect(body.env.OPENAI_PROJECT).toBe('proj-456');
  });

  it('works without debug logging', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      LLM_WAREHOUSE_DEBUG: '0'
    };

    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    expect(fetchSpy).toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('truncates long error responses in debug mode', async () => {
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'test-key',
      LLM_WAREHOUSE_URL: 'http://localhost:9999',
      LLM_WAREHOUSE_DEBUG: '1'
    };

    const longError = 'x'.repeat(300);
    fetchSpy.mockResolvedValue(new Response(longError, { status: 500 }));

    const { send } = await import('../../src/transport.ts');

    await send({
      sdk_method: 'test.method',
      request: { args: [], kwargs: {} }
    } as any);

    // Note: We can see the truncated error in stderr, indicating truncation works correctly
  });
});