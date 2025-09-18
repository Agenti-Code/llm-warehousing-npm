import { installPatch } from './patch';

let _isPatched = false;
let _isEnabled = false;

export function patch(options: { enabled?: boolean; debug?: boolean } = {}): void {
  const { enabled = true, debug = false } = options;
  
  _isEnabled = enabled;
  
  if (enabled) {
    process.env.LLM_WAREHOUSE_ENABLED = '1';
    if (debug) {
      process.env.LLM_WAREHOUSE_DEBUG = '1';
    } else {
      delete process.env.LLM_WAREHOUSE_DEBUG;
    }
    
    if (!_isPatched) {
      try {
        if (debug) console.log('[llm-warehouse] Installing OpenAI patches...');
        installPatch();
        _isPatched = true;
        if (debug) console.log('[llm-warehouse] Patches installed successfully');
      } catch (error) {
        console.warn(`[llm-warehouse] Failed to patch OpenAI: ${error}`);
      }
    } else if (debug) {
      console.log('[llm-warehouse] Patches already installed');
    }
  } else {
    process.env.LLM_WAREHOUSE_ENABLED = '0';
    if (debug) console.log('[llm-warehouse] LLM observation disabled');
  }
}

export function isEnabled(): boolean {
  return _isEnabled || !['', '0', 'false', 'False', 'no', 'off'].includes(process.env.LLM_WAREHOUSE_ENABLED || '0');
}

export function isPatched(): boolean {
  return _isPatched;
}

export function status() {
  return {
    enabled: isEnabled(),
    patched: isPatched(),
    debug: !['', '0', 'false', 'False', 'no', 'off'].includes(process.env.LLM_WAREHOUSE_DEBUG || '0'),
    warehouseUrl: process.env.LLM_WAREHOUSE_URL,
    apiKey: process.env.LLM_WAREHOUSE_API_KEY ? '***configured***' : undefined
  };
}
