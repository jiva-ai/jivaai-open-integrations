/**
 * Type definitions for Jiva.ai Agent Chat API
 */

export interface ApiConfig {
  /** API key for authentication (used for chat API and as default for upload caches) */
  apiKey: string;
  /** Workflow ID for the agent chat backend */
  workflowId: string;
  /** Version number for the workflow API endpoint (defaults to "0") */
  workflowVersion?: string;
  /** Workflow ID for the File Upload Cache */
  fileUploadCacheWorkflowId: string;
  /** Version number for File Upload Cache (defaults to workflowVersion or "0") */
  fileUploadCacheVersion?: string;
  /** API key for File Upload Cache (defaults to apiKey if not provided) */
  fileUploadCacheApiKey?: string;
  /** Workflow ID for the Text Upload Cache */
  textUploadCacheWorkflowId: string;
  /** Version number for Text Upload Cache (defaults to workflowVersion or "0") */
  textUploadCacheVersion?: string;
  /** API key for Text Upload Cache (defaults to apiKey if not provided) */
  textUploadCacheApiKey?: string;
  /** Workflow ID for the Table Upload Cache */
  tableUploadCacheWorkflowId: string;
  /** Version number for Table Upload Cache (defaults to workflowVersion or "0") */
  tableUploadCacheVersion?: string;
  /** API key for Table Upload Cache (defaults to apiKey if not provided) */
  tableUploadCacheApiKey?: string;
  /** Base URL for the API (defaults to production URL) */
  baseUrl?: string;
  /** Base URL for socket connections (defaults to baseUrl without /workflow, or production socket URL) */
  socketBaseUrl?: string;
  /** Logging configuration */
  logging?: LoggingConfig;
}

/**
 * Log levels in order of severity (lowest to highest)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Minimum log level to output (defaults to 'warn' in production, 'debug' in development) */
  level?: LogLevel;
  /** Custom logger function (defaults to console methods) */
  logger?: Logger;
  /** Enable/disable logging entirely (defaults to true) */
  enabled?: boolean;
}

/**
 * Logger interface for custom logging implementations
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

export type SuccessCallback<T = unknown> = (data: T, status: number) => void;
export type ErrorCallback = (error: string, status?: number) => void;

/**
 * Conversation mode types
 */
export type ConversationMode = 'CHAT_REQUEST' | 'CHAT_RESPONSE' | 'SCREEN_RESPONSE' | 'POLL_REQUEST';

/**
 * Options for a conversation message (e.g. request Ojas cost calculation)
 */
export interface ConversationMessageOptions {
  /** When true, the execution may include approximate Ojas cost (default: false) */
  calculateOjas?: boolean;
}

/**
 * Single conversation message item
 */
export interface ConversationMessage {
  /** Unique session ID for the conversational thread */
  sessionId: string;
  /** Natural language message to send to the agent */
  message: string;
  /** Mode of the conversation (CHAT_REQUEST or CHAT_RESPONSE for context) */
  mode: 'CHAT_REQUEST' | 'CHAT_RESPONSE';
  /** Optional: nodeId for satisfying screen responses */
  nodeId?: string;
  /** Optional: field for satisfying screen responses */
  field?: string;
  /** Optional: assetId from uploaded asset for satisfying screen responses */
  assetId?: string;
  /** Optional message options (e.g. calculateOjas; defaults to false when omitted) */
  options?: ConversationMessageOptions;
}

/**
 * Request payload for initiating a conversation (single message)
 */
export interface InitiateConversationRequest {
  /** Unique session ID for the conversational thread */
  sessionId: string;
  /** Natural language message to send to the agent */
  message: string;
  /** Mode of the conversation */
  mode: ConversationMode;
  /** Optional: nodeId for satisfying screen responses */
  nodeId?: string;
  /** Optional: field for satisfying screen responses */
  field?: string;
  /** Optional: assetId from uploaded asset for satisfying screen responses */
  assetId?: string;
}

/**
 * Request payload for initiating a conversation with context (multiple messages)
 */
