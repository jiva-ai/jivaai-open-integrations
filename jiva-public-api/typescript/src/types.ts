export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DataRow = Record<string, unknown>;
export type MessageMap = Record<string, string[]>;

export interface Base64ZipFile {
  base64FileBytes: string;
  name?: string;
  featureColumns?: number[];
  labelColumns?: number[];
  rowsToIgnore?: number;
  fileNameColumn?: number;
}

export interface InvokeWorkflowRequest {
  data?: Record<string, DataRow[]>;
  files?: Record<string, Base64ZipFile>;
  base64FileBytes?: Record<string, string>;
  base64MultiFileBytes?: Record<string, string[]>;
  strings?: Record<string, string>;
  json?: Record<string, unknown>;
  vectorDatabaseIndexIds?: Record<string, string>;
}

export interface InvokeWorkflowResponse {
  workflowExecutionId?: string;
  inProgressMessages?: MessageMap;
  errorMessages?: MessageMap;
  data?: Record<string, DataRow[]>;
  strings?: Record<string, string>;
  base64Files?: Record<string, string>;
  base64MultiFiles?: Record<string, string[]>;
  json?: Record<string, unknown>;
  vectorDatabaseIndexIds?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface InvokeWorkflowResponseAsync {
  workflowId?: string;
  workflowExecutionId?: string;
  errorMessages?: MessageMap;
}

export interface JivaPublicApiClientConfig {
  apiKey: string;
  workflowId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface WorkflowTarget {
  workflowId?: string;
  workflowPhase?: number;
}

export interface RequestOptions extends WorkflowTarget {
  signal?: AbortSignal;
}

export interface WaitForWorkflowResultOptions extends RequestOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export type FileInput = Blob | ArrayBuffer | ArrayBufferView;
