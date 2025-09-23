// Auto-patching logic (like Python __init__.py)
import { installPatch } from './patch';

function shouldAutoPatch(): boolean {
  const token = (process.env.LLM_WAREHOUSE_API_KEY || '').trim();
  return Boolean(token);
}

function isDebug(): boolean {
  const value = process.env.LLM_WAREHOUSE_DEBUG || '0';
  return !['', '0', 'false', 'False', 'no', 'off'].includes(value);
}

// Auto-patch on import if API key is set
if (shouldAutoPatch()) {
  try {
    if (isDebug()) {
      console.log('[llm-warehouse] Auto-patching enabled via API token');
    }
    installPatch();
    if (isDebug()) {
      console.log('[llm-warehouse] Auto-patching complete');
    }
  } catch (error) {
    console.warn(`[llm-warehouse] Failed to auto-patch: ${error}`);
  }
}

// Export everything
export { installPatch, patchVercelAIFunctions } from './patch';
export { getRecentLogs, showRecentLogs } from './query';
export { patch, isEnabled, isPatched, status } from './observify';
export * from './types';