export type InitiateConversationWithContext = ConversationMessage[];

/**
 * Upload response from File Upload Cache, Text Upload Cache, or Table Upload Cache
 */
export interface UploadResponse {
  /** Internal ID for the workflow execution */
  workflowExecutionId: string;
  /** Error messages, if any */
  errorMessages: string | null;
  /** Reserved for future use */
  data: Record<string, unknown>;
  /** Contains the asset ID in the "default" field */
  strings: {
    default: string;
  };
  /** Reserved for future use */
  base64Files: Record<string, unknown>;
  /** Reserved for future use */
  vectorDatabaseIndexIds: Record<string, unknown>;
  /** Reserved for future use */
  metadata: Record<string, unknown>;
  /** Empty for upload responses */
  json: Record<string, unknown>;
}

/**
 * Socket message types
 */
export type SocketMessageType =
  | 'AGENT_STARTED'
  | 'AGENT_THINKING'
  | 'AGENT_COMPLETED'
  | 'AGENT_FAILED'
  | 'EXECUTION_CALL_STARTED'
  | 'EXECUTION_CALL_RESULT'
  | 'EXECUTION_CALL_FAILED'
  | 'CONTENT_DELTA'
  | 'CONTENT_COMPLETE'
  | 'REASONING'
  | 'PLAN_CREATED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'DATA_CHUNK'
  | 'FINAL_RESULT'
  | 'ARTIFACT_CREATED'
  | 'USER_INPUT_REQUIRED'
  | 'CONFIRMATION_REQUIRED'
  | 'PROGRESS_UPDATE'
  | 'TOKEN_USAGE'
  | 'COST_UPDATE'
  | 'SYSTEM_INFO'
  | 'WARNING'
  | 'ERROR'
  | 'DEBUG'
  | 'SESSION_STARTED'
  | 'SESSION_RESUMED'
  | 'SESSION_ENDED'
  | 'AGENT_HANDOFF'
  | 'AGENT_COLLABORATION'
  | 'CODE_BLOCK'
  | 'MARKDOWN'
  | 'IMAGE_URL'
  | 'FILE_REFERENCE'
  | 'RATE_LIMIT_WARNING'
  | 'THROTTLED'
  | 'STREAM_START'
  | 'STREAM_END'
  | 'KEEPALIVE';

/**
 * Socket message payload
 */
export interface SocketMessage {
  /** Workflow ID */
  workflowId: string;
  /** Session ID */
  sessionId: string;
  /** Text message to show to the user */
  message: string;
  /** Array of message types */
  types: SocketMessageType[];
}

/**
 * Options for WebSocket connection
 */
export interface SocketOptions {
  /** Whether to automatically reconnect on disconnect */
  autoReconnect?: boolean;
  /** Delay between reconnection attempts in milliseconds */
  reconnectInterval?: number;
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number;
}

/**
 * Socket close event information
 */
export interface SocketCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

/**
 * Socket event callbacks
 */
export interface SocketCallbacks {
  /** Called when socket connects */
  onOpen?: () => void;
  /** Called when a message is received */
  onMessage?: (message: SocketMessage) => void;
  /** Called when socket closes */
  onClose?: (event: SocketCloseEvent) => void;
  /** Called when an error occurs */
  onError?: (error: unknown) => void;
  /** Called when reconnection attempt starts */
  onReconnect?: (attempt: number) => void;
}

/**
 * Execution type in the response
 */
export type ExecutionType = 'text' | 'json' | 'void' | 'table';

/**
 * Execution state in polling response
 */
export type ExecutionState = 'PENDING' | 'SKIP' | 'OK' | 'PARTIAL_OK' | 'RUNNING' | 'ERROR';

/**
 * Execution result from the agentic pipeline (conversation response format)
 */
export interface Execution {
  /** Brief description of this specific execution */
  response: string;
  /** Data type of the output from the execution */
  type: ExecutionType;
  /** Execution data (structure depends on type) */
  data?: unknown;
  /** Approximate Ojas cost (present when request options had calculateOjas: true) */
  approximateOjasCost?: string;
}

