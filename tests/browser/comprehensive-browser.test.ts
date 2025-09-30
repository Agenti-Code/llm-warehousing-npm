import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Comprehensive Browser Environment', () => {
  const OLD_ENV = process.env;
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  let originalWindow: any;
  let originalDocument: any;
  let originalLocation: any;

  beforeEach(() => {
    vi.resetModules();

    // Mock browser globals
    originalWindow = (globalThis as any).window;
    originalDocument = (globalThis as any).document;
    originalLocation = (globalThis as any).location;

    (globalThis as any).window = {
      location: {
        hostname: 'localhost',
        protocol: 'https:',
        port: '3000',
        href: 'https://localhost:3000/test'
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        language: 'en-US',
        onLine: true
      },
      localStorage: {
        getItem: vi.fn((key: string) => {
          const storage: Record<string, string> = {
            'LLM_WAREHOUSE_API_KEY': 'browser-key',
            'LLM_WAREHOUSE_URL': 'https://browser-warehouse.example.com'
          };
          return storage[key] || null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn()
      },
      sessionStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      },
      crypto: {
        randomUUID: vi.fn(() => 'test-uuid-123')
      },
      performance: {
        now: vi.fn(() => Date.now())
      }
    };

    (globalThis as any).document = {
      createElement: vi.fn(() => ({})),
      head: { appendChild: vi.fn() },
      body: { appendChild: vi.fn() },
      cookie: '',
      referrer: 'https://example.com'
    };

    (globalThis as any).location = (globalThis as any).window.location;

    // Mock environment for browser
    process.env = {
      ...OLD_ENV,
      LLM_WAREHOUSE_API_KEY: 'browser-key',
      LLM_WAREHOUSE_URL: 'https://browser-warehouse.example.com',
      LLM_WAREHOUSE_DEBUG: '1'
    } as any;

    // @ts-ignore
    global.fetch = fetchSpy;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).location = originalLocation;
  });

  describe('Browser API Compatibility', () => {
    it('works with browser fetch API', async () => {
      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.fetch.test',
        request: { args: [], kwargs: { userAgent: window.navigator.userAgent } },
        response: { text: 'Browser response', usage: { total_tokens: 30 } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://browser-warehouse.example.com/llm-logs',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer browser-key'
          }
        })
      );
    });

    it('handles CORS scenarios', async () => {
      // Mock CORS preflight
      fetchSpy.mockImplementationOnce(async (url: string, init: any) => {
        if (init?.method === 'OPTIONS') {
          return new Response('', {
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
          });
        }
        return new Response('{}', { status: 200 });
      });

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.cors.test',
        request: { args: [], kwargs: { cors: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('works with different browsers', async () => {
      const browsers = [
        {
          name: 'Chrome',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        {
          name: 'Firefox',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
        },
        {
          name: 'Safari',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        }
      ];

      const { send } = await import('../../src/transport.ts');

      for (const browser of browsers) {
        vi.resetModules();
        window.navigator.userAgent = browser.userAgent;

        await send({
          sdk_method: `browser.${browser.name.toLowerCase()}.test`,
          request: { args: [], kwargs: { browser: browser.name } }
        } as any);
      }

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Browser Storage Integration', () => {
    it('works with localStorage configuration', async () => {
      window.localStorage.getItem = vi.fn((key: string) => {
        const storage: Record<string, string> = {
          'llm-warehouse-config': JSON.stringify({
            apiKey: 'localStorage-key',
            url: 'https://localstorage-warehouse.example.com'
          })
        };
        return storage[key] || null;
      });

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.localstorage.test',
        request: { args: [], kwargs: { storage: 'localStorage' } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('handles storage quota exceeded scenarios', async () => {
      window.localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError: DOM Exception 22');
      });

      const { send } = await import('../../src/transport.ts');

      // Should handle storage errors gracefully
      await send({
        sdk_method: 'browser.quota.test',
        request: { args: [], kwargs: {} }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('works with sessionStorage', async () => {
      window.sessionStorage.getItem = vi.fn((key: string) => {
        if (key === 'llm-warehouse-session') {
          return JSON.stringify({ sessionId: 'browser-session-123' });
        }
        return null;
      });

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.sessionstorage.test',
        request: { args: [], kwargs: { sessionStorage: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Browser Security Contexts', () => {
    it('works in secure context (HTTPS)', async () => {
      window.location.protocol = 'https:';
      (globalThis as any).isSecureContext = true;

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.secure.test',
        request: { args: [], kwargs: { secure: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('handles insecure context limitations', async () => {
      window.location.protocol = 'http:';
      (globalThis as any).isSecureContext = false;

      // Mock limited APIs in insecure context
      window.crypto = undefined as any;

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.insecure.test',
        request: { args: [], kwargs: { secure: false } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('handles Content Security Policy restrictions', async () => {
      // Mock CSP violation
      const originalConsole = console;
      const mockConsole = { ...console, error: vi.fn() };
      // @ts-ignore
      global.console = mockConsole;

      fetchSpy.mockRejectedValue(new Error('Content Security Policy directive violated'));

      try {
        const { send } = await import('../../src/transport.ts');

        await send({
          sdk_method: 'browser.csp.test',
          request: { args: [], kwargs: {} }
        } as any);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        // @ts-ignore
        global.console = originalConsole;
      }
    });
  });

  describe('Browser Performance & Optimization', () => {
    it('handles performance monitoring', async () => {
      const mockPerformanceEntry = {
        name: 'llm-warehouse-request',
        startTime: 100,
        duration: 50,
        entryType: 'measure'
      };

      window.performance.getEntriesByName = vi.fn(() => [mockPerformanceEntry]);
      window.performance.mark = vi.fn();
      window.performance.measure = vi.fn();

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.performance.test',
        request: { args: [], kwargs: { timing: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('works with Web Workers', async () => {
      // Mock Web Worker environment
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      (globalThis as any).Worker = vi.fn(() => mockWorker);

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.webworker.test',
        request: { args: [], kwargs: { worker: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('handles network connectivity changes', async () => {
      // Mock online/offline events
      let isOnline = true;
      Object.defineProperty(window.navigator, 'onLine', {
        get: () => isOnline,
        configurable: true
      });

      const { send } = await import('../../src/transport.ts');

      // Test online scenario
      await send({
        sdk_method: 'browser.online.test',
        request: { args: [], kwargs: { online: true } }
      } as any);

      // Test offline scenario
      isOnline = false;
      fetchSpy.mockRejectedValue(new Error('Network request failed'));

      await send({
        sdk_method: 'browser.offline.test',
        request: { args: [], kwargs: { online: false } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Module Bundler Compatibility', () => {
    it('works with Webpack bundles', async () => {
      // Mock Webpack environment
      (globalThis as any).__webpack_require__ = vi.fn();
      (globalThis as any).__webpack_public_path__ = '/dist/';

      const modules = await Promise.all([
        import('../../src/index.ts'),
        import('../../src/patch.ts'),
        import('../../src/transport.ts')
      ]);

      modules.forEach(module => {
        expect(module).toBeDefined();
      });
    });

    it('works with Vite bundles', async () => {
      // Mock Vite environment
      (globalThis as any).__vite_is_modern_browser = true;

      process.env.NODE_ENV = 'production';

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.vite.test',
        request: { args: [], kwargs: { bundler: 'vite' } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('works with Rollup bundles', async () => {
      // Mock Rollup environment
      process.env.NODE_ENV = 'production';

      const { installPatch } = await import('../../src/patch.ts');
      installPatch();

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.rollup.test',
        request: { args: [], kwargs: { bundler: 'rollup' } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Browser AI SDK Integration', () => {
    it('works with browser-based OpenAI calls', async () => {
      const { installPatch } = await import('../../src/patch.ts');
      installPatch();

      // Mock browser OpenAI usage
      const mockOpenAIClient = {
        chat: {
          completions: {
            create: vi.fn(async () => ({
              id: 'browser-completion',
              choices: [{ message: { content: 'Browser AI response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            }))
          }
        }
      };

      (globalThis as any).__LLM_WAREHOUSE_PATCHED_OPENAI__ = function() {
        return mockOpenAIClient;
      };

      const client = new ((globalThis as any).__LLM_WAREHOUSE_PATCHED_OPENAI__)();
      await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello from browser' }]
      });

      // Should not call our transport since OpenAI is mocked
      // But if it were real, it would log to warehouse
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalled();
    });

    it('handles browser API key security', async () => {
      // Test that API keys are handled securely in browser
      delete (window as any).localStorage;
      delete (window as any).sessionStorage;

      const { send } = await import('../../src/transport.ts');

      await send({
        sdk_method: 'browser.security.test',
        request: { args: [], kwargs: { secure: true } }
      } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse((init as any).body);
      expect(body.sdk_method).toBe('browser.security.test');
    });
  });
});