# LLM Warehouse (TypeScript/Node.js)

🏠 **Auto-capture OpenAI and Vercel AI SDK calls for warehousing**

A lightweight TypeScript/Node.js library that automatically logs your OpenAI calls and provides manual patching for Vercel AI SDK calls to your LLM warehouse backend.

## 🚀 Quick Start

### Installation

```bash
npm install llm-warehouse
# or
yarn add llm-warehouse
```

### Basic Usage

For automatic patching on import, set environment variables:

```bash
export LLM_WAREHOUSE_API_KEY="your-warehouse-api-key"
export LLM_WAREHOUSE_URL="https://your-warehouse.com"
```

### OpenAI (Automatic Patching)

Just import the library BEFORE importing OpenAI - logging happens automatically:

```typescript
import 'llm-warehouse';  // BEFORE openai

import OpenAI from 'openai';  // Automatically patched!

// Now use OpenAI normally - all calls are automatically logged!
const client = new OpenAI();
const response = await client.chat.completions.create({
  model: "gpt-4",
  messages: [{"role": "user", "content": "Hello!"}]
});
```

### Vercel AI SDK (Manual Patching)

For Vercel AI SDK, you need to manually patch the functions due to ES6 module limitations:

```typescript
import 'llm-warehouse';
import { installPatch, patchVercelAIFunctions } from 'llm-warehouse';
import { openai } from '@ai-sdk/openai';
import { generateText as originalGenerateText } from 'ai';

// Install patches
installPatch();

// Manually patch Vercel AI functions
const { generateText } = patchVercelAIFunctions({
  generateText: originalGenerateText
});

// Use the patched function - automatically logged!
const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Explain quantum computing',
});
```

## 📊 What Gets Logged

- **Request data**: Model, messages, parameters
- **Response data**: Completions, token usage, timing
- **Metadata**: Timestamps, SDK method, streaming info
- **Errors**: API errors and exceptions

## 🔧 Configuration Options

### 🛡️ Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_WAREHOUSE_API_KEY` | Your warehouse API token (enables auto-patching) |
| `LLM_WAREHOUSE_URL` | Your warehouse URL |
| `LLM_WAREHOUSE_DEBUG` | Set to "1" to enable debug logging |

### 🔄 Programmatic Control (for advanced users)

```typescript
import * as llmWarehouse from 'llm-warehouse';

// Enable logging manually
llmWarehouse.patch({ enabled: true, debug: true });

// Check status
if (llmWarehouse.isPatched()) {
  console.log("LLM calls are being logged");
}

// Get current configuration
console.log(llmWarehouse.status());
```

### 📋 Query Logged Data

```typescript
import { getRecentLogs, showRecentLogs } from 'llm-warehouse';

// Get recent logs programmatically
const logs = await getRecentLogs(10);
console.log('Recent logs:', logs);

// Display recent logs with nice formatting
await showRecentLogs(5);
```

## 📦 Features

- ✅ **Zero-configuration**: Works out of the box with environment variables
- ✅ **OpenAI integration**: Automatic patching of OpenAI Node.js SDK
- ✅ **Vercel AI SDK**: Manual patching support (due to ES6 module limitations)
- ✅ **Async support**: Full async/await compatibility
- ✅ **Streaming support**: Captures streaming responses
- ✅ **Error handling**: Logs API errors and exceptions
- ✅ **Minimal overhead**: Designed for production use
- ✅ **TypeScript**: Full TypeScript support with type definitions

## 🏗️ Warehouse Backend

This library works with your LLM Warehouse Flask backend:

```typescript
// Logs are automatically sent to your warehouse at:
// POST https://your-warehouse.com/llm-logs
```

## 🧪 Development

```bash
git clone https://github.com/Agenti-Code/llm-warehousing-npm.git
cd llm-warehousing/llm-warehouse-npm
npm install
npm run build
```

Build the package:
```bash
npm run build
```

Watch for changes during development:
```bash
npm run dev
```

## 🎯 Example Usage

### Basic Example

```typescript
// Set environment variables
process.env.LLM_WAREHOUSE_API_KEY = "your-api-key";
process.env.LLM_WAREHOUSE_URL = "https://your-warehouse.com";

// Import warehouse BEFORE OpenAI
import 'llm-warehouse';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  // This call is automatically logged to your warehouse
  const response = await client.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "user", content: "What is the capital of France?" }
    ],
  });

  console.log(response.choices[0].message.content);
}

main();
```

### Manual Control Example

```typescript
import * as llmWarehouse from 'llm-warehouse';
import OpenAI from 'openai';

// Enable logging with debug
llmWarehouse.patch({ enabled: true, debug: true });

const client = new OpenAI();

async function main() {
  // Make some API calls
  await client.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }],
  });

  // Check recent logs
  await llmWarehouse.showRecentLogs(3);
  
  // Get status
  console.log('Status:', llmWarehouse.status());
}

main();
```

### Vercel AI SDK Example

```typescript
import { installPatch, patchVercelAIFunctions } from 'llm-warehouse';
import { generateText as originalGenerateText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  // Install patches
  installPatch();
  
  // Manually patch Vercel AI functions
  const { generateText } = patchVercelAIFunctions({
    generateText: originalGenerateText
  });

  // This call will now be logged to your warehouse
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: 'Explain quantum computing in simple terms',
  });

  console.log(text);
}

main();
```

### Streaming Example

```typescript
import 'llm-warehouse';
import OpenAI from 'openai';

const client = new OpenAI();

async function streamExample() {
  // Streaming calls are also logged (metadata only)
  const stream = await client.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Tell me a story" }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

streamExample();
```

## ⚠️ Important Notes

### Vercel AI SDK Limitations

Due to ES6 module export limitations, **Vercel AI SDK functions cannot be automatically patched**. You must use the manual patching approach:

1. **Import with alias**: `import { generateText as originalGenerateText } from 'ai'`
2. **Call installPatch()**: Sets up OpenAI auto-patching and environment
3. **Manually patch**: `const { generateText } = patchVercelAIFunctions({ generateText: originalGenerateText })`
4. **Use patched function**: Use the returned `generateText` for automatic logging

**Why this limitation exists**: ES6 modules have read-only exports that cannot be modified at runtime, unlike CommonJS modules. This is a JavaScript/Node.js limitation, not specific to this library.

**Supported functions for manual patching**:
- `generateText`
- `generateObject` 
- `streamText`
- `streamObject`

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.
