"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.send = send;
// Environment configuration - only warehouse URL
const WAREHOUSE_URL = process.env.LLM_WAREHOUSE_URL;
const WAREHOUSE_KEY = process.env.LLM_WAREHOUSE_API_KEY;
const DEBUG = !['', '0', 'false', 'False', 'no', 'off'].includes(process.env.LLM_WAREHOUSE_DEBUG || '0');
function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (WAREHOUSE_KEY) {
        headers['Authorization'] = `Bearer ${WAREHOUSE_KEY}`;
    }
    return headers;
}
async function send(record) {
    // Add default metadata
    record.timestamp = record.timestamp || new Date().toISOString();
    record.source = record.source || 'typescript-openai';
    record.env = record.env || {
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        OPENAI_ORG: process.env.OPENAI_ORG,
        OPENAI_PROJECT: process.env.OPENAI_PROJECT,
    };
    // Only warehouse URL - fail silently if not configured
    if (!WAREHOUSE_URL || !WAREHOUSE_KEY) {
        if (DEBUG) {
            console.warn('[llm-warehouse] No warehouse URL or API key configured - skipping log');
        }
        return;
    }
    try {
        const warehouseUrl = WAREHOUSE_URL.endsWith('/llm-logs')
            ? WAREHOUSE_URL
            : `${WAREHOUSE_URL.replace(/\/$/, '')}/llm-logs`;
        const response = await fetch(warehouseUrl, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(record),
        });
        if (DEBUG) {
            console.log(`[llm-warehouse] Warehouse response: ${response.status}`);
        }
        if (!response.ok && DEBUG) {
            const errorText = await response.text();
            console.warn(`[llm-warehouse] Warehouse error: ${response.status} ${errorText.slice(0, 200)}`);
        }
    }
    catch (error) {
        if (DEBUG) {
            console.warn(`[llm-warehouse] Failed to send to warehouse: ${error}`);
        }
        // Fail silently - never break user apps
    }
}
