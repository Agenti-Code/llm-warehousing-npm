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

function wrapVercelAIMethod(methodPath: string, originalMethod: Function): any {
  return async function(this: any, ...args: any[]) {
    const startTime = Date.now();
    const params = args[0] || {};
    
    const record: LLMCallData = {
      sdk_method: methodPath,
      request: {
        args: [],
        kwargs: {
          model: params.model ? serialize(params.model) : undefined,
          prompt: params.prompt,
          messages: params.messages,
          schema: params.schema ? '[schema object]' : undefined,
          tools: params.tools ? '[tools object]' : undefined,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          ...params
        }
      }
    };
    
    try {
      const result = await originalMethod.apply(this, args);
      record.latency_s = (Date.now() - startTime) / 1000;
      
      // Handle different Vercel AI SDK response formats
      if (result && typeof result === 'object') {
        // Handle streaming responses
        if (result.textStream || result.objectStream) {
          record.response = 'vercel_ai_streaming_response';
          await send(record);
          return result;
        }
        
        // Handle regular responses
        const responseData: any = {};
        if (result.text) responseData.text = result.text;
        if (result.object) responseData.object = serialize(result.object);
        if (result.usage) responseData.usage = result.usage;
        if (result.finishReason) responseData.finishReason = result.finishReason;
        
        record.response = responseData;
      } else {
        record.response = serialize(result);
      }
      
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

// Store original functions for later restoration if needed
const _originalFunctions = new Map<string, Function>();

function patchGlobalObject(globalObj: any, functionName: string, methodPath: string): boolean {
  try {
    if (globalObj && typeof globalObj[functionName] === 'function') {
      if (!_originalFunctions.has(methodPath)) {
        _originalFunctions.set(methodPath, globalObj[functionName]);
        globalObj[functionName] = wrapVercelAIMethod(methodPath, globalObj[functionName]);
        if (DEBUG) console.log(`[llm-warehouse] Successfully patched ${methodPath}`);
        return true;
      }
    }
    return false;
  } catch (error) {
    if (DEBUG) console.log(`[llm-warehouse] Error patching ${methodPath}:`, error);
    return false;
  }
}

async function patchVercelAI(): Promise<void> {
  try {
    if (DEBUG) console.log('[llm-warehouse] Attempting to patch Vercel AI SDK...');
    
    // Method 1: Try to patch via dynamic import
    try {
      // Use eval to avoid TypeScript compilation errors when 'ai' module doesn't exist
      const aiModule = await eval('import("ai")');
      patchGlobalObject(aiModule, 'generateText', 'ai.generateText');
      patchGlobalObject(aiModule, 'generateObject', 'ai.generateObject');
      patchGlobalObject(aiModule, 'streamText', 'ai.streamText');
      patchGlobalObject(aiModule, 'streamObject', 'ai.streamObject');
    } catch (importError) {
      if (DEBUG) console.log('[llm-warehouse] Direct import failed, trying alternative methods');
    }
    
    // Method 2: Try to patch via require cache (Node.js)
    if (typeof require !== 'undefined' && require.cache) {
      try {
        const aiModuleKey = Object.keys(require.cache).find(key => 
          key.includes('node_modules/ai/') || key.endsWith('/ai/index.js')
        );
        
        if (aiModuleKey && require.cache[aiModuleKey]) {
          const aiModule = require.cache[aiModuleKey].exports;
          patchGlobalObject(aiModule, 'generateText', 'ai.generateText');
          patchGlobalObject(aiModule, 'generateObject', 'ai.generateObject');
          patchGlobalObject(aiModule, 'streamText', 'ai.streamText');
          patchGlobalObject(aiModule, 'streamObject', 'ai.streamObject');
        }
      } catch (cacheError) {
        if (DEBUG) console.log('[llm-warehouse] Require cache patching failed');
      }
    }
    
    // Method 3: Set up a module loader hook for future imports
    setupModuleHook();
    
  } catch (error) {
    if (DEBUG) console.log('[llm-warehouse] Error in patchVercelAI:', error);
  }
}

function setupModuleHook(): void {
  // Hook into module loading for future Vercel AI imports
  if (typeof require !== 'undefined') {
    try {
      const Module = require('module');
      const originalRequire = Module.prototype.require;
      
      Module.prototype.require = function(id: string) {
        const result = originalRequire.apply(this, arguments);
        
        // If someone requires 'ai', patch it immediately
        if (id === 'ai' && result && typeof result === 'object') {
          patchGlobalObject(result, 'generateText', 'ai.generateText');
          patchGlobalObject(result, 'generateObject', 'ai.generateObject');
          patchGlobalObject(result, 'streamText', 'ai.streamText');
          patchGlobalObject(result, 'streamObject', 'ai.streamObject');
        }
        
        return result;
      };
      
      if (DEBUG) console.log('[llm-warehouse] Module hook installed for future AI SDK imports');
    } catch (hookError) {
      if (DEBUG) console.log('[llm-warehouse] Failed to setup module hook:', hookError);
    }
  }
}

// Function to manually patch Vercel AI SDK functions
export function patchVercelAIFunctions(functions: {
  generateText?: any;
  generateObject?: any;
  streamText?: any;
  streamObject?: any;
}): {
  generateText?: any;
  generateObject?: any;
  streamText?: any;
  streamObject?: any;
} {
  const patched: any = {};
  
  if (functions.generateText) {
    patched.generateText = wrapVercelAIMethod('ai.generateText', functions.generateText);
    if (DEBUG) console.log('[llm-warehouse] Patched generateText');
  }
  
  if (functions.generateObject) {
    patched.generateObject = wrapVercelAIMethod('ai.generateObject', functions.generateObject);
    if (DEBUG) console.log('[llm-warehouse] Patched generateObject');
  }
  
  if (functions.streamText) {
    patched.streamText = wrapVercelAIMethod('ai.streamText', functions.streamText);
    if (DEBUG) console.log('[llm-warehouse] Patched streamText');
  }
  
  if (functions.streamObject) {
    patched.streamObject = wrapVercelAIMethod('ai.streamObject', functions.streamObject);
    if (DEBUG) console.log('[llm-warehouse] Patched streamObject');
  }
  
  return patched;
}

export function installPatch(): void {
  if (_patchApplied) {
    if (DEBUG) console.log('[llm-warehouse] Patch already applied, skipping');
    return;
  }
  
  if (DEBUG) console.log('[llm-warehouse] Installing LLM patches...');
  
  try {
    // === OpenAI SDK Patches ===
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
    
    if (DEBUG) console.log('[llm-warehouse] OpenAI patches installed');
    
    // === Vercel AI SDK Patches ===
    // Note: Vercel AI SDK exports are read-only and cannot be patched directly
    // The package should be imported AFTER llm-warehouse for auto-patching to work
    // For manual patching, users should use the wrapper functions provided
    if (DEBUG) {
      console.log('[llm-warehouse] Note: Vercel AI SDK requires manual patching due to read-only exports');
      console.log('[llm-warehouse] Use patchVercelAIFunctions() for manual patching');
    }
    
    _patchApplied = true;
    if (DEBUG) console.log('[llm-warehouse] All patches installed successfully');
  } catch (error) {
    console.warn(`[llm-warehouse] Failed to install patches: ${error}`);
  }
}
