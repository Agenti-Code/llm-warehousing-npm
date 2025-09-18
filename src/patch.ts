import OpenAI from 'openai';
import { LLMCallData } from './types';
import { send } from './transport';

const DEBUG = !['', '0', 'false', 'False', 'no', 'off'].includes(process.env.LLM_WAREHOUSE_DEBUG || '0');
let _patchApplied = false;

function serialize(obj: any): any {
  try {
    // Handle OpenAI response objects
    if (obj && typeof obj === 'object') {
      if (typeof obj.toJSON === 'function') {
        return obj.toJSON();
      }
      if (typeof obj.serialize === 'function') {
        return obj.serialize();
      }
    }
    
    // Ensure JSON serializable
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return String(obj);
  }
}

function wrapOpenAIMethod(methodPath: string, originalMethod: Function): any {
  return async function(this: any, ...args: any[]) {
    const startTime = Date.now();
    const record: LLMCallData = {
      sdk_method: methodPath,
      request: {
        args: [],
        kwargs: args[0] || {}
      }
    };
    
    try {
      const result = await originalMethod.apply(this, args);
      record.latency_s = (Date.now() - startTime) / 1000;
      
      // Handle streaming
      if (args[0]?.stream) {
        record.response = 'streaming_response';
        await send(record);
        return result;
      }
      
      record.response = serialize(result);
      record.request_id = result?.id;
      await send(record);
      return result;
    } catch (error: any) {
      record.latency_s = (Date.now() - startTime) / 1000;
      record.error = error?.toString() || 'Unknown error';
      await send(record);
      throw error;
    }
  };
}

export function installPatch(): void {
  if (_patchApplied) {
    if (DEBUG) console.log('[llm-warehouse] Patch already applied, skipping');
    return;
  }
  
  if (DEBUG) console.log('[llm-warehouse] Installing OpenAI patches...');
  
  try {
    // Monkey patch the OpenAI prototype methods
    const OpenAIPrototype = OpenAI.prototype as any;
    
    // We need to patch the constructor to wrap instances
    const OriginalOpenAI = OpenAI;
    
    function PatchedOpenAI(...args: any[]) {
      // @ts-ignore
      const instance = new OriginalOpenAI(...args);
      
      // Wrap chat completions create method
      if (instance.chat?.completions?.create) {
        const original = instance.chat.completions.create.bind(instance.chat.completions);
        instance.chat.completions.create = wrapOpenAIMethod('openai.chat.completions.create', original);
      }
      
      return instance;
    }
    
    // Copy all static properties and prototype
    Object.setPrototypeOf(PatchedOpenAI, OriginalOpenAI);
    Object.setPrototypeOf(PatchedOpenAI.prototype, OriginalOpenAI.prototype);
    Object.assign(PatchedOpenAI, OriginalOpenAI);
    
    // Replace in module cache if possible (Node.js specific)
    if (typeof require !== 'undefined' && require.cache) {
      const openaiModule = Object.values(require.cache).find(m => 
        m && m.exports && m.exports.default === OriginalOpenAI
      );
      if (openaiModule) {
        openaiModule.exports.default = PatchedOpenAI;
        openaiModule.exports = PatchedOpenAI;
      }
    }
    
    _patchApplied = true;
    if (DEBUG) console.log('[llm-warehouse] OpenAI patches installed successfully');
  } catch (error) {
    console.warn(`[llm-warehouse] Failed to install patches: ${error}`);
  }
}
