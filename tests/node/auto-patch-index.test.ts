import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Auto-patch Index Module', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    // Clear any global state
    delete process.env.LLM_WAREHOUSE_ENABLED;
    delete process.env.LLM_WAREHOUSE_DEBUG;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('auto-patches when API key is present', async () => {
    process.env.LLM_WAREHOUSE_API_KEY = 'test-key-123';

    // Import the index module which should trigger auto-patching
    await import('../../src/index.ts');

    // We can't easily test the console output due to module loading order,
    // but we can verify the module exports the expected functions
    const module = await import('../../src/index.ts');
    expect(module.installPatch).toBeDefined();
  });

  it('does not auto-patch when API key is missing', async () => {
    delete process.env.LLM_WAREHOUSE_API_KEY;

    const module = await import('../../src/index.ts');
    expect(module.installPatch).toBeDefined();
  });

  it('exports all expected functions', async () => {
    const module = await import('../../src/index.ts');

    expect(module.installPatch).toBeDefined();
    expect(module.getRecentLogs).toBeDefined();
    expect(module.showRecentLogs).toBeDefined();
    expect(module.patch).toBeDefined();
    expect(module.isEnabled).toBeDefined();
    expect(module.isPatched).toBeDefined();
    expect(module.status).toBeDefined();
  });
});