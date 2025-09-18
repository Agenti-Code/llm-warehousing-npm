"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.status = exports.isPatched = exports.isEnabled = exports.patch = exports.showRecentLogs = exports.getRecentLogs = exports.installPatch = void 0;
// Auto-patching logic (like Python __init__.py)
const patch_1 = require("./patch");
function shouldAutoPatch() {
    const token = (process.env.LLM_WAREHOUSE_API_KEY || '').trim();
    return Boolean(token);
}
function isDebug() {
    const value = process.env.LLM_WAREHOUSE_DEBUG || '0';
    return !['', '0', 'false', 'False', 'no', 'off'].includes(value);
}
// Auto-patch on import if API key is set
if (shouldAutoPatch()) {
    try {
        if (isDebug()) {
            console.log('[llm-warehouse] Auto-patching enabled via API token');
        }
        (0, patch_1.installPatch)();
        if (isDebug()) {
            console.log('[llm-warehouse] Auto-patching complete');
        }
    }
    catch (error) {
        console.warn(`[llm-warehouse] Failed to auto-patch: ${error}`);
    }
}
// Export everything
var patch_2 = require("./patch");
Object.defineProperty(exports, "installPatch", { enumerable: true, get: function () { return patch_2.installPatch; } });
var query_1 = require("./query");
Object.defineProperty(exports, "getRecentLogs", { enumerable: true, get: function () { return query_1.getRecentLogs; } });
Object.defineProperty(exports, "showRecentLogs", { enumerable: true, get: function () { return query_1.showRecentLogs; } });
var observify_1 = require("./observify");
Object.defineProperty(exports, "patch", { enumerable: true, get: function () { return observify_1.patch; } });
Object.defineProperty(exports, "isEnabled", { enumerable: true, get: function () { return observify_1.isEnabled; } });
Object.defineProperty(exports, "isPatched", { enumerable: true, get: function () { return observify_1.isPatched; } });
Object.defineProperty(exports, "status", { enumerable: true, get: function () { return observify_1.status; } });
__exportStar(require("./types"), exports);
