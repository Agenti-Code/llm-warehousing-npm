import { expectType } from 'tsd';
import type { LLMCallData } from '../../src/types';
import { patch, isPatched, status } from '../../src/observify';
import { getRecentLogs, showRecentLogs } from '../../src/query';
import { installPatch, patchVercelAIFunctions } from '../../src/patch';

expectType<boolean>(isPatched());
expectType<void>(patch({ enabled: true, debug: true }));
expectType<{ enabled: boolean; patched: boolean; debug: boolean; warehouseUrl?: string; apiKey?: string }>(status());

expectType<Promise<LLMCallData[]>>(getRecentLogs(5));
expectType<Promise<void>>(showRecentLogs(2));

installPatch();
const patched = patchVercelAIFunctions({ generateText: async (_: any) => ({ text: 'ok' as const }) });
await patched.generateText?.({ model: 'gpt-4o', prompt: 'hi' } as any);


