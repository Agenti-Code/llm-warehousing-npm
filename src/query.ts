import { LLMCallData } from './types';

const WAREHOUSE_URL = process.env.LLM_WAREHOUSE_URL;
const WAREHOUSE_KEY = process.env.LLM_WAREHOUSE_API_KEY;

async function getFlaskLogs(limit: number): Promise<LLMCallData[]> {
  if (!WAREHOUSE_URL || !WAREHOUSE_KEY) {
    console.warn('[llm-warehouse] No warehouse URL or API key configured for querying logs');
    return [];
  }
  
  try {
    const baseUrl = WAREHOUSE_URL.endsWith('/llm-logs') 
      ? WAREHOUSE_URL 
      : `${WAREHOUSE_URL.replace(/\/$/, '')}/llm-logs`;
    
    const response = await fetch(`${baseUrl}?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${WAREHOUSE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data: any = await response.json();
      return data.logs || [];
    } else {
      console.error(`[llm-warehouse] Warehouse query failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.error(`[llm-warehouse] Warehouse query exception: ${error}`);
  }
  
  return [];
}

export async function getRecentLogs(limit: number = 5): Promise<LLMCallData[]> {
  return await getFlaskLogs(limit);
}

export async function showRecentLogs(limit: number = 5): Promise<void> {
  console.log(`=== 🔍 Fetching ${limit} Most Recent Log(s) ===`);
  
  try {
    const logs = await getRecentLogs(limit);
    
    if (logs.length === 0) {
      console.log('❌ No logs found');
      console.log('Make sure you\'ve made some OpenAI API calls after setting up the warehouse');
      return;
    }
    
    console.log(`✅ SUCCESS! Found ${logs.length} log(s)`);
    
    logs.forEach((log, i) => {
      console.log(`\n--- 📋 Log ${i + 1} ---`);
      console.log(`📅 Created: ${log.timestamp}`);
      console.log(`🔧 SDK Method: ${log.sdk_method}`);
      console.log(`⚡ Latency: ${log.latency_s}s`);
      
      // Show request details
      const request = log.request?.kwargs;
      if (request?.model) {
        console.log(`🤖 Model: ${request.model}`);
      }
      
      // Show user message if available
      if (request?.messages && Array.isArray(request.messages)) {
        const userMsg = request.messages.find((m: any) => m.role === 'user');
        if (userMsg?.content) {
          const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
          console.log(`💬 User Message: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`);
        }
      }
      
      // Show response details
      if (log.response && typeof log.response === 'object' && log.response !== 'streaming_response') {
        const usage = log.response.usage;
        if (usage) {
          console.log(`📊 Tokens - Prompt: ${usage.prompt_tokens || 'N/A'}, Completion: ${usage.completion_tokens || 'N/A'}, Total: ${usage.total_tokens || 'N/A'}`);
        }
        
        const choices = log.response.choices;
        if (choices && Array.isArray(choices) && choices[0]?.message?.content) {
          const content = choices[0].message.content;
          console.log(`🤖 Response: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);
        }
      } else if (log.response === 'streaming_response') {
        console.log(`🌊 Response: Streaming response`);
      }
      
      // Show errors if any
      if (log.error) {
        console.log(`❌ Error: ${log.error}`);
      }
    });
  } catch (error) {
    console.error(`❌ Error retrieving logs: ${error}`);
    console.log('Check your warehouse configuration and network connection');
  }
}