/**
 * Execution result from polling (different structure)
 */
export interface PollExecution {
  /** Start time of the execution (integer timestamp) */
  startTime: number;
  /** Current state of the execution */
  state: ExecutionState;
  /** Output of the execution */
  output: {
    /** Brief description of this specific execution */
    response: string;
    /** Data type of the output from the execution */
    type: ExecutionType;
    /** Execution data (structure depends on type) */
    data?: unknown;
  };
}

/**
 * Screen asset type
 */
export type ScreenAssetType = 'FILE_POINTER_URL' | 'FILE_UPLOAD';

/**
 * Screen information from SCREEN_RESPONSE
 */
export interface Screen {
  /** Node ID that needs to be provided in the follow-up request */
  nodeId: string;
  /** Field identifier */
  field: string;
  /** Asset information */
  asset: {
    /** Type of asset required */
    type: ScreenAssetType;
    /** Message explaining what this asset is and why it's needed */
    message: string;
  };
}

/**
 * Response state
 */
export type ResponseState = 'OK' | 'RUNNING' | 'ERROR' | 'PARTIAL_OK';

/**
 * Conversation response data structure
 */
export interface ConversationResponseData {
  /** Brief description of all executions */
  message: string;
  /** State of the request */
  state: ResponseState;
  /** Mode of the response */
  mode: 'CHAT_RESPONSE' | 'SCREEN_RESPONSE';
  /** ID for polling (only populated if state is RUNNING) */
  id?: string;
  /** Array of agentic pipeline executions */
  executions?: Execution[];
  /** Screen information (required assets) */
  screens?: Screen[];
}

/**
 * Polling response data structure
 */
export interface PollResponseData {
  /** State of the request */
  state: ResponseState;
  /** Mode of the response (always POLL_RESPONSE) */
  mode: 'POLL_RESPONSE';
  /** Array of log messages showing progress */
  logs?: string[];
  /** Array of agentic pipeline executions with detailed state */
  executions?: PollExecution[];
}

/**
 * Full conversation response from the API
 */
export interface ConversationResponse {
  /** Internal ID for the workflow execution */
  workflowExecutionId: string;
  /** Error messages, if any */
  errorMessages: string | null;
  /** Reserved for future use */
  data: Record<string, unknown>;
  /** Reserved for future use */
  strings: Record<string, unknown>;
  /** Reserved for future use */
  base64Files: Record<string, unknown>;
  /** Reserved for future use */
  vectorDatabaseIndexIds: Record<string, unknown>;
  /** Reserved for future use */
  metadata: Record<string, unknown>;
  /** JSON response data */
  json: {
    default: ConversationResponseData;
  };
}

/**
 * Options for polling when state is RUNNING
 */
export interface PollingOptions {
  /** Maximum number of polling attempts */
  maxAttempts?: number;
  /** Delay between polling attempts in milliseconds (recommended: 1000ms) */
  pollInterval?: number;
}

/**
 * Request payload for polling a conversation
 */
export interface PollRequest {
  /** Unique session ID for the conversational thread */
  sessionId: string;
  /** ID from the previous RUNNING response */
  id: string;
  /** Mode must be POLL_REQUEST */
  mode: 'POLL_REQUEST';
}

/**
 * Full polling response from the API
 */
export interface PollResponse {
  /** Internal ID for the workflow execution */
  workflowExecutionId: string;
  /** Error messages, if any */
  errorMessages: string | null;
  /** Reserved for future use */
  data: Record<string, unknown>;
  /** Reserved for future use */
  strings: Record<string, unknown>;
  /** Reserved for future use */
  base64Files: Record<string, unknown>;
  /** Reserved for future use */
  vectorDatabaseIndexIds: Record<string, unknown>;
  /** Reserved for future use */
  metadata: Record<string, unknown>;
  /** JSON response data */
  json: {
    default: PollResponseData;
  };
}

