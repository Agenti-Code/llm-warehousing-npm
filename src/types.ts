export interface LLMCallData {
  sdk_method: string;
  request: {
    args: any[];
    kwargs: Record<string, any>;
  };
  response?: any;
  latency_s?: number;
  error?: string;
  request_id?: string;
  timestamp?: string;
  source?: string;
  env?: Record<string, string | undefined>;
}

export interface LogResponse {
  message: string;
  task_id: string;
  status: string;
  status_url: string;
}

export interface WarehouseConfig {
  warehouseUrl?: string;
  apiKey?: string;
  debug?: boolean;
  enabled?: boolean;
}
