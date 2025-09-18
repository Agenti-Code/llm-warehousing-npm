"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installPatch = installPatch;
const openai_1 = __importDefault(require("openai"));
const transport_1 = require("./transport");
const DEBUG = !['', '0', 'false', 'False', 'no', 'off'].includes(process.env.LLM_WAREHOUSE_DEBUG || '0');
let _patchApplied = false;
function serialize(obj) {
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
    }
    catch {
        return String(obj);
    }
}
function wrapOpenAIMethod(methodPath, originalMethod) {
    return async function (...args) {
        const startTime = Date.now();
        const record = {
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
                await (0, transport_1.send)(record);
                return result;
            }
            record.response = serialize(result);
            record.request_id = result?.id;
            await (0, transport_1.send)(record);
            return result;
        }
        catch (error) {
            record.latency_s = (Date.now() - startTime) / 1000;
            record.error = error?.toString() || 'Unknown error';
            await (0, transport_1.send)(record);
            throw error;
        }
    };
}
function installPatch() {
    if (_patchApplied) {
        if (DEBUG)
            console.log('[llm-warehouse] Patch already applied, skipping');
        return;
    }
    if (DEBUG)
        console.log('[llm-warehouse] Installing OpenAI patches...');
    try {
        // Monkey patch the OpenAI prototype methods
        const OpenAIPrototype = openai_1.default.prototype;
        // We need to patch the constructor to wrap instances
        const OriginalOpenAI = openai_1.default;
        function PatchedOpenAI(...args) {
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
            const openaiModule = Object.values(require.cache).find(m => m && m.exports && m.exports.default === OriginalOpenAI);
            if (openaiModule) {
                openaiModule.exports.default = PatchedOpenAI;
                openaiModule.exports = PatchedOpenAI;
            }
        }
        _patchApplied = true;
        if (DEBUG)
            console.log('[llm-warehouse] OpenAI patches installed successfully');
    }
    catch (error) {
        console.warn(`[llm-warehouse] Failed to install patches: ${error}`);
    }
}
